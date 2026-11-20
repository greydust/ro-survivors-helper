const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{parseHTML}=require('linkedom');
function setup(){
 const {window}=parseHTML('<html><body><label><input data-ro-pickup-option="show-fps"></label></body></html>');
 let now=0,id=0;const timers=new Map(),frames=new Map(),runtime={};
 const ctx=vm.createContext({window,document:window.document,activeGame:null,runtimeKey:'runtime',performance:{now:()=>now},
  setTimeout:(fn,delay)=>{timers.set(++id,{fn,at:now+delay});return id;},clearTimeout:key=>timers.delete(key),cost:n=>now+=n});
 window.runtime=runtime;window.requestAnimationFrame=fn=>{frames.set(++id,fn);return id;};window.cancelAnimationFrame=key=>frames.delete(key);
 vm.runInContext(fs.readFileSync('src/pickups.js','utf8')+fs.readFileSync('src/performance.js','utf8')+`;globalThis.api={start:startPerformanceMeasurement,stop:stopPerformanceMeasurement,state:performanceMeasurementState,ui:updatePerformanceOption,open:openPerformanceReport};
 class Game {constructor(){this.state='playing';this.weapons=[{update(){cost(3);return 9}}];this.pickups=[];this.enemies=[];this.projectiles=[];this.fx=[];this.numbers=[];this.world3d={render(){cost(8);return 'rendered'}};}
 step(delta){if(this.state!=='playing')return 'paused';this.rebuildGrid();this.updateEnemies();for(const w of this.weapons)w.update();this.updateProjectiles();this.updateFxList();this.updatePickups(delta);cost(7);return delta;}
 rebuildGrid(){cost(1)}updateEnemies(){this.updateProjectiles();cost(2)}updateProjectiles(){cost(4)}updateFxList(){cost(5)}updatePickups(delta){this.received=delta;cost(6);return this;}}
 globalThis.Game=Game;`,ctx);
 return {ctx,api:ctx.api,window,runtime,timers,frames,advance:n=>now+=n,runDue(){for(const [key,timer] of [...timers])if(timer.at<=now){timers.delete(key);timer.fn();}}};
}
{
 const e=setup();assert.equal(e.api.start().ok,false);const g=new e.ctx.Game();e.ctx.activeGame=g;
 const original={step:g.step,pickups:g.updatePickups,weapon:g.weapons[0].update,render:g.world3d.render};
 g.state='paused';assert.equal(e.api.start(15).ok,true);assert.equal(e.api.start().ok,false);assert.equal(g.step(.016),'paused');assert.equal(e.api.state().phase,'waiting');
 g.state='playing';assert.equal(g.step(.016),.016);assert.equal(g.received,.016);assert.equal(g.world3d.render(),'rendered');
 const report=e.api.stop(),by=key=>report.categories.find(row=>row.key===key);
 assert.equal(report.gameSteps,1);assert.equal(report.methods.find(row=>row.name==='step').totalMs,32);
 assert.equal(by('enemies').selfMs,2);assert.equal(by('effects').selfMs,8);assert.equal(by('pickups').selfMs,6);assert.equal(by('skills').selfMs,3);assert.equal(by('other').selfMs,7);
 assert.equal(by('render').selfMs,8);assert.equal(by('render').percentOfGameStep,null);
 assert.equal(report.categories.filter(row=>row.key!=='render').reduce((sum,row)=>sum+row.selfMs,0),32,'exclusive categories add to step total');
 assert.equal(report.methods.find(row=>row.name==='updateEnemies').p95Ms,6,'inclusive method timing retains nested effects');
 assert.equal(g.step,original.step);assert.equal(g.updatePickups,original.pickups);assert.equal(g.weapons[0].update,original.weapon);assert.equal(g.world3d.render,original.render);assert.equal(Object.hasOwn(g,'step'),false);
 assert.equal(e.frames.size,0);assert.equal(e.timers.size,0);assert.equal(e.runtime.profile.report(),report);
}
{
 const e=setup(),g=new e.ctx.Game();e.ctx.activeGame=g;
 const error=Error('native error'),original=function(){throw error;};g.updatePickups=original;
 e.api.start(1);assert.throws(()=>g.step(.1),thrown=>thrown===error,'native exception preserved');
 e.advance(1000);e.runDue();assert.equal(e.api.state().phase,'idle');assert.equal(g.updatePickups,original);assert.equal(e.runtime.profile.report().reason,'completed');
}
{
 const e=setup(),g=new e.ctx.Game();e.ctx.activeGame=g;e.api.start();g.step(.01);
 g.weapons.push({update(){e.ctx.cost(1)}});g.step(.01);
 const replacement=()=>42;g.updateEnemies=replacement;
 const report=e.api.stop();assert.equal(g.updateEnemies,replacement,'stop preserves methods replaced by someone else');assert.equal(report.methods.filter(row=>row.category==='skills').length,2,'new skills observed next step');
 e.api.start();for(let i=0;i<4200;i++)g.updatePickups(.1);const bounded=e.api.stop();assert.equal(bounded.methods.find(row=>row.name==='updatePickups').sampleCount,4096);
}
{
 const e=setup(),g=new e.ctx.Game();e.ctx.activeGame=g;Object.defineProperty(g,'step',{configurable:false,value:g.step});assert.equal(e.api.start().ok,false);assert.equal(e.api.state().phase,'idle');
 const h=new e.ctx.Game();e.ctx.activeGame=h;h.state='paused';e.api.start();e.advance(120000);e.runDue();assert.equal(e.runtime.profile.report().gameSteps,0);assert.equal(e.runtime.profile.report().reason,'no-playing-scene');
}
{
 const e=setup(),g=new e.ctx.Game();e.ctx.activeGame=g;e.api.ui();e.api.ui();const d=e.window.document;
 assert.equal(d.querySelectorAll('#ro-performance-start').length,1);d.querySelector('#ro-performance-start').onclick();g.step(.01);e.api.stop();
 e.api.open();assert(d.querySelector('textarea').value.includes('msPerGameStep'));assert(d.querySelector('pre').textContent.includes('拾取更新'));e.api.open();assert.equal(d.querySelectorAll('#ro-performance-report').length,1);
}
{
 const e=setup(),g=new e.ctx.Game();e.ctx.activeGame=g;
 const native=JSON.parse(fs.readFileSync('tests/fixtures/projectile-performance-native.json','utf8'));
 vm.runInContext(`globalThis.NativeProjectileGame=class {${native.updateProjectiles}};globalThis.we=Math.hypot;globalThis.js=Math.atan2;globalThis.HZJF={sweep:()=>[]};`,e.ctx);
 g.updateEnemies=()=>{};g.updateProjectiles=e.ctx.NativeProjectileGame.prototype.updateProjectiles;
 const model={update(x,y,angle,delta){assert.equal(this,model);assert.equal(delta,.1);e.ctx.cost(2);return 17;},dispose(){e.ctx.cost(1)}};
 const view={update(delta){assert.equal(this,view);assert.equal(delta,100);e.ctx.cost(3);},destroy(){e.ctx.cost(1)}};
 const projectile=()=>({x:0,y:0,vx:10,vy:0,travel:0,life:.15,maxLife:1,model,view,carried:[]});
 const p=projectile();g.projectiles=[p];const original=model.update;
 e.api.start();g.updateProjectiles(.1,100);assert.equal(p.x,1);assert.equal(p.travel,1);assert.equal(g.projectiles.length,1);
 model.update(0,0,0,.1); // Calls outside updateProjectiles are not part of the split.
 g.updateProjectiles(.1,100);assert.equal(g.projectiles.length,0,'native expiry and cleanup preserved');
 const q=projectile();q.model={update(){e.ctx.cost(4)}};q.view={};g.projectiles.push(q);g.updateProjectiles(.1,100);
 const r=e.api.stop(),b=r.projectileBreakdown;
 assert.equal(b.visualCallbacksMs,14);assert.equal(b.modelUpdateCalls,3);assert.equal(b.viewUpdateCalls,2);assert.equal(b.remainingMs,2);
 assert.equal(b.totalMs,b.visualCallbacksMs+b.remainingMs);assert.equal(b.modelTargets,2);assert.equal(b.unwrappedTargets,0);
 assert.equal(model.update,original);assert.equal(Object.hasOwn(g,'updateProjectiles'),true);
 e.api.open();assert(e.window.document.querySelector('pre').textContent.includes('投射物視覺回呼'));
}
{
 const e=setup(),g=new e.ctx.Game();e.ctx.activeGame=g;
 const model={};Object.defineProperty(model,'update',{configurable:false,value(){e.ctx.cost(2)}});
 g.projectiles=[{model}];g.updateProjectiles=function(){for(const p of this.projectiles)p.model.update();};g.updateEnemies=()=>{};
 e.api.start();g.step(.1);const b=e.api.stop().projectileBreakdown;
 assert.equal(b.unwrappedTargets,1);assert.equal(b.visualCallbacksMs,0);assert.equal(b.remainingMs,2,'unwrapped work stays in remainder');
}
{
 const e=setup(),g=new e.ctx.Game();e.ctx.activeGame=g;
 vm.runInContext(`globalThis.Pickup=class {update(e){this.bob+=e*4,this.view.position.set(this.x,this.y),this.sprite.y=-6+MathSin(this.bob)*3,this.glow&&(this.glow.alpha=.4+.3*MathSin(this.bob*1.5))}};globalThis.MathSin=Math.sin;globalThis.install=installPickupHelpers;`,e.ctx);
 const p=new e.ctx.Pickup();Object.assign(p,{bob:0,x:100,y:100,view:{visible:false,position:{set(){}}},sprite:{}});g.pickups=[p];
 e.ctx.install(g);g.updatePickups=function(delta){for(const item of this.pickups)item.update(delta)};
 p.update(.1);e.api.start();g.step(.1);g.step(.1);const r=e.api.stop().pickupOptimization;
 assert.equal(r.start.current.hidden,1);assert.equal(r.end.current.visualPatched,1);assert.equal(r.end.helpersInstalled,true);
 assert.equal(r.skippedDuringMeasurement.visualCallsSkipped,2,'exclude skips before recording');
 e.api.start();g.step(.1);assert.equal(e.api.stop().pickupOptimization.skippedDuringMeasurement.visualCallsSkipped,1,'second session uses a fresh baseline');
}
{
 const e=setup(),g=new e.ctx.Game();e.ctx.activeGame=g;
 const gem={kind:'gem_blue',view:{visible:false},magnet:true},otherGem={...gem},dead={kind:'meat',dead:true};
 const items=[gem,gem,gem,otherGem,dead,dead,{kind:'__proto__'},{kind:7},null,undefined,42];
 g.pickups=items;g.updatePickups=()=>{};e.api.start();g.step(.1);
 g.pickups.push({kind:'zeny'});const report=e.api.stop(),a=report.pickupOptimization.start.inventory,b=report.pickupOptimization.end.inventory;
 assert.equal(a.entries,11);assert.equal(a.invalidEntries,3);assert.equal(a.live,6);assert.equal(a.dead,2);
 assert.equal(a.uniqueObjects,5);assert.equal(a.uniqueLiveObjects,4);assert.equal(a.duplicateReferences,3);assert.equal(a.repeatedObjects,2);
 const row=a.byKind.find(row=>row.kind==='gem_blue');
 assert.equal(row.entries,4);assert.equal(row.uniqueLiveObjects,2,'equal fields do not imply equal identity');assert.equal(row.duplicateReferences,2);assert.equal(row.repeatedObjects,1);assert.equal(row.hiddenLive,4);assert.equal(row.magnetLive,4);
 assert.equal(a.byKind.find(row=>row.kind==='meat').duplicateReferences,1);assert.equal(a.byKind.find(row=>row.kind==='meat').uniqueLiveObjects,0);
 assert.equal(a.byKind.find(row=>row.kind===null).entries,1);assert.equal(a.byKind.find(row=>row.kind==='__proto__').entries,1);
 assert.equal(a.byKind.reduce((sum,row)=>sum+row.entries,0)+a.invalidEntries,a.entries);
 assert.equal(a.byKind.reduce((sum,row)=>sum+row.uniqueObjects,0),a.uniqueObjects);
 assert.equal(b.entries,12);assert.equal(b.uniqueLiveObjects,5);assert.equal(g.pickups,items);assert.equal(g.pickups[0],g.pickups[2],'diagnosis never deduplicates native data');
 assert.equal(JSON.parse(JSON.stringify(report)).pickupOptimization.end.inventory.entries,12);
 e.api.open();const summary=e.window.document.querySelector('pre').textContent;assert(summary.includes('重複參照 3 筆'));assert(summary.includes('gem_blue: 4 筆'));assert(summary.includes('zeny: 1 筆'));
}

