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
      const hooks = Object.values(module).find(value => value && typeof value === 'object'
        && ['start', 'tick', 'hurt', 'damageMult', 'hit', 'kill', 'cast'].every(key => Array.isArray(value[key])));
      if (!hooks) throw new Error('找不到遊戲事件介面');
      hooks.start.push(game => {
        runHelperHook(game,'重設介面',()=>resetRun());
        runHelperHook(game,'自動選擇',()=>installFastChoice(game));
      });
      hooks.tick.push(helperTick);
      runHelperHook(hooks,'背包與換裝介面',updateInventoryViews);
      console.info('[RO助手] 即時自選已啟用 v2.2.8');
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
