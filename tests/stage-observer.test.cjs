const { parseHTML } = require('linkedom');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async()=>{
  const {window}=parseHTML(`<html><head></head><body><div id="stages"><div id="stg-detail">
    <div class="stg-banner" style="--art:url('/assets/stages/test.jpg')"></div>
    <div class="stg-mobs"><span data-mob="poring"><img src="poring.png"></span></div>
    </div></div></body></html>`);
  let callbacks=0,overflow=false;
  const observers=[];
  class CountingObserver extends window.MutationObserver {
    constructor(callback){
      super(records=>{
        // Bound the failure so a regression fails instead of hanging CI.
        if(++callbacks>50){overflow=true;this.disconnect();return;}
        callback(records);
      });observers.push(this);
    }
  }
  const context=vm.createContext({window,document:window.document,Element:window.Element,
    MutationObserver:CountingObserver,localStorage:{getItem:()=>null,setItem(){}},
    location:{href:'https://ro.hans-webgametw.com/'},URL,console,
    performance,setTimeout,clearTimeout,queueMicrotask,innerWidth:1200,innerHeight:800});
  const source=fs.readFileSync(path.join(__dirname,'../dist/RO倖存者助手.user.js'),'utf8');
  vm.runInContext(source.replace(/\}\)\(\);\s*$/,
    'globalThis.stageTest={updateStageSpawnSchedule,updateHordeHud,scan,setCatalog:value=>gameCatalog=value};})();'),context);
  const settle=()=>new Promise(resolve=>setTimeout(resolve,30));
  try{
    context.stageTest.setCatalog({ca:{test:{runLength:1020,bosses:[{t:840,id:'mastering'}],waves:[{from:0,to:1020,pool:['poring']}]}}});
    context.stageTest.scan();await settle();
    assert(!overflow,'stage annotations must not create an observer loop');
    const after=callbacks;
    // Native browsers may deliver this even though the class is unchanged.
    const mobs=window.document.querySelector('.stg-mobs');mobs.classList.add('ro-mob-schedule');
    await settle();assert(!overflow);assert(callbacks-after<=2,'unchanged class mutation must settle');
    const stable=callbacks;
    for(let i=0;i<20;i++)context.stageTest.updateStageSpawnSchedule();
    await settle();assert.equal(callbacks,stable,'repeated rendering must perform no DOM writes');
    assert.equal(window.document.querySelectorAll('[data-ro-mob-time]').length,1);
    assert(window.document.querySelector('[data-ro-mob-time]').textContent.includes('14:00'));
    console.log('PASS expedition annotations settle with a real MutationObserver');
    window.document.body.insertAdjacentHTML('beforeend','<div id="hud"></div><div id="loot-rolls"></div>');
    const game={state:'running',enemies:[{def:{id:'poring'},hp:10}]};
    context.stageTest.updateHordeHud(game,true);await settle();assert(!overflow);
    const hudStable=callbacks;
    for(let i=0;i<20;i++)context.stageTest.updateHordeHud(game,true);
    await settle();assert(!overflow);assert.equal(callbacks,hudStable,'unchanged monster HUD must perform no DOM writes');
    console.log('PASS monster HUD settles with a real MutationObserver');
  }finally{observers.forEach(observer=>observer.disconnect());}
})().catch(error=>{console.error(error);process.exitCode=1;});
