(async function(){
try{
 const response=await fetch('https://raw.githubusercontent.com/pacorob/beatguess/34d89b81470e397d330805b2eb007cdde10b46b2/app.js');
 if(!response.ok)throw new Error('Could not load game');
 let base=await response.text();
 if(!base.startsWith('const decades='))throw new Error('Unexpected game source');
 const extra=String.raw`
function norm(v){return String(v??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function artistOf(r){return typeof r.artist==='string'?r.artist:r.artist?.name||''}
function albumOf(r){return typeof r.album==='string'?r.album:r.album?.title||r.albumTitle||''}
function isBad(r){
 const a=norm(artistOf(r));
 const text=norm([r.title,r.title_version,artistOf(r),albumOf(r)].filter(Boolean).join(' '));
 if(['the gem singers','2000s pop tour','hits etc','in store music moods'].includes(a))return true;
 return /\b(cover|covers|covered|karaoke|tribute|tributes|piano|pianoforte|pianist|rendition|renditions|lullaby|lullabies|nursery|toddler|toddlers|kids|kidz|children|childrens|sing along|singalong|mini disco|kindermuziek|kinderlied|kinderliedjes|kinderliedje|kinderkoor|kinderlieder|kinderchor|kinderdisco|cocomelon|super simple songs|kidz bop|instrumental|music box|orchestral|sped up|slowed|nightcore|lo fi|lofi|8d audio|ai generated|ai cover|ai song|made with ai|suno|udio|remix|remixes|medley)\b/.test(text);
}
function langOk(r){
 const raw=[r.title,r.title_version,albumOf(r)].filter(Boolean).join(' ');
 const explicit=String(r.language||r.lang||'').toLowerCase();
 if(explicit&&!['en','eng','english','nl','nld','dut','dutch','de','deu','ger','german'].includes(explicit))return false;
 if(/[\u0400-\u04ff\u0600-\u06ff\u0900-\u097f\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af\u0370-\u03ff\u0590-\u05ff]/u.test(raw))return false;
 return !/\b(en vivo|espanol|espanola|portugues|portuguesa|corazon|jamas|olvidame|dejame|ninas|cancion|canciones|amor|voce|nao|saudade|coracao|espanha|brasil|brasileiro|brasileira)\b/.test(norm(raw));
}
function decade(d){const y=Number(String(d||'').slice(0,4));if(y<1980||y>2029||!Number.isInteger(y))return '';return y<1990?'80s':y<2000?'90s':y<2010?'00s':y<2020?'10s':'2020s'}
function genre(g){const n=norm(g);if(/hip hop|rap/.test(n))return 'Hip-hop';if(/k pop/.test(n))return 'K-pop';if(/dance|electronic|house/.test(n))return 'Dance';if(/rock|metal/.test(n))return 'Rock';if(/pop/.test(n))return 'Pop';return ''}
function pool(){return custom.filter(s=>!isBad(s)&&langOk(s)&&(!selDecades.size||selDecades.has(s.decade))&&(!selGenres.size||(s.genres||[s.genre]).some(g=>selGenres.has(g))))}
const searchOffsets=new Map(),albumCache=new Map();let liveRequest=0;
async function deezerJson(url){
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),5000);
 try{const r=await fetch(url,{signal:controller.signal});if(!r.ok)throw new Error('HTTP '+r.status);return await r.json()}
 catch(e){return await jsonp(url)}finally{clearTimeout(timeout)}
}
async function enrich(r){
 const id=r.album?.id;if(!id)return {...r,albumTitle:albumOf(r),decade:'',genres:[]};
 if(!albumCache.has(id))albumCache.set(id,deezerJson('https://api.deezer.com/album/'+id).catch(()=>null));
 const a=await albumCache.get(id);
 const gs=[...new Set((a?.genres?.data||[]).map(x=>genre(x.name)).filter(Boolean))];
 return {...r,albumTitle:a?.title||albumOf(r),album:{...r.album,title:a?.title||albumOf(r)},release_date:a?.release_date||'',decade:decade(a?.release_date),genres:gs};
}
function matches(r,tags){return !isBad(r)&&langOk(r)&&(!tags.decade||r.decade===tags.decade)&&(!tags.genre||r.genres.includes(tags.genre))&&(!selDecades.size||selDecades.has(r.decade))&&(!selGenres.size||r.genres.some(g=>selGenres.has(g)))}
function deezerSong(r){return {id:String(r.id),sourceId:'deezer_'+r.id,title:r.title,title_version:r.title_version||'',artist:artistOf(r),albumTitle:albumOf(r),url:r.preview,artwork:r.album?.cover_medium||'',decade:r.decade||'',genre:r.genres?.[0]||'',genres:r.genres||[],releaseDate:r.release_date||'',metadataBasis:'Deezer album release date and genres; original release and language not verified',start:null}}
function importList(list){const have=new Set(custom.map(s=>s.sourceId));let n=0;for(const r of list){if(n>=25)break;if(!r.preview||isBad(r)||!langOk(r)||have.has('deezer_'+r.id))continue;custom.push(deezerSong(r));have.add('deezer_'+r.id);n++}updatePack();savePack();renderSongs();return n}
async function searchMusic(){
 const q=$('q').value.trim();if(!q)return;const request=++liveRequest;const tags=detectTags(q);searchTags=tags;results=[];
 const container=$('results');container.textContent='Searching live Deezer results and checking album metadata…';
 const key=norm(q)+'|'+[...selDecades].sort().join(',')+'|'+[...selGenres].sort().join(',');
 let offset=searchOffsets.get(key)||0,exhausted=false,errors=0;
 const have=new Set(custom.map(s=>s.sourceId)),seen=new Set();const found=[];
 try{
  for(let page=0;page<3&&found.length<25;page++){
   const d=await deezerJson('https://api.deezer.com/search?q='+encodeURIComponent(q)+'&limit=50&index='+offset);
   if(request!==liveRequest)return;if(d.error||!Array.isArray(d.data))throw new Error('Deezer returned an error');
   const batch=d.data;offset+=batch.length;
   const eligible=batch.filter(r=>r.preview&&!isBad(r)&&langOk(r)&&!have.has('deezer_'+r.id)&&!seen.has(String(r.id)));
   eligible.forEach(r=>seen.add(String(r.id)));
   for(let i=0;i<eligible.length;i+=4){
    const enriched=await Promise.all(eligible.slice(i,i+4).map(enrich));
    if(request!==liveRequest)return;
    for(const r of enriched){if(matches(r,tags))found.push(r)}
   }
   if(!d.next||!batch.length){exhausted=true;break}
  }
  searchOffsets.set(key,exhausted?0:offset);
 }catch(e){errors++;if(request!==liveRequest)return}
 if(request!==liveRequest)return;
 results=shuf(found);container.innerHTML='';
 const status=document.createElement('p');status.className='note';status.textContent=results.length+' new matching results in this search batch. '+(errors?'A Deezer request failed; retry to continue. ':exhausted?'End of available search results reached. ':'Search again to check the next pages. ')+'Language/originality exclusions are best-effort. Decade uses album release date, which can be a reissue date; genre uses Deezer album metadata.';container.appendChild(status);
 if(!results.length)return;
 const batch=[...results];const button=document.createElement('button');button.className='btn teal';button.textContent='Import up to 25 new previews';button.onclick=()=>{const n=importList(batch);button.disabled=true;status.textContent='Imported '+n+' tracks. Pack: '+custom.length+'. Language and original release remain unverified.'};container.appendChild(button);
 batch.forEach(r=>{const row=document.createElement('div');row.className='songrow';const img=document.createElement('img');img.src=r.album?.cover_medium||'';img.alt='';const text=document.createElement('div');const title=document.createElement('b');title.textContent=r.title;const detail=document.createElement('span');detail.textContent=artistOf(r)+' • '+albumOf(r)+' • '+(r.decade||'Unknown date')+' • '+(r.genres.join(', ')||'Unknown genre');text.append(title,detail);const add=document.createElement('button');add.className='add';add.textContent='+';add.onclick=()=>{const n=importList([r]);add.textContent=n?'✓':'Already added';add.disabled=true};row.append(img,text,add);container.appendChild(row)});
}
const notice=document.createElement('p');notice.className='note';notice.id='dynamicSearchStatus';notice.textContent='Dynamic Deezer search v12 — no fixed track catalogue. Best-effort language and original-artist filtering; release date and genre come from album metadata. Saved songs and scores are preserved.';document.querySelector('.app')?.prepend(notice);
document.querySelectorAll('.note').forEach(p=>{if(p!==notice&&p.textContent.includes('Only English, Dutch and German'))p.textContent='Dynamic Deezer search with best-effort cover, kids’, piano and language exclusions. Album release dates may differ from original release dates. Repeated searches check subsequent pages and skip saved tracks.'});
const help=document.getElementById('help');if(help){for(const p of help.querySelectorAll('p')){if(/Original tracks:|Filters:/.test(p.textContent))p.textContent='Filters inspect track, artist and album metadata. Language and original-artist status are best-effort, not verified. Decades use Deezer album release dates; genre uses album genres. Unknown metadata is excluded when a corresponding filter is selected.'}}
` ;
 const script=document.createElement('script');script.textContent=base+'\n'+extra;document.body.appendChild(script);
}catch(e){const p=document.createElement('p');p.textContent='BeatGuess could not load: '+e.message;document.body.appendChild(p)}
})();
