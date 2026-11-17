const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const native=JSON.parse(fs.readFileSync('tests/fixtures/pickups-native.json','utf8'));
const context=vm.createContext({localStorage:{getItem:()=>null},activeGame:null,Math,Number,Reflect,Set,WeakMap,WeakSet});
vm.runInContext(fs.readFileSync('src/weather.js','utf8')+fs.readFileSync('src/pickups.js','utf8')+`;globalThis.api={installPickupHelpers,patchPickupVisual,patchPickupWorld,patchBeamVisual,setUnlimited:v=>unlimitedMagnets=v,installMagnetLimitOption,pickupMetrics};`,context);
vm.runInContext(`
let ops={position:0,sin:0,scale:0,height:0};const St=x=>(ops.sin++,Math.sin(x));
const O={play(){}},c=x=>x,tr=Math.pow,re=()=>.5;
class Pickup {constructor(kind,x=1000){Object.assign(this,{kind,x,y:-20,value:7,bob:0,dead:false,magnet:false,vacuum:false,sprite:{},glow:{},view:{visible:false,position:{set(){ops.position++}},destroy(){this.destroyed=true}}});}${native.pickupUpdate}}
class Beam {constructor(){this.age=0;this.group={visible:false,scale:{set(){ops.scale++}},position:{set(){ops.position++}}};this.mats=[{uniforms:{time:{value:0},alpha:{value:0}},userData:{alpha:.5}}];}${native.beamUpdate}}
class World {constructor(){this.beams=new Set()}heightAt(){ops.height++;return 0}${native.setBeam}removeBeam(b){this.beams.delete(b)}}
class Game {constructor(){Object.assign(this,{pickups:[],player:{x:0,y:0,dead:false},state:'playing',stats:{pickupRadius:40,potionMult:1,freeChest:0},zeny:100,chestMsgCd:0,chestsOpened:0,events:{onLoot(){},onChest(){}},world3d:new World(),xp:0});}buffValue(){return 0}chestCost(){return 50}rollChest(){return ['offer']}gainExp(v){this.xp+=v}healPlayer(v){this.healed=(this.healed||0)+v}${native.vacuum}${native.updatePickups}${native.collect}${native.tryOpenChest}${native.replicaPickups}${native.sweepPickups}}
globalThis.test={Pickup,Beam,World,Game,ops,originalPickupUpdate:Pickup.prototype.update,originalBeamUpdate:Beam.prototype.update};`,context);
const {api,test:t}=context;
{
 const g=new t.Game(),vacuum=g.vacuum,update=g.updatePickups;
 g.pickups=['chest','meat','magnet','exp'].map(k=>new t.Pickup(k));api.installPickupHelpers(g);
 assert.equal(g.vacuum,vacuum,'native magnet method remains untouched');assert.equal(g.updatePickups,update,'native pickup movement remains untouched');
 g.vacuum();assert.deepEqual(Array.from(g.pickups,p=>p.magnet),[false,false,false,true]);
 g.updatePickups(1);assert.equal(g.pickups.find(p=>p.kind==='chest').x,1000);
}
{
 const p=new t.Pickup('exp');t.ops.position=0;t.ops.sin=0;api.patchPickupVisual(t.Pickup.prototype);p.update(.1);p.update(.2);assert.equal(t.ops.position,0);assert.equal(t.ops.sin,0);p.view.visible=true;p.update(.1);assert(Math.abs(p.bob-1.6)<1e-9);assert.equal(t.ops.sin,2);
 const unsafe={update(e){this.x+=e}};const original=unsafe.update;api.patchPickupVisual(unsafe);assert.equal(unsafe.update,original);
}
{
 const b=new t.Beam(),w=new t.World();w.beams.add(b);api.patchPickupWorld(w);t.ops.height=0;t.ops.scale=0;b.update(.1);w.setBeam(b,1,2);assert.equal(t.ops.height,0);assert.equal(t.ops.scale,0);b.group.visible=true;b.update(.2);w.setBeam(b,1,2);assert(Math.abs(b.age-.3)<1e-9);assert.equal(t.ops.height,1);assert.equal(t.ops.scale,1);
 b.group.visible=false;t.originalBeamUpdate.call(b,.1);t.World.prototype.setBeam.call(w,b,2,3);assert.equal(t.ops.height,2);
}
{
 const g=new t.Game();g.pickups=[new t.Pickup('exp',0)];const p=g.pickups[0];api.installPickupHelpers(g);g.updatePickups(.1);assert.equal(g.xp,7);assert.equal(g.pickups.length,0);assert.equal(p.view.destroyed,true);
 t.ops.position=0;t.ops.sin=0;const items=Array.from({length:10000},()=>new t.Pickup('exp'));for(const p of items)p.update(.016);assert.equal(t.ops.position,0);assert.equal(t.ops.sin,0);for(const p of items)t.originalPickupUpdate.call(p,.016);assert.equal(t.ops.position,10000);assert.equal(t.ops.sin,20000);
}
console.log('Pickup native integration: native magnet preservation, cleanup and hidden visual optimization passed');