{
 const e=setup(),g=new e.ctx.Game();e.ctx.activeGame=g;
 const native=JSON.parse(fs.readFileSync('tests/fixtures/enemy-performance-native.json','utf8'));
 vm.runInContext(`globalThis.NativeEnemyGame=class {${native.updateEnemies}};globalThis.tr=()=>1;`,e.ctx);
 g.updateEnemies=e.ctx.NativeEnemyGame.prototype.updateEnemies;g.player={};g.time=2;g.bossBrains=new Map();
 g.buildSeparation=function(){e.ctx.cost(2)};g.recycleDistance=()=>100;
 const enemy={dead:true,updateView(t,time){assert.equal(this,enemy);assert.equal(time,2);e.ctx.cost(3);return 7;}};
 g.enemies=[enemy];const original=enemy.updateView;
 e.api.start();g.updateEnemies(.1,100);enemy.updateView(100,2);
 const next={dead:true,updateView(){e.ctx.cost(4)}};g.enemies.push(next);for(let i=0;i<31;i++)g.updateEnemies(.1,100);g.updateEnemies(.1,100);
 const r=e.api.stop(),b=r.enemyBreakdown;
 assert.equal(b.groupsMs.view,10);assert.equal(b.groupsMs.separation,4);assert.equal(b.totalMs,14);
 assert.equal(b.sampling.sampledCalls,2);assert.equal(b.sampling.updateCalls,33);assert.equal(b.remainingMs,0);assert.equal(b.observedEnemies,2);assert.equal(b.viewTargets,2);assert.equal(b.unwrappedTargets,0);
 assert.equal(enemy.updateView,original);assert.equal(Object.hasOwn(g,'buildSeparation'),true);
 e.api.open();assert(e.window.document.querySelector('pre').textContent.includes('怪物更新細分'));
}
{
 const e=setup(),g=new e.ctx.Game();e.ctx.activeGame=g;
 const enemy={};Object.defineProperty(enemy,'updateView',{configurable:false,value(){e.ctx.cost(3)}});
 g.enemies=[enemy,{}];g.walk={resolve(){e.ctx.cost(2)}};g.bossBrains=new Map([[enemy,{update(){g.walk.resolve();e.ctx.cost(1)}}]]);
 g.updateEnemies=function(){this.bossBrains.get(enemy).update();enemy.updateView();this.updateProjectiles();e.ctx.cost(5)};
 e.api.start();g.step(.1);const r=e.api.stop(),b=r.enemyBreakdown;
 assert.equal(b.groupsMs.navigation,2);assert.equal(b.groupsMs.bossAI,1);assert.equal(b.groupsMs.view,0);
 assert.equal(b.remainingMs,8);assert.equal(b.nestedOtherMs,4);assert.equal(b.totalMs,15);
 assert.equal(b.unwrappedTargets,1);assert.equal(b.missingViewTargets,1);
 assert.equal(Object.values(b.groupsMs).reduce((a,b)=>a+b,0)+b.remainingMs+b.nestedOtherMs,b.totalMs);
 assert.equal(r.categories.filter(row=>row.key!=='render').reduce((sum,row)=>sum+row.selfMs,0),r.methods.find(row=>row.name==='step').totalMs);
 assert.equal(Object.hasOwn(g.walk,'resolve'),true);
}

