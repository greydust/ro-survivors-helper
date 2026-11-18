const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{parseHTML}=require('linkedom');
function setup(){
 const {window}=parseHTML('<html><body><label><input data-ro-pickup-option="show-fps"></label></body></html>');
 let now=0,id=0;const timers=new Map(),frames=new Map(),runtime={};
 const ctx=vm.createContext({window,document:window.document,activeGame:null,runtimeKey:'runtime',performance:{now:()=>now},
  setTimeout:(fn,delay)=>{timers.set(++id,{fn,at:now+delay});return id;},clearTimeout:key=>timers.delete(key),cost:n=>now+=n});
 window.runtime=runtime;window.requestAnimationFrame=fn=>{frames.set(++id,fn);return id;};window.cancelAnimationFrame=key=>frames.delete(key);
 vm.runInContext(fs.readFileSync('src/performance.js','utf8')+`;globalThis.api={start:startPerformanceMeasurement,stop:stopPerformanceMeasurement,state:performanceMeasurementState,ui:updatePerformanceOption,open:openPerformanceReport};
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
console.log('Performance profiler: exclusive/inclusive timings, bounded samples, native returns/errors, restoration, automatic stop, new skills and report UI passed');
