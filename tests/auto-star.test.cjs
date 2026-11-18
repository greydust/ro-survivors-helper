const {parseHTML}=require('linkedom');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'dist/RO倖存者助手.user.js'),'utf8');
const native=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/starforge-native.json'),'utf8'));
function setup({level=0,materials=100,results=[],delay=false,error=false}={}){
 const {window}=parseHTML('<html><head></head><body><div id="npc-dialog" class="hidden"></div></body></html>');
 delete window[Symbol.for('greydust.ro.helper.runtime')];delete window.visualViewport;
 let time=1,id=0,calls=0,pending,alive=0,peak=0;const timers=new Map();
 const item={uid:'piece',itemId:1101,star:level,cards:[],quality:4,affixes:[]};
 const account={materials:{1:materials,2:materials},kafra:1000000};
 const context=vm.createContext({window,document:window.document,Element:window.Element,MouseEvent:window.Event,URL,location:{href:'https://ro.hans-webgametw.com/'},
  MutationObserver:class{observe(){}},localStorage:{getItem(){return null},setItem(){}},console,performance:{now:()=>time},innerWidth:1200,innerHeight:800,
  queueMicrotask,setTimeout:(fn,ms)=>{timers.set(++id,{fn,at:time+ms});return id},clearTimeout:key=>timers.delete(key)});
 vm.runInContext(source.replace(/\}\)\(\);\s*$/,'globalThis.starAPI={updateAutoStar,startAutoStar,stopAutoStar,state:()=>autoStar,target:v=>autoStar.target=v};})();'),context);
 context.G={C:{CSS:'',max:10,step:1.05,low:5,ore:{weapon:[1,2],armor:[1,2]},rore:{weapon:[1,2],armor:[1,2]},oreName:{},rfee:1},
  ze:()=>({id:'c',inventory:[item]}),ye:()=>({1101:{slot:'weapon'}}),blocked:()=>new Set(),vis:()=>true,worn:()=>false,gs:()=>100,
  os:x=>x.uid,img:()=>'',qc:()=>'',ma:()=>({atk:0,matk:0,def:0}),go:()=>[],cn:()=>[],et:()=>account,ut:String,oe:()=>({4:{name:'傳說'}}),
  ue:n=>window.document.getElementById(n).classList.remove('hidden'),ce:n=>window.document.getElementById(n).classList.add('hidden'),rr:()=>true,wa:()=>{},snd:()=>{},
  uc:body=>{assert.deepEqual(JSON.parse(JSON.stringify(body)),{op:'star',uid:'piece'});calls++;peak=Math.max(peak,++alive);
   const finish=()=>{alive--;if(error)throw Error('network failure');const ok=results.length?results.shift():true;item.star=ok?item.star+1:Math.max(0,item.star-1);account.materials[1]--;account.materials[2]--;return {ok,star:item.star}};
   return delay?new Promise((resolve,reject)=>{pending=()=>{try{resolve(finish())}catch(e){reject(e)}}}):Promise.resolve().then(finish);
  }};
 vm.runInContext(native.runtime+'(G);RO_SF.open();',context);context.starAPI.updateAutoStar();
 const api=context.starAPI;
 const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve()};
 async function tick(ms){const end=time+ms;for(;;){const due=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;timers.delete(due[0]);time=due[1].at;due[1].fn();await flush();}time=end;await flush();}
 return {document:window.document,window,api,item,account,tick,calls:()=>calls,peak:()=>peak,finish:async()=>{pending?.();await flush()},context};
}
(async()=>{
 let e=setup();e.api.target(4);e.api.startAutoStar();await e.tick(5000);assert.equal(e.item.star,4);assert.equal(e.calls(),4);assert(!e.api.state().active);assert.equal(e.peak(),1);
 console.log('PASS native continuous star upgrades stop at target with one request at a time');
 e=setup({level:4,results:[false,true,true]});e.api.target(5);e.api.startAutoStar();await e.tick(5000);assert.equal(e.item.star,5);assert.equal(e.calls(),3);assert.equal(e.peak(),1);
 console.log('PASS native inline risky confirmation and failed roll retries reach target');
 e=setup({materials:1});e.api.target(4);e.api.startAutoStar();await e.tick(5000);assert.equal(e.calls(),1);assert(!e.api.state().active);
 e=setup();e.account.kafra=0;vm.runInContext('RO_SF.open()',e.context);e.api.startAutoStar();await e.tick(1000);assert.equal(e.calls(),0);
 e=setup({error:true});e.api.startAutoStar();await e.tick(3000);assert.equal(e.calls(),1);assert(!e.api.state().active);
 console.log('PASS insufficient materials/currency and native request errors stop the loop');
 e=setup({delay:true});e.api.startAutoStar();await e.tick(3000);assert.equal(e.calls(),1);e.document.querySelector('#ro-auto-star-button').click();await e.finish();await e.tick(2000);assert.equal(e.calls(),1);assert.equal(e.item.star,1);
 e=setup({delay:true});e.api.startAutoStar();await e.tick(32000);assert.equal(e.calls(),1);assert(!e.api.state().active);
 console.log('PASS pending requests are never duplicated; stop and timeout prevent further attempts');
 for(const selector of ['#sf-close','[data-sft="reroll"]','#sf-list .cand']){e=setup();e.api.startAutoStar();e.document.querySelector(selector).click();await e.tick(1000);assert.equal(e.calls(),0);assert(!e.api.state().active);}
 e=setup();e.document.querySelector('#npc-dialog').classList.remove('hidden');e.api.startAutoStar();await e.tick(1000);assert.equal(e.calls(),0);
 e=setup();e.api.target(11);e.api.startAutoStar();await e.tick(1000);assert.equal(e.calls(),0);
 console.log('PASS close, tab/selection changes, existing dialogs and invalid targets do not upgrade');
})().catch(error=>{console.error(error);process.exitCode=1});
