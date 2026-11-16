  const FILTER_KEY = 'greydust.ro.unwanted.catalog.v3';
  const PREVIOUS_FILTER_KEY = 'greydust.ro.unwanted.catalog.v2';
  const PRIMARY = [['str','STR'],['agi','AGI'],['vit','VIT'],['int','INT'],['dex','DEX'],['luk','LUK']];
  const SECOND3 = [['crit','爆擊'],['cd','急速'],['area','範圍'],['pierce','穿透機率']];
  const SECOND4 = [['spd','移動速度'],['flee','Flee'],['armor','護甲'],['hp','最大 HP']];
  const GEAR_SLOTS = [['onehand','單手武'],['twohand','雙手武'],['shield','盾牌'],['head_top','頭部（上）'],['head_mid','頭部（中）'],['head_low','頭部（下）'],['armor','護甲'],['garment','披肩'],['shoes','鞋子'],['acc','飾品']];
  const RARITIES=[['0','普通'],['1','優良'],['2','稀有'],['3','史詩'],['4','傳說']];
  const selections=value=>Array.isArray(value)?value:(value===undefined||value===null||value===''?[]:[value]);
  const copy=value=>JSON.parse(JSON.stringify(value));
  const emptyEquipmentFilter=()=>({version:3,unwantedRarities:[],disabledTiers:{},filters:[],assignments:{}});
  let filterStore=emptyEquipmentFilter(),filterDraft=null,filterDialog=null;
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
    const rule=filterStore;
    if(!validEquipmentFilter(rule)){openFilter();notify('請先儲存完整的圖鑑過濾設定');return;}
    let captured;
    try{captured=captureMerchantInventory();}catch(error){console.warn('[RO助手] 讀取商人清單失敗',error);notify('讀取商人清單失敗，未變更選取');return;}
    if(!captured){notify('無法讀取商人裝備資料，未變更選取');return;}
    const {inventory,selection}=captured;
    const byId=new Map(inventory.map(item=>[item.uid,item]));
    const cells=[...document.querySelectorAll('#shop-items [data-uid]')];
    if(cells.some(cell=>!byId.has(cell.dataset.uid))){notify('商人資料與清單不一致，未變更選取');return;}
    const targets=cells.filter(cell=>!cell.classList.contains('worn')&&!cell.classList.contains('safe'))
      .map(cell=>byId.get(cell.dataset.uid)).filter(item=>!item.safe&&!item.owner&&!smithDefs[item.itemId]?.starter&&isUnwantedEquipment(rule,item)).map(item=>item.uid);
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
  function formButton(text,action) {const button=document.createElement('button');button.type='button';button.className='ro-btn small';button.textContent=text;button.onclick=action;return button;}
  function formMulti(options,value,onchange,placeholder='不限') {
    const details=document.createElement('details');details.className='ro-filter-multi';
    const summary=document.createElement('summary'),list=document.createElement('div');list.className='ro-filter-multi-list';details.append(summary,list);
    const position=()=>{
      if(!details.open||typeof summary.getBoundingClientRect!=='function')return;
      const r=summary.getBoundingClientRect(),width=Math.min(320,innerWidth-24);
      const below=innerHeight-r.bottom-12,above=r.top-12,up=below<160&&above>below;
      list.style.width=width+'px';list.style.left=Math.max(12,Math.min(r.left,innerWidth-width-12))+'px';
      list.style.maxHeight=Math.max(60,Math.min(280,up?above:below))+'px';
      list.style.top=up?'auto':(r.bottom+4)+'px';list.style.bottom=up?(innerHeight-r.top+4)+'px':'auto';
    };
    const unlisten=()=>{document.removeEventListener('scroll',position,true);window.removeEventListener('resize',position);document.removeEventListener('pointerdown',outside,true);};
    const outside=event=>{if(!details.contains(event.target))details.closeMenu();};
    details.closeMenu=()=>{details.open=false;unlisten();};
    details.ontoggle=()=>{
      unlisten();if(!details.open)return;
      filterDialog?.querySelectorAll('.ro-filter-multi').forEach(menu=>{if(menu!==details)menu.closeMenu?.();});
      position();document.addEventListener('scroll',position,true);window.addEventListener('resize',position);document.addEventListener('pointerdown',outside,true);
    };
    let selected=selections(value).map(String);
    const refresh=()=>{const names=options.filter(([id])=>selected.includes(String(id))).map(([,name])=>name.split(' ｜ ')[0]);summary.textContent=names.length?names.join('、')+'（OR）':placeholder;};
    const clear=formButton('清除選擇',()=>{selected=[];list.querySelectorAll('input').forEach(input=>input.checked=false);refresh();onchange([]);});list.append(clear);
    for(const [id,name]of options){
      const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=id;input.checked=selected.includes(String(id));
      input.onchange=()=>{selected=input.checked?[...new Set([...selected,String(id)])]:selected.filter(entry=>entry!==String(id));refresh();onchange([...selected]);};
      label.append(input);
      label.append(document.createTextNode(name));
      list.append(label);
    }
    refresh();return details;
  }
