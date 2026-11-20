  const AUTO_WORLD_BOSS_KEY='greydust.ro.auto-world-boss.v1';
  let autoWorldBoss=false,worldBossLastAttempt=-Infinity;
  const worldBossAttemptedChips=new WeakSet();
  try{autoWorldBoss=localStorage.getItem(AUTO_WORLD_BOSS_KEY)==='true';}catch{}
  function tryAutoWorldBoss(){
    if(!autoWorldBoss||keepOffline)return;
    const chip=document.querySelector('#wb-chip'),button=chip?.querySelector('#wb-join');
    // Native draw replaces its button every second. Remember the chip, not the
    // button; also guard reconnects that recreate the chip during the same event.
    if(!button||button.disabled||typeof button.onclick!=='function'||worldBossAttemptedChips.has(chip)||Date.now()-worldBossLastAttempt<30*60*1000)return;
    for(let el=button;el;el=el.parentElement){
      if(el.hidden||el.classList.contains('hidden')||el.getAttribute('aria-hidden')==='true')return;
      const style=getComputedStyle(el);if(style.display==='none'||style.visibility==='hidden')return;
    }
    worldBossAttemptedChips.add(chip);worldBossLastAttempt=Date.now();
    button.click();
  }
  function updateWorldBossOption(){
    const body=document.querySelector('#opt-body');
    if(!body||!document.querySelector('#opt-tabs [data-opt-tab="game"].active'))return;
    let input=body.querySelector('[data-ro-auto-world-boss]');
    if(!input){
      const row=document.createElement('label');row.className='opt-row opt-check';
      const text=document.createElement('span'),name=document.createElement('b'),hint=document.createElement('small');
      name.textContent='自動進世界王';hint.textContent='入口出現時自動點進場一次，額滿依原生規則排隊；需保持遊戲開啟且連線，保持離線遊玩優先。失敗可手動重試。';text.append(name,hint);
      input=document.createElement('input');input.type='checkbox';input.setAttribute('data-ro-auto-world-boss','');
      input.onchange=()=>{autoWorldBoss=input.checked;try{localStorage.setItem(AUTO_WORLD_BOSS_KEY,String(autoWorldBoss));}catch{notify('世界王設定無法保存，目前只在本分頁有效');}tryAutoWorldBoss();};
      const toggle=document.createElement('i');toggle.className='opt-switch';row.append(text,input,toggle);body.append(row);
    }
    input.checked=autoWorldBoss;
  }
  function startWorldBossObserver(){
    // Separate from the batched helper scan: react in the mutation microtask
    // after the game has installed the native onclick, including during pickers.
    new MutationObserver(records=>{
      if(records.some(r=>r.target.id==='wb-chip'||r.target.closest?.('#wb-chip')||[...(r.addedNodes||[])].some(n=>n.id==='wb-chip'||n.querySelector?.('#wb-chip'))))tryAutoWorldBoss();
    }).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden','style','disabled']});
    tryAutoWorldBoss();
  }
