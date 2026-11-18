  const inventoryViews=new Map();
  const inventoryNativeHandlers=new WeakMap();
  let inventoryUpdating=false;
  let inventoryItems=new Map();
  let equipmentCurrentItem=null;
  const inventoryCategories=[['all','全部'],['onehand','單手武'],['twohand','雙手武'],['head_top','頭部上'],['head_mid','頭部中'],['head_low','頭部下'],['armor','護甲'],['shield','盾牌'],['garment','披肩'],['shoes','鞋子'],['acc','飾品']];
  function gearArray(value){return Array.isArray(value)&&value.length>0&&value.every(item=>item&&typeof item.uid==='string'&&Number.isFinite(item.itemId)&&Array.isArray(item.cards));}
  function inventoryMatches(item,category,type=''){
    const def=smithDefs?.[item.itemId];
    if(!def)return category==='all'&&!type;
    return (category==='all'||smithCategory(def)===category||def.slot===category)&&(!type||def.wtype===type);
  }
  // Intercept only a synchronous, native UI redraw. Never replace account arrays
  // or install a persistent prototype hook; native actions keep their own data.
  function withInventoryView(action,view){
    const original=Array.prototype.filter;
    let bagPredicate=null;
    try{
      Array.prototype.filter=function(...args){
        const result=Reflect.apply(original,this,args);
        if(!gearArray(this))return result;
        for(const item of this)inventoryItems.set(item.uid,item);
        // Restrict only the displayed-list predicate, not account/ownership
        // arrays captured by native "store all" / "take this page" actions.
        const predicate=args[0],source=Function.prototype.toString.call(predicate).replace(/\s+/g,'');
        if(view.id==='storage'){
          if(predicate.name!=='passes'&&!/\bpasses\(/.test(source))return result;
        }else{
          if(!bagPredicate&&/^\(?([\w$]+)\)?=>[\w$]+\([\w$]+,\1\)$/.test(source))bagPredicate=predicate;
          if(predicate!==bagPredicate)return result;
        }
        return Reflect.apply(original,result,[item=>inventoryMatches(item,view.category,view.type)]);
      };
      return action();
    }finally{Array.prototype.filter=original;}
  }
  const equipmentBaseScores=new Map();
  function withEquipmentScoreCapture(action,uid){
    const find=Array.prototype.find,filter=Array.prototype.filter,map=Array.prototype.map;
    const hasCurrent=!!document.querySelector('#cp-eq-current .eq-name');
    if(!hasCurrent)equipmentCurrentItem=null;
    let inventory=null,current=null;
    const isInventory=value=>gearArray(value)&&value.some(item=>item.uid===uid);
    try{
      Array.prototype.find=function(...args){
        const result=Reflect.apply(find,this,args);
        if(!inventory&&isInventory(this))inventory=this;
        if(this!==inventory)return result;
        for(const item of this)inventoryItems.set(item.uid,item);
        // Native render reads the current slot before enumerating candidates.
        // A click may first look up the selected item to clear its "new" flag.
        if(hasCurrent&&!current&&result&&result.uid!==uid){current=result;equipmentCurrentItem=result;}
        return result;
      };
      Array.prototype.filter=function(...args){
        const result=Reflect.apply(filter,this,args);
        if(!inventory&&isInventory(this))inventory=this;
        if(this!==inventory)return result;
        for(const item of this)inventoryItems.set(item.uid,item);
        return result;
      };
      Array.prototype.map=function(callback,thisArg){
        const result=Reflect.apply(map,this,[callback,thisArg]);
        // Native candidate scorer returns {g: gear, s: score}. Reuse that
        // closure for pristine copies, preserving job, Tier and affix weights.
        if(gearArray(this)&&result.length===this.length&&result.every((row,index)=>row?.g===this[index]&&Number.isFinite(row.s))){
          for(const item of [...this,...(current?[current]:[])]){
            try{
              const base={...item,refine:0,star:0,cards:item.cards.map(()=>null)};
              const scored=Reflect.apply(callback,thisArg,[base,0,this]);
              if(scored?.g===base&&Number.isFinite(scored.s))equipmentBaseScores.set(item.uid,String(scored.s));
            }catch{/* Unknown native scoring must leave the original display intact. */}
          }
        }
        return result;
      };
      const result=action();
      paintEquipmentBaseScores(uid);
      return {result,current};
    }finally{Array.prototype.find=find;Array.prototype.filter=filter;Array.prototype.map=map;}
  }
  function refinePreviewMultiplier(item){
    return 1+[.04,.04,.04,.04,.06,.06,.06,.12,.12,.12].slice(0,Math.max(0,Math.min(10,item.refine||0))).reduce((sum,value)=>sum+value,0);
  }
  function inventoryBonusLines(item){
    const def=smithDefs?.[item.itemId];if(!def)return [];
    const multiplier=refinePreviewMultiplier(item),lines=[];
    const add=(label,bonuses)=>{
      const values=(bonuses||[]).map(bonus=>typeof bonus.text==='function'?String(bonus.text(multiplier)).replace(/<[^>]*>/g,''):'').filter(Boolean);
      if(values.length)lines.push([label,values.join(' · ')]);
    };
    add('內建',[...(def.bonuses||[]),...(gameCatalog?.bs?.(item.itemId,item.tier||1)||[])]);
    const primary=(item.affixes||[]).filter(affix=>PRIMARY.some(([id])=>id===affix.stat));
    const secondary=(item.affixes||[]).filter(affix=>affix.stat!=='skill'&&!PRIMARY.some(([id])=>id===affix.stat));
    if(typeof gameCatalog?.bt==='function'){
      add('屬性',gameCatalog.bt(primary));add('副屬性',gameCatalog.bt(secondary));
    }
    const skills=(item.affixes||[]).filter(affix=>affix.stat==='skill'&&affix.skill);
    if(skills.length)lines.push(['技能傷害',skills.map(affix=>String(skillDefs?.[affix.skill]?.name||affix.skill).replace(/<[^>]*>/g,'')+' +'+Number((affix.value*multiplier*100).toFixed(2))+'%').join(' · ')]);
    return lines;
  }
  function inventoryDetailRow(row,item){
    const lines=inventoryBonusLines(item),signature=JSON.stringify(lines);
    let details=row.querySelector('[data-ro-gear-details]');
    if(details?.dataset.signature===signature)return;
    if(!details){details=document.createElement('div');details.dataset.roGearDetails='';row.querySelector('.cand-info')?.append(details);}
    details.dataset.signature=signature;details.replaceChildren();
    for(const [label,text] of lines){const line=document.createElement('div');line.textContent=label+'：'+text;details.append(line);}
  }
  function nativeInventoryHandler(node,event){return inventoryNativeHandlers.get(node)?.[event]||node?.[event];}
  const probedEquipRows=new WeakSet();
  function appendEquipmentBaseScore(root,uid){
    const gs=root?.querySelector('.gs'),score=equipmentBaseScores.get(uid);
    if(!gs||score===undefined)return;
    let note=gs.querySelector('[data-ro-equipment-base-gs]');
    if(!note){note=document.createElement('span');note.dataset.roEquipmentBaseGs='';gs.querySelector('b')?.after(note);}
    const text=' ('+score+')';if(note.textContent!==text)note.textContent=text;
    if(note.title!=='基底 GS：不含卡片、精煉加值與星數；保留品質、Tier 與詞綴')note.title='基底 GS：不含卡片、精煉加值與星數；保留品質、Tier 與詞綴';
  }
  function paintEquipmentBaseScores(uid){
    appendEquipmentBaseScore(document.querySelector('#cp-eq-current'),equipmentCurrentItem?.uid);
    appendEquipmentBaseScore(document.querySelector('#cp-eq-cmp .cmp-head'),uid);
  }
  function updateCandidateScores(list,rows){
    for(const row of rows)appendEquipmentBaseScore(row,row.dataset.uid);
    appendEquipmentBaseScore(document.querySelector('#cp-eq-current'),equipmentCurrentItem?.uid);
  }
  function updateEquipCandidates(){
    const panel=document.querySelector('#charpanel'),list=document.querySelector('#cp-eq-list');
    if(!panel||panel.classList.contains('hidden')||document.querySelector('#cp-tab-equip')?.classList.contains('hidden')||!list||!smithDefs)return;
    const rows=[...list.querySelectorAll('.cand[data-uid]')];
    if(rows.length&&!probedEquipRows.has(rows[0])){
      probedEquipRows.add(rows[0]);
      const enter=nativeInventoryHandler(rows[0],'onpointerenter'),leave=list.onpointerleave;
      if(typeof enter==='function')withEquipmentScoreCapture(()=>Reflect.apply(enter,rows[0],[{pointerType:'mouse'}]),rows[0].dataset.uid);
      const selectedItem=inventoryItems.get(rows[0].dataset.uid),click=nativeInventoryHandler(rows[0],'onclick');
      if(rows[0].classList.contains('sel')&&selectedItem&&!selectedItem.isNew&&typeof click==='function')withEquipmentScoreCapture(()=>Reflect.apply(click,rows[0],[]),selectedItem.uid);
      if(typeof leave==='function')Reflect.apply(leave,list,[]);
    }
    for(const row of rows){
      if(!inventoryNativeHandlers.has(row)){
        const enter=row.onpointerenter,click=row.onclick;
        inventoryNativeHandlers.set(row,{onpointerenter:enter,onclick:click});
        if(typeof enter==='function')row.onpointerenter=function(event){
          if(event.pointerType!=='mouse')return Reflect.apply(enter,this,[event]);
          const result=withEquipmentScoreCapture(()=>Reflect.apply(enter,this,[event]),row.dataset.uid);
          updateEquipCandidates();return result.result;
        };
        if(typeof click==='function')row.onclick=function(event){
          // Let the real selection clear its new flag/save normally first.
          const result=withEquipmentScoreCapture(()=>Reflect.apply(click,this,[event]),row.dataset.uid).result;
          updateEquipCandidates();return result;
        };
      }
      const item=inventoryItems.get(row.dataset.uid);if(item)inventoryDetailRow(row,item);
    }
    if(list.onpointerleave!==inventoryNativeHandlers.get(list)?.onpointerleaveWrapper&&typeof list.onpointerleave==='function'){
      const leave=list.onpointerleave;inventoryNativeHandlers.set(list,{onpointerleave:leave});
      list.onpointerleave=function(event){
        const uid=list.querySelector('.cand.sel')?.dataset.uid;
        if(!uid)return Reflect.apply(leave,this,[event]);
        const result=withEquipmentScoreCapture(()=>Reflect.apply(leave,this,[event]),uid);return result.result;
      };
      inventoryNativeHandlers.get(list).onpointerleaveWrapper=list.onpointerleave;
    }
    updateCandidateScores(list,rows);
  }
  function inventoryViewConfig(id){
    return id==='bag'?{panel:'#charpanel',filters:'#cp-inv-filters',rows:'#cp-inventory [data-uid]',controls:'#cp-only-mine, #ks-inv-sort'}
      :{panel:'#kstorage',filters:'#ks-filt',rows:'#ks-bag [data-uid], #ks-st [data-uid]',controls:'#ks-q, #ks-sort-w, #ks-bp-prev, #ks-bp-next, #ks-pages [data-p]:not(.lock)'};
  }
  function redrawInventory(view,resetPage=false){
    const config=inventoryViewConfig(view.id),filters=document.querySelector(config.filters);
    const base=filters?.querySelector('[data-f="'+(view.category==='onehand'||view.category==='twohand'?'weapon':view.category.startsWith('head_')?'head':view.category)+'"]')||filters?.querySelector('[data-f="all"]');
    const handler=nativeInventoryHandler(base,'onclick');
    if(resetPage&&view.id==='storage'){
      const all=filters?.querySelector('[data-f="all"]'),allHandler=nativeInventoryHandler(all,'onclick');
      if(typeof allHandler==='function')withInventoryView(()=>Reflect.apply(allHandler,all,[null]),view);
    }
    if(typeof handler==='function')withInventoryView(()=>Reflect.apply(handler,base,[null]),view);
  }
  function updateInventoryViews(){
    if(inventoryUpdating||pickerIsOpen()||touchUiIsQuiet()||!smithDefs)return;
    inventoryUpdating=true;
    try{
      for(const id of ['bag','storage']){
        const config=inventoryViewConfig(id),panel=document.querySelector(config.panel),filters=document.querySelector(config.filters);
        if(!panel||panel.classList.contains('hidden')||id==='bag'&&document.querySelector('#cp-tab-inv')?.classList.contains('hidden')||!filters)continue;
        let view=inventoryViews.get(id);
        if(!view){view={id,category:'all',type:''};inventoryViews.set(id,view);}
        if(!filters.querySelector('[data-ro-inventory-categories]'))redrawInventory(view);
        for(const button of filters.querySelectorAll('[data-f]')){
          if(['weapon','head'].includes(button.dataset.f)){button.hidden=true;continue;}
          if(inventoryNativeHandlers.has(button))continue;
          const original=button.onclick;inventoryNativeHandlers.set(button,{onclick:original});
          button.onclick=function(event){view.category=button.dataset.f;view.type='';const result=Reflect.apply(original,this,[event]);updateInventoryViews();return result;};
        }
        let extras=filters.querySelector('[data-ro-inventory-categories]');
        if(!extras){
          extras=document.createElement('span');extras.dataset.roInventoryCategories='';
          for(const [category,label] of inventoryCategories.filter(([key])=>key==='onehand'||key==='twohand'||key.startsWith('head_'))){
            const button=document.createElement('button');button.type='button';button.className='inv-chip';button.dataset.roInventoryCategory=category;button.textContent=label;
            button.onclick=()=>{view.category=category;view.type='';redrawInventory(view,true);updateInventoryViews();};extras.append(button);
          }
          const head=filters.querySelector('[data-f="weapon"]');if(head)head.after(extras);else filters.prepend(extras);
        }
        for(const button of filters.querySelectorAll('[data-ro-inventory-category]'))button.classList.toggle('active',button.dataset.roInventoryCategory===view.category);
        for(const button of filters.querySelectorAll('[data-f]'))if(['onehand','twohand','head_top','head_mid','head_low'].includes(view.category))button.classList.remove('active');
        let sub=panel.querySelector('[data-ro-inventory-subtypes]');
        if(!sub){sub=document.createElement('div');sub.dataset.roInventorySubtypes='';filters.parentElement.insertBefore(sub,filters.nextSibling);}
        const types=['onehand','twohand'].includes(view.category)?weaponTypeLabels.filter(([type])=>Object.values(smithDefs).some(def=>smithCategory(def)===view.category&&def.wtype===type)):[];
        const signature=JSON.stringify([view.category,view.type,types]);
        if(sub.dataset.signature!==signature){
          sub.dataset.signature=signature;sub.replaceChildren();
          for(const [type,label] of types.length?[['','全部'],...types]:[]){
            const button=document.createElement('button');button.type='button';button.className='inv-chip';button.classList.toggle('active',view.type===type);button.textContent=label;
            button.onclick=()=>{view.type=type;redrawInventory(view,true);updateInventoryViews();};sub.append(button);
          }
        }
        for(const control of panel.querySelectorAll(config.controls)){
          const event=control.tagName==='INPUT'&&control.type==='search'?'oninput':control.tagName==='BUTTON'?'onclick':'onchange',original=control[event];
          if(original===inventoryNativeHandlers.get(control)?.controlWrapper)continue;
          if(typeof original!=='function')continue;
          inventoryNativeHandlers.set(control,{[event]:original});
          control[event]=function(...args){const result=withInventoryView(()=>Reflect.apply(original,this,args),view);updateInventoryViews();return result;};
          inventoryNativeHandlers.get(control).controlWrapper=control[event];
        }
      }
      updateEquipCandidates();
    }finally{inventoryUpdating=false;}
  }