{
 const e=setup(),g=new e.ctx.Game();e.ctx.activeGame=g;
 let scans=0,calls=0;const native=function(){calls++;e.ctx.cost(1);return 42};
 const enemy={updateView:native};const list=[enemy];
 list[Symbol.iterator]=function(){scans++;return Array.prototype[Symbol.iterator].call(this)};
 g.enemies=list;g.updateEnemies=function(){assert.equal(enemy.updateView(),42);return 'native result'};
 e.api.start();for(let i=0;i<65;i++)assert.equal(g.updateEnemies(),'native result');
 assert.equal(enemy.updateView,native,'detail wrappers removed immediately after sampled call');
 const b=e.api.stop().enemyBreakdown;
 assert.equal(calls,65);assert.equal(scans,3,'no enemy census on unsampled updates');
 assert.equal(b.sampling.sampledCalls,3);assert.equal(b.groupsMs.view,3);assert.equal(b.totalMs,3);
 assert.equal(b.observedEnemies,1,'coverage deduplicated across samples');
 const error=Error('enemy failure');g.updateEnemies=function(){throw error};
 // Install the throwing original before a fresh session so its exception is timed.
 e.api.start();assert.throws(()=>g.updateEnemies(),value=>value===error);
 assert.equal(enemy.updateView,native,'exception also removes sampled wrappers');e.api.stop();
}

