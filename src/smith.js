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

