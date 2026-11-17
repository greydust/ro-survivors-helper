const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const native=JSON.parse(fs.readFileSync('tests/fixtures/stage-level-native.json','utf8'));
const {parseHTML}=require('linkedom');const {window}=parseHTML('<html><body></body></html>');
const document=window.document;
const context=vm.createContext({document,gameCatalog:{bj:native.monsters,ca:native.scripts},MONSTER_NAMES:{},RO_LAPC:native.lapConfig,xe:native.stages,tt:native.scripts,_e:native.monsters,console});
vm.runInContext(native.functions+fs.readFileSync('src/stage-schedule.js','utf8')+';globalThis.api={stageMonsterLevel,updateStageSpawnSchedule,nativeLevel:(id,stage,lap)=>_e[id].level+(RO_LAPOF({stageId:stage,difficulty:{lap}})>1?RO_LAPK(stage,lap).lv:0)};',context);
let checked=0;
for(const stage of native.stages){
 const script=native.scripts[stage.id];const ids=new Set([...script.waves.flatMap(w=>w.pool),...script.bosses.map(b=>b.id)]);
 for(let lap=1;lap<=6;lap++)for(const id of ids){assert.equal(context.api.stageMonsterLevel(id,{id:stage.id,script},lap),context.api.nativeLevel(id,stage.id,lap),`${stage.id} lap ${lap} ${id}`);checked++;}
}
for(const id of ['prt_castle','xmas','louyang']){
 const script=native.scripts[id],mob=script.waves[0].pool[0],boss=script.bosses.at(-1).id;
 document.body.innerHTML=`<div id="lap-tabs"><button data-laptab="6" class="primary"></button></div><div id="stg-detail"><div class="stg-banner" style="--art:url('/assets/stages/${id}.jpg')"></div><div class="stg-mobs"><span data-mob="${mob}"></span></div><div class="stg-bosses"><div data-mob="${boss}"><b>Boss</b></div></div></div>`;
 context.api.updateStageSpawnSchedule();assert.equal(document.querySelector('.stg-mobs [data-ro-mob-level]').textContent,'等級 '+native.monsters[mob].level);assert.equal(document.querySelector('.stg-bosses [data-ro-mob-level]').textContent,'等級 '+native.monsters[boss].level);
}
assert.equal(context.api.stageMonsterLevel('unknown',{id:'prontera',script:native.scripts.prontera},6),null,'unknown data is never invented');
console.log(`Stage levels: ${checked} current native monster/lap cases across all ${native.stages.length} stages match, including story/special UI at lap 6`);