{
 const e=setup(),g=new e.ctx.Game();e.ctx.activeGame=g;
 const model={update(){e.ctx.cost(2)}};const original=model.update;
 g.projectiles=[{model}];g.updateProjectiles=function(){model.update()};
 g.updateEnemies=function(){this.updateProjectiles()};
 e.api.start();g.updateEnemies();g.updateEnemies();const r=e.api.stop();
 assert.equal(r.projectileBreakdown.modelUpdateCalls,2,'nested projectile wrappers survive enemy sample cleanup');
 assert.equal(model.update,original);assert.equal(r.enemyBreakdown.nestedOtherMs,2);
}


function scopeOf(report,name){return report.detailedSampling.scopes.find(row=>row.scope===name)}
{
 const e=setup(),g=new e.ctx.Game();e.ctx.activeGame=g;
 const fixture=JSON.parse(fs.readFileSync('tests/fixtures/deep-performance-native.json','utf8'));
 vm.runInContext(`globalThis.NativeDeepGame=class {${fixture.updateFxList}${fixture.updatePickups}${fixture.rebuildGrid}};globalThis.tr=x=>x*x;globalThis.RO_LU={block:()=>false};globalThis.$v=(x,y)=>x+','+y;globalThis.Mi=100;`,e.ctx);
 g.updateFxList=e.ctx.NativeDeepGame.prototype.updateFxList;
 let updates=0,destroys=0;const effect={view:{visible:false,destroy(){destroys++;e.ctx.cost(2)}},update(delta){assert.equal(this,effect);assert.equal(delta,10);updates++;e.ctx.cost(3);return updates===17;}};
 const original=effect.update;g.fx=[effect];g.numbers=[];
 e.api.start();for(let i=0;i<17;i++)g.updateFxList(10);
 assert.equal(effect.update,original);assert.equal(g.fx.length,0);assert.equal(destroys,1);
 const r=e.api.stop(),b=scopeOf(r,'updateFxList');assert.equal(b.sampledCalls,1);assert.equal(b.updateCalls,17);
 assert.equal(b.methods.find(row=>row.name==='fx.hidden.update').selfMs,3);assert.equal(b.methods.find(row=>row.name==='fx.hidden.destroy').selfMs,2);
 assert.equal(b.totalMs,5);assert.equal(b.remainingMs,0);
 e.api.open();assert(e.window.document.querySelector('pre').textContent.includes('細部抽樣 updateFxList'));
 // Native pickup collection/movement/removal is preserved while visual/collection work is split.
 g.updatePickups=e.ctx.NativeDeepGame.prototype.updatePickups;g.player={x:0,y:20};g.stats={pickupRadius:100};g.buffValue=()=>0;g.chestMsgCd=0;
 const pickup={kind:'zeny',x:1,y:0,value:2,update(){e.ctx.cost(1)},view:{destroy(){e.ctx.cost(2)}}};
 g.collect=function(item){assert.equal(item,pickup);e.ctx.cost(4)};g.pickups=[];
 e.api.start();for(let i=0;i<24;i++)g.updatePickups(.1);g.pickups.push(pickup);g.updatePickups(.1);
 const p=e.api.stop();assert.equal(g.pickups.length,0);const b2=scopeOf(p,'updatePickups');
 assert.equal(b2.methods.find(row=>row.name==='game.collect').selfMs,4);assert.equal(b2.methods.find(row=>row.name==='pickup.zeny.update').selfMs,1);assert.equal(b2.methods.find(row=>row.name==='pickup.destroy').selfMs,2);
 assert.equal(b2.totalMs,b2.detailedMs+b2.nestedMeasuredMs+b2.remainingMs);
 g.rebuildGrid=e.ctx.NativeDeepGame.prototype.rebuildGrid;g.enemies=[{x:1,y:2},{x:3,y:4},{dead:true,x:0,y:0}];g.grid=new Map();
 e.api.start();for(let i=0;i<5;i++)g.rebuildGrid();const b3=scopeOf(e.api.stop(),'rebuildGrid');
 assert.equal(g.grid.get('0,0').length,2);assert.equal(b3.methods.find(row=>row.name==='grid.get').calls,2);assert.equal(b3.methods.find(row=>row.name==='grid.set').calls,1);
 assert.equal(Object.hasOwn(g.grid,'get'),false,'inherited native map methods restored');
}
{
 const e=setup(),g=new e.ctx.Game();e.ctx.activeGame=g;
 const f=JSON.parse(fs.readFileSync('tests/fixtures/deep-performance-native.json','utf8'));
 vm.runInContext(`globalThis.NativeStepGame=class {${f.step}};globalThis.we=Math.hypot;globalThis.Sd=1;globalThis.ko=(x,a,b)=>Math.max(a,Math.min(b,x));globalThis.rt={move:{x:0,y:0}};globalThis.po={tick:[()=>cost(2)]};`,e.ctx);
 for(const key of ['updateHolyTrails','updateFireRings','updatePulls','updateBastion','updateYggdrasil','updateBuffAuras'])g[key]=()=>{};
 g.step=e.ctx.NativeStepGame.prototype.step;g.app={screen:{width:100,height:100}};g.player={x:0,y:0,dead:false,sprite:{},moving:false,update(){e.ctx.cost(3)}};
 Object.assign(g,{camFocus:null,time:0,ticks:0,scheduled:[],keys:new Set(),touchMove:{x:0,y:0},classDef:{speed:1},stats:{speedMult:1,regen:0,regenStill:0,regenMoving:0,regen5:0},hiddenUntil:0,bounds:{x0:-100,y0:-100,x1:100,y1:100},stillTime:0,regen5Left:10});
 g.buffValue=()=>0;g.updateCamera=()=>e.ctx.cost(1);g.warpSwirls=()=>e.ctx.cost(1);g.flushHeal=()=>e.ctx.cost(1);g.updateMapFires=()=>e.ctx.cost(2);g.spawn=()=>e.ctx.cost(4);
 g.ambient={update(){e.ctx.cost(2)}};g.mapEffects={update(){e.ctx.cost(3)}};g.story={update(){e.ctx.cost(2)}};
 g.walk={resolve(a,b,c,d){e.ctx.cost(1);return[c,d]},updateFlow(){e.ctx.cost(2)},warpAt(){e.ctx.cost(1);return null}};
 e.api.start();for(let i=0;i<9;i++)g.step(.01);const r=e.api.stop(),b=scopeOf(r,'step');
 assert.equal(g.ticks,9);assert.equal(b.sampledCalls,1);assert.equal(b.methods.find(row=>row.name==='player.update').selfMs,3);
 assert.equal(b.methods.find(row=>row.name==='walk.updateFlow').selfMs,2);assert.equal(b.methods.find(row=>row.name==='game.spawn').selfMs,4);
 assert.equal(b.totalMs,b.detailedMs+b.nestedMeasuredMs+b.remainingMs);assert(b.remainingMs>=2,'unhookable tick callbacks remain explicit residual');
 assert.equal(r.categories.filter(row=>row.key!=='render').reduce((sum,row)=>sum+row.selfMs,0),r.methods.find(row=>row.name==='step').totalMs,'deep timing does not change coarse accounting');
}
{
 const e=setup(),g=new e.ctx.Game();e.ctx.activeGame=g;
 g.world3d.walk=function(){this.emit();e.ctx.cost(2)};g.world3d.emit=function(){e.ctx.cost(3)};
 g.world3d.renderer={render(){e.ctx.cost(4)}};g.world3d.render=function(){this.walk();this.renderer.render();e.ctx.cost(1);return 7};
 g.placeOverlay=function(){this.world3d.emit();e.ctx.cost(2)};g.renderWorld=function(){this.placeOverlay();return this.world3d.render()};
 const render=g.world3d.render,overlay=g.placeOverlay;
 e.api.start();for(let i=0;i<29;i++)assert.equal(g.renderWorld(),7);
 const r=e.api.stop(),world=scopeOf(r,'world3d.render'),frame=scopeOf(r,'renderWorld');
 assert.equal(world.sampledCalls,1);assert.equal(world.methods.find(row=>row.name==='world.walk').selfMs,2);
 assert.equal(world.methods.find(row=>row.name==='world.emit').selfMs,3);assert.equal(world.methods.find(row=>row.name==='renderer.render').selfMs,4);assert.equal(world.remainingMs,1);
 assert.equal(frame.methods.find(row=>row.name==='game.placeOverlay').selfMs,5);assert.equal(frame.nestedMeasuredMs,10);assert.equal(frame.totalMs,15);
 assert.equal(g.world3d.render,render);assert.equal(g.placeOverlay,overlay);
 assert.equal(r.categories.find(row=>row.key==='render').selfMs,290,'renderWorld inclusive cost not added to renderer category');
}
{
 const e=setup(),g=new e.ctx.Game();e.ctx.activeGame=g;let calls=0;
 g.fx=Array.from({length:300},()=>({update(){calls++;e.ctx.cost(1)}}));g.updateFxList=function(){for(const item of this.fx)item.update()};
 e.api.start();for(let i=0;i<17;i++)g.updateFxList();const b=scopeOf(e.api.stop(),'updateFxList');
 assert.equal(calls,5100);assert.equal(b.collectionEntries,256);assert.equal(b.collectionEntriesSkipped,44);
 assert.equal(b.methods.find(row=>row.name==='fx.visible.update').calls,256);assert.equal(b.remainingMs,44,'unobserved targets stay in residual');
 g.fx=[{update(){calls++;e.ctx.cost(1)}}];g.updateFxList=function(){for(let i=0;i<3000;i++)this.fx[0].update()};
 e.api.start();for(let i=0;i<17;i++)g.updateFxList();const capped=scopeOf(e.api.stop(),'updateFxList');
 assert.equal(capped.methods[0].calls,2048);assert.equal(capped.budgetSkippedCalls,952);assert.equal(capped.remainingMs,952);
}
{
 const e=setup(),g=new e.ctx.Game();e.ctx.activeGame=g;
 const error=Error('deep callback');const original=function(){throw error};g.fx=[{update:original}];g.updateFxList=function(){this.fx[0].update()};
 e.api.start();for(let i=0;i<17;i++)assert.throws(()=>g.updateFxList(),value=>value===error);
 assert.equal(g.fx[0].update,original,'exception cleans transient details');e.api.stop();
 const replacement=()=>42;g.fx[0].update=function(){this.update=replacement};
 e.api.start();for(let i=0;i<16;i++)assert.equal(e.api.state().phase,'waiting');
 // Use an empty list to reach the sample without replacing the method early.
 const fx=g.fx;g.fx=[];for(let i=0;i<16;i++)assert.throws(()=>g.updateFxList());g.fx=fx;g.updateFxList();
 assert.equal(g.fx[0].update,replacement,'cleanup never overwrites changes made by native callbacks');e.api.stop();
}


