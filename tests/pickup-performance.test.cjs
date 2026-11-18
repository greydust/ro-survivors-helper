const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const native=JSON.parse(fs.readFileSync('tests/fixtures/pickup-performance-native.json','utf8'));
const ctx=vm.createContext({localStorage:{getItem:()=>null},activeGame:null,c:x=>x,RO_LU:{block:()=>false}});
// Execute the current native pickup and magnet methods with and without the visual helpers.
vm.runInContext(fs.readFileSync('src/weather.js','utf8')+fs.readFileSync('src/pickups.js','utf8')+native.chestMagnet+`
globalThis.Game=class {constructor(){this.pickups=[];this.player={x:0,y:0,dead:false};this.stats={pickupRadius:40};this.chestMsgCd=0;this.state='playing';this.world3d={setBeam(){},removeBeam(){}};this.events={onLoot(){}};this.xp=0;this.opened=0;}buffValue(){return 0}collect(p){this.xp+=p.value||0;}tryOpenChest(p){this.opened++;p.dead=true;}chestCost(){return 50;}${native.vacuum}${native.updatePickups}${native.replicaPickups}${native.sweepPickups}};
globalThis.tr=Math.pow;globalThis.O={play(){}};globalThis.patchWorld=patchPickupWorld;globalThis.installHelpers=installPickupHelpers;globalThis.metrics=pickupMetrics;
`,ctx);
function pickup(kind,x,value=7){return {kind,x,y:-20,value,view:{visible:true,destroy(){this.destroyed=true;}},update(){}};}
for(const replica of [null,false,true])for(const cache of [false,true]){
 const g=new ctx.Game(),taken=[],rolled=[];if(cache){const descriptor=Object.getOwnPropertyDescriptor(g,'pickups'),update=g.updatePickups,replicaUpdate=g.replicaPickups,vacuum=g.vacuum;ctx.installHelpers(g);assert.deepEqual(Object.getOwnPropertyDescriptor(g,'pickups'),descriptor,'visual helpers leave the pickup property untouched');assert.equal(g.updatePickups,update);assert.equal(g.replicaPickups,replicaUpdate);assert.equal(g.vacuum,vacuum);}
 if(replica)g.coop={replica:true,take:p=>taken.push(p.kind)};
 else if(replica===false)g.coop={lootRoll:(...args)=>rolled.push(args)};
 g.pickups=[pickup('gem_blue',0),pickup('loot',0),pickup('chest',0),pickup('gem_blue',1000),pickup('meat',1000)];
 g.updatePickups(.1);
 if(replica){assert.deepEqual(taken,['gem_blue','loot','chest']);assert.equal(g.xp,0);}
 else {assert.equal(g.xp,replica===false?7:14);assert.equal(rolled.length,replica===false?1:0);assert.equal(g.opened,1);assert.equal(g.pickups.length,2);}
 g.vacuum();const far=g.pickups.find(p=>p.kind==='gem_blue'&&p.x===1000),meat=g.pickups.find(p=>p.kind==='meat');
 assert(far.magnet);assert(!meat.magnet);const x=far.x;g.updatePickups(.1);assert(far.x<x,'magnet movement preserved');
 const chest=pickup('chest',1000);g.pickups.push(chest);g.vacuum();assert(chest.hzPull,'official magnet includes chests');g.updatePickups(.1);assert(chest.x<1000,'vacuumed chest moves normally');
}
vm.runInContext(`globalThis.World=class {constructor(){this.samples=0;this.map={heights:[]};this.hScale=1;}heightAt(){return ++this.samples;}setBeam(e,a,o){e.group.position.set(a,this.heightAt(a,o),o)}}`,ctx);
const world=new ctx.World(),beam={group:{visible:true,position:{x:0,y:0,z:0,set(x,y,z){Object.assign(this,{x,y,z});}}}};
ctx.patchWorld(world);world.setBeam(beam,10,20);for(let i=0;i<10000;i++)world.setBeam(beam,10,20);assert.equal(world.samples,1);
for(const change of [()=>beam.group.position.x++,()=>world.hScale++,()=>world.map.heights=[],()=>world.map={heights:[]},()=>world.altar={},()=>beam.group.visible=false]){
 change();world.setBeam(beam,10,20);
}
beam.group.visible=true;world.altar=null;const samples=world.samples;world.setBeam(beam,10,20);assert.equal(world.samples,samples+1,'reshow resamples terrain');world.setBeam(beam,11,20);assert.equal(world.samples,samples+2,'moving beam follows pickup');
assert.equal(ctx.metrics.stationaryBeamPositionsSkipped,10000);
console.log('Current native pickup flow: host/replica collection, loot rolls, chests, magnet movement; 10,000 stationary height samples avoided');
