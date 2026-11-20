const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const native=JSON.parse(fs.readFileSync('tests/fixtures/stage-level-native.json','utf8'));
const {parseHTML}=require('linkedom');const {window}=parseHTML('<html><body></body></html>');
const document=window.document;
const context=vm.createContext({document,rulesSource:native.rulesSource,gameCatalog:{bj:native.monsters,ca:native.scripts},MONSTER_NAMES:{},RO_LAPC:native.lapConfig,xe:native.stages,tt:native.scripts,_e:native.monsters,console});
vm.runInContext(native.functions+fs.readFileSync('src/stage-schedule.js','utf8')+';stageLevelRules=parseStageLevelRules(globalThis.rulesSource);globalThis.api={stageMonsterLevel,updateStageSpawnSchedule,nativeLevel:(id,stage,lap)=>_e[id].level+(RO_LAPOF({stageId:stage,difficulty:{lap}})>1?RO_LAPK(stage,lap).lv:0)};',context);
let checked=0;
for(const stage of native.stages){
 const script=native.scripts[stage.id];const ids=new Set([...script.waves.flatMap(w=>w.pool),...script.bosses.map(b=>b.id)]);
 for(let lap=1;lap<=6;lap++)for(const id of ids){assert.equal(context.api.stageMonsterLevel(id,{id:stage.id,script},lap),context.api.nativeLevel(id,stage.id,lap),`${stage.id} lap ${lap} ${id}`);checked++;}
}
for(const id of ['prt_castle','c2_gef','c2_clock','c2_abyss','c2_glast','c2_nif']){
 const script=native.scripts[id],mob=script.waves[0].pool[0],boss=script.bosses.at(-1).id;
 document.body.innerHTML=`<div id="lap-tabs"><button data-laptab="6" class="primary"></button></div><div id="stg-detail"><div class="stg-banner" style="--art:url('/assets/stages/${id}.jpg')"></div><div class="stg-mobs"><span data-mob="${mob}"></span></div><div class="stg-bosses"><div data-mob="${boss}"><b>Boss</b></div></div></div>`;
 context.api.updateStageSpawnSchedule();assert.equal(document.querySelector('.stg-mobs [data-ro-mob-level]').textContent,'等級 '+native.monsters[mob].level);assert.equal(document.querySelector('.stg-bosses [data-ro-mob-level]').textContent,'等級 '+native.monsters[boss].level);
}
assert.equal(context.api.stageMonsterLevel('unknown',{id:'prontera',script:native.scripts.prontera},6),null,'unknown data is never invented');
for(const [stageId,script] of Object.entries(native.scripts).filter(([,s])=>s.intruder)){
 const id=script.intruder.id;
 document.body.innerHTML=`<div id="lap-tabs"><button data-laptab="6" class="primary"></button></div><div id="stg-detail"><div class="stg-banner" style="--art:url('/assets/stages/${stageId}.jpg')"></div><div class="stg-mobs"></div></div>`;
 context.api.updateStageSpawnSchedule();
 const section=document.querySelector('[data-ro-special-monsters]');assert(section,'native intruder must be listed');
 assert(section.textContent.includes(native.monsters[id].name));
 assert.equal(section.querySelector('[data-ro-mob-level]').textContent,'等級 '+context.api.nativeLevel(id,stageId,6));
 assert(section.textContent.includes('不保證每場出現'));
 context.api.updateStageSpawnSchedule();assert.equal(document.querySelector('[data-ro-special-monsters]'),section);
 document.querySelector('.stg-banner').style.setProperty('--art',"url('/assets/stages/prontera.jpg')");
 context.api.updateStageSpawnSchedule();assert.equal(document.querySelector('[data-ro-special-monsters]'),null,'stage changes remove stale intruders');
}
const custom=native.scripts.helper_test={waves:[],bosses:[],rare:{id:'poring',at:65},intruder:{id:'poring',at:65}};
document.body.innerHTML='<div id="stg-detail"><div class="stg-banner" style="--art:url(/assets/stages/helper_test.jpg)"></div><div class="stg-mobs"></div></div>';
context.api.updateStageSpawnSchedule();
assert.equal(document.querySelectorAll('[data-ro-special-monsters] .ro-timed-mob').length,1);
assert(document.querySelector('[data-ro-special-monsters]').textContent.includes('稀有怪／闖入頭目'));
assert(document.querySelector('[data-ro-special-monsters]').textContent.includes('預定 01:05'));
delete native.scripts.helper_test;
console.log(`Stage levels: ${checked} current native monster/lap cases across all ${native.stages.length} stages match, including story/special UI at lap 6`);

// Current public source is parsed as data; changed numeric settings need no helper edit.
context.rulesSource=native.rulesSource.replace('"base":54','"base":80');
vm.runInContext('stageLevelRules=parseStageLevelRules(rulesSource);',context);
const script=native.scripts.prontera,id=script.waves[0].pool[0];
assert(context.api.stageMonsterLevel(id,{id:'prontera',script},3)>context.api.nativeLevel(id,'prontera',3));
vm.runInContext('stageLevelRules=null;',context);
assert.equal(context.api.stageMonsterLevel(id,{id:'prontera',script},3),null);
assert.equal(context.api.stageMonsterLevel(id,{id:'prontera',script},1),native.monsters[id].level);
assert.throws(()=>vm.runInContext('parseStageLevelRules("unknown format")',context));
console.log('PASS live rule parsing, automatic numeric changes, unknown-format rejection and unavailable-rule fallback');

(async()=>{
 context.URL=URL;context.location={href:'https://ro.hans-webgametw.com/'};
 document.head.innerHTML='<script type="module" src="./build/main-current.js"></script>';
 let requests=0;
 context.fetch=async(url,options)=>{requests++;assert.equal(url,'https://ro.hans-webgametw.com/build/main-current.js');assert.equal(options.credentials,'omit');return {ok:true,text:async()=>native.rulesSource};};
 await vm.runInContext('Promise.all([loadStageLevelRules(),loadStageLevelRules()])',context);
 assert.equal(requests,1);assert.equal(context.api.stageMonsterLevel(id,{id:'prontera',script},3),context.api.nativeLevel(id,'prontera',3));
 context.fetch=async()=>({ok:false,status:503});context.console={warn(){}};
 await vm.runInContext('stageLevelRules=null;stageRulesRequest=null;loadStageLevelRules()',context);
 assert.equal(context.api.stageMonsterLevel(id,{id:'prontera',script},3),null);
 console.log('PASS current-page build URL loading, one request, native results and HTTP failure fallback');
})().catch(error=>{console.error(error);process.exitCode=1;});