{
 const e=setup(),g=new e.ctx.Game();e.ctx.activeGame=g;
 let spawnCalls=0;g.spawn=function(){spawnCalls++;e.ctx.cost(2)};
 g.step=function(){this.spawn();this.updateEnemies();e.ctx.cost(1)};g.updateEnemies=function(){this.spawn();e.ctx.cost(3)};
 e.api.start();for(let i=0;i<9;i++)g.step();const r=e.api.stop(),b=scopeOf(r,'step');
 assert.equal(spawnCalls,18);assert.equal(b.methods.find(row=>row.name==='game.spawn').calls,1,'step hook excludes methods called in enemy scope');
 assert.equal(b.detailedMs,2);assert.equal(b.nestedMeasuredMs,5);assert.equal(b.remainingMs,1);
}
{
 const e=setup(),g=new e.ctx.Game();e.ctx.activeGame=g;
 const fx={};Object.defineProperty(fx,'update',{configurable:false,value(){e.ctx.cost(2)}});
 g.fx=[fx];g.updateFxList=function(){fx.update()};e.api.start();for(let i=0;i<17;i++)g.updateFxList();
 const b=scopeOf(e.api.stop(),'updateFxList');assert.equal(b.unwrappedMethods,1);assert.equal(b.remainingMs,2);assert.equal(b.detailedMs,0);
 // Expensive property installation/restoration is reported separately from callback work.
 let enabled=false;const player=new Proxy({update(){e.ctx.cost(2)}},{defineProperty(target,key,descriptor){if(enabled)e.ctx.cost(1);return Reflect.defineProperty(target,key,descriptor)}});
 g.player=player;g.step=function(){player.update()};e.api.start();enabled=true;for(let i=0;i<9;i++)g.step();
 const b2=scopeOf(e.api.stop(),'step');assert.equal(b2.setupMs,1);assert.equal(b2.restoreMs,1);assert.equal(b2.detailedMs,2);
}


