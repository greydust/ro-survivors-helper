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
    const log={format:1,version:window[runtimeKey].version,startedAt:new Date().toISOString(),userAgent:trim(window.navigator?.userAgent,400),entries:[],errors:[]};
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
      const refresh=()=>{persist();text.value=JSON.stringify(select.value==='previous'?previous:{...log,currentState:snapshot()},null,2);};select.onchange=refresh;
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
    return {mount,recordError,getLog:()=>JSON.parse(JSON.stringify(log))};
  }
  let safariDiagnostics=null;
  if(isSafariBrowser()){
    try{safariDiagnostics=createSafariDiagnostics();window[runtimeKey].diagnostics=()=>safariDiagnostics.getLog();}
    catch(error){console.warn('[RO助手] Safari 診斷無法啟用',error);}
  }
