const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');
const folder=path.join(__dirname,'../doc/equipment');
const html=fs.readFileSync(path.join(folder,'index.html'),'utf8'),data=JSON.parse(fs.readFileSync(path.join(folder,'data.json'),'utf8'));
const {window}=parseHTML(html),document=window.document;
assert.deepEqual(JSON.parse(document.querySelector('#equipment-data').textContent),data);
for(const select of document.querySelectorAll('select'))Object.defineProperty(select,'value',{writable:true,value:''});
vm.runInNewContext([...document.querySelectorAll('script')].find(node=>!node.type).textContent,{document,window,Set,Map,JSON});
const job=document.querySelector('#job'),tier=document.querySelector('#tier'),search=document.querySelector('#search');
const cards=()=>[...document.querySelectorAll('.gear')],record=id=>data.records.find(row=>row.id===id),row=(id,t)=>record(id).tiers.find(row=>row.tier===t);
const expected=()=>data.records.filter(record=>record.jobs.includes(job.value)&&record.tiers.some(row=>row.tier===Number(tier.value)));
function sorted(){const scores=cards().map(card=>Number(card.dataset.score));assert.deepEqual(scores,[...scores].sort((a,b)=>b-a));}
function update(j,t){job.value=j;tier.value=String(t);job.onchange();sorted();}
assert.equal(data.records.length,488);assert.equal(data.jobs.length,39);assert.equal(document.querySelectorAll('#job option').length,39);assert.equal(document.querySelectorAll('#tier option').length,8);
assert.deepEqual(data.scoreConditions,{quality:4,refine:0,star:0,cards:false,affixes:'native-maximum'});
assert.equal(job.value,'swordsman');assert.equal(tier.value,'8');assert.equal(cards().length,expected().length);assert.equal(document.querySelectorAll('[data-category]').length,11);sorted();
for(const card of cards()){
 const id=Number(card.dataset.itemId),maximum=row(id,8).maxGS.swordsman;
 assert.equal(Number(card.dataset.score),maximum.gs);assert.equal(card.querySelectorAll('.tier').length,1);assert.equal(card.querySelector('.tier').dataset.tier,'8');
 assert.deepEqual([...card.querySelectorAll('.allocation li')].map(node=>node.textContent),data.allocations[maximum.allocation].text);
 assert(!/T[1-8]|周目/.test(card.querySelector('.gear-sources').textContent));
}
// Native eligibility includes inherited jobs and the Thief bow exception.
assert(record(1823).jobs.includes('star_emperor'));assert(!record(1823).jobs.includes('swordsman'));
const bow=data.records.find(record=>record.wtype==='활');assert(bow.jobs.includes('thief'));assert(bow.jobs.includes('rogue'));assert(!bow.jobs.includes('knight'));
update('mage',1);assert.equal(cards().length,expected().length);assert(cards().every(card=>Number(card.dataset.tier)===1));assert(!cards().some(card=>card.dataset.itemId==='1823'));
search.value='斗士的戰鬥升龍拳套';search.oninput();assert.equal(cards().length,0);assert(document.querySelector('.empty-result'));
update('taekwon',8);assert.equal(cards().length,1);assert.equal(cards()[0].dataset.itemId,'1823');assert(cards()[0].querySelector('.gear-sources').textContent.includes('黃俄希托斯'));
document.querySelector('[data-category="onehand"]').click();
const taekwon=document.querySelector('[data-subtype="taekwon"]');assert(taekwon);assert.equal(taekwon.textContent,'跆拳拳套');taekwon.click();assert.equal(cards().length,9);
update('monk',8);assert(!document.querySelector('[data-subtype="taekwon"]'));document.querySelector('[data-subtype="너클"]').click();assert(cards().length);assert(cards().every(card=>record(Number(card.dataset.itemId)).wtype==='너클'));
update('star_emperor',6);search.value='斗士的戰鬥升龍拳套';search.oninput();assert.equal(cards().length,1);assert.equal(cards()[0].querySelector('.tier b').textContent,'T6');assert.equal(Number(cards()[0].dataset.score),row(1823,6).maxGS.star_emperor.gs);
assert(cards()[0].querySelector('.base-stats').textContent.includes('ATK '+row(1823,6).base.atk));
// Search remains scoped to the selected profession and Tier, across all parts.
update('swordsman',8);search.value='波利';search.oninput();assert(cards().length>1);assert(cards().every(card=>record(Number(card.dataset.itemId)).sources.some(source=>source.monster.includes('波利'))||record(Number(card.dataset.itemId)).name.includes('波利')));
update('mage',8);search.value='紫蝶髮帶';search.oninput();const butterfly=document.querySelector('.gear[data-item-id="2208"]');assert(butterfly);assert(butterfly.querySelector('.tier').textContent.includes('無固定加成'));
search.value='no such equipment 980981';search.oninput();assert(document.querySelector('.empty-result'));
// Stable native reference maxima were independently exhaustively enumerated.
const reference=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/equipment-max-gs-native.json'),'utf8'));
assert.equal(reference.sourceSha256,data.sourceSha256);assert.equal(reference.mainSourceSha256,data.mainSourceSha256);
assert(reference.cases.reduce((sum,entry)=>sum+entry.combinations,0)>10000);
for(const sample of reference.cases){
 const actual=row(sample.id,sample.tier).maxGS[sample.job],allocation=data.allocations[actual.allocation];assert.equal(actual.gs,sample.maximum,JSON.stringify(sample));
 const affixes=allocation.affixes;assert.equal(affixes.length,sample.skills.length?5:4);assert.notEqual(affixes[0].stat,affixes[1].stat);
 for(const affix of affixes.slice(0,2))assert(sample.primary.some(candidate=>JSON.stringify(candidate)===JSON.stringify(affix)));
 assert(sample.third.some(candidate=>JSON.stringify(candidate)===JSON.stringify(affixes[2])));assert(sample.fourth.some(candidate=>JSON.stringify(candidate)===JSON.stringify(affixes[3])));
 if(sample.skills.length){assert(sample.skills.includes(affixes[4].skill));assert.equal(affixes[4].value,.2);}
 assert.deepEqual(row(sample.id,sample.tier).base,sample.base);
}
assert(data.records.every(record=>record.jobs.length));
for(const record of data.records)for(const row of record.tiers){assert.deepEqual(Object.keys(row.maxGS),record.jobs);for(const maximum of Object.values(row.maxGS)){assert(Number.isInteger(maximum.gs)&&maximum.gs>=0);assert(data.allocations[maximum.allocation]);}}
const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'../src/equipment-catalog.js'),'utf8').match(/const EQUIPMENT_CATALOG = (\[.*\]);/s)[1]);assert.deepEqual(data.records.map(record=>record.id).sort((a,b)=>a-b),catalog.map(record=>record.id).sort((a,b)=>a-b));
assert(record(5292).sources.some(source=>source.rare&&source.monster==='墨蛇君'));assert.equal(record(39001).icon,'https://ro.hans-webgametw.com/assets/items/1128.png');
assert(row(1559,8).bonuses.includes('★ +24% 對頭目與不死系傷害'));assert(!html.includes('import(')&&!html.includes('fetch('));
console.log('PASS 39-job/Tier filters, native eligibility, GS sorting, selected-tier attributes, maximum allocations, exhaustive native reference scores, source search and Taekwon subtype');