{
 const e=setup(),g=new e.ctx.Game();e.ctx.activeGame=g;
 const f=JSON.parse(fs.readFileSync('tests/fixtures/deep-performance-native.json','utf8'));
 vm.runInContext(`globalThis.NativeWorld=class {${f.render}};globalThis.Ae=class {};`,e.ctx);
 const world=g.world3d;world.render=e.ctx.NativeWorld.prototype.render;
 e.window.innerWidth=100;e.window.innerHeight=100;
 Object.assign(world,{batches:new Map([[1,{count:0,flush(){e.ctx.cost(2)}}]]),ghostBatches:new Map(),shadows:{count:0,flush(){e.ctx.cost(1)}},glows:{count:0,flush(){e.ctx.cost(1)}},scene:{},activeCamera:{},heightAt(){e.ctx.cost(1);return 0},walk(){e.ctx.cost(3)}});
 for(const key of ['updateGroundTheme','pruneBatches','updateCylinders','updateGroundSprites','fadeEffects','pinPrograms'])world[key]=()=>e.ctx.cost(1);
 world.renderer={getSize(){return{x:100,y:100}},render(){e.ctx.cost(4)}};
 const nodes={children:[{visible:true,alpha:1,x:0,y:0,scale:{x:1,y:1}},{visible:false}]};
 e.api.start();for(let i=0;i<29;i++)world.render(nodes);const r=e.api.stop(),b=scopeOf(r,'world3d.render');
 assert.equal(b.sampledCalls,1);assert.equal(b.methods.find(row=>row.name==='world.walk').selfMs,3);
 assert.equal(b.methods.find(row=>row.name==='batches.flush').selfMs,2);assert.equal(b.methods.find(row=>row.name==='renderer.render').selfMs,4);
 assert.equal(b.totalMs,18);assert.equal(b.remainingMs,0);
}


