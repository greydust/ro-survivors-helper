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
    installHordeCount(game);
    if(game)activeGame=game;
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
      const hooks = Object.values(module).find(value => value && typeof value === 'object'
        && ['start', 'tick', 'hurt', 'damageMult', 'hit', 'kill', 'cast'].every(key => Array.isArray(value[key])));
      if (!hooks) throw new Error('找不到遊戲事件介面');
      hooks.start.push(game => { resetRun(); installFastChoice(game); });
      hooks.tick.push(game => {
        installFastChoice(game);
        if(performance.now()>=nextCharacterDetailsAt){nextCharacterDetailsAt=performance.now()+250;updateCharacterDetails();}
        try { victoryMagnet(game); }
        catch (error) { console.warn('[RO助手] 勝利磁鐵失敗', error); }
      });
      console.info('[RO助手] 即時自選已啟用 v1.9.3');
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
    updateStageSpawnSchedule();
    updateCharacterDetails();
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
