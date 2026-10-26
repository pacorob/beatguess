(async function(){
try{
 const response=await fetch('https://raw.githubusercontent.com/pacorob/beatguess/bb09d6a56e0a3350e564deae4b5aaf4988679a95/app.js');
 if(!response.ok)throw new Error('Unable to load verified game');
 let code=await response.text();
 const entries=[
 ['1124841682',{title:'Levitating',artist:'Dua Lipa',originalArtist:true,languages:['en'],originalReleaseYear:2020,genres:['Pop'],evidence:['https://www.deezer.com/en/track/1124841682','https://genius.com/Dua-lipa-levitating-lyrics']}],
 ['1703487577',{title:'As It Was',artist:'Harry Styles',originalArtist:true,languages:['en'],originalReleaseYear:2022,genres:['Pop'],evidence:['https://www.deezer.com/us/track/1703487577','https://genius.com/Harry-styles-as-it-was-lyrics']}],
 ['1409072752',{title:'Bad Habits',artist:'Ed Sheeran',originalArtist:true,languages:['en'],originalReleaseYear:2021,genres:['Pop'],evidence:['https://www.deezer.com/en/track/1409072752','https://www.musixmatch.com/lyrics/Ed-Sheeran/bad-habits','https://www.billboard.com/music/lyrics/ed-sheeran-bad-habits-lyrics-1235027750/']}],
 ['2105158337',{title:'Flowers',artist:'Miley Cyrus',originalArtist:true,languages:['en'],originalReleaseYear:2023,genres:['Pop'],evidence:['https://www.deezer.com/en/track/2105158337','https://songteksten.net/lyric/6627/108374/miley-cyrus/flowers.html','https://robinfrederick.com/hit-song-guide-flowers-by-miley-cyrus/']}]
 ];
 const marker='const verifiedRecordings = new Map();';
 if(!code.includes(marker))throw new Error('Unexpected application version');
 code=code.replace(marker,'const verifiedRecordings = new Map('+JSON.stringify(entries)+');');
 code=code.replace("document.write('<p>Loading BeatGuess…</p>');",'');
 code=code.replace('Strict verification v9: only checked English, Dutch and German original-artist recordings are eligible. The verification list is currently empty. Saved songs and scores have not been deleted.','Verified starter catalogue v10: four English-language 2020s Pop originals. Select 2020s Pop to import them. Other packs are not yet populated. Saved songs and scores are preserved.');
 const override=String.raw`
function strictIdentity(r){
 const id=r.id!=null?String(r.id):(/^deezer_(\d+)$/.exec(r.sourceId||'')||[])[1];
 const v=verifiedRecordings.get(id);
 return Boolean(v&&normalizeMetadata(r.title)===normalizeMetadata(v.title)&&normalizeMetadata(checkedArtist(r))===normalizeMetadata(v.artist));
}
const metadataCheck=strictCheck;
strictCheck=function(r){return strictIdentity(r)&&metadataCheck(r)};
let catalogueRequest=0;
async function searchMusic(){
 const request=++catalogueRequest;
 const query=$('q').value.trim();
 searchTags=detectTags(query);
 const ids=[...verifiedRecordings].filter(([id,v])=>{
  if(searchTags.decade&&searchTags.decade!=='2020s')return false;
  if(searchTags.genre&&!v.genres.includes(searchTags.genre))return false;
  if(selDecades.size&&!selDecades.has('2020s'))return false;
  if(selGenres.size&&!v.genres.some(g=>selGenres.has(g)))return false;
  if(!searchTags.decade&&!searchTags.genre&&query&&!normalizeMetadata(v.title+' '+v.artist).includes(normalizeMetadata(query)))return false;
  return true;
 }).map(([id])=>id);
 $('results').textContent='Loading checked Deezer recordings…';
 if(!ids.length){results=[];$('results').textContent='No verified entries for this selection yet. The starter catalogue currently covers 2020s Pop only.';return}
 const existing=new Set(custom.map(s=>s.sourceId));
 let failures=0;
 const tracks=await Promise.all(ids.map(async id=>{try{
  const r=await jsonp('https://api.deezer.com/track/'+id);
  if(String(r.id)!==id||!strictCheck(r))return null;
  return r;
 }catch(e){failures++;return null}}));
 if(request!==catalogueRequest)return;
 results=shuf(tracks.filter(r=>r&&!existing.has('deezer_'+r.id)));
 $('results').innerHTML='';
 const status=document.createElement('p');
 status.textContent=results.length+' new checked recordings available. '+(failures?'Some Deezer requests failed. ':'')+'This starter pack contains only four songs; repeat imports cannot add unlimited new tracks.';
 $('results').appendChild(status);
 if(!results.length)return;
 const batch=[...results];
 const button=document.createElement('button');button.className='btn teal';button.textContent='Import checked recordings';
 button.onclick=()=>{const n=importList(batch);button.disabled=true;status.textContent='Imported '+n+' checked recordings. Pack: '+custom.length+' songs.'};
 $('results').appendChild(button);
 for(const r of batch){const row=document.createElement('div');row.className='songrow';
 const text=document.createElement('div');text.textContent=r.title+' — '+checkedArtist(r)+' · English · 2020s · Pop';
 const add=document.createElement('button');add.className='add';add.textContent='+';add.onclick=()=>{importList([r]);add.disabled=true;add.textContent='✓'};
 row.append(text,add);$('results').appendChild(row)}
}
`;
 const insertion='function isBad(r){return !strictCheck(r)}';
 if(!code.includes(insertion))throw new Error('Missing validation hook');
 code=code.replace(insertion,override+'\n'+insertion);
 const script=document.createElement('script');script.textContent=code;document.body.appendChild(script);
}catch(e){const notice=document.createElement('p');notice.textContent='BeatGuess could not load: '+e.message;document.body.appendChild(notice)}
})();
