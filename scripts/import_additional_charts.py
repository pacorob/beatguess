import gzip, json, os, re, time, unicodedata, urllib.request, urllib.robotparser
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup

TODAY = date.today()
LIMIT = int(os.environ.get('CHART_BATCH', '40'))
AGENT = 'BeatGuessChartImporter'
CACHE = Path('data/chart-source-cache.json.gz')
state = json.loads(gzip.decompress(CACHE.read_bytes())) if CACHE.exists() else {}
policies = {}
SOURCES = {
 'nl-top40': ('Nederlandse Top 40', 'NL', 'https://www.top40.nl/top40', 'nl'),
 'uk-singles': ('Official UK Singles Chart', 'UK', 'https://www.officialcharts.com/charts/singles-chart/', 'uk'),
 'uk-dance': ('Official Dance Singles Chart', 'UK', 'https://www.officialcharts.com/charts/dance-singles-chart/', 'uk'),
 'music-archive': ('Music Charts Archive', 'US', 'https://musicchartsarchive.com/', 'music')
}

def norm(v):
    text = unicodedata.normalize('NFKD', str(v))
    return re.sub(r'[^a-z0-9]+', ' ', ''.join(c for c in text if not unicodedata.combining(c)).lower()).strip()

def download(url):
    time.sleep(2)
    req = urllib.request.Request(url, headers={'User-Agent': AGENT, 'Accept': 'text/html'})
    with urllib.request.urlopen(req, timeout=30) as response:
        return response.read().decode('utf-8', errors='replace')

def allowed_get(url):
    p = urlparse(url)
    root = p.scheme + '://' + p.netloc
    if root not in policies:
        robots = urllib.robotparser.RobotFileParser()
        try:
            robots.parse(download(root + '/robots.txt').splitlines())
        except Exception as exc:
            raise RuntimeError('Cannot check robots policy: ' + str(exc))
        policies[root] = robots
    if not policies[root].can_fetch(AGENT, url):
        raise RuntimeError('Blocked by source robots policy')
    return download(url)

def heading_area(soup):
    h = soup.find('h1')
    if h is None:
        raise ValueError('No chart heading')
    text = soup.get_text(' ', strip=True)
    position = text.find(h.get_text(' ', strip=True))
    return text[position:position + 800]

def chart_date(soup, kind):
    text = heading_area(soup)
    if kind == 'nl':
        months = 'januari februari maart april mei juni juli augustus september oktober november december'.split()
        m = re.search(r'\((\d{1,2})\s+([a-z]+)\s+(\d{4})\)', text.lower())
        if m and m[2] in months:
            return date(int(m[3]), months.index(m[2]) + 1, int(m[1])).isoformat()
    else:
        months = 'January February March April May June July August September October November December'.split()
        for pattern, order in [(r'(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})', 'dmy'), (r'([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})', 'mdy')]:
            for m in re.finditer(pattern, text):
                month = m[2] if order == 'dmy' else m[1]
                month_number = next((i + 1 for i, name in enumerate(months) if name.lower().startswith(month.lower())), None)
                if month_number:
                    return date(int(m[3]), month_number, int(m[1] if order == 'dmy' else m[2])).isoformat()
    raise ValueError('Cannot establish actual chart date from page')

