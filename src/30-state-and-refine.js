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
