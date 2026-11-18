const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');
const folder=path.join(__dirname,'../doc/cards');
const html=fs.readFileSync(path.join(folder,'index.html'),'utf8'),data=JSON.parse(fs.readFileSync(path.join(folder,'data.json'),'utf8'));
const {window}=parseHTML(html),document=window.document;
assert.deepEqual(JSON.parse(document.querySelector('#card-data').textContent),data);
// linkedom does not implement the browser's select.value setter.
for(const select of document.querySelectorAll('select'))Object.defineProperty(select,'value',{writable:true,value:''});
vm.runInNewContext([...document.querySelectorAll('script')].find(s=>!s.type).textContent,{document,window,Map,Set,JSON});
const cards=()=>[...document.querySelectorAll('.card')];
function sorted(){const scores=cards().map(c=>Number(c.dataset.score));assert.deepEqual(scores,[...scores].sort((a,b)=>b-a));}
assert.equal(data.records.length,133);assert.equal(data.jobs.length,39);assert.equal(data.lapConfig.max,6);
assert.equal(document.querySelectorAll('[data-category]').length,8);assert.equal(cards().length,133);sorted();
assert(data.records.every(c=>c.sources.length&&c.versions.length===6&&c.versions[0].lap===6&&c.versions[5].lap===1));
assert(cards().every(c=>c.querySelectorAll('tbody tr').length===6));
assert(![...document.querySelectorAll('tbody tr td:first-child')].some(td=>td.textContent==='改6'));assert(!document.querySelector('#version-note').textContent.includes('改6'));assert.equal(document.querySelectorAll('[data-unavailable]').length,0);
assert(document.querySelector('#version-note').textContent.includes('第六周目＝改5'));
const job=document.querySelector('#job'),version=document.querySelector('#sort-version'),search=document.querySelector('#search');
for(const [slot] of data.slots){document.querySelector('[data-category="'+slot+'"]').click();assert.equal(cards().length,data.records.filter(c=>c.slot===slot).length);assert(cards().every(c=>data.records.find(r=>r.id===Number(c.dataset.cardId)).slot===slot));sorted();}
document.querySelector('[data-category="all"]').click();
assert.equal(document.querySelectorAll('[data-monster-type]').length,3);
for(const type of ['mob','boss']){
 document.querySelector('[data-monster-type="'+type+'"]').click();
 const expected=data.records.filter(c=>type==='boss'?!!c.boss:!c.boss);
 assert.deepEqual(cards().map(c=>Number(c.dataset.cardId)).sort((a,b)=>a-b),expected.map(c=>c.id).sort((a,b)=>a-b));sorted();
 assert.equal(document.querySelector('[data-monster-type="'+type+'"]').getAttribute('aria-pressed'),'true');
 if(type==='boss')for(const kind of ['mini','mvp'])assert(expected.some(c=>c.boss===kind));
}
search.value='元宵節';search.oninput();document.querySelector('[data-category="weapon"]').click();
assert.deepEqual(cards().map(c=>Number(c.dataset.cardId)).sort((a,b)=>a-b),data.records.filter(c=>c.boss&&c.slot==='weapon'&&c.sources.some(s=>s.stage==='元宵節')).map(c=>c.id).sort((a,b)=>a-b));sorted();
assert.equal(document.querySelector('[data-category="weapon"] small').textContent,String(cards().length));
assert.equal(document.querySelector('[data-monster-type="boss"]').getAttribute('aria-pressed'),'true');
search.value='';search.oninput();document.querySelector('[data-monster-type="all"]').click();document.querySelector('[data-category="all"]').click();assert.equal(cards().length,133);
for(const id of ['swordsman','mage','archer','arch_bishop']){job.value=id;job.onchange();for(const lap of [1,4,6]){version.value=String(lap);version.onchange();sorted();for(const card of cards()){const record=data.records.find(r=>r.id===Number(card.dataset.cardId));assert.equal(Number(card.dataset.score),record.versions.find(v=>v.lap===lap).scores[id]);}}}
search.value='元宵節';search.oninput();assert(cards().length>5);assert(cards().every(c=>c.textContent.includes('元宵節')));
document.querySelector('[data-category="garment"]').click();assert(cards().every(c=>data.records.find(r=>r.id===Number(c.dataset.cardId)).slot==='garment'));assert(search.value==='元宵節');
search.value='不存在的卡片999999';search.oninput();assert(document.querySelector('.empty-result'));
const find=id=>data.records.find(c=>c.id===id),v=(id,lap)=>find(id).versions.find(v=>v.lap===lap);
for(const [id,score] of [[4195,35],[4172,50],[4287,37],[4225,33],[4239,18]])assert.equal(v(id,4).scores.swordsman,score);
assert.deepEqual(v(4287,4).bonuses,['-12.5% 承受傷害','+2.5% Flee']);assert(v(4195,4).bonuses.includes('-10% 承受傷害'));
assert(data.records.find(c=>c.monster==='墨蛇君').sources.some(s=>s.stage==='元宵節'&&s.rare),'native intruder sources must be included');
assert(find(4144).versions.every(row=>JSON.stringify(row.bonuses)===JSON.stringify(v(4144,1).bonuses)),'Osiris revival must not scale');
assert(data.records.some(c=>c.versions.some(row=>row.scores.swordsman!==row.scores.mage)),'job scores must retain native weighting');
assert(!html.includes('fetch(')&&!html.includes('import('));
console.log('PASS card snapshot, native known scores, no-scale revival, 39 job scores, seven slots, descending version/GS order, filtering and offline page');
