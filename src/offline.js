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