{
 const e=setup(),g=new e.ctx.Game();e.ctx.activeGame=g;
 g.spawn=function(){this.updateEnemies();e.ctx.cost(2)};g.updateEnemies=function(){this.updateProjectiles();e.ctx.cost(3)};
 g.step=function(){this.spawn();e.ctx.cost(1)};
 e.api.start();for(let i=0;i<9;i++)g.step();const r=e.api.stop(),b=scopeOf(r,'step');
 assert.equal(b.methods.find(row=>row.name==='game.spawn').selfMs,2,'nested base grandchildren are subtracted exactly once');
 assert.equal(b.nestedMeasuredMs,7);assert.equal(b.remainingMs,1);assert.equal(b.totalMs,10);
 assert(r.detailedSampling.scopes.every(row=>!row.scope.startsWith('enemy:')&&!row.scope.startsWith('projectile:')),'detail callbacks never start another sample scanner');
}


{
 const e=setup(),g=new e.ctx.Game();e.ctx.activeGame=g;
 const original=function(){};g.pickups=Array.from({length:300},(_,i)=>({kind:i===299?'magnet':'zeny',update:original}));
 g.updatePickups=function(){for(const pickup of this.pickups)pickup.update()};
 e.api.start();for(let i=0;i<57;i++)g.updatePickups();const b=scopeOf(e.api.stop(),'updatePickups');
 assert.equal(b.sampledCalls,2);assert.equal(b.methods.find(row=>row.name==='pickup.magnet.update').calls,1,'rotating array samples eventually cover the tail');
 assert(g.pickups.every(item=>item.update===original));
}

console.log('Performance profiler: timings, native flow, bounded multi-scope sampling, native nested accounting, enemy breakdown, pickup identity/kind census, session deltas, restoration and UI passed');
