document.write('<p>Loading BeatGuess…</p>');
(async function(){
  const response=await fetch('https://raw.githubusercontent.com/pacorob/beatguess/34d89b81470e397d330805b2eb007cdde10b46b2/app.js');
  if(!response.ok)throw new Error('Could not load game code');
  let code=await response.text();
  if(!code.startsWith('const decades='))throw new Error('Invalid game code');
  const strict=String.raw`
const verifiedRecordings = new Map();
const allowedLanguages = new Set(['en','nl','de']);
function normalizeMetadata(value){return String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function checkedArtist(r){return typeof r.artist==='string'?r.artist:r.artist?.name||''}
function checkedAlbum(r){return typeof r.album==='string'?r.album:r.album?.title||r.albumTitle||''}
function strictCheck(r){
 const artist=normalizeMetadata(checkedArtist(r));
 const text=normalizeMetadata([r.title,r.title_version,checkedArtist(r),checkedAlbum(r)].filter(Boolean).join(' '));
 if(['the gem singers','2000s pop tour','hits etc','in store music moods'].includes(artist))return false;
 if(/\b(cover|covers|covered|karaoke|tribute|tributes|piano|pianoforte|pianist|rendition|renditions|lullaby|lullabies|nursery|toddler|toddlers|kids|kidz|children|childrens|sing along|singalong|mini disco|kindermuziek|kinderlied|kinderliedjes|kinderliedje|kinderkoor|kinderlieder|kinderchor|kinderdisco|cocomelon|super simple songs|kidz bop|instrumental|music box|orchestral|sped up|slowed|nightcore|lo fi|lofi|8d audio|ai generated|ai cover|ai song|made with ai|suno|udio)\b/.test(text))return false;
 const id=r.id!=null?String(r.id):(/^deezer_(\d+)$/.exec(r.sourceId||'')||[])[1];
 const v=verifiedRecordings.get(id);
 if(!v||!v.evidence||v.originalArtist!==true)return false;
 if(!Array.isArray(v.languages)||!v.languages.length||!v.languages.every(l=>allowedLanguages.has(l)))return false;
 const y=v.originalReleaseYear;
 const d=Number.isInteger(y)&&y>=1980&&y<=2029?(y<1990?'80s':y<2000?'90s':y<2010?'00s':y<2020?'10s':'2020s'):null;
 if(selDecades.size&&!selDecades.has(d))return false;
 if(searchTags.decade&&searchTags.decade!==d)return false;
 const gs=Array.isArray(v.genres)?v.genres:[];
 if(selGenres.size&&!gs.some(g=>selGenres.has(g)))return false;
 if(searchTags.genre&&!gs.includes(searchTags.genre))return false;
 return Boolean(r.preview||r.url);
}
function isBad(r){return !strictCheck(r)}
function langOk(r){return strictCheck(r)}
function pool(){return custom.filter(strictCheck)}
function deezerSong(r){const v=verifiedRecordings.get(String(r.id));const y=v.originalReleaseYear;return {id:String(r.id),sourceId:'deezer_'+r.id,title:r.title,title_version:r.title_version||'',artist:checkedArtist(r),albumTitle:checkedAlbum(r),url:r.preview,artwork:r.album?.cover_medium||'',decade:y<1990?'80s':y<2000?'90s':y<2010?'00s':y<2020?'10s':'2020s',genre:v.genres[0]||'',filterVersion:9}}
` ;
  code=code.replace("No playable English, Dutch or German previews found. Try another search.","No verified recordings available. Language, original artist, original release year and genre must be checked before a track can appear.");
  code=code.replace("Need at least 4 matching songs for the selected filters. Import more previews or remove a filter.","At least four verified matching recordings are required. Previously saved songs are preserved but cannot play until verified.");
  const notice=document.createElement('p');
  notice.textContent='Strict verification v9: only checked English, Dutch and German original-artist recordings are eligible. The verification list is currently empty. Saved songs and scores have not been deleted.';
  notice.style.cssText='padding:12px;background:#222546;color:#fff;border-radius:12px';
  document.querySelector('.app')?.prepend(notice);
  const loading=[...document.querySelectorAll('p')].find(p=>p.textContent==='Loading BeatGuess…');if(loading)loading.remove();
  const script=document.createElement('script');script.textContent=code+'\n'+strict;document.body.appendChild(script);
})().catch(error=>{const p=document.createElement('p');p.textContent='BeatGuess could not load: '+error.message;document.body.appendChild(p)});
