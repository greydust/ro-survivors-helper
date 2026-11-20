const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');
const native=JSON.parse(fs.readFileSync('tests/fixtures/stage-card-native.json','utf8'));
const {document}=parseHTML('<html><body><div id="npc-text"><div class="diff"><div class="diff-reward">掉寶 · 裝備 · 傳說率</div></div></div></body></html>');
const context=vm.createContext({document,source:native.rules});
vm.runInContext(native.rules+fs.readFileSync('src/stage-schedule.js','utf8')+';stageCardRules=parseStageCardRules(source);globalThis.api={rates:stageCardMultipliers,update:updateStageCardReward,native:v=>({mob:RO_LCF.G(v,false),boss:RO_LCF.G(v,true)})};',context);
const fields=['count','damage','hp','speed','events','tier'];
for(let i=0;i<200;i++){
 const values=Object.fromEntries(fields.map((key,j)=>[key,i===0?1:i===1?20:1+((i*37+j*13)%381)/20]));
 const actual=context.api.rates(values),expected=context.api.native(values);
 for(const kind of ['mob','boss'])assert(Math.abs(actual[kind]-expected[kind])<1e-10,`${kind} ${JSON.stringify(values)}`);
}
const diff=document.querySelector('.diff');
for(const key of fields){const input=document.createElement('input');input.dataset.key=key;input.value='1';diff.append(input);}
context.api.update();
assert.equal(document.querySelector('[data-ro-card-reward]').textContent,' · 卡片 一般 ×1／首領 ×1');
for(const input of document.querySelectorAll('input'))input.value='20';
context.api.update();context.api.update();
assert.equal(document.querySelectorAll('[data-ro-card-reward]').length,1);
assert(document.querySelector('[data-ro-card-reward]').textContent.endsWith('首領 ×75'));
vm.runInContext('stageCardRules=null',context);context.api.update();
assert.equal(document.querySelector('[data-ro-card-reward]').textContent,' · 卡片 —');
assert.throws(()=>vm.runInContext('parseStageCardRules("unknown")',context));
console.log('PASS card multipliers match 200 native difficulty cases; UI updates, deduplication and unavailable-rule fallback');
