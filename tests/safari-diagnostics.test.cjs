const {parseHTML}=require('linkedom');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../dist/RO倖存者助手.user.js'),'utf8');
const safari='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
function setup({ua=safari,storage=new Map(),query='',failStorage=false,clipboard}={}){
 const {window}=parseHTML('<html><head></head><body><div id="hud"></div><div id="picker" class="hidden"><div id="pk-cards"><button class="pk-card" data-i="0">Card</button></div></div><button id="native">Native</button></body></html>');
 delete window[Symbol.for('greydust.ro.helper.runtime')];delete window.visualViewport;
 const nav={userAgent:ua,clipboard};const browserWindow=new Proxy(window,{get:(target,key)=>key==='navigator'?nav:Reflect.get(target,key)});
 let now=0,next=0;const timers=new Map(),microtasks=[];
 const context=vm.createContext({window:browserWindow,document:window.document,Element:window.Element,MouseEvent:window.Event,URL,location:{href:'https://ro.hans-webgametw.com/'+query},
  localStorage:{getItem:key=>{if(failStorage)throw Error('storage unavailable');return storage.get(key)||null;},setItem:(key,value)=>{if(failStorage)throw Error('storage unavailable');storage.set(key,value);}},
  MutationObserver:class{observe(){}},console,performance:{now:()=>now},innerWidth:390,innerHeight:844,
  queueMicrotask:fn=>microtasks.push(fn),setTimeout:(fn,delay)=>{const id=++next;timers.set(id,{at:now+delay,fn});return id;},clearTimeout:id=>timers.delete(id)});
 vm.runInContext(source.replace(/\}\)\(\);\s*$/,'globalThis.diagnosticTest={isSafariBrowser,get:()=>safariDiagnostics,setGame:value=>activeGame=value,setRing:value=>showHordeRing=value,patchMinimapContext,paintHordeRing};})();'),context);
 const flush=()=>{for(let i=0;microtasks.length;i++){assert(i<1000);microtasks.shift()();}};
 const tick=ms=>{const end=now+ms;for(;;){const due=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;timers.delete(due[0]);now=due[1].at;due[1].fn();flush();}now=end;flush();};
 return {window:browserWindow,document:window.document,api:context.diagnosticTest,storage,tick,flush};
}
function button(e,label){return [...e.document.querySelectorAll('#ro-safari-diagnostics button')].find(node=>node.textContent===label);}
const current='greydust.ro.safari-diagnostics.current.v1',previous='greydust.ro.safari-diagnostics.previous.v1';
(async()=>{
 for(const ua of [safari+' CriOS/130.0',safari+' FxiOS/131.0',safari.replace('Version/18.0','CriOS/130.0'),safari.replace('Version/18.0','FxiOS/131.0'),'Mozilla/5.0 Chrome/130.0 Safari/537.36']){
  const e=setup({ua});assert.equal(e.api.get(),null);assert.equal(e.storage.size,0);assert(!e.document.querySelector('#ro-safari-diagnostics-open'));
 }
 console.log('PASS diagnostics only activate in Safari');
 const ui=setup();let report=ui.api.get().getLog().currentUI;
 assert.equal(report.hasGame,false);assert.equal(report.characterButton.exists,false);assert.equal(report.monsters.exists,false);assert.equal(report.minimap.enabled,false);
 ui.document.body.insertAdjacentHTML('beforeend','<div id="buffs"></div><button id="ro-character-details-toggle"></button><section id="ro-horde-hud" hidden><div data-monster-counts hidden></div></section><div id="minimap"><canvas width="200" height="180"></canvas></div>');
 const character=ui.document.querySelector('#ro-character-details-toggle');
 ui.document.querySelector('#minimap canvas').width=200;
 character.getBoundingClientRect=()=>({left:500,top:20,right:600,bottom:50,width:100,height:30});
 ui.api.setGame({state:'playing',stats:{},map:{width:100,height:100},player:{x:3200,y:3200},logicReach:()=>900});
 ui.api.setRing(true);ui.tick(1000);report=ui.api.get().getLog().currentUI;
 assert.equal(report.hasStats,true);assert.equal(report.characterButton.intersectsViewport,false);assert.equal(report.monsters.hidden,true);
 assert(report.monsterList.hiddenAncestors.some(row=>row.element.includes('ro-horde-hud')));assert.equal(report.minimap.geometry.reach,900);assert.equal(report.minimap.canvasWidth,200);
 character.getBoundingClientRect=()=>({left:10,top:20,right:110,bottom:50,width:100,height:30});
 ui.document.elementFromPoint=()=>ui.document.querySelector('#picker');report=ui.api.get().getLog().currentUI;
 assert.equal(report.characterButton.intersectsViewport,true);assert.equal(report.characterButton.centerHitWithin,false);assert(report.characterButton.centerHit.includes('picker'));
 const ctx={beginPath(){},arc(){},stroke(){},fillRect(){},drawImage(){},rotate(){},restore(){},save(){},setTransform(){},setLineDash(){},ellipse(){}};
 ui.api.patchMinimapContext(ctx);ui.api.patchMinimapContext(ctx);
 ui.api.paintHordeRing(ctx,null,null);report=ui.api.get().getLog().currentUI;assert.equal(report.minimap.trace.lastReason,'geometry-unavailable');
 ui.api.paintHordeRing(ctx,{width:512,height:512},[0,0,512,512,0,0,200,200]);report=ui.api.get().getLog().currentUI;
 assert.equal(report.minimap.trace.patched,1);assert.equal(report.minimap.trace.drawn,1);assert.equal(report.minimap.trace.lastReason,null);
 ui.api.setRing(false);ui.api.paintHordeRing(ctx,null,null);assert.equal(ui.api.get().getLog().currentUI.minimap.trace.lastReason,'disabled');
 for(let i=0;i<20;i++){ui.api.setRing(i%2===0);ui.tick(1000);}
 assert.equal(ui.api.get().getLog().uiHistory.length,12);assert(JSON.parse(ui.storage.get(current)).currentUI);
 console.log('PASS UI diagnostics identify missing, hidden, offscreen, covered elements and minimap draw availability');
 const e=setup();let clicks=0;e.document.querySelector('#native').onclick=()=>clicks++;
 e.document.querySelector('#native').click();e.flush();e.tick(200);assert.equal(clicks,1);
 let entries=e.api.get().getLog().entries;const click=entries.find(row=>row.event==='click');assert(click);assert.equal(click.preventedAfterDispatch,false);assert.equal(click.bubbled,true);assert(click.after);
 const err=new e.window.Event('error');Object.assign(err,{message:'test failure',error:new Error('test failure')});e.window.dispatchEvent(err);e.flush();
 assert(JSON.parse(e.storage.get(current)).entries.some(row=>row.kind==='error'&&row.message==='test failure'));
 for(let i=0;i<200;i++)e.document.querySelector('#native').click();e.flush();e.tick(200);assert.equal(e.api.get().getLog().entries.length,80);
 assert.equal(JSON.parse(e.storage.get(current)).entries.length,80);assert(e.api.get().getLog().errors.some(row=>row.message==='test failure'));console.log('PASS passive input/error records stay bounded and persist');
 const restored=setup({storage:e.storage,query:'?rodiag=1'});assert(restored.document.querySelector('#ro-safari-diagnostics'));
 assert(restored.document.querySelector('select').value==='previous');assert(restored.document.querySelector('textarea').value.includes('"event": "click"'));assert(restored.storage.has(previous));
 const archived=restored.storage.get(previous);const restoredAgain=setup({storage:restored.storage,query:'?rodiag=1'});assert.equal(restoredAgain.storage.get(previous),archived);console.log('PASS reload recovers prior activity without overwriting it with an empty session');
 let copied='';const copy=setup({query:'?rodiag=1',clipboard:{writeText:text=>{copied=text;return Promise.resolve();}}});button(copy,'複製紀錄').click();await new Promise(resolve=>setImmediate(resolve));assert(copied.includes('"format": 1'));assert(copy.document.querySelector('[role="status"]').textContent.includes('已複製'));
 const fallback=setup({query:'?rodiag=1',failStorage:true});assert(fallback.document.querySelector('#ro-safari-diagnostics').textContent.includes('本機保存目前不可用'));button(fallback,'複製紀錄').click();assert(fallback.document.querySelector('[role="status"]').textContent.includes('長按'));
 console.log('PASS clipboard copy and manual-copy/storage-failure fallbacks');
})().catch(error=>{console.error(error);process.exitCode=1;});
