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
