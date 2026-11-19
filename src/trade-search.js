  let tradeItemName=null,tradeCardName=null,tradeSearchState=null;
  let tradeSearchManifest=null;
  const tradeIconNames=new Map();
  function initializeTradeSearch(module){
    const functions=Object.values(module||{}).filter(value=>typeof value==='function');
    tradeItemName=functions.find(fn=>/\.manifest\.items/.test(String(fn))&&/\.name/.test(String(fn))&&/"#"\s*\+/.test(String(fn)))||null;
    tradeCardName=functions.find(fn=>/\.manifest\.cards/.test(String(fn))&&/\.name/.test(String(fn))&&/1000000/.test(String(fn)))||null;
    updateTradeSearch();
  }
  function tradeSearchText(cell){
    const id=cell.dataset.card||cell.dataset.ore;
    if(id){const name=cell.dataset.card?tradeCardName:tradeItemName;return name?String(name(Number(id))):null;}
    const manifest=smithAssets?.manifest?.items;
    if(!manifest||!tradeItemName)return null;
    if(manifest!==tradeSearchManifest){
      tradeSearchManifest=manifest;tradeIconNames.clear();
      for(const [itemId,item] of Object.entries(manifest)){
        if(!item.icon)continue;
        const suffix='/'+decodeURI(item.icon).replace(/^(?:\.\/|\/)+/,'');
        tradeIconNames.set(suffix,(tradeIconNames.get(suffix)||'')+' '+tradeItemName(Number(itemId)));
      }
    }
    let path;try{path=decodeURI(new URL(cell.querySelector('img')?.getAttribute('src'),location.href).pathname);}catch{return null;}
    const names=[];
    for(let index=path.indexOf('/');index>=0;index=path.indexOf('/',index+1))if(tradeIconNames.has(path.slice(index)))names.push(tradeIconNames.get(path.slice(index)));
    return names.length?names.join(' '):null;
  }
  function updateTradeSearch(){
    const panel=document.querySelector('#trade'),list=panel?.querySelector('#tr-inv'),filters=panel?.querySelector('#tr-filters');
    if(!panel||panel.classList.contains('hidden')){if(tradeSearchState){tradeSearchState.input.value='';tradeSearchState=null;}return;}
    if(!list||!filters)return;
    let bar=panel.querySelector('[data-ro-trade-search]');
    if(!bar){
      bar=document.createElement('div');bar.dataset.roTradeSearch='';bar.style.cssText='display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:8px 0';
      const input=document.createElement('input');input.type='search';input.placeholder='搜尋物品或卡片名稱';input.setAttribute('aria-label','搜尋交易物品或卡片');input.style.cssText='flex:1;min-width:120px;max-width:100%;box-sizing:border-box;font-size:16px;padding:8px';
      const count=document.createElement('span');count.setAttribute('aria-live','polite');
      const empty=document.createElement('div');empty.textContent='找不到符合的物品或卡片';empty.dataset.roTradeEmpty='';empty.className='empty-note';empty.hidden=true;
      input.oninput=updateTradeSearch;
      input.onkeydown=event=>event.stopPropagation();
      bar.append(input,count);filters.after(bar);list.after(empty);
    }
    const input=bar.querySelector('input'),count=bar.querySelector('span'),empty=panel.querySelector('[data-ro-trade-empty]');
    if(!tradeSearchState||tradeSearchState.panel!==panel){input.value='';tradeSearchState={panel,input};}
    const query=input.value.normalize('NFKC').trim().toLocaleLowerCase(),terms=query.split(/\s+/).filter(Boolean);
    let shown=0;const cells=[...list.querySelectorAll('.item-cell')];
    for(const cell of cells){
      const name=terms.length?tradeSearchText(cell):null;
      // Unknown assets stay visible so an incomplete catalog cannot hide inventory.
      const match=!terms.length||name===null||terms.every(term=>name.normalize('NFKC').toLocaleLowerCase().includes(term));
      if(cell.hidden===match)cell.hidden=!match;
      if(!match){if(cell.style.display!=='none')cell.style.setProperty('display','none','important');}
      else if(cell.style.display==='none')cell.style.removeProperty('display');
      if(match)shown++;
    }
    const text=terms.length?shown+' / '+cells.length:'';if(count.textContent!==text)count.textContent=text;
    const noMatches=terms.length>0&&cells.length>0&&shown===0;if(empty.hidden===noMatches)empty.hidden=!noMatches;
  }