def parse_chart(html, kind):
    soup = BeautifulSoup(html, 'html.parser')
    actual = chart_date(soup, kind)
    rows = []
    if kind == 'nl':
        for title in soup.find_all('h2'):
            following = title.find_next(['h2', 'h3'])
            if following and following.name == 'h3':
                rows.append({'title': title.get_text(' ', strip=True), 'artist': following.get_text(' ', strip=True), 'position': len(rows) + 1})
        if len(rows) != 40:
            raise ValueError('Dutch chart did not contain exactly 40 ordered title/artist pairs')
    elif kind == 'uk':
        for item in soup.select('div.chart-item'):
            rank = item.select_one('div.position strong')
            titles = item.select('a.chart-name span, span.chart-name span')
            artist = item.select_one('a.chart-artist span, span.chart-artist span')
            if rank and titles and artist and rank.get_text(strip=True).isdigit():
                rows.append({'title': titles[-1].get_text(' ', strip=True), 'artist': artist.get_text(' ', strip=True), 'position': int(rank.get_text(strip=True))})
    else:
        for tr in soup.select('table tr'):
            cells = tr.find_all('td', recursive=False)
            title = tr.select_one('a[href*="/singles/"]')
            artist = tr.select_one('a[href*="/artists/"]')
            if cells and title and artist:
                rank = re.fullmatch(r'#?(\d{1,3})', cells[0].get_text(strip=True))
                if rank:
                    rows.append({'title': title.get_text(' ', strip=True), 'artist': artist.get_text(' ', strip=True), 'position': int(rank[1])})
    ranks = [r['position'] for r in rows]
    if len(rows) < 10 or len(ranks) != len(set(ranks)) or min(ranks) != 1 or max(ranks) > 100 or any(not r['title'] or not r['artist'] for r in rows):
        raise ValueError('Chart rows missing or failed validation; no data imported')
    return {'date': actual, 'rows': rows}

def prioritize(items):
    if not items:
        return []
    chosen = [items[0], items[-1]]
    seen_decades = set()
    for value in items:
        decade = value[0][:3]
        if decade not in seen_decades:
            chosen.append(value)
            seen_decades.add(decade)
    result, seen = [], set()
    for value in chosen + items:
        if value[1] not in seen:
            result.append(value)
            seen.add(value[1])
    return result

def queue_for(source, cache):
    if source == 'nl-top40':
        items = []
        for year in range(1965, TODAY.year + 1):
            for week in range(1, date(year, 12, 28).isocalendar().week + 1):
                d = date.fromisocalendar(year, week, 1)
                if d <= TODAY:
                    items.append((d.isoformat(), f'https://www.top40.nl/top40/{year}/week-{week}'))
        return prioritize(items), True
    if source.startswith('uk-'):
        start = date(1994, 7, 3) if source == 'uk-dance' else date(1960, 1, 1)
        suffix = '104' if source == 'uk-dance' else '7501'
        base = SOURCES[source][2]
        items = []
        while start <= TODAY:
            items.append((start.isoformat(), base + start.strftime('%Y%m%d') + '/' + suffix + '/'))
            start += timedelta(days=7)
        return prioritize(items), True
    years = cache.setdefault('years', {})
    links = cache.setdefault('links', {})
    wanted = [TODAY.year, 1976] + list(range(1980, TODAY.year + 1, 10)) + list(range(1976, TODAY.year + 1))
    fetched = set()
    for year in wanted:
        if year in fetched or (str(year) in years and year != TODAY.year):
            continue
        if len(fetched) >= 4:
            break
        soup = BeautifulSoup(allowed_get(f'https://musicchartsarchive.com/singles-charts/{year}'), 'html.parser')
        count = 0
        for a in soup.find_all('a', href=True):
            url = urljoin('https://musicchartsarchive.com/', a['href'])
            if urlparse(url).hostname not in ('musicchartsarchive.com', 'www.musicchartsarchive.com') or '/singles-chart/' not in url:
                continue
            try:
                d = datetime.strptime(a.get_text(' ', strip=True), '%b %d, %Y').date()
            except ValueError:
                continue
            if date(1976, 9, 4) <= d <= TODAY:
                links[url] = d.isoformat()
                count += 1
        if not count:
            raise ValueError('No dated weekly Music Charts Archive links discovered')
        years[str(year)] = count
        fetched.add(year)
    return prioritize(sorted((d, url) for url, d in links.items())), len(years) >= TODAY.year - 1976 + 1

