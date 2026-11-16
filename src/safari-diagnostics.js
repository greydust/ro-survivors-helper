  function isSafariBrowser(){
    const ua=window.navigator?.userAgent||'';
    return /AppleWebKit\//.test(ua)&&/Version\//.test(ua)&&/Safari\//.test(ua)
      &&!/(?:Chrome|Chromium|CriOS|FxiOS|Edg|OPiOS|OPR|GSA|DuckDuckGo)\//.test(ua);
  }
  function createSafariDiagnostics(){
    const currentKey='greydust.ro.safari-diagnostics.current.v1',previousKey='greydust.ro.safari-diagnostics.previous.v1';
    let storageAvailable=true,saveTimer=null,dialog=null;
    const trim=(value,max=1800)=>String(value??'').slice(0,max);
    const read=key=>{
      try{const raw=localStorage.getItem(key);if(!raw||raw.length>250000)return null;const value=JSON.parse(raw);return value?.format===1&&Array.isArray(value.entries)?value:null;}
      catch{storageAvailable=false;return null;}
    };
    let previous=read(previousKey);const last=read(currentKey);
    const meaningful=log=>log?.entries.some(entry=>entry?.kind==='error'||entry?.event==='click'||entry?.event==='touchend'||entry?.event==='pointerup');
    if(meaningful(last)){
      previous=last;
      try{localStorage.setItem(previousKey,JSON.stringify(last));}catch{storageAvailable=false;}
    }
    const log={format:1,version:window[runtimeKey].version,startedAt:new Date().toISOString(),userAgent:trim(window.navigator?.userAgent,400),entries:[],errors:[],uiHistory:[]};
    const minimapTrace={patched:0,attempts:0,drawn:0,lastAttemptAt:null,lastDrawAt:null,lastReason:null};
    function recordMinimap(stage,reason){
      if(stage==='patched')minimapTrace.patched++;
      if(stage==='attempt'){minimapTrace.attempts++;minimapTrace.lastAttemptAt=Math.round(performance.now());minimapTrace.lastReason=reason;}
      if(stage==='drawn'){minimapTrace.drawn++;minimapTrace.lastDrawAt=Math.round(performance.now());minimapTrace.lastReason=null;}
    }
    function elementState(selector){
      const node=document.querySelector(selector);if(!node)return {exists:false};
      const round=value=>Number.isFinite(value)?Math.round(value*10)/10:null;
      const rect=node.getBoundingClientRect?.(),view=window.visualViewport;
      const viewport={left:view?.offsetLeft||0,top:view?.offsetTop||0,width:view?.width||innerWidth,height:view?.height||innerHeight};
      const result={exists:true,hidden:!!node.hidden,classes:trim(node.className,100)};
      if(rect){
        result.rect={left:round(rect.left),top:round(rect.top),width:round(rect.width),height:round(rect.height)};
        result.intersectsViewport=rect.width>0&&rect.height>0&&rect.right>viewport.left&&rect.bottom>viewport.top&&rect.left<viewport.left+viewport.width&&rect.top<viewport.top+viewport.height;
      }
      result.hiddenAncestors=[];
      for(let current=node;current&&result.hiddenAncestors.length<5;current=current.parentElement){
        const style=window.getComputedStyle?.(current);
        if(current.hidden||current.classList.contains('hidden')||style?.display==='none'||style?.visibility==='hidden'||Number(style?.opacity)===0)
          result.hiddenAncestors.push({element:describe(current),display:style?.display,visibility:style?.visibility,opacity:style?.opacity});
        if(current===node&&style)result.style={display:style.display,visibility:style.visibility,opacity:style.opacity,position:style.position,zIndex:style.zIndex,pointerEvents:style.pointerEvents,zoom:style.zoom,transform:style.transform};
      }
      if(rect&&result.intersectsViewport&&typeof document.elementFromPoint==='function'){
        const x=(Math.max(rect.left,viewport.left)+Math.min(rect.right,viewport.left+viewport.width))/2;
        const y=(Math.max(rect.top,viewport.top)+Math.min(rect.bottom,viewport.top+viewport.height))/2;
        const hit=document.elementFromPoint(x,y);result.centerHit=describe(hit);result.centerHitWithin=!!hit&&(hit===node||node.contains(hit));
      }
      return result;
    }
    function uiSnapshot(){
      const game=activeGame,canvas=document.querySelector('#minimap canvas');
      let geometry=null,geometryError=null;
      try{
        const reach=typeof game?.logicReach==='function'?game.logicReach():game?.world3d?.viewReach;
        geometry={hasPlayer:!!game?.player,hasMap:!!game?.map,mapWidth:game?.map?.width??null,mapHeight:game?.map?.height??null,reach:Number.isFinite(reach)?reach:null};
      }catch(error){geometryError=trim(error?.message,200);}
      return {at:Math.round(performance.now()),viewport:{width:innerWidth,height:innerHeight,visual:window.visualViewport?{width:window.visualViewport.width,height:window.visualViewport.height,left:window.visualViewport.offsetLeft,top:window.visualViewport.offsetTop,scale:window.visualViewport.scale}:null},
        touchClass:document.documentElement.classList.contains('touch'),hasGame:!!game,hasStats:!!game?.stats,gameState:game?.state??null,
        diagnosticDialogOpen:!!document.querySelector('#ro-safari-diagnostics'),hud:elementState('#hud'),buffs:elementState('#buffs'),
        characterButton:elementState('#ro-character-details-toggle'),characterPanel:elementState('#ro-character-details'),
        monsters:elementState('#ro-horde-hud'),monsterList:elementState('#ro-horde-hud [data-monster-counts]'),picker:elementState('#picker'),
        minimap:{element:elementState('#minimap'),canvas:elementState('#minimap canvas'),canvasWidth:canvas?.width??null,canvasHeight:canvas?.height??null,
          enabled:showHordeRing,option:elementState('[data-ro-show-horde-ring]'),optionChecked:document.querySelector('[data-ro-show-horde-ring]')?.checked??null,geometry,geometryError,trace:{...minimapTrace}}};
    }
    let lastUiSignature='';
    function sampleUI(){
      try{
        const ui=uiSnapshot();log.currentUI=ui;
        // Drawing counters change every frame; only keep layout/availability transitions in history.
        const stable={...ui,at:0,minimap:{...ui.minimap,trace:{patched:minimapTrace.patched,everAttempted:minimapTrace.attempts>0,everDrawn:minimapTrace.drawn>0,lastReason:minimapTrace.lastReason}}};
        const signature=JSON.stringify(stable);
        if(signature!==lastUiSignature){lastUiSignature=signature;log.uiHistory.push(ui);if(log.uiHistory.length>12)log.uiHistory.shift();scheduleSave();}
      }catch(error){log.uiDiagnosticError=trim(error?.message,300);}
    }
    function snapshot(){
      const picker=document.querySelector('#picker');
      return {gameState:activeGame?.state??null,pendingLevels:activeGame?.pendingLevelUps??null,coop:!!activeGame?.coop,
        picker:picker?{hidden:picker.classList.contains('hidden'),closing:picker.classList.contains('closing'),helperHidden:picker.hasAttribute('data-ro-ap-hidden'),
          cards:picker.querySelectorAll('.pk-card').length,chosen:picker.querySelectorAll('.pk-slot.chosen').length,asking:picker.querySelectorAll('.pk-slot.asking').length}:null};
    }
    function persist(){
      clearTimeout(saveTimer);saveTimer=null;
      try{localStorage.setItem(currentKey,JSON.stringify(log));}catch{storageAvailable=false;}
    }
    function scheduleSave(){if(saveTimer===null)saveTimer=setTimeout(persist,150);}
    function record(entry,immediate=false){
      try{entry.at=Math.round(performance.now());log.entries.push(entry);if(log.entries.length>80)log.entries.shift();if(immediate)persist();else scheduleSave();}catch{}
    }
    function describe(target){
      if(!(target instanceof Element))return trim(target?.nodeName||'window',80);
      return trim(target.tagName.toLowerCase()+(target.id?'#'+target.id:'')+(target.className?'.'+String(target.className).trim().replace(/\s+/g,'.'):'')
        +(target.dataset?.i!==undefined?'[data-i='+target.dataset.i+']':''),180);
    }
    const events=new WeakMap();
    function capture(event){
      try{
        const target=event.target instanceof Element?event.target:event.target?.parentElement;
        if(!target||target.closest('#ro-safari-diagnostics, #ro-safari-diagnostics-open'))return;
        if(!target.closest('#picker, #skillbar, #runitems, button, input, select, a'))return;
        const entry={kind:'input',event:event.type,target:describe(target),preventedAtCapture:!!event.defaultPrevented,bubbled:false,before:snapshot()};
        if(typeof document.elementFromPoint==='function'&&Number.isFinite(event.clientX)&&Number.isFinite(event.clientY))entry.hit=describe(document.elementFromPoint(event.clientX,event.clientY));
        record(entry,/^(click|touchend|pointerup)$/.test(event.type));events.set(event,entry);
        // Observation after dispatch: never cancel propagation or synthesize input.
        queueMicrotask(()=>{try{entry.preventedAfterDispatch=!!event.defaultPrevented;entry.after=snapshot();scheduleSave();}catch{}});
      }catch{}
    }
    function bubble(event){const entry=events.get(event);if(entry){entry.bubbled=true;entry.preventedAtBubble=!!event.defaultPrevented;}}
    for(const type of ['pointerdown','pointerup','pointercancel','touchstart','touchend','touchcancel','click']){
      window.addEventListener(type,capture,{capture:true,passive:true});window.addEventListener(type,bubble,{passive:true});
    }
    const recentErrors=new Map();
    function recordError(source,error){
      const message=trim(error?.message??error,800),key=source+message,now=performance.now();
      if(recentErrors.has(key)&&now-recentErrors.get(key)<2000)return;
      recentErrors.set(key,now);if(recentErrors.size>50)recentErrors.delete(recentErrors.keys().next().value);
      const entry={kind:'error',source,message,stack:trim(error?.stack,1200),state:snapshot()};
      log.errors.push(entry);if(log.errors.length>12)log.errors.shift();record(entry,true);
    }
    window.addEventListener('error',event=>{try{recordError('window.error',event.error||event.message);}catch{}},{passive:true});
    window.addEventListener('unhandledrejection',event=>{try{recordError('unhandledrejection',event.reason);}catch{}},{passive:true});
    window.addEventListener('pagehide',persist,{passive:true});
    let lastState='',lastBeat=performance.now();
    function heartbeat(){
      sampleUI();
      try{const now=performance.now(),state=snapshot(),signature=JSON.stringify(state);if(signature!==lastState||now-lastBeat>2500){lastState=signature;record({kind:'state',delay:Math.round(now-lastBeat),state});}lastBeat=now;}catch{}
      setTimeout(heartbeat,1000);
    }
    setTimeout(heartbeat,1000);record({kind:'start',state:snapshot()},true);
    function mount(){
      if(document.querySelector('#ro-safari-diagnostics-open'))return;
      const button=document.createElement('button');button.id='ro-safari-diagnostics-open';button.type='button';button.textContent='Safari 診斷';button.onclick=()=>open(false);document.body.append(button);
      if(new URL(location.href).searchParams.get('rodiag')==='1')open(true);
    }
    function open(preferPrevious){
      if(dialog){dialog.remove();dialog=null;}
      dialog=document.createElement('section');dialog.id='ro-safari-diagnostics';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-label','Safari 診斷紀錄');
      const title=document.createElement('strong');title.textContent='Safari 診斷紀錄';
      const note=document.createElement('p');note.textContent=storageAvailable?'紀錄自動存於本機，不會上傳。卡住時先重新整理，再查看「上次紀錄」。':'本機保存目前不可用；請先複製紀錄，重新整理可能無法保留。';
      const select=document.createElement('select');select.setAttribute('aria-label','診斷紀錄來源');
      for(const [value,label] of [['current','本次紀錄'],['previous','上次紀錄']]){const option=document.createElement('option');option.value=value;option.textContent=label;option.disabled=value==='previous'&&!previous;option.selected=value===(preferPrevious&&previous?'previous':'current');select.append(option);}
      const text=document.createElement('textarea');text.readOnly=true;text.spellcheck=false;text.setAttribute('aria-label','可手動複製的診斷內容');
      const status=document.createElement('p');status.setAttribute('role','status');
      const refresh=()=>{sampleUI();persist();text.value=JSON.stringify(select.value==='previous'?previous:{...log,currentState:snapshot()},null,2);};select.onchange=refresh;
      const actions=document.createElement('div');
      function button(label,action){const node=document.createElement('button');node.type='button';node.textContent=label;node.onclick=action;actions.append(node);}
      button('複製紀錄',()=>{
        try{const result=window.navigator?.clipboard?.writeText(text.value);if(!result)throw Error('clipboard unavailable');Promise.resolve(result).then(()=>{status.textContent='已複製，可貼到對話中。';},()=>{status.textContent='請長按下方文字，選擇全選 → 複製。';});}
        catch{status.textContent='請長按下方文字，選擇全選 → 複製。';}
      });
      button('選取全部',()=>{text.focus();text.select?.();text.setSelectionRange?.(0,text.value.length);status.textContent='也可長按文字選擇「複製」。';});
      button('更新本次紀錄',refresh);button('關閉',()=>{dialog.remove();dialog=null;});
      dialog.append(title,note,select,actions,status,text);document.body.append(dialog);refresh();
    }
    return {mount,recordError,recordMinimap,getLog:()=>{sampleUI();return JSON.parse(JSON.stringify(log));}};
  }
  let safariDiagnostics=null;
  if(isSafariBrowser()){
    try{safariDiagnostics=createSafariDiagnostics();window[runtimeKey].diagnostics=()=>safariDiagnostics.getLog();}
    catch(error){console.warn('[RO助手] Safari 診斷無法啟用',error);}
  }
