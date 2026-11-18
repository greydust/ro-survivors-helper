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

