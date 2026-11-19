const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');
const folder=path.join(__dirname,'../doc/equipment');
const html=fs.readFileSync(path.join(folder,'index.html'),'utf8'),data=JSON.parse(fs.readFileSync(path.join(folder,'data.json'),'utf8'));
const {window}=parseHTML(html),document=window.document;
const embedded=JSON.parse(document.querySelector('#equipment-data').textContent);assert.deepEqual(embedded,data);
const script=[...document.querySelectorAll('script')].find(node=>!node.type).textContent;
vm.runInNewContext(script,{document,window,Set,Map,JSON});
assert.equal(document.querySelectorAll('[data-category]').length,10);assert(document.querySelector('[data-category="onehand"]'));assert(document.querySelector('[data-category="twohand"]'));
document.querySelector('[data-category="twohand"]').click();
const counts=data.records.filter(record=>record.slot==='twohand').length;assert.equal(document.querySelectorAll('.gear').length,counts);
assert([...document.querySelectorAll('[data-subtype]')].some(node=>node.textContent==='雙手劍'));
document.querySelector('[data-subtype="양손검"]').click();
assert([...document.querySelectorAll('.gear')].every(node=>data.records.find(record=>record.id===Number(node.dataset.itemId)).wtype==='양손검'));
const input=document.querySelector('#search');input.value='紫蝶髮帶';input.oninput();
const butterfly=document.querySelector('.gear[data-item-id="2208"]');assert(butterfly);assert(!butterfly.textContent.includes('減傷'));
assert(butterfly.textContent.includes('無固定加成'));assert(!butterfly.textContent.includes('受到傷害'));assert(document.querySelector('[data-tier="4"]'));assert(document.querySelector('[data-tier="5"]'));
for(const tier of document.querySelectorAll('.tier'))assert(/^T\d+$/.test(tier.querySelector('b').textContent));
input.value='波利';input.oninput();assert(document.querySelectorAll('.gear').length>1);assert(document.querySelector('#result').textContent.startsWith('搜尋全部部位'));
input.value='no such equipment 980981';input.oninput();assert(document.querySelector('.empty-result'));
const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'../src/equipment-catalog.js'),'utf8').match(/const EQUIPMENT_CATALOG = (\[.*\]);/s)[1]);
assert.deepEqual(data.records.map(record=>record.id).sort((a,b)=>a-b),catalog.map(record=>record.id).sort((a,b)=>a-b));
assert.equal(data.maxTier,8);assert.equal(data.lapCount,6);assert.equal(data.lapConfig.max,6);
assert(data.records.every(record=>(record.sources.every(source=>source.chapter===2)?[6,7,8]:[4,5,6,7,8]).every(tier=>record.tiers.some(row=>row.tier===tier))));
const dagger=data.records.find(record=>record.id===1202);assert(dagger.tiers.find(row=>row.tier===8).bonuses.includes('★ 急速 +8'));
for(const sources of document.querySelectorAll('.gear-sources'))assert(!/T[1-8]|周目/.test(sources.textContent));
assert(data.records.every(record=>record.sources.every(source=>!/[A-Za-z]/.test(source.monster))));
assert(!html.includes('import('));assert(!html.includes('fetch('));
console.log('PASS static equipment page shares filter catalog, actual bonuses, Chinese sources and T4–T8; categories, subtypes and search work offline');

assert.equal(data.records.length,488);
for(const [id,name,stage] of [[39001,'聖誕版海東劍','聖誕節'],[5457,'玉兔頭飾','元宵節'],[5292,'龍的骷髏','元宵節']]){
 const record=data.records.find(row=>row.id===id);assert(record);assert.equal(record.name,name);assert(record.sources.some(source=>source.stage===stage));assert(record.tiers.some(row=>row.tier===8));
 input.value=name;input.oninput();assert(document.querySelector('.gear[data-item-id="'+id+'"]'));
}
const rare=data.records.find(row=>row.id===5292);assert(rare.sources.some(source=>source.rare&&source.monster==='墨蛇君'));assert(document.querySelector('.gear[data-item-id="5292"]').textContent.includes('闖入者'));
assert.equal(data.records.find(row=>row.id===39001).icon,'https://ro.hans-webgametw.com/assets/items/1128.png');
assert(data.records.find(row=>row.id===1559).tiers.find(row=>row.tier===8).bonuses.includes('★ +24% 對頭目與不死系傷害'));
console.log('PASS expanded catalog includes official names, reused artwork, festival/rare sources and current T8 bonuses');
