  const SPEED_PREFERENCE_KEY='greydust.ro.battle-speed-2x.v1',EFFECT_OPACITY_KEY='greydust.ro.effect-opacity.v1';
  let preferredDoubleSpeed=false,effectOpacity=null,battleSettings=null,battleSetOption=null;
  try{preferredDoubleSpeed=localStorage.getItem(SPEED_PREFERENCE_KEY)==='true';}catch{}
  try{const value=JSON.parse(localStorage.getItem(EFFECT_OPACITY_KEY)||'null');if(value&&['enemy','teammate','self'].every(key=>Number.isFinite(value[key])&&value[key]>=0&&value[key]<=1))effectOpacity=value;}catch{}
  const speedApis=new WeakSet(),battleVisualGames=new WeakMap();
  function installSpeedPreference(){
    const api=window.__RO_SPD;if(!api||speedApis.has(api)||!['k','set','state'].every(key=>typeof api[key]==='function'))return;
    const original=api.k;let lastGame=null;
    api.k=function(game,coop,delta,base,...rest){
      const fresh=game!==lastGame;lastGame=game;
      const result=Reflect.apply(original,this,[game,coop,delta,base,...rest]),state=api.state();
      if(fresh&&state.shown&&base===1&&preferredDoubleSpeed&&!state.on){
        api.set(true);
        // The first native call reset this run to 1x, so it did not count delta.
        return Reflect.apply(original,this,[game,coop,delta,base,...rest]);
      }
      if(state.shown&&base===1&&preferredDoubleSpeed!==!!state.on){preferredDoubleSpeed=!!state.on;try{localStorage.setItem(SPEED_PREFERENCE_KEY,String(preferredDoubleSpeed));}catch{}}
      return result;
    };
    speedApis.add(api);
  }
  function initializeBattleSettings(module){
    battleSettings=Object.values(module||{}).find(value=>value&&typeof value==='object'&&typeof value.fxOpacity==='number'&&typeof value.fxQuality==='string'&&typeof value.damageNumbers==='boolean')||null;
    battleSetOption=Object.values(module||{}).find(value=>typeof value==='function'&&/Object\.assign\(/.test(Function.prototype.toString.call(value))&&/localStorage\.setItem/.test(Function.prototype.toString.call(value))&&/\.fxQuality/.test(Function.prototype.toString.call(value))&&/\.resolution/.test(Function.prototype.toString.call(value)))||null;
    if(battleSettings&&!effectOpacity){const initial=Math.max(0,Math.min(1,battleSettings.fxOpacity));effectOpacity={enemy:initial,teammate:initial,self:initial};saveEffectOpacity();}
    if(battleSettings&&battleSetOption&&battleSettings.fxOpacity!==1)battleSetOption({fxOpacity:1});
  }
  function saveEffectOpacity(){try{localStorage.setItem(EFFECT_OPACITY_KEY,JSON.stringify(effectOpacity));}catch{notify('設定無法保存，目前只在本分頁有效');}}
  function updateBattlePreferenceOptions(){
    installSpeedPreference();
    const native=document.querySelector('input[data-pct="fxOpacity"]'),anchor=native?.closest('.opt-row');
    if(!anchor||!battleSettings||!battleSetOption||!effectOpacity)return;
    // The native master becomes 100%; the three independent controls replace it.
    if(battleSettings.fxOpacity!==1)battleSetOption({fxOpacity:1});
    anchor.hidden=true;
    // The game's .opt-row display rule overrides the browser's [hidden] style.
    // Keep the native control mounted for its handlers, but never interactive.
    anchor.style.setProperty('display','none','important');
    native.disabled=true;
    let previous=anchor;
    for(const [key,title] of [['enemy','敵人特效透明度'],['teammate','隊友特效透明度'],['self','自身特效透明度']]){
      let row=document.querySelector('[data-ro-effect-opacity="'+key+'"]');
      if(!row){
        row=document.createElement('div');row.className='opt-row opt-range';row.dataset.roEffectOpacity=key;
        const text=document.createElement('span'),heading=document.createElement('b'),hint=document.createElement('small');heading.textContent=title;hint.textContent='0% 完全隱藏；傷害、命中與技能運算照常';text.append(heading,hint);
        const input=document.createElement('input');input.type='range';input.min='0';input.max='100';input.step='5';input.setAttribute('aria-label',title);
        const output=document.createElement('output');
        input.oninput=()=>{effectOpacity[key]=Math.max(0,Math.min(100,Number(input.value)))/100;output.textContent=Math.round(effectOpacity[key]*100)+'%';saveEffectOpacity();};
        row.append(text,input,output);
      }
      if(previous.nextElementSibling!==row)previous.after(row);previous=row;
      const input=row.querySelector('input'),output=row.querySelector('output'),value=Math.round(effectOpacity[key]*100);
      if(input.value!==String(value))input.value=String(value);if(output.textContent!==value+'%')output.textContent=value+'%';
    }
  }
  function installBattleVisualPreferences(game){
    installSpeedPreference();
    if(!game||!game.world3d)return;
    let state=battleVisualGames.get(game);
    if(state){state.observePeers();return;}
    state={source:null,nodes:new WeakMap(),roots:new Map(),patched:new WeakMap(),materials:new WeakMap()};battleVisualGames.set(game,state);
    const factor=source=>effectOpacity?.[source]??1;
    const owner=receiver=>state.source||(receiver?.player&&receiver.player!==game.player?'teammate':'self');
    function scoped(source,action){const old=state.source;state.source=source;try{return action();}finally{state.source=old;}}
    function wrap(object,key,make){
      if(!object||typeof object[key]!=='function')return;
      let keys=state.patched.get(object);if(!keys){keys=new Set();state.patched.set(object,keys);}if(keys.has(key))return;
      const descriptor=Object.getOwnPropertyDescriptor(object,key);if(descriptor&&(!descriptor.configurable||descriptor.get||descriptor.set))return;
      const original=object[key];try{Object.defineProperty(object,key,{configurable:true,writable:true,enumerable:descriptor?.enumerable??false,value:make(original)});keys.add(key);}catch{}
    }
    function tag(node,source){if(node&&source!=='environment'&&!state.nodes.has(node))state.nodes.set(node,source);}
    function tagEffectMeshes(effect,source){
      if(!effect||source==='environment')return;
      const scene=game.world3d.scene;
      for(const node of [effect.mesh,effect.group,effect.points,effect.ring])if(node&&(node.parent===scene||scene?.children?.includes(node))){tag(node,source);if(!state.roots.has(node))state.roots.set(node,source);}
    }
    function tagEffect(effect,source){
      if(!effect)return;tag(effect.view,source);tagEffectMeshes(effect,source);
      wrap(effect,'update',original=>function(...args){return scoped(source,()=>Reflect.apply(original,this,args));});
    }
    for(const method of ['updateEnemies','netBossCast','enemyArrow','groundWarning','endlessShot'])wrap(game,method,original=>function(...args){return scoped('enemy',()=>Reflect.apply(original,this,args));});
    for(const method of ['updateMapFires','dropPickup'])wrap(game,method,original=>function(...args){return scoped('environment',()=>Reflect.apply(original,this,args));});
    wrap(game,'schedule',original=>function(delay,callback,...rest){const source=owner(this);return Reflect.apply(original,this,[delay,typeof callback==='function'?function(...args){return scoped(source,()=>Reflect.apply(callback,this,args));}:callback,...rest]);});
    wrap(game,'addFx',original=>function(effect,...rest){tagEffect(effect,owner(this));return Reflect.apply(original,this,[effect,...rest]);});
    wrap(game,'addProjectile',original=>function(projectile,...rest){
      const source=projectile?.ghost?'teammate':owner(this);tag(projectile?.view,source);
      if(projectile){
        tagEffectMeshes(projectile.model,source);
        // Native arrow models create muzzle flashes/particles on their first
        // update, after the weapon's fire/update scope has already returned.
        wrap(projectile.model,'update',originalUpdate=>function(...args){return scoped(source,()=>Reflect.apply(originalUpdate,this,args));});
        for(const target of [projectile,projectile.hitOpts])wrap(target,'hitFx',originalHit=>function(...args){return scoped(source,()=>{const effect=Reflect.apply(originalHit,this,args);tagEffect(effect,source);return effect;});});
      }
      return scoped(source,()=>Reflect.apply(original,this,[projectile,...rest]));
    });
    const world=game.world3d;
    wrap(game.fxLayer,'addChild',original=>function(...nodes){if(state.source)for(const node of nodes)tag(node,state.source);return Reflect.apply(original,this,nodes);});
    // Persistent fields (Loki's Veil, Volcano, Deluge) insert a separate
    // Graphics at index 0 and return an empty view to addFx.
    wrap(game.fxLayer,'addChildAt',original=>function(node,index,...rest){if(state.source)tag(node,state.source);return Reflect.apply(original,this,[node,index,...rest]);});
    wrap(world,'addBeam',original=>function(...args){return scoped('environment',()=>Reflect.apply(original,this,args));});
    for(const method of ['addZone','addGroundSprite','addWave','add3D','addCylinder','addFireWave','addFirePatch','addFireball'])wrap(world,method,original=>function(...args){
      const source=state.source||'self',start=this.cylinders?.length||0;
      return scoped(source,()=>{const result=Reflect.apply(original,this,args);for(const effect of (this.cylinders||[]).slice(start))wrap(effect,'update',update=>function(...values){return scoped(source,()=>Reflect.apply(update,this,values));});return result;});
    });
    wrap(world.scene,'add',original=>function(...nodes){
      if(state.source&&state.source!=='environment')for(const node of nodes){tag(node,state.source);state.roots.set(node,state.source);}
      return Reflect.apply(original,this,nodes);
    });
    wrap(world.scene,'remove',original=>function(...nodes){for(const node of nodes)state.roots.delete(node);return Reflect.apply(original,this,nodes);});
    function patchMaterial(material,source){
      if(!material||state.materials.has(material)||typeof material.onBeforeCompile!=='function')return;
      const uniform={value:factor(source)},original=material.onBeforeCompile,cacheKey=material.customProgramCacheKey;
      material.onBeforeCompile=function(shader,...args){
        Reflect.apply(original,this,[shader,...args]);
        const end=shader.fragmentShader?.lastIndexOf('}');if(!(end>=0))return;
        shader.uniforms.roEffectOpacity=uniform;
        const multiply=material.premultipliedAlpha||(material.blending===5&&material.blendSrc===201)?'gl_FragColor *= roEffectOpacity;':'gl_FragColor.a *= roEffectOpacity;';
        shader.fragmentShader='uniform float roEffectOpacity;\n'+shader.fragmentShader.slice(0,end)+multiply+'\n'+shader.fragmentShader.slice(end);
      };
      material.customProgramCacheKey=function(){return (typeof cacheKey==='function'?Reflect.apply(cacheKey,this,[]):'')+'|ro-effect-opacity-v1';};
      material.needsUpdate=true;state.materials.set(material,uniform);
    }
    wrap(world.renderer,'render',original=>function(...args){
      const restore=[],seen=new Set();
      try{
        for(const [root,source] of state.roots){
          if(!root.parent&&Array.isArray(world.scene?.children)&&!world.scene.children.includes(root)){state.roots.delete(root);continue;}
          const value=factor(source);
          if(value===0){restore.push([root,root.visible]);root.visible=false;}
          const visit=node=>{for(const material of Array.isArray(node.material)?node.material:node.material?[node.material]:[]){patchMaterial(material,source);const uniform=state.materials.get(material);if(uniform&&!seen.has(uniform)){seen.add(uniform);uniform.value=value;}}};
          if(typeof root.traverse==='function')root.traverse(visit);else visit(root);
        }
        return Reflect.apply(original,this,args);
      }finally{for(const [root,visible] of restore)root.visible=visible;}
    });
    function draw2D(original,receiver,args){
      const restore=[];
      try{
        if(game.fxLayer&&effectOpacity&&battleSettings&&battleSetOption){
          if(battleSettings.fxOpacity!==1)battleSetOption({fxOpacity:1});
          const visit=node=>{
            const source=state.nodes.get(node);if(source){const value=factor(source);restore.push([node,node.alpha,node.visible]);node.alpha*=value;if(value===0)node.visible=false;return;}
            for(const child of node.children||[])visit(child);
          };
          visit(game.fxLayer);
          for(const node of [game.wings?.s,game.wings?.feathers])if(node){const value=factor('self');restore.push([node,node.alpha,node.visible]);node.alpha*=value;if(value===0)node.visible=false;}
        }
        return Reflect.apply(original,receiver,args);
      }finally{for(const [node,alpha,visible] of restore)if(!node.destroyed){node.alpha=alpha;node.visible=visible;}}
    }
    wrap(game.app?.renderer,'render',original=>function(...args){return draw2D(original,this,args);});
    state.observePeers=()=>{
      for(const weapon of game.weapons||[])for(const method of ['update','fire','onLowHp','onPlayerHit'])wrap(weapon,method,original=>function(...args){return scoped('self',()=>Reflect.apply(original,this,args));});
      for(const mate of game.coop?.mates?.values?.()||[])wrap(mate.ghost,'play',original=>function(...args){return scoped('teammate',()=>Reflect.apply(original,this,args));});
    };
    state.observePeers();
    for(const effect of game.fx||[])tagEffect(effect,'self');
    for(const projectile of game.projectiles||[])tag(projectile.view,projectile.ghost?'teammate':'self');
  }
