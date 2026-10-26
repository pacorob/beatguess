import json, re, unicodedata, urllib.request
from pathlib import Path
from datetime import datetime, timezone

ROOT = 'https://raw.githubusercontent.com/mhollingshead/billboard-hot-100/main/'

def normalize(value):
    value = unicodedata.normalize('NFKD', str(value))
    return re.sub(r'[^a-z0-9]+', ' ', ''.join(c for c in value if not unicodedata.combining(c)).lower()).strip()

def build(charts):
    songs, dates = {}, set()
    for chart in charts:
        date = chart.get('date', '')
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', date) or not '1960-01-01' <= date <= datetime.now(timezone.utc).date().isoformat():
            continue
        for row in chart.get('data', []):
            title, artist, rank = row.get('song'), row.get('artist'), row.get('this_week')
            if not title or not artist or type(rank) is not int or not 1 <= rank <= 100:
                continue
            dates.add(date)
            key = normalize(artist) + '|' + normalize(title)
            entry = songs.setdefault(key, {'key': key, 'artist': artist, 'title': title, 'history': {}})
            entry['history'][date] = rank
    output = []
    for entry in songs.values():
        history = sorted(entry.pop('history').items())
        entry.update(country='US', chart='billboard-hot-100', chartDecades=sorted({str(int(d[:4]) // 10 * 10) for d, _ in history}), firstChartDate=history[0][0], lastChartDate=history[-1][0], peak=min(p for _, p in history), weeks=len(history), chartHistory=history, evidence=ROOT + 'date/' + history[0][0] + '.json')
        output.append(entry)
    if len(output) < 1000 or len(dates) < 1000:
        raise ValueError('Archive import unexpectedly small; refusing to overwrite catalogue')
    return {'schemaVersion': 2, 'generatedAt': datetime.now(timezone.utc).isoformat(), 'coverageStart': min(dates), 'coverageEnd': max(dates), 'chartCount': len(dates), 'songCount': len(output), 'sources': [{'name': 'Billboard Hot 100 via third-party archive', 'url': ROOT + 'all.json', 'status': 'imported'}, {'name': 'Nederlandse Top 40', 'url': 'https://www.top40.nl/top40', 'status': 'pending'}, {'name': 'Official UK Singles Chart', 'url': 'https://www.officialcharts.com/charts/singles-chart/', 'status': 'pending'}, {'name': 'Official Dance Singles Chart', 'url': 'https://www.officialcharts.com/charts/dance-singles-chart/', 'status': 'pending'}, {'name': 'Music Charts Archive', 'url': 'https://musicchartsarchive.com/', 'status': 'pending'}], 'note': 'Chart appearances are not original release dates. Genre, language and original-artist status are not established by chart membership. No Deezer IDs are stored here.', 'songs': sorted(output, key=lambda s: s['key'])}

if __name__ == '__main__':
    req = urllib.request.Request(ROOT + 'all.json', headers={'User-Agent': 'BeatGuess historical catalogue import'})
    with urllib.request.urlopen(req, timeout=120) as response:
        data = build(json.load(response))
    Path('data').mkdir(exist_ok=True)
    Path('data/chart-songs.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(json.dumps({k: data[k] for k in ['songCount', 'chartCount', 'coverageStart', 'coverageEnd']}))
