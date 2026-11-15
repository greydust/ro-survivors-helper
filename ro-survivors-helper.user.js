// ==UserScript==
// @name         RO倖存者助手
// @namespace    greydust.ro.auto-pick
// @license      MIT
// @version      1.9.0
// @description  右鍵自動選擇技能／道具，每關重設；勝利後觸發一次全圖磁鐵拾取。
// @match        https://ro.hans-webgametw.com/*
// @run-at       document-start
// @grant        none
// @sandbox      raw
// ==/UserScript==

(() => {
  'use strict';
  const OFFLINE_KEY='greydust.ro.keep-offline.v1';
  let keepOffline=false;
  try{keepOffline=localStorage.getItem(OFFLINE_KEY)==='true';}catch{}
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
      if(isLobbySocket(args[0])){lobbySockets.add(socket);socket.addEventListener('close',()=>lobbySockets.delete(socket),{once:true});}
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
  let showHordeRing=false;
  try{hideMinimapMagnets=localStorage.getItem(MINIMAP_MAGNET_KEY)==='true';}catch{}
  try{showHordeRing=localStorage.getItem(HORDE_RING_KEY)==='true';}catch{}
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
    if(!showHordeRing)return;
    const ring=hordeRingGeometry(activeGame,image,crop);if(!ring)return;
    context.save();
    try{
      context.setTransform(1,0,0,1,0,0);context.globalAlpha=.9;context.strokeStyle='#5de7ff';
      const dpr=Math.min(2,window.devicePixelRatio||1);context.lineWidth=1.3*dpr;
      context.setLineDash([]);context.beginPath();context.ellipse(ring.x,ring.y,ring.rx,ring.ry,0,0,Math.PI*2);context.stroke();
      context.globalAlpha=.55;context.setLineDash([3*dpr,3*dpr]);context.beginPath();context.ellipse(ring.x,ring.y,ring.outerX,ring.outerY,0,0,Math.PI*2);context.stroke();
    }finally{context.restore();}
  }
  const patchedMinimapContexts=new WeakSet();
  function patchMinimapContext(context){
    if(!context||patchedMinimapContexts.has(context))return;
    if(!['beginPath','arc','stroke','fillRect'].every(key=>typeof context[key]==='function'))return;
    patchedMinimapContexts.add(context);
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
      checkbox.onchange=()=>{showHordeRing=checkbox.checked;try{localStorage.setItem(HORDE_RING_KEY,String(showHordeRing));}catch{notify('設定無法保存，目前只在本分頁有效');}};
      const toggle=document.createElement('i');toggle.className='opt-switch';label.append(text,checkbox,toggle);magnetRow.after(label);
    }
    const ringInput=document.querySelector('[data-ro-show-horde-ring]');if(ringInput)ringInput.checked=showHordeRing;
  }
  installMinimapGate();
  const SLOT = '#skillbar .skill-slot[data-skill], #runitems .run-slot[data-item], #lu-sockets .skill-slot[data-skill], #lu-sockets .run-slot[data-item]';
  const COLORS = ['#9aa6c4', '#3ddc5a', '#2f7bff', '#a040ff', '#ff9a2e'];
  let rules = [];
  let menu, toast, job = null, scheduled = false;
  const manualCards = new WeakSet();
  const victoryCollected = new WeakSet();
  const fastHooked = new WeakSet();
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
    button.disabled=!autoRefine.active&&(!state||go.disabled||autoRefine.target<=state.level);
    select.disabled=autoRefine.active;
  }
  let smithManifestItems = null;
  const smithIconIndex = new Map(), smithPathCache = new Map();
  const SMITH_FILTERS = [
    ['twohand', '雙手武'], ['onehand', '單手武'], ['shield', '盾牌'],
    ['head_top', '頭部（上）'],
    ['armor', '護甲'], ['garment', '披肩'], ['shoes', '鞋子']
  ];

  // Merchant rules operate on raw affixes, never rendered bonuses/card effects.
  const FILTER_KEY = 'greydust.ro.unwanted.v1';
  const PRIMARY = [['str','STR'],['agi','AGI'],['vit','VIT'],['int','INT'],['dex','DEX'],['luk','LUK']];
  const SECOND3 = [['crit','爆擊'],['cd','急速'],['area','範圍'],['pierce','穿透機率']];
  const SECOND4 = [['spd','移動速度'],['flee','Flee'],['armor','護甲'],['hp','最大 HP']];
  const GEAR_SLOTS = [['weapon','武器'],['twohand','雙手武'],['onehand','單手武'],['shield','盾牌'],['head_top','頭部（上）'],['head_mid','頭部（中）'],['head_low','頭部（下）'],['armor','護甲'],['garment','披肩'],['shoes','鞋子'],['acc','飾品']];
  const RARITIES=[['0','普通'],['1','優良'],['2','稀有'],['3','史詩'],['4','傳說']];
  const RULE_TYPES = [['rarity','稀有度'],['tier','Tier'],['slot','部位與基底'],['primary','屬性'],['secondary','副屬性'],['skill','技能傷害'],['not','NOT'],['and','AND'],['or','OR']];
  const newProfile = () => ({id: String(Date.now()) + Math.random().toString(36).slice(2),name:'未命名過濾器',rule:null});
  let filterStore = {version:1,activeId:'',profiles:[]}, filterDraft = null, filterDialog = null;
  const collapsedRules=new WeakSet();
  const selections=value=>Array.isArray(value)?value:(value===undefined||value===null||value===''?[]:[value]);
  function validRule(node, depth=0, budget={left:200}) {
    if (!node || typeof node !== 'object' || depth>8 || --budget.left<0) return false;
    const oneOf=(value,options)=>selections(value).length<=options.length&&selections(value).every(entry=>typeof entry==='string'&&options.some(([id])=>id===entry));
    if (node.type==='rarity') return selections(node.values).length>0&&oneOf(node.values,RARITIES);
    if (node.type==='tier') return ['<=','=','>='].includes(node.op) && Number.isInteger(node.value) && node.value>=1 && node.value<=10000;
    if (node.type==='slot') return GEAR_SLOTS.some(([id])=>id===node.slot) && selections(node.base).length<=1000&&selections(node.base).every(id=>(typeof id==='string'||Number.isInteger(id))&&/^\d+$/.test(String(id)));
    if (node.type==='primary') return selections(node.first).length>0&&oneOf(node.first,PRIMARY)&&oneOf(node.second,PRIMARY)&&(!selections(node.second).length||selections(node.first).some(a=>selections(node.second).some(b=>a!==b)));
    if (node.type==='secondary') return !!(selections(node.third).length||selections(node.fourth).length) && oneOf(node.third,SECOND3) && oneOf(node.fourth,SECOND4);
    if (node.type==='skill') return selections(node.skill).length>0&&selections(node.skill).length<=500&&selections(node.skill).every(id=>typeof id==='string'&&id.length>0&&id.length<100);
    if (['not','and','or'].includes(node.type)) return Array.isArray(node.children)
      && (node.type==='not'?node.children.length===1:node.children.length>=1)
      && node.children.length<=50 && node.children.every(child=>validRule(child,depth+1,budget));
    return false;
  }
  function matchesRule(node,item) {
    if (!validRule(node) || !item || !Array.isArray(item.affixes) || !smithDefs?.[item.itemId]) return false;
    // Unknown legacy tiers are never guessed, including inside a NOT expression.
    const needsTier=n=>n.type==='tier'||(n.children||[]).some(needsTier);
    if (needsTier(node) && (!Number.isInteger(item.tier)||item.tier<1)) return false;
    const needsRarity=n=>n.type==='rarity'||(n.children||[]).some(needsRarity);
    if(needsRarity(node)&&(!Number.isInteger(item.quality??0)||(item.quality??0)<0||(item.quality??0)>4))return false;
    const evaluate=n=>{
      if(n.type==='and')return n.children.every(evaluate);
      if(n.type==='or')return n.children.some(evaluate);
      if(n.type==='not')return !evaluate(n.children[0]);
      if(n.type==='rarity')return selections(n.values).includes(String(item.quality??0));
      if(n.type==='tier')return n.op==='<='?item.tier<=n.value:n.op==='>='?item.tier>=n.value:item.tier===n.value;
      if(n.type==='slot') {
        const def=smithDefs[item.itemId];
        return (n.slot==='weapon'?def.slot==='weapon':smithCategory(def)===n.slot)&&(!selections(n.base).length||selections(n.base).some(id=>String(item.itemId)===String(id)));
      }
      const has=stat=>item.affixes.some(affix=>affix.stat===stat);
      if(n.type==='primary')return selections(n.first).some(a=>has(a)&&(!selections(n.second).length||selections(n.second).some(b=>a!==b&&has(b))));
      if(n.type==='secondary')return (!selections(n.third).length||selections(n.third).some(has))&&(!selections(n.fourth).length||selections(n.fourth).some(has));
      if(n.type==='skill')return item.affixes.some(affix=>affix.stat==='skill'&&selections(n.skill).includes(affix.skill));
      return false;
    };
    return evaluate(node);
  }
  function loadFilterStore() {
    try {
      const saved=JSON.parse(localStorage.getItem(FILTER_KEY)||'null');
      if(saved?.version===1 && Array.isArray(saved.profiles) && saved.profiles.length<=50) {
        filterStore={version:1,activeId:String(saved.activeId||''),profiles:saved.profiles.filter(p=>p&&typeof p.id==='string'&&typeof p.name==='string'&&(p.rule===null||validRule(p.rule)))};
      }
    } catch(error){console.warn('[RO助手] 商人過濾器設定讀取失敗',error);}
    if(!filterStore.profiles.length)filterStore.profiles.push(newProfile());
    if(!filterStore.profiles.some(p=>p.id===filterStore.activeId))filterStore.activeId=filterStore.profiles[0].id;
  }
  const currentProfile=store=>store.profiles.find(p=>p.id===store.activeId)||store.profiles[0];
  const copy=value=>JSON.parse(JSON.stringify(value));
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
    const rule=currentProfile(filterStore)?.rule;
    if(!validRule(rule)){openFilter();notify('請先設定並儲存一條完整規則');return;}
    let captured;
    try{captured=captureMerchantInventory();}catch(error){console.warn('[RO助手] 讀取商人清單失敗',error);notify('讀取商人清單失敗，未變更選取');return;}
    if(!captured){notify('無法讀取商人裝備資料，未變更選取');return;}
    const {inventory,selection}=captured;
    const byId=new Map(inventory.map(item=>[item.uid,item]));
    const cells=[...document.querySelectorAll('#shop-items [data-uid]')];
    if(cells.some(cell=>!byId.has(cell.dataset.uid))){notify('商人資料與清單不一致，未變更選取');return;}
    const targets=cells.filter(cell=>!cell.classList.contains('worn')&&!cell.classList.contains('safe'))
      .map(cell=>byId.get(cell.dataset.uid)).filter(item=>!item.safe&&!item.owner&&!smithDefs[item.itemId]?.starter&&matchesRule(rule,item)).map(item=>item.uid);
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
  function formSelect(options,value,onchange,placeholder='請選擇') {
    const select=document.createElement('select');
    for(const [id,name] of [['',placeholder],...options]){const option=document.createElement('option');option.value=id;option.textContent=name;if(String(id)===String(value||''))option.selected=true;select.append(option);}
    select.onchange=()=>onchange(select.value);return select;
  }
  function formButton(text,action) {const button=document.createElement('button');button.type='button';button.className='ro-btn small';button.textContent=text;button.onclick=action;return button;}
  function formMulti(options,value,onchange,placeholder='不限') {
    const details=document.createElement('details');details.className='ro-filter-multi';
    const summary=document.createElement('summary'),list=document.createElement('div');list.className='ro-filter-multi-list';details.append(summary,list);
    let selected=selections(value).map(String);
    const refresh=()=>{const names=options.filter(([id])=>selected.includes(String(id))).map(([,name])=>name.split(' ｜ ')[0]);summary.textContent=names.length?names.join('、')+'（OR）':placeholder;};
    const clear=formButton('清除選擇',()=>{selected=[];list.querySelectorAll('input').forEach(input=>input.checked=false);refresh();onchange([]);});list.append(clear);
    for(const [id,name,metadata]of options){
      const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=id;input.checked=selected.includes(String(id));
      input.onchange=()=>{selected=input.checked?[...new Set([...selected,String(id)])]:selected.filter(entry=>entry!==String(id));refresh();onchange([...selected]);};
      label.append(input);
      if(metadata){
        const content=document.createElement('span');content.className='ro-filter-base-info';content.append(document.createTextNode(metadata.name+' '));
        const tags=document.createElement('span');tags.className='wk-star ro-filter-tier-tags';
        for(const tier of metadata.tiers){const tag=document.createElement('em');tag.textContent='T'+tier;tags.append(tag);}
        content.append(tags);
        if(!metadata.tiers.length)content.append(document.createTextNode(metadata.tierNote));
        content.append(document.createTextNode(' ｜ '+metadata.bonuses));label.append(content);
      }else label.append(document.createTextNode(name));
      list.append(label);
    }
    refresh();return details;
  }
  function nodeDefault(type){return ['and','or'].includes(type)?{type,children:[{type:'tier',op:'<=',value:null},{type:'tier',op:'<=',value:null}]}:type==='not'?{type,children:[{type:'tier',op:'<=',value:null}]}:{type};}
  function baseOptions(slot) {
    if(!smithDefs||!smithAssets?.manifest?.items)return [];
    return Object.entries(smithDefs).filter(([,def])=>slot==='weapon'?def.slot==='weapon':smithCategory(def)===slot)
      .filter(([id])=>smithAssets.manifest.items[id]&&baseDropTiers(Number(id)).length>0).map(([id])=>{
        const name=gameCatalog?.bp?.(Number(id),'')||smithAssets.manifest.items[id].name||`#${id}`;
        const info=baseDisplay(Number(id));
        return {id,name,label:`${name} ｜ ${baseDetails(Number(id))}`,metadata:{name,...info}};
      }).sort((a,b)=>a.name.localeCompare(b.name,'zh-Hant')).map(item=>[item.id,item.label,item.metadata]);
  }
  const STAGE_TIERS={prontera:1,sewer:1,sunken:1,byalan:2,payon:2,payon_cave:2,prt_castle:2,orcs:3,pyramid:3,maze:3};
  let tierIndexSource=null,tierDropSource=null;
  const baseTierIndex=new Map();
  function baseDropTiers(id){
    const stages=gameCatalog?.ca,drops=gameCatalog?.cb;
    if(!stages||!drops)return [];
    if(tierIndexSource!==stages||tierDropSource!==drops){
      tierIndexSource=stages;tierDropSource=drops;baseTierIndex.clear();
      const add=(itemId,tier)=>{if(!baseTierIndex.has(Number(itemId)))baseTierIndex.set(Number(itemId),new Set());baseTierIndex.get(Number(itemId)).add(tier);};
      // These are the native region tiers, not the independently adjustable
      // difficulty slider labelled 刷關等級. Special shop/event sources are not
      // claimed to be covered by the normal expedition drop table.
      for(const [stageId,tier] of Object.entries(STAGE_TIERS)){
        const stage=stages[stageId];if(!stage)continue;
        const monsters=new Set([...(stage.waves||[]).flatMap(wave=>wave.pool||[]),...(stage.bosses||[]).map(boss=>boss.id)]);
        for(const monster of monsters)for(const drop of drops[monster]||[])add(drop.id,tier);
        if(Number.isInteger(stage.reward))add(stage.reward,tier);
      }
    }
    return [...(baseTierIndex.get(Number(id))||[])].sort((a,b)=>a-b);
  }
  const bonusText=(bonus,multiplier)=>String(bonus.text(multiplier)).replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();
  function tierFormula(bonus){
    const first=bonusText(bonus,1).replace(/^★\s*/,''),second=bonusText(bonus,2).replace(/^★\s*/,'');
    const pattern=/\d+(?:[.,]\d+)?/g,ones=[...first.matchAll(pattern)],twos=[...second.matchAll(pattern)];
    if(ones.length!==twos.length||first.replace(pattern,'#')!==second.replace(pattern,'#'))return first;
    let index=0;
    return first.replace(pattern,token=>{
      const one=Number(token.replace(',','.')),two=Number(twos[index++][0].replace(',','.'));
      if(one!==0&&Math.abs(two-2*one)<1e-8)return one===1?'T':'T×'+token;
      return token;
    });
  }
  function baseDisplay(id){
    const def=smithDefs?.[id];if(!def)return {tiers:[],tierNote:'資料未列',bonuses:'資料未列'};
    const tiers=baseDropTiers(id);
    const text=(def.bonuses||[]).filter(bonus=>typeof bonus?.text==='function').map(bonus=>{
      try{return bonusText(bonus,1);}catch{return '';}
    }).filter(Boolean);
    try{if(typeof gameCatalog?.bs==='function')text.push(...gameCatalog.bs(id,1).map(tierFormula));}catch{ /* Keep known base bonuses. */ }
    return {tiers,tierNote:tiers.length?'':def.starter?'初始裝備':'Tier 未列',bonuses:text.length?text.join('、'):'無額外詞條'};
  }
  function baseDetails(id){
    const info=baseDisplay(id);
    return (info.tiers.length?info.tiers.map(tier=>'[T'+tier+']').join(' '):info.tierNote)+' ｜ '+info.bonuses;
  }
  function damageSkillOptions() {
    try {
      const ids=gameCatalog?.bU?.();
      if(!Array.isArray(ids))return [];
      return [...new Set(ids)].filter(id=>skillDefs?.[id]).map(id=>[id,`${skillDefs[id].name}傷害`]).sort((a,b)=>a[1].localeCompare(b[1],'zh-Hant'));
    } catch{return [];}
  }
  function parseFilterImport(text) {
    if(typeof text!=='string'||text.length>100000)throw new Error('檔案過大');
    const data=JSON.parse(text);
    if(data?.format!=='ro-helper-unwanted'||data.version!==1||typeof data.name!=='string'||!validRule(data.rule))throw new Error('格式或規則不正確');
    const knownSkills=new Set(damageSkillOptions().map(([id])=>id));
    const check=node=>{
      if(node.type==='skill'&&knownSkills.size&&selections(node.skill).some(id=>!knownSkills.has(id)))throw new Error('包含遊戲不能骰出的技能傷害');
      if(node.type==='slot'&&smithDefs){
        for(const id of selections(node.base)){
          const def=smithDefs[id];
          if(!def||(node.slot==='weapon'?def.slot!=='weapon':smithCategory(def)!==node.slot))throw new Error('基底不屬於指定部位');
        }
      }
      (node.children||[]).forEach(check);
    };check(data.rule);return data;
  }
  function ruleEditor(node,setNode,depth=0,onRemove=null,movement=null) {
    const box=document.createElement('div');box.className='ro-filter-rule';
    const header=document.createElement('div');header.className='ro-filter-rule-header';box.append(header);
    const order=document.createElement('span');order.className='ro-filter-order';
    for(const [direction,label]of [['up','↑'],['down','↓']]){
      const button=formButton(label,()=>movement?.[direction]?.());button.disabled=!movement?.[direction];button.setAttribute('data-filter-move',direction);button.setAttribute('aria-label',direction==='up'?'上移規則':'下移規則');order.append(button);
    }header.append(order);
    if(node&&['and','or'].includes(node.type)){
      const collapsed=collapsedRules.has(node);
      const toggle=formButton(collapsed?'+':'−',()=>{if(collapsedRules.has(node))collapsedRules.delete(node);else collapsedRules.add(node);drawFilter();});
      toggle.setAttribute('data-filter-collapse','');toggle.setAttribute('aria-expanded',String(!collapsed));toggle.setAttribute('aria-label',collapsed?'展開規則':'折疊規則');header.append(toggle);
    }
    header.append(formSelect(depth>=8?RULE_TYPES.filter(([id])=>!['and','or','not'].includes(id)):RULE_TYPES,node?.type,type=>{setNode(type?nodeDefault(type):null);drawFilter();},'選擇規則類型'));
    const remove=()=>{if(onRemove){const button=formButton('刪除此子規則',onRemove);button.setAttribute('data-filter-remove','');header.append(button);}};
    if(!node){remove();return box;}
    const subtreeDepth=value=>value?.children?.length?1+Math.max(...value.children.map(subtreeDepth)):0;
    const wrapControl=()=>{
      if(depth+subtreeDepth(node)>=8)return;
      const wrap=formSelect([['and','AND'],['or','OR'],['not','NOT']],null,type=>{
        if(!['and','or','not'].includes(type))return;
        setNode({type,children:[node]});drawFilter();
      },'包入…');
      wrap.setAttribute('data-filter-wrap','');wrap.setAttribute('aria-label','將此規則包入新規則');header.append(wrap);
    };
    const change=()=>{drawFilter();};
    const field=(title,el)=>{const label=document.createElement(el.tagName==='DETAILS'?'div':'label');label.className='ro-filter-field';label.append(document.createTextNode(title+' '),el);header.append(label);};
    if(['and','or','not'].includes(node.type)) {
      remove();
      wrapControl();
      if(collapsedRules.has(node))return box;
      (node.children||[]).forEach((child,index)=>{
        const move=offset=>{const other=index+offset;[node.children[index],node.children[other]]=[node.children[other],node.children[index]];change();};
        const childBox=ruleEditor(child,value=>node.children[index]=value,depth+1,node.type!=='not'?()=>{node.children.splice(index,1);change();}:null,{up:index>0?()=>move(-1):null,down:index<node.children.length-1?()=>move(1):null});
        if(node.type==='not'){
          box.classList.add('ro-filter-not');childBox.classList.add('ro-filter-inline-child');header.append(childBox);
        }else box.append(childBox);
      });
      if(node.type!=='not'&&depth<8&&node.children.length<50)box.append(formButton('＋新增子規則',()=>{node.children.push(null);change();}));
    } else if(node.type==='rarity') {
      field('稀有度',formMulti(RARITIES,node.values,value=>{node.values=value;updateFilterValidity();},'請選擇（可多選）'));
    } else if(node.type==='tier') {
      field('比較',formSelect([['<=','≤'],['=','='],['>=','≥']],node.op||'<=',value=>{node.op=value;change();}));node.op ||= '<=';
      const input=document.createElement('input');input.type='number';input.min='1';input.max='10000';input.step='1';input.value=node.value??'';
      input.oninput=()=>{node.value=input.value===''?null:Number(input.value);updateFilterValidity();};field('Tier',input);
    } else if(node.type==='slot') {
      field('部位',formSelect(GEAR_SLOTS,node.slot,value=>{node.slot=value;node.base='';change();}));
      if(node.slot)field('基底',formMulti(baseOptions(node.slot),node.base,value=>{node.base=value;updateFilterValidity();},'全部基底'));
    } else if(node.type==='primary') {
      field('第一個屬性',formMulti(PRIMARY,node.first,value=>{const hadFirst=selections(node.first).length>0;node.first=value;if(!value.length)node.second=[];if(hadFirst!==!!value.length)change();else updateFilterValidity();},'請選擇（可多選）'));
      if(selections(node.first).length)field('第二個屬性',formMulti(PRIMARY,node.second,value=>{node.second=value;updateFilterValidity();},'不限'));
      else{const disabled=document.createElement('span');disabled.textContent='第二個屬性：請先選第一個屬性';header.append(disabled);}
    } else if(node.type==='secondary') {
      field('第三類詞條',formMulti(SECOND3,node.third,value=>{node.third=value;updateFilterValidity();},'不限'));
      field('第四類詞條',formMulti(SECOND4,node.fourth,value=>{node.fourth=value;updateFilterValidity();},'不限'));
    } else if(node.type==='skill') {
      const options=damageSkillOptions();field('技能傷害',formMulti(options,node.skill,value=>{node.skill=value;updateFilterValidity();},options.length?'請選擇技能（可多選）':'技能資料尚未就緒，請稍後重開'));
    }
    if(!['and','or','not'].includes(node.type)){wrapControl();remove();}
    return box;
  }
  function updateFilterValidity(){
    const rule=currentProfile(filterDraft)?.rule,valid=rule===null||validRule(rule);
    const status=filterDialog?.querySelector('[data-filter-status]');if(status)status.textContent=rule===null?'未設定規則，不會選取任何裝備':valid?'規則完整，可儲存並使用':'規則尚未完整；AND／OR 至少一條、NOT 恰好一條。空白規則不會選取裝備。';
    const save=filterDialog?.querySelector('[data-filter-save]');if(save)save.disabled=!valid;
  }
  function drawFilter(){
    if(!filterDialog||!filterDraft)return;
    const panel=filterDialog.querySelector('.ro-filter-panel');panel.replaceChildren();
    const heading=document.createElement('h3');heading.textContent='不需要裝備過濾器';panel.append(heading);
    const help=document.createElement('p');help.textContent='只有一條根規則；用 AND／OR 組合條件，用 NOT 反向匹配。「不需要」會重新勾選目前商人分類，排除穿著中、保護中與初始裝備，不會自動出售。';panel.append(help);
    panel.append(formSelect(filterDraft.profiles.map(p=>[p.id,p.name]),filterDraft.activeId,id=>{if(id){filterDraft.activeId=id;drawFilter();}},'選擇過濾器'));
    panel.append(formButton('新增',()=>{if(filterDraft.profiles.length>=50){notify('最多保存 50 個過濾器');return;}const p=newProfile();filterDraft.profiles.push(p);filterDraft.activeId=p.id;drawFilter();}),formButton('刪除',()=>{
      filterDraft.profiles=filterDraft.profiles.filter(p=>p.id!==filterDraft.activeId);if(!filterDraft.profiles.length)filterDraft.profiles.push(newProfile());filterDraft.activeId=filterDraft.profiles[0].id;drawFilter();
    }));
    const profile=currentProfile(filterDraft),name=document.createElement('input');name.type='text';name.maxLength=80;name.value=profile.name;name.placeholder='過濾器名稱';name.oninput=()=>profile.name=name.value;panel.append(name);
    panel.append(ruleEditor(profile.rule,value=>profile.rule=value));
    const status=document.createElement('p');status.setAttribute('data-filter-status','');panel.append(status);
    const save=formButton('儲存並套用',()=>{
      if(profile.rule!==null&&!validRule(profile.rule))return;
      // Unfinished inactive profiles are not persisted.
      const next=copy(filterDraft);next.profiles=next.profiles.filter(p=>p.rule===null||validRule(p.rule));next.profiles.forEach(p=>p.name=p.name.trim()||'未命名過濾器');
      try{localStorage.setItem(FILTER_KEY,JSON.stringify(next));filterStore=next;closeFilter();notify('商人過濾器已儲存');}catch{notify('儲存失敗，請匯出備份');}
    });save.setAttribute('data-filter-save','');panel.append(save,formButton('取消',closeFilter));
    panel.append(formButton('匯出此過濾器',()=>{
      if(!validRule(profile.rule)){notify('請先完成規則再匯出');return;}
      const data={format:'ro-helper-unwanted',version:1,name:profile.name,rule:profile.rule};
      const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download=(profile.name||'RO過濾器').replace(/[<>:"/\\|?*]/g,'_')+'.json';link.hidden=true;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }));
    const file=document.createElement('input');file.type='file';file.accept='.json,application/json';file.hidden=true;
    file.onchange=async()=>{
      try{
        const selected=file.files?.[0];if(!selected)return;if(selected.size>100000)throw new Error('檔案過大');
        const data=parseFilterImport(await selected.text());
        if(filterDraft.profiles.length>=50)throw new Error('最多保存 50 個過濾器');
        const p=newProfile();p.name=data.name.slice(0,80);p.rule=copy(data.rule);filterDraft.profiles.push(p);filterDraft.activeId=p.id;drawFilter();notify('已匯入；按儲存並套用後生效');
      }catch(error){notify('匯入失敗：'+error.message);}
    };panel.append(file,formButton('匯入',()=>file.click()));updateFilterValidity();
  }
  function closeFilter(){filterDialog?.remove();filterDialog=null;filterDraft=null;}
  function openFilter(){
    closeFilter();filterDraft=copy(filterStore);filterDialog=document.createElement('div');filterDialog.id='ro-unwanted-dialog';filterDialog.setAttribute('role','dialog');filterDialog.setAttribute('aria-label','不需要裝備過濾器');filterDialog.setAttribute('aria-modal','true');
    const panel=document.createElement('div');panel.className='ro-filter-panel';filterDialog.append(panel);document.body.append(filterDialog);
    filterDialog.onclick=event=>{if(event.target===filterDialog)closeFilter();};drawFilter();
  }

  function smithCategory(definition) {
    if (!definition) return '';
    return definition.slot === 'weapon' ? (twoHandTypes.has(definition.wtype) ? 'twohand' : 'onehand') : definition.slot;
  }
  function smithDefinition(row) {
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
  function nativeSmithAll() {
    const all = document.querySelector('#smith-filters [data-f="all"]');
    if (!all) return;
    smith.switching = true;
    try { all.click(); } finally { smith.switching = false; }
  }
  function updateSmith() {
    updateAutoRefine();
    const panel = document.querySelector('#smith');
    const filters = document.querySelector('#smith-filters');
    const list = document.querySelector('#smith-list');
    if (!panel || panel.classList.contains('hidden') || !filters || !list || !smithDefs || !smithAssets?.manifest?.items) {
      if (!panel || panel.classList.contains('hidden')) { smith.panel = null; smith.category = ''; smith.inventory = []; }
      return;
    }
    if (smith.panel !== panel) {
      smith.panel = panel; smith.category = ''; smith.inventory = [];
      // Populate the complete refinable list once on opening, including equipped
      // and locked pieces exactly as permitted by the game's original filter.
      nativeSmithAll();
    }
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
    let extras = filters.querySelector('[data-ro-smith-extra]');
    if (!extras) {
      extras = document.createElement('span');
      extras.setAttribute('data-ro-smith-extra', '');
      extras.style.display = 'contents';
      for (const [id, label] of SMITH_FILTERS) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'inv-chip'; button.dataset.roSmithCategory = id;
        button.append(document.createTextNode(label + ' '), document.createElement('small'));
        button.onclick = () => {
          smith.category = id;
          nativeSmithAll();
          updateSmith();
        };
        extras.append(button);
      }
      filters.append(extras);
    }
    for (const button of extras.querySelectorAll('button')) {
      const id = button.dataset.roSmithCategory;
      const count = smith.inventory.filter(item => item.category === id).length;
      const small = button.querySelector('small');
      if (small.textContent !== String(count)) small.textContent = String(count);
      button.disabled = count === 0;
      button.classList.toggle('active', smith.category === id);
    }
    if (smith.category) filters.querySelectorAll('[data-f].active').forEach(button => button.classList.remove('active'));
    rows.forEach(row => {
      const category = smith.inventory.find(item => item.uid === row.dataset.uid)?.category;
      const hide = !!smith.category && category !== smith.category;
      row.toggleAttribute('data-ro-smith-filtered', hide);
    });
    let empty = list.querySelector('[data-ro-smith-empty]');
    if (smith.category && !rows.some(row => !row.hasAttribute('data-ro-smith-filtered'))) {
      if (!empty) {
        empty = document.createElement('div'); empty.className = 'empty-note';
        empty.setAttribute('data-ro-smith-empty', ''); empty.textContent = '此分類沒有可強化的裝備'; list.append(empty);
      }
    } else empty?.remove();
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
    if (!game || !game.events || fastHooked.has(game)) return;
    fastHooked.add(game);
    activeGame = game;
    for (const [event, kind, method] of [['onLevelUp', 'skill', 'choose'], ['onChest', 'item', 'chooseChest']]) {
      const original = game.events[event];
      if (typeof original !== 'function' || typeof game[method] !== 'function') continue;
      game.events[event] = function(cards, ...args) {
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
          try { game[method](selected); }
          catch (error) {
            console.warn('[RO助手] 即時自選失敗，恢復手動選擇', error);
            original.call(game.events, cards, ...args);
          }
        });
      };
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

  async function installGameHooks() {
    // Import only the already-loaded shared module: never re-run the main game.
    // Locate the public hook registry by its shape, not its minified export name.
    const link = document.querySelector('link[rel="modulepreload"][href*="soul_linker-"]');
    if (!link) { console.warn('[RO助手] 找不到共用模組，勝利磁鐵未啟用'); return; }
    try {
      const module = await import(new URL(link.getAttribute('href'), location.href).href);
      gameCatalog=module;
      smithDefs = Object.values(module).find(value => value && typeof value === 'object'
        && value[1101]?.slot === 'weapon' && value[2254]?.slot === 'head_top') || null;
      smithAssets = Object.values(module).find(value => value && typeof value === 'object'
        && value.icons instanceof Map && value.itemTextures instanceof Map) || null;
      const nativeTwoHand = Object.values(module).find(value => value instanceof Set && value.has('양손검') && value.has('활'));
      if (nativeTwoHand) twoHandTypes = nativeTwoHand;
      updateSmith();
      skillDefs = Object.values(module).find(value => value && typeof value === 'object'
        && value.atk_sword?.kind === 'weapon' && value.bash?.kind === 'weapon') || null;
      const hooks = Object.values(module).find(value => value && typeof value === 'object'
        && ['start', 'tick', 'hurt', 'damageMult', 'hit', 'kill', 'cast'].every(key => Array.isArray(value[key])));
      if (!hooks) throw new Error('找不到遊戲事件介面');
      hooks.start.push(game => { resetRun(); installFastChoice(game); });
      hooks.tick.push(game => {
        installFastChoice(game);
        try { victoryMagnet(game); }
        catch (error) { console.warn('[RO助手] 勝利磁鐵失敗', error); }
      });
      console.info('[RO助手] 即時自選已啟用 v1.9.0');
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
    return { kind, id: kind === 'skill' ? el.dataset.skill : el.dataset.item, itemId, icon: iconOf(el), name: tipName(el) };
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
  function context(event) {
    const el = event.target instanceof Element ? event.target.closest(SLOT) : null;
    if (!el || el.classList.contains('empty')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    closeMenu();
    const rule = identity(el);
    // Do not guess when a tooltip is missing or the site's DOM has changed.
    if (!rule.icon || !rule.name) { notify('無法辨識此項目；請先將滑鼠移到圖示上再按右鍵'); return; }
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
      rules = rules.filter(r => !sameSlot(r, el));
      if (!enabled) rules.push(rule);
      closeMenu(); scan();
      notify(`${rule.name}：已${enabled ? '關閉' : '開啟'}自動選擇`);
    };
    menu.append(title, button);
    document.body.append(menu);
    const box = menu.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(event.clientX, innerWidth - box.width - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(event.clientY, innerHeight - box.height - 8)) + 'px';
    button.focus({ preventScroll: true });
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
    rules = [];
    cancel();
    closeMenu();
    toast?.remove();
    document.querySelectorAll('[data-ro-ap-enabled]').forEach(el => el.removeAttribute('data-ro-ap-enabled'));
  }
  function scan() {
    updateOfflineUI();
    updateMinimapOption();
    updateSmith();
    updateMerchant();
    // Bottom bars are recreated whenever levels or items change.
    document.querySelectorAll(SLOT).forEach(el => {
      const enabled = rules.some(r => sameSlot(r, el));
      if (enabled) el.setAttribute('data-ro-ap-enabled', '');
      else el.removeAttribute('data-ro-ap-enabled');
    });
    const picker = document.querySelector('#picker');
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
      [data-ro-ap-enabled]{outline:2px solid #65edb1!important;outline-offset:2px}
      #smith-list [data-ro-smith-filtered]{display:none!important}
      #smith-filters{flex-wrap:wrap}
      #ro-auto-refine{display:inline-flex;align-items:center;gap:6px;margin-right:8px;flex-wrap:wrap}
      #ro-auto-refine-target{padding:6px;border:1px solid #a0aec7;border-radius:4px;font:inherit}
      #ro-unwanted-dialog{position:fixed;inset:0;z-index:2147483647;background:#0009;display:flex;align-items:center;justify-content:center;padding:16px;font:14px sans-serif;color:#172238}
      #ro-unwanted-dialog .ro-filter-panel{background:#f5f7fc;border:2px solid #738ab4;border-radius:10px;padding:18px;width:min(1440px,96vw);max-width:100%;max-height:90vh;overflow:auto;box-sizing:border-box}
      #ro-unwanted-dialog h3{margin:0 0 10px}#ro-unwanted-dialog p{line-height:1.5}
      #ro-unwanted-dialog input,#ro-unwanted-dialog select{max-width:100%;padding:6px;margin:4px;border:1px solid #a0aec7;border-radius:4px;background:white;color:#172238;font:inherit}
      #ro-unwanted-dialog input[type=number]{width:90px}#ro-unwanted-dialog label{display:inline-flex;align-items:center;flex-wrap:wrap}
      #ro-unwanted-dialog button{margin:4px}#ro-unwanted-dialog .ro-filter-rule{border-left:3px solid #7394be;border-radius:4px;background:#e7edf7;padding:8px;margin:8px 0 8px 10px}
      #ro-unwanted-dialog .ro-filter-rule small{display:block;color:#475b77;margin:4px}
      #ro-unwanted-dialog .ro-filter-rule-header{display:flex;align-items:center;flex-wrap:wrap;gap:3px}
      #ro-unwanted-dialog .ro-filter-not>.ro-filter-rule-header{align-items:flex-start}
      #ro-unwanted-dialog .ro-filter-inline-child{border:0;margin:0;padding:0;flex:1 1 auto;min-width:0}
      #ro-unwanted-dialog [data-filter-collapse]{min-width:30px;padding:4px 8px;font-weight:bold}
      #ro-unwanted-dialog .ro-filter-order{display:inline-flex;flex:none;gap:1px}
      #ro-unwanted-dialog [data-filter-move]{min-width:26px;padding:4px;margin:1px}
      #ro-unwanted-dialog .ro-filter-multi{position:relative;display:inline-block;max-width:100%;min-width:120px;margin:4px}
      #ro-unwanted-dialog .ro-filter-field{display:inline-flex;align-items:center;flex-wrap:wrap;max-width:100%;min-width:0}
      #ro-unwanted-dialog .ro-filter-multi summary{cursor:pointer;border:1px solid #a0aec7;border-radius:4px;background:white;padding:6px;max-width:360px;overflow-wrap:anywhere}
      #ro-unwanted-dialog .ro-filter-multi-list{position:relative;z-index:3;min-width:0;width:800px;max-width:100%;box-sizing:border-box;max-height:300px;overflow:auto;background:white;border:1px solid #738ab4;box-shadow:0 4px 12px #0004;padding:6px}
      #ro-unwanted-dialog .ro-filter-multi-list label{display:flex;flex-wrap:nowrap;margin:3px;cursor:pointer;white-space:normal;overflow-wrap:anywhere}
      #ro-unwanted-dialog .ro-filter-multi-list input{flex:none}
      #ro-unwanted-dialog .ro-filter-tier-tags{display:inline;font-size:inherit;color:inherit;white-space:nowrap}
      #ro-unwanted-dialog .ro-filter-tier-tags em{font-style:normal;font-size:10px;font-weight:800;padding:0 4px;border-radius:5px;color:#fff;background:var(--ro-blue-1,#496a9e);margin-right:4px}
      #picker[data-ro-ap-hidden]{visibility:hidden!important;pointer-events:none!important}
      #ro-ap-menu{position:fixed;z-index:2147483647;background:#172238;color:#fff;border:1px solid #738ab4;border-radius:8px;padding:6px;box-shadow:0 6px 24px #0009;font:14px sans-serif;min-width:180px}
      #ro-ap-menu>div{padding:7px 10px;color:#b9c8e4;max-width:280px;overflow-wrap:anywhere}
      #ro-ap-menu button{display:block;width:100%;padding:10px 14px;color:#fff;background:#2c4365;border:0;border-radius:5px;text-align:left;cursor:pointer;font:inherit}
      #ro-ap-menu button:hover{background:#3b5f88}
      #ro-ap-toast{position:fixed;left:50%;top:16%;transform:translateX(-50%);z-index:2147483647;max-width:85vw;background:#172238ed;color:#d8ffe9;border:1px solid #65edb1;border-radius:8px;padding:10px 16px;font:14px sans-serif;pointer-events:none}
    `;
    document.head.append(style);
    document.addEventListener('contextmenu', context, true);
    document.addEventListener('click',event=>{
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
      if(filterDialog){
        // The game's Escape/number handlers must not react behind this modal.
        e.stopImmediatePropagation();
        if(e.key==='Escape'){e.preventDefault();closeFilter();}
        return;
      }
      if (e.key === 'Escape') {
        if(autoRefine.active)stopAutoRefine();
        closeMenu();
        if (job) {
          document.querySelectorAll('#pk-cards .pk-card').forEach(card => manualCards.add(card));
          cancel(); notify('已中止本次自動選擇');
        }
      }
    }, true);
    window.addEventListener('keydown',e=>{
      if(filterDialog){e.stopImmediatePropagation();if(e.key==='Escape'){e.preventDefault();closeFilter();}}
    },true);
    window.addEventListener('blur', closeMenu);
    new MutationObserver(records => {
      // The game hides #hud when destroying a run and shows it for a new run.
      // oldValue also detects a hide/show pair within the same mutation batch.
      if (records.some(r => r.type === 'attributes' && r.target.id === 'hud' && r.attributeName === 'class'
        && /(?:^|\s)hidden(?:\s|$)/.test(r.oldValue || '') !== r.target.classList.contains('hidden'))) resetRun();
      const relevant = records.some(r => {
        const el = r.target instanceof Element ? r.target : r.target.parentElement;
        return el?.closest('#picker, #skillbar, #runitems, #smith, #shop-quality, #shop-filters, #opt-body, #opt-tabs, #lobby-online, #npc-text, #npc-options, #pause') || [...r.addedNodes].some(n => n instanceof Element && (n.matches('#picker, #skillbar, #runitems, #smith, #shop-quality, #opt-body, #opt-tabs, #lobby-online, #pause') || n.querySelector('#picker, #skillbar, #runitems, #smith, #shop-quality, #opt-body, #opt-tabs, #lobby-online, #pause')));
      });
      if (relevant) schedule();
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['class', 'src'] });
    scan();
    installGameHooks();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
