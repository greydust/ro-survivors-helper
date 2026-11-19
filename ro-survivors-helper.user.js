// ==UserScript==
// @name         RO倖存者助手
// @namespace    greydust.ro.auto-pick
// @license      MIT
// @version      2.2.15
// @description  主城設定進階自動選卡、升級優先序、放逐與刷新；裝備整理與客戶端體驗優化。
// @match        https://ro.hans-webgametw.com/*
// @run-at       document-start
// @grant        none
// @sandbox      raw
// ==/UserScript==

(() => {
  'use strict';
  // Console and userscript installs share one instance per page.
  if(new URL(location.href).origin!=='https://ro.hans-webgametw.com'){
    console.warn('[RO助手] 請在 RO 倖存者遊戲頁面執行');return;
  }
  const runtimeKey=Symbol.for('greydust.ro.helper.runtime');
  if(window[runtimeKey]){console.info('[RO助手] 本頁已啟用助手；更新版本請重新整理後再執行');return;}
  window[runtimeKey]={version:'2.2.15'};
  const OFFLINE_KEY='greydust.ro.keep-offline.v1';
  let keepOffline=false;
  try{keepOffline=localStorage.getItem(OFFLINE_KEY)==='true';}catch{}
  const KEEP_CHANNEL_KEY='greydust.ro.keep-channel.v1',CHANNELS_KEY='greydust.ro.last-channels.v1',LAST_LOBBY_KEY='greydust.ro.last-lobby.v1';
  let keepChannel=false,lastChannels={},lastLobby='',autoLobbyAttempted=false;
  try{lastLobby=localStorage.getItem(LAST_LOBBY_KEY)||'';}catch{}
  try{keepChannel=localStorage.getItem(KEEP_CHANNEL_KEY)==='true';const saved=JSON.parse(localStorage.getItem(CHANNELS_KEY)||'{}');if(saved&&typeof saved==='object'&&!Array.isArray(saved))lastChannels=saved;}catch{}
  const channelStates=new WeakMap();
  function rememberChannel(socket){
    const state=channelStates.get(socket);if(!state||!Number.isSafeInteger(state.channel)||state.channel<1)return;
    lastChannels[state.lobby]=state.channel;
    try{localStorage.setItem(CHANNELS_KEY,JSON.stringify(lastChannels));}catch{}
  }
  function trackLobbyChannel(socket,url){
    const state={lobby:new URL(String(url),location.href).searchParams.get('l')||'0',channel:0,welcomed:false,pending:0};
    channelStates.set(socket,state);
    const send=socket.send;
    socket.send=function(data){
      // Explicit native hops take precedence over an automatic restoration.
      try{if(JSON.parse(data).t==='hop')state.pending=0;}catch{}
      return Reflect.apply(send,this,[data]);
    };
    socket.addEventListener('message',event=>{
      if(!lobbySockets.has(socket))return;
      let message;try{message=JSON.parse(event.data);}catch{return;}
      if(message.t!=='welcome'||!Number.isSafeInteger(message.channel)||message.channel<1)return;
      state.channel=message.channel;
      lastLobby=state.lobby;
      try{localStorage.setItem(LAST_LOBBY_KEY,lastLobby);}catch{}
      const first=!state.welcomed;state.welcomed=true;
      const desired=lastChannels[state.lobby];
      if(first&&keepChannel&&!keepOffline&&Number.isSafeInteger(desired)&&desired>0&&desired!==state.channel){
        // Use the same hop request as the game's channel picker, once per connection.
        state.pending=desired;
        try{Reflect.apply(send,socket,[JSON.stringify({t:'hop',n:desired})]);}catch{}
        return;
      }
      if(state.pending&&state.channel!==state.pending)return;
      state.pending=0;rememberChannel(socket);
    });
  }
  function setKeepChannel(enabled){
    keepChannel=!!enabled;
    try{localStorage.setItem(KEEP_CHANNEL_KEY,String(keepChannel));}catch{notify('頻道設定無法保存，目前只在本分頁有效');}
    for(const socket of lobbySockets){const state=channelStates.get(socket);if(state)state.pending=0;if(keepChannel)rememberChannel(socket);}
    updateOfflineUI();notify(keepChannel?'已開啟保持所在頻道':'已關閉保持所在頻道');
  }
  function skipInitialLobbyPicker(){
    if(!keepChannel||keepOffline||autoLobbyAttempted)return;
    const dialog=document.querySelector('#npc-dialog');
    if(!dialog||dialog.classList.contains('hidden'))return;
    const buttons=[...dialog.querySelectorAll('.lb-pick [data-lb]')];
    if(!buttons.length)return;
    // Only skip the initial picker; later manual choices and failed connections
    // must remain available without an automatic selection loop.
    autoLobbyAttempted=true;
    const button=lastLobby?buttons.find(item=>item.dataset.lb===lastLobby):buttons.find(item=>item.classList.contains('me'));
    if(button&&!button.disabled&&!button.classList.contains('full'))button.click();
  }
  const lobbySockets=new Set(),blockedLobbySockets=new Set();
  function isLobbySocket(url){
    try{const page=new URL(location.href),target=new URL(String(url),page);return ['ws:','wss:'].includes(target.protocol)&&target.host===page.host&&target.pathname===new URL('ws',page).pathname;}catch{return false;}
  }
  function installOfflineGate(){
    const Native=window.WebSocket;if(typeof Native!=='function')return;
    const Gate=new Proxy(Native,{construct(target,args,newTarget){
      if(isLobbySocket(args[0])&&keepOffline){
        // A closed, inert socket prevents network access without triggering the
        // native reconnect backoff repeatedly. HTTP saves and ws-run are intact.
        const socket=new window.EventTarget();
        Object.assign(socket,{url:String(args[0]),readyState:Native.CLOSED??3,bufferedAmount:0,protocol:'',extensions:'',binaryType:'blob',onopen:null,onclose:null,onerror:null,onmessage:null});
        socket.send=()=>{throw new Error('WebSocket is closed: 保持離線遊玩');};
        socket.close=()=>blockedLobbySockets.delete(socket);
        socket.release=()=>{blockedLobbySockets.delete(socket);socket.onclose?.({type:'close',code:1000,reason:'offline preference disabled',wasClean:true,target:socket});};
        blockedLobbySockets.add(socket);return socket;
      }
      const socket=Reflect.construct(target,args,newTarget===Gate?target:newTarget);
      if(isLobbySocket(args[0])){lobbySockets.add(socket);trackLobbyChannel(socket,args[0]);socket.addEventListener('close',()=>lobbySockets.delete(socket),{once:true});}
      return socket;
    }});
    window.WebSocket=Gate;
  }
  function setKeepOffline(enabled){
    keepOffline=!!enabled;
    try{localStorage.setItem(OFFLINE_KEY,String(keepOffline));}catch{notify('離線設定無法保存，目前只在本分頁有效');}
    if(keepOffline){for(const socket of lobbySockets)try{socket.close(1000,'保持離線遊玩');}catch{}lobbySockets.clear();}
    else{
      const blocked=[...blockedLobbySockets];for(const socket of blocked)socket.release();
      if(!blocked.length)document.querySelector('#lobby-online')?.click();
    }
    updateOfflineUI();notify(keepOffline?'已開啟保持離線遊玩；帳號存檔同步保留':'已關閉保持離線遊玩');
  }
  function updateOfflineUI(){
    const body=document.querySelector('#opt-body');
    if(body&&document.querySelector('#opt-tabs [data-opt-tab="game"].active')&&!body.querySelector('[data-ro-keep-offline]')){
      const row=document.createElement('label');row.className='opt-row opt-check';
      const text=document.createElement('span'),name=document.createElement('b'),hint=document.createElement('small');
      name.textContent='保持離線遊玩';hint.textContent='不自動連入主城多人伺服器；保留帳號登入與存檔同步';text.append(name,hint);
      const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=keepOffline;checkbox.setAttribute('data-ro-keep-offline','');checkbox.onchange=()=>setKeepOffline(checkbox.checked);
      const toggle=document.createElement('i');toggle.className='opt-switch';row.append(text,checkbox,toggle);body.append(row);
    }
    const checkbox=body?.querySelector('[data-ro-keep-offline]');if(checkbox)checkbox.checked=keepOffline;
    const offlineRow=checkbox?.closest('.opt-row');
    if(offlineRow){
      let channelInput=body.querySelector('[data-ro-keep-channel]');
      if(!channelInput){
        const row=document.createElement('label');row.className='opt-row opt-check';
        const text=document.createElement('span'),name=document.createElement('b'),hint=document.createElement('small');
        name.textContent='保持所在頻道';hint.textContent='略過開頭伺服器選擇，回主城或重新上線時回到上次頻道；保持離線遊玩優先';text.append(name,hint);
        channelInput=document.createElement('input');channelInput.type='checkbox';channelInput.setAttribute('data-ro-keep-channel','');channelInput.onchange=()=>setKeepChannel(channelInput.checked);
        const toggle=document.createElement('i');toggle.className='opt-switch';row.append(text,channelInput,toggle);offlineRow.after(row);
      }
      channelInput.checked=keepChannel;
    }
    skipInitialLobbyPicker();
    if(!keepOffline)return;
    const status=document.querySelector('#lobby-online');
    if(status){if(status.textContent!=='離線遊玩（助手）')status.textContent='離線遊玩（助手）';if(status.classList.contains('online'))status.classList.remove('online');}
    const dialog=document.querySelector('#npc-dialog');
    if(dialog&&!dialog.classList.contains('hidden')&&dialog.querySelector('.lb-pick [data-lb]')){
      const buttons=[...dialog.querySelectorAll('#npc-options button')];
      const offline=buttons.find(button=>/離線|sin conexi[oó]n|offline|sem conex[aã]o/i.test(button.textContent));
      offline?.click();
    }
  }
  installOfflineGate();
  const MINIMAP_MAGNET_KEY='greydust.ro.hide-minimap-magnets.v1';
  const HORDE_RING_KEY='greydust.ro.show-horde-ring.v1';
  let hideMinimapMagnets=false;
  let showHordeRing=true;
  try{hideMinimapMagnets=localStorage.getItem(MINIMAP_MAGNET_KEY)==='true';}catch{}
  try{showHordeRing=localStorage.getItem(HORDE_RING_KEY)!=='false';}catch{}
  function setHordeRingEnabled(value){
    showHordeRing=!!value;
    try{localStorage.setItem(HORDE_RING_KEY,String(showHordeRing));}catch{notify('設定無法保存，目前只在本分頁有效');}
    updateMinimapOption();
  }
  function hordeRingGeometry(game,image,crop){
    if(!game?.player||!game.map||!image||!crop)return null;
    const [sx,sy,sw,sh,dx,dy,dw,dh]=crop;
    const worldWidth=game.map.width*64,worldHeight=game.map.height*64;
    const iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height;
    const scale=Math.min(iw/worldWidth,ih/worldHeight);
    const reach=typeof game.logicReach==='function'?game.logicReach():game.world3d?.viewReach;
    if(!Number.isFinite(reach)||reach<=0||![scale,sw,sh,dw,dh].every(value=>Number.isFinite(value)&&value>0))return null;
    const padX=(iw-worldWidth*scale)/2,padY=(ih-worldHeight*scale)/2;
    return {x:dx+(padX+game.player.x*scale-sx)*dw/sw,y:dy+(padY+game.player.y*scale-sy)*dh/sh,
      rx:(reach+90)*scale*dw/sw,ry:(reach+90)*scale*dh/sh,
      outerX:(reach+130)*scale*dw/sw,outerY:(reach+130)*scale*dh/sh};
  }
  function paintHordeRing(context,image,crop){
    if(!showHordeRing){safariDiagnostics?.recordMinimap('attempt','disabled');return;}
    const ring=hordeRingGeometry(activeGame,image,crop);
    safariDiagnostics?.recordMinimap('attempt',ring?null:'geometry-unavailable');
    if(!ring)return;
    context.save();
    try{
      context.setTransform(1,0,0,1,0,0);context.globalAlpha=.9;context.strokeStyle='#5de7ff';
      const dpr=Math.min(2,window.devicePixelRatio||1);context.lineWidth=1.3*dpr;
      context.setLineDash([]);context.beginPath();context.ellipse(ring.x,ring.y,ring.rx,ring.ry,0,0,Math.PI*2);context.stroke();
      context.globalAlpha=.55;context.setLineDash([3*dpr,3*dpr]);context.beginPath();context.ellipse(ring.x,ring.y,ring.outerX,ring.outerY,0,0,Math.PI*2);context.stroke();
      safariDiagnostics?.recordMinimap('drawn');
    }finally{context.restore();}
  }
  const patchedMinimapContexts=new WeakSet();
  function patchMinimapContext(context){
    if(!context||patchedMinimapContexts.has(context))return;
    if(!['beginPath','arc','stroke','fillRect'].every(key=>typeof context[key]==='function'))return;
    patchedMinimapContexts.add(context);
    safariDiagnostics?.recordMinimap('patched');
    let magnetPath=false;
    const begin=context.beginPath,arc=context.arc,stroke=context.stroke,fillRect=context.fillRect;
    context.beginPath=function(...args){magnetPath=false;return Reflect.apply(begin,this,args);};
    context.arc=function(x,y,radius,start,end,reverse,...rest){
      // The native minimap magnet is a U-shaped, reversed half-circle. Player,
      // bosses and teammates use full circles; equipment uses diamond paths.
      if(Math.abs(start-Math.PI)<1e-8&&Math.abs(end)<1e-8&&reverse===true)magnetPath=true;
      return Reflect.apply(arc,this,[x,y,radius,start,end,reverse,...rest]);
    };
    context.stroke=function(...args){if(hideMinimapMagnets&&magnetPath)return;return Reflect.apply(stroke,this,args);};
    context.fillRect=function(...args){
      if(hideMinimapMagnets&&magnetPath&&String(this.fillStyle).toLowerCase()==='#e8eef8')return;
      return Reflect.apply(fillRect,this,args);
    };
    // Capture the game's exact minimap crop instead of guessing its zoom/pan.
    let image=null,crop=null,playerArrow=false,drawingOverlay=false;
    if(typeof context.drawImage==='function'){
      const drawImage=context.drawImage;
      context.drawImage=function(...args){if(args.length===9){image=args[0];crop=args.slice(1);}return Reflect.apply(drawImage,this,args);};
    }
    if(typeof context.rotate==='function'&&typeof context.restore==='function'){
      const rotate=context.rotate,restore=context.restore;
      context.rotate=function(...args){if(!drawingOverlay)playerArrow=true;return Reflect.apply(rotate,this,args);};
      context.restore=function(...args){
        const result=Reflect.apply(restore,this,args);
        if(playerArrow&&!drawingOverlay){
          playerArrow=false;drawingOverlay=true;
          try{paintHordeRing(this,image,crop);}catch(error){console.debug('[RO助手] 怪潮範圍繪製失敗',error);}finally{drawingOverlay=false;}
        }
        return result;
      };
    }
  }
  function installMinimapGate(){
    const prototype=window.HTMLCanvasElement?.prototype;if(typeof prototype?.getContext!=='function')return;
    const getContext=prototype.getContext;
    prototype.getContext=function(...args){
      const context=Reflect.apply(getContext,this,args);
      if(args[0]==='2d'&&this.closest('#minimap'))patchMinimapContext(context);
      return context;
    };
  }
  function updateMinimapOption(){
    const original=document.querySelector('#lu-p-hide');
    const row=original?.closest('label');
    if(row&&!document.querySelector('[data-ro-hide-minimap-magnets]')){
      const label=document.createElement('label');label.className='opt-row opt-check';
      const text=document.createElement('span'),title=document.createElement('b'),hint=document.createElement('small');
      title.textContent='隱藏小地圖磁鐵';hint.textContent='只隱藏小地圖上的磁鐵標記，不影響地上磁鐵與拾取';text.append(title,hint);
      const input=document.createElement('input');input.type='checkbox';input.setAttribute('data-ro-hide-minimap-magnets','');
      input.onchange=()=>{hideMinimapMagnets=input.checked;try{localStorage.setItem(MINIMAP_MAGNET_KEY,String(hideMinimapMagnets));}catch{notify('設定無法保存，目前只在本分頁有效');}};
      const toggle=document.createElement('i');toggle.className='opt-switch';label.append(text,input,toggle);row.after(label);
    }
    const input=document.querySelector('[data-ro-hide-minimap-magnets]');if(input)input.checked=hideMinimapMagnets;
    const magnetRow=input?.closest('label');
    if(magnetRow&&!document.querySelector('[data-ro-show-horde-ring]')){
      const label=document.createElement('label');label.className='opt-row opt-check';
      const text=document.createElement('span'),title=document.createElement('b'),hint=document.createElement('small');
      title.textContent='顯示怪物潮第一圈範圍';hint.textContent='青色實線為基礎半徑，虛線為第一圈隨機距離上限；不代表地形允許出生';text.append(title,hint);
      const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=showHordeRing;checkbox.setAttribute('data-ro-show-horde-ring','');
      checkbox.onchange=()=>setHordeRingEnabled(checkbox.checked);
      const toggle=document.createElement('i');toggle.className='opt-switch';label.append(text,checkbox,toggle);magnetRow.after(label);
    }
    const ringInput=document.querySelector('[data-ro-show-horde-ring]');if(ringInput)ringInput.checked=showHordeRing;
  }
  installMinimapGate();
  const HIDE_WEATHER_KEY='greydust.ro.hide-battle-weather.v1';
  let hideBattleWeather=false,weatherGame=null;
  try{hideBattleWeather=localStorage.getItem(HIDE_WEATHER_KEY)==='true';}catch{}
  const weatherHelpers=new WeakMap();
  function installWeatherEffects(game){
    weatherGame=game;const atmosphere=game?.atmosphere;
    if(!atmosphere||!atmosphere.view||!atmosphere.world?.atmos)return;
    let entry=weatherHelpers.get(atmosphere);
    if(!entry){
      const original=atmosphere.update;if(typeof original!=='function')return;
      const source=compactFunction(original);let hash=2166136261;
      for(let i=0;i<source.length;i++)hash=Math.imul(hash^source.charCodeAt(i),16777619)>>>0;
      // Verified outdoor atmosphere update only: never intercept indoor gloom.
      if(hash!==4040674621)return;
      entry={original,hidden:false,visible:atmosphere.view.visible};weatherHelpers.set(atmosphere,entry);
      atmosphere.update=function(...args){
        applyWeatherVisibility(this,entry);
        if(hideBattleWeather)return;
        return Reflect.apply(original,this,args);
      };
    }
    const wasHidden=entry.hidden;applyWeatherVisibility(atmosphere,entry);
    if(wasHidden&&!entry.hidden)Reflect.apply(entry.original,atmosphere,[0,game.app?.screen?.width||innerWidth,game.app?.screen?.height||innerHeight]);
  }
  function applyWeatherVisibility(atmosphere,entry){
    if(entry.hidden===hideBattleWeather)return;
    entry.hidden=hideBattleWeather;
    if(!hideBattleWeather){atmosphere.view.visible=entry.visible;return;}
    entry.visible=atmosphere.view.visible;atmosphere.view.visible=false;
    atmosphere.rainG.clear();atmosphere.flashG.clear();
    const uniforms=atmosphere.world.atmos;
    uniforms.envTint.value.set(1,1,1);uniforms.fogAmount.value=0;uniforms.playerLight.value=0;
    atmosphere.world.renderer.setClearColor(727603);
  }
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
  const DEITY_SWAP_KEY='greydust.ro.deity-swap-enabled.v1';
  let deitySwapEnabled=true;
  try{deitySwapEnabled=localStorage.getItem(DEITY_SWAP_KEY)!=='false';}catch{}
  const deitySwapGames=new WeakSet();
  function installDeitySwapPreference(game){
    if(!game||deitySwapGames.has(game)||typeof game.chestOpts!=='function')return;
    const original=game.chestOpts;
    game.chestOpts=function(...args){
      const options=Reflect.apply(original,this,args);
      // Reuse the native locked-perk mode without changing perk ranks, saves,
      // existing offers, refresh charges, or the native roll/selection methods.
      return deitySwapEnabled||!options?.swap?options:{...options,swap:false};
    };
    deitySwapGames.add(game);
  }
  function updateDeitySwapPreferenceUI(){
    const root=document.querySelector('#chr-perks');if(!root)return;
    const names=new Set(['神格切換','Deity cambiante','Shifting Deity','Divindade Mutável']);
    const row=[...root.querySelectorAll('.chr-perk')].find(node=>node.querySelector('[data-perk="deity"]')||names.has(node.querySelector('.chr-info > b')?.textContent.trim()));
    if(!row)return;
    const unlocked=!!row.querySelector('.chr-pips i.on');
    let label=row.querySelector('[data-ro-deity-swap]');
    if(!unlocked){label?.remove();return;}
    if(!label){
      label=document.createElement('label');label.dataset.roDeitySwap='';label.className='opt-check';label.style.cssText='display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px';
      const input=document.createElement('input');input.type='checkbox';input.setAttribute('role','switch');input.setAttribute('aria-label','允許切換神格');
      input.onchange=()=>{deitySwapEnabled=input.checked;try{localStorage.setItem(DEITY_SWAP_KEY,String(deitySwapEnabled));}catch{notify('神格切換偏好無法保存；本頁仍可使用');}};
      const track=document.createElement('i');track.className='opt-switch';track.setAttribute('aria-hidden','true');label.append(input,track);
      const completed=row.querySelector(':scope > .chr-maxed');
      if(completed)completed.replaceWith(label);else row.append(label);
    }
    const input=label.querySelector('input');input.checked=deitySwapEnabled;
  }
  const FPS_KEY='greydust.ro.show-fps.v1';
  const optimizeHiddenPickups=true;
  let showFps=false,fpsFrame=null,fpsStart=null,fpsFrames=0,fpsGame=null,fpsLabel=null;
  try{showFps=localStorage.getItem(FPS_KEY)==='true';}catch{}
  const UNLIMITED_MAGNETS_KEY='greydust.ro.unlimited-magnets.v1';
  let unlimitedMagnets=false,magnetLimitReady=false;
  try{unlimitedMagnets=localStorage.getItem(UNLIMITED_MAGNETS_KEY)==='true';}catch{}
  const pickupHelpers=new WeakMap(),pickupVisualPrototypes=new WeakSet(),beamVisuals=new WeakSet(),pickupWorlds=new WeakSet();
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
      return Reflect.apply(original,receiver,[kind,...args]);
    };
    magnetLimitReady=true;
  }
  function updatePickupOptions(){
    const anchor=document.querySelector('[data-ro-show-horde-ring]')?.closest('label')||document.querySelector('#lu-p-hide')?.closest('label');
    if(!anchor)return;
    let previous=anchor;
    for(const [key,title,hint,value,set] of [
      ['unlimited-magnets','解除磁鐵數量上限','解除地上同時最多三個磁鐵的限制；掉落機率不變。',unlimitedMagnets,checked=>{unlimitedMagnets=checked;return UNLIMITED_MAGNETS_KEY;}],
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
  function pickupDiagnostics(){return {unlimitedMagnets,magnetLimitReady,optimizeHiddenPickups,count:activeGame?.pickups?.length??0,...pickupMetrics};}

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
  const hordeStates = new WeakMap();
  const observedHordeQueues = new WeakSet();
  let nextHordeHudAt=0;
  const hordeSpawnKey=(id,hp,point)=>point&&[id,hp,point.x,point.y].join('|');
  function observeHordeQueue(game,state,queue){
    if(!Array.isArray(queue)||observedHordeQueues.has(queue))return;
    observedHordeQueues.add(queue);
    const push=queue.push,splice=queue.splice;
    Object.defineProperty(queue,'push',{configurable:true,writable:true,value:function(...tuples){
      const result=Reflect.apply(push,this,tuples),wave=state.current;
      if(this===queue&&wave)for(const tuple of tuples){
        if(!Array.isArray(tuple)||tuple.length<4||state.entries.has(tuple))continue;
        const entry={tuple,wave,status:'queued'};state.entries.set(tuple,entry);wave.pending.add(entry);wave.enqueued++;state.pendingWaves.add(wave);
      }
      return result;
    }});
    Object.defineProperty(queue,'splice',{configurable:true,writable:true,value:function(...args){
      const removed=Reflect.apply(splice,this,args);
      if(this===queue)for(const tuple of removed){
        const entry=state.entries.get(tuple);if(!entry||entry.status!=='queued')continue;
        entry.status='processing';const key=hordeSpawnKey(tuple[0],tuple[1],{x:tuple[2],y:tuple[3]});
        if(!state.processing.has(key))state.processing.set(key,[]);state.processing.get(key).push(entry);
      }
      return removed;
    }});
  }
  function observeNewHordeQueue(game,state){
    let value=game.roHq;observeHordeQueue(game,state,value);
    const descriptor=Object.getOwnPropertyDescriptor(game,'roHq');
    if(descriptor&&(!descriptor.configurable||descriptor.get||descriptor.set))return ()=>{};
    Object.defineProperty(game,'roHq',{configurable:true,enumerable:descriptor?.enumerable??true,
      get:()=>value,set:next=>{value=next;observeHordeQueue(game,state,next);}});
    return ()=>{
      if(!descriptor&&value===undefined)delete game.roHq;
      else Object.defineProperty(game,'roHq',descriptor?{...descriptor,value}:{configurable:true,enumerable:true,writable:true,value});
    };
  }
  function installHordeCount(game){
    if(!game||hordeStates.has(game)||typeof game.horde!=='function'||typeof game.spawnEnemy!=='function')return;
    const state={latest:null,current:null,entries:new WeakMap(),processing:new Map(),pendingWaves:new Set()};hordeStates.set(game,state);
    const spawnEnemy=game.spawnEnemy,horde=game.horde;
    game.spawnEnemy=function(...args){
      const key=hordeSpawnKey(args[0],args[1],args[3]),entries=state.processing.get(key),entry=entries?.shift();
      if(entries&&!entries.length)state.processing.delete(key);
      try{
        const enemy=Reflect.apply(spawnEnemy,this,args);
        if(entry){if(enemy)entry.wave.actual++;else entry.wave.failed++;}
        else if(state.current&&!Array.isArray(this.roHq)){state.current.enqueued++;if(enemy)state.current.actual++;else state.current.failed++;}
        return enemy;
      }catch(error){if(entry)entry.wave.canceled=true;else if(state.current)state.current.canceled=true;throw error;}
      finally{if(entry){entry.status='done';entry.wave.pending.delete(entry);if(!entry.wave.pending.size){state.pendingWaves.delete(entry.wave);if(entry.wave.closed&&!entry.wave.canceled)entry.wave.completedAt=performance.now();}}}
    };
    game.horde=function(...args){
      const wave={actual:0,theoretical:null,enqueued:0,failed:0,pending:new Set(),closed:false,canceled:false,completedAt:null};
      const previous=state.current;state.current=wave;state.latest=wave;
      let partyCount=1;const time=this.time,count=this.difficulty?.count,restore=[];
      const wrap=(object,key,make)=>{const descriptor=Object.getOwnPropertyDescriptor(object,key),original=object[key];object[key]=make(original);restore.push(()=>{if(descriptor)Object.defineProperty(object,key,descriptor);else delete object[key];});};
      try{
        restore.push(observeNewHordeQueue(this,state));
        if(typeof this.coop?.partyScale==='function')wrap(this.coop,'partyScale',original=>function(...values){const scale=Reflect.apply(original,this,values);partyCount=scale?.count??1;return scale;});
        if(typeof this.spawnAnchors==='function')wrap(this,'spawnAnchors',original=>function(...values){
          const anchors=Reflect.apply(original,this,values),desired=Math.round(Math.min(120,36+time/8)*count*partyCount);
          if(anchors?.length&&Number.isFinite(desired)&&desired>=0)wave.theoretical=Math.round(desired/anchors.length)*anchors.length;
          return anchors;
        });
        return Reflect.apply(horde,this,args);
      }catch(error){wave.canceled=true;throw error;}
      finally{for(const undo of restore.reverse())undo();wave.closed=true;if(!wave.pending.size&&!wave.canceled)wave.completedAt=performance.now();state.current=previous;try{updateHordeHud(this,true);}catch(error){console.debug('怪物潮面板更新失敗',error);}}
    };
  }
  function reconcileHordeCancellation(game,state){
    if(!state||!(game.bossArena||game.closeAt>=0||game.state==='over'))return;
    for(const wave of state.pendingWaves){wave.canceled=true;for(const entry of wave.pending)entry.status='canceled';wave.pending.clear();}
    state.pendingWaves.clear();state.processing.clear();
  }
  function hordeProgress(game){
    const state=hordeStates.get(game);reconcileHordeCancellation(game,state);
    const wave=state?.latest;if(!wave)return null;
    return {actual:wave.actual,theoretical:wave.theoretical,enqueued:wave.enqueued,failed:wave.failed,pending:wave.pending.size,
      complete:wave.theoretical!==null&&wave.closed&&!wave.pending.size&&!wave.canceled,canceled:wave.canceled,expired:wave.completedAt!==null&&performance.now()-wave.completedAt>=3000};
  }
  function fieldMonsterCounts(game){
    const counts=new Map();
    for(const enemy of game?.enemies||[]){
      if(!enemy||enemy.dead||enemy.removed||enemy.state==='dead'||(Number.isFinite(enemy.hp)&&enemy.hp<=0))continue;
      const id=enemy.def?.id||'unknown',name=MONSTER_NAMES[id]||enemy.def?.name||id;
      if(!counts.has(id))counts.set(id,{id,name,count:0});counts.get(id).count++;
    }
    return [...counts.values()].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'zh-Hant')||a.id.localeCompare(b.id));
  }
  function fieldMonsterLimit(game){
    const waves=game?.script?.waves,time=game?.waveTime;
    if(!Array.isArray(waves)||!waves.length||!Number.isFinite(time))return null;
    const wave=waves.find(row=>time>=row.from&&time<row.to)||waves[waves.length-1];
    const limit=wave.maxAlive*game.difficulty?.count*(game.coop?.partyScale?.()?.count??1)*(time<30?.2+.8*time/30:1);
    return Number.isFinite(limit)&&limit>=0?Math.ceil(limit):null;
  }
  function clearHordeHud(){document.querySelector('#ro-horde-hud')?.remove();nextHordeHudAt=0;}
  function updateHordeHud(game=activeGame,force=false){
    if(touchUiIsQuiet())return;
    const hud=document.querySelector('#hud');
    if(!game||!hud||hud.classList.contains('hidden')||game.state==='over'){clearHordeHud();return;}
    let panel=document.querySelector('#ro-horde-hud');
    if(pickerIsOpen()){
      if(panel&&!panel.hidden)panel.hidden=true;
      return;
    }
    if(panel&&!force&&performance.now()<nextHordeHudAt)return;nextHordeHudAt=performance.now()+250;
    if(!panel){
      panel=document.createElement('section');panel.id='ro-horde-hud';panel.setAttribute('aria-label','怪物潮與場上怪物');
      const progress=document.createElement('div');progress.dataset.hordeProgress='';
      const total=document.createElement('div');total.dataset.monsterTotal='';
      const list=document.createElement('div');list.dataset.monsterCounts='';list.id='ro-field-monsters';
      const header=document.createElement('div');header.dataset.monsterHeader='';
      const compact=innerWidth<=720||innerHeight<=500;if(compact)list.hidden=true;
      const toggle=document.createElement('button');toggle.type='button';toggle.dataset.monsterToggle='';toggle.textContent=list.hidden?'+':'−';toggle.setAttribute('aria-label',list.hidden?'展開怪物明細':'折疊怪物明細');toggle.setAttribute('aria-expanded',String(!list.hidden));toggle.setAttribute('aria-controls',list.id);
      toggle.onclick=()=>{list.hidden=!list.hidden;toggle.textContent=list.hidden?'+':'−';toggle.setAttribute('aria-expanded',String(!list.hidden));toggle.setAttribute('aria-label',list.hidden?'展開怪物明細':'折疊怪物明細');};
      header.append(progress,toggle);panel.append(header,total,list);document.body.append(panel);
    }
    const picker=document.querySelector('#picker'),covered=picker&&!picker.classList.contains('hidden');
    if(panel.hidden!==!!covered)panel.hidden=!!covered;
    const compact=innerWidth<=720||innerHeight<=500,view=helperViewport();
    // Position against the visible viewport, independent of temporary loot rows.
    const inset=compact?8:12,width=Math.min(compact?132:180,view.width-24);
    const right=Math.max(inset,Math.round(innerWidth-view.left-view.width+inset));
    const bottom=Math.max(inset,Math.round(innerHeight-view.top-view.height+inset));
    const maxHeight=compact?Math.min(110,Math.max(64,view.height*.25)):Math.min(340,Math.max(80,view.height-24));
    const button=document.querySelector('#ro-character-details-toggle'),buffs=document.querySelector('#buffs');
    const anchorTop=parseFloat(button?.style.top),anchorLeft=parseFloat(button?.style.left);
    const fallback=buffs?.getBoundingClientRect?.();
    const top=Math.max(view.top+8,Math.min((Number.isFinite(anchorTop)?anchorTop: fallback?.bottom??view.top+70)+42,view.top+view.height-64));
    const left=Math.max(view.left+8,Math.min(Number.isFinite(anchorLeft)?anchorLeft:8,view.left+view.width-width-8));
    const position=compact?{top:top+'px',left:left+'px',right:'auto',bottom:'auto',width:width+'px',maxHeight:Math.min(maxHeight,Math.max(48,view.top+view.height-top-8))+'px'}
      :{top:'auto',left:'auto',bottom:bottom+'px',right:right+'px',width:width+'px',maxHeight:maxHeight+'px'};
    for(const [key,value] of Object.entries(position))if(panel.style[key]!==value)panel.style[key]=value;
    const progress=hordeProgress(game),counter=panel.querySelector('[data-horde-progress]');
    const text=progress&&!progress.expired?'怪物潮('+progress.actual+'/'+(progress.theoretical??'?')+')':'怪物潮(-/-)';
    if(counter.textContent!==text)counter.textContent=text;
    const status=progress?.expired?'idle':progress?.canceled?'canceled':progress?.complete?'complete':'pending';
    if(counter.dataset.status!==status)counter.dataset.status=status;
    const title=progress?.expired?'本波生成已結束。':progress?`本波累計成功出生／理論總數；已排入 ${progress.enqueued}，待處理 ${progress.pending}，生成失敗 ${progress.failed}。`+(progress.canceled?'剩餘生成已中止。':progress.complete?'分批生成已結束；地形限制可能使出生數低於理論值。':'分批生成中。'):(game.coop?.replica?'隊員端尚未收到可追蹤的怪物潮佇列。':'尚未發生怪物潮。');
    if(counter.title!==title)counter.title=title;
    const counts=fieldMonsterCounts(game),total=panel.querySelector('[data-monster-total]'),totalText='場上怪物：'+counts.reduce((sum,row)=>sum+row.count,0)+' / '+(fieldMonsterLimit(game)??'—');
    if(total.textContent!==totalText)total.textContent=totalText;
    const list=panel.querySelector('[data-monster-counts]');
    const existing=new Map([...list.children].map(line=>[line.dataset.monsterId,line])),present=new Set();
    for(const row of counts){
      present.add(row.id);let line=existing.get(row.id);
      if(!line){line=document.createElement('div');line.dataset.monsterId=row.id;line.append(document.createElement('span'),document.createElement('b'));list.append(line);}
      if(line.firstElementChild.textContent!==row.name)line.firstElementChild.textContent=row.name;
      if(line.lastElementChild.textContent!==String(row.count))line.lastElementChild.textContent=String(row.count);
    }
    for(const [id,line] of existing)if(!present.has(id))line.remove();
  }
  const SLOT = '#skillbar .skill-slot[data-skill], #runitems .run-slot[data-item], #lu-sockets .skill-slot[data-skill], #lu-sockets .run-slot[data-item]';
  const COLORS = ['#9aa6c4', '#3ddc5a', '#2f7bff', '#a040ff', '#ff9a2e'];
  let rules = [];
  let menu, toast, job = null, scheduled = false;
  const manualCards = new WeakSet();
  const victoryCollected = new WeakSet();
  const fastHooked = new WeakMap();
  let activeGame = null;
  let skillDefs = null;
  let gameCatalog = null;
  const diagnosed = new WeakSet();
  let smithDefs = null, smithAssets = null;
  let twoHandTypes = new Set(['양손검', '양손창', '양손도끼', '활', '권총', '라이플', '샷건', '수리검', '카타르']);
  const smith = { panel: null, category: '', switching: false, inventory: [] };
  const smithNativeButtons = new WeakSet();
  const autoRefine={active:false,uid:null,target:4,timer:null,pending:null};
  function refineState(){
    const panel=document.querySelector('#smith'),go=document.querySelector('#smith-go');
    const selected=document.querySelector('#smith-list .cand.sel[data-uid]');
    const ladder=document.querySelector('#smith-detail .ref-ladder');
    if(!panel||panel.classList.contains('hidden')||!go||!selected||!ladder)return null;
    return {panel,go,uid:selected.dataset.uid,level:ladder.querySelectorAll(':scope > .done').length,max:ladder.children.length,
      detail:document.querySelector('#smith-detail'),selected};
  }
  function stopAutoRefine(message){
    autoRefine.active=false;autoRefine.uid=null;autoRefine.pending=null;
    clearTimeout(autoRefine.timer);autoRefine.timer=null;
    updateAutoRefine();if(message)notify(message);
  }
  function scheduleRefine(){clearTimeout(autoRefine.timer);autoRefine.timer=setTimeout(refineStep,250);}
  function refineStep(){
    if(!autoRefine.active)return;
    const state=refineState();
    if(!state)return stopAutoRefine('自動精煉已停止：裝備已消失、爆掉或視窗已關閉');
    if(state.uid!==autoRefine.uid)return stopAutoRefine('已切換裝備，自動精煉停止');
    if(state.level>=autoRefine.target)return stopAutoRefine(`已精煉至 +${state.level}`);
    if(autoRefine.pending){
      const pending=autoRefine.pending;
      if(state.level>pending.level){autoRefine.pending=null;scheduleRefine();return;}
      if(performance.now()-pending.at>30000)return stopAutoRefine('精煉回應逾時，已停止；請確認裝備狀態');
      if(!state.go.disabled&&state.detail.innerHTML!==pending.detail)return stopAutoRefine('本次精煉未完成，已停止');
      scheduleRefine();return;
    }
    if(state.go.disabled)return stopAutoRefine('無法繼續精煉：材料不足或已達上限');
    const dialog=document.querySelector('#npc-dialog');
    if(dialog&&!dialog.classList.contains('hidden'))return stopAutoRefine('有其他確認視窗，自動精煉已停止');
    autoRefine.pending={level:state.level,detail:state.detail.innerHTML,at:performance.now()};
    // Invoke the existing button, preserving cost, probability and server rules.
    state.go.click();
    if(!autoRefine.active)return;
    if(dialog&&!dialog.classList.contains('hidden')){
      // Only accept the refinement confirmation created synchronously by our
      // own click, with the selected piece's exact icon. Never accept other NPCs.
      const confirmation=dialog.querySelector('.confirm-piece .item-cell img');
      const expected=state.detail.querySelector('.eq-item img.big');
      const confirm=dialog.querySelector('#npc-options button.primary');
      const now=refineState();
      if(!confirmation||!expected||confirmation.getAttribute('src')!==expected.getAttribute('src')||!confirm||now?.uid!==autoRefine.uid)
        return stopAutoRefine('無法確認精煉提示，已停止，請手動檢查');
      confirm.click();
    }
    scheduleRefine();
  }
  function startAutoRefine(){
    if(autoRefine.active){stopAutoRefine('已停止自動精煉；已送出的單次精煉仍會完成');return;}
    const state=refineState();
    if(!state||state.go.disabled||state.selected.hasAttribute('data-ro-smith-filtered')){notify('請先選擇可精煉的裝備，並確認材料足夠');return;}
    if(!Number.isInteger(autoRefine.target)||autoRefine.target<=state.level||autoRefine.target>state.max){notify('請選擇高於目前加值的目標');return;}
    if(document.querySelector('#npc-dialog:not(.hidden)')){notify('請先關閉其他確認視窗');return;}
    if(autoStar.active)stopAutoStar();
    autoRefine.active=true;autoRefine.uid=state.uid;autoRefine.pending=null;updateAutoRefine();scheduleRefine();
  }
  function updateAutoRefine(){
    const panel=document.querySelector('#smith'),go=document.querySelector('#smith-go');
    if(!panel||panel.classList.contains('hidden')||!go){
      if(autoRefine.active){autoRefine.active=false;autoRefine.uid=null;autoRefine.pending=null;clearTimeout(autoRefine.timer);}
      return;
    }
    let controls=document.querySelector('#ro-auto-refine');
    if(!controls){
      controls=document.createElement('span');controls.id='ro-auto-refine';
      const button=formButton('自動精煉至',startAutoRefine);button.id='ro-auto-refine-button';
      const select=document.createElement('select');select.id='ro-auto-refine-target';select.setAttribute('aria-label','自動精煉目標加值');
      select.onchange=()=>{autoRefine.target=Number(select.value);updateAutoRefine();};controls.append(button,select);go.before(controls);
    }
    const state=refineState(),button=controls.querySelector('button'),select=controls.querySelector('select');
    const max=state?.max||10;
    if(select.children.length!==max){
      select.replaceChildren();for(let value=1;value<=max;value++){const option=document.createElement('option');option.value=String(value);option.textContent='+'+value;if(value===autoRefine.target)option.selected=true;select.append(option);}
    }
    const label=autoRefine.active?'停止':'自動精煉至';if(button.textContent!==label)button.textContent=label;
    const disabled=!autoRefine.active&&(!state||go.disabled||autoRefine.target<=state.level);
    if(button.disabled!==disabled)button.disabled=disabled;
    if(select.disabled!==autoRefine.active)select.disabled=autoRefine.active;
  }
  let smithManifestItems = null;
  const autoStar={active:false,uid:null,target:4,timer:null,pending:null,clicking:false};
  function starState(){
    const panel=document.querySelector('#starforge'),go=document.querySelector('#sf-go');
    const selected=document.querySelector('#sf-list .cand.sel[data-uid]');
    const ladder=document.querySelector('#sf-detail .ref-ladder');
    if(!panel||panel.classList.contains('hidden')||!go||!selected||selected.hasAttribute('data-ro-star-filtered')||!ladder||!panel.querySelector('[data-sft="star"].active'))return null;
    return {go,uid:selected.dataset.uid,level:ladder.querySelectorAll(':scope > .done').length,max:ladder.children.length,
      message:document.querySelector('#sf-detail .sf-msg')?.textContent||''};
  }
  function stopAutoStar(message){
    autoStar.active=false;autoStar.uid=null;autoStar.pending=null;
    clearTimeout(autoStar.timer);autoStar.timer=null;
    updateAutoStar();if(message)notify(message);
  }
  function scheduleStar(){clearTimeout(autoStar.timer);autoStar.timer=setTimeout(starStep,250);}
  function starStep(){
    if(!autoStar.active)return;
    const state=starState();
    if(!state||state.uid!==autoStar.uid)return stopAutoStar('裝備、頁籤或視窗已切換，連續升星停止');
    if(state.level>=autoStar.target)return stopAutoStar(`已升星至 ★${state.level}`);
    if(document.querySelector('#npc-dialog:not(.hidden)'))return stopAutoStar('有其他確認視窗，連續升星已停止');
    if(autoStar.pending){
      const pending=autoStar.pending;
      if(performance.now()-pending.at>30000)return stopAutoStar('升星回應逾時，已停止；請確認裝備狀態');
      if(state.level!==pending.level||state.message!==pending.message||(!state.go.disabled&&pending.busy)){
        // A failed roll drops a star and is retried; request errors stop here.
        if(!/^(?:升星成功！|升星失敗[：（])/.test(state.message))return stopAutoStar('升星未完成，已停止；請檢查遊戲提示');
        autoStar.pending=null;scheduleStar();return;
      }
      scheduleStar();return;
    }
    if(state.go.disabled)return stopAutoStar('無法繼續升星：材料、卡普拉點數不足或已達上限');
    autoStar.pending={level:state.level,message:state.message,at:performance.now(),busy:false};
    autoStar.clicking=true;
    try{
      state.go.click();
      if(!autoStar.active)return;
      let now=starState();
      // Only accept the native inline confirmation generated by our own click.
      if(now?.uid===autoStar.uid&&!now.go.disabled&&now.go.textContent==='確定？再按一次')now.go.click();
      now=starState();
      if(!now||now.uid!==autoStar.uid)return stopAutoStar('升星狀態已改變，已停止');
      autoStar.pending.busy=now.go.disabled;
    }catch{return stopAutoStar('無法執行升星，已停止');}
    finally{autoStar.clicking=false;}
    scheduleStar();
  }
  function startAutoStar(){
    if(autoStar.active){stopAutoStar('已停止連續升星；已送出的單次升星仍會完成');return;}
    const state=starState();
    if(!state||state.go.disabled){notify('請選擇可升星的裝備，並確認材料與卡普拉點數足夠');return;}
    if(!Number.isInteger(autoStar.target)||autoStar.target<=state.level||autoStar.target>state.max){notify('請選擇高於目前星數的目標');return;}
    if(document.querySelector('#npc-dialog:not(.hidden)')){notify('請先關閉其他確認視窗');return;}
    if(autoRefine.active)stopAutoRefine();
    autoStar.active=true;autoStar.uid=state.uid;autoStar.pending=null;updateAutoStar();scheduleStar();
  }
  function updateAutoStar(){
    const panel=document.querySelector('#starforge'),go=document.querySelector('#sf-go'),state=starState();
    if(autoStar.active&&(!state||state.uid!==autoStar.uid)){
      autoStar.active=false;autoStar.uid=null;autoStar.pending=null;clearTimeout(autoStar.timer);autoStar.timer=null;
    }
    if(!panel||panel.classList.contains('hidden')||!go)return;
    let controls=document.querySelector('#ro-auto-star');
    if(!controls){
      controls=document.createElement('span');controls.id='ro-auto-star';
      const button=formButton('連續升星至',startAutoStar);button.id='ro-auto-star-button';
      button.title='失敗掉星後仍會繼續，直到達到目標；可隨時停止';
      const select=document.createElement('select');select.id='ro-auto-star-target';select.setAttribute('aria-label','連續升星目標星數');
      select.onchange=()=>{autoStar.target=Number(select.value);updateAutoStar();};
      controls.append(button,select);go.before(controls);
    }
    if(controls.hidden===!!state)controls.hidden=!state;
    const button=controls.querySelector('button'),select=controls.querySelector('select'),max=state?.max||10;
    if(select.children.length!==max){
      select.replaceChildren();for(let value=1;value<=max;value++){const option=document.createElement('option');option.value=String(value);option.textContent='★'+value;if(value===autoStar.target)option.selected=true;select.append(option);}
    }
    const label=autoStar.active?'停止':'連續升星至';if(button.textContent!==label)button.textContent=label;
    const disabled=!autoStar.active&&(!state||go.disabled||autoStar.target<=state.level);
    if(button.disabled!==disabled)button.disabled=disabled;
    if(select.disabled!==autoStar.active)select.disabled=autoStar.active;
  }
  const smithIconIndex = new Map(), smithPathCache = new Map();
  const SMITH_FILTERS = [
    ['twohand', '雙手武'], ['onehand', '單手武'], ['shield', '盾牌'],
    ['head_top', '頭部（上）'],
    ['armor', '護甲'], ['garment', '披肩'], ['shoes', '鞋子']
  ];

  // Merchant rules operate on raw affixes, never rendered bonuses/card effects.
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
        touchClass:document.documentElement.classList.contains('touch'),hasGame:!!game,hasStats:!!game?.stats,gameState:game?.state??null,pickups:pickupDiagnostics(),
        diagnosticDialogOpen:!!document.querySelector('#ro-safari-diagnostics'),hud:elementState('#hud'),buffs:elementState('#buffs'),
        characterButton:elementState('#ro-character-details-toggle'),characterPanel:elementState('#ro-character-details'),
        monsters:elementState('#ro-horde-hud'),monsterList:elementState('#ro-horde-hud [data-monster-counts]'),picker:elementState('#picker'),
        smith:{panel:elementState('#smith'),filters:elementState('[data-ro-smith-extra]'),auto:elementState('#ro-auto-refine'),definitionsReady:!!smithDefs,assetsReady:!!smithAssets?.manifest?.items,touchActive:touchUiActive,quiet:touchUiIsQuiet()},
        starforge:{panel:elementState('#starforge'),filters:elementState('[data-ro-star-filters]'),auto:elementState('#ro-auto-star')},
        minimap:{element:elementState('#minimap'),canvas:elementState('#minimap canvas'),canvasWidth:canvas?.width??null,canvasHeight:canvas?.height??null,
          enabled:showHordeRing,option:elementState('[data-ro-show-horde-ring]'),optionChecked:document.querySelector('[data-ro-show-horde-ring]')?.checked??null,geometry,geometryError,trace:{...minimapTrace}}};
    }
    let lastUiSignature='';
    function sampleUI(){
      try{
        const ui=uiSnapshot();log.currentUI=ui;
        // Drawing counters change every frame; only keep layout/availability transitions in history.
        const stable={...ui,at:0,pickups:{unlimitedMagnets:ui.pickups.unlimitedMagnets,magnetLimitReady:ui.pickups.magnetLimitReady,optimizeHiddenPickups:ui.pickups.optimizeHiddenPickups,pickupVisualReady:ui.pickups.pickupVisualReady,beamVisualReady:ui.pickups.beamVisualReady},minimap:{...ui.minimap,trace:{patched:minimapTrace.patched,everAttempted:minimapTrace.attempts>0,everDrawn:minimapTrace.drawn>0,lastReason:minimapTrace.lastReason}}};
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
      const button=document.createElement('button');button.id='ro-safari-diagnostics-open';button.type='button';button.textContent='Safari 診斷';
      button.title='點一下開啟診斷；長按後拖曳移動';installFloatingHelperDrag(button);button.onclick=()=>open(false);document.body.append(button);updateUI();
      if(new URL(location.href).searchParams.get('rodiag')==='1')open(true);
    }
    function updateUI(){
      const button=document.querySelector('#ro-safari-diagnostics-open'),blocked=nativeGameWindowOpen();
      if(button){if(button.hidden!==blocked)button.hidden=blocked;if(!blocked)placeFloatingHelperButton(button);}
      if(dialog&&dialog.hidden!==blocked)dialog.hidden=blocked;
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
      dialog.append(title,note,select,actions,status,text);document.body.append(dialog);updateUI();refresh();
    }
    return {mount,updateUI,recordError,recordMinimap,getLog:()=>{sampleUI();return JSON.parse(JSON.stringify(log));}};
  }
  let safariDiagnostics=null;
  if(isSafariBrowser()){
    try{safariDiagnostics=createSafariDiagnostics();window[runtimeKey].diagnostics=()=>safariDiagnostics.getLog();}
    catch(error){console.warn('[RO助手] Safari 診斷無法啟用',error);}
  }
  let characterDetails=null,characterDetailsTimer=null;
  let nextCharacterDetailsAt=0;
  const characterStatFields=[
    ['maxHp','最大生命','number'],['armor','護甲（固定減傷）','number'],['def','DEF','number'],
    ['damageReduction','減傷（stats）','percent'],['flee','Flee（stats）','percent'],
    ['discovery','尋寶率（內部值）','number'],['critChance','爆擊率（stats）','percent'],['critMult','爆擊傷害','multiplier'],
    ['atk','ATK','number'],['matk','MATK','number'],['damageMult','傷害倍率（stats）','multiplier'],
    ['haste','急速','number'],['castHaste','施法急速','number'],['speedMult','移動速度倍率（stats）','multiplier'],
    ['pierceChance','穿透機率','percent'],['doubleChance','雙重施法機率','percent'],
    ['areaMult','範圍倍率','multiplier'],['reachMult','近戰距離倍率','multiplier'],
    ['lifesteal','吸血','percent'],['regen','生命回復／秒','number'],['regen5','每 5 秒生命回復','number'],
    ['expMult','經驗倍率','multiplier'],['zenyMult','Zeny 倍率','multiplier'],
    ...['str','agi','vit','int','dex','luk'].map(key=>[key,key.toUpperCase(),'number'])
  ];
  function formatCharacterStat(value,format='number') {
    if(typeof value!=='number'||!Number.isFinite(value))return '—';
    const text=number=>String(Math.round(number*100)/100);
    return format==='percent'?text(value*100)+'%':format==='multiplier'?'×'+text(value):text(value);
  }
  function characterStatRows(game) {
    const stats=game?.stats;if(!stats)return [];
    const buff=key=>typeof game.buffValue==='function'?game.buffValue(key):0;
    const rows=[['生命',formatCharacterStat(game.hp)+' / '+formatCharacterStat(stats.maxHp)]];
    const brace=buff('brace');
    if(Number.isFinite(stats.damageReduction))rows.push(['減傷（含 buff，未含 DEF／護甲）',formatCharacterStat(Math.min(Math.max(.75,brace),stats.damageReduction+buff('reduction')+buff('soulWard')+brace),'percent')]);
    if(Number.isFinite(stats.flee))rows.push(['Flee（含 buff）',formatCharacterStat(stats.flee+buff('flee'),'percent')]);
    if(Number.isFinite(stats.critChance))rows.push(['爆擊率（含 buff）',formatCharacterStat(stats.critChance+buff('crit'),'percent')]);
    for(const [key,label,format] of characterStatFields)rows.push([label,formatCharacterStat(stats[key],format)]);
    return rows;
  }
  function closeCharacterDetails() {
    clearTimeout(characterDetailsTimer);characterDetailsTimer=null;
    characterDetails?.remove();characterDetails=null;
    document.querySelector('#ro-character-details-toggle')?.setAttribute('aria-expanded','false');
  }
  function updateCharacterDetails() {
    if(pickerIsOpen()||touchUiIsQuiet())return;
    const hud=document.querySelector('#hud'),buffs=document.querySelector('#buffs');
    if(!hud||hud.classList.contains('hidden')||!buffs||!activeGame?.stats){
      document.querySelector('#ro-character-details-toggle')?.remove();closeCharacterDetails();return;
    }
    let button=document.querySelector('#ro-character-details-toggle');
    if(!button){
      button=document.createElement('button');button.id='ro-character-details-toggle';button.type='button';
      button.textContent='角色詳細資料';button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','ro-character-details');
      button.onclick=event=>{event.stopPropagation();if(characterDetails)closeCharacterDetails();else openCharacterDetails();};document.body.append(button);
    }
    if(typeof buffs.getBoundingClientRect==='function'){
      const rect=buffs.getBoundingClientRect(),view=helperViewport();
      const left=Math.max(view.left+8,Math.min(rect.left,view.left+view.width-110))+'px';
      const top=Math.max(view.top+8,Math.min(rect.bottom+6,view.top+view.height-48))+'px';
      if(button.style.left!==left)button.style.left=left;
      if(button.style.top!==top)button.style.top=top;
    }
    if(!characterDetails)return;
    const populate=(target,rows)=>{
      const signature=JSON.stringify(rows);if(target.dataset.signature===signature)return;
      target.dataset.signature=signature;target.replaceChildren();
      for(const [label,value] of rows){const row=document.createElement('div'),name=document.createElement('span'),number=document.createElement('b');name.textContent=label;number.textContent=value;row.append(name,number);target.append(row);}
    };
    populate(characterDetails.querySelector('[data-character-stats]'),characterStatRows(activeGame));
    const raw=Object.entries(activeGame.stats).filter(([,v])=>typeof v==='boolean'||typeof v==='number').sort(([a],[b])=>a.localeCompare(b));
    populate(characterDetails.querySelector('[data-character-raw]'),raw.map(([key,value])=>[key,String(value)]));
  }
  function openCharacterDetails() {
    closeCharacterDetails();if(!activeGame?.stats)return;
    characterDetails=document.createElement('section');characterDetails.id='ro-character-details';
    characterDetails.setAttribute('role','region');characterDetails.setAttribute('aria-label','角色詳細資料');
    const header=document.createElement('header'),title=document.createElement('strong'),close=document.createElement('button');
    title.textContent='角色詳細資料';close.type='button';close.textContent='關閉';close.onclick=closeCharacterDetails;header.append(title,close);
    const note=document.createElement('p');note.textContent='每 0.25 秒更新。stats 為角色目前內部值；臨時增益另列。尋寶率不是單件物品掉落機率，減傷仍會受敵人與技能影響。';
    const rows=document.createElement('div');rows.setAttribute('data-character-stats','');
    const raw=document.createElement('details'),summary=document.createElement('summary'),values=document.createElement('div');
    summary.textContent='全部原始 stats 欄位';values.setAttribute('data-character-raw','');raw.append(summary,values);
    characterDetails.append(header,note,rows,raw);document.body.append(characterDetails);
    document.querySelector('#ro-character-details-toggle')?.setAttribute('aria-expanded','true');
    const refresh=()=>{updateCharacterDetails();if(characterDetails)characterDetailsTimer=setTimeout(refresh,250);};refresh();
  }
  const statCapFields=['damageReduction','flee'];
  const statCapValues=new WeakMap(),statCapPanels=new WeakSet(),statCapHandlers=new WeakMap(),statCapAttempts=new WeakSet();
  let statCapCapture=null;
  function captureUncappedStats(stats){
    const capture=statCapCapture;
    if(!capture||!stats||!statCapFields.every(key=>Number.isFinite(stats[key])))return;
    capture.latest=stats;
    if(capture.objects.has(stats))return;
    const before={},properties=[];
    for(const key of statCapFields){
      const descriptor=Object.getOwnPropertyDescriptor(stats,key);if(!descriptor?.configurable||!('value' in descriptor)||!descriptor.writable)continue;
      let value=descriptor.value;before[key]=value;
      Object.defineProperty(stats,key,{configurable:true,enumerable:descriptor.enumerable,get:()=>value,set(next){before[key]=value;value=next;}});
      properties.push({key,descriptor,read:()=>value});
    }
    capture.objects.set(stats,{before,properties});
  }
  function withStatCapCapture(action){
    if(statCapCapture)return action();
    const capture={objects:new Map(),latest:null},original=Array.prototype.forEach;
    statCapCapture=capture;
    const wrapped=function(callback,thisArg){
      // Native loadout.applyStats uses modifiers.forEach(fn => fn(stats)).
      // Observe its actual fresh stats, without rebuilding gear/talent rules.
      const source=typeof callback==='function'?Function.prototype.toString.call(callback).replace(/\s+/g,''):'';
      if(!/^([\w$]+)=>\1\([\w$]+\)$/.test(source)||!this.length||!this.every(fn=>typeof fn==='function'))return Reflect.apply(original,this,[callback,thisArg]);
      return Reflect.apply(original,this,[function(fn,index,array){
        const tap=function(stats,...args){captureUncappedStats(stats);return Reflect.apply(fn,this,[stats,...args]);};
        return Reflect.apply(callback,thisArg,[tap,index,array]);
      },thisArg]);
    };
    Array.prototype.forEach=wrapped;
    try{return action();}
    finally{
      if(Array.prototype.forEach===wrapped)Array.prototype.forEach=original;
      for(const [stats,{properties}] of capture.objects)for(const {key,descriptor,read} of properties)Object.defineProperty(stats,key,{...descriptor,value:read()});
      statCapCapture=null;
    }
  }
  function statCapSnapshot(){
    const stats=statCapCapture?.latest,entry=stats&&statCapCapture.objects.get(stats);if(!entry)return null;
    const raw={...entry.before},effective=Object.fromEntries(statCapFields.map(key=>[key,stats[key]]));
    // Crit is not clamped in stats; its single-roll probability saturates at 1.
    if(Number.isFinite(stats.critChance)){raw.critChance=stats.critChance;effective.critChance=Math.min(1,Math.max(0,stats.critChance));}
    return {raw,effective};
  }
  const statCapLabels={damageReduction:['受到的傷害','受到伤害','Daño recibido','Damage taken','Dano recebido'],flee:['Flee','Flee（迴避）'],areaMult:['範圍','范围','Área','Area'],reachMult:['近戰距離','近战距离','Alcance cuerpo a cuerpo','Melee reach','Alcance corpo a corpo'],speedMult:['速度','Velocidad','Speed','Velocidade'],critChance:['爆擊','爆擊率','暴击率','Crítico','Critical chance','Critical']};
  function statCapText(key,value){
    const percent=number=>String(Math.round(number*1000)/10)+'%';
    if(key==='damageReduction')return (value>=0?'-':'+')+percent(Math.abs(value));
    if(['areaMult','reachMult','speedMult'].includes(key))return (value>=1?'+':'')+percent(value-1);
    return percent(value);
  }
  function paintStatCaps(panel){
    const values=statCapValues.get(panel);if(!values)return;
    for(const row of panel.querySelectorAll('.stat-chip')){
      const normalize=text=>(text||'').replace(/[\s（）()]/g,'');
      const label=normalize(row.querySelector('span')?.textContent),key=Object.keys(statCapLabels).find(field=>statCapLabels[field].some(text=>normalize(text)===label)),value=row.querySelector('b');
      if(!key||!value||!Number.isFinite(values.raw[key]))continue;
      // Only show overflow actually lost to a hard cap, not diminishing returns.
      if(!['damageReduction','flee','critChance'].includes(key)||!(values.raw[key]>values.effective[key]+1e-9)){
        value.querySelector('[data-ro-stat-raw]')?.remove();continue;
      }
      if(key==='critChance'&&values.raw[key]>1){const node=value.firstChild,text=statCapText(key,values.effective[key]);if(node?.nodeType===3&&node.textContent!==text)node.textContent=text;}
      let note=value.querySelector('[data-ro-stat-raw]');
      if(!note){note=document.createElement('span');note.dataset.roStatRaw=key;value.append(note);}
      const text=' ('+statCapText(key,values.raw[key])+')';if(note.textContent!==text)note.textContent=text;
      note.title=key==='critChance'?'括號為面板原始爆擊率；單次判定最多 100%，未包含戰鬥 buff／技能額外爆率':'括號為硬上限截斷前的原始加總值';
    }
  }
  function updateStatCapDisplay(){
    const character=document.querySelector('#charpanel'),panel=character?.querySelector('#cp-stats');
    if(!character||character.classList.contains('hidden')||!panel)return;
    if(!statCapPanels.has(panel)){
      let proto=Object.getPrototypeOf(panel),descriptor;
      while(proto&&!descriptor){descriptor=Object.getOwnPropertyDescriptor(proto,'innerHTML');proto=Object.getPrototypeOf(proto);}
      if(!descriptor?.get||!descriptor?.set)return;
      Object.defineProperty(panel,'innerHTML',{configurable:true,get(){return descriptor.get.call(this);},set(value){
        descriptor.set.call(this,value);const snapshot=statCapSnapshot();
        if(!statCapCapture)statCapAttempts.delete(this);
        if(snapshot)statCapValues.set(this,snapshot);else statCapValues.delete(this);
        paintStatCaps(this);
      }});
      statCapPanels.add(panel);
    }
    for(const button of character.querySelectorAll('.tab-btn, .equip-slot')){
      const original=button.onclick;if(typeof original!=='function'||statCapHandlers.get(button)===original)continue;
      const wrapped=function(...args){return withStatCapCapture(()=>Reflect.apply(original,this,args));};
      button.onclick=wrapped;statCapHandlers.set(button,wrapped);
    }
    // Tabs only toggle visibility. Re-selecting the already-selected equipment
    // slot invokes native I(), which redraws the stats without equipping gear.
    const selected=character.querySelector('.tab-btn.active[data-tab="stats"]');
    const redraw=character.querySelector('.equip-slot.sel[data-slot]');
    if(selected&&redraw&&!statCapValues.has(panel)&&!statCapAttempts.has(panel)&&typeof redraw.onclick==='function'){
      statCapAttempts.add(panel);try{redraw.onclick();}catch(error){console.debug('[RO助手] 封頂前屬性讀取失敗，保留原生顯示',error);}
    }
    paintStatCaps(panel);
  }
  // Generated from current public stage drop tables.
  const EQUIPMENT_CATALOG = [{"id":1202,"name":"短劍","slot":"weapon","wtype":"단검","icon":"https://ro.hans-webgametw.com/assets/items/1202.png","tiers":[1],"sources":[{"tier":1,"stage":"普隆德拉原野","monster":"波利","boss":false}]},{"id":2102,"name":"鐵盾","slot":"shield","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2102.png","tiers":[1,2],"sources":[{"tier":1,"stage":"普隆德拉原野","monster":"波利","boss":false},{"tier":1,"stage":"普隆德拉原野","monster":"蟲蛹","boss":false},{"tier":1,"stage":"普隆德拉原野","monster":"大嘴鳥蛋","boss":false},{"tier":1,"stage":"普隆德拉地下水道","monster":"盜蟲卵","boss":false},{"tier":2,"stage":"柏伊亞嵐島","monster":"卡那多斯","boss":false}]},{"id":2262,"name":"小丑鼻子","slot":"head_low","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2262.png","tiers":[1],"sources":[{"tier":1,"stage":"普隆德拉原野","monster":"瘋兔","boss":false}]},{"id":1502,"name":"木錘","slot":"weapon","wtype":"클럽","icon":"https://ro.hans-webgametw.com/assets/items/1502.png","tiers":[1],"sources":[{"tier":1,"stage":"普隆德拉原野","monster":"綠棉蟲","boss":false}]},{"id":1602,"name":"手杖","slot":"weapon","wtype":"롯드","icon":"https://ro.hans-webgametw.com/assets/items/1602.png","tiers":[1],"sources":[{"tier":1,"stage":"普隆德拉原野","monster":"土波利","boss":false}]},{"id":2302,"name":"棉襯衫","slot":"armor","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2302.png","tiers":[1],"sources":[{"tier":1,"stage":"普隆德拉原野","monster":"小雞","boss":false}]},{"id":2424,"name":"防水長靴","slot":"shoes","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2424.png","tiers":[1,2],"sources":[{"tier":1,"stage":"普隆德拉原野","monster":"羅達蛙","boss":false},{"tier":1,"stage":"普隆德拉原野","monster":"蛙王","boss":true},{"tier":2,"stage":"柏伊亞嵐島","monster":"劍魚","boss":false},{"tier":2,"stage":"柏伊亞嵐島","monster":"狄奧斯","boss":true},{"tier":2,"stage":"柏伊亞嵐島","monster":"海神","boss":true}]},{"id":1702,"name":"弓","slot":"weapon","wtype":"활","icon":"https://ro.hans-webgametw.com/assets/items/1702.png","tiers":[1,3],"sources":[{"tier":1,"stage":"普隆德拉原野","monster":"禿鷹","boss":false},{"tier":3,"stage":"獸人村","monster":"弓箭哥布靈","boss":false}]},{"id":1302,"name":"斧","slot":"weapon","wtype":"도끼","icon":"https://ro.hans-webgametw.com/assets/items/1302.png","tiers":[1],"sources":[{"tier":1,"stage":"普隆德拉原野","monster":"小野豬","boss":false}]},{"id":2321,"name":"絲質外袍","slot":"armor","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2321.png","tiers":[1],"sources":[{"tier":1,"stage":"普隆德拉原野","monster":"克瑞米","boss":false}]},{"id":2207,"name":"花朵頭飾","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2207.png","tiers":[1,2],"sources":[{"tier":1,"stage":"普隆德拉原野","monster":"克瑞米","boss":false},{"tier":2,"stage":"斐揚森林","monster":"刺尾蜻蜓","boss":false}]},{"id":1208,"name":"笨拙短劍","slot":"weapon","wtype":"단검","icon":"https://ro.hans-webgametw.com/assets/items/1208.png","tiers":[1],"sources":[{"tier":1,"stage":"普隆德拉原野","monster":"蜂兵","boss":false}]},{"id":1405,"name":"長矛","slot":"weapon","wtype":"창","icon":"https://ro.hans-webgametw.com/assets/items/1405.png","tiers":[1],"sources":[{"tier":1,"stage":"普隆德拉原野","monster":"曼陀羅魔花","boss":false}]},{"id":2306,"name":"冒險衣","slot":"armor","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2306.png","tiers":[1],"sources":[{"tier":1,"stage":"普隆德拉原野","monster":"沙漠幼狼","boss":false}]},{"id":13011,"name":"阿修羅","slot":"weapon","wtype":"단검","icon":"https://ro.hans-webgametw.com/assets/items/13011.png","tiers":[1],"sources":[{"tier":1,"stage":"普隆德拉原野","monster":"沙漠幼狼","boss":false}]},{"id":2298,"name":"觸角頭飾","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2298.png","tiers":[1],"sources":[{"tier":1,"stage":"普隆德拉原野","monster":"搖滾蝗蟲","boss":false}]},{"id":1402,"name":"長戟","slot":"weapon","wtype":"창","icon":"https://ro.hans-webgametw.com/assets/items/1402.png","tiers":[1],"sources":[{"tier":1,"stage":"普隆德拉原野","monster":"搖滾蝗蟲","boss":false}]},{"id":2250,"name":"粉紗髮圈","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2250.png","tiers":[1],"sources":[{"tier":1,"stage":"普隆德拉原野","monster":"月蝕兔","boss":true}]},{"id":2355,"name":"天使的守護","slot":"armor","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2355.png","tiers":[1],"sources":[{"tier":1,"stage":"普隆德拉原野","monster":"月蝕兔","boss":true}]},{"id":2244,"name":"紅蝶髮帶","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2244.png","tiers":[1],"sources":[{"tier":1,"stage":"普隆德拉原野","monster":"蛙王","boss":true}]},{"id":2245,"name":"紳士帽","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2245.png","tiers":[1],"sources":[{"tier":1,"stage":"普隆德拉原野","monster":"龍蠅","boss":true}]},{"id":2607,"name":"髮夾","slot":"acc","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2607.png","tiers":[1,2],"sources":[{"tier":1,"stage":"普隆德拉原野","monster":"龍蠅","boss":true},{"tier":1,"stage":"失事輪","monster":"水母","boss":false},{"tier":2,"stage":"柏伊亞嵐島","monster":"人魚","boss":false}]},{"id":2247,"name":"回憶帽","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2247.png","tiers":[1],"sources":[{"tier":1,"stage":"普隆德拉原野","monster":"蟋蟀王","boss":true}]},{"id":2420,"name":"天使的轉生","slot":"shoes","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2420.png","tiers":[1],"sources":[{"tier":1,"stage":"普隆德拉原野","monster":"蟋蟀王","boss":true}]},{"id":5035,"name":"波利帽","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5035.png","tiers":[1],"sources":[{"tier":1,"stage":"普隆德拉原野","monster":"波利之王","boss":true}]},{"id":2257,"name":"獸角頭飾","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2257.png","tiers":[1],"sources":[{"tier":1,"stage":"普隆德拉原野","monster":"波利之王","boss":true},{"tier":1,"stage":"失事輪","monster":"異變魚","boss":false}]},{"id":2116,"name":"天使之保護","slot":"shield","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2116.png","tiers":[1],"sources":[{"tier":1,"stage":"普隆德拉原野","monster":"波利之王","boss":true}]},{"id":2303,"name":"皮製外套","slot":"armor","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2303.png","tiers":[1],"sources":[{"tier":1,"stage":"普隆德拉地下水道","monster":"盜蟲","boss":false}]},{"id":2304,"name":"皮製外套","slot":"armor","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2304.png","tiers":[1],"sources":[{"tier":1,"stage":"普隆德拉地下水道","monster":"盜蟲","boss":false}]},{"id":1105,"name":"圓月刀","slot":"weapon","wtype":"검","icon":"https://ro.hans-webgametw.com/assets/items/1105.png","tiers":[1],"sources":[{"tier":1,"stage":"普隆德拉地下水道","monster":"吸血蝙蝠","boss":false}]},{"id":2209,"name":"紫蝶髮帶","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2209.png","tiers":[1],"sources":[{"tier":1,"stage":"普隆德拉地下水道","monster":"吸血蝙蝠","boss":false}]},{"id":2288,"name":"整人面具","slot":"head_low","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2288.png","tiers":[1],"sources":[{"tier":1,"stage":"普隆德拉地下水道","monster":"白鼠","boss":false}]},{"id":2615,"name":"防禦戒指","slot":"acc","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2615.png","tiers":[1],"sources":[{"tier":1,"stage":"普隆德拉地下水道","monster":"漂浮蟲","boss":false}]},{"id":2286,"name":"精靈耳","slot":"head_mid","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2286.png","tiers":[1,6],"sources":[{"tier":1,"stage":"普隆德拉地下水道","monster":"紅蝙蝠","boss":false},{"chapter":2,"tier":6,"stage":"吉芬地下城","monster":"紅蝙蝠","boss":false}]},{"id":1108,"name":"厚刃劍","slot":"weapon","wtype":"검","icon":"https://ro.hans-webgametw.com/assets/items/1108.png","tiers":[1],"sources":[{"tier":1,"stage":"普隆德拉地下水道","monster":"浮勒盜蟲","boss":false}]},{"id":2616,"name":"爆擊戒指","slot":"acc","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2616.png","tiers":[1],"sources":[{"tier":1,"stage":"普隆德拉地下水道","monster":"藍鼠","boss":false}]},{"id":2292,"name":"鋼鐵面具","slot":"head_low","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2292.png","tiers":[1],"sources":[{"tier":1,"stage":"普隆德拉地下水道","monster":"撕咬塔羅鼠","boss":true},{"tier":1,"stage":"普隆德拉地下水道","monster":"瘟疫塔羅鼠","boss":true},{"tier":1,"stage":"普隆德拉地下水道","monster":"鑽地塔羅鼠","boss":true}]},{"id":2627,"name":"皮帶","slot":"acc","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2627.png","tiers":[1],"sources":[{"tier":1,"stage":"普隆德拉地下水道","monster":"撕咬塔羅鼠","boss":true},{"tier":1,"stage":"普隆德拉地下水道","monster":"瘟疫塔羅鼠","boss":true},{"tier":1,"stage":"普隆德拉地下水道","monster":"鑽地塔羅鼠","boss":true}]},{"id":2620,"name":"怪盜戒指","slot":"acc","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2620.png","tiers":[1],"sources":[{"tier":1,"stage":"普隆德拉地下水道","monster":"撕咬塔羅鼠","boss":true},{"tier":1,"stage":"普隆德拉地下水道","monster":"瘟疫塔羅鼠","boss":true},{"tier":1,"stage":"普隆德拉地下水道","monster":"鑽地塔羅鼠","boss":true}]},{"id":1524,"name":"黃金之錘","slot":"weapon","wtype":"클럽","icon":"https://ro.hans-webgametw.com/assets/items/1524.png","tiers":[1],"sources":[{"tier":1,"stage":"普隆德拉地下水道","monster":"黃金蟲","boss":true}]},{"id":2246,"name":"黃金帽","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2246.png","tiers":[1],"sources":[{"tier":1,"stage":"普隆德拉地下水道","monster":"黃金蟲","boss":true}]},{"id":2610,"name":"金戒指","slot":"acc","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2610.png","tiers":[1],"sources":[{"tier":1,"stage":"普隆德拉地下水道","monster":"黃金蟲","boss":true}]},{"id":2503,"name":"披肩","slot":"garment","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2503.png","tiers":[1],"sources":[{"tier":1,"stage":"失事輪","monster":"庫克雷","boss":false}]},{"id":2405,"name":"戰士長靴","slot":"shoes","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2405.png","tiers":[1],"sources":[{"tier":1,"stage":"失事輪","monster":"庫克雷","boss":false}]},{"id":1604,"name":"橡木魔杖","slot":"weapon","wtype":"롯드","icon":"https://ro.hans-webgametw.com/assets/items/1604.png","tiers":[1],"sources":[{"tier":1,"stage":"失事輪","monster":"水母","boss":false}]},{"id":1704,"name":"坎普茲弓","slot":"weapon","wtype":"활","icon":"https://ro.hans-webgametw.com/assets/items/1704.png","tiers":[1],"sources":[{"tier":1,"stage":"失事輪","monster":"海葵","boss":false}]},{"id":13104,"name":"加立遜手槍","slot":"weapon","wtype":"권총","icon":"https://ro.hans-webgametw.com/assets/items/13104.png","tiers":[1,3],"sources":[{"tier":1,"stage":"失事輪","monster":"海葵","boss":false},{"tier":3,"stage":"獸人村","monster":"哥布靈首領","boss":true}]},{"id":2201,"name":"太陽眼鏡","slot":"head_mid","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2201.png","tiers":[1],"sources":[{"tier":1,"stage":"失事輪","monster":"海葵","boss":false}]},{"id":2333,"name":"秘銀之衣","slot":"armor","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2333.png","tiers":[1,6],"sources":[{"tier":1,"stage":"失事輪","monster":"白幽靈","boss":false},{"chapter":2,"tier":6,"stage":"吉芬地下城","monster":"白幽靈","boss":false},{"chapter":2,"tier":6,"stage":"尼芙菲姆原野","monster":"白幽靈","boss":false}]},{"id":1117,"name":"武士刀","slot":"weapon","wtype":"양손검","icon":"https://ro.hans-webgametw.com/assets/items/1117.png","tiers":[1,2],"sources":[{"tier":1,"stage":"失事輪","monster":"異變魚","boss":false},{"tier":2,"stage":"斐揚森林","monster":"青蛇","boss":false}]},{"id":2211,"name":"方頭巾","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2211.png","tiers":[1],"sources":[{"tier":1,"stage":"失事輪","monster":"邪骸海盜","boss":false}]},{"id":1104,"name":"圓月刀","slot":"weapon","wtype":"검","icon":"https://ro.hans-webgametw.com/assets/items/1104.png","tiers":[1],"sources":[{"tier":1,"stage":"失事輪","monster":"邪骸海盜","boss":false}]},{"id":2287,"name":"海盜頭巾","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2287.png","tiers":[1],"sources":[{"tier":1,"stage":"失事輪","monster":"邪骸海盜","boss":false}]},{"id":2274,"name":"亡者髮箍","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2274.png","tiers":[1,2,3],"sources":[{"tier":1,"stage":"失事輪","monster":"幽靈波利","boss":true},{"tier":2,"stage":"斐揚洞穴","monster":"邪骸戰士長","boss":true},{"tier":3,"stage":"夢羅克金字塔","monster":"幽靈波利","boss":true},{"tier":3,"stage":"夢羅克金字塔","monster":"邪骸戰士長","boss":true}]},{"id":2336,"name":"盜賊之衣","slot":"armor","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2336.png","tiers":[1,3],"sources":[{"tier":1,"stage":"失事輪","monster":"幽靈波利","boss":true},{"tier":3,"stage":"夢羅克金字塔","monster":"幽靈波利","boss":true}]},{"id":2308,"name":"大衣","slot":"armor","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2308.png","tiers":[1,2,3],"sources":[{"tier":1,"stage":"失事輪","monster":"梅納海葵","boss":true},{"tier":2,"stage":"斐揚森林","monster":"狼","boss":false},{"tier":3,"stage":"獸人村","monster":"狼","boss":false}]},{"id":2505,"name":"斗篷","slot":"garment","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2505.png","tiers":[1,2],"sources":[{"tier":1,"stage":"失事輪","monster":"梅納海葵","boss":true},{"tier":2,"stage":"柏伊亞嵐島","monster":"狄奧斯","boss":true},{"tier":2,"stage":"斐揚森林","monster":"九尾狐","boss":false},{"tier":2,"stage":"斐揚洞穴","monster":"九尾狐","boss":false}]},{"id":2406,"name":"戰士長靴","slot":"shoes","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2406.png","tiers":[1,2],"sources":[{"tier":1,"stage":"失事輪","monster":"梅納海葵","boss":true},{"tier":2,"stage":"斐揚洞穴","monster":"妖君","boss":true}]},{"id":1125,"name":"圓柄馬刀","slot":"weapon","wtype":"검","icon":"https://ro.hans-webgametw.com/assets/items/1125.png","tiers":[1],"sources":[{"tier":1,"stage":"失事輪","monster":"海盜之王","boss":true}]},{"id":1127,"name":"騎兵之劍","slot":"weapon","wtype":"검","icon":"https://ro.hans-webgametw.com/assets/items/1127.png","tiers":[1],"sources":[{"tier":1,"stage":"失事輪","monster":"海盜之王","boss":true}]},{"id":1128,"name":"海東劍","slot":"weapon","wtype":"검","icon":"https://ro.hans-webgametw.com/assets/items/1128.png","tiers":[1],"sources":[{"tier":1,"stage":"失事輪","monster":"海盜之王","boss":true}]},{"id":5019,"name":"海盜船長帽","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5019.png","tiers":[1],"sources":[{"tier":1,"stage":"失事輪","monster":"海盜之王","boss":true}]},{"id":1135,"name":"狂擊之劍","slot":"weapon","wtype":"검","icon":"https://ro.hans-webgametw.com/assets/items/1135.png","tiers":[1],"sources":[{"tier":1,"stage":"失事輪","monster":"海盜之王","boss":true}]},{"id":1189,"name":"克拉斯拿雅劍","slot":"weapon","wtype":"양손검","icon":"https://ro.hans-webgametw.com/assets/items/1189.png","tiers":[1],"sources":[{"tier":1,"stage":"失事輪","monster":"海盜之王","boss":true}]},{"id":2104,"name":"圓盾","slot":"shield","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2104.png","tiers":[2],"sources":[{"tier":2,"stage":"柏伊亞嵐島","monster":"螃蟹","boss":false},{"tier":2,"stage":"柏伊亞嵐島","monster":"大腳龍蝦","boss":true}]},{"id":2205,"name":"泳鏡","slot":"head_mid","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2205.png","tiers":[2],"sources":[{"tier":2,"stage":"柏伊亞嵐島","monster":"烏賊","boss":false},{"tier":2,"stage":"柏伊亞嵐島","monster":"人魚士兵","boss":false},{"tier":2,"stage":"柏伊亞嵐島","monster":"狄奧斯","boss":true},{"tier":2,"stage":"柏伊亞嵐島","monster":"魔鬼大烏賊","boss":true}]},{"id":2605,"name":"敏捷別針","slot":"acc","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2605.png","tiers":[2],"sources":[{"tier":2,"stage":"柏伊亞嵐島","monster":"氣泡蟲","boss":false},{"tier":2,"stage":"斐揚森林","monster":"九尾狐","boss":false},{"tier":2,"stage":"斐揚洞穴","monster":"九尾狐","boss":false}]},{"id":1460,"name":"德瑞尹長戟","slot":"weapon","wtype":"양손창","icon":"https://ro.hans-webgametw.com/assets/items/1460.png","tiers":[2],"sources":[{"tier":2,"stage":"柏伊亞嵐島","monster":"人魚士兵","boss":false},{"tier":2,"stage":"柏伊亞嵐島","monster":"海神","boss":true},{"tier":2,"stage":"柏伊亞嵐島","monster":"魔鬼大烏賊","boss":true}]},{"id":2603,"name":"項鍊","slot":"acc","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2603.png","tiers":[2],"sources":[{"tier":2,"stage":"柏伊亞嵐島","monster":"海神","boss":true},{"tier":2,"stage":"柏伊亞嵐島","monster":"大腳龍蝦","boss":true},{"tier":2,"stage":"斐揚洞穴","monster":"狂暴月夜貓","boss":true}]},{"id":2235,"name":"王冠","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2235.png","tiers":[2],"sources":[{"tier":2,"stage":"柏伊亞嵐島","monster":"大腳龍蝦","boss":true},{"tier":2,"stage":"柏伊亞嵐島","monster":"魔鬼大烏賊","boss":true}]},{"id":2509,"name":"生存斗篷","slot":"garment","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2509.png","tiers":[2],"sources":[{"tier":2,"stage":"柏伊亞嵐島","monster":"魔鬼大烏賊","boss":true}]},{"id":2220,"name":"漁夫帽","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2220.png","tiers":[2],"sources":[{"tier":2,"stage":"斐揚森林","monster":"魔菇","boss":false}]},{"id":1610,"name":"言靈魔杖","slot":"weapon","wtype":"롯드","icon":"https://ro.hans-webgametw.com/assets/items/1610.png","tiers":[2,3],"sources":[{"tier":2,"stage":"斐揚森林","monster":"樹精","boss":false},{"tier":3,"stage":"獸人村","monster":"哥布靈首領","boss":true}]},{"id":2103,"name":"圓盾","slot":"shield","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2103.png","tiers":[2],"sources":[{"tier":2,"stage":"斐揚森林","monster":"樹精","boss":false}]},{"id":1207,"name":"笨拙短劍","slot":"weapon","wtype":"단검","icon":"https://ro.hans-webgametw.com/assets/items/1207.png","tiers":[2],"sources":[{"tier":2,"stage":"斐揚森林","monster":"波波利","boss":false},{"tier":2,"stage":"斐揚洞穴","monster":"波波利","boss":false}]},{"id":1408,"name":"步兵長矛","slot":"weapon","wtype":"창","icon":"https://ro.hans-webgametw.com/assets/items/1408.png","tiers":[2],"sources":[{"tier":2,"stage":"斐揚森林","monster":"森靈","boss":false}]},{"id":2221,"name":"漁夫帽","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2221.png","tiers":[2],"sources":[{"tier":2,"stage":"斐揚森林","monster":"毒魔菇","boss":false}]},{"id":2213,"name":"貓耳髮圈","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2213.png","tiers":[2],"sources":[{"tier":2,"stage":"斐揚森林","monster":"浣熊","boss":false}]},{"id":2329,"name":"木製鎧甲","slot":"armor","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2329.png","tiers":[2],"sources":[{"tier":2,"stage":"斐揚森林","monster":"長老樹精","boss":false}]},{"id":2226,"name":"無邊帽","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2226.png","tiers":[2],"sources":[{"tier":2,"stage":"斐揚森林","monster":"刺尾蜻蜓","boss":false}]},{"id":2289,"name":"糞便帽","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2289.png","tiers":[2],"sources":[{"tier":2,"stage":"斐揚森林","monster":"大腳熊","boss":false}]},{"id":2272,"name":"停止標誌頭飾","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2272.png","tiers":[2],"sources":[{"tier":2,"stage":"斐揚森林","monster":"將軍魔碑","boss":false}]},{"id":1517,"name":"尖刃鐵錘","slot":"weapon","wtype":"클럽","icon":"https://ro.hans-webgametw.com/assets/items/1517.png","tiers":[2],"sources":[{"tier":2,"stage":"斐揚森林","monster":"土人","boss":false}]},{"id":1613,"name":"巫杖 魂咬","slot":"weapon","wtype":"롯드","icon":"https://ro.hans-webgametw.com/assets/items/1613.png","tiers":[2],"sources":[{"tier":2,"stage":"斐揚森林","monster":"土人","boss":false}]},{"id":1711,"name":"十字弓","slot":"weapon","wtype":"활","icon":"https://ro.hans-webgametw.com/assets/items/1711.png","tiers":[2],"sources":[{"tier":2,"stage":"斐揚森林","monster":"九尾狐","boss":false},{"tier":2,"stage":"斐揚洞穴","monster":"九尾狐","boss":false}]},{"id":2254,"name":"天使之翼","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2254.png","tiers":[2],"sources":[{"tier":2,"stage":"斐揚森林","monster":"天使波利","boss":true}]},{"id":2324,"name":"聖職之袍","slot":"armor","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2324.png","tiers":[2],"sources":[{"tier":2,"stage":"斐揚森林","monster":"天使波利","boss":true}]},{"id":2282,"name":"光環","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2282.png","tiers":[2],"sources":[{"tier":2,"stage":"斐揚森林","monster":"天使波利","boss":true}]},{"id":2255,"name":"惡魔髮圈","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2255.png","tiers":[2,3],"sources":[{"tier":2,"stage":"斐揚森林","monster":"惡魔波利","boss":true},{"tier":3,"stage":"迷宮森林","monster":"小巴風特","boss":false},{"tier":3,"stage":"迷宮森林","monster":"惡魔波利","boss":true},{"tier":3,"stage":"迷宮森林","monster":"巴風特","boss":true}]},{"id":2248,"name":"牛仔帽","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2248.png","tiers":[2],"sources":[{"tier":2,"stage":"斐揚森林","monster":"流浪之狼","boss":true}]},{"id":2268,"name":"煙斗","slot":"head_low","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2268.png","tiers":[2,3],"sources":[{"tier":2,"stage":"斐揚森林","monster":"虎王","boss":true},{"tier":3,"stage":"獸人村","monster":"獸人腐屍","boss":false}]},{"id":1258,"name":"火靈拳刃","slot":"weapon","wtype":"카타르","icon":"https://ro.hans-webgametw.com/assets/items/1258.png","tiers":[2],"sources":[{"tier":2,"stage":"斐揚森林","monster":"虎王","boss":true}]},{"id":1133,"name":"火靈之劍","slot":"weapon","wtype":"검","icon":"https://ro.hans-webgametw.com/assets/items/1133.png","tiers":[2],"sources":[{"tier":2,"stage":"斐揚森林","monster":"虎王","boss":true}]},{"id":13046,"name":"刺針短劍","slot":"weapon","wtype":"단검","icon":"https://ro.hans-webgametw.com/assets/items/13046.png","tiers":[2],"sources":[{"tier":2,"stage":"斐揚森林","monster":"虎王","boss":true}]},{"id":2212,"name":"獨眼龍眼罩","slot":"head_mid","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2212.png","tiers":[2,3],"sources":[{"tier":2,"stage":"斐揚洞穴","monster":"腐屍","boss":false},{"tier":3,"stage":"夢羅克金字塔","monster":"腐屍","boss":false}]},{"id":2608,"name":"念珠","slot":"acc","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2608.png","tiers":[2,3],"sources":[{"tier":2,"stage":"斐揚洞穴","monster":"腐屍","boss":false},{"tier":2,"stage":"普隆德拉城","monster":"獸人女戰士","boss":false},{"tier":3,"stage":"獸人村","monster":"獸人女戰士","boss":false},{"tier":3,"stage":"獸人村","monster":"獸人腐屍","boss":false},{"tier":3,"stage":"夢羅克金字塔","monster":"腐屍","boss":false}]},{"id":1505,"name":"鐵錘","slot":"weapon","wtype":"클럽","icon":"https://ro.hans-webgametw.com/assets/items/1505.png","tiers":[2,3],"sources":[{"tier":2,"stage":"斐揚洞穴","monster":"邪骸戰士","boss":false},{"tier":3,"stage":"夢羅克金字塔","monster":"邪骸戰士","boss":false}]},{"id":2609,"name":"骷髏戒指","slot":"acc","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2609.png","tiers":[2,3],"sources":[{"tier":2,"stage":"斐揚洞穴","monster":"邪骸戰士","boss":false},{"tier":3,"stage":"夢羅克金字塔","monster":"邪骸戰士","boss":false}]},{"id":1708,"name":"克羅伊特弓","slot":"weapon","wtype":"활","icon":"https://ro.hans-webgametw.com/assets/items/1708.png","tiers":[2,3],"sources":[{"tier":2,"stage":"斐揚洞穴","monster":"邪骸弓箭手","boss":false},{"tier":3,"stage":"獸人村","monster":"獸人弓箭手","boss":false},{"tier":3,"stage":"夢羅克金字塔","monster":"邪骸弓箭手","boss":false}]},{"id":2285,"name":"蘋果頭飾","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2285.png","tiers":[2,3],"sources":[{"tier":2,"stage":"斐揚洞穴","monster":"邪骸弓箭手","boss":false},{"tier":3,"stage":"夢羅克金字塔","monster":"邪骸弓箭手","boss":false}]},{"id":1216,"name":"雙刃短劍","slot":"weapon","wtype":"단검","icon":"https://ro.hans-webgametw.com/assets/items/1216.png","tiers":[2,3],"sources":[{"tier":2,"stage":"斐揚洞穴","monster":"邪骸士兵","boss":false},{"tier":3,"stage":"夢羅克金字塔","monster":"邪骸士兵","boss":false}]},{"id":1214,"name":"大駒短劍","slot":"weapon","wtype":"단검","icon":"https://ro.hans-webgametw.com/assets/items/1214.png","tiers":[2,3],"sources":[{"tier":2,"stage":"斐揚洞穴","monster":"邪骸士兵","boss":false},{"tier":3,"stage":"夢羅克金字塔","monster":"邪骸士兵","boss":false}]},{"id":2305,"name":"冒險衣","slot":"armor","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2305.png","tiers":[2],"sources":[{"tier":2,"stage":"斐揚洞穴","monster":"殭屍","boss":false}]},{"id":2404,"name":"長靴","slot":"shoes","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2404.png","tiers":[2],"sources":[{"tier":2,"stage":"斐揚洞穴","monster":"殭屍","boss":false}]},{"id":2264,"name":"殭屍帽","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2264.png","tiers":[2],"sources":[{"tier":2,"stage":"斐揚洞穴","monster":"殭屍","boss":false}]},{"id":2337,"name":"忍服 血櫻","slot":"armor","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2337.png","tiers":[2],"sources":[{"tier":2,"stage":"斐揚洞穴","monster":"殭屍","boss":false}]},{"id":5046,"name":"妖道帽","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5046.png","tiers":[2],"sources":[{"tier":2,"stage":"斐揚洞穴","monster":"妖道","boss":false}]},{"id":2504,"name":"披肩","slot":"garment","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2504.png","tiers":[2],"sources":[{"tier":2,"stage":"斐揚洞穴","monster":"鬼女","boss":false}]},{"id":1217,"name":"雙刃短劍","slot":"weapon","wtype":"단검","icon":"https://ro.hans-webgametw.com/assets/items/1217.png","tiers":[2],"sources":[{"tier":2,"stage":"斐揚洞穴","monster":"鬼女","boss":false}]},{"id":2277,"name":"護士帽","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2277.png","tiers":[2],"sources":[{"tier":2,"stage":"斐揚洞穴","monster":"鬼女","boss":false}]},{"id":1351,"name":"巨斧","slot":"weapon","wtype":"양손도끼","icon":"https://ro.hans-webgametw.com/assets/items/1351.png","tiers":[2],"sources":[{"tier":2,"stage":"斐揚洞穴","monster":"鬼火","boss":false}]},{"id":13151,"name":"風暴來福槍","slot":"weapon","wtype":"라이플","icon":"https://ro.hans-webgametw.com/assets/items/13151.png","tiers":[2,3],"sources":[{"tier":2,"stage":"斐揚洞穴","monster":"鬼火","boss":false},{"tier":3,"stage":"獸人村","monster":"哥布靈首領","boss":true}]},{"id":2107,"name":"鏡盾","slot":"shield","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2107.png","tiers":[2],"sources":[{"tier":2,"stage":"斐揚洞穴","monster":"鬼火","boss":false}]},{"id":1219,"name":"長柄短劍","slot":"weapon","wtype":"단검","icon":"https://ro.hans-webgametw.com/assets/items/1219.png","tiers":[2,3],"sources":[{"tier":2,"stage":"斐揚洞穴","monster":"邪骸戰士長","boss":true},{"tier":3,"stage":"夢羅克金字塔","monster":"邪骸戰士長","boss":true}]},{"id":1220,"name":"長柄短劍","slot":"weapon","wtype":"단검","icon":"https://ro.hans-webgametw.com/assets/items/1220.png","tiers":[2,3],"sources":[{"tier":2,"stage":"斐揚洞穴","monster":"邪骸戰士長","boss":true},{"tier":3,"stage":"夢羅克金字塔","monster":"邪骸戰士長","boss":true}]},{"id":1234,"name":"月靈短劍","slot":"weapon","wtype":"단검","icon":"https://ro.hans-webgametw.com/assets/items/1234.png","tiers":[2],"sources":[{"tier":2,"stage":"斐揚洞穴","monster":"狂暴月夜貓","boss":true},{"tier":2,"stage":"斐揚洞穴","monster":"月夜貓","boss":true}]},{"id":5008,"name":"花冠","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5008.png","tiers":[2],"sources":[{"tier":2,"stage":"斐揚洞穴","monster":"狂暴月夜貓","boss":true}]},{"id":1525,"name":"秘銀長錘","slot":"weapon","wtype":"클럽","icon":"https://ro.hans-webgametw.com/assets/items/1525.png","tiers":[2],"sources":[{"tier":2,"stage":"斐揚洞穴","monster":"月夜貓","boss":true}]},{"id":1648,"name":"波爾多之杖","slot":"weapon","wtype":"롯드","icon":"https://ro.hans-webgametw.com/assets/items/1648.png","tiers":[2,3],"sources":[{"tier":2,"stage":"斐揚洞穴","monster":"月夜貓","boss":true},{"tier":3,"stage":"迷宮森林","monster":"狂暴大腳熊","boss":true}]},{"id":1477,"name":"妖怪的槍","slot":"weapon","wtype":"양손창","icon":"https://ro.hans-webgametw.com/assets/items/1477.png","tiers":[2],"sources":[{"tier":2,"stage":"斐揚洞穴","monster":"月夜貓","boss":true}]},{"id":1401,"name":"長戟","slot":"weapon","wtype":"창","icon":"https://ro.hans-webgametw.com/assets/items/1401.png","tiers":[2,3],"sources":[{"tier":2,"stage":"普隆德拉城","monster":"獸人戰士","boss":false},{"tier":3,"stage":"獸人村","monster":"哥布林","boss":false},{"tier":3,"stage":"獸人村","monster":"獸人戰士","boss":false},{"tier":3,"stage":"迷宮森林","monster":"黑蛇","boss":false}]},{"id":2314,"name":"鋼鐵鎖子甲","slot":"armor","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2314.png","tiers":[2,3],"sources":[{"tier":2,"stage":"普隆德拉城","monster":"獸人戰士","boss":false},{"tier":3,"stage":"獸人村","monster":"狗頭人","boss":false},{"tier":3,"stage":"獸人村","monster":"獸人戰士","boss":false}]},{"id":2210,"name":"髮箍","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2210.png","tiers":[2,3],"sources":[{"tier":2,"stage":"普隆德拉城","monster":"獸人戰士","boss":false},{"tier":3,"stage":"獸人村","monster":"哥布林","boss":false},{"tier":3,"stage":"獸人村","monster":"弓箭哥布靈","boss":false},{"tier":3,"stage":"獸人村","monster":"獸人戰士","boss":false}]},{"id":2501,"name":"連帽披肩","slot":"garment","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2501.png","tiers":[2,3],"sources":[{"tier":2,"stage":"普隆德拉城","monster":"獸人女戰士","boss":false},{"tier":3,"stage":"獸人村","monster":"哥布林","boss":false},{"tier":3,"stage":"獸人村","monster":"獸人嬰兒","boss":false},{"tier":3,"stage":"獸人村","monster":"獸人女戰士","boss":false},{"tier":3,"stage":"夢羅克金字塔","monster":"木乃伊","boss":false}]},{"id":2401,"name":"輕便鞋","slot":"shoes","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2401.png","tiers":[2,3],"sources":[{"tier":2,"stage":"普隆德拉城","monster":"獸人女戰士","boss":false},{"tier":3,"stage":"獸人村","monster":"狗頭人","boss":false},{"tier":3,"stage":"獸人村","monster":"獸人女戰士","boss":false},{"tier":3,"stage":"獸人村","monster":"獸人弓箭手","boss":false},{"tier":3,"stage":"夢羅克金字塔","monster":"黑狐","boss":false}]},{"id":1452,"name":"彎刃長矛","slot":"weapon","wtype":"양손창","icon":"https://ro.hans-webgametw.com/assets/items/1452.png","tiers":[3],"sources":[{"tier":3,"stage":"獸人村","monster":"狗頭人","boss":false},{"tier":3,"stage":"夢羅克金字塔","monster":"牛頭人","boss":false},{"tier":3,"stage":"迷宮森林","monster":"狂暴螳螂","boss":false}]},{"id":2604,"name":"手套","slot":"acc","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2604.png","tiers":[3],"sources":[{"tier":3,"stage":"獸人村","monster":"狗頭人","boss":false},{"tier":3,"stage":"夢羅克金字塔","monster":"黑狐","boss":false},{"tier":3,"stage":"迷宮森林","monster":"赤蒼蠅","boss":false}]},{"id":2299,"name":"獸人頭盔","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2299.png","tiers":[3],"sources":[{"tier":3,"stage":"獸人村","monster":"獸人嬰兒","boss":false}]},{"id":2619,"name":"神射手套","slot":"acc","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2619.png","tiers":[3],"sources":[{"tier":3,"stage":"獸人村","monster":"弓箭哥布靈","boss":false}]},{"id":2310,"name":"長大衣","slot":"armor","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2310.png","tiers":[3],"sources":[{"tier":3,"stage":"獸人村","monster":"獸人腐屍","boss":false},{"tier":3,"stage":"夢羅克金字塔","monster":"牛頭人","boss":false},{"tier":3,"stage":"迷宮森林","monster":"艾吉歐蜈蚣","boss":false}]},{"id":2316,"name":"鋼鐵鎧甲","slot":"armor","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2316.png","tiers":[3],"sources":[{"tier":3,"stage":"獸人村","monster":"獸人腐屍","boss":false}]},{"id":2297,"name":"哥布靈面具","slot":"head_low","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2297.png","tiers":[3],"sources":[{"tier":3,"stage":"獸人村","monster":"哥布靈首領","boss":true}]},{"id":1806,"name":"賀勒拳套","slot":"weapon","wtype":"taekwon","icon":"https://ro.hans-webgametw.com/assets/items/1806.png","tiers":[3],"sources":[{"tier":3,"stage":"獸人村","monster":"哥布靈首領","boss":true}]},{"id":1358,"name":"毀滅之斧","slot":"weapon","wtype":"양손도끼","icon":"https://ro.hans-webgametw.com/assets/items/1358.png","tiers":[3],"sources":[{"tier":3,"stage":"獸人村","monster":"哥布靈首領","boss":true}]},{"id":13103,"name":"鮮紅閃電手槍","slot":"weapon","wtype":"권총","icon":"https://ro.hans-webgametw.com/assets/items/13103.png","tiers":[3],"sources":[{"tier":3,"stage":"獸人村","monster":"哥布靈首領","boss":true}]},{"id":13155,"name":"黑玫瑰霰彈槍","slot":"weapon","wtype":"샷건","icon":"https://ro.hans-webgametw.com/assets/items/13155.png","tiers":[3],"sources":[{"tier":3,"stage":"獸人村","monster":"哥布靈首領","boss":true}]},{"id":5113,"name":"憤怒的嘴","slot":"head_low","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5113.png","tiers":[3],"sources":[{"tier":3,"stage":"獸人村","monster":"哥布靈首領","boss":true}]},{"id":2114,"name":"石製圓盾","slot":"shield","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2114.png","tiers":[3],"sources":[{"tier":3,"stage":"獸人村","monster":"犬妖首領","boss":true}]},{"id":1718,"name":"獵人之弓","slot":"weapon","wtype":"활","icon":"https://ro.hans-webgametw.com/assets/items/1718.png","tiers":[3],"sources":[{"tier":3,"stage":"獸人村","monster":"犬妖首領","boss":true}]},{"id":13301,"name":"風魔輪飛鏢","slot":"weapon","wtype":"수리검","icon":"https://ro.hans-webgametw.com/assets/items/13301.png","tiers":[3],"sources":[{"tier":3,"stage":"獸人村","monster":"犬妖首領","boss":true}]},{"id":1958,"name":"幸運鞭子","slot":"weapon","wtype":"채찍","icon":"https://ro.hans-webgametw.com/assets/items/1958.png","tiers":[3],"sources":[{"tier":3,"stage":"獸人村","monster":"犬妖首領","boss":true}]},{"id":1801,"name":"虎爪拳套","slot":"weapon","wtype":"taekwon","icon":"https://ro.hans-webgametw.com/assets/items/1801.png","tiers":[3],"sources":[{"tier":3,"stage":"獸人村","monster":"犬妖首領","boss":true}]},{"id":1616,"name":"羽翼之杖","slot":"weapon","wtype":"롯드","icon":"https://ro.hans-webgametw.com/assets/items/1616.png","tiers":[3],"sources":[{"tier":3,"stage":"獸人村","monster":"犬妖首領","boss":true}]},{"id":1908,"name":"吉他","slot":"weapon","wtype":"악기","icon":"https://ro.hans-webgametw.com/assets/items/1908.png","tiers":[3],"sources":[{"tier":3,"stage":"獸人村","monster":"犬妖首領","boss":true}]},{"id":2267,"name":"香菸","slot":"head_low","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2267.png","tiers":[3],"sources":[{"tier":3,"stage":"獸人村","monster":"犬妖首領","boss":true}]},{"id":1124,"name":"獸人刀","slot":"weapon","wtype":"검","icon":"https://ro.hans-webgametw.com/assets/items/1124.png","tiers":[3],"sources":[{"tier":3,"stage":"獸人村","monster":"獸人英雄","boss":true}]},{"id":13156,"name":"守門霰彈槍","slot":"weapon","wtype":"샷건","icon":"https://ro.hans-webgametw.com/assets/items/13156.png","tiers":[3],"sources":[{"tier":3,"stage":"獸人村","monster":"獸人英雄","boss":true}]},{"id":1734,"name":"獸人弓箭手之弓","slot":"weapon","wtype":"활","icon":"https://ro.hans-webgametw.com/assets/items/1734.png","tiers":[3],"sources":[{"tier":3,"stage":"獸人村","monster":"獸人英雄","boss":true}]},{"id":1222,"name":"大馬士革短劍","slot":"weapon","wtype":"단검","icon":"https://ro.hans-webgametw.com/assets/items/1222.png","tiers":[3],"sources":[{"tier":3,"stage":"獸人村","monster":"獸人英雄","boss":true}]},{"id":13303,"name":"風魔熱火飛鏢","slot":"weapon","wtype":"수리검","icon":"https://ro.hans-webgametw.com/assets/items/13303.png","tiers":[3],"sources":[{"tier":3,"stage":"獸人村","monster":"獸人英雄","boss":true}]},{"id":1387,"name":"巨人斧","slot":"weapon","wtype":"양손도끼","icon":"https://ro.hans-webgametw.com/assets/items/1387.png","tiers":[3],"sources":[{"tier":3,"stage":"獸人村","monster":"獸人英雄","boss":true}]},{"id":1366,"name":"智天使之斧","slot":"weapon","wtype":"양손도끼","icon":"https://ro.hans-webgametw.com/assets/items/1366.png","tiers":[3],"sources":[{"tier":3,"stage":"獸人村","monster":"獸人英雄","boss":true}]},{"id":2106,"name":"鋼盾","slot":"shield","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2106.png","tiers":[3],"sources":[{"tier":3,"stage":"獸人村","monster":"獸人英雄","boss":true}]},{"id":2203,"name":"眼鏡","slot":"head_mid","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2203.png","tiers":[3],"sources":[{"tier":3,"stage":"夢羅克金字塔","monster":"木乃伊犬","boss":false},{"tier":3,"stage":"夢羅克金字塔","monster":"邪骸獸人","boss":false}]},{"id":2612,"name":"花戒指","slot":"acc","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2612.png","tiers":[3],"sources":[{"tier":3,"stage":"夢羅克金字塔","monster":"木乃伊","boss":false},{"tier":3,"stage":"夢羅克金字塔","monster":"邪骸獸人","boss":false}]},{"id":2330,"name":"緊身便衣","slot":"armor","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2330.png","tiers":[3],"sources":[{"tier":3,"stage":"夢羅克金字塔","monster":"木乃伊","boss":false}]},{"id":2208,"name":"紫蝶髮帶","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2208.png","tiers":[3],"sources":[{"tier":3,"stage":"夢羅克金字塔","monster":"邪骸獸人","boss":false},{"tier":3,"stage":"夢羅克金字塔","monster":"伊希斯","boss":false},{"tier":3,"stage":"迷宮森林","monster":"小巴風特","boss":false}]},{"id":2511,"name":"邪骸戰士的斗篷","slot":"garment","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2511.png","tiers":[3],"sources":[{"tier":3,"stage":"夢羅克金字塔","monster":"邪骸獸人","boss":false}]},{"id":2602,"name":"智力耳環","slot":"acc","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2602.png","tiers":[3],"sources":[{"tier":3,"stage":"夢羅克金字塔","monster":"伊希斯","boss":false}]},{"id":2617,"name":"智慧手套","slot":"acc","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2617.png","tiers":[3],"sources":[{"tier":3,"stage":"夢羅克金字塔","monster":"伊希斯","boss":false}]},{"id":2411,"name":"重靴","slot":"shoes","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2411.png","tiers":[3],"sources":[{"tier":3,"stage":"夢羅克金字塔","monster":"牛頭人","boss":false}]},{"id":2124,"name":"刺針盾牌","slot":"shield","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2124.png","tiers":[3],"sources":[{"tier":3,"stage":"夢羅克金字塔","monster":"狂暴木乃伊","boss":true}]},{"id":2611,"name":"銀戒指","slot":"acc","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2611.png","tiers":[3],"sources":[{"tier":3,"stage":"夢羅克金字塔","monster":"狂暴木乃伊","boss":true}]},{"id":1377,"name":"狂暴颶風斧","slot":"weapon","wtype":"양손도끼","icon":"https://ro.hans-webgametw.com/assets/items/1377.png","tiers":[3],"sources":[{"tier":3,"stage":"夢羅克金字塔","monster":"狂暴木乃伊","boss":true}]},{"id":1513,"name":"日星錘","slot":"weapon","wtype":"클럽","icon":"https://ro.hans-webgametw.com/assets/items/1513.png","tiers":[3],"sources":[{"tier":3,"stage":"夢羅克金字塔","monster":"狂暴木乃伊","boss":true}]},{"id":1909,"name":"豎琴","slot":"weapon","wtype":"악기","icon":"https://ro.hans-webgametw.com/assets/items/1909.png","tiers":[3],"sources":[{"tier":3,"stage":"夢羅克金字塔","monster":"狂暴木乃伊","boss":true}]},{"id":1614,"name":"聖杖 英靈","slot":"weapon","wtype":"롯드","icon":"https://ro.hans-webgametw.com/assets/items/1614.png","tiers":[3],"sources":[{"tier":3,"stage":"夢羅克金字塔","monster":"狂暴木乃伊","boss":true}]},{"id":1615,"name":"骷髏魔杖","slot":"weapon","wtype":"롯드","icon":"https://ro.hans-webgametw.com/assets/items/1615.png","tiers":[3],"sources":[{"tier":3,"stage":"夢羅克金字塔","monster":"狂暴木乃伊","boss":true}]},{"id":1260,"name":"骸靈拳刃","slot":"weapon","wtype":"카타르","icon":"https://ro.hans-webgametw.com/assets/items/1260.png","tiers":[3],"sources":[{"tier":3,"stage":"夢羅克金字塔","monster":"狂暴木乃伊","boss":true}]},{"id":2618,"name":"黑狐頸鏈","slot":"acc","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2618.png","tiers":[3],"sources":[{"tier":3,"stage":"夢羅克金字塔","monster":"狂暴木乃伊","boss":true}]},{"id":1254,"name":"秘刃 闇嘯","slot":"weapon","wtype":"카타르","icon":"https://ro.hans-webgametw.com/assets/items/1254.png","tiers":[3],"sources":[{"tier":3,"stage":"夢羅克金字塔","monster":"俄塞里斯","boss":true}]},{"id":1370,"name":"超重雙手斧","slot":"weapon","wtype":"양손도끼","icon":"https://ro.hans-webgametw.com/assets/items/1370.png","tiers":[3],"sources":[{"tier":3,"stage":"夢羅克金字塔","monster":"俄塞里斯","boss":true}]},{"id":1813,"name":"風靈拳套","slot":"weapon","wtype":"너클","icon":"https://ro.hans-webgametw.com/assets/items/1813.png","tiers":[3],"sources":[{"tier":3,"stage":"夢羅克金字塔","monster":"俄塞里斯","boss":true}]},{"id":1913,"name":"電子吉他","slot":"weapon","wtype":"악기","icon":"https://ro.hans-webgametw.com/assets/items/1913.png","tiers":[3],"sources":[{"tier":3,"stage":"夢羅克金字塔","monster":"俄塞里斯","boss":true}]},{"id":1964,"name":"秘鞭 眷戀","slot":"weapon","wtype":"채찍","icon":"https://ro.hans-webgametw.com/assets/items/1964.png","tiers":[3],"sources":[{"tier":3,"stage":"夢羅克金字塔","monster":"俄塞里斯","boss":true}]},{"id":1285,"name":"恰克蘭拳刃","slot":"weapon","wtype":"카타르","icon":"https://ro.hans-webgametw.com/assets/items/1285.png","tiers":[3],"sources":[{"tier":3,"stage":"夢羅克金字塔","monster":"俄塞里斯","boss":true}]},{"id":13153,"name":"昏暗來福槍","slot":"weapon","wtype":"라이플","icon":"https://ro.hans-webgametw.com/assets/items/13153.png","tiers":[3],"sources":[{"tier":3,"stage":"夢羅克金字塔","monster":"俄塞里斯","boss":true}]},{"id":5053,"name":"人面獅身帽","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5053.png","tiers":[3],"sources":[{"tier":3,"stage":"夢羅克金字塔","monster":"俄塞里斯","boss":true}]},{"id":2110,"name":"聖耀之盾","slot":"shield","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2110.png","tiers":[3],"sources":[{"tier":3,"stage":"迷宮森林","monster":"狂暴大腳熊","boss":true}]},{"id":2601,"name":"力量戒指","slot":"acc","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2601.png","tiers":[3],"sources":[{"tier":3,"stage":"迷宮森林","monster":"狂暴大腳熊","boss":true}]},{"id":1555,"name":"火靈之書","slot":"weapon","wtype":"책","icon":"https://ro.hans-webgametw.com/assets/items/1555.png","tiers":[3],"sources":[{"tier":3,"stage":"迷宮森林","monster":"狂暴大腳熊","boss":true}]},{"id":1809,"name":"龍爪拳套","slot":"weapon","wtype":"너클","icon":"https://ro.hans-webgametw.com/assets/items/1809.png","tiers":[3],"sources":[{"tier":3,"stage":"迷宮森林","monster":"狂暴大腳熊","boss":true}]},{"id":1551,"name":"聖言之書","slot":"weapon","wtype":"책","icon":"https://ro.hans-webgametw.com/assets/items/1551.png","tiers":[3],"sources":[{"tier":3,"stage":"迷宮森林","monster":"狂暴大腳熊","boss":true}]},{"id":1816,"name":"秘拳套 閃光","slot":"weapon","wtype":"너클","icon":"https://ro.hans-webgametw.com/assets/items/1816.png","tiers":[3],"sources":[{"tier":3,"stage":"迷宮森林","monster":"狂暴大腳熊","boss":true}]},{"id":1305,"name":"切削之斧","slot":"weapon","wtype":"도끼","icon":"https://ro.hans-webgametw.com/assets/items/1305.png","tiers":[3],"sources":[{"tier":3,"stage":"迷宮森林","monster":"狂暴大腳熊","boss":true}]},{"id":2419,"name":"哥夫內軍靴","slot":"shoes","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2419.png","tiers":[3],"sources":[{"tier":3,"stage":"迷宮森林","monster":"雪熊","boss":true}]},{"id":2507,"name":"伯爵斗篷","slot":"garment","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2507.png","tiers":[3],"sources":[{"tier":3,"stage":"迷宮森林","monster":"雪熊","boss":true}]},{"id":1261,"name":"刺殺拳刃","slot":"weapon","wtype":"단검","icon":"https://ro.hans-webgametw.com/assets/items/1261.png","tiers":[3],"sources":[{"tier":3,"stage":"迷宮森林","monster":"雪熊","boss":true}]},{"id":1519,"name":"鏈錘","slot":"weapon","wtype":"클럽","icon":"https://ro.hans-webgametw.com/assets/items/1519.png","tiers":[3],"sources":[{"tier":3,"stage":"迷宮森林","monster":"雪熊","boss":true}]},{"id":1163,"name":"十字巨劍","slot":"weapon","wtype":"양손검","icon":"https://ro.hans-webgametw.com/assets/items/1163.png","tiers":[3],"sources":[{"tier":3,"stage":"迷宮森林","monster":"雪熊","boss":true}]},{"id":2122,"name":"白金鋼盾","slot":"shield","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2122.png","tiers":[3],"sources":[{"tier":3,"stage":"迷宮森林","monster":"雪熊","boss":true}]},{"id":13300,"name":"風魔翼飛鏢","slot":"weapon","wtype":"수리검","icon":"https://ro.hans-webgametw.com/assets/items/13300.png","tiers":[3],"sources":[{"tier":3,"stage":"迷宮森林","monster":"雪熊","boss":true}]},{"id":1957,"name":"流星鞭子","slot":"weapon","wtype":"채찍","icon":"https://ro.hans-webgametw.com/assets/items/1957.png","tiers":[3],"sources":[{"tier":3,"stage":"迷宮森林","monster":"雪熊","boss":true}]},{"id":1466,"name":"死神之鐮","slot":"weapon","wtype":"양손창","icon":"https://ro.hans-webgametw.com/assets/items/1466.png","tiers":[3],"sources":[{"tier":3,"stage":"迷宮森林","monster":"巴風特","boss":true}]},{"id":1557,"name":"預言錄","slot":"weapon","wtype":"책","icon":"https://ro.hans-webgametw.com/assets/items/1557.png","tiers":[3],"sources":[{"tier":3,"stage":"迷宮森林","monster":"巴風特","boss":true}]},{"id":1262,"name":"洛奇的指甲","slot":"weapon","wtype":"카타르","icon":"https://ro.hans-webgametw.com/assets/items/1262.png","tiers":[3],"sources":[{"tier":3,"stage":"迷宮森林","monster":"巴風特","boss":true}]},{"id":2256,"name":"山羊頭盔","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2256.png","tiers":[3],"sources":[{"tier":3,"stage":"迷宮森林","monster":"巴風特","boss":true}]},{"id":1263,"name":"邪惡拳刃","slot":"weapon","wtype":"카타르","icon":"https://ro.hans-webgametw.com/assets/items/1263.png","tiers":[3],"sources":[{"tier":3,"stage":"迷宮森林","monster":"巴風特","boss":true}]},{"id":13164,"name":"長身來福槍","slot":"weapon","wtype":"라이플","icon":"https://ro.hans-webgametw.com/assets/items/13164.png","tiers":[3],"sources":[{"tier":3,"stage":"迷宮森林","monster":"巴風特","boss":true}]},{"id":1526,"name":"魔錘 安魂曲","slot":"weapon","wtype":"클럽","icon":"https://ro.hans-webgametw.com/assets/items/1526.png","tiers":[3],"sources":[{"tier":3,"stage":"迷宮森林","monster":"巴風特","boss":true}]},{"id":39001,"name":"聖誕版海東劍","slot":"weapon","wtype":"검","icon":"https://ro.hans-webgametw.com/assets/items/1128.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"聖誕哥布靈","boss":false}]},{"id":39039,"name":"聖誕版輕便鞋","slot":"shoes","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2401.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"聖誕哥布靈","boss":false}]},{"id":5382,"name":"鈴鐺髮帶","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5382.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"聖誕哥布靈","boss":false}]},{"id":1211,"name":"德克短劍","slot":"weapon","wtype":"단검","icon":"https://ro.hans-webgametw.com/assets/items/1211.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"聖誕哥布靈","boss":false}]},{"id":5445,"name":"小鬼棒棒糖","slot":"head_low","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5445.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"聖誕哥布靈","boss":false}]},{"id":39003,"name":"聖誕版刺針短劍","slot":"weapon","wtype":"단검","icon":"https://ro.hans-webgametw.com/assets/items/13046.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"綠餅人","boss":false}]},{"id":39037,"name":"聖誕版連帽披肩","slot":"garment","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2501.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"綠餅人","boss":false}]},{"id":5381,"name":"聖誕波利帽","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5381.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"綠餅人","boss":false}]},{"id":5028,"name":"蠟燭頭飾","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5028.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"綠餅人","boss":false}]},{"id":2636,"name":"聖誕金戒","slot":"acc","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2636.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"綠餅人","boss":false}]},{"id":39014,"name":"聖誕版火靈之書","slot":"weapon","wtype":"책","icon":"https://ro.hans-webgametw.com/assets/items/1555.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"甜餅人","boss":false}]},{"id":39043,"name":"聖誕版花戒指","slot":"acc","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2612.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"甜餅人","boss":false}]},{"id":5441,"name":"雪白髮帶","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5441.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"甜餅人","boss":false}]},{"id":2637,"name":"聖誕銀戒","slot":"acc","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2637.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"甜餅人","boss":false}]},{"id":5197,"name":"白色髮帶","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5197.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"甜餅人","boss":false}]},{"id":39019,"name":"聖誕版弓","slot":"weapon","wtype":"활","icon":"https://ro.hans-webgametw.com/assets/items/1702.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"玩具士兵","boss":false}]},{"id":39026,"name":"聖誕版加立遜手槍","slot":"weapon","wtype":"권총","icon":"https://ro.hans-webgametw.com/assets/items/13104.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"玩具士兵","boss":false}]},{"id":39034,"name":"聖誕版鋼盾","slot":"shield","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2106.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"玩具士兵","boss":false}]},{"id":2294,"name":"星星髮夾","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2294.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"玩具士兵","boss":false}]},{"id":39013,"name":"聖誕版魔錘 安魂曲","slot":"weapon","wtype":"클럽","icon":"https://ro.hans-webgametw.com/assets/items/1526.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"邪惡禮盒","boss":false}]},{"id":39040,"name":"聖誕版智慧手套","slot":"acc","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2617.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"邪惡禮盒","boss":false}]},{"id":5091,"name":"巨大的金鈴鐺","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5091.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"邪惡禮盒","boss":false}]},{"id":5051,"name":"貓貓鈴鐺","slot":"head_low","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5051.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"邪惡禮盒","boss":false}]},{"id":2749,"name":"亞麻手套","slot":"acc","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2749.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"邪惡禮盒","boss":false}]},{"id":39016,"name":"聖誕版羽翼之杖","slot":"weapon","wtype":"롯드","icon":"https://ro.hans-webgametw.com/assets/items/1616.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"小雪獸","boss":false}]},{"id":39032,"name":"聖誕版緊身便衣","slot":"armor","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2330.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"小雪獸","boss":false}]},{"id":5204,"name":"魯道夫麋鹿鼻","slot":"head_low","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5204.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"小雪獸","boss":false}]},{"id":5115,"name":"時尚防寒帽","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5115.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"小雪獸","boss":false}]},{"id":39009,"name":"聖誕版巨人斧","slot":"weapon","wtype":"양손도끼","icon":"https://ro.hans-webgametw.com/assets/items/1387.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"雪獸","boss":false}]},{"id":39031,"name":"聖誕版鋼鐵鎧甲","slot":"armor","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2316.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"雪獸","boss":false}]},{"id":5738,"name":"雪人帽","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5738.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"雪獸","boss":false}]},{"id":1819,"name":"冰柱拳套","slot":"weapon","wtype":"너클","icon":"https://ro.hans-webgametw.com/assets/items/1819.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"雪獸","boss":false}]},{"id":2550,"name":"釣客圍巾","slot":"garment","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2550.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"雪獸","boss":false}]},{"id":39021,"name":"聖誕版秘拳套 閃光","slot":"weapon","wtype":"너클","icon":"https://ro.hans-webgametw.com/assets/items/1816.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"玩偶熊","boss":false}]},{"id":39022,"name":"聖誕版豎琴","slot":"weapon","wtype":"악기","icon":"https://ro.hans-webgametw.com/assets/items/1909.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"玩偶熊","boss":false}]},{"id":39024,"name":"聖誕版幸運鞭子","slot":"weapon","wtype":"채찍","icon":"https://ro.hans-webgametw.com/assets/items/1958.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"玩偶熊","boss":false}]},{"id":13106,"name":"黃金勒克斯手槍","slot":"weapon","wtype":"권총","icon":"https://ro.hans-webgametw.com/assets/items/13106.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"玩偶熊","boss":false}]},{"id":5059,"name":"小熊帽","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5059.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"玩偶熊","boss":false}]},{"id":39005,"name":"聖誕版秘刃 闇嘯","slot":"weapon","wtype":"카타르","icon":"https://ro.hans-webgametw.com/assets/items/1254.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"蓋俄斯提","boss":true}]},{"id":39017,"name":"聖誕版聖杖 英靈","slot":"weapon","wtype":"롯드","icon":"https://ro.hans-webgametw.com/assets/items/1614.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"蓋俄斯提","boss":true}]},{"id":39041,"name":"聖誕版神射手套","slot":"acc","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2619.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"蓋俄斯提","boss":true}]},{"id":39044,"name":"聖誕版獨眼龍眼罩","slot":"head_mid","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2212.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"蓋俄斯提","boss":true}]},{"id":39029,"name":"聖誕版風魔輪飛鏢","slot":"weapon","wtype":"수리검","icon":"https://ro.hans-webgametw.com/assets/items/13301.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"蓋俄斯提","boss":true}]},{"id":2700,"name":"封印的紅色綢緞","slot":"acc","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2700.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"蓋俄斯提","boss":true},{"tier":3,"stage":"元宵節","monster":"白素貞","boss":true},{"tier":3,"stage":"元宵節","monster":"墨蛇君","boss":true,"rare":true}]},{"id":1731,"name":"冰凍之弓","slot":"weapon","wtype":"활","icon":"https://ro.hans-webgametw.com/assets/items/1731.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"蓋俄斯提","boss":true}]},{"id":5111,"name":"啤酒企鵝之帽","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5111.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"蓋俄斯提","boss":true}]},{"id":39012,"name":"聖誕版日星錘","slot":"weapon","wtype":"클럽","icon":"https://ro.hans-webgametw.com/assets/items/1513.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"水靈龜","boss":true}]},{"id":39015,"name":"聖誕版聖言之書","slot":"weapon","wtype":"책","icon":"https://ro.hans-webgametw.com/assets/items/1551.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"水靈龜","boss":true}]},{"id":39023,"name":"聖誕版吉他","slot":"weapon","wtype":"악기","icon":"https://ro.hans-webgametw.com/assets/items/1908.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"水靈龜","boss":true}]},{"id":39036,"name":"聖誕版邪骸戰士的斗篷","slot":"garment","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2511.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"水靈龜","boss":true}]},{"id":5811,"name":"聖誕老人鬍子","slot":"head_low","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5811.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"水靈龜","boss":true}]},{"id":2513,"name":"薄紗圍巾","slot":"garment","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2513.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"水靈龜","boss":true},{"tier":3,"stage":"元宵節","monster":"猴桃木","boss":false},{"tier":3,"stage":"元宵節","monster":"小青","boss":true},{"tier":3,"stage":"元宵節","monster":"白素貞","boss":true}]},{"id":1966,"name":"冰劍鞭子","slot":"weapon","wtype":"채찍","icon":"https://ro.hans-webgametw.com/assets/items/1966.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"水靈龜","boss":true}]},{"id":39008,"name":"聖誕版毀滅之斧","slot":"weapon","wtype":"양손도끼","icon":"https://ro.hans-webgametw.com/assets/items/1358.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"冰巨人","boss":true}]},{"id":39030,"name":"聖誕版鋼鐵鎖子甲","slot":"armor","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2314.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"冰巨人","boss":true}]},{"id":39035,"name":"聖誕版白金鋼盾","slot":"shield","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2122.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"冰巨人","boss":true}]},{"id":39038,"name":"聖誕版重靴","slot":"shoes","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2411.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"冰巨人","boss":true}]},{"id":39033,"name":"聖誕版長大衣","slot":"armor","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2310.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"冰巨人","boss":true}]},{"id":5042,"name":"丸子頭飾","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5042.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"冰巨人","boss":true},{"tier":3,"stage":"元宵節","monster":"群葉貓","boss":false},{"tier":3,"stage":"元宵節","monster":"春兔","boss":false},{"tier":3,"stage":"元宵節","monster":"紙妖","boss":true},{"tier":3,"stage":"元宵節","monster":"小青","boss":true}]},{"id":1646,"name":"暴風雪法杖","slot":"weapon","wtype":"롯드","icon":"https://ro.hans-webgametw.com/assets/items/1646.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"冰巨人","boss":true}]},{"id":1275,"name":"冰靈拳刃","slot":"weapon","wtype":"카타르","icon":"https://ro.hans-webgametw.com/assets/items/1275.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"冰巨人","boss":true}]},{"id":39004,"name":"聖誕版長柄短劍","slot":"weapon","wtype":"단검","icon":"https://ro.hans-webgametw.com/assets/items/1220.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"卡崙","boss":true}]},{"id":39018,"name":"聖誕版獵人之弓","slot":"weapon","wtype":"활","icon":"https://ro.hans-webgametw.com/assets/items/1718.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"卡崙","boss":true}]},{"id":39027,"name":"聖誕版昏暗來福槍","slot":"weapon","wtype":"라이플","icon":"https://ro.hans-webgametw.com/assets/items/13153.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"卡崙","boss":true}]},{"id":39028,"name":"聖誕版黑玫瑰霰彈槍","slot":"weapon","wtype":"샷건","icon":"https://ro.hans-webgametw.com/assets/items/13155.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"卡崙","boss":true}]},{"id":5742,"name":"魯道夫的聖誕帽","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5742.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"卡崙","boss":true}]},{"id":13015,"name":"白骨劍","slot":"weapon","wtype":"단검","icon":"https://ro.hans-webgametw.com/assets/items/13015.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"卡崙","boss":true},{"tier":3,"stage":"元宵節","monster":"邪骸浪人","boss":true},{"tier":3,"stage":"元宵節","monster":"墨蛇君","boss":true,"rare":true}]},{"id":1815,"name":"卡崙的指甲","slot":"weapon","wtype":"너클","icon":"https://ro.hans-webgametw.com/assets/items/1815.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"卡崙","boss":true}]},{"id":39006,"name":"聖誕版恰克蘭拳刃","slot":"weapon","wtype":"카타르","icon":"https://ro.hans-webgametw.com/assets/items/1285.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"卡崙寶寶","boss":true}]},{"id":39020,"name":"聖誕版龍爪拳套","slot":"weapon","wtype":"너클","icon":"https://ro.hans-webgametw.com/assets/items/1809.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"卡崙寶寶","boss":true}]},{"id":39010,"name":"聖誕版長戟","slot":"weapon","wtype":"창","icon":"https://ro.hans-webgametw.com/assets/items/1402.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"卡崙寶寶","boss":true}]},{"id":39025,"name":"聖誕版流星鞭子","slot":"weapon","wtype":"채찍","icon":"https://ro.hans-webgametw.com/assets/items/1957.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"卡崙寶寶","boss":true}]},{"id":39042,"name":"聖誕版力量戒指","slot":"acc","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2601.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"卡崙寶寶","boss":true}]},{"id":13304,"name":"風魔飛鏢 明淨","slot":"weapon","wtype":"수리검","icon":"https://ro.hans-webgametw.com/assets/items/13304.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"卡崙寶寶","boss":true},{"tier":3,"stage":"元宵節","monster":"鐵蠍","boss":false},{"tier":3,"stage":"元宵節","monster":"釣魚河童","boss":false},{"tier":3,"stage":"元宵節","monster":"豬婆龍","boss":true}]},{"id":2284,"name":"鹿角頭飾","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2284.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"卡崙寶寶","boss":true}]},{"id":2664,"name":"圍巾","slot":"acc","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2664.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"卡崙寶寶","boss":true}]},{"id":2236,"name":"聖誕帽","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2236.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"安東尼奧","boss":true}]},{"id":5136,"name":"路易士聖誕帽","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5136.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"安東尼奧","boss":true}]},{"id":13009,"name":"古錠劍","slot":"weapon","wtype":"단검","icon":"https://ro.hans-webgametw.com/assets/items/13009.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"安東尼奧","boss":true},{"tier":3,"stage":"元宵節","monster":"紙妖","boss":true},{"tier":3,"stage":"元宵節","monster":"白素貞","boss":true}]},{"id":1915,"name":"孤獨的吉他","slot":"weapon","wtype":"악기","icon":"https://ro.hans-webgametw.com/assets/items/1915.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"安東尼奧","boss":true},{"tier":3,"stage":"元宵節","monster":"石炮火樹","boss":false},{"tier":3,"stage":"元宵節","monster":"釣魚河童","boss":false},{"tier":3,"stage":"元宵節","monster":"紙妖","boss":true}]},{"id":5024,"name":"蛋糕帽","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5024.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"安東尼奧","boss":true},{"tier":3,"stage":"元宵節","monster":"元宵童子","boss":false},{"tier":3,"stage":"元宵節","monster":"猴桃木","boss":false},{"tier":3,"stage":"元宵節","monster":"機木人","boss":true},{"tier":3,"stage":"元宵節","monster":"小青","boss":true}]},{"id":1471,"name":"火靈之矛","slot":"weapon","wtype":"양손창","icon":"https://ro.hans-webgametw.com/assets/items/1471.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"安東尼奧","boss":true},{"tier":3,"stage":"元宵節","monster":"豬婆龍","boss":true},{"tier":3,"stage":"元宵節","monster":"墨蛇君","boss":true,"rare":true}]},{"id":13005,"name":"天使翅膀短劍","slot":"weapon","wtype":"단검","icon":"https://ro.hans-webgametw.com/assets/items/13005.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"安東尼奧","boss":true}]},{"id":1720,"name":"熾天使之弓","slot":"weapon","wtype":"활","icon":"https://ro.hans-webgametw.com/assets/items/1720.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"安東尼奧","boss":true}]},{"id":2358,"name":"天使禮服","slot":"armor","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2358.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"安東尼奧","boss":true}]},{"id":2521,"name":"天使的溫氣","slot":"garment","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2521.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"安東尼奧","boss":true}]},{"id":2743,"name":"天使之戒","slot":"acc","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2743.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"安東尼奧","boss":true}]},{"id":5025,"name":"天使頭盔","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5025.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"安東尼奧","boss":true}]},{"id":5074,"name":"天使翅膀耳飾","slot":"head_mid","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5074.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"安東尼奧","boss":true}]},{"id":39002,"name":"聖誕版十字巨劍","slot":"weapon","wtype":"양손검","icon":"https://ro.hans-webgametw.com/assets/items/1163.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"冰暴騎士","boss":true,"rare":true}]},{"id":39011,"name":"聖誕版彎刃長矛","slot":"weapon","wtype":"양손창","icon":"https://ro.hans-webgametw.com/assets/items/1452.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"冰暴騎士","boss":true,"rare":true}]},{"id":39007,"name":"聖誕版切削之斧","slot":"weapon","wtype":"도끼","icon":"https://ro.hans-webgametw.com/assets/items/1305.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"冰暴騎士","boss":true,"rare":true}]},{"id":39045,"name":"聖誕版人面獅身帽","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5053.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"冰暴騎士","boss":true,"rare":true}]},{"id":5384,"name":"雙絨球聖誕帽","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5384.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"冰暴騎士","boss":true,"rare":true}]},{"id":1164,"name":"名刀 不知火","slot":"weapon","wtype":"양손검","icon":"https://ro.hans-webgametw.com/assets/items/1164.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"冰暴騎士","boss":true,"rare":true},{"tier":3,"stage":"元宵節","monster":"邪骸浪人","boss":true},{"tier":3,"stage":"元宵節","monster":"白素貞","boss":true}]},{"id":1468,"name":"風靈之矛","slot":"weapon","wtype":"양손창","icon":"https://ro.hans-webgametw.com/assets/items/1468.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"冰暴騎士","boss":true,"rare":true}]},{"id":2111,"name":"大天使之盾","slot":"shield","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2111.png","tiers":[3],"sources":[{"tier":3,"stage":"聖誕節","monster":"冰暴騎士","boss":true,"rare":true}]},{"id":2270,"name":"草葉","slot":"head_low","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2270.png","tiers":[3],"sources":[{"tier":3,"stage":"元宵節","monster":"群葉貓","boss":false},{"tier":3,"stage":"元宵節","monster":"春兔","boss":false},{"tier":3,"stage":"元宵節","monster":"機木人","boss":true},{"tier":3,"stage":"元宵節","monster":"邪骸浪人","boss":true}]},{"id":5030,"name":"熊貓帽","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5030.png","tiers":[3],"sources":[{"tier":3,"stage":"元宵節","monster":"群葉貓","boss":false}]},{"id":13008,"name":"破刃劍","slot":"weapon","wtype":"단검","icon":"https://ro.hans-webgametw.com/assets/items/13008.png","tiers":[3],"sources":[{"tier":3,"stage":"元宵節","monster":"元宵童子","boss":false},{"tier":3,"stage":"元宵節","monster":"石炮火樹","boss":false},{"tier":3,"stage":"元宵節","monster":"釣魚河童","boss":false},{"tier":3,"stage":"元宵節","monster":"豬婆龍","boss":true}]},{"id":5457,"name":"玉兔頭飾","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5457.png","tiers":[3],"sources":[{"tier":3,"stage":"元宵節","monster":"元宵童子","boss":false}]},{"id":5226,"name":"夢想升空竹蜻蜓","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5226.png","tiers":[3],"sources":[{"tier":3,"stage":"元宵節","monster":"石炮火樹","boss":false}]},{"id":1523,"name":"闇盲之錘","slot":"weapon","wtype":"클럽","icon":"https://ro.hans-webgametw.com/assets/items/1523.png","tiers":[3],"sources":[{"tier":3,"stage":"元宵節","monster":"鐵蠍","boss":false},{"tier":3,"stage":"元宵節","monster":"機木人","boss":true}]},{"id":1802,"name":"虎爪拳套","slot":"weapon","wtype":"너클","icon":"https://ro.hans-webgametw.com/assets/items/1802.png","tiers":[3],"sources":[{"tier":3,"stage":"元宵節","monster":"鐵蠍","boss":false}]},{"id":5302,"name":"蓮花帽子","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5302.png","tiers":[3],"sources":[{"tier":3,"stage":"元宵節","monster":"釣魚河童","boss":false}]},{"id":5284,"name":"睡蓮王冠","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5284.png","tiers":[3],"sources":[{"tier":3,"stage":"元宵節","monster":"春兔","boss":false}]},{"id":5152,"name":"鳳冠","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5152.png","tiers":[3],"sources":[{"tier":3,"stage":"元宵節","monster":"猴桃木","boss":false}]},{"id":5497,"name":"虎王娃娃帽子","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5497.png","tiers":[3],"sources":[{"tier":3,"stage":"元宵節","monster":"機木人","boss":true}]},{"id":1810,"name":"龍爪拳套","slot":"weapon","wtype":"너클","icon":"https://ro.hans-webgametw.com/assets/items/1810.png","tiers":[3],"sources":[{"tier":3,"stage":"元宵節","monster":"豬婆龍","boss":true}]},{"id":5531,"name":"寶寶龍帽子","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5531.png","tiers":[3],"sources":[{"tier":3,"stage":"元宵節","monster":"豬婆龍","boss":true}]},{"id":5130,"name":"獅子面具","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5130.png","tiers":[3],"sources":[{"tier":3,"stage":"元宵節","monster":"紙妖","boss":true}]},{"id":13006,"name":"黑龍短劍","slot":"weapon","wtype":"단검","icon":"https://ro.hans-webgametw.com/assets/items/13006.png","tiers":[3],"sources":[{"tier":3,"stage":"元宵節","monster":"邪骸浪人","boss":true}]},{"id":5098,"name":"老虎面具","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5098.png","tiers":[3],"sources":[{"tier":3,"stage":"元宵節","monster":"邪骸浪人","boss":true}]},{"id":2544,"name":"三角狂獅獸之外皮","slot":"garment","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2544.png","tiers":[3],"sources":[{"tier":3,"stage":"元宵節","monster":"小青","boss":true}]},{"id":1559,"name":"天龍的遺產","slot":"weapon","wtype":"책","icon":"https://ro.hans-webgametw.com/assets/items/1559.png","tiers":[3],"sources":[{"tier":3,"stage":"元宵節","monster":"白素貞","boss":true}]},{"id":2762,"name":"龍騎兵之戒","slot":"acc","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2762.png","tiers":[3],"sources":[{"tier":3,"stage":"元宵節","monster":"白素貞","boss":true}]},{"id":1474,"name":"加野矛","slot":"weapon","wtype":"양손창","icon":"https://ro.hans-webgametw.com/assets/items/1474.png","tiers":[3],"sources":[{"tier":3,"stage":"元宵節","monster":"墨蛇君","boss":true,"rare":true}]},{"id":5292,"name":"龍的骷髏","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5292.png","tiers":[3],"sources":[{"tier":3,"stage":"元宵節","monster":"墨蛇君","boss":true,"rare":true}]},{"id":1807,"name":"升龍拳套","slot":"weapon","wtype":"너클","icon":"https://ro.hans-webgametw.com/assets/items/1807.png","tiers":[3],"sources":[{"tier":3,"stage":"元宵節","monster":"墨蛇君","boss":true,"rare":true}]},{"id":2331,"name":"緊身便衣","slot":"armor","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2331.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"吉芬地下城","monster":"南瓜先生","boss":false}]},{"id":13105,"name":"加立遜手槍","slot":"weapon","wtype":"권총","icon":"https://ro.hans-webgametw.com/assets/items/13105.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"吉芬地下城","monster":"南瓜先生","boss":false}]},{"id":1182,"name":"血靈魔劍","slot":"weapon","wtype":"양손검","icon":"https://ro.hans-webgametw.com/assets/items/1182.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"吉芬地下城","monster":"綠腐屍","boss":false}]},{"id":2374,"name":"魔王的外袍","slot":"armor","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2374.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"吉芬地下城","monster":"綠腐屍","boss":false}]},{"id":1520,"name":"鏈錘","slot":"weapon","wtype":"클럽","icon":"https://ro.hans-webgametw.com/assets/items/1520.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"吉芬地下城","monster":"傀儡娃娃","boss":false}]},{"id":2407,"name":"玻璃鞋","slot":"shoes","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2407.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"吉芬地下城","monster":"傀儡娃娃","boss":false}]},{"id":5141,"name":"傀儡娃娃頭飾","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5141.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"吉芬地下城","monster":"傀儡娃娃","boss":false}]},{"id":1458,"name":"雙刃長戟","slot":"weapon","wtype":"양손창","icon":"https://ro.hans-webgametw.com/assets/items/1458.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"吉芬地下城","monster":"小惡魔","boss":false}]},{"id":1919,"name":"低音吉他","slot":"weapon","wtype":"악기","icon":"https://ro.hans-webgametw.com/assets/items/1919.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"吉芬地下城","monster":"小惡魔","boss":false}]},{"id":2426,"name":"陰暗步行長靴","slot":"shoes","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2426.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"吉芬地下城","monster":"夢魘","boss":false}]},{"id":1822,"name":"連擊的套甲","slot":"weapon","wtype":"taekwon","icon":"https://ro.hans-webgametw.com/assets/items/1822.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"吉芬地下城","monster":"夢魘","boss":false}]},{"id":1643,"name":"枯木魔杖","slot":"weapon","wtype":"롯드","icon":"https://ro.hans-webgametw.com/assets/items/1643.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"吉芬地下城","monster":"巨大白幽靈","boss":true}]},{"id":2450,"name":"生命樹枝鞋","slot":"shoes","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2450.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"吉芬地下城","monster":"巨大白幽靈","boss":true}]},{"id":1972,"name":"電鰻鞭","slot":"weapon","wtype":"채찍","icon":"https://ro.hans-webgametw.com/assets/items/1972.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"吉芬地下城","monster":"巨大白幽靈","boss":true}]},{"id":1175,"name":"阿特羅斯的巨劍","slot":"weapon","wtype":"양손검","icon":"https://ro.hans-webgametw.com/assets/items/1175.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"吉芬地下城","monster":"獸牙怪","boss":true}]},{"id":13412,"name":"夜勝魔的雙子銳劍(藍)","slot":"weapon","wtype":"검","icon":"https://ro.hans-webgametw.com/assets/items/13412.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"吉芬地下城","monster":"獸牙怪","boss":true}]},{"id":1271,"name":"血淚拳刃","slot":"weapon","wtype":"카타르","icon":"https://ro.hans-webgametw.com/assets/items/1271.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"吉芬地下城","monster":"獸牙怪","boss":true}]},{"id":2317,"name":"鋼鐵鎧甲","slot":"armor","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2317.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"吉芬地下城","monster":"死靈","boss":true}]},{"id":1162,"name":"雙手重劍","slot":"weapon","wtype":"양손검","icon":"https://ro.hans-webgametw.com/assets/items/1162.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"吉芬地下城","monster":"死靈","boss":true}]},{"id":1168,"name":"巨大雙手劍","slot":"weapon","wtype":"양손검","icon":"https://ro.hans-webgametw.com/assets/items/1168.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"吉芬地下城","monster":"死靈","boss":true}]},{"id":2258,"name":"尖角髮圈","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2258.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"吉芬地下城","monster":"死靈","boss":true}]},{"id":1411,"name":"騎士長矛","slot":"weapon","wtype":"양손창","icon":"https://ro.hans-webgametw.com/assets/items/1411.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"吉芬地下城","monster":"死靈","boss":true}]},{"id":13308,"name":"風魔烈焰手裡劍","slot":"weapon","wtype":"수리검","icon":"https://ro.hans-webgametw.com/assets/items/13308.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"吉芬地下城","monster":"死靈","boss":true}]},{"id":1473,"name":"大巫師之杖","slot":"weapon","wtype":"롯드","icon":"https://ro.hans-webgametw.com/assets/items/1473.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"吉芬地下城","monster":"德古拉男爵","boss":true}]},{"id":2621,"name":"力量戒指","slot":"acc","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2621.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"吉芬地下城","monster":"德古拉男爵","boss":true}]},{"id":2375,"name":"魔王的鎧甲","slot":"armor","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2375.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"吉芬地下城","monster":"德古拉男爵","boss":true}]},{"id":1637,"name":"銷魂杖","slot":"weapon","wtype":"롯드","icon":"https://ro.hans-webgametw.com/assets/items/1637.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"吉芬地下城","monster":"德古拉男爵","boss":true}]},{"id":2542,"name":"夜勝魔的火焰斗篷","slot":"garment","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2542.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"吉芬地下城","monster":"德古拉男爵","boss":true}]},{"id":1636,"name":"黑暗的荊棘骷髏杖","slot":"weapon","wtype":"롯드","icon":"https://ro.hans-webgametw.com/assets/items/1636.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"吉芬地下城","monster":"德古拉男爵","boss":true}]},{"id":13170,"name":"操作桿來福槍","slot":"weapon","wtype":"라이플","icon":"https://ro.hans-webgametw.com/assets/items/13170.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"吉芬地下城","monster":"德古拉男爵","boss":true}]},{"id":1818,"name":"岩漿拳套","slot":"weapon","wtype":"너클","icon":"https://ro.hans-webgametw.com/assets/items/1818.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"吉芬地下城","monster":"德古拉男爵","boss":true}]},{"id":2788,"name":"鈽鐳耳環","slot":"acc","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2788.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"鐘樓地下","monster":"朽魔","boss":false}]},{"id":13047,"name":"毒鋸短劍","slot":"weapon","wtype":"단검","icon":"https://ro.hans-webgametw.com/assets/items/13047.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"鐘樓地下","monster":"朽魔","boss":false}]},{"id":1925,"name":"大提琴","slot":"weapon","wtype":"악기","icon":"https://ro.hans-webgametw.com/assets/items/1925.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"鐘樓地下","monster":"古鐘魔","boss":false}]},{"id":2790,"name":"鈽鐳別針","slot":"acc","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2790.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"鐘樓地下","monster":"鐘怪","boss":false}]},{"id":13107,"name":"荒野的無法者","slot":"weapon","wtype":"권총","icon":"https://ro.hans-webgametw.com/assets/items/13107.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"鐘樓地下","monster":"鐘怪","boss":false}]},{"id":1554,"name":"地靈之書","slot":"weapon","wtype":"책","icon":"https://ro.hans-webgametw.com/assets/items/1554.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"鐘樓地下","monster":"飛行魔書","boss":false}]},{"id":1556,"name":"風靈之書","slot":"weapon","wtype":"책","icon":"https://ro.hans-webgametw.com/assets/items/1556.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"鐘樓地下","monster":"飛行魔書","boss":false}]},{"id":1817,"name":"精製風靈拳套","slot":"weapon","wtype":"taekwon","icon":"https://ro.hans-webgametw.com/assets/items/1817.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"鐘樓地下","monster":"飛行魔書","boss":false}]},{"id":1626,"name":"銳利波之杖","slot":"weapon","wtype":"롯드","icon":"https://ro.hans-webgametw.com/assets/items/1626.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"鐘樓地下","monster":"巫婆","boss":false}]},{"id":1970,"name":"女王的鞭子","slot":"weapon","wtype":"채찍","icon":"https://ro.hans-webgametw.com/assets/items/1970.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"鐘樓地下","monster":"巫婆","boss":false}]},{"id":13302,"name":"風魔輪飛鏢","slot":"weapon","wtype":"수리검","icon":"https://ro.hans-webgametw.com/assets/items/13302.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"鐘樓地下","monster":"邪惡箱","boss":false}]},{"id":1259,"name":"風靈拳刃","slot":"weapon","wtype":"카타르","icon":"https://ro.hans-webgametw.com/assets/items/1259.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"鐘樓地下","monster":"裘卡","boss":false}]},{"id":13165,"name":"短卡賓","slot":"weapon","wtype":"라이플","icon":"https://ro.hans-webgametw.com/assets/items/13165.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"鐘樓地下","monster":"裘卡","boss":false}]},{"id":2519,"name":"茉莉雅娜斗篷","slot":"garment","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2519.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"鐘樓地下","monster":"鏡妖","boss":false}]},{"id":2109,"name":"謊言紀錄本","slot":"shield","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2109.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"鐘樓地下","monster":"鐘塔守護者","boss":true}]},{"id":1564,"name":"大百科全書","slot":"weapon","wtype":"책","icon":"https://ro.hans-webgametw.com/assets/items/1564.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"鐘樓地下","monster":"鐘塔守護者","boss":true}]},{"id":1820,"name":"雷電拳套","slot":"weapon","wtype":"너클","icon":"https://ro.hans-webgametw.com/assets/items/1820.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"鐘樓地下","monster":"鐘塔守護者","boss":true}]},{"id":1629,"name":"紳士的權杖","slot":"weapon","wtype":"롯드","icon":"https://ro.hans-webgametw.com/assets/items/1629.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"鐘樓地下","monster":"鴞裊首領","boss":true}]},{"id":5045,"name":"魔術師帽","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5045.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"鐘樓地下","monster":"鴞裊首領","boss":true}]},{"id":1422,"name":"狩獵長矛","slot":"weapon","wtype":"창","icon":"https://ro.hans-webgametw.com/assets/items/1422.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"鐘樓地下","monster":"鴞裊首領","boss":true}]},{"id":1733,"name":"疾風之弓","slot":"weapon","wtype":"활","icon":"https://ro.hans-webgametw.com/assets/items/1733.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"鐘樓地下","monster":"鴞裊首領","boss":true}]},{"id":1111,"name":"擊刺長劍","slot":"weapon","wtype":"검","icon":"https://ro.hans-webgametw.com/assets/items/1111.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"鐘樓地下","monster":"行刑者","boss":true}]},{"id":1114,"name":"彎刀","slot":"weapon","wtype":"검","icon":"https://ro.hans-webgametw.com/assets/items/1114.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"鐘樓地下","monster":"行刑者","boss":true}]},{"id":1186,"name":"死亡引導者","slot":"weapon","wtype":"양손검","icon":"https://ro.hans-webgametw.com/assets/items/1186.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"鐘樓地下","monster":"行刑者","boss":true}]},{"id":13309,"name":"精製風魔輪飛鏢","slot":"weapon","wtype":"수리검","icon":"https://ro.hans-webgametw.com/assets/items/13309.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"鐘樓地下","monster":"行刑者","boss":true}]},{"id":1155,"name":"亞爾特劍","slot":"weapon","wtype":"양손검","icon":"https://ro.hans-webgametw.com/assets/items/1155.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"鐘樓地下","monster":"弒神者","boss":true}]},{"id":13413,"name":"夜勝魔的雙子銳劍(紅)","slot":"weapon","wtype":"검","icon":"https://ro.hans-webgametw.com/assets/items/13413.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"鐘樓地下","monster":"弒神者","boss":true}]},{"id":1143,"name":"尋礦之劍","slot":"weapon","wtype":"검","icon":"https://ro.hans-webgametw.com/assets/items/1143.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"鐘樓地下","monster":"弒神者","boss":true}]},{"id":1716,"name":"角弓","slot":"weapon","wtype":"활","icon":"https://ro.hans-webgametw.com/assets/items/1716.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"鐘樓地下","monster":"鴞裊男爵","boss":true}]},{"id":1472,"name":"靈魂之杖","slot":"weapon","wtype":"롯드","icon":"https://ro.hans-webgametw.com/assets/items/1472.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"鐘樓地下","monster":"鴞裊男爵","boss":true}]},{"id":1737,"name":"伊克希恩的羽翼","slot":"weapon","wtype":"활","icon":"https://ro.hans-webgametw.com/assets/items/1737.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"鐘樓地下","monster":"鴞裊男爵","boss":true}]},{"id":2342,"name":"秘銀金屬鎧甲","slot":"armor","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2342.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"鐘樓地下","monster":"鴞裊男爵","boss":true}]},{"id":13169,"name":"Thunder P","slot":"weapon","wtype":"샷건","icon":"https://ro.hans-webgametw.com/assets/items/13169.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"鐘樓地下","monster":"鴞裊男爵","boss":true}]},{"id":1825,"name":"三角幼獅獸之角拳套","slot":"weapon","wtype":"taekwon","icon":"https://ro.hans-webgametw.com/assets/items/1825.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"鐘樓地下","monster":"鴞裊男爵","boss":true}]},{"id":1745,"name":"獵鷹閃電弓","slot":"weapon","wtype":"활","icon":"https://ro.hans-webgametw.com/assets/items/1745.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"鐘樓地下","monster":"鴞裊男爵","boss":true}]},{"id":2520,"name":"哥夫內肩飾","slot":"garment","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2520.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"深淵之湖","monster":"諾博斯","boss":false}]},{"id":13108,"name":"破壞性的左輪手槍","slot":"weapon","wtype":"권총","icon":"https://ro.hans-webgametw.com/assets/items/13108.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"深淵之湖","monster":"諾博斯","boss":false}]},{"id":5128,"name":"哥夫內的頭具","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5128.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"深淵之湖","monster":"黃諾博斯","boss":false}]},{"id":1962,"name":"細刃鞭子","slot":"weapon","wtype":"채찍","icon":"https://ro.hans-webgametw.com/assets/items/1962.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"深淵之湖","monster":"黃諾博斯","boss":false}]},{"id":1560,"name":"賢者的日記","slot":"weapon","wtype":"책","icon":"https://ro.hans-webgametw.com/assets/items/1560.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"深淵之湖","monster":"龍蛋","boss":false}]},{"id":1484,"name":"樞機長槍","slot":"weapon","wtype":"양손창","icon":"https://ro.hans-webgametw.com/assets/items/1484.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"深淵之湖","monster":"綠貝勒斯","boss":false}]},{"id":1375,"name":"肉搏斧","slot":"weapon","wtype":"양손도끼","icon":"https://ro.hans-webgametw.com/assets/items/1375.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"深淵之湖","monster":"綠貝勒斯","boss":false}]},{"id":1268,"name":"野獸的指甲","slot":"weapon","wtype":"카타르","icon":"https://ro.hans-webgametw.com/assets/items/1268.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"深淵之湖","monster":"綠貝勒斯","boss":false}]},{"id":1311,"name":"貝伽勒巨斧","slot":"weapon","wtype":"도끼","icon":"https://ro.hans-webgametw.com/assets/items/1311.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"深淵之湖","monster":"狂暴邪惡箱","boss":false}]},{"id":1270,"name":"鑽孔機拳刃","slot":"weapon","wtype":"카타르","icon":"https://ro.hans-webgametw.com/assets/items/1270.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"深淵之湖","monster":"狂暴邪惡箱","boss":false}]},{"id":13173,"name":"敏銳的霰彈槍","slot":"weapon","wtype":"샷건","icon":"https://ro.hans-webgametw.com/assets/items/13173.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"深淵之湖","monster":"灰俄希托斯","boss":false}]},{"id":2417,"name":"傅里哥長靴","slot":"shoes","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2417.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"深淵之湖","monster":"灰俄希托斯","boss":false}]},{"id":5122,"name":"魔術無邊帽","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5122.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"深淵之湖","monster":"紅貝勒斯","boss":true}]},{"id":1821,"name":"大地拳套","slot":"weapon","wtype":"너클","icon":"https://ro.hans-webgametw.com/assets/items/1821.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"深淵之湖","monster":"紅貝勒斯","boss":true}]},{"id":1420,"name":"長角槍","slot":"weapon","wtype":"창","icon":"https://ro.hans-webgametw.com/assets/items/1420.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"深淵之湖","monster":"紅貝勒斯","boss":true}]},{"id":1730,"name":"燃燒之弓","slot":"weapon","wtype":"활","icon":"https://ro.hans-webgametw.com/assets/items/1730.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"深淵之湖","monster":"紅貝勒斯","boss":true}]},{"id":1269,"name":"茵博斯拳刃","slot":"weapon","wtype":"카타르","icon":"https://ro.hans-webgametw.com/assets/items/1269.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"深淵之湖","monster":"黃俄希托斯","boss":true}]},{"id":1823,"name":"斗士的戰鬥升龍拳套","slot":"weapon","wtype":"taekwon","icon":"https://ro.hans-webgametw.com/assets/items/1823.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"深淵之湖","monster":"黃俄希托斯","boss":true}]},{"id":13305,"name":"戰鬥風魔翼飛鏢","slot":"weapon","wtype":"수리검","icon":"https://ro.hans-webgametw.com/assets/items/13305.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"深淵之湖","monster":"黃俄希托斯","boss":true}]},{"id":1824,"name":"勇氣的戰鬥升龍拳套","slot":"weapon","wtype":"taekwon","icon":"https://ro.hans-webgametw.com/assets/items/1824.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"深淵之湖","monster":"黃俄希托斯","boss":true}]},{"id":5126,"name":"摩菲斯的頭巾","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5126.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"深淵之湖","monster":"三頭龍","boss":true}]},{"id":5127,"name":"茉莉雅娜的頭盔","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5127.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"深淵之湖","monster":"三頭龍","boss":true}]},{"id":5124,"name":"菲力卡的頭箍","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5124.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"深淵之湖","monster":"三頭龍","boss":true}]},{"id":2649,"name":"摩菲斯臂環","slot":"acc","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2649.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"深淵之湖","monster":"迪塔勒泰晤勒斯","boss":true}]},{"id":2648,"name":"摩菲斯戒指","slot":"acc","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2648.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"深淵之湖","monster":"迪塔勒泰晤勒斯","boss":true}]},{"id":1417,"name":"鐮戟","slot":"weapon","wtype":"창","icon":"https://ro.hans-webgametw.com/assets/items/1417.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"深淵之湖","monster":"迪塔勒泰晤勒斯","boss":true}]},{"id":5002,"name":"首領冠冕","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5002.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"深淵之湖","monster":"迪塔勒泰晤勒斯","boss":true}]},{"id":2354,"name":"哥夫內的鎧甲","slot":"armor","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2354.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"深淵之湖","monster":"迪塔勒泰晤勒斯","boss":true}]},{"id":1478,"name":"爾休披斯槍","slot":"weapon","wtype":"양손창","icon":"https://ro.hans-webgametw.com/assets/items/1478.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"深淵之湖","monster":"迪塔勒泰晤勒斯","boss":true}]},{"id":13167,"name":"短口創DD","slot":"weapon","wtype":"샷건","icon":"https://ro.hans-webgametw.com/assets/items/13167.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"深淵之湖","monster":"水晶龍","boss":true,"rare":true}]},{"id":1376,"name":"心破壞斧","slot":"weapon","wtype":"양손도끼","icon":"https://ro.hans-webgametw.com/assets/items/1376.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"深淵之湖","monster":"水晶龍","boss":true,"rare":true}]},{"id":1561,"name":"精裝之書","slot":"weapon","wtype":"책","icon":"https://ro.hans-webgametw.com/assets/items/1561.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"深淵之湖","monster":"水晶龍","boss":true,"rare":true}]},{"id":1918,"name":"琵琶","slot":"weapon","wtype":"악기","icon":"https://ro.hans-webgametw.com/assets/items/1918.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"深淵之湖","monster":"水晶龍","boss":true,"rare":true}]},{"id":2408,"name":"腳鍊","slot":"shoes","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2408.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"古城修道院","monster":"腐屍戰俘","boss":false}]},{"id":1829,"name":"精製升龍拳套","slot":"weapon","wtype":"너클","icon":"https://ro.hans-webgametw.com/assets/items/1829.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"古城修道院","monster":"腐屍戰俘","boss":false}]},{"id":2319,"name":"秘衣 惡德","slot":"armor","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2319.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"古城修道院","monster":"邪骸戰俘","boss":false}]},{"id":1963,"name":"毒鞭 薔薇","slot":"weapon","wtype":"채찍","icon":"https://ro.hans-webgametw.com/assets/items/1963.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"古城修道院","monster":"邪骸戰俘","boss":false}]},{"id":1244,"name":"神聖大駒短劍","slot":"weapon","wtype":"단검","icon":"https://ro.hans-webgametw.com/assets/items/1244.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"古城修道院","monster":"邪骸戰俘","boss":false}]},{"id":2266,"name":"金屬口罩","slot":"head_low","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2266.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"古城修道院","monster":"幽靈劍士","boss":false}]},{"id":2315,"name":"鋼鐵鎖子甲","slot":"armor","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2315.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"古城修道院","monster":"幽靈劍士","boss":false}]},{"id":1158,"name":"雙手巨劍","slot":"weapon","wtype":"양손검","icon":"https://ro.hans-webgametw.com/assets/items/1158.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"古城修道院","monster":"幽靈劍士","boss":false}]},{"id":1715,"name":"亞伯雷弓","slot":"weapon","wtype":"활","icon":"https://ro.hans-webgametw.com/assets/items/1715.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"古城修道院","monster":"幽靈弓箭手","boss":false}]},{"id":1719,"name":"盜賊之弓","slot":"weapon","wtype":"활","icon":"https://ro.hans-webgametw.com/assets/items/1719.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"古城修道院","monster":"幽靈弓箭手","boss":false}]},{"id":1721,"name":"十字機弩","slot":"weapon","wtype":"활","icon":"https://ro.hans-webgametw.com/assets/items/1721.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"古城修道院","monster":"幽靈弓箭手","boss":false}]},{"id":2206,"name":"婚禮頭紗","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2206.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"古城修道院","monster":"惡靈","boss":false}]},{"id":1573,"name":"古老魔法書","slot":"weapon","wtype":"책","icon":"https://ro.hans-webgametw.com/assets/items/1573.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"古城修道院","monster":"惡靈","boss":false}]},{"id":2508,"name":"抗魔斗篷","slot":"garment","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2508.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"古城修道院","monster":"闇神官","boss":false}]},{"id":2005,"name":"女神之杖","slot":"weapon","wtype":"롯드","icon":"https://ro.hans-webgametw.com/assets/items/2005.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"古城修道院","monster":"闇神官","boss":false}]},{"id":1828,"name":"武僧拳套","slot":"weapon","wtype":"너클","icon":"https://ro.hans-webgametw.com/assets/items/1828.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"古城修道院","monster":"闇神官","boss":false}]},{"id":1170,"name":"亞藍斯之劍","slot":"weapon","wtype":"양손검","icon":"https://ro.hans-webgametw.com/assets/items/1170.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"古城修道院","monster":"卡利斯格","boss":false}]},{"id":1544,"name":"露娜平底鍋","slot":"weapon","wtype":"클럽","icon":"https://ro.hans-webgametw.com/assets/items/1544.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"古城修道院","monster":"卡利斯格","boss":false}]},{"id":13306,"name":"英勇的戰鬥風魔翼飛鏢","slot":"weapon","wtype":"수리검","icon":"https://ro.hans-webgametw.com/assets/items/13306.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"古城修道院","monster":"卡利斯格","boss":false}]},{"id":1306,"name":"血腥戰斧","slot":"weapon","wtype":"도끼","icon":"https://ro.hans-webgametw.com/assets/items/1306.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"古城修道院","monster":"凱美拉","boss":true}]},{"id":1364,"name":"克萊伊特斧","slot":"weapon","wtype":"양손도끼","icon":"https://ro.hans-webgametw.com/assets/items/1364.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"古城修道院","monster":"凱美拉","boss":true}]},{"id":13176,"name":"勇士來福槍","slot":"weapon","wtype":"라이플","icon":"https://ro.hans-webgametw.com/assets/items/13176.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"古城修道院","monster":"凱美拉","boss":true}]},{"id":2318,"name":"秘衣 美德","slot":"armor","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2318.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"古城修道院","monster":"深淵騎士","boss":true}]},{"id":1421,"name":"戰鬥鉤槍","slot":"weapon","wtype":"창","icon":"https://ro.hans-webgametw.com/assets/items/1421.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"古城修道院","monster":"深淵騎士","boss":true}]},{"id":1826,"name":"勇士龍爪拳套","slot":"weapon","wtype":"taekwon","icon":"https://ro.hans-webgametw.com/assets/items/1826.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"古城修道院","monster":"深淵騎士","boss":true}]},{"id":2125,"name":"強硬鋼盾","slot":"shield","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2125.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"古城修道院","monster":"血腥騎士","boss":true}]},{"id":1308,"name":"金斧頭","slot":"weapon","wtype":"도끼","icon":"https://ro.hans-webgametw.com/assets/items/1308.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"古城修道院","monster":"血腥騎士","boss":true}]},{"id":1541,"name":"納米西斯錘","slot":"weapon","wtype":"클럽","icon":"https://ro.hans-webgametw.com/assets/items/1541.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"古城修道院","monster":"血腥騎士","boss":true}]},{"id":2001,"name":"神聖十字之杖","slot":"weapon","wtype":"롯드","icon":"https://ro.hans-webgametw.com/assets/items/2001.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"古城修道院","monster":"迷幻之王","boss":true}]},{"id":1926,"name":"豬籠草之豎琴","slot":"weapon","wtype":"악기","icon":"https://ro.hans-webgametw.com/assets/items/1926.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"古城修道院","monster":"迷幻之王","boss":true}]},{"id":1572,"name":"魔法經典","slot":"weapon","wtype":"책","icon":"https://ro.hans-webgametw.com/assets/items/1572.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"古城修道院","monster":"迷幻之王","boss":true}]},{"id":2004,"name":"克羅納斯魔杖","slot":"weapon","wtype":"롯드","icon":"https://ro.hans-webgametw.com/assets/items/2004.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"古城修道院","monster":"黑暗之王","boss":true}]},{"id":1237,"name":"無影之牙","slot":"weapon","wtype":"단검","icon":"https://ro.hans-webgametw.com/assets/items/1237.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"古城修道院","monster":"黑暗之王","boss":true}]},{"id":2334,"name":"魔法外套","slot":"armor","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2334.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"古城修道院","monster":"黑暗之王","boss":true}]},{"id":5162,"name":"骨製頭盔","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5162.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"古城修道院","monster":"黑暗之王","boss":true}]},{"id":5093,"name":"修女的帽子","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5093.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"古城修道院","monster":"黑暗之王","boss":true}]},{"id":5808,"name":"黑暗巴西里昂冠","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5808.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"古城修道院","monster":"黑暗之王","boss":true}]},{"id":1973,"name":"海洋魔女之腳鞭","slot":"weapon","wtype":"채찍","icon":"https://ro.hans-webgametw.com/assets/items/1973.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"尼芙菲姆原野","monster":"南瓜魂","boss":false}]},{"id":13110,"name":"勇士左輪手槍","slot":"weapon","wtype":"권총","icon":"https://ro.hans-webgametw.com/assets/items/13110.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"尼芙菲姆原野","monster":"南瓜魂","boss":false}]},{"id":13171,"name":"快速的布林其來福槍","slot":"weapon","wtype":"라이플","icon":"https://ro.hans-webgametw.com/assets/items/13171.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"尼芙菲姆原野","monster":"萬聖魔","boss":false}]},{"id":2422,"name":"高級輕便鞋","slot":"shoes","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2422.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"尼芙菲姆原野","monster":"萬聖魔","boss":false}]},{"id":13307,"name":"勇士風魔飛鏢","slot":"weapon","wtype":"수리검","icon":"https://ro.hans-webgametw.com/assets/items/13307.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"尼芙菲姆原野","monster":"萬聖魔","boss":false}]},{"id":13178,"name":"勇士霰彈槍","slot":"weapon","wtype":"샷건","icon":"https://ro.hans-webgametw.com/assets/items/13178.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"尼芙菲姆原野","monster":"兔斯拉","boss":false}]},{"id":1568,"name":"水靈之書","slot":"weapon","wtype":"책","icon":"https://ro.hans-webgametw.com/assets/items/1568.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"尼芙菲姆原野","monster":"兔斯拉","boss":false}]},{"id":1974,"name":"紅蘿蔔鞭","slot":"weapon","wtype":"채찍","icon":"https://ro.hans-webgametw.com/assets/items/1974.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"尼芙菲姆原野","monster":"鬼娃樹","boss":false}]},{"id":1425,"name":"突襲隊長的長矛","slot":"weapon","wtype":"창","icon":"https://ro.hans-webgametw.com/assets/items/1425.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"尼芙菲姆原野","monster":"鬼娃樹","boss":false}]},{"id":1732,"name":"大地之弓","slot":"weapon","wtype":"활","icon":"https://ro.hans-webgametw.com/assets/items/1732.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"尼芙菲姆原野","monster":"鬼娃樹","boss":false}]},{"id":2529,"name":"騎乘之徽章","slot":"garment","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2529.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"尼芙菲姆原野","monster":"假面鬼","boss":false}]},{"id":1276,"name":"刺藤拳刃","slot":"weapon","wtype":"카타르","icon":"https://ro.hans-webgametw.com/assets/items/1276.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"尼芙菲姆原野","monster":"假面鬼","boss":false}]},{"id":1229,"name":"廚刀","slot":"weapon","wtype":"단검","icon":"https://ro.hans-webgametw.com/assets/items/1229.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"尼芙菲姆原野","monster":"嗜血怪人","boss":true}]},{"id":13002,"name":"卡卡普劍","slot":"weapon","wtype":"단검","icon":"https://ro.hans-webgametw.com/assets/items/13002.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"尼芙菲姆原野","monster":"嗜血怪人","boss":true}]},{"id":1827,"name":"勇士升龍拳套","slot":"weapon","wtype":"taekwon","icon":"https://ro.hans-webgametw.com/assets/items/1827.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"尼芙菲姆原野","monster":"嗜血怪人","boss":true}]},{"id":2718,"name":"瘋兔別針","slot":"acc","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2718.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"尼芙菲姆原野","monster":"銀月魔女","boss":true}]},{"id":2000,"name":"破壞之杖","slot":"weapon","wtype":"롯드","icon":"https://ro.hans-webgametw.com/assets/items/2000.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"尼芙菲姆原野","monster":"銀月魔女","boss":true}]},{"id":2537,"name":"魔王的斗篷","slot":"garment","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2537.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"尼芙菲姆原野","monster":"銀月魔女","boss":true}]},{"id":1927,"name":"勇士吉他","slot":"weapon","wtype":"악기","icon":"https://ro.hans-webgametw.com/assets/items/1927.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"尼芙菲姆原野","monster":"銀月魔女","boss":true}]},{"id":1920,"name":"狂暴吉他","slot":"weapon","wtype":"악기","icon":"https://ro.hans-webgametw.com/assets/items/1920.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"尼芙菲姆原野","monster":"無顱武士","boss":true}]},{"id":1548,"name":"熟練者之錘","slot":"weapon","wtype":"클럽","icon":"https://ro.hans-webgametw.com/assets/items/1548.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"尼芙菲姆原野","monster":"無顱武士","boss":true}]},{"id":2364,"name":"隕石鋼鐵鎧甲","slot":"armor","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2364.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"尼芙菲姆原野","monster":"無顱武士","boss":true}]},{"id":1230,"name":"破甲短錐","slot":"weapon","wtype":"단검","icon":"https://ro.hans-webgametw.com/assets/items/1230.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"尼芙菲姆原野","monster":"死靈騎士","boss":true}]},{"id":1529,"name":"高爾夫球桿","slot":"weapon","wtype":"클럽","icon":"https://ro.hans-webgametw.com/assets/items/1529.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"尼芙菲姆原野","monster":"死靈騎士","boss":true}]},{"id":2421,"name":"巴基力的長靴","slot":"shoes","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2421.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"尼芙菲姆原野","monster":"死靈騎士","boss":true}]},{"id":2524,"name":"巴基力的斗篷","slot":"garment","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2524.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"尼芙菲姆原野","monster":"死靈騎士","boss":true}]},{"id":5171,"name":"巴基力頭具","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5171.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"尼芙菲姆原野","monster":"死靈騎士","boss":true}]},{"id":2423,"name":"變形長靴","slot":"shoes","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2423.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"尼芙菲姆原野","monster":"死靈騎士","boss":true}]},{"id":2365,"name":"歐羅萊昂的制服","slot":"armor","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2365.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"尼芙菲姆原野","monster":"墮落大神官 悉潘","boss":true,"rare":true}]},{"id":2366,"name":"神聖的衣裳","slot":"armor","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2366.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"尼芙菲姆原野","monster":"墮落大神官 悉潘","boss":true,"rare":true}]},{"id":5170,"name":"羽毛貝雷帽","slot":"head_top","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/5170.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"尼芙菲姆原野","monster":"墮落大神官 悉潘","boss":true,"rare":true}]},{"id":2546,"name":"海灘斗篷","slot":"garment","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/2546.png","tiers":[6],"sources":[{"chapter":2,"tier":6,"stage":"尼芙菲姆原野","monster":"墮落大神官 悉潘","boss":true,"rare":true}]},{"id":22847,"name":"普隆德拉巡邏徽章","slot":"acc","wtype":"","icon":"https://ro.hans-webgametw.com/assets/items/22847.png","tiers":[2],"sources":[{"tier":2,"stage":"普隆德拉城","monster":"關卡獎勵","boss":false,"reward":true}]}];
  // Chinese names from the current public game translation catalog.
  const MONSTER_NAMES = {"poring":"波利","lunatic":"瘋兔","fabre":"綠棉蟲","pupa":"蟲蛹","drops":"土波利","picky":"小雞","roda_frog":"羅達蛙","peco_egg":"大嘴鳥蛋","condor":"禿鷹","savage_babe":"小野豬","creamy":"克瑞米","hornet":"蜂兵","mandragora":"曼陀羅魔花","baby_desert_wolf":"沙漠幼狼","rocker":"搖滾蝗蟲","eclipse":"月蝕兔","toad":"蛙王","dragon_fly":"龍蠅","vocal":"蟋蟀王","mastering":"波利之王","thief_bug_egg":"盜蟲卵","familiar":"吸血蝙蝠","thief_bug":"盜蟲","tarou":"白鼠","plankton":"漂浮蟲","drainliar":"紅蝙蝠","thief_bug_female":"浮勒盜蟲","cramp":"藍鼠","tarou_bite":"撕咬塔羅鼠","tarou_plague":"瘟疫塔羅鼠","tarou_burrow":"鑽地塔羅鼠","golden_thief_bug":"黃金蟲","chonchon":"蒼蠅","goblin":"哥布林","kobold":"狗頭人","orc_skeleton":"邪骸獸人","ghostring":"幽靈波利","orc_hero":"獸人英雄","osiris":"俄塞里斯","baphomet":"巴風特","orc_baby":"獸人嬰兒","goblin_archer":"弓箭哥布靈","orc_archer":"獸人弓箭手","orc_zombie":"獸人腐屍","goblin_leader":"哥布靈首領","kobold_leader":"犬妖首領","verit":"木乃伊犬","mummy":"木乃伊","matyr":"黑狐","isis":"伊希斯","minorous":"牛頭人","ancient_mummy":"狂暴木乃伊","hunter_fly":"赤蒼蠅","side_winder":"黑蛇","argiope":"艾吉歐蜈蚣","baphomet_jr":"小巴風特","killer_mantis":"狂暴螳螂","leib_olmai":"狂暴大腳熊","sasquatch":"雪熊","kukre":"庫克雷","marina":"水母","hydra":"海葵","whisper":"白幽靈","penomena":"梅納海葵","sword_fish":"異變魚","pirate_skel":"邪骸海盜","drake":"海盜之王","vadon":"螃蟹","cornutus":"卡那多斯","marse":"烏賊","phen":"劍魚","obeaune":"人魚","marine_sphere":"氣泡蟲","merman":"人魚士兵","kraken_leg":"魔鬼大烏賊腳","deviace":"狄奧斯","strouf":"海神","king_dramoh":"大腳龍蝦","kraken":"魔鬼大烏賊","spore":"魔菇","willow":"樹精","poporing":"波波利","snake":"青蛇","worm_tail":"森靈","poison_spore":"毒魔菇","smokie":"浣熊","wolf":"狼","elder_willow":"長老樹精","dragon_tail":"刺尾蜻蜓","bigfoot":"大腳熊","greatest_general":"將軍魔碑","dokebi":"土人","nine_tail":"九尾狐","angeling":"天使波利","deviling":"惡魔波利","vagabond_wolf":"流浪之狼","eddga":"虎王","zombie":"腐屍","skeleton":"邪骸戰士","skel_archer":"邪骸弓箭手","skel_soldier":"邪骸士兵","munak":"殭屍","bon_gun":"妖道","sohee":"鬼女","horong":"鬼火","skeleton_general":"邪骸戰士長","cat_o_nine_tail":"狂暴月夜貓","hyegun":"妖君","moonlight":"月夜貓","orc_warrior":"獸人戰士","orc_lady":"獸人女戰士","high_orc":"獸人戰士長","christmas_goblin":"聖誕哥布靈","cookie":"綠餅人","christmas_cookie":"甜餅人","cruiser":"玩具士兵","myst_case":"邪惡禮盒","siroma":"小雪獸","teddy_bear":"玩偶熊","snowier":"雪獸","gazeti":"蓋俄斯提","ice_titan":"冰巨人","baby_hatii":"卡崙寶寶","freezer":"水靈龜","stormy_knight":"冰暴騎士","hatii":"卡崙","antonio":"安東尼奧","leaf_cat":"群葉貓","the_paper":"紙妖","kapha":"釣魚河童","green_maiden":"小青","stone_shooter":"石炮火樹","iron_fist":"鐵蠍","zhu_po_long":"豬婆龍","enchanted_peach_tree":"猴桃木","wanderer":"邪骸浪人","wooden_golem":"機木人","dumpling_child":"元宵童子","spring_rabbit":"春兔","white_lady":"白素貞","evil_snake_lord":"墨蛇君","jakk":"南瓜先生","ghoul":"綠腐屍","marionette":"傀儡娃娃","deviruchi":"小惡魔","nightmare":"夢魘","giant_whisper":"巨大白幽靈","ogretooth":"獸牙怪","doppelganger":"死靈","dracula":"德古拉男爵","punk":"朽魔","clock":"古鐘魔","alarm":"鐘怪","rideword":"飛行魔書","bathory":"巫婆","mimic":"邪惡箱","joker":"裘卡","dark_frame":"鏡妖","clock_tower_manager":"鐘塔守護者","owl_duke":"鴞裊首領","executioner":"行刑者","mysteltainn":"弒神者","owl_baron":"鴞裊男爵","novus":"諾博斯","novus_novus":"黃諾博斯","dragon_egg":"龍蛋","ferus_ferus":"綠貝勒斯","ancient_mimic":"狂暴邪惡箱","acidus_acidus":"灰俄希托斯","ferus":"紅貝勒斯","acidus":"黃俄希托斯","hydrolancer":"三頭龍","detardeurus":"迪塔勒泰晤勒斯","ktullanux":"水晶龍","zombie_prisoner":"腐屍戰俘","skeleton_prisoner":"邪骸戰俘","raydric":"幽靈劍士","raydric_archer":"幽靈弓箭手","wraith":"惡靈","evil_druid":"闇神官","khalitzburg":"卡利斯格","chimera":"凱美拉","abysmal_knight":"深淵騎士","bloody_knight":"血腥騎士","dark_illusion":"迷幻之王","dark_lord":"黑暗之王","lude":"南瓜魂","quve":"萬聖魔","heirozoist":"兔斯拉","gibbet":"鬼娃樹","disguise":"假面鬼","bloody_murderer":"嗜血怪人","loli_ruri":"銀月魔女","dullahan":"無顱武士","lord_of_the_dead":"死靈騎士","fallen_bishop_hibram":"墮落大神官 悉潘"};
  const FILTER_KEY = 'greydust.ro.unwanted.catalog.v3';
  const PREVIOUS_FILTER_KEY = 'greydust.ro.unwanted.catalog.v2';
  const PRIMARY = [['str','STR'],['agi','AGI'],['vit','VIT'],['int','INT'],['dex','DEX'],['luk','LUK']];
  const SECOND3 = [['crit','爆擊'],['cd','急速'],['area','範圍'],['pierce','穿透機率']];
  const SECOND4 = [['spd','移動速度'],['flee','Flee'],['armor','護甲'],['hp','最大 HP']];
  const GEAR_SLOTS = [['onehand','單手武'],['twohand','雙手武'],['shield','盾牌'],['head_top','頭部（上）'],['head_mid','頭部（中）'],['head_low','頭部（下）'],['armor','護甲'],['garment','披肩'],['shoes','鞋子'],['acc','飾品']];
  const RARITIES=[['0','普通'],['1','優良'],['2','稀有'],['3','史詩'],['4','傳說']];
  const selections=value=>Array.isArray(value)?value:(value===undefined||value===null||value===''?[]:[value]);
  const copy=value=>JSON.parse(JSON.stringify(value));
  const emptyEquipmentFilter=()=>({version:3,unwantedRarities:[],disabledTiers:{},filters:[],assignments:{}});
  let filterStore=emptyEquipmentFilter(),filterDraft=null,filterDialog=null;
  function captureMerchantInventory() {
    const button=document.querySelector('#shop-filters [data-f].active');
    if(!button||button.dataset.f==='cards')return null;
    let inventory=null,inventoryIds=null;
    const candidates=new Set();
    // The native merchant reads an in-memory account through JSON.parse, rather
    // than localStorage for signed-in players. Capture only this synchronous
    // redraw, return every parsed value unchanged, and restore in finally.
    const original=JSON.parse;
    const originalHas=Set.prototype.has;
    try {
      JSON.parse=function(...args){
        const value=Reflect.apply(original,this,args);
        if(value&&Array.isArray(value.inventory)&&value.inventory.every(it=>it&&typeof it.uid==='string'&&Number.isFinite(it.itemId))){inventory=value.inventory;inventoryIds=new Set(inventory.map(item=>item.uid));}
        return value;
      };
      Set.prototype.has=function(value){
        if(typeof value==='string'&&inventoryIds&&originalHas.call(inventoryIds,value))candidates.add(this);
        return Reflect.apply(originalHas,this,[value]);
      };
      button.click();
    } finally {JSON.parse=original;Set.prototype.has=originalHas;}
    if(!inventory)return null;
    const cells=[...document.querySelectorAll('#shop-items [data-uid]')];
    const matching=[...candidates].filter(set=>cells.length&&cells.every(cell=>originalHas.call(set,cell.dataset.uid)===cell.classList.contains('picked')));
    return {inventory,selection:matching.length===1?matching[0]:null};
  }
  function selectUnwanted() {
    if(!smithDefs){notify('裝備資料尚未就緒，未變更選取');return;}
    const rule=filterStore;
    if(!validEquipmentFilter(rule)){openFilter();notify('請先儲存完整的圖鑑過濾設定');return;}
    let captured;
    try{captured=captureMerchantInventory();}catch(error){console.warn('[RO助手] 讀取商人清單失敗',error);notify('讀取商人清單失敗，未變更選取');return;}
    if(!captured){notify('無法讀取商人裝備資料，未變更選取');return;}
    const {inventory,selection}=captured;
    const byId=new Map(inventory.map(item=>[item.uid,item]));
    const cells=[...document.querySelectorAll('#shop-items [data-uid]')];
    if(cells.some(cell=>!byId.has(cell.dataset.uid))){notify('商人資料與清單不一致，未變更選取');return;}
    const targets=cells.filter(cell=>!cell.classList.contains('worn')&&!cell.classList.contains('safe'))
      .map(cell=>byId.get(cell.dataset.uid)).filter(item=>!item.safe&&!item.owner&&!smithDefs[item.itemId]?.starter&&isUnwantedEquipment(rule,item)).map(item=>item.uid);
    // Update the positively identified native selection Set in one redraw.
    // Inventory, cards, currencies and sale endpoints are never changed here.
    if(selection){
      selection.clear();for(const uid of targets)selection.add(uid);
      document.querySelector('#shop-filters [data-f].active')?.click();
      // Clear selected cards too, using the native clear-selection control if
      // cards were previously selected; the DOM fallback below handles that case.
      const cardPicked=document.querySelector('#shop-items [data-card].picked');
      if(!cardPicked){notify(`已選取 ${targets.length} 件不需要的裝備，請檢查後自行出售`);return;}
    }
    // Replace the selection. Never invoke either native sell button.
    document.querySelector('#shop-quality [data-q="none"]')?.click();
    let selected=0;
    for(const uid of targets){
      const cell=[...document.querySelectorAll('#shop-items [data-uid]')].find(el=>el.dataset.uid===uid);
      if(cell&&!cell.classList.contains('picked')&&!cell.classList.contains('worn')&&!cell.classList.contains('safe')){cell.click();selected++;}
    }
    notify(`已選取 ${selected} 件不需要的裝備，請檢查後自行出售`);
  }
  function updateMerchant() {
    const panel=document.querySelector('#shop'),bar=document.querySelector('#shop-quality');
    if(!panel||panel.classList.contains('hidden')||!bar||bar.querySelector('[data-ro-unwanted]'))return;
    const legend=bar.querySelector('[data-q="4"]');
    if(!legend)return;
    const unwanted=document.createElement('button');unwanted.type='button';unwanted.className='inv-chip';unwanted.textContent='不需要';unwanted.setAttribute('data-ro-unwanted','');unwanted.onclick=selectUnwanted;
    const filter=document.createElement('button');filter.type='button';filter.className='inv-chip';filter.textContent='過濾器';filter.onclick=openFilter;
    legend.after(unwanted,filter);
  }
  function formButton(text,action) {const button=document.createElement('button');button.type='button';button.className='ro-btn small';button.textContent=text;button.onclick=action;return button;}
  function formMulti(options,value,onchange,placeholder='不限') {
    const details=document.createElement('details');details.className='ro-filter-multi';
    const summary=document.createElement('summary'),list=document.createElement('div');list.className='ro-filter-multi-list';details.append(summary,list);
    const position=()=>{
      if(!details.open||typeof summary.getBoundingClientRect!=='function')return;
      const r=summary.getBoundingClientRect(),view=helperViewport(),width=Math.min(320,view.width-24);
      const below=view.top+view.height-r.bottom-12,above=r.top-view.top-12,up=below<160&&above>below;
      list.style.width=width+'px';list.style.left=Math.max(view.left+12,Math.min(r.left,view.left+view.width-width-12))+'px';
      list.style.maxHeight=Math.max(60,Math.min(280,up?above:below))+'px';
      list.style.top=up?'auto':(r.bottom+4)+'px';list.style.bottom=up?(innerHeight-r.top+4)+'px':'auto';
    };
    const unlisten=()=>{document.removeEventListener('scroll',position,true);window.removeEventListener('resize',position);window.visualViewport?.removeEventListener('resize',position);window.visualViewport?.removeEventListener('scroll',position);document.removeEventListener('pointerdown',outside,true);};
    const outside=event=>{if(!details.contains(event.target))details.closeMenu();};
    details.closeMenu=()=>{details.open=false;unlisten();};
    details.ontoggle=()=>{
      unlisten();if(!details.open)return;
      filterDialog?.querySelectorAll('.ro-filter-multi').forEach(menu=>{if(menu!==details)menu.closeMenu?.();});
      position();document.addEventListener('scroll',position,true);window.addEventListener('resize',position);window.visualViewport?.addEventListener('resize',position);window.visualViewport?.addEventListener('scroll',position);document.addEventListener('pointerdown',outside,true);
    };
    let selected=selections(value).map(String);
    const refresh=()=>{const names=options.filter(([id])=>selected.includes(String(id))).map(([,name])=>name.split(' ｜ ')[0]);summary.textContent=names.length?names.join('、')+'（OR）':placeholder;};
    const clear=formButton('清除選擇',()=>{selected=[];list.querySelectorAll('input').forEach(input=>input.checked=false);refresh();onchange([]);});list.append(clear);
    for(const [id,name]of options){
      const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=id;input.checked=selected.includes(String(id));
      input.onchange=()=>{selected=input.checked?[...new Set([...selected,String(id)])]:selected.filter(entry=>entry!==String(id));refresh();onchange([...selected]);};
      label.append(input);
      label.append(document.createTextNode(name));
      list.append(label);
    }
    refresh();return details;
  }
  const equipmentById=new Map(EQUIPMENT_CATALOG.map(item=>[item.id,item]));
  // Public game RO_LAPC (2026-11-16): six laps; RO_LAPTIER = base maximum + lap - 1.
  const EQUIPMENT_LAP_COUNT=6;
  const EQUIPMENT_BASE_MAX_TIER=3;
  function equipmentBaseMaxTier(){return EQUIPMENT_BASE_MAX_TIER;}
  function equipmentTiers(record){
    const base=equipmentBaseMaxTier();
    if(record.sources.length&&record.sources.every(source=>source.reward||source.monster==='關卡獎勵'))return [...record.tiers].sort((a,b)=>a-b);
    if(record.sources.every(source=>source.chapter===2))return [...new Set([...record.tiers,6,7,8])].sort((a,b)=>a-b);
    return [...new Set([...record.tiers,...Array.from({length:EQUIPMENT_LAP_COUNT-1},(_,i)=>base+i+1)])].sort((a,b)=>a-b);
  }
  function equipmentMaxTier(){return equipmentBaseMaxTier()+EQUIPMENT_LAP_COUNT-1;}
  let filterSlot='onehand',filterSearch='',gearDetails=null;
  let filterWeaponType='',filterExcludeTier=1;
  const weaponTypeLabels=[['단검','短劍'],['검','單手劍'],['양손검','雙手劍'],['카타르','拳刃'],['창','單手矛'],['양손창','雙手矛'],['도끼','單手斧'],['양손도끼','雙手斧'],['클럽','鈍器'],['너클','拳套'],['taekwon','跆拳拳套'],['롯드','法杖'],['책','書'],['활','弓'],['악기','樂器'],['채찍','鞭子'],['권총','手槍'],['라이플','步槍'],['샷건','散彈槍'],['수리검','風魔手裏劍'],['unknown','其他']];
  function groupWeaponType(group){return smithDefs?.[group.records[0].id]?.wtype||group.records[0].wtype||'unknown';}
  const emptyDetailSettings=()=>({first:[],second:[],third:[],fourth:[],skills:[]});
  function validDetailSettings(d){
    const field=(values,options)=>Array.isArray(values)&&values.length<=options.length&&values.every(v=>options.some(([id])=>id===v));
    return d&&field(d.first,PRIMARY)&&field(d.second,PRIMARY)&&field(d.third,SECOND3)&&field(d.fourth,SECOND4)
      &&Array.isArray(d.skills)&&d.skills.length<=500&&new Set(d.skills.map(s=>s?.id)).size===d.skills.length&&d.skills.every(s=>s&&typeof s.id==='string'&&s.id.length>0&&s.id.length<100&&typeof s.min==='number'&&Number.isFinite(s.min)&&s.min>=0&&s.min<=10000);
  }
  function validEquipmentFilter(data){
    if(!data||![2,3].includes(data.version)||!Array.isArray(data.unwantedRarities)||data.unwantedRarities.length>5||!data.unwantedRarities.every(v=>RARITIES.some(([id])=>id===v)))return false;
    if(!data.disabledTiers||typeof data.disabledTiers!=='object'||Array.isArray(data.disabledTiers)||Object.keys(data.disabledTiers).length>5000||!Object.entries(data.disabledTiers).every(([k,v])=>/^\d+:[1-9]\d*$/.test(k)&&v===true))return false;
    if(data.version===2)return data.details&&typeof data.details==='object'&&!Array.isArray(data.details)&&Object.keys(data.details).length<=1000&&Object.entries(data.details).every(([id,d])=>/^\d+$/.test(id)&&validDetailSettings(d));
    if(!Array.isArray(data.filters)||data.filters.length>100||new Set(data.filters.map(f=>f?.id)).size!==data.filters.length)return false;
    if(!data.filters.every(f=>f&&typeof f.id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(f.id)&&typeof f.name==='string'&&f.name.trim().length>0&&f.name.length<=80&&validDetailSettings(f)))return false;
    return data.assignments&&typeof data.assignments==='object'&&!Array.isArray(data.assignments)&&Object.keys(data.assignments).length<=1000&&Object.entries(data.assignments).every(([id,filter])=>/^\d+$/.test(id)&&data.filters.some(f=>f.id===filter));
  }
  function migrateEquipmentFilter(data){
    if(!validEquipmentFilter(data))throw new Error('不是有效的裝備過濾器');
    if(data.version===3)return copy(data);
    const next={...emptyEquipmentFilter(),unwantedRarities:copy(data.unwantedRarities),disabledTiers:copy(data.disabledTiers)},seen=new Map();
    for(const [id,d] of Object.entries(data.details)){
      const signature=JSON.stringify(d);let filter=seen.get(signature);
      if(!filter){filter={...copy(d),id:'migrated-'+next.filters.length,name:'細項過濾器 '+(next.filters.length+1)};next.filters.push(filter);seen.set(signature,filter);}
      next.assignments[id]=filter.id;
    }
    if(!validEquipmentFilter(next))throw new Error('舊設定超過可轉換的細項過濾器數量');
    return next;
  }
  function loadFilterStore(){
    try{const text=localStorage.getItem(FILTER_KEY)||localStorage.getItem(PREVIOUS_FILTER_KEY);if(text)filterStore=migrateEquipmentFilter(JSON.parse(text));}
    catch(error){console.warn('[RO助手] 圖鑑過濾器讀取失敗',error);}
  }
  function isUnwantedEquipment(config,item) {
    if(!validEquipmentFilter(config)||!item||item.safe||item.owner)return false;
    const record=equipmentById.get(Number(item.itemId)),def=smithDefs?.[item.itemId];
    // Unlisted/special gear and unknown legacy tiers are kept for manual review.
    if(!record||def?.starter||def?.secret||!Number.isInteger(item.tier)||item.tier<1)return false;
    const quality=item.quality??0;
    if(!Number.isInteger(quality)||quality<0||quality>4)return false;
    if(config.unwantedRarities.includes(String(quality))||config.disabledTiers[item.itemId+':'+item.tier])return true;
    const settings=config.version===2?config.details[item.itemId]:config.filters.find(f=>f.id===config.assignments[item.itemId]);if(!settings)return false;
    if(!Array.isArray(item.affixes))return false;
    const affixes=item.affixes;
    if(!affixes.every(a=>a&&typeof a==='object'&&typeof a.stat==='string'))return false;
    const first=affixes.filter(a=>PRIMARY.some(([id])=>id===a.stat));
    // Primary fields are unordered, but require two distinct affixes when both are set.
    const mainOK=(!settings.first.length&&!settings.second.length)
      ||(settings.first.length&&settings.second.length
        ?first.some((a,i)=>settings.first.includes(a.stat)&&first.some((b,j)=>i!==j&&settings.second.includes(b.stat)))
        :first.some(a=>(settings.first.length?settings.first:settings.second).includes(a.stat)));
    const thirdOK=!settings.third.length||affixes.some(a=>settings.third.includes(a.stat));
    const fourthOK=!settings.fourth.length||affixes.some(a=>settings.fourth.includes(a.stat));
    const skillOK=!settings.skills.length||settings.skills.some(s=>affixes.some(a=>a.stat==='skill'&&a.skill===s.id&&Number.isFinite(a.value)&&a.value*100+1e-8>=s.min));
    return !(mainOK&&thirdOK&&fourthOK&&skillOK);
  }
  function damageSkillOptions() {
    try {
      const ids=gameCatalog?.bU?.();
      if(!Array.isArray(ids))return [];
      return [...new Set(ids)].filter(id=>skillDefs?.[id]).map(id=>[id,`${skillDefs[id].name}傷害`]).sort((a,b)=>a[1].localeCompare(b[1],'zh-Hant'));
    }catch{return [];}
  }
  function equipmentGroups() {
    const groups=new Map();
    for(const record of EQUIPMENT_CATALOG){
      const def=smithDefs?.[record.id];if(def?.secret||def?.starter)continue;
      const slot=smithCategory(def||record),key=String(record.id);
      if(!groups.has(key))groups.set(key,{name:record.name,slot,records:[]});
      groups.get(key).records.push(record);
    }
    return [...groups.values()];
  }
  function actualEquipmentBonuses(record,tier){
    const def=smithDefs?.[record.id];
    if(!def||!Array.isArray(def.bonuses)||typeof gameCatalog?.bs!=='function')return null;
    try{
      const bonuses=[...def.bonuses,...gameCatalog.bs(record.id,tier)];
      if(!bonuses.every(b=>typeof b?.text==='function'))return null;
      return [...new Set(bonuses.map(b=>String(b.text(1)).replace(/<[^>]*>/g,'').trim()).filter(Boolean))];
    }catch{return null;}
  }
  function tierIsKept(config,ids,tier){return ids.every(id=>!config.disabledTiers[id+':'+tier]);}
  function setEquipmentTier(config,ids,tier,keep){
    for(const id of ids){if(keep)delete config.disabledTiers[id+':'+tier];else config.disabledTiers[id+':'+tier]=true;}
  }
  function excludeEquipmentTiers(config,max){
    for(const group of equipmentGroups())for(const tier of new Set(group.records.flatMap(r=>equipmentTiers(r))))if(tier<=max)setEquipmentTier(config,group.records.map(r=>r.id),tier,false);
  }
  function element(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
  function drawEquipmentCards(container,summary){
    const groups=equipmentGroups().filter(group=>group.slot===filterSlot&&(!filterWeaponType||groupWeaponType(group)===filterWeaponType));
    const query=filterSearch.trim().toLocaleLowerCase();
    const expanded=new Set([...container.querySelectorAll('.ro-gear-card')].filter(card=>card.querySelector('details')?.open).map(card=>card.dataset.gearId));
    container.replaceChildren();let shown=0;
    for(const group of groups){
      const searchable=group.name+' '+group.records.map(r=>r.id).join(' ')+' '+group.records.flatMap(r=>r.sources.map(s=>s.stage+' '+s.monster)).join(' ')+' '+group.records.flatMap(r=>equipmentTiers(r).flatMap(t=>actualEquipmentBonuses(r,t)||[])).join(' ');
      if(query&&!searchable.toLocaleLowerCase().includes(query))continue;
      shown++;
      const card=element('article',undefined,'ro-gear-card'),header=element('header');card.dataset.gearId=String(group.records[0].id);
      const image=element('img');image.src=group.records[0].icon;image.alt='';image.loading='lazy';
      const duplicate=EQUIPMENT_CATALOG.some(r=>r.id!==group.records[0].id&&r.name===group.name);
      const displayName=group.name+(duplicate?'（ID '+group.records[0].id+'）':'');
      const title=element('b',displayName),settings=element('select');settings.className='ro-gear-filter-select';settings.setAttribute('aria-label',displayName+'細項過濾器');
      const assigned=[...new Set(group.records.map(r=>filterDraft.assignments[r.id]||''))];
      const options=[['','不限細項'],...filterDraft.filters.map(f=>[f.id,f.name])];
      if(assigned.length>1)options.unshift(['__mixed','多個設定']);
      for(const [id,name] of options){const option=element('option',name);option.value=id;option.selected=id===(assigned.length>1?'__mixed':assigned[0]);option.disabled=id==='__mixed';settings.append(option);}
      settings.onchange=()=>{for(const r of group.records){if(settings.value)filterDraft.assignments[r.id]=settings.value;else delete filterDraft.assignments[r.id];}};
      header.append(image,title,settings);card.append(header);
      const sources=element('ul',undefined,'ro-gear-sources'),locations=new Map();
      sources.setAttribute('aria-label','掉落來源');
      for(const record of group.records)for(const source of record.sources){
        if(!locations.has(source.stage))locations.set(source.stage,new Set());
        locations.get(source.stage).add((source.boss?'👑 ':'')+source.monster+(source.rare?'（闖入者）':''));
      }
      for(const [location,monsters] of locations)sources.append(element('li',location+'：'+[...monsters].join('、')));
      card.append(sources);
      const tiers=[...new Set(group.records.flatMap(r=>equipmentTiers(r)))].sort((a,b)=>a-b);
      const toggles=element('div',undefined,'ro-gear-tier ro-gear-tier-switches'),details=element('details',undefined,'ro-gear-expanded');
      details.open=expanded.has(card.dataset.gearId);details.append(element('summary','各階屬性'));
      const bonusGroups=new Map();
      for(const tier of tiers){
        const records=group.records,ids=records.map(r=>r.id);
        const keep=tierIsKept(filterDraft,ids,tier);
        const toggle=formButton('T'+tier,()=>{setEquipmentTier(filterDraft,ids,tier,!tierIsKept(filterDraft,ids,tier));drawEquipmentCards(container,summary);});
        toggle.dataset.gearTier=String(tier);toggle.setAttribute('aria-pressed',String(keep));toggle.setAttribute('aria-label',group.name+' T'+tier+' 保留');toggle.classList.toggle('excluded',!keep);
        const bonuses=actualEquipmentBonuses(records[0],tier);
        toggles.append(toggle);
        const text=bonuses===null?'遊戲屬性資料尚未就緒':bonuses.length?bonuses.join(' · '):'無固有加成（依實際裝備資料）';
        if(!bonusGroups.has(text))bonusGroups.set(text,[]);bonusGroups.get(text).push(tier);
        if(tier===tiers.at(-1))card.dataset.highestBonus='T'+tier+'：'+text;
      }
      card.append(toggles,element('p',card.dataset.highestBonus,'ro-gear-bonus-preview'));
      delete card.dataset.highestBonus;
      for(const [text,values] of bonusGroups){const row=element('div',undefined,'ro-gear-tier');row.append(element('b',values.map(t=>'T'+t).join('／')),element('span',text));details.append(row);}
      card.append(details);container.append(card);
    }
    summary.textContent='目前分類 '+shown+' 筆裝備；T 亮起＝保留，關閉＝不需要。';
    if(!shown)container.append(element('p','沒有符合搜尋的裝備。'));
  }
  function closeFilterMenus(root=filterDialog){root?.querySelectorAll('.ro-filter-multi').forEach(menu=>menu.closeMenu?.());}
  function closeGearDetails(){closeFilterMenus(gearDetails);gearDetails?.remove();gearDetails=null;}
  function openGearDetails(){
    closeGearDetails();
    const working={filters:copy(filterDraft.filters),assignments:copy(filterDraft.assignments)};
    let selected=working.filters[0]?.id||'';
    gearDetails=element('div',undefined,'ro-gear-detail-backdrop');
    const panel=element('section',undefined,'ro-gear-detail-panel ro-detail-manager');panel.setAttribute('role','dialog');panel.setAttribute('aria-label','管理細項過濾器');gearDetails.append(panel);filterDialog.append(gearDetails);
    const draw=()=>{
      closeFilterMenus(panel);panel.replaceChildren();panel.append(element('h3','管理細項過濾器'),element('p','同格多選符合任一項，不同格必須全部符合；未選不限。移除過濾器會一併解除裝備的選用。'));
      const layout=element('div',undefined,'ro-detail-layout'),sidebar=element('div',undefined,'ro-detail-list'),editor=element('div',undefined,'ro-detail-editor');
      sidebar.append(formButton('新增',()=>{if(working.filters.length>=100)return;const f={...emptyDetailSettings(),id:'f-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),name:'新細項過濾器'};working.filters.push(f);selected=f.id;draw();}));
      working.filters.forEach((f,index)=>{
        const row=element('div',undefined,'ro-detail-list-row'),choose=formButton(f.name,()=>{selected=f.id;draw();});choose.dataset.detailId=f.id;choose.classList.toggle('active',selected===f.id);row.append(choose);
        for(const [delta,label] of [[-1,'↑'],[1,'↓']]){const button=formButton(label,()=>{const other=index+delta;[working.filters[index],working.filters[other]]=[working.filters[other],working.filters[index]];draw();});button.disabled=index+delta<0||index+delta>=working.filters.length;button.setAttribute('aria-label',f.name+(delta<0?'上移':'下移'));row.append(button);}sidebar.append(row);
      });
      const settings=working.filters.find(f=>f.id===selected);
      if(settings){
        const name=element('input');name.type='text';name.maxLength=80;name.value=settings.name;name.setAttribute('aria-label','細項過濾器名稱');name.oninput=()=>{settings.name=name.value;const button=sidebar.querySelector('[data-detail-id="'+settings.id+'"]');if(button)button.textContent=name.value||'未命名';};editor.append(name,formButton('移除',()=>{working.filters=working.filters.filter(f=>f.id!==selected);for(const [id,value] of Object.entries(working.assignments))if(value===selected)delete working.assignments[id];selected=working.filters[0]?.id||'';draw();}));
        for(const [key,title,options] of [['first','屬性一',PRIMARY],['second','屬性二',PRIMARY],['third','副屬性第一格',SECOND3],['fourth','副屬性第二格',SECOND4]]){
          const row=element('div',undefined,'ro-gear-detail-field');row.append(element('b',title),formMulti(options,settings[key],v=>settings[key]=v,'不限（可多選）'));editor.append(row);
        }
        const options=damageSkillOptions(),known=new Set(options.map(([id])=>id));for(const s of settings.skills)if(!known.has(s.id))options.push([s.id,s.id]);
        const skillRows=element('div',undefined,'ro-selected-skills'),thresholds=new Map(settings.skills.map(s=>[s.id,s.min]));
        const drawSkills=()=>{skillRows.replaceChildren();for(const skill of settings.skills){const row=element('label',undefined,'ro-gear-skill'),min=element('input');min.type='number';min.min='0';min.max='10000';min.step='0.1';min.value=Number.isFinite(skill.min)?String(skill.min):'';const title=options.find(([id])=>id===skill.id)?.[1]||skill.id;min.setAttribute('aria-label',title+'最低百分比');min.oninput=()=>{skill.min=min.value.trim()===''?NaN:Number(min.value);thresholds.set(skill.id,skill.min);};row.append(element('span',title),min,element('span','% 以上'));skillRows.append(row);}};
        const skillField=element('div',undefined,'ro-gear-detail-field');skillField.append(element('b','技能傷害'),formMulti(options,settings.skills.map(s=>s.id),ids=>{settings.skills=ids.map(id=>({id,min:thresholds.get(id)??0}));drawSkills();},'不限（可多選）'));editor.append(skillField,skillRows);drawSkills();
      }else editor.append(element('p','按「新增」建立可供裝備選用的細項過濾器。'));
      layout.append(sidebar,editor);panel.append(layout);
      const status=element('p','', 'ro-gear-error');panel.append(status,formButton('套用管理設定',()=>{
        const next={...filterDraft,...working};if(!validEquipmentFilter(next)){status.textContent='請填寫名稱，最低百分比必須為 0～10000 的有效數字。';return;}
        filterDraft.filters=copy(working.filters);filterDraft.assignments=copy(working.assignments);closeGearDetails();drawFilter();
      }),formButton('取消',closeGearDetails));
    };draw();
  }
  function parseFilterImport(text){
    if(typeof text!=='string'||text.length>500000)throw new Error('檔案過大');
    const data=JSON.parse(text);if(data?.format!=='ro-helper-equipment')throw new Error('不是有效的新版裝備過濾器');return migrateEquipmentFilter(data.settings);
  }
  function drawFilter(){
    if(!filterDialog||!filterDraft)return;
    const panel=filterDialog.querySelector('.ro-filter-panel');closeFilterMenus(panel);panel.replaceChildren();
    panel.append(element('h3','裝備圖鑑過濾器'),element('p','設定不要的稀有度、關閉不保留的 Tier；裝備右上角選取細項過濾器。任一已設定欄位未符合即納入「不需要」。只勾選目前商人分類，請檢查後自行出售。'));
    const toolbar=element('div',undefined,'ro-gear-toolbar');
    const rarities=element('div',undefined,'ro-rarity-buttons');
    for(const [id,name] of RARITIES){const button=formButton(name,()=>{filterDraft.unwantedRarities=filterDraft.unwantedRarities.includes(id)?filterDraft.unwantedRarities.filter(v=>v!==id):[...filterDraft.unwantedRarities,id];drawFilter();});button.dataset.unwantedRarity=id;button.style.setProperty('--rarity-color',COLORS[Number(id)]);button.classList.toggle('excluded',filterDraft.unwantedRarities.includes(id));button.setAttribute('aria-pressed',String(filterDraft.unwantedRarities.includes(id)));button.setAttribute('aria-label',name+' 不要');rarities.append(button);}
    const manager=formButton('管理細項過濾器',openGearDetails);manager.classList.add('ro-manage-details');
    toolbar.append(rarities);
    const batch=element('div',undefined,'ro-tier-batch'),cutoff=element('select');cutoff.dataset.excludeTierSelect='';cutoff.setAttribute('aria-label','批次過濾階級');
    for(let tier=1;tier<equipmentMaxTier();tier++){const option=element('option','T'+tier+' 以下');option.value=String(tier);option.selected=tier===filterExcludeTier;cutoff.append(option);}
    cutoff.onchange=()=>{filterExcludeTier=Number(cutoff.value);};
    const applyTier=formButton('套用過濾',()=>{const tier=Number(cutoff.value);if(!Number.isInteger(tier)||tier<1||tier>=equipmentMaxTier())return;filterExcludeTier=tier;excludeEquipmentTiers(filterDraft,tier);drawFilter();});applyTier.dataset.excludeTierApply='';
    batch.append(cutoff,applyTier);toolbar.append(batch);
    toolbar.append(manager);panel.append(toolbar);
    const actions=element('div',undefined,'ro-gear-actions'),status=element('span','');
    const save=formButton('儲存並套用',()=>{
      if(!validEquipmentFilter(filterDraft)){status.textContent='設定不完整，無法儲存';return;}
      try{localStorage.setItem(FILTER_KEY,JSON.stringify(filterDraft));filterStore=copy(filterDraft);closeFilter();notify('圖鑑過濾器已儲存');}catch{status.textContent='儲存失敗，請匯出備份';}
    });save.dataset.filterSave='';
    actions.append(save,formButton('取消',closeFilter),formButton('全部保留',()=>{filterDraft={...emptyEquipmentFilter(),filters:copy(filterDraft.filters)};drawFilter();}),formButton('匯出',()=>{
      const url=URL.createObjectURL(new Blob([JSON.stringify({format:'ro-helper-equipment',settings:filterDraft},null,2)],{type:'application/json'}));
      const a=element('a');a.href=url;a.download='RO裝備圖鑑過濾器.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }));
    const file=element('input');file.type='file';file.accept='.json,application/json';file.hidden=true;
    file.onchange=async()=>{try{const f=file.files?.[0];if(!f)return;if(f.size>500000)throw new Error('檔案過大');filterDraft=parseFilterImport(await f.text());drawFilter();}catch(error){status.textContent='匯入失敗：'+error.message;}};
    actions.append(file,formButton('匯入',()=>file.click()),status);panel.append(actions);
    const tabs=element('nav',undefined,'ro-gear-tabs'),counts=equipmentGroups();
    for(const [id,name] of GEAR_SLOTS){const button=formButton(name+' '+counts.filter(g=>g.slot===id).length,()=>{filterSlot=id;filterWeaponType='';drawFilter();});button.dataset.gearSlot=id;button.classList.toggle('active',id===filterSlot);button.setAttribute('aria-pressed',String(id===filterSlot));tabs.append(button);}panel.append(tabs);
    if(['onehand','twohand'].includes(filterSlot)){
      const weapons=counts.filter(g=>g.slot===filterSlot),subtabs=element('nav',undefined,'ro-gear-tabs ro-weapon-tabs');subtabs.setAttribute('aria-label','武器細項分類');
      const available=new Set(weapons.map(groupWeaponType));
      const types=[['','全部'],...weaponTypeLabels.filter(([id])=>available.has(id)),...[...available].filter(id=>!weaponTypeLabels.some(([known])=>known===id)).map(id=>[id,'其他（'+id+'）'])];
      for(const [id,name] of types){const count=id?weapons.filter(g=>groupWeaponType(g)===id).length:weapons.length;const button=formButton(name+' '+count,()=>{filterWeaponType=id;drawFilter();});button.dataset.weaponType=id;button.classList.toggle('active',filterWeaponType===id);button.setAttribute('aria-pressed',String(filterWeaponType===id));subtabs.append(button);}panel.append(subtabs);
    }
    const search=element('input');search.type='search';search.placeholder='搜尋裝備、屬性、關卡或中文怪物';search.value=filterSearch;search.setAttribute('aria-label','搜尋裝備圖鑑');
    const summary=element('p'),cards=element('div',undefined,'ro-gear-grid');search.oninput=()=>{filterSearch=search.value;drawEquipmentCards(cards,summary);};panel.append(search,summary,cards);
    panel.append(element('p','屬性依遊戲目前載入的裝備 ID、固有加成與 Tier 函式顯示（未計入精煉、隨機詞綴或卡片）。名稱與掉落來源快照：2026-11-16；同名裝備依 ID 分開。未列出的特殊裝備或缺少必要判斷資料時保留手動檢查。'));
    drawEquipmentCards(cards,summary);
  }
  function closeFilter(){closeFilterMenus();closeGearDetails();filterDialog?.remove();filterDialog=null;filterDraft=null;}
  function openFilter(){
    closeFilter();filterDraft=copy(filterStore);filterDialog=element('div');filterDialog.id='ro-unwanted-dialog';filterDialog.setAttribute('role','dialog');filterDialog.setAttribute('aria-label','裝備圖鑑過濾器');filterDialog.setAttribute('aria-modal','true');
    const panel=element('div',undefined,'ro-filter-panel ro-equipment-filter');filterDialog.append(panel);document.body.append(filterDialog);
    filterDialog.onclick=event=>{if(event.target===filterDialog)closeFilter();};drawFilter();
  }
  const inventoryViews=new Map();
  const inventoryNativeHandlers=new WeakMap();
  let inventoryUpdating=false;
  let inventoryItems=new Map();
  let equipmentCurrentItem=null;
  const inventoryCategories=[['all','全部'],['onehand','單手武'],['twohand','雙手武'],['head_top','頭部上'],['head_mid','頭部中'],['head_low','頭部下'],['armor','護甲'],['shield','盾牌'],['garment','披肩'],['shoes','鞋子'],['acc','飾品']];
  function gearArray(value){return Array.isArray(value)&&value.length>0&&value.every(item=>item&&typeof item.uid==='string'&&Number.isFinite(item.itemId)&&Array.isArray(item.cards));}
  function inventoryMatches(item,category,type=''){
    const def=smithDefs?.[item.itemId];
    if(!def)return category==='all'&&!type;
    return (category==='all'||smithCategory(def)===category||def.slot===category)&&(!type||def.wtype===type);
  }
  // Intercept only a synchronous, native UI redraw. Never replace account arrays
  // or install a persistent prototype hook; native actions keep their own data.
  function withInventoryView(action,view){
    const original=Array.prototype.filter;
    let bagPredicate=null;
    try{
      Array.prototype.filter=function(...args){
        const result=Reflect.apply(original,this,args);
        if(!gearArray(this))return result;
        for(const item of this)inventoryItems.set(item.uid,item);
        // Restrict only the displayed-list predicate, not account/ownership
        // arrays captured by native "store all" / "take this page" actions.
        const predicate=args[0],source=Function.prototype.toString.call(predicate).replace(/\s+/g,'');
        if(view.id==='storage'){
          if(predicate.name!=='passes'&&!/\bpasses\(/.test(source))return result;
        }else{
          if(!bagPredicate&&/^\(?([\w$]+)\)?=>[\w$]+\([\w$]+,\1\)$/.test(source))bagPredicate=predicate;
          if(predicate!==bagPredicate)return result;
        }
        return Reflect.apply(original,result,[item=>inventoryMatches(item,view.category,view.type)]);
      };
      return action();
    }finally{Array.prototype.filter=original;}
  }
  const equipmentBaseScores=new Map();
  function withEquipmentScoreCapture(action,uid){
    const find=Array.prototype.find,filter=Array.prototype.filter,map=Array.prototype.map;
    const hasCurrent=!!document.querySelector('#cp-eq-current .eq-name');
    if(!hasCurrent)equipmentCurrentItem=null;
    let inventory=null,current=null;
    const isInventory=value=>gearArray(value)&&value.some(item=>item.uid===uid);
    try{
      Array.prototype.find=function(...args){
        const result=Reflect.apply(find,this,args);
        if(!inventory&&isInventory(this))inventory=this;
        if(this!==inventory)return result;
        for(const item of this)inventoryItems.set(item.uid,item);
        // Native render reads the current slot before enumerating candidates.
        // A click may first look up the selected item to clear its "new" flag.
        if(hasCurrent&&!current&&result&&result.uid!==uid){current=result;equipmentCurrentItem=result;}
        return result;
      };
      Array.prototype.filter=function(...args){
        const result=Reflect.apply(filter,this,args);
        if(!inventory&&isInventory(this))inventory=this;
        if(this!==inventory)return result;
        for(const item of this)inventoryItems.set(item.uid,item);
        return result;
      };
      Array.prototype.map=function(callback,thisArg){
        const result=Reflect.apply(map,this,[callback,thisArg]);
        // Native candidate scorer returns {g: gear, s: score}. Reuse that
        // closure for pristine copies, preserving job, Tier and affix weights.
        if(gearArray(this)&&result.length===this.length&&result.every((row,index)=>row?.g===this[index]&&Number.isFinite(row.s))){
          for(const item of [...this,...(current?[current]:[])]){
            try{
              const base={...item,refine:0,star:0,cards:item.cards.map(()=>null)};
              const scored=Reflect.apply(callback,thisArg,[base,0,this]);
              if(scored?.g===base&&Number.isFinite(scored.s))equipmentBaseScores.set(item.uid,String(scored.s));
            }catch{/* Unknown native scoring must leave the original display intact. */}
          }
        }
        return result;
      };
      const result=action();
      paintEquipmentBaseScores(uid);
      return {result,current};
    }finally{Array.prototype.find=find;Array.prototype.filter=filter;Array.prototype.map=map;}
  }
  function refinePreviewMultiplier(item){
    return 1+[.04,.04,.04,.04,.06,.06,.06,.12,.12,.12].slice(0,Math.max(0,Math.min(10,item.refine||0))).reduce((sum,value)=>sum+value,0);
  }
  function inventoryBonusLines(item){
    const def=smithDefs?.[item.itemId];if(!def)return [];
    const multiplier=refinePreviewMultiplier(item),lines=[];
    const add=(label,bonuses)=>{
      const values=(bonuses||[]).map(bonus=>typeof bonus.text==='function'?String(bonus.text(multiplier)).replace(/<[^>]*>/g,''):'').filter(Boolean);
      if(values.length)lines.push([label,values.join(' · ')]);
    };
    add('內建',[...(def.bonuses||[]),...(gameCatalog?.bs?.(item.itemId,item.tier||1)||[])]);
    const primary=(item.affixes||[]).filter(affix=>PRIMARY.some(([id])=>id===affix.stat));
    const secondary=(item.affixes||[]).filter(affix=>affix.stat!=='skill'&&!PRIMARY.some(([id])=>id===affix.stat));
    if(typeof gameCatalog?.bt==='function'){
      add('屬性',gameCatalog.bt(primary));add('副屬性',gameCatalog.bt(secondary));
    }
    const skills=(item.affixes||[]).filter(affix=>affix.stat==='skill'&&affix.skill);
    if(skills.length)lines.push(['技能傷害',skills.map(affix=>String(skillDefs?.[affix.skill]?.name||affix.skill).replace(/<[^>]*>/g,'')+' +'+Number((affix.value*multiplier*100).toFixed(2))+'%').join(' · ')]);
    return lines;
  }
  function inventoryDetailRow(row,item){
    const lines=inventoryBonusLines(item),signature=JSON.stringify(lines);
    let details=row.querySelector('[data-ro-gear-details]');
    if(details?.dataset.signature===signature)return;
    if(!details){details=document.createElement('div');details.dataset.roGearDetails='';row.querySelector('.cand-info')?.append(details);}
    details.dataset.signature=signature;details.replaceChildren();
    for(const [label,text] of lines){const line=document.createElement('div');line.textContent=label+'：'+text;details.append(line);}
  }
  function nativeInventoryHandler(node,event){return inventoryNativeHandlers.get(node)?.[event]||node?.[event];}
  const probedEquipRows=new WeakSet();
  function appendEquipmentBaseScore(root,uid){
    const gs=root?.querySelector('.gs'),score=equipmentBaseScores.get(uid);
    if(!gs||score===undefined)return;
    let note=gs.querySelector('[data-ro-equipment-base-gs]');
    if(!note){note=document.createElement('span');note.dataset.roEquipmentBaseGs='';gs.querySelector('b')?.after(note);}
    const text=' ('+score+')';if(note.textContent!==text)note.textContent=text;
    if(note.title!=='基底 GS：不含卡片、精煉加值與星數；保留品質、Tier 與詞綴')note.title='基底 GS：不含卡片、精煉加值與星數；保留品質、Tier 與詞綴';
  }
  function paintEquipmentBaseScores(uid){
    appendEquipmentBaseScore(document.querySelector('#cp-eq-current'),equipmentCurrentItem?.uid);
    appendEquipmentBaseScore(document.querySelector('#cp-eq-cmp .cmp-head'),uid);
  }
  function updateCandidateScores(list,rows){
    for(const row of rows)appendEquipmentBaseScore(row,row.dataset.uid);
    appendEquipmentBaseScore(document.querySelector('#cp-eq-current'),equipmentCurrentItem?.uid);
  }
  function updateEquipCandidates(){
    const panel=document.querySelector('#charpanel'),list=document.querySelector('#cp-eq-list');
    if(!panel||panel.classList.contains('hidden')||document.querySelector('#cp-tab-equip')?.classList.contains('hidden')||!list||!smithDefs)return;
    const rows=[...list.querySelectorAll('.cand[data-uid]')];
    if(rows.length&&!probedEquipRows.has(rows[0])){
      probedEquipRows.add(rows[0]);
      const enter=nativeInventoryHandler(rows[0],'onpointerenter'),leave=list.onpointerleave;
      if(typeof enter==='function')withEquipmentScoreCapture(()=>Reflect.apply(enter,rows[0],[{pointerType:'mouse'}]),rows[0].dataset.uid);
      const selectedItem=inventoryItems.get(rows[0].dataset.uid),click=nativeInventoryHandler(rows[0],'onclick');
      if(rows[0].classList.contains('sel')&&selectedItem&&!selectedItem.isNew&&typeof click==='function')withEquipmentScoreCapture(()=>Reflect.apply(click,rows[0],[]),selectedItem.uid);
      if(typeof leave==='function')Reflect.apply(leave,list,[]);
    }
    for(const row of rows){
      if(!inventoryNativeHandlers.has(row)){
        const enter=row.onpointerenter,click=row.onclick;
        inventoryNativeHandlers.set(row,{onpointerenter:enter,onclick:click});
        if(typeof enter==='function')row.onpointerenter=function(event){
          if(event.pointerType!=='mouse')return Reflect.apply(enter,this,[event]);
          const result=withEquipmentScoreCapture(()=>Reflect.apply(enter,this,[event]),row.dataset.uid);
          updateEquipCandidates();return result.result;
        };
        if(typeof click==='function')row.onclick=function(event){
          // Let the real selection clear its new flag/save normally first.
          const result=withEquipmentScoreCapture(()=>Reflect.apply(click,this,[event]),row.dataset.uid).result;
          updateEquipCandidates();return result;
        };
      }
      const item=inventoryItems.get(row.dataset.uid);if(item)inventoryDetailRow(row,item);
    }
    if(list.onpointerleave!==inventoryNativeHandlers.get(list)?.onpointerleaveWrapper&&typeof list.onpointerleave==='function'){
      const leave=list.onpointerleave;inventoryNativeHandlers.set(list,{onpointerleave:leave});
      list.onpointerleave=function(event){
        const uid=list.querySelector('.cand.sel')?.dataset.uid;
        if(!uid)return Reflect.apply(leave,this,[event]);
        const result=withEquipmentScoreCapture(()=>Reflect.apply(leave,this,[event]),uid);return result.result;
      };
      inventoryNativeHandlers.get(list).onpointerleaveWrapper=list.onpointerleave;
    }
    updateCandidateScores(list,rows);
  }
  function inventoryViewConfig(id){
    return id==='bag'?{panel:'#charpanel',filters:'#cp-inv-filters',rows:'#cp-inventory [data-uid]',controls:'#cp-only-mine, #ks-inv-sort'}
      :{panel:'#kstorage',filters:'#ks-filt',rows:'#ks-bag [data-uid], #ks-st [data-uid]',controls:'#ks-q, #ks-sort-w, #ks-bp-prev, #ks-bp-next, #ks-pages [data-p]:not(.lock)'};
  }
  function redrawInventory(view,resetPage=false){
    const config=inventoryViewConfig(view.id),filters=document.querySelector(config.filters);
    const base=filters?.querySelector('[data-f="'+(view.category==='onehand'||view.category==='twohand'?'weapon':view.category.startsWith('head_')?'head':view.category)+'"]')||filters?.querySelector('[data-f="all"]');
    const handler=nativeInventoryHandler(base,'onclick');
    if(resetPage&&view.id==='storage'){
      const all=filters?.querySelector('[data-f="all"]'),allHandler=nativeInventoryHandler(all,'onclick');
      if(typeof allHandler==='function')withInventoryView(()=>Reflect.apply(allHandler,all,[null]),view);
    }
    if(typeof handler==='function')withInventoryView(()=>Reflect.apply(handler,base,[null]),view);
  }
  function updateInventoryViews(){
    if(inventoryUpdating||pickerIsOpen()||touchUiIsQuiet()||!smithDefs)return;
    inventoryUpdating=true;
    try{
      for(const id of ['bag','storage']){
        const config=inventoryViewConfig(id),panel=document.querySelector(config.panel),filters=document.querySelector(config.filters);
        if(!panel||panel.classList.contains('hidden')||id==='bag'&&document.querySelector('#cp-tab-inv')?.classList.contains('hidden')||!filters)continue;
        let view=inventoryViews.get(id);
        if(!view){view={id,category:'all',type:''};inventoryViews.set(id,view);}
        if(!filters.querySelector('[data-ro-inventory-categories]'))redrawInventory(view);
        for(const button of filters.querySelectorAll('[data-f]')){
          if(['weapon','head'].includes(button.dataset.f)){button.hidden=true;continue;}
          if(inventoryNativeHandlers.has(button))continue;
          const original=button.onclick;inventoryNativeHandlers.set(button,{onclick:original});
          button.onclick=function(event){view.category=button.dataset.f;view.type='';const result=Reflect.apply(original,this,[event]);updateInventoryViews();return result;};
        }
        let extras=filters.querySelector('[data-ro-inventory-categories]');
        if(!extras){
          extras=document.createElement('span');extras.dataset.roInventoryCategories='';
          for(const [category,label] of inventoryCategories.filter(([key])=>key==='onehand'||key==='twohand'||key.startsWith('head_'))){
            const button=document.createElement('button');button.type='button';button.className='inv-chip';button.dataset.roInventoryCategory=category;button.textContent=label;
            button.onclick=()=>{view.category=category;view.type='';redrawInventory(view,true);updateInventoryViews();};extras.append(button);
          }
          const head=filters.querySelector('[data-f="weapon"]');if(head)head.after(extras);else filters.prepend(extras);
        }
        for(const button of filters.querySelectorAll('[data-ro-inventory-category]'))button.classList.toggle('active',button.dataset.roInventoryCategory===view.category);
        for(const button of filters.querySelectorAll('[data-f]'))if(['onehand','twohand','head_top','head_mid','head_low'].includes(view.category))button.classList.remove('active');
        let sub=panel.querySelector('[data-ro-inventory-subtypes]');
        if(!sub){sub=document.createElement('div');sub.dataset.roInventorySubtypes='';filters.parentElement.insertBefore(sub,filters.nextSibling);}
        const types=['onehand','twohand'].includes(view.category)?weaponTypeLabels.filter(([type])=>Object.values(smithDefs).some(def=>smithCategory(def)===view.category&&def.wtype===type)):[];
        const signature=JSON.stringify([view.category,view.type,types]);
        if(sub.dataset.signature!==signature){
          sub.dataset.signature=signature;sub.replaceChildren();
          for(const [type,label] of types.length?[['','全部'],...types]:[]){
            const button=document.createElement('button');button.type='button';button.className='inv-chip';button.classList.toggle('active',view.type===type);button.textContent=label;
            button.onclick=()=>{view.type=type;redrawInventory(view,true);updateInventoryViews();};sub.append(button);
          }
        }
        for(const control of panel.querySelectorAll(config.controls)){
          const event=control.tagName==='INPUT'&&control.type==='search'?'oninput':control.tagName==='BUTTON'?'onclick':'onchange',original=control[event];
          if(original===inventoryNativeHandlers.get(control)?.controlWrapper)continue;
          if(typeof original!=='function')continue;
          inventoryNativeHandlers.set(control,{[event]:original});
          control[event]=function(...args){const result=withInventoryView(()=>Reflect.apply(original,this,args),view);updateInventoryViews();return result;};
          inventoryNativeHandlers.get(control).controlWrapper=control[event];
        }
      }
      updateEquipCandidates();
    }finally{inventoryUpdating=false;}
  }
  let tradeItemName=null,tradeCardName=null,tradeSearchState=null;
  let tradeSearchManifest=null;
  const tradeIconNames=new Map();
  function initializeTradeSearch(module){
    const functions=Object.values(module||{}).filter(value=>typeof value==='function');
    tradeItemName=functions.find(fn=>/\.manifest\.items/.test(String(fn))&&/\.name/.test(String(fn))&&/"#"\s*\+/.test(String(fn)))||null;
    tradeCardName=functions.find(fn=>/\.manifest\.cards/.test(String(fn))&&/\.name/.test(String(fn))&&/1000000/.test(String(fn)))||null;
    updateTradeSearch();
  }
  function tradeSearchText(cell){
    const id=cell.dataset.card||cell.dataset.ore;
    if(id){const name=cell.dataset.card?tradeCardName:tradeItemName;return name?String(name(Number(id))):null;}
    const manifest=smithAssets?.manifest?.items;
    if(!manifest||!tradeItemName)return null;
    if(manifest!==tradeSearchManifest){
      tradeSearchManifest=manifest;tradeIconNames.clear();
      for(const [itemId,item] of Object.entries(manifest)){
        if(!item.icon)continue;
        const suffix='/'+decodeURI(item.icon).replace(/^(?:\.\/|\/)+/,'');
        tradeIconNames.set(suffix,(tradeIconNames.get(suffix)||'')+' '+tradeItemName(Number(itemId)));
      }
    }
    let path;try{path=decodeURI(new URL(cell.querySelector('img')?.getAttribute('src'),location.href).pathname);}catch{return null;}
    const names=[];
    for(let index=path.indexOf('/');index>=0;index=path.indexOf('/',index+1))if(tradeIconNames.has(path.slice(index)))names.push(tradeIconNames.get(path.slice(index)));
    return names.length?names.join(' '):null;
  }
  function updateTradeSearch(){
    const panel=document.querySelector('#trade'),list=panel?.querySelector('#tr-inv'),filters=panel?.querySelector('#tr-filters');
    if(!panel||panel.classList.contains('hidden')){if(tradeSearchState){tradeSearchState.input.value='';tradeSearchState=null;}return;}
    if(!list||!filters)return;
    let bar=panel.querySelector('[data-ro-trade-search]');
    if(!bar){
      bar=document.createElement('div');bar.dataset.roTradeSearch='';bar.style.cssText='display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:8px 0';
      const input=document.createElement('input');input.type='search';input.placeholder='搜尋物品或卡片名稱';input.setAttribute('aria-label','搜尋交易物品或卡片');input.style.cssText='flex:1;min-width:120px;max-width:100%;box-sizing:border-box;font-size:16px;padding:8px';
      const count=document.createElement('span');count.setAttribute('aria-live','polite');
      const empty=document.createElement('div');empty.textContent='找不到符合的物品或卡片';empty.dataset.roTradeEmpty='';empty.className='empty-note';empty.hidden=true;
      input.oninput=updateTradeSearch;
      input.onkeydown=event=>event.stopPropagation();
      bar.append(input,count);filters.after(bar);list.after(empty);
    }
    const input=bar.querySelector('input'),count=bar.querySelector('span'),empty=panel.querySelector('[data-ro-trade-empty]');
    if(!tradeSearchState||tradeSearchState.panel!==panel){input.value='';tradeSearchState={panel,input};}
    const query=input.value.normalize('NFKC').trim().toLocaleLowerCase(),terms=query.split(/\s+/).filter(Boolean);
    let shown=0;const cells=[...list.querySelectorAll('.item-cell')];
    for(const cell of cells){
      const name=terms.length?tradeSearchText(cell):null;
      // Unknown assets stay visible so an incomplete catalog cannot hide inventory.
      const match=!terms.length||name===null||terms.every(term=>name.normalize('NFKC').toLocaleLowerCase().includes(term));
      if(cell.hidden===match)cell.hidden=!match;
      if(!match){if(cell.style.display!=='none')cell.style.setProperty('display','none','important');}
      else if(cell.style.display==='none')cell.style.removeProperty('display');
      if(match)shown++;
    }
    const text=terms.length?shown+' / '+cells.length:'';if(count.textContent!==text)count.textContent=text;
    const noMatches=terms.length>0&&cells.length>0&&shown===0;if(empty.hidden===noMatches)empty.hidden=!noMatches;
  }
  function spawnTime(seconds){
    if(!Number.isFinite(seconds)||seconds<0)return '時間未提供';
    const n=Math.floor(seconds);return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
  }
  function stageSpawnRows(script){
    if(!script||!Array.isArray(script.waves))return [];
    const rows=[],lastBoss=script.bosses?.[script.bosses.length-1];
    // The final scheduled boss triggers clearMobs/bossArena. runLength also
    // includes the boss-fight allowance and is not the normal-spawn cutoff.
    const cutoff=Number.isFinite(lastBoss?.t)&&lastBoss.t>=0?lastBoss.t:Infinity;
    const length=Math.min(script.runLength,cutoff);
    const waves=script.waves.filter(w=>Number.isFinite(w.from)&&Number.isFinite(w.to)&&w.to>w.from&&Array.isArray(w.pool));
    if(Number.isFinite(length)&&length>0&&waves.length){
      // The native scheduler uses the first matching pool, falling back to its
      // last wave in gaps. This is availability, not an individual spawn timer.
      const boundaries=[...new Set([0,length,...waves.flatMap(w=>[w.from,w.to]).filter(t=>t>0&&t<length)])].sort((a,b)=>a-b);
      const intervals=new Map();
      for(let i=0;i<boundaries.length-1;i++){
        const from=boundaries[i],to=boundaries[i+1],wave=waves.find(w=>from>=w.from&&from<w.to)??waves[waves.length-1];
        if(wave.perSecond===0)continue;
        for(const id of new Set(wave.pool)){
          if(typeof id!=='string')continue;
          if(!intervals.has(id))intervals.set(id,[]);
          const ranges=intervals.get(id),last=ranges[ranges.length-1];
          if(last&&last.to===from)last.to=to;else ranges.push({from,to});
        }
      }
      for(const [id,ranges] of intervals)rows.push({id,kind:'一般怪（隨機）',times:ranges.map(r=>spawnTime(r.from)+'–'+spawnTime(r.to)).join('、')});
    }
    return rows;
  }
  function selectedStageScript(detail,scripts){
    if(!scripts||typeof scripts!=='object')return null;
    const art=detail.querySelector('.stg-banner')?.style.getPropertyValue('--art')||'';
    const match=art.match(/\/stages\/([^/"'()?]+)\.jpg/);
    if(match&&scripts[match[1]])return {id:match[1],script:scripts[match[1]]};
    // Fallback only when the visible normal and boss pools identify one stage.
    const mobs=[...detail.querySelectorAll('.stg-mobs [data-mob]')].map(n=>n.dataset.mob).sort();
    const bosses=[...detail.querySelectorAll('.stg-bosses [data-mob]')].map(n=>n.dataset.mob).sort();
    if(!mobs.length)return null;
    const candidates=Object.entries(scripts).filter(([,s])=>Array.isArray(s?.waves)&&Array.isArray(s.bosses)
      &&JSON.stringify([...new Set(s.waves.flatMap(w=>w.pool||[]))].sort())===JSON.stringify(mobs)
      &&JSON.stringify(s.bosses.map(b=>b.id).sort())===JSON.stringify(bosses));
    return candidates.length===1?{id:candidates[0][0],script:candidates[0][1]}:null;
  }
  let stageLevelRules=null,stageRulesRequest=null;
  function parseStageLevelRules(source){
    // Read JSON and stage metadata only; never execute downloaded source.
    const config=JSON.parse(source.match(/var RO_LAPC=(\{[^;]+\});/)[1]);
    const chapter2=JSON.parse(source.match(/RO_C2T=(\{[^;]+\});/)[1]);
    const list=source.match(/const xe=(\[.*?\]);/s)[1];
    const stages=[...list.matchAll(/\{id:"([^"]+)"([^]*?)(?=\},\{id:|\}\]$)/g)].map(match=>({id:match[1],special:/special:!0|special:true/.test(match[2]),chapter:/chapter:2/.test(match[2])?2:1}));
    if(!Number.isInteger(config.max)||config.max<1||!stages.length||!config.exp||![config.exp.from,config.exp.base,config.exp.span].every(Number.isFinite))throw Error('Unknown native stage rules');
    return {config,chapter2,stages};
  }
  function loadStageLevelRules(){
    if(stageRulesRequest)return stageRulesRequest;
    const script=[...document.querySelectorAll('script[type="module"][src]')].find(node=>/\/main-[^/]+\.js(?:\?|$)/.test(node.getAttribute('src')));
    if(!script)return Promise.resolve();
    const url=new URL(script.getAttribute('src'),location.href);
    if(url.origin!==new URL(location.href).origin)return Promise.resolve();
    stageRulesRequest=(async()=>{
      try{const response=await fetch(url.href,{credentials:'omit'});if(!response.ok)throw Error('HTTP '+response.status);
        stageLevelRules=parseStageLevelRules(await response.text());updateStageSpawnSchedule();
      }catch(error){console.warn('[RO助手] 無法讀取目前周目設定；多周目等級暫顯示 —',error);}
    })();
    return stageRulesRequest;
  }
  function stageMonsterLevel(id,selected,lap){
    const monsters=gameCatalog?.bj,base=monsters?.[id]?.level;
    if(!Number.isFinite(base))return null;
    if(lap<=1)return base;
    if(!selected||!stageLevelRules)return null;
    const {config,chapter2,stages}=stageLevelRules;
    if(selected.script?.storyOnly||chapter2[selected.id])return base;
    const allowed=stage=>gameCatalog?.ca?.[stage.id]?.map&&!gameCatalog.ca[stage.id].storyOnly&&(!config.stages||config.stages.includes(stage.id));
    const currentStage=stages.find(stage=>stage.id===selected.id);
    if(!currentStage)return null;
    if(!allowed(currentStage))return base;
    const eligible=stages.filter(stage=>allowed(stage)&&!stage.special&&stage.chapter!==2);
    const index=eligible.findIndex(stage=>stage.id===selected.id),special=currentStage.special;
    if(index<0&&!special)return null;
    const average=script=>{
      let sum=0,total=0;
      for(const wave of script?.waves||[]){
        const pool=(wave.pool||[]).map(key=>monsters[key]).filter(Boolean),duration=Math.max(0,(wave.to||0)-(wave.from||0));
        if(!pool.length||!duration)continue;
        sum+=duration*pool.reduce((n,m)=>n+(m.level||0),0)/pool.length;total+=duration;
      }
      return total?sum/total:null;
    };
    const current=average(selected.script),last=average(gameCatalog.ca[eligible.at(-1)?.id]);
    if(current===null||last===null)return null;
    let offset=Math.max(0,Math.round((special?current:last)-current));
    lap=Math.max(1,Math.min(config.max,lap));
    if(lap>=config.exp.from){const f=((lap-2)*eligible.length+(special?eligible.length:index+1))/(eligible.length*(config.max-1));offset=Math.max(offset,Math.round(config.exp.base+config.exp.span*f-current));}
    return base+offset;
  }
  function updateStageSpawnSchedule(){
    const detail=document.querySelector('#stg-detail'),mobs=detail?.querySelector('.stg-mobs'),bosses=detail?.querySelector('.stg-bosses');
    if(!detail||(!mobs&&!bosses))return;
    detail.querySelector('section[data-ro-spawn-schedule]')?.remove();
    const selected=selectedStageScript(detail,gameCatalog?.ca),rows=stageSpawnRows(selected?.script);
    const byId=new Map(rows.map(row=>[row.id,row]));
    const lap=Number(document.querySelector('#lap-tabs [data-laptab].primary')?.dataset.laptab)||1;
    if(mobs&&!mobs.classList.contains('ro-mob-schedule'))mobs.classList.add('ro-mob-schedule');
    for(const mob of mobs?.querySelectorAll('[data-mob]')||[]){
      const id=mob.dataset.mob,row=byId.get(id),times=row?row.times.split('、'):['時段未提供'];
      const nativeName=gameCatalog?.bj?.[id]?.name;
      const name=(typeof gameCatalog?.ff==='function'&&nativeName?gameCatalog.ff(nativeName):null)||MONSTER_NAMES[id]||nativeName||id;
      const level=stageMonsterLevel(id,selected,lap),signature=JSON.stringify([name,level,times]);
      if(mob.dataset.roScheduleSignature===signature&&mob.querySelector('[data-ro-mob-time]'))continue;
      mob.dataset.roScheduleSignature=signature;mob.classList.add('ro-timed-mob');
      mob.querySelector('[data-ro-mob-time]')?.remove();
      const caption=document.createElement('span');caption.dataset.roMobTime='';
      caption.title='可隨機生成的時段，非固定出生時間。依最後頭目預定出場時間截斷；若頭目出生延遲，實際停刷也可能延後。';
      const label=document.createElement('b');label.textContent=name;caption.append(label);
      const levelLine=document.createElement('span');levelLine.dataset.roMobLevel='';levelLine.textContent='等級 '+(level??'—');levelLine.title='計算經驗衰減使用的怪物等級（含目前周目修正）';caption.append(levelLine);
      for(const time of times){const line=document.createElement('small');line.textContent=time;caption.append(line);}
      mob.append(caption);
    }
    for(const boss of bosses?.querySelectorAll('[data-mob]')||[]){
      const level=stageMonsterLevel(boss.dataset.mob,selected,lap),text='等級 '+(level??'—');
      let line=boss.querySelector('[data-ro-mob-level]');
      if(!line){line=document.createElement('span');line.dataset.roMobLevel='';line.title='計算經驗衰減使用的怪物等級（含目前周目修正）';const name=boss.querySelector('b');if(name)name.after(line);else boss.append(line);}
      if(line.textContent!==text)line.textContent=text;
    }
  }
  function smithCategory(definition) {
    if (!definition) return '';
    return definition.slot === 'weapon' ? (twoHandTypes.has(definition.wtype) ? 'twohand' : 'onehand') : definition.slot;
  }
  function smithDefinition(row) {
    const itemId = smithItemIds.get(row.dataset.uid) ?? starFilterItems.get(row.closest('#sf-list'))?.get(row.dataset.uid);
    if (itemId !== undefined && smithDefs?.[itemId]) return smithDefs[itemId];
    const src = row.querySelector('.ico img')?.getAttribute('src');
    if (!src || !smithDefs || !smithAssets?.manifest?.items) return null;
    let path;
    try { path = decodeURI(new URL(src, location.href).pathname); } catch { return null; }
    if (smithManifestItems !== smithAssets.manifest.items) {
      smithManifestItems = smithAssets.manifest.items;
      smithIconIndex.clear(); smithPathCache.clear();
      for (const [id, item] of Object.entries(smithManifestItems)) {
        if (!item.icon || !smithDefs[id]) continue;
        const suffix = '/' + decodeURI(item.icon).replace(/^(?:\.\/|\/)+/, '');
        if (!smithIconIndex.has(suffix)) smithIconIndex.set(suffix, []);
        smithIconIndex.get(suffix).push(smithDefs[id]);
      }
    }
    if (smithPathCache.has(path)) return smithPathCache.get(path);
    // Manifest icons are asset-relative. All matching definitions must agree
    // on category; ambiguous shared icons must never be silently misclassified.
    const matches = [];
    for (let index = path.indexOf('/'); index >= 0; index = path.indexOf('/', index + 1)) {
      matches.push(...(smithIconIndex.get(path.slice(index)) || []));
    }
    const category = smithCategory(matches[0]);
    const result = matches.length && matches.every(def => smithCategory(def) === category) ? matches[0] : null;
    smithPathCache.set(path, result);
    return result;
  }
  const smithScoreRows = new WeakSet();
  const smithItemIds = new Map();
  const smithScoreCache = new Map(),smithRowHooks=new WeakSet();
  const starScoreData = new WeakMap(), starScoreHooks = new WeakSet();
  const starGainData = new WeakMap();
  function smithLevelGains(item, field, score) {
    const cache = new Map();
    return count => {
      if (!cache.has(count)) cache.set(count, Array.from({length: count}, (_, index) => {
        const next = score({...item, [field]: index + 1});
        return Number.isFinite(next) ? next : undefined;
      }));
      return cache.get(count);
    };
  }
  function paintSmithGain(detail, gain) {
    const targets = [...(detail?.querySelector('.ref-ladder')?.children || [])];
    if (gain === undefined || !targets.length) {
      detail?.querySelectorAll('[data-ro-gs-gain]').forEach(node => node.remove());
      return;
    }
    let values;
    try { values = gain(targets.length); } catch { return; }
    const currentText = detail.querySelector('.gs b')?.textContent;
    const current = currentText?.trim() ? Number(currentText.replaceAll(',', '')) : NaN;
    const level = targets.filter(target => target.classList.contains('done')).length;
    for (const [index, target] of targets.entries()) {
      const value = values[index] === undefined ? undefined : values[index] - current;
      let preview = target.querySelector('[data-ro-gs-gain]');
      if (index < level || value === undefined || !Number.isFinite(value)) { preview?.remove(); continue; }
      if (!preview) {
        preview = document.createElement('small'); preview.dataset.roGsGain = '';
        preview.style.cssText = 'display:block;font-size:10px;font-weight:700;line-height:1.3;letter-spacing:-0.3px;color:#183b70;background:#eef3ff;border-radius:3px;white-space:nowrap;margin-top:3px';
        preview.title = '升到此級後，相較目前這件裝備的 GS 差額';
        target.append(preview);
      }
      const text = 'GS ' + (value >= 0 ? '+' : '') + value.toLocaleString('zh-TW');
      if (preview.textContent !== text) preview.textContent = text;
    }
  }
  const starFilterItems=new WeakMap();
  let starFilterPanel=null,starFilterCategory='all';
  let restoreStarScoreMap = null;
  function armStarScoreRender() {
    if (restoreStarScoreMap) return;
    const original = Array.prototype.map;
    const restore = () => {
      if (Array.prototype.map === wrapped) Array.prototype.map = original;
      if (restoreStarScoreMap === restore) restoreStarScoreMap = null;
    };
    const wrapped = function(callback, thisArg) {
      // Verified native starforge list renderer; restore before invoking any
      // renderer so nested card/bonus maps use the untouched native method.
      if (callback?.name !== 'row' || !gearArray(this)) return Reflect.apply(original, this, [callback, thisArg]);
      restore();
      const scores = new Map(), gains = new Map();
      for (const item of this) {
        try {
          // Reuse the native scorer with display copies, retaining refinement,
          // cards, quality, Tier, affixes and the current character's weights.
          const score = copy => {
            const holder = document.createElement('div');
            holder.innerHTML = Reflect.apply(callback, thisArg, [copy]);
            const value = holder.querySelector('.gs b')?.textContent;
            return value?.trim() ? Number(value.replaceAll(',', '')) : NaN;
          };
          gains.set(item.uid, smithLevelGains(item, 'star', score));
        } catch { /* Optional previews must not interrupt native rendering. */ }
        if (!(item.refine > 0 || item.star > 0 || item.cards.some(Boolean))) continue;
        try {
          const base = {...item, refine: 0, star: 0, cards: item.cards.map(() => null)};
          const holder = document.createElement('div');
          holder.innerHTML = Reflect.apply(callback, thisArg, [base]);
          const score = holder.querySelector('.gs b')?.textContent;
          if (score && Number.isFinite(Number(score.replaceAll(',', '')))) scores.set(item.uid, score);
        } catch { /* An unavailable base preview must not interrupt native rendering. */ }
      }
      const list = document.querySelector('#sf-list');
      if (list) {starScoreData.set(list, scores);starGainData.set(list, gains);starFilterItems.set(list,new Map(this.map(item=>[item.uid,item.itemId])));}
      return Reflect.apply(original, this, [callback, thisArg]);
    };
    restoreStarScoreMap = restore;
    Array.prototype.map = wrapped;
    // Empty lists or an upstream render exception must also release the hook.
    queueMicrotask(restore);
  }
  function updateStarforgeBaseScores() {
    if (isSafariBrowser()) return;
    const open = document.querySelector('#smith-star');
    if (open && !starScoreHooks.has(open) && typeof open.onclick === 'function') {
      const original = open.onclick;
      open.onclick = function(...args) {
        armStarScoreRender();
        try { return Reflect.apply(original, this, args); }
        finally { restoreStarScoreMap?.(); updateStarforgeBaseScores(); }
      };
      starScoreHooks.add(open);
    }
    const mats = document.querySelector('#sf-mats');
    if (mats && !starScoreHooks.has(mats)) {
      let proto = Object.getPrototypeOf(mats), descriptor;
      while (proto && !descriptor) { descriptor = Object.getOwnPropertyDescriptor(proto, 'innerHTML'); proto = Object.getPrototypeOf(proto); }
      if (descriptor?.get && descriptor?.set) {
        Object.defineProperty(mats, 'innerHTML', {
          configurable: true,
          get() { return descriptor.get.call(this); },
          set(value) { descriptor.set.call(this, value); armStarScoreRender(); }
        });
        starScoreHooks.add(mats);
      }
    }
    const panel = document.querySelector('#starforge'), list = document.querySelector('#sf-list');
    if (!panel || panel.classList.contains('hidden') || !list) return;
    const scores = starScoreData.get(list);
    if (!scores) return;
    for (const row of list.querySelectorAll('.cand[data-uid]')) appendSmithBaseScore(row, scores.get(row.dataset.uid));
    appendSmithBaseScore(document.querySelector('#sf-detail'), scores.get(list.querySelector('.cand.sel')?.dataset.uid));
    const detail = document.querySelector('#sf-detail');
    const gain = starGainData.get(list)?.get(list.querySelector('.cand.sel')?.dataset.uid);
    paintSmithGain(detail, gain);
  }
  let smithScoring = false;
  function updateSmithBaseScores(list, filters) {
    // Safari town overlays must never synchronously redraw the entire bag just
    // to compute an optional score preview. Keep the native GS and list intact.
    if (isSafariBrowser()) return;
    const rows = [...list.querySelectorAll('.cand[data-uid]')];
    if (smithScoring || !rows.some(row => !smithScoreRows.has(row))) return;
    // Native selection rebuilds rows without changing their GS. Reuse previews
    // instead of clicking a native category and rebuilding the list again.
    const currentScore=row=>[row.querySelector('.gs b')?.textContent,row.querySelector('.cand-info')?.textContent,row.querySelector('.ico img')?.getAttribute('src')].join('|');
    if(rows.every(row=>smithScoreCache.has(row.dataset.uid)&&smithScoreCache.get(row.dataset.uid).current===currentScore(row))){
      for(const row of rows){smithScoreRows.add(row);appendSmithBaseScore(row,smithScoreCache.get(row.dataset.uid).base);}
      appendSmithBaseScore(document.querySelector('#smith-detail'),smithScoreCache.get(list.querySelector('.cand.sel')?.dataset.uid)?.base);
      return;
    }
    const redraw = filters.querySelector('[data-f].active') || filters.querySelector('[data-f="all"]');
    if (typeof redraw?.onclick !== 'function') return;
    const original = Array.prototype.filter, originalMap = Array.prototype.map, scores = new Map(), enhanced = new Set(), items = new Map(), gains = new Map();
    smithScoring = true;
    const render = () => {
      const switching = smith.switching;
      smith.switching = true;
      try { redraw.onclick(); } finally { smith.switching = switching; }
    };
    try {
      Array.prototype.map = function(callback, thisArg) {
        const result = Reflect.apply(originalMap, this, [callback, thisArg]);
        if (!gearArray(this) || !result.every(value => typeof value === 'string' && value.includes('cand'))) return result;
        for (const copy of this) {
          const item = items.get(copy.uid); if (!item) continue;
          try {
            const score = value => {
              const holder = document.createElement('div');
              holder.innerHTML = Reflect.apply(callback, thisArg, [value, 0, this]);
              const text = holder.querySelector('.gs b')?.textContent;
              return text?.trim() ? Number(text.replaceAll(',', '')) : NaN;
            };
            gains.set(item.uid, smithLevelGains(item, 'refine', score));
          } catch { /* Unknown native renderers leave the preview unavailable. */ }
        }
        return result;
      };
      // Only substitute display copies during this synchronous native redraw.
      // The game's own scorer retains the current job, quality, Tier and affixes.
      Array.prototype.filter = function(...args) {
        const result = Reflect.apply(original, this, args);
        if (!gearArray(this)) return result;
        for (const item of this) { smithItemIds.set(item.uid, item.itemId); if (!items.has(item.uid)) items.set(item.uid, item); }
        return result.map(item => {
          if (item.refine > 0 || item.star > 0 || item.cards.some(Boolean)) enhanced.add(item.uid);
          return {...item, refine: 0, star: 0, cards: item.cards.map(() => null)};
        });
      };
      render();
      for (const row of list.querySelectorAll('.cand[data-uid]')) {
        const text = row.querySelector('.gs b')?.textContent;
        if (enhanced.has(row.dataset.uid) && text && Number.isFinite(Number(text.replaceAll(',', '')))) scores.set(row.dataset.uid, text);
      }
    } finally {
      Array.prototype.filter = original;
      Array.prototype.map = originalMap;
      try { render(); } finally { smithScoring = false; }
    }
    for (const row of list.querySelectorAll('.cand[data-uid]')) {
      smithScoreRows.add(row);
      smithScoreCache.set(row.dataset.uid,{current:currentScore(row),base:scores.get(row.dataset.uid),gain:gains.get(row.dataset.uid)});
      appendSmithBaseScore(row, scores.get(row.dataset.uid));
    }
    const selected = list.querySelector('.cand.sel')?.dataset.uid;
    appendSmithBaseScore(document.querySelector('#smith-detail'), scores.get(selected));
  }
  function appendSmithBaseScore(root, score) {
    const node = root?.querySelector('.gs b');
    const existing = root?.querySelector('[data-ro-smith-base-gs]');
    if (!node || score === undefined) { existing?.remove(); return; }
    const label = existing || document.createElement('span');
    if (!existing) {
      label.dataset.roSmithBaseGs = '';
      label.title = '原始 GS（無精煉、升星、插卡）';
    }
    if (label.textContent !== ' (' + score + ')') label.textContent = ' (' + score + ')';
    if (!existing) node.after(label);
  }
  function nativeSmithAll() {
    const all = document.querySelector('#smith-filters [data-f="all"]');
    if (!all) return;
    smith.switching = true;
    try { all.click(); } finally { smith.switching = false; }
  }
  function updateSmith() {
    updateStarforgeFilters();
    updateAutoStar();
    updateStarforgeBaseScores();
    updateAutoRefine();
    const panel = document.querySelector('#smith');
    const filters = document.querySelector('#smith-filters');
    const list = document.querySelector('#smith-list');
    if (!panel || panel.classList.contains('hidden') || !filters || !list || !smithDefs) {
      if (!panel || panel.classList.contains('hidden')) { smith.panel = null; smith.category = ''; smith.inventory = [];smithScoreCache.clear();smithItemIds.clear(); }
      return;
    }
    if (smith.panel !== panel) {
      smith.panel = panel; smith.category = ''; smith.inventory = [];
      // Populate the complete refinable list once on opening, including equipped
      // and locked pieces exactly as permitted by the game's original filter.
      if (!filters.querySelector('[data-f="all"].active')) nativeSmithAll();
    }
    updateSmithBaseScores(list, filters);
    paintSmithGain(document.querySelector('#smith-detail'), smithScoreCache.get(list.querySelector('.cand.sel')?.dataset.uid)?.gain);
    filters.querySelectorAll('[data-f]').forEach(button => {
      if (smithNativeButtons.has(button)) return;
      const original = button.onclick;
      button.onclick = function(event) {
        if (!smith.switching) smith.category = '';
        return original?.call(this, event);
      };
      smithNativeButtons.add(button);
    });
    const rows = [...list.querySelectorAll('.cand[data-uid]')];
    if (filters.querySelector('[data-f="all"].active') || smith.category) {
      smith.inventory = rows.map(row => ({ uid: row.dataset.uid, category: smithCategory(smithDefinition(row)) }));
    }
    // Keep helper controls outside the native innerHTML replacement target.
    let extras = panel.querySelector('[data-ro-smith-extra]');
    if (!extras) {
      extras = document.createElement('span');
      extras.setAttribute('data-ro-smith-extra', '');
      extras.className='inv-filters';extras.setAttribute('aria-label','精煉細項分組');
      for (const [id, label] of SMITH_FILTERS) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'inv-chip'; button.dataset.roSmithCategory = id;
        button.append(document.createTextNode(label + ' '), document.createElement('small'));
        button.onclick = () => {
          const needsAll=!smith.category&&!filters.querySelector('[data-f="all"].active');
          smith.category = id;
          if(needsAll)nativeSmithAll();
          updateSmith();
        };
        extras.append(button);
      }
      filters.after(extras);
    }
    for (const button of extras.querySelectorAll('button')) {
      const id = button.dataset.roSmithCategory;
      const count = smith.inventory.filter(item => item.category === id).length;
      const small = button.querySelector('small');
      if (small.textContent !== String(count)) small.textContent = String(count);
      if (button.disabled !== (count === 0)) button.disabled = count === 0;
      if (button.classList.contains('active') !== (smith.category === id)) button.classList.toggle('active', smith.category === id);
    }
    if (smith.category) filters.querySelectorAll('[data-f].active').forEach(button => button.classList.remove('active'));
    const categories = new Map(smith.inventory.map(item => [item.uid, item.category]));
    rows.forEach(row => {
      if(!smithRowHooks.has(row)&&typeof row.onclick==='function'){
        const original=row.onclick;row.onclick=function(...args){try{return Reflect.apply(original,this,args);}finally{updateSmith();}};smithRowHooks.add(row);
      }
      const category = categories.get(row.dataset.uid);
      const hide = !!smith.category && category !== smith.category;
      if (row.hasAttribute('data-ro-smith-filtered') !== hide) row.toggleAttribute('data-ro-smith-filtered', hide);
    });
    let empty = list.querySelector('[data-ro-smith-empty]');
    if (smith.category && !rows.some(row => !row.hasAttribute('data-ro-smith-filtered'))) {
      if (!empty) {
        empty = document.createElement('div'); empty.className = 'empty-note';
        empty.setAttribute('data-ro-smith-empty', ''); empty.textContent = '此分類沒有可強化的裝備'; list.append(empty);
      }
    } else empty?.remove();
  }

  function updateStarforgeFilters(selectVisible=true){
    const panel=document.querySelector('#starforge'),list=panel?.querySelector('#sf-list'),top=panel?.querySelector('.sf-top');
    if(!panel||panel.classList.contains('hidden')){starFilterPanel=null;starFilterCategory='all';return;}
    if(!list||!top)return;
    if(starFilterPanel!==panel){starFilterPanel=panel;starFilterCategory='all';}
    let filters=panel.querySelector('[data-ro-star-filters]');
    if(!filters){
      filters=document.createElement('div');filters.dataset.roStarFilters='';filters.style.cssText='display:flex;flex-wrap:wrap;gap:5px;padding:8px 12px';filters.setAttribute('aria-label','升星與洗鍊部位過濾');
      for(const [id,label] of inventoryCategories){
        const button=document.createElement('button');button.type='button';button.className='inv-chip';button.dataset.roStarCategory=id;
        const text=document.createElement('span'),count=document.createElement('small');text.textContent=label;button.append(text,document.createTextNode(' '),count);
        button.onclick=()=>{if(autoStar.active)stopAutoStar('已切換部位，連續升星停止');starFilterCategory=id;updateStarforgeFilters();};filters.append(button);
      }
      top.after(filters);
    }
    const items=starFilterItems.get(list),rows=[...list.querySelectorAll('.cand[data-uid]')];
    const categories=new Map(rows.map(row=>{const id=items?.get(row.dataset.uid),definition=id!==undefined?smithDefs?.[id]:smithDefinition(row);return [row,smithCategory(definition)];}));
    for(const button of filters.querySelectorAll('button')){
      const key=button.dataset.roStarCategory,count=key==='all'?rows.length:rows.filter(row=>categories.get(row)===key).length;
      if(button.classList.contains('active')!==(key===starFilterCategory))button.classList.toggle('active',key===starFilterCategory);
      if(button.getAttribute('aria-pressed')!==String(key===starFilterCategory))button.setAttribute('aria-pressed',String(key===starFilterCategory));
      const small=button.querySelector('small');if(small.textContent!==String(count))small.textContent=String(count);
    }
    for(const row of rows){const hide=starFilterCategory!=='all'&&categories.get(row)!==starFilterCategory;if(row.hasAttribute('data-ro-star-filtered')!==hide)row.toggleAttribute('data-ro-star-filtered',hide);}
    const visible=rows.filter(row=>!row.hasAttribute('data-ro-star-filtered')),selected=rows.find(row=>row.classList.contains('sel'));
    for(const node of [panel.querySelector('#sf-detail'),panel.querySelector('#sf-go')])if(node&&node.hidden!==(visible.length===0))node.hidden=visible.length===0;
    let empty=list.querySelector('[data-ro-star-empty]');
    if(!visible.length&&rows.length){if(!empty){empty=document.createElement('div');empty.className='empty-note';empty.dataset.roStarEmpty='';empty.textContent='此部位沒有可加工的裝備';list.append(empty);}}else empty?.remove();
    // Use the native selection handler, which also clears its confirmation state.
    if(selectVisible&&selected?.hasAttribute('data-ro-star-filtered')&&visible[0]&&typeof visible[0].onclick==='function'){visible[0].click();updateStarforgeFilters(false);}
  }

  const performanceLabels={pickups:'拾取更新（含移動、動畫與收集）',enemies:'怪物更新',grid:'怪物空間索引',skills:'技能更新',effects:'投射物與技能效果',visuals:'特效與傷害數字',other:'其餘遊戲更新／助手',render:'3D 繪圖 CPU 提交'};
  let performanceSession=null,lastPerformanceReport=null;
  const performanceMethods={updatePickups:'pickups',updateEnemies:'enemies',rebuildGrid:'grid',updateProjectiles:'effects',updateHolyTrails:'effects',updateFireRings:'effects',updatePulls:'effects',updateBastion:'effects',updateYggdrasil:'effects',updateBuffAuras:'effects',updateFxList:'visuals'};
  function performancePercentile(values,fraction){if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.max(0,Math.ceil(sorted.length*fraction)-1)];}
  function startPerformanceMeasurement(seconds=15){
    if(performanceSession)return {ok:false,error:'已有量測正在進行'};
    const game=activeGame;
    if(!game||typeof game.step!=='function')return {ok:false,error:'請先進入一場遊戲，再啟動量測'};
    seconds=Number(seconds);if(!Number.isFinite(seconds)||seconds<1||seconds>60)return {ok:false,error:'量測秒數須為 1～60'};
    const session={game,seconds,phase:'waiting',createdAt:performance.now(),startedAt:null,endedAt:null,records:[],stack:[],stats:new Map(),missing:[],weapons:new WeakSet(),counts:{},frames:[],lastFrame:null,frameId:null,timer:null,waitTimer:null};
    performanceSession=session;
    function begin(){
      if(session.startedAt!==null)return;
      session.startedAt=performance.now();session.phase='recording';clearTimeout(session.waitTimer);
      session.timer=setTimeout(()=>stopPerformanceMeasurement('completed'),seconds*1000);
    }
    function wrap(object,key,category,name=key){
      if(!object||typeof object[key]!=='function'){session.missing.push(name);return;}
      const descriptor=Object.getOwnPropertyDescriptor(object,key),original=object[key];
      if(descriptor&&(!descriptor.configurable||descriptor.get||descriptor.set)){session.missing.push(name);return;}
      const stat={name,category,calls:0,totalMs:0,selfMs:0,maxMs:0,samples:[]};
      const wrapper=function(...args){
        if(performanceSession!==session||game.state!=='playing'||document.hidden)return Reflect.apply(original,this,args);
        begin();
        if(category==='step'){
          for(const weapon of game.weapons||[])if(weapon&&!session.weapons.has(weapon)){session.weapons.add(weapon);wrap(weapon,'update','skills','weapon:'+session.weaponsCount++);}
          for(const key of ['pickups','enemies','projectiles','fx','numbers','weapons']){const value=game[key]?.length;if(Number.isFinite(value)){const count=session.counts[key]||{samples:0,total:0,max:0};count.samples++;count.total+=value;count.max=Math.max(count.max,value);session.counts[key]=count;}}
        }
        const frame={start:performance.now(),children:0};session.stack.push(frame);
        try{return Reflect.apply(original,this,args);}
        finally{
          const elapsed=Math.max(0,performance.now()-frame.start);session.stack.pop();
          const parent=session.stack[session.stack.length-1];if(parent)parent.children+=elapsed;
          stat.calls++;stat.totalMs+=elapsed;stat.selfMs+=Math.max(0,elapsed-frame.children);stat.maxMs=Math.max(stat.maxMs,elapsed);
          if(stat.samples.length<4096)stat.samples.push(elapsed);else stat.samples[(stat.calls-1)%4096]=elapsed;
        }
      };
      try{Object.defineProperty(object,key,{configurable:true,enumerable:descriptor?.enumerable??false,writable:true,value:wrapper});}
      catch{session.missing.push(name);return;}
      session.stats.set(name,stat);session.records.push({object,key,descriptor,wrapper});
    }
    session.weaponsCount=0;
    wrap(game,'step','step');
    if(!session.stats.has('step')){performanceSession=null;return {ok:false,error:'無法安全包裝目前遊戲的 step 方法'};}
    for(const [method,category] of Object.entries(performanceMethods))wrap(game,method,category);
    wrap(game.world3d,'render','render','world3d.render');
    function sampleFrame(now){
      if(performanceSession!==session)return;
      if(session.phase==='recording'&&game.state==='playing'&&!document.hidden){if(session.lastFrame!==null&&session.frames.length<8192)session.frames.push(now-session.lastFrame);session.lastFrame=now;}
      else session.lastFrame=null;
      session.frameId=window.requestAnimationFrame?.(sampleFrame)??null;
    }
    session.frameId=window.requestAnimationFrame?.(sampleFrame)??null;
    session.waitTimer=setTimeout(()=>stopPerformanceMeasurement('no-playing-scene'),120000);
    return {ok:true,phase:'waiting',seconds};
  }
  function stopPerformanceMeasurement(reason='manual'){
    const session=performanceSession;if(!session)return lastPerformanceReport;
    performanceSession=null;session.endedAt=performance.now();clearTimeout(session.timer);clearTimeout(session.waitTimer);
    if(session.frameId!==null)window.cancelAnimationFrame?.(session.frameId);
    for(const {object,key,descriptor,wrapper} of session.records.reverse())if(object[key]===wrapper){if(descriptor)Object.defineProperty(object,key,descriptor);else delete object[key];}
    const methods=[...session.stats.values()].map(({samples,...stat})=>({...stat,meanMs:stat.calls?stat.totalMs/stat.calls:null,p95Ms:performancePercentile(samples,.95),sampleCount:samples.length}));
    const step=methods.find(row=>row.category==='step'),steps=step?.calls||0;
    const categories=Object.entries(performanceLabels).map(([key,label])=>{
      const rows=methods.filter(row=>row.category===key),selfMs=key==='other'?(step?.selfMs||0):rows.reduce((sum,row)=>sum+row.selfMs,0);
      return {key,label,calls:key==='other'?steps:rows.reduce((sum,row)=>sum+row.calls,0),selfMs,msPerGameStep:steps&&key!=='render'?selfMs/steps:null,percentOfGameStep:step?.totalMs&&key!=='render'?100*selfMs/step.totalMs:null};
    });
    const frameSum=session.frames.reduce((sum,value)=>sum+value,0);
    lastPerformanceReport={format:1,reason,seconds:session.startedAt===null?0:(session.endedAt-session.startedAt)/1000,gameSteps:steps,coop:!!session.game.coop,replica:!!session.game.coop?.replica,
      categories,methods,counts:Object.fromEntries(Object.entries(session.counts).map(([key,value])=>[key,{mean:value.total/value.samples,max:value.max}])),missing:session.missing,
      frames:{samples:session.frames.length,fps:frameSum?session.frames.length*1000/frameSum:null,p95IntervalMs:performancePercentile(session.frames,.95)},
      notes:['同步 JavaScript／CPU 耗時，含計時負擔；不是 GPU 計時。','拾取更新包含距離掃描、吸取移動、視覺更新、收集與清理，無法單獨代表距離掃描。','分類使用排除已量測子呼叫後的耗時，避免重複相加；各方法 totalMs 為含子呼叫耗時。','每遊戲步平均不是每畫面幀平均；3D 繪圖單獨列出，不納入遊戲步占比。','未包裝的技能 hook、地圖／玩家／助手等工作歸其餘；p95 取各方法最多最近 4096 次樣本。','物件數為陣列長度，可能包含等待清除的物件。']};
    return lastPerformanceReport;
  }
  function performanceMeasurementState(){return {phase:performanceSession?.phase||'idle',seconds:performanceSession?.seconds??null,hasReport:!!lastPerformanceReport};}
  function updatePerformanceOption(){
    const anchor=document.querySelector('[data-ro-pickup-option="show-fps"]')?.closest('label');if(!anchor||document.querySelector('#ro-performance-start'))return;
    const row=document.createElement('div');row.className='opt-row';
    const label=document.createElement('span');label.textContent='戰鬥效能量測';
    const start=document.createElement('button');start.id='ro-performance-start';start.type='button';start.textContent='量測 15 秒';
    const view=document.createElement('button');view.type='button';view.textContent='查看報告';view.onclick=openPerformanceReport;
    const status=document.createElement('small');status.setAttribute('role','status');
    start.onclick=()=>{
      if(performanceSession){stopPerformanceMeasurement();status.textContent='量測已停止';start.textContent='量測 15 秒';openPerformanceReport();return;}
      const result=startPerformanceMeasurement();if(!result.ok){status.textContent=result.error;return;}
      start.textContent='停止量測';status.textContent='回到戰鬥後開始，15 秒後自動完成';
      function refresh(){
        if(!row.isConnected)return;
        if(performanceSession){status.textContent=performanceSession.phase==='waiting'?'等待回到戰鬥…':'量測中，請維持平常遊玩方式';setTimeout(refresh,500);}
        else{status.textContent='量測已結束，可查看報告';start.textContent='量測 15 秒';}
      }
      setTimeout(refresh,500);
    };
    row.append(label,start,view,status);anchor.after(row);
  }
  function openPerformanceReport(){
    document.querySelector('#ro-performance-report')?.remove();
    const panel=document.createElement('section');panel.id='ro-performance-report';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','戰鬥效能量測報告');
    panel.style.cssText='position:fixed;inset:5%;z-index:2147483647;overflow:auto;padding:16px;background:#101b2b;color:#eef;border:1px solid #789;border-radius:8px;font:14px/1.5 sans-serif';
    const title=document.createElement('h3');title.textContent='戰鬥效能量測報告';
    const note=document.createElement('p');note.textContent=performanceSession?'量測尚未結束，以下是上次完成的報告。':lastPerformanceReport?'以下為同步 CPU 耗時；資料僅留在本分頁，不會上傳。':'尚無報告，請在遊戲選項按「量測 15 秒」，再回到戰鬥。';
    const summary=document.createElement('pre');summary.style.whiteSpace='pre-wrap';
    if(lastPerformanceReport)summary.textContent=lastPerformanceReport.categories.map(row=>row.key==='render'?`${row.label}：總計 ${row.selfMs.toFixed(2)} ms`:`${row.label}：${row.msPerGameStep===null?'無樣本':row.msPerGameStep.toFixed(3)+' ms／遊戲步'}${row.percentOfGameStep===null?'':'（'+row.percentOfGameStep.toFixed(1)+'%）'}`).join('\n');
    const text=document.createElement('textarea');text.readOnly=true;text.setAttribute('aria-label','效能報告 JSON');text.style.cssText='display:block;width:100%;height:35vh;box-sizing:border-box';text.value=lastPerformanceReport?JSON.stringify(lastPerformanceReport,null,2):'';
    const copy=document.createElement('button');copy.textContent='複製報告';copy.onclick=async()=>{try{if(!window.navigator?.clipboard?.writeText)throw Error('clipboard unavailable');await window.navigator.clipboard.writeText(text.value);note.textContent='已複製，可貼回對話分析。';}catch{text.focus();text.select?.();note.textContent='請手動複製下方已選取的報告。';}};
    const close=document.createElement('button');close.textContent='關閉';close.onclick=()=>panel.remove();panel.append(title,note,summary,copy,close,text);document.body.append(panel);
  }
  window[runtimeKey].profile={start:startPerformanceMeasurement,stop:stopPerformanceMeasurement,state:performanceMeasurementState,report:()=>lastPerformanceReport};
  const advancedChoiceKey='greydust.ro.advanced-choice.v1';
  const advancedProfilesKey='greydust.ro.advanced-choice.profiles.v1';
  const advancedSlots=[['potion','藥水'],['elixir','秘藥'],['blessing','祝福'],['dish','料理'],['deity','神格']];
  const advancedAspectNames={dmg:'傷害',cd:'冷卻',count:'數量',area:'範圍',reach:'近戰距離',pierce:'穿透',speed:'速度',duration:'持續時間'};
  const advancedCatalog={skills:[],items:[],upgrades:new Map(),factories:new Map(),pool:null,jobs:null,lineage:null,basic:null,talents:null};
  let advancedScope=null;
  let advancedProfiles=loadAdvancedProfiles(),advancedSettings=advancedProfiles.profiles.find(profile=>profile.id===advancedProfiles.active).settings,advancedDialog=null,advancedChoice=null,advancedTimer=null,advancedClicking=false;
  const advancedMethodHooks=new WeakMap();
  function loadAdvancedSettings(){
    try{
      const saved=JSON.parse(localStorage.getItem(advancedChoiceKey)||'null');
      return {enabled:saved?.enabled===true,skills:saved?.skills&&typeof saved.skills==='object'?saved.skills:{},items:saved?.items&&typeof saved.items==='object'?saved.items:{},priority:Array.isArray(saved?.priority)?saved.priority.filter(row=>row&&typeof row.skill==='string'&&Array.isArray(row.upgrades)):[]};
    }catch{return {enabled:false,skills:{},items:{},priority:[]};}
  }
  function advancedProfileId(){return 'profile-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);}
  function validateAdvancedSettings(value){
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('設定格式不正確');
    const validId=id=>typeof id==='string'&&/^[\w.:-]{1,120}$/.test(id)&&!['__proto__','constructor','prototype'].includes(id);
    const skills=[],items=[],priority=[];
    if(!value.skills||typeof value.skills!=='object'||Array.isArray(value.skills)||!value.items||typeof value.items!=='object'||Array.isArray(value.items)||!Array.isArray(value.priority)||value.priority.length>1000)throw Error('缺少技能、道具或優先順序');
    if(Object.keys(value.skills).length>2000)throw Error('技能設定過多');
    for(const [id,rule]of Object.entries(value.skills)){
      if(!validId(id)||!rule||!['must','fill','never'].includes(rule.take)||!['select','ignore','banish'].includes(rule.upgrade))throw Error('技能規則格式不正確');
      skills.push([id,{take:rule.take,upgrade:rule.upgrade}]);
    }
    for(const [slot,rule]of Object.entries(value.items)){
      if(!advancedSlots.some(([id])=>id===slot)||!rule||!Array.isArray(rule.wanted)||rule.wanted.length>1000||!rule.wanted.every(validId)||!['select','ignore','banish'].includes(rule.upgrade))throw Error('道具規則格式不正確');
      items.push([slot,{wanted:[...new Set(rule.wanted)],upgrade:rule.upgrade}]);
    }
    for(const row of value.priority){
      if(!row||!validId(row.skill)||!Array.isArray(row.upgrades)||row.upgrades.length>100||!row.upgrades.every(validId))throw Error('升級順序格式不正確');
      priority.push({skill:row.skill,upgrades:[...new Set(row.upgrades)]});
    }
    return {enabled:value.enabled===true,skills:Object.fromEntries(skills),items:Object.fromEntries(items),priority};
  }
  function loadAdvancedProfiles(){
    try{
      const value=JSON.parse(localStorage.getItem(advancedProfilesKey)||'null');
      if(value?.version===1&&Array.isArray(value.profiles)&&value.profiles.length&&value.profiles.length<=100){
        const profiles=value.profiles.map(profile=>({id:String(profile.id),name:String(profile.name).trim().slice(0,60)||'未命名',settings:validateAdvancedSettings(profile.settings)}));
        if(new Set(profiles.map(profile=>profile.id)).size!==profiles.length)throw Error('設定檔 ID 重複');
        return {version:1,active:profiles.some(profile=>profile.id===value.active)?value.active:profiles[0].id,profiles};
      }
    }catch{}
    return {version:1,active:'default',profiles:[{id:'default',name:'預設',settings:loadAdvancedSettings()}]};
  }
  function selectAdvancedProfile(id){
    const profile=advancedProfiles.profiles.find(profile=>profile.id===id);if(!profile)return;
    cancelAdvancedChoice();advancedProfiles.active=id;advancedSettings=profile.settings;saveAdvancedSettings();renderAdvancedDialog();
  }
  function uniqueAdvancedProfileName(base,names){
    let name=base,index=2;while(names.has(name)){const suffix=' ('+(index++)+')';name=base.slice(0,60-suffix.length)+suffix;}return name;
  }
  function addAdvancedProfile(name){
    if(advancedProfiles.profiles.length>=100)throw Error('最多 100 個設定檔');
    name=String(name||'').trim().slice(0,60);if(!name)throw Error('請輸入設定檔名稱');
    name=uniqueAdvancedProfileName(name,new Set(advancedProfiles.profiles.map(profile=>profile.name)));
    const profile={id:advancedProfileId(),name,settings:JSON.parse(JSON.stringify(advancedSettings))};
    advancedProfiles.profiles.push(profile);selectAdvancedProfile(profile.id);return profile;
  }
  function removeAdvancedProfile(){
    if(advancedProfiles.profiles.length<=1)throw Error('至少保留一個設定檔');
    advancedProfiles.profiles=advancedProfiles.profiles.filter(profile=>profile.id!==advancedProfiles.active);selectAdvancedProfile(advancedProfiles.profiles[0].id);
  }
  function exportAdvancedProfiles(all=false){
    return JSON.stringify({format:'ro-survivors-advanced-choice',version:1,profiles:advancedProfiles.profiles.filter(profile=>all||profile.id===advancedProfiles.active).map(({name,settings})=>({name,settings}))},null,2);
  }
  function importAdvancedProfiles(text){
    if(typeof text!=='string'||text.length>1024*1024)throw Error('設定檔不可超過 1 MB');
    const value=JSON.parse(text);
    if(value?.format!=='ro-survivors-advanced-choice'||value.version!==1||!Array.isArray(value.profiles)||!value.profiles.length||value.profiles.length+advancedProfiles.profiles.length>100)throw Error('不支援的設定檔格式或設定檔數量過多');
    // Validate the entire import before touching any current profile.
    const names=new Set(advancedProfiles.profiles.map(profile=>profile.name));
    const profiles=value.profiles.map(profile=>{
      if(typeof profile?.name!=='string'||!profile.name.trim()||profile.name.length>60)throw Error('設定檔名稱不正確');
      const name=uniqueAdvancedProfileName(profile.name.trim(),names);names.add(name);
      return {id:advancedProfileId(),name,settings:validateAdvancedSettings(profile.settings)};
    });
    advancedProfiles.profiles.push(...profiles);selectAdvancedProfile(profiles[0].id);return profiles.length;
  }
  function saveAdvancedSettings(){
    const active=advancedProfiles.profiles.find(profile=>profile.id===advancedProfiles.active);if(active)active.settings=advancedSettings;
    try{localStorage.setItem(advancedProfilesKey,JSON.stringify(advancedProfiles));localStorage.setItem(advancedChoiceKey,JSON.stringify(advancedSettings));}
    catch{notify('自動選卡設定無法保存；本頁仍可使用');}
    cancelAdvancedChoice();updateAdvancedChoiceUI();
  }
  function advancedSkillRule(id){
    const rule=advancedSettings.skills[id];
    return {take:['must','fill','never'].includes(rule?.take)?rule.take:'fill',upgrade:['select','ignore','banish'].includes(rule?.upgrade)?rule.upgrade:'select'};
  }
  function advancedItemRule(slot,game=null){
    const rule=advancedSettings.items[slot];
    let wanted=Array.isArray(rule?.wanted)?rule.wanted.filter(id=>typeof id==='string'):[];
    if(slot==='deity'){
      let skills=advancedScope?.ids;
      if(game&&advancedCatalog.pool)try{skills=new Set([...advancedCatalog.pool(game.classDef.id,game.loadout?.learned||[]).map(row=>row.id),...(game.slots||[])]);}catch{skills=null;}
      if(skills)wanted=wanted.filter(id=>advancedCatalog.items.some(item=>item.slot==='deity'&&item.id===id)||skills.has(id));
    }
    return {wanted,upgrade:['select','ignore','banish'].includes(rule?.upgrade)?rule.upgrade:'select'};
  }
  function advancedReadCharacter(){
    const panel=document.querySelector('#charpanel'),open=document.querySelector('#lobby-char');
    const name=document.querySelector('#lobby-labels .lobby-name.self')?.textContent?.trim();
    if(panel?.classList.contains('hidden')&&typeof open?.onclick==='function'){
      // Online saves live in the game's private memory store, not necessarily
      // localStorage. Observe the real profile lookup through its native UI.
      const original=Array.prototype.find;let captured=null;
      try{
        Array.prototype.find=function(...args){
          const result=Reflect.apply(original,this,args);
          if(!captured&&result?.id&&(!name||result.name===name)&&typeof result.job==='string'&&result.talents&&result.equipped&&Array.isArray(result.inventory)&&result.stats)captured=result;
          return result;
        };
        open.onclick();
      }catch(error){console.debug('[RO助手] 角色資料讀取失敗',error);}
      finally{
        Array.prototype.find=original;
        if(!panel.classList.contains('hidden')){
          const back=panel.querySelector('#cp-back');if(typeof back?.onclick==='function')back.onclick();
        }
      }
      if(captured)return captured;
    }
    if(!name)return null;
    // Read only character rosters and their matching equipment namespace.
    // Identical names in multiple stored accounts are ambiguous: never guess.
    const matches=[],keys=new Set();
    try{
      for(let index=0;index<localStorage.length;index++)keys.add(localStorage.key(index));
      for(const key of Object.keys(localStorage))keys.add(key);
      for(const key of keys){
        if(typeof key!=='string'||!/^ro-survivors\.(?:acct\..+\.|dev\.)?characters\.v1$/.test(key))continue;
        const roster=JSON.parse(localStorage.getItem(key)||'null');if(!Array.isArray(roster))continue;
        for(const character of roster)if(character?.name===name&&typeof character.job==='string'&&character.id){
          const account=JSON.parse(localStorage.getItem(key.replace(/characters\.v1$/,'account.v1'))||'null');
          matches.push({...character,inventory:Array.isArray(account?.inventory)?account.inventory:character.inventory||[]});
        }
      }
    }catch{return null;}
    return matches.length===1?matches[0]:null;
  }
  function advancedCharacterScope(character){
    if(!character||!advancedCatalog.pool||!advancedCatalog.lineage)return null;
    try{
      const lineage=advancedCatalog.lineage(character.promotion||character.job);
      const jobs=new Set(lineage.includes(character.job)?lineage:advancedCatalog.lineage(character.job));
      // Settings describe the profession's possible build, independently of
      // allocated talents and current equipment. Runtime offers remain native.
      const learnable=Object.values(advancedCatalog.talents||{}).filter(talent=>jobs.has(talent.job)&&talent.learn).map(talent=>talent.learn);
      const ids=new Set([...jobs].flatMap(job=>advancedCatalog.pool(job,learnable).map(row=>row.id)).filter(id=>skillDefs?.[id]));
      for(const def of Object.values(skillDefs||{})){
        if(!def?.id?.startsWith('atk_'))continue;
        if(['atk_infused','atk_infused_melee'].includes(def.id)&&!jobs.has('mage'))continue;
        ids.add(def.id);
      }
      const job=advancedCatalog.jobs?.(character.promotion||character.job);
      return {character:character.id,job:character.promotion||character.job,name:String(job?.name||character.job),ids};
    }catch{return null;}
  }
  function advancedScopedSkills(){return advancedScope?advancedCatalog.skills.filter(skill=>advancedScope.ids.has(skill.id)):[];}
  function advancedScopedItems(slot){
    const items=advancedCatalog.items.filter(item=>item.slot===slot);
    if(slot==='deity')for(const skill of advancedScopedSkills())if(skill.kind==='weapon'&&!skill.id.startsWith('atk_'))items.push({id:skill.id,slot,name:skill.name+' 專屬神格'});
    return items;
  }
  function initializeAdvancedCatalog(module){
    advancedCatalog.skills=[];advancedCatalog.upgrades.clear();advancedCatalog.factories.clear();
    const definitions=skillDefs||Object.values(module).find(value=>value?.bash?.kind==='weapon');
    const items=Object.values(module).find(value=>value&&typeof value==='object'&&value.p_regen?.slot==='potion'&&value.d_str?.slot==='dish');
    const pool=Object.values(module).find(value=>typeof value==='function'&&/\.flatMap\(/.test(String(value))&&/\.maxLevel/.test(String(value))&&/new Set/.test(String(value)));
    advancedCatalog.pool=pool||null;
    advancedCatalog.jobs=Object.values(module).find(value=>typeof value==='function'&&/\.find\(\w+=>\w+\.id===\w+\)\?\?/.test(String(value)))||null;
    advancedCatalog.lineage=Object.values(module).find(value=>typeof value==='function'&&/\.base\?\[\.\.\./.test(String(value)))||null;
    advancedCatalog.basic=Object.values(module).find(value=>typeof value==='function'&&/return .*\|\|["']atk_fist["']/.test(String(value)))||null;
    advancedCatalog.talents=Object.values(module).find(value=>value&&typeof value==='object'&&value['crusader.1.s1']?.learn==='holy_cross')||null;
    // Build the union of the native job pools, including learnable weapons.
    const ids=new Set();
    for(const value of Object.values(module))if(Array.isArray(value))for(const job of value){
      if(job?.id&&job.scaling&&pool)try{for(const entry of pool(job.id,[]))ids.add(entry.id);}catch{}
    }
    for(const def of Object.values(definitions||{})){
      if(!def?.id||!['weapon','passive'].includes(def.kind)||(!ids.has(def.id)&&typeof def.create!=='function'&&def.kind!=='passive'))continue;
      advancedCatalog.skills.push({id:def.id,name:String(def.name||def.id),kind:def.kind});
      if(typeof def.create==='function')advancedCatalog.factories.set(def.id,def.create);

    }
    advancedCatalog.skills.sort((a,b)=>a.name.localeCompare(b.name,'zh-TW'));
    advancedCatalog.items=Object.values(items||{}).filter(item=>advancedSlots.some(([slot])=>slot===item.slot)).map(item=>({id:item.id,slot:item.slot,name:String(item.name||item.id)}));
    updateAdvancedChoiceUI();if(advancedDialog)renderAdvancedDialog();
  }
  function advancedSkillUpgrades(id){
    if(advancedCatalog.upgrades.has(id))return advancedCatalog.upgrades.get(id);
    // Constructors may initialize random state. Read metadata only while in
    // town, before the next run receives its native seed, and only on demand.
    if(!document.body.classList.contains('in-lobby'))return [];
    const upgrades=[],create=advancedCatalog.factories.get(id);
    if(create)try{
      const weapon=create();
      for(const aspect of weapon.upgradeAspects())upgrades.push({id:aspect,name:advancedAspectNames[aspect]||aspect});
      for(const effect of weapon.effects||[])upgrades.push({id:'effect:'+effect.key,name:advancedTranslate(effect.label)});
    }catch{/* Unknown native constructors retain the any-upgrade option. */}
    advancedCatalog.upgrades.set(id,upgrades);return upgrades;
  }
  function advancedTranslate(text){
    try{return typeof gameCatalog?.t==='function'?gameCatalog.t(text):String(text);}catch{return String(text);}
  }
  function advancedUpgradeIds(card){
    if(!card.upgrade)return [];
    return (card.upgrade.parts||[card.upgrade]).map(part=>part.aspect==='effect'?'effect:'+part.effect:part.aspect);
  }
  function advancedDecision(game,cards,kind,{available=()=>true}={}){
    const action=(type,index)=>({type,index});
    if(kind==='skill'){
      const upgrades=cards.map((card,index)=>({card,index,rule:advancedSkillRule(card.id)})).filter(row=>!row.card.isNew&&row.card.id!=='potion');
      const banish=upgrades.find(row=>row.rule.upgrade==='banish'&&available('banish',row.index));
      if(banish)return action('banish',banish.index);
      const required=cards.findIndex(card=>card.isNew&&advancedSkillRule(card.id).take==='must');
      if(required>=0)return action('pick',required);
      const slots=game.slots||[],remaining=Math.max(0,(game.maxSkills||0)-slots.length);
      let eligible=[];try{eligible=game.freshChoices?.()||[];}catch{}
      const missing=new Set(eligible.filter(card=>!slots.includes(card.id)&&advancedSkillRule(card.id).take==='must').map(card=>card.id)).size;
      const fill=cards.findIndex(card=>card.isNew&&advancedSkillRule(card.id).take==='fill');
      if(fill>=0&&remaining>missing)return action('pick',fill);
      if(remaining>0&&missing>=remaining&&available('deck',-1))return action('deck',-1);
      for(const priority of advancedSettings.priority){
        if(advancedSkillRule(priority.skill).upgrade!=='select')continue;
        const match=upgrades.find(row=>row.rule.upgrade==='select'&&row.card.id===priority.skill&&(!priority.upgrades.length||advancedUpgradeIds(row.card).some(id=>priority.upgrades.includes(id))));
        if(match)return action('pick',match.index);
      }
      // Detailed aspect selections also constrain the fallback. A legendary
      // mixed upgrade must not make an unselected aspect eligible on later cards.
      const selected=upgrades.find(row=>row.rule.upgrade==='select'&&(
        !advancedSettings.priority.some(entry=>entry.skill===row.card.id)||
        advancedSettings.priority.some(entry=>entry.skill===row.card.id&&(!entry.upgrades.length||advancedUpgradeIds(row.card).some(id=>entry.upgrades.includes(id))))
      ))||upgrades.find(row=>row.rule.upgrade==='ignore');
      if(selected)return action('pick',selected.index);
      const potion=cards.findIndex(card=>card.id==='potion');
      return potion>=0?action('pick',potion):null;
    }
    const rows=cards.map((card,index)=>({card,index,rule:advancedItemRule(card.slot,game),current:game.runItems?.slots.get(card.slot)}));
    const upgraded=row=>row.card.refine>0&&row.current?.item===row.card.item;
    const banish=rows.find(row=>upgraded(row)&&row.rule.upgrade==='banish'&&available('banish',row.index));
    if(banish)return action('banish',banish.index);
    const wanted=rows.filter(row=>!upgraded(row)&&row.rule.wanted.includes(row.card.item)).sort((a,b)=>b.card.quality-a.card.quality||a.index-b.index)[0];
    if(wanted)return action('pick',wanted.index);
    const any=rows.find(row=>!upgraded(row)&&!row.rule.wanted.length);
    if(any)return action('pick',any.index);
    const refresh=rows.find(row=>row.rule.wanted.length&&!row.rule.wanted.includes(row.current?.item)&&available('single',row.index));
    if(refresh)return action('single',refresh.index);
    const highest=list=>list.slice().sort((a,b)=>b.card.quality-a.card.quality||a.index-b.index)[0];
    const upgrade=highest(rows.filter(row=>upgraded(row)&&row.rule.upgrade==='select'))||highest(rows.filter(row=>upgraded(row)&&row.rule.upgrade==='ignore'));
    if(upgrade)return action('pick',upgrade.index);
    const fallbackUpgrade=highest(rows.filter(upgraded));if(fallbackUpgrade)return action('pick',fallbackUpgrade.index);
    if(rows.length&&rows.every(row=>!upgraded(row))&&available('deck',-1))return action('deck',-1);
    const fallbackNew=highest(rows.filter(row=>!upgraded(row)));return fallbackNew?action('pick',fallbackNew.index):null;
  }
  function advancedActionButton(state,type,index){
    const {game,kind,cards}=state,offer=cards[index];
    if(type==='deck')return document.querySelector('#pk-bar [data-act="bar:0"]');
    if(!offer)return null;
    const allowed=kind==='skill'?offer.id!=='potion':true;
    if(!allowed)return null;
    let single=false;
    try{single=(game.perksMax?.reroll_card||0)>0&&(kind==='skill'?game.canRerollCard?.(offer):game.canRerollChestCard?.(offer));}catch{}
    const actions=[...(single?['single']:[]),...((game.perksMax?.focus||0)>0?['focus']:[]),...((game.perksMax?.banish||0)>0?['banish']:[])];
    const position=actions.indexOf(type);return position<0?null:document.querySelector('#pk-cards [data-act="'+index+':'+position+'"]');
  }
  function revealAdvancedChoice(state){
    if(!state?.background||state.game!==activeGame||state.game.state!=='levelup'||state.game.player?.dead)return;
    state.background=false;state.manual=true;state.render?.(state.cards);
  }
  function cancelAdvancedChoice(reveal=true){
    clearTimeout(advancedTimer);advancedTimer=null;if(advancedChoice){advancedChoice.manual=true;if(reveal)revealAdvancedChoice(advancedChoice);}
  }
  function resetAdvancedChoice(){cancelAdvancedChoice(false);advancedChoice=null;}
  function captureAdvancedChoice(game,cards,kind,render=null){
    clearTimeout(advancedTimer);advancedTimer=null;
    advancedChoice={game,cards,kind,render,background:typeof render==='function',manual:false,started:performance.now(),pending:null,actions:0};
    queueAdvancedChoice();
  }
  function queueAdvancedChoice(delay){
    clearTimeout(advancedTimer);advancedTimer=setTimeout(runAdvancedChoice,delay??(advancedChoice?.background?0:100));
  }
  function installAdvancedChoiceMethods(game){
    if(advancedMethodHooks.has(game))return;
    const hooked=new Map();advancedMethodHooks.set(game,hooked);
    for(const name of ['rerollDeck','rerollChest','rerollCard','rerollChestCard','banishCard','banishChestCard']){
      const original=game[name];if(typeof original!=='function')continue;
      const wrapper=function(...args){
        const result=Reflect.apply(original,this,args),state=advancedChoice;
        if(state?.game===game){
          if((name==='rerollDeck'||name==='rerollChest')&&Array.isArray(result))state.cards=result;
          state.pending=null;state.started=performance.now();
          if(advancedClicking)queueAdvancedChoice(state.background?0:150);
        }
        return result;
      };
      game[name]=wrapper;hooked.set(name,{original,wrapper});
    }
  }
  function advancedBackgroundAvailable(state,type,index){
    const {game,kind,cards}=state,card=cards[index],left=game.perksLeft||{},max=game.perksMax||{};
    if(type==='deck')return max.reroll>0&&left.reroll>0&&typeof game[kind==='skill'?'rerollDeck':'rerollChest']==='function';
    if(type==='banish')return !!card&&max.banish>0&&left.banish>0&&(kind!=='skill'||card.id!=='potion')&&typeof game[kind==='skill'?'banishCard':'banishChestCard']==='function';
    if(type==='single')return !!card&&max.reroll_card>0&&left.reroll_card>0&&typeof game.rerollChestCard==='function'&&game.canRerollChestCard?.(card)===true;
    return false;
  }
  function finishAdvancedBackground(state,card){
    const game=state.game;
    clearTimeout(advancedTimer);advancedTimer=null;state.manual=true;state.background=false;
    if(state.kind==='item')game.chooseChest(card);
    else{
      game.choose(card);
      const name=game.skillDef?.(card.id)?.name||skillDefs?.[card.id]?.name||card.id;
      const upgrades=advancedUpgradeIds(card).map(id=>id.startsWith('effect:')?card.upgrade?.text||'特殊效果':advancedAspectNames[id]||id);
      const message=card.id==='potion'?'回復 50 HP':card.isNew?'學會：'+name:name+(Number.isFinite(card.rank)?' Lv '+card.rank:' 升級')+(upgrades.length?'：'+upgrades.join('、'):'');
      try{game.events.onLoot?.(message,card.rarity||0);}catch(error){console.debug('[RO助手] 自選完成訊息顯示失敗',error);}
    }
  }
  function runAdvancedBackground(state){
    const {game,kind}=state;
    if(game.state!=='levelup')return cancelAdvancedChoice(false);
    if(++state.actions>1000||performance.now()-state.started>10000)return cancelAdvancedChoice();
    const decision=advancedDecision(game,state.cards,kind,{available:(type,index)=>advancedBackgroundAvailable(state,type,index)});
    if(!decision)return revealAdvancedChoice(state);
    const card=state.cards[decision.index];advancedClicking=true;
    try{
      if(decision.type==='pick')return finishAdvancedBackground(state,card);
      if(decision.type==='deck'){
        const cards=game[kind==='skill'?'rerollDeck':'rerollChest']();
        if(!Array.isArray(cards)||!cards.length)return revealAdvancedChoice(state);state.cards=cards;
      }else if(decision.type==='single'){
        const replacement=game.rerollChestCard(card);if(!replacement)return revealAdvancedChoice(state);state.cards[decision.index]=replacement;
      }else if(decision.type==='banish'){
        const replacement=game[kind==='skill'?'banishCard':'banishChestCard'](card,state.cards);
        if(replacement)state.cards[decision.index]=replacement;else state.cards.splice(decision.index,1);
        if(!state.cards.length){
          if(kind==='skill')state.cards.push({id:'potion',rank:0,isNew:false,rarity:0});
          else return finishAdvancedBackground(state,null);
        }
      }
      if(advancedChoice===state&&!state.manual)queueAdvancedChoice();
    }catch(error){
      if(advancedChoice===state&&game.state==='levelup'){
        state.background=typeof state.render==='function';cancelAdvancedChoice();
      }
      console.warn('[RO助手] 背景自選停止，保留原生流程',error);
    }finally{advancedClicking=false;}
  }
  function runAdvancedChoice(){
    advancedTimer=null;const state=advancedChoice,picker=document.querySelector('#picker');
    if(!advancedSettings.enabled||!state||state.manual||state.game!==activeGame||state.game.player?.dead||state.game.state==='over'||advancedDialog)return;
    if(state.background)return runAdvancedBackground(state);
    if(!picker||picker.classList.contains('hidden')||picker.classList.contains('closing'))return;
    const nodes=[...picker.querySelectorAll('#pk-cards .pk-card')];
    if(!nodes.length||nodes.length!==state.cards.length||nodes.some((node,index)=>node.dataset.i!==String(index)))return;
    if(performance.now()-state.started>10000){cancelAdvancedChoice();notify('自動選卡未完成，已恢復手動選擇');return;}
    const available=(type,index)=>{const button=advancedActionButton(state,type,index);return !!button&&!button.disabled&&!button.classList.contains('disabled');};
    const decision=state.pending||advancedDecision(state.game,state.cards,state.kind,{available});
    if(!decision)return;
    const node=nodes[decision.index];
    // Retain native entrance locks, animation, coop deadline and replacement
    // confirmation. Only click controls belonging to these exact offers.
    advancedClicking=true;
    try{
      if(decision.type==='pick'){
        state.pending=decision;
        const slot=node.closest('.pk-slot');
        if(slot?.classList.contains('asking'))slot.querySelector('[data-yes]')?.click();else node.click();
        if(!picker.classList.contains('closing'))queueAdvancedChoice(100);
      }else{
        const button=advancedActionButton(state,decision.type,decision.index);
        if(!button||button.disabled)return;
        button.click();
        // Native methods schedule the next pass only when an action ran.
      }
    }catch(error){cancelAdvancedChoice();console.warn('[RO助手] 自動選卡停止',error);notify('自動選卡遇到錯誤，請手動選擇');}
    finally{advancedClicking=false;}
  }
  function advancedManualInput(event){
    if(advancedClicking)return;
    if(event.type==='keydown'&&advancedDialog&&!advancedDialog.hidden){event.stopImmediatePropagation();if(event.key==='Escape'){event.preventDefault();closeAdvancedDialog();}return;}
    if(!advancedSettings.enabled)return;
    if(event.type==='keydown'){
      if(!pickerIsOpen()&&!advancedChoice?.background)return;
      if(event.key==='Escape'||/^[1-9]$/.test(event.key)||event.key==='Enter'||event.key===' ')cancelAdvancedChoice();
    }else if(event.target instanceof Element&&event.target.closest('#pk-cards, #pk-bar'))cancelAdvancedChoice();
  }
  function closeAdvancedDialog(){advancedDialog?.remove();advancedDialog=null;}
  function advancedSelect(value,options,change){
    const select=document.createElement('select');
    for(const [id,label]of options){const option=document.createElement('option');option.value=id;option.textContent=label;select.append(option);}
    select.value=value;select.onchange=()=>change(select.value);return select;
  }
  function advancedButton(label,action){const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=action;return button;}
  function renderAdvancedProfiles(root){
    const panel=document.createElement('section');panel.className='ro-ac-profiles';
    const label=document.createElement('strong');label.textContent='設定檔';panel.append(label);
    panel.append(advancedSelect(advancedProfiles.active,advancedProfiles.profiles.map(profile=>[profile.id,profile.name]),selectAdvancedProfile));
    const profile=advancedProfiles.profiles.find(profile=>profile.id===advancedProfiles.active),name=document.createElement('input');
    name.type='text';name.maxLength=60;name.value=profile.name;name.setAttribute('aria-label','設定檔名稱');panel.append(name);
    const attempt=action=>()=>{try{action();}catch(error){notify(error.message||'設定檔操作失敗');}};
    panel.append(advancedButton('新增（複製目前）',attempt(()=>addAdvancedProfile(name.value))),advancedButton('重新命名',attempt(()=>{const value=name.value.trim();if(!value)throw Error('請輸入名稱');profile.name=value.slice(0,60);saveAdvancedSettings();renderAdvancedDialog();})));
    const remove=advancedButton('移除目前設定檔',attempt(removeAdvancedProfile));remove.disabled=advancedProfiles.profiles.length<=1;panel.append(remove);
    const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='匯入／匯出設定檔';details.append(summary);
    const text=document.createElement('textarea');text.rows=5;text.placeholder='貼上匯出的 JSON，或選擇 JSON 檔案';text.setAttribute('aria-label','設定檔 JSON');text.style.width='100%';text.style.boxSizing='border-box';details.append(text);
    const download=all=>{
      text.value=exportAdvancedProfiles(all);
      const url=URL.createObjectURL(new Blob([text.value],{type:'application/json'})),link=document.createElement('a');
      link.href=url;link.download=(all?'自動選卡全部設定檔':profile.name.replace(/[<>:"/\\|?*]/g,'_'))+'.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    };
    details.append(advancedButton('匯出目前',attempt(()=>download(false))),advancedButton('匯出全部',attempt(()=>download(true))),advancedButton('匯入貼上內容',attempt(()=>{const count=importAdvancedProfiles(text.value);notify('已匯入 '+count+' 個設定檔');})));
    const file=document.createElement('input');file.type='file';file.accept='.json,application/json';file.setAttribute('aria-label','匯入設定檔 JSON');
    file.onchange=async()=>{try{const selected=file.files?.[0];if(!selected)return;if(selected.size>1024*1024)throw Error('設定檔不可超過 1 MB');const count=importAdvancedProfiles(await selected.text());notify('已匯入 '+count+' 個設定檔');}catch(error){notify(error.message||'匯入失敗');}finally{file.value='';}};
    details.append(file);panel.append(details);root.append(panel);
  }
  function renderAdvancedDialog(){
    if(!advancedDialog)return;
    const dialog=advancedDialog;dialog.replaceChildren();
    const head=document.createElement('header'),title=document.createElement('strong');title.textContent='自動選卡';
    head.append(title,advancedButton('關閉',closeAdvancedDialog));dialog.append(head);
    renderAdvancedProfiles(dialog);
    const enabled=document.createElement('label'),toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=advancedSettings.enabled;
    toggle.onchange=()=>{advancedSettings.enabled=toggle.checked;saveAdvancedSettings();};enabled.append(toggle,' 啟用進階自動選卡（設定會保存；啟用時取代舊自選）');dialog.append(enabled);
    const note=document.createElement('p');note.textContent='填充只在仍能保留所有必拿技能格時選。刷新／放逐使用原生剩餘次數；無可選項時保留手動。點選卡片、刷新按鈕或按 Escape，可中止當次自動選擇。';dialog.append(note);
    if(!advancedCatalog.skills.length||!advancedScope){const loading=document.createElement('p');loading.textContent='尚無法確認目前角色或職業資料，請回到主城重新開啟設定；不會顯示其他職業的技能。';dialog.append(loading);return;}
    const scopeLabel=document.createElement('p');scopeLabel.textContent='目前職業：'+advancedScope.name+'（含繼承職業、全部天賦技能及普攻；可提前設定）';dialog.append(scopeLabel);
    const search=document.createElement('input');search.type='search';search.placeholder='搜尋技能名稱或 ID';search.setAttribute('aria-label','搜尋技能');dialog.append(search);
    const table=document.createElement('div');table.className='ro-ac-table';dialog.append(table);
    const heading=document.createElement('div');heading.className='ro-ac-row';heading.append(...['技能','新技能','升級卡'].map(text=>{const span=document.createElement('b');span.textContent=text;return span;}));table.append(heading);
    for(const skill of advancedScopedSkills()){
      const row=document.createElement('div');row.className='ro-ac-row';row.dataset.search=(skill.name+' '+skill.id).toLowerCase();
      const name=document.createElement('span');name.textContent=skill.name;name.title=skill.id;const rule=advancedSkillRule(skill.id);
      row.append(name,advancedSelect(rule.take,[['must','必拿'],['fill','填充'],['never','必不拿']],value=>{advancedSettings.skills[skill.id]={...advancedSkillRule(skill.id),take:value};saveAdvancedSettings();}),advancedSelect(rule.upgrade,[['select','選取'],['ignore','無視'],['banish','放逐']],value=>{advancedSettings.skills[skill.id]={...advancedSkillRule(skill.id),upgrade:value};saveAdvancedSettings();renderAdvancedPriority(priority);}));table.append(row);
    }
    search.oninput=()=>{for(const row of table.querySelectorAll('[data-search]'))row.hidden=!row.dataset.search.includes(search.value.trim().toLowerCase());};
    const priority=document.createElement('section');dialog.append(priority);renderAdvancedPriority(priority);
    const itemTitle=document.createElement('h3');itemTitle.textContent='道具';dialog.append(itemTitle);
    for(const [slot,label]of advancedSlots){
      const row=document.createElement('section'),name=document.createElement('strong');name.textContent=label;row.append(name);
      row.append(advancedSelect(advancedItemRule(slot).upgrade,[['select','選取升級'],['ignore','無視升級'],['banish','放逐升級']],value=>{advancedSettings.items[slot]={...advancedItemRule(slot),wanted:advancedSettings.items[slot]?.wanted||[],upgrade:value};saveAdvancedSettings();}));
      const choices=document.createElement('details'),summary=document.createElement('summary');
      const updateSummary=()=>{const count=advancedItemRule(slot).wanted.length;summary.textContent=count?'已指定 '+count+' 種道具':'任意道具（未勾選）';};updateSummary();choices.append(summary);
      for(const item of advancedScopedItems(slot)){
        const label=document.createElement('label'),checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=advancedItemRule(slot).wanted.includes(item.id);
        checkbox.onchange=()=>{const rule=advancedItemRule(slot),stored=advancedSettings.items[slot]?.wanted||[];rule.wanted=checkbox.checked?[...new Set([...stored,item.id])]:stored.filter(id=>id!==item.id);advancedSettings.items[slot]=rule;saveAdvancedSettings();updateSummary();};label.append(checkbox,item.name);choices.append(label);
      }
      row.append(choices);dialog.append(row);
    }
  }
  function renderAdvancedPriority(root){
    root.replaceChildren();const title=document.createElement('h3');title.textContent='選取升級的詳細優先順序';root.append(title);
    const skills=advancedScopedSkills().filter(skill=>advancedSkillRule(skill.id).upgrade==='select');
    const options=skills.map(skill=>[skill.id,skill.name]);
    root.append(advancedButton('新增條目',()=>{if(!skills.length)return;advancedSettings.priority.push({skill:skills[0].id,upgrades:[]});saveAdvancedSettings();renderAdvancedPriority(root);}));
    const visible=advancedSettings.priority.map((entry,index)=>({entry,index})).filter(({entry})=>skills.some(skill=>skill.id===entry.skill));
    for(const [position,{index,entry}]of visible.entries()){
      const row=document.createElement('div');row.className='ro-ac-priority';
      const existing=advancedCatalog.skills.find(skill=>skill.id===entry.skill);
      const available=options.some(([id])=>id===entry.skill)?options:[[entry.skill,(existing?.name||entry.skill)+'（目前非選取）'],...options];
      row.append(String(position+1)+'. ',advancedSelect(entry.skill,available,value=>{entry.skill=value;entry.upgrades=[];saveAdvancedSettings();renderAdvancedPriority(root);}));
      for(const [label,offset]of [['↑',-1],['↓',1]]){const target=visible[position+offset]?.index;const button=advancedButton(label,()=>{if(target===undefined)return;[advancedSettings.priority[index],advancedSettings.priority[target]]=[advancedSettings.priority[target],advancedSettings.priority[index]];saveAdvancedSettings();renderAdvancedPriority(root);});button.disabled=target===undefined;row.append(button);}
      row.append(advancedButton('刪除',()=>{advancedSettings.priority.splice(index,1);saveAdvancedSettings();renderAdvancedPriority(root);}));
      const choices=document.createElement('details'),summary=document.createElement('summary');summary.textContent=entry.upgrades.length?'已指定 '+entry.upgrades.length+' 種升級':'任意升級（未勾選）';choices.append(summary);
      for(const upgrade of advancedSkillUpgrades(entry.skill)){
        const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=entry.upgrades.includes(upgrade.id);
        check.onchange=()=>{entry.upgrades=check.checked?[...new Set([...entry.upgrades,upgrade.id])]:entry.upgrades.filter(id=>id!==upgrade.id);saveAdvancedSettings();renderAdvancedPriority(root);};label.append(check,upgrade.name);choices.append(label);
      }
      row.append(choices);root.append(row);
    }
  }
  const floatingHelperPositions=new Map();
  function placeFloatingHelperButton(button){
    const position=floatingHelperPositions.get(button.id);if(!position)return;
    const view=helperViewport(),rect=button.getBoundingClientRect();
    position.left=Math.max(view.left,Math.min(position.left,view.left+view.width-rect.width));position.top=Math.max(view.top,Math.min(position.top,view.top+view.height-rect.height));
    Object.assign(button.style,{left:position.left+'px',top:position.top+'px',right:'auto',bottom:'auto'});
  }
  function installFloatingHelperDrag(button){
    let hold=null,suppressClick=false;
    const clear=()=>{if(hold)clearTimeout(hold.timer);hold=null;button.style.cursor='grab';};
    button.addEventListener('pointerdown',event=>{
      if(event.isPrimary===false||(event.button!==undefined&&event.button!==0))return;
      clear();suppressClick=false;
      const rect=button.getBoundingClientRect();
      hold={id:event.pointerId,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top,dragging:false};
      hold.timer=setTimeout(()=>{if(hold){hold.dragging=true;button.style.cursor='grabbing';}},300);
      button.setPointerCapture?.(event.pointerId);
    });
    button.addEventListener('pointermove',event=>{
      if(!hold||hold.id!==event.pointerId)return;
      const dx=event.clientX-hold.x,dy=event.clientY-hold.y;
      if(!hold.dragging){if(Math.hypot(dx,dy)>10){suppressClick=true;clear();}return;}
      event.preventDefault();suppressClick=true;
      floatingHelperPositions.set(button.id,{left:hold.left+dx,top:hold.top+dy});placeFloatingHelperButton(button);
    });
    button.addEventListener('pointerup',event=>{if(hold?.id===event.pointerId){suppressClick=hold.dragging||suppressClick;clear();}});
    button.addEventListener('pointercancel',()=>{suppressClick=true;clear();});
    button.addEventListener('lostpointercapture',clear);
    button.addEventListener('contextmenu',event=>event.preventDefault());
    button.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopImmediatePropagation();suppressClick=false;}},true);
  }
  function nativeGameWindowOpen(){
    return [...document.querySelectorAll('.overlay,dialog[open],[role="dialog"]')].some(panel=>{
      if(panel.closest('#ro-advanced-choice-dialog, #ro-safari-diagnostics'))return false;
      for(let node=panel;node instanceof Element;node=node.parentElement){
        if(node.hidden||node.classList.contains('hidden')||node.getAttribute('aria-hidden')==='true')return false;
        const style=window.getComputedStyle?.(node);
        if(style?.display==='none'||style?.visibility==='hidden')return false;
      }
      return true;
    });
  }
  function updateAdvancedChoiceUI(){
    const lobby=document.querySelector('#lobby-ui');let button=document.querySelector('#ro-advanced-choice');
    if(!lobby||lobby.classList.contains('hidden')||!document.body.classList.contains('in-lobby')){button?.remove();closeAdvancedDialog();return;}
    if(!button){button=advancedButton('自動選卡',()=>{if(advancedDialog)return;advancedScope=advancedCharacterScope(advancedReadCharacter());advancedDialog=document.createElement('section');advancedDialog.id='ro-advanced-choice-dialog';advancedDialog.setAttribute('role','dialog');advancedDialog.setAttribute('aria-modal','true');advancedDialog.setAttribute('aria-label','自動選卡設定');document.body.append(advancedDialog);renderAdvancedDialog();});button.id='ro-advanced-choice';document.body.append(button);}
    if(!button.dataset.roDraggable){button.dataset.roDraggable='true';button.title='點一下開啟設定；長按後拖曳移動';installFloatingHelperDrag(button);}
    const blocked=nativeGameWindowOpen();
    if(button.hidden!==blocked)button.hidden=blocked;
    if(advancedDialog&&advancedDialog.hidden!==blocked)advancedDialog.hidden=blocked;
    const text='自動選卡'+(advancedSettings.enabled?'：開':'：關');if(button.textContent!==text)button.textContent=text;
    if(!blocked)placeFloatingHelperButton(button);
  }
  function pickerIsOpen(){
    const picker=document.querySelector('#picker');
    return !!picker&&!picker.classList.contains('hidden');
  }
  let touchUiQuietUntil=0,touchUiActive=false,touchUiResumeTimer=null;
  function touchUiIsQuiet(){return touchUiActive||performance.now()<touchUiQuietUntil;}
  function deferTouchUI(){
    touchUiQuietUntil=performance.now()+1000;
    clearTimeout(touchUiResumeTimer);
    // A town overlay can finish opening during the touch quiet period, with
    // no later DOM mutation or game tick. Resume the skipped scan explicitly.
    touchUiResumeTimer=setTimeout(()=>{
      touchUiResumeTimer=null;
      if(!touchUiActive)schedule();
    },1000);
  }
  function fastChoice(game, cards, kind) {
    if (!Array.isArray(cards) || cards.length === 0) return null;
    let best = null;
    for (const card of cards) {
      const matched = kind === 'skill'
        ? rules.some(r => r.kind === 'skill' && r.id === card.id)
        : rules.some(r => r.kind === 'item' && r.id === card.slot && r.itemId === card.item);
      const quality = kind === 'skill' ? card.rarity : card.quality;
      if (!matched || !Number.isInteger(quality) || quality < 0) continue;
      if (!best || quality > best.quality) best = { card, quality };
    }
    return best?.card || null;
  }

  function installFastChoice(game) {
    installDeitySwapPreference(game);
    installPickupHelpers(game);
    // Pickup recognition must inspect the native dropPickup before the visual
    // owner wrapper is installed around it.
    if(typeof installBattleVisualPreferences==='function')installBattleVisualPreferences(game);
    installHordeCount(game);
    if(game)activeGame=game;
    if (!game || !game.events) return;
    let installed=fastHooked.get(game);
    if(!installed){installed=new Map();fastHooked.set(game,installed);}
    activeGame = game;
    installAdvancedChoiceMethods(game);
    for (const [event, kind, method] of [['onLevelUp', 'skill', 'choose'], ['onChest', 'item', 'chooseChest']]) {
      // Browser/extension bridges may return a fresh callable on each read.
      // Reference inequality is not evidence that the native callback changed.
      if(installed.has(event))continue;
      const original = game.events[event];
      if (typeof original !== 'function' || typeof game[method] !== 'function') continue;
      const wrapper=function(cards, ...args) {
        if(advancedSettings.enabled){
          const receiver=this;captureAdvancedChoice(game,cards,kind,offers=>Reflect.apply(original,receiver,[offers,...args]));return;
        }
        // With no rule for this picker, preserve the native path exactly.
        if(!rules.some(rule=>rule.kind===kind))return Reflect.apply(original,this,[cards,...args]);
        const selected = fastChoice(game, cards, kind);
        // Leave replacements requiring confirmation to the normal UI.
        const current = selected && kind === 'item' ? game.runItems?.slots.get(selected.slot) : null;
        if (!selected || (current && current.item !== selected.item)) {
          const result = original.call(this, cards, ...args);
          // Preserve authoritative offer IDs for the DOM fallback, including
          // rerendered weapon icons and localized basic-attack labels.
          const buttons = document.querySelectorAll('#pk-cards .pk-card');
          if (buttons.length === cards.length) buttons.forEach((button, index) => {
            const offer = cards[index];
            button.dataset.roApKind = kind;
            button.dataset.roApId = kind === 'skill' ? offer.id : offer.item;
            button.dataset.roApQuality = String(kind === 'skill' ? offer.rarity : offer.quality);
          });
          return result;
        }
        // Drain consecutive levels without recursively growing the JS stack.
        // No picker DOM, entrance lock, or exit animation is created.
        queueMicrotask(() => {
          if (activeGame !== game || game.player?.dead || game.state === 'over') return;
          if(advancedSettings.enabled){captureAdvancedChoice(game,cards,kind,offers=>original.call(game.events,offers,...args));return;}
          try { game[method](selected); }
          catch (error) {
            console.warn('[RO助手] 即時自選失敗，恢復手動選擇', error);
            original.call(game.events, cards, ...args);
          }
        });
      };
      game.events[event]=wrapper;
      installed.set(event,{events:game.events,wrapper});
    }
  }

  function victoryMagnet(game) {
    if (!game || game.lootUntil < 0 || !Number.isFinite(game.lootUntil)
      || game.endless || game.isStory || game.player?.dead || victoryCollected.has(game)) return;
    if (game.coop?.replica) {
      if (typeof game.coop.take !== 'function') return;
      // Client pickup requests go through the host and its normal loot rolls.
      victoryCollected.add(game);
      for (const pickup of game.pickups || []) {
        if (!pickup.dead && ['loot', 'card', 'egg'].includes(pickup.kind)) game.coop.take(pickup);
      }
    } else {
      if (typeof game.vacuum !== 'function') return;
      victoryCollected.add(game);
      game.vacuum();
    }
    notify('勝利磁鐵：已吸取地上掉落物');
  }

  const helperHookErrors=new WeakMap();
  function runHelperHook(game,name,action){
    try{return action();}
    catch(error){
      try{safariDiagnostics?.recordError('helper:'+name,error);}catch{}
      let seen=helperHookErrors.get(game);if(!seen){seen=new Set();helperHookErrors.set(game,seen);}
      if(!seen.has(name)){seen.add(name);console.warn('[RO助手] '+name+' 更新失敗，遊戲流程繼續',error);}
    }
  }
  function helperTick(game){
    if(typeof performanceSession!=='undefined'&&performanceSession&&(performanceSession.game!==game||game.state==='over'))stopPerformanceMeasurement(performanceSession.game!==game?'game-changed':'game-over');
    runHelperHook(game,'FPS',()=>updateFpsDisplay(game));
    runHelperHook(game,'戰鬥天氣',()=>installWeatherEffects(game));
    runHelperHook(game,'自動選擇',()=>installFastChoice(game));
    runHelperHook(game,'怪物統計',()=>updateHordeHud(game));
    runHelperHook(game,'角色資料',()=>{if(performance.now()>=nextCharacterDetailsAt){nextCharacterDetailsAt=performance.now()+250;updateCharacterDetails();}});
    runHelperHook(game,'勝利磁鐵',()=>victoryMagnet(game));
  }
  async function installGameHooks() {
    // Import only the already-loaded shared module: never re-run the main game.
    // Locate the public hook registry by its shape, not its minified export name.
    const link = document.querySelector('link[rel="modulepreload"][href*="soul_linker-"]');
    if (!link) { console.warn('[RO助手] 找不到共用模組，勝利磁鐵未啟用'); return; }
    try {
      const module = await import(new URL(link.getAttribute('href'), location.href).href);
      gameCatalog=module;
      void loadStageLevelRules();
      initializeBattleSettings(module);
      installPickupVisualHooks(module);
      updateStageSpawnSchedule();
      smithDefs = Object.values(module).find(value => value && typeof value === 'object'
        && value[1101]?.slot === 'weapon' && value[2254]?.slot === 'head_top') || null;
      smithAssets = Object.values(module).find(value => value && typeof value === 'object'
        && value.icons instanceof Map && value.itemTextures instanceof Map) || null;
      const nativeTwoHand = Object.values(module).find(value => value instanceof Set && value.has('양손검') && value.has('활'));
      if (nativeTwoHand) twoHandTypes = nativeTwoHand;
      updateSmith();
      skillDefs = Object.values(module).find(value => value && typeof value === 'object'
        && value.atk_sword?.kind === 'weapon' && value.bash?.kind === 'weapon') || null;
      initializeAdvancedCatalog(module);
      initializeTradeSearch(module);
      const hooks = Object.values(module).find(value => value && typeof value === 'object'
        && ['start', 'tick', 'hurt', 'damageMult', 'hit', 'kill', 'cast'].every(key => Array.isArray(value[key])));
      if (!hooks) throw new Error('找不到遊戲事件介面');
      hooks.start.push(game => {
        runHelperHook(game,'重設介面',()=>resetRun());
        runHelperHook(game,'自動選擇',()=>installFastChoice(game));
      });
      hooks.tick.push(helperTick);
      runHelperHook(hooks,'背包與換裝介面',updateInventoryViews);
      console.info('[RO助手] 即時自選已啟用 v2.2.15');
    } catch (error) {
      console.warn('[RO助手] 勝利磁鐵未啟用', error);
      notify('勝利磁鐵載入失敗；自動選擇仍可使用');
    }
  }

  function iconOf(el) {
    const src = el?.querySelector('img')?.getAttribute('src');
    if (!src) return '';
    try {
      const url = new URL(src, location.href);
      // Preserve data/blob URLs: some game icons are generated at runtime.
      return ['data:', 'blob:'].includes(url.protocol) ? url.href : url.origin + url.pathname;
    } catch { return ''; }
  }
  const cleanName = text => (text || '').replace(/\s*\+\d+\s*$/, '').replace(/\s+/g, ' ').trim();
  function tipName(el) {
    // Run the game's existing hover handler to obtain this exact slot's name.
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const tip = document.querySelector('#skill-tip');
    if (!tip || tip.classList.contains('hidden') || iconOf(tip.querySelector('.st-head')) !== iconOf(el)) return '';
    const heading = tip.querySelector('.st-head b')?.cloneNode(true);
    heading?.querySelectorAll('.ro-orig').forEach(n => n.remove());
    return cleanName(heading?.textContent);
  }
  function identity(el) {
    const kind = el.hasAttribute('data-skill') ? 'skill' : 'item';
    const itemId = kind === 'item' ? activeGame?.runItems?.slots.get(el.dataset.item)?.item : undefined;
    return { kind, id: kind === 'skill' ? el.dataset.skill : el.dataset.item, itemId, icon: iconOf(el), name: tipName(el) || (kind==='skill'?cleanName((activeGame?.skillDef?.(el.dataset.skill)||skillDefs?.[el.dataset.skill])?.name):'') };
  }
  function sameSlot(rule, el) {
    const skill = el.hasAttribute('data-skill');
    return skill ? rule.kind === 'skill' && rule.id === el.dataset.skill
      : rule.kind === 'item' && rule.id === el.dataset.item && rule.icon === iconOf(el);
  }
  function notify(text) {
    toast ||= Object.assign(document.createElement('div'), { id: 'ro-ap-toast' });
    toast.textContent = text;
    document.body.append(toast);
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => toast.remove(), 2400);
  }
  function closeMenu() { menu?.remove(); menu = null; }
  function helperViewport(){
    const view=window.visualViewport;
    return {left:view?.offsetLeft||0,top:view?.offsetTop||0,width:view?.width||innerWidth,height:view?.height||innerHeight};
  }
  let longPress=null,heldSlot=null,heldUntil=0,touchInputUsed=false;
  function touchInterface(){return touchInputUsed||document.documentElement.classList.contains('touch')||window.matchMedia?.('(pointer:coarse)').matches===true;}
  function cancelLongPress(){clearTimeout(longPress?.timer);longPress=null;}
  function clearLongPress(){cancelLongPress();heldSlot=null;heldUntil=0;}
  function slotOf(target){return target instanceof Element?target.closest(SLOT):null;}
  function suppressHeldEvent(event){
    if(event.target instanceof Element&&event.target.closest('#pk-cards, #pk-bar'))return false;
    if(!['click','contextmenu'].includes(event.type)||!heldSlot||performance.now()>heldUntil||slotOf(event.target)!==heldSlot)return false;
    event.preventDefault();event.stopImmediatePropagation();return true;
  }
  function beginLongPress(event){
    if(event.pointerType==='touch')deferTouchUI();
    if(job&&event.target instanceof Element&&event.target.closest('#pk-cards, #pk-bar')){
      document.querySelectorAll('#pk-cards .pk-card').forEach(card=>manualCards.add(card));cancel();
    }
    // Only skill/item slots participate. Native picker controls are untouched.
    if(!slotOf(event.target)){cancelLongPress();heldSlot=null;return;}
    if(event.pointerType==='touch')touchInputUsed=true;
    // Pointer/touch pairs on Safari represent one gesture, not a second finger.
    if(longPress){
      if(event.isPrimary!==false&&longPress.slot===slotOf(event.target)&&(event.touchFallback||longPress.touchFallback||longPress.pointerId===event.pointerId)){
        if(!event.touchFallback){longPress.pointerId=event.pointerId;longPress.touchFallback=false;}return;
      }
      cancelLongPress();return;
    }
    if(!['touch','pen'].includes(event.pointerType)||event.isPrimary===false||event.button>0)return;
    heldSlot=null;
    const slot=slotOf(event.target);if(!slot||slot.classList.contains('empty'))return;
    const press={slot,pointerId:event.pointerId,x:event.clientX,y:event.clientY,id:slot.dataset.skill??slot.dataset.item,icon:iconOf(slot),touchFallback:!!event.touchFallback};
    longPress=press;
    press.timer=setTimeout(()=>{
      if(longPress!==press||!slot.isConnected||slot.classList.contains('empty')||(slot.dataset.skill??slot.dataset.item)!==press.id||iconOf(slot)!==press.icon){cancelLongPress();return;}
      longPress=null;heldSlot=slot;heldUntil=performance.now()+1200;
      context({target:slot,clientX:press.x,clientY:press.y,preventDefault(){},stopImmediatePropagation(){}});
    },550);
  }
  function moveLongPress(event){
    if(longPress&&event.pointerId===longPress.pointerId&&Math.hypot(event.clientX-longPress.x,event.clientY-longPress.y)>10)cancelLongPress();
  }
  function endLongPress(event){
    if(longPress&&event.pointerId===longPress.pointerId)cancelLongPress();
    if(heldSlot&&slotOf(event.target)===heldSlot)heldUntil=performance.now()+800;
  }
  function touchPressEvent(event){
    const point=event.changedTouches?.[0]||event.touches?.[0];if(!point)return null;
    return {target:event.target,pointerType:'touch',pointerId:longPress?.pointerId??point.identifier,isPrimary:true,button:0,clientX:point.clientX,clientY:point.clientY,touchFallback:true};
  }
  function startTouchPress(event){
    touchUiActive=!!event.touches?.length;
    deferTouchUI();
    touchInputUsed=true;
    if(event.touches?.length>1){clearLongPress();return;}
    const pointer=touchPressEvent(event);if(pointer)beginLongPress(pointer);
  }
  function moveTouchPress(event){deferTouchUI();const pointer=touchPressEvent(event);if(pointer)moveLongPress(pointer);}
  function finishTouchPress(event){
    touchUiActive=!!event.touches?.length;
    deferTouchUI();
    const pointer=touchPressEvent(event);if(pointer)endLongPress(pointer);else cancelLongPress();
  }
  function touchContext(event){
    if(suppressHeldEvent(event))return;
    // Some mobile browsers dispatch contextmenu before the 550ms timer.
    if(longPress&&slotOf(event.target)===longPress.slot){heldSlot=longPress.slot;heldUntil=performance.now()+1200;cancelLongPress();}
    context(event);
  }
  function context(event) {
    const el = event.target instanceof Element ? event.target.closest(SLOT) : null;
    if (!el || el.classList.contains('empty')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    closeMenu();
    const rule = identity(el);
    if(heldSlot===el)el.closest('#skillbar, #lu-sockets, #runitems')?.dispatchEvent(new MouseEvent('mouseleave'));
    // Do not guess when a tooltip is missing or the site's DOM has changed.
    if (!rule.icon || !rule.name) { notify('無法辨識此項目；請關閉提示後，重新長按或按右鍵'); return; }
    const enabled = rules.some(r => sameSlot(r, el));
    menu = document.createElement('div');
    menu.id = 'ro-ap-menu';
    menu.setAttribute('role', 'menu');
    const title = document.createElement('div');
    title.textContent = rule.name;
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.textContent = enabled ? '關閉自動選擇' : '開啟自動選擇';
    button.onclick = () => {
      if(!el.isConnected||!sameSlot(rule,el)||iconOf(el)!==rule.icon){closeMenu();notify('項目已變更，請重新長按或按右鍵設定');return;}
      rules = rules.filter(r => !sameSlot(r, el));
      if (!enabled) rules.push(rule);
      if(enabled)el.removeAttribute('data-ro-ap-enabled');else el.setAttribute('data-ro-ap-enabled','');
      installFastChoice(activeGame);
      closeMenu(); scan();
      notify(`${rule.name}：已${enabled ? '關閉' : '開啟'}自動選擇`);
    };
    const close=document.createElement('button');close.type='button';close.textContent='取消';close.setAttribute('role','menuitem');close.onclick=closeMenu;
    menu.append(title, button,close);
    document.body.append(menu);
    const box = menu.getBoundingClientRect(),view=helperViewport();
    menu.style.left = Math.max(view.left+8, Math.min(event.clientX, view.left+view.width - box.width - 8)) + 'px';
    menu.style.top = Math.max(view.top+8, Math.min(event.clientY, view.top+view.height - box.height - 8)) + 'px';
    if(!touchInterface())button.focus({ preventScroll: true });
  }
  function rank(card) {
    const explicit = card.dataset.roApQuality;
    if (explicit !== undefined && /^[0-4]$/.test(explicit)) return Number(explicit);
    const badge = card.querySelector('.pk-badge')?.textContent.trim() || '';
    const names = [/(普通|Common|Común|Comum)$/i, /不普通|非凡|優良|罕見|Uncommon|Poco común|Incomum/i, /稀有|Rare|Raro/i, /史詩|Epic|Épico/i, /傳說|Legendary|Legendario|Lendári[oa]/i];
    for (let i = 4; i >= 0; i--) if (names[i].test(badge)) return i;
    const color = card.closest('.pk-slot')?.style.getPropertyValue('--q').trim().toLowerCase();
    const index = color === '#f2f2f2' ? 0 : COLORS.indexOf(color);
    return index < 0 ? -1 : index;
  }
  function choose(cards, kind) {
    let best = null;
    for (const card of cards) {
      const icon = iconOf(card.querySelector('.pk-art'));
      const name = cleanName(card.querySelector('.pk-name')?.textContent);
      const matched = rules.some(r => {
        if (r.kind !== kind) return false;
        if (card.dataset.roApKind === kind && card.dataset.roApId)
          return kind === 'skill' ? r.id === card.dataset.roApId : r.itemId === card.dataset.roApId;
        if (kind === 'skill') {
          const definition = activeGame?.skillDef?.(r.id) || skillDefs?.[r.id];
          if (definition && cleanName(definition.name) === name) return true;
        }
        return r.icon === icon && r.name === name;
      });
      if (!matched) continue;
      const quality = rank(card);
      // Unknown quality fails open instead of silently choosing the wrong card.
      if (quality < 0) return null;
      if (!best || quality > best.quality) best = { card, quality, name };
    }
    return best;
  }
  function cancel() {
    if (job) { clearTimeout(job.timer); job = null; }
    document.querySelector('#picker')?.removeAttribute('data-ro-ap-hidden');
  }
  function resetRun() {
    resetAdvancedChoice();
    clearLongPress();
    clearHordeHud();
    closeCharacterDetails();
    activeGame=null;
    document.querySelector('#ro-character-details-toggle')?.remove();
    rules = [];
    cancel();
    closeMenu();
    toast?.remove();
    document.querySelectorAll('[data-ro-ap-enabled]').forEach(el => el.removeAttribute('data-ro-ap-enabled'));
  }
  function scan() {
    safariDiagnostics?.updateUI();
    updateAdvancedChoiceUI();
    if(advancedSettings.enabled){cancel();if(advancedChoice&&!advancedChoice.manual&&!advancedTimer)queueAdvancedChoice();}
    // Native choice gestures must not trigger unrelated helper DOM refreshes.
    if(!pickerIsOpen()&&!touchUiIsQuiet()){
      updateHordeHud();
      updateStageSpawnSchedule();
      updateCharacterDetails();
      updateOfflineUI();
      updateMinimapOption();
      updatePickupOptions();
      updateBattlePreferenceOptions();
      updateDeitySwapPreferenceUI();
      updateSmith();
      updateMerchant();
      updateInventoryViews();
      updateTradeSearch();
      updateStatCapDisplay();
    // Bottom bars are recreated whenever levels or items change.
    document.querySelectorAll(SLOT).forEach(el => {
      const enabled = rules.some(r => sameSlot(r, el));
      if (enabled) el.setAttribute('data-ro-ap-enabled', '');
      else el.removeAttribute('data-ro-ap-enabled');
    });
    }
    const picker = document.querySelector('#picker');
    if(advancedSettings.enabled){cancel();return;}
    if (!picker || picker.classList.contains('hidden')) { cancel(); return; }
    if (picker.classList.contains('closing')) return;
    const cards = [...picker.querySelectorAll('#pk-cards .pk-card')];
    if (cards.some(card => manualCards.has(card))) { cancel(); return; }
    // Only normal skill/chest choices with the expected sockets.
    // The game may offer fewer than 3 cards when upgrades are exhausted/banished.
    // Story reward animations and other generic pickers must remain manual.
    const sockets = picker.querySelector('#lu-sockets');
    const title = picker.querySelector('#pk-title')?.textContent || '';
    const kind = /Level Up|升級|Subir de nivel|Subiu de nível/i.test(title) ? 'skill'
      : /Cofre del tesoro|Treasure Chest|寶箱|Baú do tesouro/i.test(title) ? 'item' : null;
    if(kind&&!rules.some(rule=>rule.kind===kind)){if(job)cancel();return;}
    if (!cards.length || !kind || !sockets || sockets.classList.contains('hidden') || sockets.style.visibility === 'hidden') { cancel(); return; }
    const selected = choose(cards, kind);
    if (!selected && rules.some(r => r.kind === kind) && !diagnosed.has(cards[0])) {
      diagnosed.add(cards[0]);
      console.debug('[RO助手] 自選未命中', {
        rules: rules.filter(r => r.kind === kind),
        offers: cards.map(card => ({ id: card.dataset.roApId, name: card.querySelector('.pk-name')?.textContent, icon: iconOf(card.querySelector('.pk-art')), quality: rank(card) })),
        fastHook: !!activeGame
      });
    }
    if (!selected || selected.card.closest('.pk-slot')?.querySelector('.pk-back')) { cancel(); return; }
    if (job?.card === selected.card) return;
    cancel();
    picker.setAttribute('data-ro-ap-hidden', '');
    const current = job = { card: selected.card, started: performance.now(), timer: null };
    const click = () => {
      if (job !== current) return;
      if (!current.card.isConnected || picker.classList.contains('hidden')) { cancel(); schedule(); return; }
      if (picker.classList.contains('closing')) return;
      if (performance.now() - current.started > 5000) {
        cards.forEach(card => manualCards.add(card));
        cancel(); notify('自動選擇逾時，已恢復手動選擇'); return;
      }
      // The game rejects clicks until 380 + cardCount*120 ms have passed.
      current.card.click();
      if (picker.classList.contains('closing')) {
        notify(`自動選擇：${selected.name}`);
      } else current.timer = setTimeout(click, 100);
    };
    current.timer = setTimeout(click, Math.max(800, 400 + cards.length * 120));
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; scan(); });
  }
  function start() {
    loadFilterStore();
    const style = document.createElement('style');
    style.textContent = `
      #chronicle{box-sizing:border-box}
      #chronicle>.chronicle-window{box-sizing:border-box;width:min(900px,calc((100vw - max(8px,env(safe-area-inset-left)) - max(8px,env(safe-area-inset-right)))/var(--ui,1)));max-height:calc((100vh - max(8px,env(safe-area-inset-top)) - max(8px,env(safe-area-inset-bottom)))/var(--ui,1));max-height:calc((100dvh - max(8px,env(safe-area-inset-top)) - max(8px,env(safe-area-inset-bottom)))/var(--ui,1));display:flex;flex-direction:column;min-height:0}
      #chronicle>.chronicle-window>.ro-title,#chronicle>.chronicle-window>.btn-row{flex:none}
      #chronicle>.chronicle-window>.ro-body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain}
      #chronicle #chr-perks{height:auto;min-height:0;flex:none}
      #chronicle #chr-perks .chr-list{flex:none;overflow:visible;scrollbar-gutter:auto}
      #ro-safari-diagnostics-open{touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;cursor:grab}#ro-safari-diagnostics-open[hidden],#ro-safari-diagnostics[hidden]{display:none!important}
      #ro-advanced-choice[data-ro-draggable]{touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;cursor:grab}#ro-advanced-choice[hidden],#ro-advanced-choice-dialog[hidden]{display:none!important}
      #ro-advanced-choice{position:fixed;right:max(12px,env(safe-area-inset-right));bottom:max(12px,env(safe-area-inset-bottom));z-index:40;padding:10px 16px;border:1px solid #718dbb;border-radius:8px;background:#233b61;color:#fff;font:600 15px sans-serif;cursor:pointer}
      #ro-advanced-choice-dialog{position:fixed;inset:4vh max(8px,calc((100vw - 960px)/2));z-index:10000;box-sizing:border-box;overflow:auto;overscroll-behavior:contain;padding:18px;background:#142238;color:#edf4ff;border:1px solid #819bc4;border-radius:12px;box-shadow:0 0 0 100vmax #0009;font:14px/1.6 sans-serif}
      #ro-advanced-choice-dialog header{display:flex;justify-content:space-between;align-items:center;font-size:20px}
      #ro-advanced-choice-dialog button,#ro-advanced-choice-dialog select,#ro-advanced-choice-dialog input[type=search]{padding:6px;margin:3px;background:#263d60;color:#fff;border:1px solid #7892ba;border-radius:5px;max-width:100%;box-sizing:border-box}
      #ro-advanced-choice-dialog button:disabled{opacity:.4}#ro-advanced-choice-dialog button{cursor:pointer}#ro-advanced-choice-dialog input[type=checkbox]{accent-color:#82b6ff}
      #ro-advanced-choice-dialog section{margin-top:12px;padding-top:8px;border-top:1px solid #456080}#ro-advanced-choice-dialog label{display:inline-block;margin:4px 10px 4px 0}
      #ro-advanced-choice-dialog .ro-ac-table{max-height:38vh;overflow:auto;border:1px solid #456080;margin-top:8px}
      #ro-advanced-choice-dialog .ro-ac-row{display:grid;grid-template-columns:minmax(120px,1fr) 110px 110px;align-items:center;gap:6px;padding:3px 8px;border-bottom:1px solid #304764}
      #ro-advanced-choice-dialog [hidden]{display:none!important}#ro-advanced-choice-dialog .ro-ac-priority{border-bottom:1px solid #304764;padding:5px 0}
      @media(max-width:500px){#ro-advanced-choice-dialog{padding:10px;inset:8px}#ro-advanced-choice-dialog .ro-ac-row{grid-template-columns:minmax(90px,1fr) 78px 78px;gap:2px;padding:3px}#ro-advanced-choice-dialog select{width:auto;min-width:0}}
      #ro-horde-hud{position:fixed;right:12px;top:auto;bottom:12px;width:180px;max-width:calc(100vw - 24px);z-index:8;box-sizing:border-box;background:#101a2be8;border:1px solid #738ab466;border-radius:7px;padding:7px 8px;color:#e8eef8;font:12px/1.5 sans-serif;overflow:auto;pointer-events:none}
      #ro-horde-hud[hidden]{display:none!important}#ro-horde-hud [data-monster-toggle]{pointer-events:auto;touch-action:manipulation}#ro-horde-hud [data-monster-counts]{pointer-events:auto}#ro-horde-hud [data-monster-header]{display:flex;align-items:center;justify-content:space-between;gap:4px}#ro-horde-hud [data-monster-toggle]{padding:0 5px;min-width:22px;line-height:20px;color:#e8eef8;background:#26344c;border:1px solid #738ab466;border-radius:3px;cursor:pointer}#ro-horde-hud [data-monster-counts][hidden]{display:none}#ro-horde-hud [data-horde-progress][data-status=idle]{color:#9da9bb}#ro-horde-hud [data-horde-progress]{font-weight:700;color:#ffd78a;font-size:14px}#ro-horde-hud [data-horde-progress][data-status=complete]{color:#76f0b0}#ro-horde-hud [data-horde-progress][data-status=canceled]{color:#9da9bb}#ro-horde-hud [data-monster-total]{margin-top:7px;padding-top:6px;border-top:1px solid #738ab444;font-weight:700}#ro-horde-hud [data-monster-counts]>div{display:flex;justify-content:space-between;gap:10px;padding:2px 0}#ro-horde-hud b{font-variant-numeric:tabular-nums}
      .stg-mobs.ro-mob-schedule{display:flex;flex-wrap:wrap;align-items:stretch;gap:8px}.stg-mobs .ro-timed-mob{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;width:auto;min-width:112px;max-width:180px;height:auto;padding:8px;box-sizing:border-box}.ro-timed-mob [data-ro-mob-time]{display:flex;flex-direction:column;align-items:center;gap:3px;margin-top:6px;line-height:1.4}.ro-timed-mob [data-ro-mob-time] b{font-size:12px;overflow-wrap:anywhere}#stg-detail [data-ro-mob-level]{display:block;width:fit-content;max-width:100%;box-sizing:border-box;font-size:12px;font-weight:700;line-height:1.5;color:#ffe08a;background:#20304c;border:1px solid #a18442;border-radius:4px;padding:1px 6px}#stg-detail .stg-boss [data-ro-mob-level]{margin:3px auto}.ro-timed-mob [data-ro-mob-time] small{display:block;font-size:11px;white-space:nowrap;font-variant-numeric:tabular-nums;opacity:.85}
      #ro-unwanted-dialog .ro-filter-panel.ro-equipment-filter{background:#0c1423;color:#e5edf8;border-color:#415573;width:min(1280px,96vw)}
      #ro-unwanted-dialog .ro-gear-toolbar,#ro-unwanted-dialog .ro-gear-actions,#ro-unwanted-dialog .ro-gear-tabs{display:flex;align-items:center;flex-wrap:wrap;gap:5px}
      #ro-unwanted-dialog .ro-equipment-filter>.ro-gear-toolbar button,#ro-unwanted-dialog .ro-gear-actions button,#ro-unwanted-dialog .ro-gear-tabs button,#ro-unwanted-dialog .ro-gear-settings{background:#1a2940;color:#e5edf8;border:1px solid #415573;border-radius:6px;padding:7px 10px}
      #ro-unwanted-dialog .ro-gear-actions{padding-bottom:10px;border-bottom:1px solid #415573;margin-bottom:10px}#ro-unwanted-dialog .ro-gear-actions span{color:#bac9dc;font-size:12px}
      #ro-unwanted-dialog .ro-gear-tabs button.active{background:#b9e5d1;color:#12332c}#ro-unwanted-dialog .ro-gear-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
      #ro-unwanted-dialog .ro-gear-card{border:1px solid #415573;border-radius:9px;background:#152238;padding:12px;min-width:0}#ro-unwanted-dialog .ro-gear-card header{display:flex;align-items:center;gap:8px}#ro-unwanted-dialog .ro-gear-card header img{width:36px;height:36px;object-fit:contain;image-rendering:pixelated}#ro-unwanted-dialog .ro-gear-card header b{flex:1}
      #ro-unwanted-dialog .ro-gear-card .ro-gear-settings{margin-left:auto}#ro-unwanted-dialog .ro-gear-settings.configured{outline:2px solid #b9e5d1}#ro-unwanted-dialog .ro-gear-tier{display:flex;align-items:baseline;gap:6px;margin-top:7px;color:#b9e5d1}#ro-unwanted-dialog .ro-gear-tier button{flex:none;background:#b9e5d1;color:#12332c;border:1px solid #b9e5d1;border-radius:5px;padding:3px 8px}#ro-unwanted-dialog .ro-gear-tier button.excluded{background:#4a2731;color:#ffc7c7;border-color:#a96170;text-decoration:line-through}#ro-unwanted-dialog .ro-gear-card ul{padding-left:18px;font-size:12px;color:#bac9dc;line-height:1.6}
      #ro-unwanted-dialog .ro-equipment-filter .ro-filter-multi-list{color:#172238;width:400px}#ro-unwanted-dialog .ro-equipment-filter summary{color:#172238}#ro-unwanted-dialog .ro-gear-detail-backdrop{position:absolute;inset:0;background:#000a;display:flex;align-items:center;justify-content:center;padding:16px;z-index:5}#ro-unwanted-dialog .ro-gear-detail-panel{background:#f5f7fc;color:#172238;border:2px solid #738ab4;padding:18px;border-radius:10px;width:min(1000px,95vw);max-height:85vh;overflow:auto}#ro-unwanted-dialog .ro-gear-detail-field{display:flex;align-items:center;flex-wrap:nowrap;gap:8px;min-width:0}#ro-unwanted-dialog label.ro-gear-skill{display:flex;flex-wrap:nowrap;gap:5px}#ro-unwanted-dialog .ro-gear-skill span:first-of-type{flex:1}#ro-unwanted-dialog .ro-gear-skill input[type=number]{width:90px;flex:none}#ro-unwanted-dialog .ro-gear-error{color:#b02030}
      #ro-unwanted-dialog .ro-rarity-buttons{display:flex;flex-wrap:wrap;gap:4px}#ro-unwanted-dialog .ro-equipment-filter .ro-rarity-buttons button{color:var(--rarity-color);border-color:var(--rarity-color)}#ro-unwanted-dialog .ro-rarity-buttons button.excluded{text-decoration:line-through;opacity:.5}#ro-unwanted-dialog .ro-manage-details{margin-left:auto!important}
      #ro-unwanted-dialog .ro-tier-batch{display:flex;align-items:center;gap:5px}#ro-unwanted-dialog .ro-tier-batch select{width:auto;min-width:95px;background:#1a2940;color:#e5edf8;border:1px solid #415573;border-radius:6px;padding:7px 10px}
      #ro-unwanted-dialog .ro-tier-batch{display:flex;align-items:center;gap:5px;flex-wrap:nowrap}#ro-unwanted-dialog .ro-tier-batch select{width:auto;min-width:100px;background:#1a2940;color:#e5edf8;border:1px solid #415573;border-radius:6px;padding:7px 10px}
      #ro-unwanted-dialog .ro-gear-tier-switches{flex-wrap:wrap;gap:5px;margin-top:9px}#ro-unwanted-dialog .ro-gear-tier-switches button{min-height:34px;min-width:36px}#ro-unwanted-dialog .ro-gear-bonus-preview{margin:7px 0;color:#b9e5d1;font-size:13px;line-height:1.5}#ro-unwanted-dialog .ro-gear-expanded summary{cursor:pointer;color:#bac9dc;font-size:12px;padding:5px 0}#ro-unwanted-dialog .ro-gear-expanded .ro-gear-tier{font-size:12px}#ro-unwanted-dialog .ro-gear-expanded .ro-gear-tier b{flex:0 0 70px;overflow-wrap:anywhere}
      #ro-unwanted-dialog select.ro-gear-filter-select{width:132px;flex:0 1 132px;margin-left:auto;min-width:0;text-overflow:ellipsis}#ro-unwanted-dialog .ro-gear-card header b{min-width:0;overflow-wrap:anywhere}
      #ro-unwanted-dialog .ro-detail-layout{display:grid;grid-template-columns:240px minmax(0,1fr);gap:18px}#ro-unwanted-dialog .ro-detail-list{max-height:55vh;overflow:auto}#ro-unwanted-dialog .ro-detail-list-row{display:flex;align-items:center}#ro-unwanted-dialog .ro-detail-list-row button:first-child{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#ro-unwanted-dialog .ro-detail-list-row button.active{background:#b9e5d1}#ro-unwanted-dialog .ro-detail-list-row button:not(:first-child){flex:none;padding:4px}
      #ro-unwanted-dialog .ro-detail-editor{min-width:0}#ro-unwanted-dialog .ro-gear-detail-field>b{flex:0 0 105px}#ro-unwanted-dialog .ro-gear-actions span:empty{display:none}#ro-unwanted-dialog .ro-selected-skills{margin:5px 0 12px}
      @media(max-width:700px){#ro-unwanted-dialog .ro-detail-layout{grid-template-columns:minmax(0,1fr)}#ro-unwanted-dialog .ro-detail-list{max-height:160px}#ro-unwanted-dialog .ro-gear-grid{grid-template-columns:minmax(0,1fr)}}
      #ro-character-details-toggle{position:fixed;z-index:8;pointer-events:auto;padding:5px 9px;border:1px solid #738ab4;border-radius:5px;background:#172238ed;color:#e8eef8;font:12px sans-serif;cursor:pointer}
      #ro-character-details{position:fixed;left:12px;top:20vh;width:min(420px,calc(100vw - 24px));max-height:70vh;overflow:auto;box-sizing:border-box;z-index:2147483646;padding:12px;border:1px solid #738ab4;border-radius:8px;background:#172238f5;color:#e8eef8;font:13px sans-serif;pointer-events:auto;box-shadow:0 6px 24px #0009}
      #ro-character-details header{display:flex;justify-content:space-between;align-items:center;gap:8px}#ro-character-details button{cursor:pointer;padding:4px 10px}#ro-character-details p{font-size:12px;color:#b9c8e4;line-height:1.5}
      #ro-character-details [data-character-stats]>div,#ro-character-details [data-character-raw]>div{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px solid #738ab433}#ro-character-details b{white-space:nowrap;font-variant-numeric:tabular-nums}#ro-character-details summary{cursor:pointer;margin-top:12px}#ro-character-details [data-character-raw]{overflow-wrap:anywhere}
      [data-ro-ap-enabled]{outline:2px solid #65edb1!important;outline-offset:2px}
      #smith-list [data-ro-smith-filtered]{display:none!important}
      #sf-list [data-ro-star-filtered]{display:none!important}
      [data-ro-inventory-categories]{display:contents}#cp-inv-filters [hidden],#ks-filt [hidden]{display:none!important}[data-ro-inventory-subtypes]{display:flex;gap:4px;flex:0 0 100%;order:1;min-width:0;max-width:100%;overflow-x:auto;flex-wrap:nowrap;margin:4px 0 8px}[data-ro-inventory-subtypes] button{flex:none;white-space:nowrap}[data-ro-gear-details]{font-size:11px;line-height:1.5;white-space:normal;overflow-wrap:anywhere;color:var(--ro-text,#24304f)}#cp-eq-list .cand-info{min-width:0}#cp-eq-list .cand-side{flex:none}[data-ro-card-preview]{font-size:12px;line-height:1.5;padding-top:6px}[data-ro-gs-preview]{display:block;font-size:10px}
      #smith-filters{flex-wrap:wrap}
      #ro-auto-refine,#ro-auto-star{display:inline-flex;align-items:center;gap:6px;margin-right:8px;flex-wrap:wrap}
      #ro-auto-star[hidden]{display:none!important}
      #ro-auto-refine-target,#ro-auto-star-target{padding:6px;border:1px solid #a0aec7;border-radius:4px;font:inherit}
      #ro-unwanted-dialog{position:fixed;inset:0;z-index:2147483647;background:#0009;display:flex;align-items:center;justify-content:center;padding:16px;font:14px sans-serif;color:#172238}
      #ro-unwanted-dialog .ro-filter-panel{background:#f5f7fc;border:2px solid #738ab4;border-radius:10px;padding:18px;width:min(1440px,96vw);max-width:100%;max-height:90vh;overflow:auto;box-sizing:border-box}
      #ro-unwanted-dialog h3{margin:0 0 10px}#ro-unwanted-dialog p{line-height:1.5}
      #ro-unwanted-dialog input,#ro-unwanted-dialog select{max-width:100%;padding:6px;margin:4px;border:1px solid #a0aec7;border-radius:4px;background:white;color:#172238;font:inherit}
      #ro-unwanted-dialog input[type=number]{width:90px}#ro-unwanted-dialog label{display:inline-flex;align-items:center;flex-wrap:wrap}
      #ro-unwanted-dialog button{margin:4px}
      #ro-unwanted-dialog .ro-filter-multi{position:relative;display:inline-block;width:240px;max-width:100%;min-width:0;flex:0 1 240px;margin:4px}
      #ro-unwanted-dialog .ro-filter-field{display:inline-flex;align-items:center;flex-wrap:wrap;max-width:100%;min-width:0}
      #ro-unwanted-dialog .ro-filter-multi summary{cursor:pointer;border:1px solid #a0aec7;border-radius:4px;background:white;padding:6px;width:100%;box-sizing:border-box;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #ro-unwanted-dialog .ro-filter-multi-list{position:fixed;z-index:2147483647;min-width:0;width:320px;max-width:calc(100vw - 24px);box-sizing:border-box;max-height:300px;overflow:auto;background:white;border:1px solid #738ab4;box-shadow:0 4px 12px #0004;padding:6px}
      #ro-unwanted-dialog .ro-filter-multi-list label{display:flex;flex-wrap:nowrap;margin:3px;cursor:pointer;white-space:normal;overflow-wrap:anywhere}
      #ro-unwanted-dialog .ro-filter-multi-list input{flex:none}
      #picker[data-ro-ap-hidden]{visibility:hidden!important;pointer-events:none!important}
      #ro-ap-menu{position:fixed;z-index:2147483647;background:#172238;color:#fff;border:1px solid #738ab4;border-radius:8px;padding:6px;box-shadow:0 6px 24px #0009;font:14px sans-serif;min-width:180px}
      #ro-ap-menu>div{padding:7px 10px;color:#b9c8e4;max-width:280px;overflow-wrap:anywhere}
      #ro-ap-menu button{display:block;width:100%;padding:10px 14px;color:#fff;background:#2c4365;border:0;border-radius:5px;text-align:left;cursor:pointer;font:inherit}
      #ro-ap-menu button:hover{background:#3b5f88}
      #ro-ap-toast{position:fixed;left:50%;top:16%;transform:translateX(-50%);z-index:2147483647;max-width:85vw;background:#172238ed;color:#d8ffe9;border:1px solid #65edb1;border-radius:8px;padding:10px 16px;font:14px sans-serif;pointer-events:none}

      html.touch #skillbar,html.touch #runitems{pointer-events:auto}
      #ro-safari-diagnostics-open{position:fixed;left:max(6px,env(safe-area-inset-left));bottom:max(6px,env(safe-area-inset-bottom));z-index:2147483647;pointer-events:auto;min-height:32px;padding:5px 8px;border:1px solid #8b9cb5;border-radius:6px;background:#172238;color:#fff;font:12px sans-serif}
      #ro-safari-diagnostics{position:fixed;inset:8px;inset:max(8px,env(safe-area-inset-top)) 8px max(8px,env(safe-area-inset-bottom));z-index:2147483647;box-sizing:border-box;background:#142033;color:#fff;border:1px solid #8b9cb5;border-radius:8px;padding:12px;overflow:auto;pointer-events:auto;font:14px/1.4 sans-serif}
      #ro-safari-diagnostics button,#ro-safari-diagnostics select{min-height:40px;font-size:16px;margin:3px;padding:6px}
      #ro-safari-diagnostics textarea{display:block;box-sizing:border-box;width:100%;height:55vh;min-height:140px;font:12px/1.4 monospace;background:#fff;color:#172238;user-select:text;-webkit-user-select:text;-webkit-touch-callout:default;pointer-events:auto}
      @media(pointer:coarse){
        #skillbar,#runitems{pointer-events:auto}
        #skillbar .skill-slot[data-skill],#runitems .run-slot[data-item],#lu-sockets .skill-slot[data-skill],#lu-sockets .run-slot[data-item]{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;touch-action:manipulation}
        #ro-ap-menu button,#ro-unwanted-dialog button,#ro-unwanted-dialog summary,#ro-character-details button{min-height:44px;touch-action:manipulation}
        #ro-horde-hud [data-monster-toggle]{min-width:28px;min-height:28px}
        #ro-character-details-toggle{min-height:36px}
        #ro-unwanted-dialog input,#ro-unwanted-dialog select{font-size:16px}
      }
      @media(max-width:700px),(pointer:coarse) and (max-height:500px){
        #ro-unwanted-dialog{padding:6px;padding-top:max(6px,env(safe-area-inset-top));padding-bottom:max(6px,env(safe-area-inset-bottom));box-sizing:border-box}
        #ro-unwanted-dialog .ro-filter-panel.ro-equipment-filter{width:100%;max-height:calc(100dvh - 12px);padding:10px;overscroll-behavior:contain}
        #ro-unwanted-dialog .ro-gear-grid{grid-template-columns:minmax(0,1fr);gap:8px}
        #ro-unwanted-dialog .ro-gear-card{padding:8px}
        #ro-unwanted-dialog .ro-gear-card header{flex-wrap:wrap;gap:4px}
        #ro-unwanted-dialog .ro-gear-card header b{flex:1;min-width:90px}
        #ro-unwanted-dialog select.ro-gear-filter-select{flex:0 0 100%;width:100%;margin:4px 0 0}
        #ro-unwanted-dialog .ro-gear-tabs{flex-wrap:nowrap;overflow-x:auto;padding:4px 0;overscroll-behavior-x:contain}
        #ro-unwanted-dialog .ro-gear-tabs button{flex:none;white-space:nowrap;margin:0}
        #ro-unwanted-dialog .ro-gear-toolbar button,#ro-unwanted-dialog .ro-gear-actions button{margin:2px;padding:6px 8px}
        #ro-unwanted-dialog .ro-manage-details{margin-left:2px!important}
        #ro-unwanted-dialog .ro-gear-detail-backdrop{position:fixed;padding:6px;box-sizing:border-box}
        #ro-unwanted-dialog .ro-gear-detail-panel{width:100%;box-sizing:border-box;max-height:calc(100dvh - 12px);padding:10px;overscroll-behavior:contain}
        #ro-unwanted-dialog .ro-detail-layout{grid-template-columns:minmax(0,1fr);gap:10px}
        #ro-unwanted-dialog .ro-detail-list{max-height:140px}
        #ro-unwanted-dialog .ro-gear-detail-field>b{flex:0 0 82px;font-size:12px}
        #ro-unwanted-dialog .ro-filter-multi{margin:4px 0;flex:1;min-width:0}
        #ro-unwanted-dialog .ro-gear-skill input[type=number]{width:72px;box-sizing:border-box}
        #ro-unwanted-dialog .ro-gear-tier span{min-width:0;overflow-wrap:anywhere}
        #ro-ap-menu{box-sizing:border-box;min-width:0;width:240px;max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px);overflow:auto}
        #ro-ap-menu button+button{margin-top:6px}
        #ro-character-details{left:max(6px,env(safe-area-inset-left));top:max(6px,env(safe-area-inset-top));width:calc(100vw - 12px);max-height:calc(100dvh - 12px);padding:10px;overscroll-behavior:contain}
        #ro-character-details [data-character-stats]>div,#ro-character-details [data-character-raw]>div{gap:8px}
        #ro-character-details [data-character-stats] span,#ro-character-details [data-character-raw] span{min-width:0;overflow-wrap:anywhere}
        #lu-feed.land{bottom:calc(max(6px,env(safe-area-inset-bottom)) + 140px)!important}#ro-horde-hud{font-size:10px;padding:4px 5px}#ro-horde-hud [data-monster-total]{margin-top:3px;padding-top:3px}#ro-horde-hud [data-horde-progress]{font-size:11px}
        #ro-ap-toast{box-sizing:border-box;max-width:calc(100vw - 20px);font-size:13px;padding:8px 10px}
        .stg-mobs .ro-timed-mob{min-width:90px;max-width:130px;padding:5px}
      }
    `;
    document.head.append(style);
    safariDiagnostics?.mount();
    document.addEventListener('pointerdown',advancedManualInput,true);
    document.addEventListener('touchstart',advancedManualInput,{capture:true,passive:true});
    window.addEventListener('keydown',advancedManualInput,true);
    document.addEventListener('contextmenu', touchContext, true);
    document.addEventListener('pointerdown',beginLongPress,true);
    document.addEventListener('pointermove',moveLongPress,true);
    document.addEventListener('pointerup',endLongPress,true);
    document.addEventListener('pointercancel',endLongPress,true);
    document.addEventListener('touchstart',startTouchPress,{capture:true,passive:true});
    document.addEventListener('touchmove',moveTouchPress,{capture:true,passive:true});
    document.addEventListener('touchend',finishTouchPress,{capture:true,passive:true});
    document.addEventListener('touchcancel',finishTouchPress,{capture:true,passive:true});
    document.addEventListener('click',suppressHeldEvent,true);
    document.addEventListener('scroll',cancelLongPress,true);
    window.addEventListener('blur',()=>{touchUiActive=false;clearLongPress();});
    window.addEventListener('resize',()=>{cancelLongPress();closeMenu();closeFilterMenus();});
    window.visualViewport?.addEventListener('resize',()=>{cancelLongPress();closeMenu();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){touchUiActive=false;clearLongPress();closeMenu();}});
    document.addEventListener('click',event=>{
      if(autoStar.active&&!autoStar.clicking&&event.target instanceof Element&&
        (event.target.closest('#sf-close, #starforge [data-sft], #sf-go')||event.composedPath().some(node=>node.id==='sf-list')))stopAutoStar();
      if(keepOffline&&event.target instanceof Element&&event.target.closest('#lobby-online')){
        event.preventDefault();event.stopImmediatePropagation();notify('保持離線遊玩已開啟；可到選項 → 遊戲關閉');return;
      }
      if(!autoRefine.active||!(event.target instanceof Element))return;
      if(event.target.closest('#smith-close'))stopAutoRefine();
      const row=event.target.closest('#smith-list .cand[data-uid]');
      if(row&&row.dataset.uid!==autoRefine.uid)stopAutoRefine('已切換裝備，自動精煉停止');
    },true);
    document.addEventListener('pointerdown', e => { if (!menu?.contains(e.target)) closeMenu(); }, true);
    document.addEventListener('keydown', e => {
      if(characterDetails&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeCharacterDetails();return;}
      if(filterDialog){
        // The game's Escape/number handlers must not react behind this modal.
        e.stopImmediatePropagation();
        if(e.key==='Escape'){e.preventDefault();const menu=filterDialog.querySelector('.ro-filter-multi[open]');if(menu)menu.closeMenu();else if(gearDetails)closeGearDetails();else closeFilter();}
        return;
      }
      if (e.key === 'Escape') {
        if(autoStar.active)stopAutoStar();
        if(autoRefine.active)stopAutoRefine();
        closeMenu();
        if (job) {
          document.querySelectorAll('#pk-cards .pk-card').forEach(card => manualCards.add(card));
          cancel(); notify('已中止本次自動選擇');
        }
      }
    }, true);
    window.addEventListener('keydown',e=>{
      if(characterDetails&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeCharacterDetails();return;}
      if(filterDialog){e.stopImmediatePropagation();if(e.key==='Escape'){e.preventDefault();const menu=filterDialog.querySelector('.ro-filter-multi[open]');if(menu)menu.closeMenu();else if(gearDetails)closeGearDetails();else closeFilter();}}
    },true);
    window.addEventListener('blur', closeMenu);
    new MutationObserver(records => {
      // The game hides #hud when destroying a run and shows it for a new run.
      // oldValue also detects a hide/show pair within the same mutation batch.
      if (records.some(r => r.type === 'attributes' && r.target.id === 'hud' && r.attributeName === 'class'
        && /(?:^|\s)hidden(?:\s|$)/.test(r.oldValue || '') !== r.target.classList.contains('hidden'))) resetRun();
      const relevant = records.some(r => {
        // DOMTokenList can emit a class mutation even when add/toggle leaves
        // the value unchanged. Never schedule another scan for that no-op.
        if(r.type==='attributes'&&r.attributeName==='class'&&r.oldValue===r.target.getAttribute('class'))return false;
        const el = r.target instanceof Element ? r.target : r.target.parentElement;
        if(el?.closest('#chr-perks'))return true;
        if((r.type==='attributes'&&el?.matches('.overlay,dialog'))||[...(r.addedNodes||[]),...(r.removedNodes||[])].some(n=>n instanceof Element&&(n.matches('.overlay,dialog')||n.querySelector('.overlay,dialog'))))return true;
        if(r.type==='attributes'&&!['class','src'].includes(r.attributeName))return false;
        return (el===document.body&&r.type==='attributes'&&r.attributeName==='class')||el?.closest('#lobby-ui, #lap-tabs, #stages, #stg-detail, #stg-list, #picker, #skillbar, #runitems, #smith, #starforge, #shop-quality, #shop-filters, #opt-body, #opt-tabs, #lobby-online, #npc-text, #npc-options, #pause, #charpanel, #kstorage, #trade, #tr-inv, #tr-filters') || [...r.addedNodes].some(n => n instanceof Element && (n.matches('#lap-tabs, #stages, #stg-detail, #stg-list, #picker, #skillbar, #runitems, #smith, #starforge, #shop-quality, #opt-body, #opt-tabs, #lobby-online, #pause, #charpanel, #kstorage, #trade, #tr-inv, #tr-filters') || n.querySelector('#lap-tabs, #stages, #stg-detail, #stg-list, #picker, #skillbar, #runitems, #smith, #starforge, #shop-quality, #opt-body, #opt-tabs, #lobby-online, #pause, #charpanel, #kstorage, #trade, #tr-inv, #tr-filters')));
      });
      if (relevant) schedule();
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['class', 'src', 'hidden', 'open', 'style', 'aria-hidden'] });
    scan();
    installGameHooks();
    // Recover overlays independently of native ticks and DOM observer timing.
    function refreshBattleOverlays(){
      if(activeGame&&!pickerIsOpen()&&!touchUiIsQuiet()){
        runHelperHook(activeGame,'怪物統計',()=>updateHordeHud(activeGame));
        runHelperHook(activeGame,'角色資料',updateCharacterDetails);
      }
      setTimeout(refreshBattleOverlays,250)?.unref?.();
    }
    setTimeout(refreshBattleOverlays,250)?.unref?.();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
