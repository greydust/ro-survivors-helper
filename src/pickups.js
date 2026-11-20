  const FPS_KEY='greydust.ro.show-fps.v1';
  const optimizeHiddenPickups=true;
  let showFps=false,fpsFrame=null,fpsStart=null,fpsFrames=0,fpsGame=null,fpsLabel=null;
  try{showFps=localStorage.getItem(FPS_KEY)==='true';}catch{}
  const UNLIMITED_MAGNETS_KEY='greydust.ro.unlimited-magnets.v1';
  let unlimitedMagnets=false,magnetLimitReady=false;
  try{unlimitedMagnets=localStorage.getItem(UNLIMITED_MAGNETS_KEY)==='true';}catch{}
  const MERGE_MONEY_KEY='greydust.ro.merge-money.v1',MONEY_PILE_LIMIT=350;
  let mergeMoney=false;
  try{mergeMoney=localStorage.getItem(MERGE_MONEY_KEY)==='true';}catch{}
  const moneyMergeGames=new WeakSet(),moneyMergeMetrics={mergedObjects:0};
  const pickupHelpers=new WeakMap(),pickupVisualPrototypes=new WeakSet(),beamVisuals=new WeakSet(),pickupWorlds=new WeakSet(),pickupPositionWorlds=new WeakSet();
  const pickupMetrics={visualCallsSkipped:0,beamCallsSkipped:0,beamPositionsSkipped:0,stationaryBeamPositionsSkipped:0,pickupVisualReady:false,beamVisualReady:false};
  const compactFunction=fn=>Function.prototype.toString.call(fn).replace(/\s+/g,'').replace(/\b0\./g,'.');
  function knownPickupVisual(fn){
    if(typeof fn!=='function')return false;
    const source=compactFunction(fn),args=source.match(/^update\(([\w$]+)\)/),sin=source.match(/this\.sprite\.y=-6\+([\w$]+)\(this\.bob\)/);
    if(!args||!sin)return false;
    return source===`update(${args[1]}){this.bob+=${args[1]}*4,this.view.position.set(this.x,this.y),this.sprite.y=-6+${sin[1]}(this.bob)*3,this.glow&&(this.glow.alpha=.4+.3*${sin[1]}(this.bob*1.5))}`;
  }
  function knownBeamVisual(fn){
    if(typeof fn!=='function')return false;
    const source=compactFunction(fn),delta=source.match(/^update\(([\w$]+)\)/),alpha=source.match(/;const([\w$]+)=Math\.min/),power=source.match(/;const([\w$]+)=this\.age/),material=source.match(/for\(const([\w$]+)ofthis\.mats\)/);
    if(!delta||!alpha||!power||!material)return false;
    const [d,a,p,m]=[delta[1],alpha[1],power[1],material[1]];
    return source===`update(${d}){this.age+=${d};const${a}=Math.min(1,this.age/.35);this.group.scale.set(1+(1-${a})*1.5,${a},1+(1-${a})*1.5);const${p}=this.age<.35?1.6-${a}*.6:1;for(const${m}ofthis.mats)${m}.uniforms.time.value+=${d},${m}.uniforms.alpha.value=${m}.userData.alpha*${p}}`;
  }
  function patchPickupVisual(prototype){
    if(!prototype||pickupVisualPrototypes.has(prototype))return;
    const original=prototype.update;if(!knownPickupVisual(original))return;
    const elapsed=new WeakMap();
    prototype.update=function(delta,...args){
      if(!Number.isFinite(delta)||delta<0)return Reflect.apply(original,this,[delta,...args]);
      const previous=elapsed.get(this)||0;
      if(optimizeHiddenPickups&&this.view?.visible===false){elapsed.set(this,previous+delta);pickupMetrics.visualCallsSkipped++;return;}
      elapsed.delete(this);return Reflect.apply(original,this,[delta+previous,...args]);
    };
    pickupVisualPrototypes.add(prototype);pickupMetrics.pickupVisualReady=true;
  }
  function patchBeamVisual(beam){
    if(!beam||beamVisuals.has(beam))return;
    const original=beam.update;if(!knownBeamVisual(original))return;
    let elapsed=0;
    beam.update=function(delta,...args){
      if(!Number.isFinite(delta)||delta<0)return Reflect.apply(original,this,[delta,...args]);
      if(optimizeHiddenPickups&&this.group?.visible===false){elapsed+=delta;pickupMetrics.beamCallsSkipped++;return;}
      const total=delta+elapsed;elapsed=0;return Reflect.apply(original,this,[total,...args]);
    };
    beamVisuals.add(beam);pickupMetrics.beamVisualReady=true;
  }
  function installPickupVisualHooks(module){
    for(const value of Object.values(module||{}))if(typeof value==='function'&&value.prototype)patchPickupVisual(value.prototype);
  }
  function patchPickupWorld(world){
    if(!world||pickupWorlds.has(world))return;
    if(typeof world.addBeam==='function'){
      const original=world.addBeam;
      world.addBeam=function(...args){const beam=Reflect.apply(original,this,args);patchBeamVisual(beam);return beam;};
    }
    const position=world.setBeam;
    if(typeof position==='function'){
      const source=compactFunction(position),args=source.match(/^setBeam\(([\w$]+),([\w$]+),([\w$]+)\)/);
      if(args&&source===`setBeam(${args[1]},${args[2]},${args[3]}){${args[1]}.group.position.set(${args[2]},this.heightAt(${args[2]},${args[3]}),${args[3]})}`){
        const positions=new WeakMap();
        world.setBeam=function(beam,x,y,...rest){
          if(optimizeHiddenPickups&&beam?.group?.visible===false){positions.delete(beam);pickupMetrics.beamPositionsSkipped++;return;}
          const point=beam?.group?.position,map=this.map,altitude=map?.altitude,heights=altitude?.heights||map?.heights,previous=beam&&positions.get(beam);
          // Altars can change height in place; leave their native sampling intact.
          const cacheable=point&&Number.isFinite(x)&&Number.isFinite(y)&&!this.altar&&!rest.length;
          if(cacheable&&previous&&previous.x===x&&previous.y===y&&previous.map===map&&previous.altitude===altitude&&previous.heights===heights&&previous.scale===this.hScale&&previous.heightAt===this.heightAt&&previous.point===point&&previous.px===point.x&&previous.py===point.y&&previous.pz===point.z){
            pickupMetrics.stationaryBeamPositionsSkipped++;return;
          }
          const result=Reflect.apply(position,this,[beam,x,y,...rest]);
          if(cacheable)positions.set(beam,{x,y,map,altitude,heights,scale:this.hScale,heightAt:this.heightAt,point,px:point.x,py:point.y,pz:point.z});
          else if(beam)positions.delete(beam);
          return result;
        };
        pickupPositionWorlds.add(world);
      }
    }
    for(const beam of world.beams||[])patchBeamVisual(beam);
    pickupWorlds.add(world);
  }
  function installPickupHelpers(game){
    if(!game)return;
    if(pickupHelpers.has(game))return;
    for(const item of game.pickups||[]){patchPickupVisual(Object.getPrototypeOf(item));patchBeamVisual(item.beam);}
    patchPickupWorld(game.world3d);pickupHelpers.set(game,true);
    installMagnetLimitOption(game);
    mergeMoneyPickups(game);
  }
  function mergeMoneyPickups(game){
    if(!mergeMoney||!game||!moneyMergeGames.has(game)||game.coop||game.deterministic)return;
    const keep=[],seen=new Set();let merged=0;
    for(const item of game.pickups||[]){
      if(!item||seen.has(item)||item.dead||item.kind!=='zeny'||item.magnet||item.vacuum||(item.nid!=null&&item.nid!==0)||!Number.isSafeInteger(item.value)||item.value<1||!Number.isFinite(item.x)||!Number.isFinite(item.y))continue;
      seen.add(item);
      if(keep.length<MONEY_PILE_LIMIT){keep.push(item);continue;}
      let target=null,distance=Infinity;
      for(const pile of keep){
        if(!Number.isSafeInteger(pile.value+item.value))continue;
        const d=(pile.x-item.x)**2+(pile.y-item.y)**2;
        if(d<distance){target=pile;distance=d;}
      }
      if(!target)continue;
      target.value+=item.value;item.dead=true;merged++;
    }
    if(merged){moneyMergeMetrics.mergedObjects+=merged;game.sweepPickups();}
  }
  function installMagnetLimitOption(game){
    const original=game.dropPickup;
    if(typeof original!=='function')return;
    // This verified native body reads deterministic only inside RO_MAGFULL.
    // A receiver view bypasses that guard without changing the real game flag,
    // its pickup array, drop odds, or any other pickup kind.
    const source=compactFunction(original);let hash=2166136261;
    for(let i=0;i<source.length;i++)hash=Math.imul(hash^source.charCodeAt(i),16777619)>>>0;
    if(hash!==2115746805||!source.startsWith('dropPickup(e,t,s,n,o=0,i=-1,r=""){if(e==="magnet"&&RO_MAGFULL(this))return;'))return;
    game.dropPickup=function(kind,...args){
      const receiver=unlimitedMagnets&&kind==='magnet'?new Proxy(this,{get(target,key){return key==='deterministic'?true:Reflect.get(target,key,target);}}):this;
      const result=Reflect.apply(original,receiver,[kind,...args]);
      if(kind==='zeny')mergeMoneyPickups(this);
      return result;
    };
    magnetLimitReady=true;
    // Native cleanup is required so retired piles release their views normally.
    if(typeof game.sweepPickups==='function'&&compactFunction(game.sweepPickups)==='sweepPickups(){if(this.pickups.some(e=>e.dead)){for(consteofthis.pickups)e.dead&&(e.beam&&this.world3d.removeBeam(e.beam),e.view.destroy());this.pickups=this.pickups.filter(e=>!e.dead)}}')moneyMergeGames.add(game);
  }
  function updatePickupOptions(){
    const anchor=document.querySelector('[data-ro-show-horde-ring]')?.closest('label')||document.querySelector('#lu-p-hide')?.closest('label');
    if(!anchor)return;
    let previous=anchor;
    for(const [key,title,hint,value,set] of [
      ['unlimited-magnets','解除磁鐵數量上限','解除地上同時最多三個磁鐵的限制；掉落機率不變。',unlimitedMagnets,checked=>{unlimitedMagnets=checked;return UNLIMITED_MAGNETS_KEY;}],
      ['merge-money','合併金錢','單人戰鬥將超過 350 個、未吸取的金錢堆合併，保留總金額；組隊與確定性模式不套用。',mergeMoney,checked=>{mergeMoney=checked;if(checked)mergeMoneyPickups(activeGame);return MERGE_MONEY_KEY;}],
      ['hide-weather','隱藏戰鬥天氣','停用戶外雨滴、閃電、天氣霧色及其動畫與環境音，室內光影維持原樣。',hideBattleWeather,checked=>{hideBattleWeather=checked;installWeatherEffects(weatherGame);return HIDE_WEATHER_KEY;}],
      ['show-fps','顯示 FPS','在戰鬥畫面左下角顯示畫面更新率。',showFps,checked=>{showFps=checked;updateFpsDisplay(fpsGame);return FPS_KEY;}]
    ]){
      let input=document.querySelector('[data-ro-pickup-option="'+key+'"]');
      if(!input){
        const row=document.createElement('label');row.className='opt-row opt-check';
        const text=document.createElement('span'),heading=document.createElement('b'),note=document.createElement('small');heading.textContent=title;note.textContent=hint;text.append(heading,note);
        input=document.createElement('input');input.type='checkbox';input.dataset.roPickupOption=key;
        input.onchange=()=>{const storageKey=set(input.checked);try{localStorage.setItem(storageKey,String(input.checked));}catch{notify('設定無法保存，目前只在本分頁有效');}};
        const toggle=document.createElement('i');toggle.className='opt-switch';row.append(text,input,toggle);previous.after(row);
      }
      if(input.checked!==value)input.checked=value;previous=input.closest('label');
    }
    if(typeof updatePerformanceOption==='function')updatePerformanceOption();
  }
  function moneyMergeDiagnostics(game){return {enabled:mergeMoney,ready:moneyMergeGames.has(game),active:mergeMoney&&moneyMergeGames.has(game)&&!game.coop&&!game.deterministic,limit:MONEY_PILE_LIMIT,...moneyMergeMetrics};}
  function pickupDiagnostics(){return {unlimitedMagnets,magnetLimitReady,optimizeHiddenPickups,moneyMerging:moneyMergeDiagnostics(activeGame),count:activeGame?.pickups?.length??0,...pickupMetrics};}
  function pickupPerformanceSnapshot(game){
    const current={live:0,hidden:0,visualPatched:0,beams:0,hiddenBeams:0,beamPatched:0};
    const inventory={entries:0,invalidEntries:0,live:0,dead:0,uniqueObjects:0,uniqueLiveObjects:0,duplicateReferences:0,repeatedObjects:0},kinds=new Map(),seen=new Map();
    for(const item of game?.pickups||[]){
      inventory.entries++;
      if(!item||typeof item!=='object'){inventory.invalidEntries++;continue;}
      const kind=typeof item.kind==='string'?item.kind:null;
      let row=kinds.get(kind);if(!row){row={kind,entries:0,live:0,dead:0,uniqueObjects:0,uniqueLiveObjects:0,duplicateReferences:0,repeatedObjects:0,hiddenLive:0,magnetLive:0};kinds.set(kind,row);}
      row.entries++;
      const previous=seen.get(item)||0;seen.set(item,previous+1);
      for(const target of [inventory,row]){
        target[item.dead?'dead':'live']++;
        if(previous){target.duplicateReferences++;if(previous===1)target.repeatedObjects++;}
        else{target.uniqueObjects++;if(!item.dead)target.uniqueLiveObjects++;}
      }
      if(item.dead)continue;
      if(item.view?.visible===false)row.hiddenLive++;if(item.magnet)row.magnetLive++;
      current.live++;if(item.view?.visible===false)current.hidden++;
      if(pickupVisualPrototypes.has(Object.getPrototypeOf(item)))current.visualPatched++;
      if(item.beam){current.beams++;if(item.beam.group?.visible===false)current.hiddenBeams++;if(beamVisuals.has(item.beam))current.beamPatched++;}
    }
    return {enabled:optimizeHiddenPickups,helpersInstalled:pickupHelpers.has(game),beamPositionPatched:pickupPositionWorlds.has(game?.world3d),moneyMerging:moneyMergeDiagnostics(game),current,inventory:{...inventory,byKind:[...kinds.values()].sort((a,b)=>b.entries-a.entries)},counters:{...pickupMetrics}};
  }

  function updateFpsDisplay(game){
    fpsGame=game;
    if(!showFps){
      if(fpsFrame!==null)window.cancelAnimationFrame?.(fpsFrame);
      fpsFrame=null;fpsStart=null;fpsFrames=0;fpsLabel?.remove();fpsLabel=null;return;
    }
    if(fpsFrame===null&&typeof window.requestAnimationFrame==='function')fpsFrame=window.requestAnimationFrame(sampleFps);
  }
  function sampleFps(now){
    fpsFrame=null;if(!showFps)return;
    const visible=fpsGame?.state==='playing'&&!document.hidden;
    let label=fpsLabel;
    if(!visible){if(label&&!label.hidden)label.hidden=true;fpsStart=null;fpsFrames=0;}
    else{
      if(!label){label=element('div','FPS —');label.id='ro-fps';label.style.cssText='position:fixed;left:max(8px,env(safe-area-inset-left));bottom:max(8px,env(safe-area-inset-bottom));z-index:8;pointer-events:none;padding:2px 6px;border-radius:4px;background:#101b2bd9;color:#d7f5df;font:12px monospace;font-variant-numeric:tabular-nums';document.body.append(label);fpsLabel=label;}
      if(label.hidden)label.hidden=false;
      if(fpsStart===null){fpsStart=now;fpsFrames=0;}
      else{fpsFrames++;const elapsed=now-fpsStart;if(elapsed>=500){label.textContent='FPS '+Math.round(fpsFrames*1000/elapsed);fpsStart=now;fpsFrames=0;}}
    }
    fpsFrame=window.requestAnimationFrame(sampleFps);
  }
