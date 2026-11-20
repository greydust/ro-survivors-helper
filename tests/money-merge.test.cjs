const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{parseHTML}=require('linkedom');
const native=JSON.parse(fs.readFileSync('tests/fixtures/money-native.json','utf8'));
function setup(savedValue=null){
 const {window}=parseHTML('<html><body><label><input id="lu-p-hide"></label></body></html>'),saved=new Map();
 const ctx=vm.createContext({window,document:window.document,activeGame:null,notify(){},localStorage:{getItem:key=>key==='greydust.ro.merge-money.v1'?savedValue:null,setItem:(key,value)=>saved.set(key,value)}});
 vm.runInContext(fs.readFileSync('src/weather.js','utf8')+fs.readFileSync('src/pickups.js','utf8')+`
 const te={itemTextures:new Map(),iconTextures:new Map()},Oe=[{color:1}],fj=1.3,wu=3;
 const O={play(){}},RO_LU={vis(){},block(){return false;}},tr=Math.pow,re=()=>.5;
 function RO_MAGFULL(g){return !g.deterministic&&g.pickups.filter(p=>!p.dead&&p.kind==='magnet').length>=3;}
 class jS {constructor(kind,x,y,value){Object.assign(this,{kind,x,y,value,nid:0,dead:false,magnet:false,sprite:{scale:{set(){}}},view:{visible:true,destroy(){this.destroyed=true;}}});}update(){}}
 class Game {constructor(){Object.assign(this,{pickups:[],zeny:0,player:{x:0,y:20},stats:{zenyMult:1.7,pickupRadius:40},chestMsgCd:0,state:'playing',gemTextures:{},entityLayer:{addChild(){}},world3d:{beams:[],removeBeam(){}}});}buffValue(){return 0}${native.dropPickup}${native.sweepPickups}${native.updatePickups}${native.collect}}
 globalThis.Game=Game;globalThis.api={install:installPickupHelpers,ui:updatePickupOptions,snapshot:pickupPerformanceSnapshot,merge:mergeMoneyPickups};`,ctx);
 const toggle=value=>{ctx.api.ui();const input=window.document.querySelector('[data-ro-pickup-option="merge-money"]');input.checked=value;input.onchange();};
 return {ctx,saved,window,toggle};
}
const live=g=>g.pickups.filter(p=>!p.dead&&p.kind==='zeny'),total=g=>live(g).reduce((sum,p)=>sum+p.value,0);
{
 const e=setup(),g=new e.ctx.Game();e.ctx.activeGame=g;e.ctx.api.install(g);
 const originalUpdate=g.updatePickups;e.ctx.api.ui();e.ctx.api.ui();assert.equal(e.window.document.querySelectorAll('[data-ro-pickup-option="merge-money"]').length,1);
 for(let i=0;i<800;i++)g.dropPickup('zeny',i*10+1000,0,1.2+i%3);
 assert.equal(live(g).length,800,'default off');const amount=total(g),retired=g.pickups.slice(350);
 e.toggle(true);assert.equal(e.saved.get('greydust.ro.merge-money.v1'),'true');assert.equal(live(g).length,350);assert.equal(total(g),amount);assert(retired.every(p=>p.dead&&p.view.destroyed),'native cleanup releases retired views');assert.equal(g.zeny,0,'merging does not collect money');assert.equal(g.updatePickups,originalUpdate);
 const baseline=new e.ctx.Game();for(let i=0;i<1200;i++){const value=.3+i%5;baseline.dropPickup('zeny',2000+i,0,value);g.dropPickup('zeny',2000+i,0,value);}
 assert.equal(live(g).length,350);assert.equal(total(g),amount+total(baseline),'multiplier and per-drop rounding applied exactly once');
 const other={kind:'gem_red',value:9,view:{destroy(){throw Error('other pickup destroyed')}}};g.pickups.push(other);e.ctx.api.merge(g);assert(g.pickups.includes(other));assert.equal(other.value,9);
 const expected=total(g);g.pickups=g.pickups.filter(p=>p.kind==='zeny');for(const p of g.pickups){p.x=0;p.y=0;p.magnet=true;}g.updatePickups(1);assert.equal(g.zeny,expected,'native collection awards the full merged amount');assert.equal(g.pickups.length,0);
 e.toggle(false);for(let i=0;i<400;i++)g.dropPickup('zeny',1000,0,1);assert.equal(live(g).length,400,'off restores normal future drops');
}
{
 const e=setup('true'),g=new e.ctx.Game();e.ctx.activeGame=g;
 for(let i=0;i<700;i++)g.dropPickup('zeny',1000+i,0,2);const amount=total(g);e.ctx.api.install(g);assert.equal(live(g).length,350,'saved setting compacts existing piles on install');assert.equal(total(g),amount);
 for(const flag of ['magnet','vacuum','nid']){const p={kind:'zeny',value:7,x:1000,y:0,[flag]:flag==='nid'?123:true,view:{destroy(){throw Error('protected pile destroyed')}}};g.pickups.push(p);e.ctx.api.merge(g);assert(g.pickups.includes(p));assert.equal(p.dead,undefined);}
 const unsafe={kind:'zeny',value:Number.MAX_SAFE_INTEGER,x:1,y:1};g.pickups.push(unsafe);const sum=total(g);e.ctx.api.merge(g);assert.equal(unsafe.dead,undefined,'unsafe additions never merge');assert.equal(total(g),sum);
 const state=e.ctx.api.snapshot(g).moneyMerging;assert(state.enabled&&state.ready&&state.active);assert(state.mergedObjects>=350);
}
for(const mode of [{coop:{replica:true}},{coop:{replica:false}},{deterministic:true}]){
 const e=setup('true'),g=new e.ctx.Game();Object.assign(g,mode);e.ctx.activeGame=g;e.ctx.api.install(g);
 for(let i=0;i<400;i++)g.dropPickup('zeny',1000,0,2);assert.equal(live(g).length,400,'network/deterministic mode stays native');assert.equal(e.ctx.api.snapshot(g).moneyMerging.active,false);
}
{
 const e=setup('true'),g=new e.ctx.Game();g.dropPickup=function(kind){this.lastKind=kind;};const original=g.dropPickup;e.ctx.api.install(g);assert.equal(g.dropPickup,original);assert.equal(e.ctx.api.snapshot(g).moneyMerging.ready,false,'unknown client remains untouched');
 const h=new e.ctx.Game();h.sweepPickups=function(){};e.ctx.api.install(h);for(let i=0;i<400;i++)h.dropPickup('zeny',1000,0,2);assert.equal(live(h).length,400,'unknown cleanup disables merging');
}
{
 const e=setup('true'),g=new e.ctx.Game();e.ctx.activeGame=g;e.ctx.api.install(g);
 vm.runInContext(fs.readFileSync('src/battle-preferences.js','utf8')+';globalThis.installVisuals=installBattleVisualPreferences;',e.ctx);e.ctx.installVisuals(g);
 for(let i=0;i<500;i++)g.dropPickup('zeny',1000+i,0,2);assert.equal(live(g).length,350,'money merge works inside the visual ownership wrapper');
 assert.equal(total(g),500*Math.round(2*1.3*1.7));
}
{
 const e=setup(),g=new e.ctx.Game();e.ctx.activeGame=g;e.ctx.api.install(g);
 // Execute the real constructor: single-player pickups also carry nid=0.
 vm.runInContext(`globalThis.NativePickup=(()=>{
 const x=(object,key,value)=>Object.defineProperty(object,key,{value,writable:true,configurable:true,enumerable:true}),$s=()=>.5,el=node=>node;
 class ue {constructor(){this.visible=true;this.position={set(){}};}addChild(){}destroy(){this.destroyed=true;}}
 class ea {ellipse(){return this;}fill(){return this;}}
 class Rt {constructor(){this.anchor={set(){}};}}
 return class {${native.pickupConstructor}update(){}};
 })();`,e.ctx);
 const items=Array.from({length:800},(_,i)=>new e.ctx.NativePickup('zeny',1000+i,0,3,null));
 assert(items.every(p=>p.nid===0),'verified native constructor default');g.pickups=items.slice();
 e.toggle(true);assert.equal(live(g).length,350,'enabling during the current run merges native nid=0 pickups immediately');assert.equal(total(g),2400);assert(items.slice(350).every(p=>p.view.destroyed));
 const protectedPile=new e.ctx.NativePickup('zeny',1000,0,9,null);protectedPile.nid=123;g.pickups.push(protectedPile);
 e.ctx.api.merge(g);assert.equal(protectedPile.dead,false);assert.equal(protectedPile.value,9,'real nonzero network ID still excluded');
}
console.log('Money merge: native nid=0 regression, opt-in UI/persistence, rounding/collection/cleanup, totals and multiplayer isolation passed');
