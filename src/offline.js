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