def collect(source):
    cache = state.setdefault(source, {'pages': {}})
    report = {'name': SOURCES[source][0], 'url': SOURCES[source][2], 'status': 'partial', 'errors': []}
    try:
        queue, discovery_complete = queue_for(source, cache)
        attempts, consecutive_errors = 0, 0
        for expected, url in queue:
            if url in cache['pages']:
                continue
            if attempts >= LIMIT:
                break
            attempts += 1
            try:
                page = parse_chart(allowed_get(url), SOURCES[source][3])
                if abs((date.fromisoformat(page['date']) - date.fromisoformat(expected)).days) > 8:
                    raise ValueError('Page returned a different chart period')
                page['url'] = url
                cache['pages'][url] = page
                consecutive_errors = 0
            except Exception as exc:
                report['errors'].append({'url': url, 'error': str(exc)})
                consecutive_errors += 1
                if consecutive_errors >= 3 or '403' in str(exc) or '429' in str(exc) or 'robots' in str(exc).lower():
                    break
        report['discoveredWeeks'] = len(queue)
        report['discoveryComplete'] = discovery_complete
        if discovery_complete and all(url in cache['pages'] for _, url in queue):
            report['status'] = 'imported'
    except Exception as exc:
        report['errors'].append({'error': str(exc)})
    actual_dates = {page['date'] for page in cache['pages'].values()}
    report['chartCount'] = len(actual_dates)
    report['coverageStart'] = min(actual_dates) if actual_dates else None
    report['coverageEnd'] = max(actual_dates) if actual_dates else None
    if report['errors']:
        report['status'] = 'partial-with-errors' if actual_dates else 'blocked-or-parser-error'
    return report

def main():
    path = Path('data/chart-songs.json')
    data = json.loads(path.read_text(encoding='utf-8'))
    songs = {song['key']: song for song in data['songs']}
    for song in songs.values():
        song['charts'] = {'billboard-hot-100': {'name': 'Billboard Hot 100', 'country': 'US', 'history': dict(song.pop('chartHistory')), 'sources': [song['evidence']]}}
    reports = []
    for source in SOURCES:
        report = collect(source)
        reports.append(report)
        for page in state[source]['pages'].values():
            chart_id = 'billboard-hot-100' if source == 'music-archive' else source
            for row in page['rows']:
                key = norm(row['artist']) + '|' + norm(row['title'])
                song = songs.setdefault(key, {'key': key, 'artist': row['artist'], 'title': row['title'], 'evidence': page['url'], 'charts': {}})
                chart = song['charts'].setdefault(chart_id, {'name': SOURCES[source][0], 'country': SOURCES[source][1], 'history': {}, 'sources': []})
                prior = chart['history'].get(page['date'])
                if prior is not None and prior != row['position']:
                    report.setdefault('positionConflicts', 0)
                    report['positionConflicts'] += 1
                chart['history'].setdefault(page['date'], row['position'])
                if page['url'] not in chart['sources']:
                    chart['sources'].append(page['url'])
    for song in songs.values():
        history = [(d, p) for chart in song['charts'].values() for d, p in chart['history'].items()]
        song.update(chartNames=sorted(song['charts']), sourceLabels=sorted({c['name'] for c in song['charts'].values()}), countries=sorted({c['country'] for c in song['charts'].values()}), chartDecades=sorted({str(int(d[:4]) // 10 * 10) for d, _ in history}), firstChartDate=min(d for d, _ in history), lastChartDate=max(d for d, _ in history), peak=min(p for _, p in history), weeks=len({d for d, _ in history}))
    data['songs'] = sorted(songs.values(), key=lambda s: s['key'])
    data['songCount'] = len(songs)
    data['sources'] = [{**data['sources'][0], 'chartCount': data['chartCount']}] + reports
    data['coverageStart'] = min(s['firstChartDate'] for s in songs.values())
    data['coverageEnd'] = max(s['lastChartDate'] for s in songs.values())
    data['note'] = 'Multi-source incremental import. Per-source coverage is partial until explicitly complete. Conflicting US archive positions retain the primary Billboard value. No Deezer IDs. Chart years are not release years.'
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    CACHE.write_bytes(gzip.compress(json.dumps(state, ensure_ascii=False, separators=(',', ':')).encode(), mtime=0))
    Path('data/chart-import-report.json').write_text(json.dumps(reports, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'songCount': len(songs), 'sources': reports}, ensure_ascii=False))

if __name__ == '__main__':
    main()