vm.runInContext(`
${native.magnetFull}
const te={itemTextures:new Map(),iconTextures:new Map()},Oe=[{color:123}],fj=1,wu=3;
const jS=class extends Pickup {constructor(kind,x,y,value,texture,color){super(kind,x);this.y=y;this.value=value;this.sprite.scale={set(){}};}};
const RO_LU={vis(p){p.visited=true}};
class DropGame extends Game {constructor(){super();this.deterministic=false;this.gemTextures={magnet:'magnet',gem_blue:'gem',chest:'chest',zeny:'zeny'};this.entityLayer={addChild(){}};this.stats.zenyMult=1;}${native.dropPickup}}
globalThis.DropGame=DropGame;`,context);
{
 const g=new context.DropGame();api.installMagnetLimitOption(g);
 for(let i=0;i<5;i++)g.dropPickup('magnet',i,2,0);
 assert.equal(g.pickups.length,3,'default retains the native three-live-magnet cap');
 api.setUnlimited(true);
 for(let i=0;i<5;i++)g.dropPickup('magnet',i,2,0);
 assert.equal(g.pickups.length,8);assert(g.pickups.every(p=>p.kind==='magnet'&&p.visited));
 assert.equal(g.deterministic,false,'real game replay flag must never change');
 g.dropPickup('gem_blue',3,4,9);assert.equal(g.pickups.at(-1).value,9);assert.equal(g.pickups.at(-1).kind,'gem_blue');
 api.setUnlimited(false);g.dropPickup('magnet',0,0,0);assert.equal(g.pickups.length,9);
 for(const p of g.pickups)p.dead=true;g.dropPickup('magnet',0,0,0);assert.equal(g.pickups.length,10,'dead magnets do not count');
 const unknown={dropPickup(kind){this.called=kind;}};const original=unknown.dropPickup;api.installMagnetLimitOption(unknown);assert.equal(unknown.dropPickup,original,'unknown versions remain untouched');
}
console.log('Magnet limit: default cap, opt-in unlimited, toggle restoration and native pickup types passed');
{
 const {parseHTML}=require('linkedom');const {window}=parseHTML('<html><body><label><input id="lu-p-hide"></label></body></html>');const document=window.document;
 const callbacks=new Map(),saved=new Map();let frameId=0;
 window.requestAnimationFrame=fn=>{callbacks.set(++frameId,fn);return frameId;};window.cancelAnimationFrame=id=>callbacks.delete(id);
 const ctx=vm.createContext({window,document,activeGame:null,notify(){},localStorage:{getItem:key=>key==='greydust.ro.optimize-hidden-pickups.v1'?'false':null,setItem:(key,value)=>saved.set(key,value)},element:(tag,text)=>{const node=document.createElement(tag);node.textContent=text;return node;}});
 vm.runInContext(fs.readFileSync('src/weather.js','utf8')+fs.readFileSync('src/pickups.js','utf8')+';globalThis.ui={updatePickupOptions,updateFpsDisplay,pickupDiagnostics};',ctx);
 ctx.ui.updatePickupOptions();ctx.ui.updatePickupOptions();
 assert.equal(document.querySelectorAll('[data-ro-pickup-option="show-fps"]').length,1);
 assert.equal(document.querySelector('[data-ro-pickup-option="magnet-chests"]'),null);assert.equal(document.querySelector('[data-ro-pickup-option="hidden-pickup-fx"]'),null);assert.equal(ctx.ui.pickupDiagnostics().optimizeHiddenPickups,true,'old disabled setting cannot disable optimization');
 const weather=document.querySelector('[data-ro-pickup-option="hide-weather"]');assert(weather);weather.checked=true;weather.onchange();assert.equal(saved.get('greydust.ro.hide-battle-weather.v1'),'true');
 const option=document.querySelector('[data-ro-pickup-option="show-fps"]');option.checked=true;option.onchange();assert.equal(saved.get('greydust.ro.show-fps.v1'),'true');
 const game={state:'playing'};ctx.ui.updateFpsDisplay(game);ctx.ui.updateFpsDisplay(game);assert.equal(callbacks.size,1,'one animation sampler');
 const frame=now=>{const [id,fn]=callbacks.entries().next().value;callbacks.delete(id);fn(now);};
 frame(0);for(let i=1;i<=30;i++)frame(i*1000/60);
 const label=document.querySelector('#ro-fps');assert.equal(label.textContent,'FPS 60');assert(label.style.cssText.includes('left:'));assert(label.style.cssText.includes('pointer-events:none'));
 game.state='paused';frame(600);assert(label.hidden);game.state='playing';frame(700);assert(!label.hidden);assert.equal(callbacks.size,1);
 option.checked=false;option.onchange();assert.equal(document.querySelector('#ro-fps'),null);assert.equal(callbacks.size,0);
 console.log('FPS option: persisted, left aligned, noninteractive, averaged, pause aware and stopped when disabled');
}
vm.runInContext(`
const DP=${native.mergeConstants.gemThreshold},pv=${native.mergeConstants.gemRadius},dj=1,cj=.1;
${native.gemCount}${native.mergeMeat}
class MergeGame extends Game {constructor(){super();this.time=0;this.stats.maxHp=100;}dropPickup(kind,x,y,value){const p=new Pickup(kind,x);p.y=y;p.value=value;this.pickups.push(p);}${native.dropGem}${native.dropMeat}}
globalThis.MergeGame=MergeGame;`,context);
for(const patched of [false,true]){
 const g=new context.MergeGame();if(patched)api.installPickupHelpers(g);
 for(let i=0;i<351;i++)g.dropGem(i*100,0,1);
 assert.equal(g.pickups.length,351,'gem threshold is strictly greater than 350');
 g.dropGem(0,0,7);assert.equal(g.pickups.length,351);assert.equal(g.pickups[0].value,8,'new nearby XP adds to existing value');
 g.dropGem(-10000,0,9);assert.equal(g.pickups.filter(p=>!p.dead).length,351,'distant XP replaces the farthest live gem');
 assert.equal(g.pickups.filter(p=>!p.dead).reduce((sum,p)=>sum+p.value,0),367,'all XP retained');
 const h=new context.MergeGame();if(patched)api.installPickupHelpers(h);
 for(let i=0;i<60;i++)h.dropMeat(i*100,0);assert.equal(h.pickups.length,60);
 h.dropMeat(0,0);assert.equal(h.pickups.length,60);assert.equal(h.pickups[0].value,20);
 assert.equal(h.pickups.reduce((sum,p)=>sum+p.value,0),610,'all healing value retained');
 const full=new context.MergeGame();full.pickups=Array.from({length:1000},(_,i)=>new t.Pickup('gem_blue',i));if(patched)api.installPickupHelpers(full);full.dropGem(0,0,1);assert.equal(full.pickups.filter(p=>!p.dead).length,1000,'merging new drops does not compact an existing pile');
}
console.log('Current native merging with/without helper: XP >350, healing >=60, retained values and no retroactive compaction passed');
