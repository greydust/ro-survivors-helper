const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{parseHTML}=require('linkedom');
const native=JSON.parse(fs.readFileSync('tests/fixtures/battle-preferences-native.json','utf8'));
function setup(saved={}){
 const {window}=parseHTML('<html><head></head><body><div id="timer-box"></div><div id="opt-body"><div class="opt-row"><input data-pct="fxOpacity"></div></div></body></html>');
 const storage=new Map(Object.entries(saved));let now=0;
 const ctx=vm.createContext({window,document:window.document,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},notify(){},Date,performance:{now:()=>now},console,Math});
 vm.runInContext(fs.readFileSync('src/battle-preferences.js','utf8')+`;globalThis.api={speed:installSpeedPreference,visuals:installBattleVisualPreferences,init:initializeBattleSettings,ui:updateBattlePreferenceOptions,setOpacity:value=>effectOpacity=value};
 globalThis.settings={fxOpacity:.5,fxQuality:'high',damageNumbers:true,resolution:'high'};
 globalThis.options=function(t){Object.assign(settings,t);if(t.fxQuality||t.resolution){}localStorage.setItem('settings',JSON.stringify(settings));};`,ctx);
 return {ctx,api:ctx.api,window,storage,time:n=>now+=n};
}
{
 const e=setup();vm.runInContext(`window.__RO_SPD=(${native.speedClient})({step:1/60,monWin:3000,monBad:2,minSpeed:1.5,minFps:10,key:'v',store:'native-speed',keep:20,txt:{title:'speed',slow:'slow {x}'},css:''},()=>false);`,e.ctx);
 const api=e.window.__RO_SPD,g={state:'playing',ticks:0,events:{onAnnounce(){}}};e.api.speed();assert.equal(api.k(g,null,16,1),1);
 e.window.document.querySelector('#spd-btn').onclick({stopPropagation(){}});assert.equal(api.k(g,null,16,1),2);assert.equal(e.storage.get('greydust.ro.battle-speed-2x.v1'),'true');
 const next={...g};api.reg();assert.equal(api.k(next,null,25,1),2);assert.equal(api.state().cur,25,'restored 2x time counted exactly once');assert.equal(next.roSpd,2);
 const coop={...g,coop:{}};assert.equal(api.k(coop,{},16,1),1);assert.equal(coop.roSpd,1);assert.equal(e.storage.get('greydust.ro.battle-speed-2x.v1'),'true','unsupported modes do not erase preference');
 assert.equal(api.k({...g},null,16,4),4,'native endless multiplier preserved');assert.equal(api.k({...g,isStory:true},null,16,1),1);
 api.k(next,null,16,1);e.window.document.querySelector('#spd-btn').onclick({stopPropagation(){}});api.k(next,null,16,1);assert.equal(e.storage.get('greydust.ro.battle-speed-2x.v1'),'false');assert.equal(api.k({...g},null,16,1),1);
}
function scene(){const s={children:[],add(...nodes){for(const n of nodes){this.children.push(n);n.parent=this;}return this;},remove(...nodes){this.children=this.children.filter(n=>!nodes.includes(n));for(const n of nodes)n.parent=null;return this;}};return s;}
function node(){return {alpha:.8,visible:true,children:[]};}
function mesh(){return {visible:true,material:{onBeforeCompile(){},customProgramCacheKey(){return 'native';}},traverse(fn){fn(this);}};}
{
 const e=setup();e.api.init({settings:e.ctx.settings,options:e.ctx.options});assert.equal(e.ctx.settings.fxOpacity,1);e.api.ui();e.api.ui();
 const rows=e.window.document.querySelectorAll('[data-ro-effect-opacity]');assert.equal(rows.length,3);assert(e.window.document.querySelector('input[data-pct]').closest('.opt-row').hidden);
 const nativeInput=e.window.document.querySelector('input[data-pct]'),nativeRow=nativeInput.closest('.opt-row');
 assert.equal(nativeRow.style.display,'none');assert.equal(nativeInput.disabled,true);
 nativeRow.style.setProperty('display','flex','important');e.api.ui();assert.equal(nativeRow.style.display,'none','native layout cannot reveal the old row');
 e.window.document.querySelector('#opt-body').innerHTML='<div class="opt-row" style="display:flex!important"><input data-pct="fxOpacity"></div>';
 e.api.ui();e.api.ui();assert.equal(e.window.document.querySelectorAll('[data-ro-effect-opacity]').length,3,'tab redraw recreates only three controls');
 assert.equal(e.window.document.querySelector('input[data-pct]').closest('.opt-row').style.display,'none');assert(e.window.document.querySelector('input[data-pct]').disabled);
 const input=e.window.document.querySelector('[data-ro-effect-opacity="enemy"] input');assert.equal(input.min,'0');assert.equal(input.value,'50');input.value='0';input.oninput();assert.equal(JSON.parse(e.storage.get('greydust.ro.effect-opacity.v1')).enemy,0);
 const e2=setup({'greydust.ro.effect-opacity.v1':e.storage.get('greydust.ro.effect-opacity.v1')});e2.api.init({settings:e2.ctx.settings,options:e2.ctx.options});e2.api.ui();assert.equal(e2.window.document.querySelector('[data-ro-effect-opacity="enemy"] input').value,'0');
 let scheduled=[],updates=0,hits=0,drawn=[];const world={scene:scene(),cylinders:[],addBeam(){const n=mesh();this.scene.add(n);return n;},add3D(x,y,effect){this.scene.add(effect.mesh);this.cylinders.push(effect);},renderer:{render(){drawn.push(world.scene.children.filter(n=>n.visible).length);for(const n of world.scene.children){const shader={uniforms:{},fragmentShader:'void main(){gl_FragColor=vec4(1.0);}'};n.material.onBeforeCompile(shader);n.shader=shader;}return 42;}}};
 const g={player:{},fx:[],projectiles:[],weapons:[],fxLayer:{alpha:1,children:[],addChild(n){this.children.push(n);}},world3d:world,
  schedule(delay,cb){scheduled.push(cb);},addFx(e){this.fx.push(e);this.fxLayer.addChild(e.view);return e;},addProjectile(p){this.projectiles.push(p);this.fxLayer.addChild(p.view);},
  updateEnemies(callback){callback();},dropPickup(){return world.addBeam();},app:{renderer:{render(){drawn.push(g.fxLayer.children.map(n=>n.alpha));return 7;}}},coop:{mates:new Map()}};
 e.api.visuals(g);e.api.setOpacity({enemy:0,teammate:.25,self:.5});
 const enemy={view:node(),update(){updates++;hits++;g.addFx({view:node(),update(){}});return false;}},self={view:node(),update(){updates++;return false;}},ally={view:node(),update(){updates++;return false;}};
 let enemyMesh,loot;g.updateEnemies(()=>{g.addFx(enemy);g.schedule(1,()=>{enemyMesh=mesh();world.add3D(0,0,{mesh:enemyMesh,update(){updates++;return false;}});});loot=g.dropPickup();});
 g.addFx(self);const mate={ghost:{play(){g.addFx(ally);}}};g.coop.mates.set(1,mate);e.api.visuals(g);mate.ghost.play();scheduled[0]();
 for(const effect of [...g.fx])effect.update(16);assert.equal(hits,1);assert.equal(updates,3);
 assert.equal(g.app.renderer.render(),7);const alphas=drawn.pop();assert.deepEqual(alphas,[0,.4,.2,0]);assert.equal(enemy.view.alpha,.8);assert.equal(self.view.alpha,.8);
 assert.equal(world.renderer.render(),42);assert.equal(drawn.pop(),1,'loot beam remains visible, enemy mesh hidden only during drawing');assert.equal(enemyMesh.visible,true);assert.equal(loot.visible,true);
 assert.equal(enemyMesh.shader.uniforms.roEffectOpacity.value,0);assert(enemyMesh.shader.fragmentShader.includes('gl_FragColor.a *= roEffectOpacity'));
 e.api.setOpacity({enemy:1,teammate:0,self:1});g.app.renderer.render();assert.deepEqual(drawn.pop(),[.8,.8,0,.8]);world.renderer.render();assert.equal(drawn.pop(),2);assert.equal(enemyMesh.shader.uniforms.roEffectOpacity.value,1);
}
{
 const e=setup();e.api.init({settings:e.ctx.settings,options:e.ctx.options});e.api.setOpacity({enemy:1,teammate:1,self:0});
 const world={scene:scene(),heightAt:()=>0,renderer:{render(){return world.scene.children.filter(node=>node.visible).map(node=>node.name);}}};
 const game={player:{},weapons:[],fx:[],projectiles:[],world3d:world,fxLayer:{children:[],addChild(n){this.children.push(n);}},app:{renderer:{render(){return game.fxLayer.children.map(n=>n.alpha);}}},addFx(effect){this.fx.push(effect);this.fxLayer.addChild(effect.view);},addProjectile(p){this.projectiles.push(p);this.fxLayer.addChild(p.view);}};
 e.ctx.g=game;e.ctx.makeMesh=name=>{const n=mesh();n.name=name;world.scene.add(n);return n;};e.ctx.makeView=node;
 vm.runInContext(`
 class F {constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}set(x,y,z){Object.assign(this,{x,y,z});return this;}clone(){return new F(this.x,this.y,this.z);}}
 class qp {constructor(g){this.view=makeView();this.group=makeMesh('flash');this.ring=makeMesh('ring');this.points=makeMesh('particles');this.updates=0;}update(){this.updates++;return false;}}
 class BowModel {constructor(){this.g=g;this.size=1;this.started=false;this.last=null;this.dir=new F;this.mat={uniforms:{alpha:{value:0}}};this.mesh={position:{copy(){return this},addScaledVector(){return this}},quaternion:{setFromUnitVectors(){}}};}${native.bowModelUpdate}}
 globalThis.BowModel=BowModel;`,e.ctx);
 e.api.visuals(game);
 for(const ghost of [false,true]){
  const model=new e.ctx.BowModel(),projectile={view:node(),model,ghost,hitFx(){return {view:node(),update(){return false;}};}};
  game.addProjectile(projectile);const before=world.scene.children.length;
  assert.equal(model.update(10,20,0,.016,1),undefined,'native arrow update return preserved');assert.equal(model.mat.uniforms.alpha.value,1,'native animation still advances');
  assert.equal(world.scene.children.length-before,3);const visible=world.renderer.render();
  assert.equal(visible.length,ghost?3:0,'late muzzle flash/ring/particles inherit projectile owner');
  for(const effect of game.fx)effect.update(.016);assert(game.fx.filter(effect=>'updates' in effect).every(effect=>effect.updates>0),'0% does not skip native effect updates');
  const hit=projectile.hitFx();game.addFx(hit);const alphas=game.app.renderer.render();assert.equal(alphas.at(-1),ghost?.8:0,'returned ghost hit keeps teammate owner outside callback');
 }
 e.api.setOpacity({enemy:1,teammate:1,self:1});assert.equal(world.renderer.render().length,6,'100% restores existing self attack effects');assert(world.scene.children.every(n=>n.visible),'render-only hiding always restored');
}
{
 const e=setup();e.api.init({settings:e.ctx.settings,options:e.ctx.options});e.api.setOpacity({enemy:1,teammate:1,self:0});
 vm.runInContext(`
 const x=(object,key,value)=>object[key]=value;
 class ue {constructor(){this.alpha=1;this.visible=true;this.children=[];this.position={set(){}};this.scale={set(){}};}addChild(child){this.children.push(child);return child;}}
 const $a=key=>key,$n=()=>({alpha:1,anchor:{set(){}},position:{set(){}}});
 const ri=(effect,lift)=>(effect.lift=lift,effect);
 ${native.timedEffect}${native.meleeHitEffect}
 globalThis.createMelee=Dt;`,e.ctx);
 let during=null;
 const game={player:{},fx:[],weapons:[],projectiles:[],world3d:{},fxLayer:{children:[],addChild(node){this.children.push(node);}},addFx(effect){this.fx.push(effect);this.fxLayer.addChild(effect.view);},app:{renderer:{render(){during=game.fxLayer.children.map(n=>({visible:n.visible,alpha:n.alpha}));}}}};
 e.api.visuals(game);const effect=e.ctx.createMelee(0,0);game.addFx(effect);
 const initial=effect.view.children[0].alpha;effect.update(16);assert.equal(effect.t,16);assert.notEqual(effect.view.children[0].alpha,initial,'native melee animation advances at 0%');
 game.app.renderer.render();assert.equal(during[0].visible,false,'0% explicitly excludes melee hit sparks from render traversal');assert.equal(during[0].alpha,0);
 assert.equal(effect.view.visible,true);assert.equal(effect.view.alpha,1,'render restores native state for following updates');
 e.api.setOpacity({enemy:1,teammate:1,self:.5});game.app.renderer.render();assert.equal(during[0].visible,true);assert.equal(during[0].alpha,.5);assert.equal(effect.view.alpha,1);
}
for(const [skill,colors] of [['lokis_veil',[10123992,6965936,13150463]],['volcano',[16742960,16756800,13122074]]]){
 const e=setup();e.api.init({settings:e.ctx.settings,options:e.ctx.options});e.api.setOpacity({enemy:1,teammate:1,self:0});
 const scheduled=[],ground=[],hits=[];let visible2D,visible3D;
 const world={scene:scene(),cylinders:[],addGroundSprite(){const sprite={alpha:1,visible:true,mesh:mesh(),dispose(){this.disposed=true;}};ground.push(sprite);this.scene.add(sprite.mesh);return sprite;},renderer:{render(){visible3D=world.scene.children.filter(n=>n.visible);}}};
 const layer={children:[],addChild(n){this.children.push(n);n.parent=this;return n;},addChildAt(n,index){this.children.splice(index,0,n);n.parent=this;return n;}};
 const game={player:{x:0,y:0},world3d:world,fxLayer:layer,fx:[],projectiles:[],weapons:[],coop:{mates:new Map()},
  pixelScale:()=>1,screenPos:(x,y)=>({x,y}),groundSprite(texture){return world.addGroundSprite(texture);},enemiesInRadius:()=>['enemy'],
  addFx(effect){this.fx.push(effect);this.fxLayer.addChild(effect.view);},schedule(t,fn){scheduled.push({t,fn});},updateEnemies(fn){fn();},
  app:{renderer:{render(){visible2D=layer.children.filter(n=>n.visible&&!n.destroyed);}}}};
 e.ctx.game=game;e.ctx.colors=colors;e.ctx.recordHit=(enemies,inside)=>hits.push({enemies,inside});
 vm.runInContext(`
 class ue {constructor(){this.alpha=1;this.visible=true;this.children=[];}}
 class ea extends ue {clear(){this.clears=(this.clears||0)+1;return this;}circle(){return this;}fill(){return this;}destroy(){this.destroyed=true;}}
 const vr=()=>({}),Qa=Math.hypot;
 ${native.groundParticles}${native.groundRing}${native.groundField}
 globalThis.createField=()=>Sr(game,0,0,150,8,.5,colors,recordHit);
 `,e.ctx);
 const weapon={fire:()=>e.ctx.createField()};game.weapons.push(weapon);const ghost={play:()=>e.ctx.createField()};game.coop.mates.set(1,{ghost});
 e.api.visuals(game);weapon.fire();ghost.play();game.updateEnemies(()=>e.ctx.createField());
 assert.equal(ground.length,3);assert.equal(scheduled.length,48);
 for(const effect of game.fx)effect.update(16);
 const particleNodes=layer.children.filter(n=>n.clears);assert.equal(particleNodes.length,3);assert(particleNodes.every(n=>n.clears===1));
 game.app.renderer.render();world.renderer.render();assert.equal(visible2D.filter(n=>n.clears).length,2,skill+' self particles inserted at index 0 are culled');assert.equal(visible3D.length,2,skill+' self ground ring is culled');
 assert(particleNodes.every(n=>n.visible),'render restores visibility before native updates');
 e.api.setOpacity({enemy:0,teammate:0,self:.5});game.app.renderer.render();world.renderer.render();assert.equal(visible2D.filter(n=>n.clears).length,1);assert.equal(visible3D.length,1);
 for(const task of scheduled)task.fn();assert.equal(hits.length,48,skill+' all damage/status ticks still execute');assert(hits.every(hit=>hit.inside&&hit.enemies[0]==='enemy'));
 for(const effect of game.fx)assert.equal(effect.update(8001),true,skill+' native lifetime still expires');assert(ground.every(n=>n.disposed));assert(particleNodes.every(n=>n.destroyed));
}
console.log('Battle preferences: native persistent ground fields, addChildAt ownership, expiry/damage ticks, melee/arrow FX and zero culling passed');
