  const equipmentById=new Map(EQUIPMENT_CATALOG.map(item=>[item.id,item]));
  // Public game RO_LAPC (2026-11-16): six laps; RO_LAPTIER = base maximum + lap - 1.
  const EQUIPMENT_LAP_COUNT=6;
  const EQUIPMENT_BASE_MAX_TIER=3;
  function equipmentBaseMaxTier(){return EQUIPMENT_BASE_MAX_TIER;}
  function equipmentTiers(record){
    const base=equipmentBaseMaxTier();
    if(record.sources.every(source=>source.chapter===2))return [...new Set([...record.tiers,6,7,8])].sort((a,b)=>a-b);
    return [...new Set([...record.tiers,...Array.from({length:EQUIPMENT_LAP_COUNT-1},(_,i)=>base+i+1)])].sort((a,b)=>a-b);
  }
  function equipmentMaxTier(){return equipmentBaseMaxTier()+EQUIPMENT_LAP_COUNT-1;}
  let filterSlot='onehand',filterSearch='',gearDetails=null;
  let filterWeaponType='',filterExcludeTier=1;
  const weaponTypeLabels=[['단검','短劍'],['검','單手劍'],['양손검','雙手劍'],['카타르','拳刃'],['창','單手矛'],['양손창','雙手矛'],['도끼','單手斧'],['양손도끼','雙手斧'],['클럽','鈍器'],['너클','拳套'],['롯드','法杖'],['책','書'],['활','弓'],['악기','樂器'],['채찍','鞭子'],['권총','手槍'],['라이플','步槍'],['샷건','散彈槍'],['수리검','風魔手裏劍'],['unknown','其他']];
  function groupWeaponType(group){return smithDefs?.[group.records[0].id]?.wtype||group.records[0].wtype||'unknown';}
  const emptyDetailSettings=()=>({first:[],second:[],third:[],fourth:[],skills:[]});
  function validDetailSettings(d){
    const field=(values,options)=>Array.isArray(values)&&values.length<=options.length&&values.every(v=>options.some(([id])=>id===v));
    return d&&field(d.first,PRIMARY)&&field(d.second,PRIMARY)&&field(d.third,SECOND3)&&field(d.fourth,SECOND4)
      &&Array.isArray(d.skills)&&d.skills.length<=500&&new Set(d.skills.map(s=>s?.id)).size===d.skills.length&&d.skills.every(s=>s&&typeof s.id==='string'&&s.id.length>0&&s.id.length<100&&typeof s.min==='number'&&Number.isFinite(s.min)&&s.min>=0&&s.min<=10000);
  }
  function validEquipmentFilter(data){
    if(!data||![2,3].includes(data.version)||!Array.isArray(data.unwantedRarities)||data.unwantedRarities.length>5||!data.unwantedRarities.every(v=>RARITIES.some(([id])=>id===v)))return false;
    if(!data.disabledTiers||typeof data.disabledTiers!=='object'||Array.isArray(data.disabledTiers)||Object.keys(data.disabledTiers).length>5000||!Object.entries(data.disabledTiers).every(([k,v])=>/^\d+:[1-9]\d*$/.test(k)&&v===true))return false;
    if(data.version===2)return data.details&&typeof data.details==='object'&&!Array.isArray(data.details)&&Object.keys(data.details).length<=1000&&Object.entries(data.details).every(([id,d])=>/^\d+$/.test(id)&&validDetailSettings(d));
    if(!Array.isArray(data.filters)||data.filters.length>100||new Set(data.filters.map(f=>f?.id)).size!==data.filters.length)return false;
    if(!data.filters.every(f=>f&&typeof f.id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(f.id)&&typeof f.name==='string'&&f.name.trim().length>0&&f.name.length<=80&&validDetailSettings(f)))return false;
    return data.assignments&&typeof data.assignments==='object'&&!Array.isArray(data.assignments)&&Object.keys(data.assignments).length<=1000&&Object.entries(data.assignments).every(([id,filter])=>/^\d+$/.test(id)&&data.filters.some(f=>f.id===filter));
  }
  function migrateEquipmentFilter(data){
    if(!validEquipmentFilter(data))throw new Error('不是有效的裝備過濾器');
    if(data.version===3)return copy(data);
    const next={...emptyEquipmentFilter(),unwantedRarities:copy(data.unwantedRarities),disabledTiers:copy(data.disabledTiers)},seen=new Map();
    for(const [id,d] of Object.entries(data.details)){
      const signature=JSON.stringify(d);let filter=seen.get(signature);
      if(!filter){filter={...copy(d),id:'migrated-'+next.filters.length,name:'細項過濾器 '+(next.filters.length+1)};next.filters.push(filter);seen.set(signature,filter);}
      next.assignments[id]=filter.id;
    }
    if(!validEquipmentFilter(next))throw new Error('舊設定超過可轉換的細項過濾器數量');
    return next;
  }
  function loadFilterStore(){
    try{const text=localStorage.getItem(FILTER_KEY)||localStorage.getItem(PREVIOUS_FILTER_KEY);if(text)filterStore=migrateEquipmentFilter(JSON.parse(text));}
    catch(error){console.warn('[RO助手] 圖鑑過濾器讀取失敗',error);}
  }
  function isUnwantedEquipment(config,item) {
    if(!validEquipmentFilter(config)||!item||item.safe||item.owner)return false;
    const record=equipmentById.get(Number(item.itemId)),def=smithDefs?.[item.itemId];
    // Unlisted/special gear and unknown legacy tiers are kept for manual review.
    if(!record||def?.starter||def?.secret||!Number.isInteger(item.tier)||item.tier<1)return false;
    const quality=item.quality??0;
    if(!Number.isInteger(quality)||quality<0||quality>4)return false;
    if(config.unwantedRarities.includes(String(quality))||config.disabledTiers[item.itemId+':'+item.tier])return true;
    const settings=config.version===2?config.details[item.itemId]:config.filters.find(f=>f.id===config.assignments[item.itemId]);if(!settings)return false;
    if(!Array.isArray(item.affixes))return false;
    const affixes=item.affixes;
    if(!affixes.every(a=>a&&typeof a==='object'&&typeof a.stat==='string'))return false;
    const first=affixes.filter(a=>PRIMARY.some(([id])=>id===a.stat));
    // Primary fields are unordered, but require two distinct affixes when both are set.
    const mainOK=(!settings.first.length&&!settings.second.length)
      ||(settings.first.length&&settings.second.length
        ?first.some((a,i)=>settings.first.includes(a.stat)&&first.some((b,j)=>i!==j&&settings.second.includes(b.stat)))
        :first.some(a=>(settings.first.length?settings.first:settings.second).includes(a.stat)));
    const thirdOK=!settings.third.length||affixes.some(a=>settings.third.includes(a.stat));
    const fourthOK=!settings.fourth.length||affixes.some(a=>settings.fourth.includes(a.stat));
    const skillOK=!settings.skills.length||settings.skills.some(s=>affixes.some(a=>a.stat==='skill'&&a.skill===s.id&&Number.isFinite(a.value)&&a.value*100+1e-8>=s.min));
    return !(mainOK&&thirdOK&&fourthOK&&skillOK);
  }
  function damageSkillOptions() {
    try {
      const ids=gameCatalog?.bU?.();
      if(!Array.isArray(ids))return [];
      return [...new Set(ids)].filter(id=>skillDefs?.[id]).map(id=>[id,`${skillDefs[id].name}傷害`]).sort((a,b)=>a[1].localeCompare(b[1],'zh-Hant'));
    }catch{return [];}
  }
  function equipmentGroups() {
    const groups=new Map();
    for(const record of EQUIPMENT_CATALOG){
      const def=smithDefs?.[record.id];if(def?.secret||def?.starter)continue;
      const slot=smithCategory(def||record),key=String(record.id);
      if(!groups.has(key))groups.set(key,{name:record.name,slot,records:[]});
      groups.get(key).records.push(record);
    }
    return [...groups.values()];
  }
  function actualEquipmentBonuses(record,tier){
    const def=smithDefs?.[record.id];
    if(!def||!Array.isArray(def.bonuses)||typeof gameCatalog?.bs!=='function')return null;
    try{
      const bonuses=[...def.bonuses,...gameCatalog.bs(record.id,tier)];
      if(!bonuses.every(b=>typeof b?.text==='function'))return null;
      return [...new Set(bonuses.map(b=>String(b.text(1)).replace(/<[^>]*>/g,'').trim()).filter(Boolean))];
    }catch{return null;}
  }
  function tierIsKept(config,ids,tier){return ids.every(id=>!config.disabledTiers[id+':'+tier]);}
  function setEquipmentTier(config,ids,tier,keep){
    for(const id of ids){if(keep)delete config.disabledTiers[id+':'+tier];else config.disabledTiers[id+':'+tier]=true;}
  }
  function excludeEquipmentTiers(config,max){
    for(const group of equipmentGroups())for(const tier of new Set(group.records.flatMap(r=>equipmentTiers(r))))if(tier<=max)setEquipmentTier(config,group.records.map(r=>r.id),tier,false);
  }
  function element(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
  function drawEquipmentCards(container,summary){
    const groups=equipmentGroups().filter(group=>group.slot===filterSlot&&(!filterWeaponType||groupWeaponType(group)===filterWeaponType));
    const query=filterSearch.trim().toLocaleLowerCase();
    const expanded=new Set([...container.querySelectorAll('.ro-gear-card')].filter(card=>card.querySelector('details')?.open).map(card=>card.dataset.gearId));
    container.replaceChildren();let shown=0;
    for(const group of groups){
      const searchable=group.name+' '+group.records.map(r=>r.id).join(' ')+' '+group.records.flatMap(r=>r.sources.map(s=>s.stage+' '+s.monster)).join(' ')+' '+group.records.flatMap(r=>equipmentTiers(r).flatMap(t=>actualEquipmentBonuses(r,t)||[])).join(' ');
      if(query&&!searchable.toLocaleLowerCase().includes(query))continue;
      shown++;
      const card=element('article',undefined,'ro-gear-card'),header=element('header');card.dataset.gearId=String(group.records[0].id);
      const image=element('img');image.src=group.records[0].icon;image.alt='';image.loading='lazy';
      const duplicate=EQUIPMENT_CATALOG.some(r=>r.id!==group.records[0].id&&r.name===group.name);
      const displayName=group.name+(duplicate?'（ID '+group.records[0].id+'）':'');
      const title=element('b',displayName),settings=element('select');settings.className='ro-gear-filter-select';settings.setAttribute('aria-label',displayName+'細項過濾器');
      const assigned=[...new Set(group.records.map(r=>filterDraft.assignments[r.id]||''))];
      const options=[['','不限細項'],...filterDraft.filters.map(f=>[f.id,f.name])];
      if(assigned.length>1)options.unshift(['__mixed','多個設定']);
      for(const [id,name] of options){const option=element('option',name);option.value=id;option.selected=id===(assigned.length>1?'__mixed':assigned[0]);option.disabled=id==='__mixed';settings.append(option);}
      settings.onchange=()=>{for(const r of group.records){if(settings.value)filterDraft.assignments[r.id]=settings.value;else delete filterDraft.assignments[r.id];}};
      header.append(image,title,settings);card.append(header);
      const sources=element('ul',undefined,'ro-gear-sources'),locations=new Map();
      sources.setAttribute('aria-label','掉落來源');
      for(const record of group.records)for(const source of record.sources){
        if(!locations.has(source.stage))locations.set(source.stage,new Set());
        locations.get(source.stage).add((source.boss?'👑 ':'')+source.monster+(source.rare?'（闖入者）':''));
      }
      for(const [location,monsters] of locations)sources.append(element('li',location+'：'+[...monsters].join('、')));
      card.append(sources);
      const tiers=[...new Set(group.records.flatMap(r=>equipmentTiers(r)))].sort((a,b)=>a-b);
      const toggles=element('div',undefined,'ro-gear-tier ro-gear-tier-switches'),details=element('details',undefined,'ro-gear-expanded');
      details.open=expanded.has(card.dataset.gearId);details.append(element('summary','各階屬性'));
      const bonusGroups=new Map();
      for(const tier of tiers){
        const records=group.records,ids=records.map(r=>r.id);
        const keep=tierIsKept(filterDraft,ids,tier);
        const toggle=formButton('T'+tier,()=>{setEquipmentTier(filterDraft,ids,tier,!tierIsKept(filterDraft,ids,tier));drawEquipmentCards(container,summary);});
        toggle.dataset.gearTier=String(tier);toggle.setAttribute('aria-pressed',String(keep));toggle.setAttribute('aria-label',group.name+' T'+tier+' 保留');toggle.classList.toggle('excluded',!keep);
        const bonuses=actualEquipmentBonuses(records[0],tier);
        toggles.append(toggle);
        const text=bonuses===null?'遊戲屬性資料尚未就緒':bonuses.length?bonuses.join(' · '):'無固有加成（依實際裝備資料）';
        if(!bonusGroups.has(text))bonusGroups.set(text,[]);bonusGroups.get(text).push(tier);
        if(tier===tiers.at(-1))card.dataset.highestBonus='T'+tier+'：'+text;
      }
      card.append(toggles,element('p',card.dataset.highestBonus,'ro-gear-bonus-preview'));
      delete card.dataset.highestBonus;
      for(const [text,values] of bonusGroups){const row=element('div',undefined,'ro-gear-tier');row.append(element('b',values.map(t=>'T'+t).join('／')),element('span',text));details.append(row);}
      card.append(details);container.append(card);
    }
    summary.textContent='目前分類 '+shown+' 筆裝備；T 亮起＝保留，關閉＝不需要。';
    if(!shown)container.append(element('p','沒有符合搜尋的裝備。'));
  }
  function closeFilterMenus(root=filterDialog){root?.querySelectorAll('.ro-filter-multi').forEach(menu=>menu.closeMenu?.());}
  function closeGearDetails(){closeFilterMenus(gearDetails);gearDetails?.remove();gearDetails=null;}
  function openGearDetails(){
    closeGearDetails();
    const working={filters:copy(filterDraft.filters),assignments:copy(filterDraft.assignments)};
    let selected=working.filters[0]?.id||'';
    gearDetails=element('div',undefined,'ro-gear-detail-backdrop');
    const panel=element('section',undefined,'ro-gear-detail-panel ro-detail-manager');panel.setAttribute('role','dialog');panel.setAttribute('aria-label','管理細項過濾器');gearDetails.append(panel);filterDialog.append(gearDetails);
    const draw=()=>{
      closeFilterMenus(panel);panel.replaceChildren();panel.append(element('h3','管理細項過濾器'),element('p','同格多選符合任一項，不同格必須全部符合；未選不限。移除過濾器會一併解除裝備的選用。'));
      const layout=element('div',undefined,'ro-detail-layout'),sidebar=element('div',undefined,'ro-detail-list'),editor=element('div',undefined,'ro-detail-editor');
      sidebar.append(formButton('新增',()=>{if(working.filters.length>=100)return;const f={...emptyDetailSettings(),id:'f-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),name:'新細項過濾器'};working.filters.push(f);selected=f.id;draw();}));
      working.filters.forEach((f,index)=>{
        const row=element('div',undefined,'ro-detail-list-row'),choose=formButton(f.name,()=>{selected=f.id;draw();});choose.dataset.detailId=f.id;choose.classList.toggle('active',selected===f.id);row.append(choose);
        for(const [delta,label] of [[-1,'↑'],[1,'↓']]){const button=formButton(label,()=>{const other=index+delta;[working.filters[index],working.filters[other]]=[working.filters[other],working.filters[index]];draw();});button.disabled=index+delta<0||index+delta>=working.filters.length;button.setAttribute('aria-label',f.name+(delta<0?'上移':'下移'));row.append(button);}sidebar.append(row);
      });
      const settings=working.filters.find(f=>f.id===selected);
      if(settings){
        const name=element('input');name.type='text';name.maxLength=80;name.value=settings.name;name.setAttribute('aria-label','細項過濾器名稱');name.oninput=()=>{settings.name=name.value;const button=sidebar.querySelector('[data-detail-id="'+settings.id+'"]');if(button)button.textContent=name.value||'未命名';};editor.append(name,formButton('移除',()=>{working.filters=working.filters.filter(f=>f.id!==selected);for(const [id,value] of Object.entries(working.assignments))if(value===selected)delete working.assignments[id];selected=working.filters[0]?.id||'';draw();}));
        for(const [key,title,options] of [['first','屬性一',PRIMARY],['second','屬性二',PRIMARY],['third','副屬性第一格',SECOND3],['fourth','副屬性第二格',SECOND4]]){
          const row=element('div',undefined,'ro-gear-detail-field');row.append(element('b',title),formMulti(options,settings[key],v=>settings[key]=v,'不限（可多選）'));editor.append(row);
        }
        const options=damageSkillOptions(),known=new Set(options.map(([id])=>id));for(const s of settings.skills)if(!known.has(s.id))options.push([s.id,s.id]);
        const skillRows=element('div',undefined,'ro-selected-skills'),thresholds=new Map(settings.skills.map(s=>[s.id,s.min]));
        const drawSkills=()=>{skillRows.replaceChildren();for(const skill of settings.skills){const row=element('label',undefined,'ro-gear-skill'),min=element('input');min.type='number';min.min='0';min.max='10000';min.step='0.1';min.value=Number.isFinite(skill.min)?String(skill.min):'';const title=options.find(([id])=>id===skill.id)?.[1]||skill.id;min.setAttribute('aria-label',title+'最低百分比');min.oninput=()=>{skill.min=min.value.trim()===''?NaN:Number(min.value);thresholds.set(skill.id,skill.min);};row.append(element('span',title),min,element('span','% 以上'));skillRows.append(row);}};
        const skillField=element('div',undefined,'ro-gear-detail-field');skillField.append(element('b','技能傷害'),formMulti(options,settings.skills.map(s=>s.id),ids=>{settings.skills=ids.map(id=>({id,min:thresholds.get(id)??0}));drawSkills();},'不限（可多選）'));editor.append(skillField,skillRows);drawSkills();
      }else editor.append(element('p','按「新增」建立可供裝備選用的細項過濾器。'));
      layout.append(sidebar,editor);panel.append(layout);
      const status=element('p','', 'ro-gear-error');panel.append(status,formButton('套用管理設定',()=>{
        const next={...filterDraft,...working};if(!validEquipmentFilter(next)){status.textContent='請填寫名稱，最低百分比必須為 0～10000 的有效數字。';return;}
        filterDraft.filters=copy(working.filters);filterDraft.assignments=copy(working.assignments);closeGearDetails();drawFilter();
      }),formButton('取消',closeGearDetails));
    };draw();
  }
  function parseFilterImport(text){
    if(typeof text!=='string'||text.length>500000)throw new Error('檔案過大');
    const data=JSON.parse(text);if(data?.format!=='ro-helper-equipment')throw new Error('不是有效的新版裝備過濾器');return migrateEquipmentFilter(data.settings);
  }
  function drawFilter(){
    if(!filterDialog||!filterDraft)return;
    const panel=filterDialog.querySelector('.ro-filter-panel');closeFilterMenus(panel);panel.replaceChildren();
    panel.append(element('h3','裝備圖鑑過濾器'),element('p','設定不要的稀有度、關閉不保留的 Tier；裝備右上角選取細項過濾器。任一已設定欄位未符合即納入「不需要」。只勾選目前商人分類，請檢查後自行出售。'));
    const toolbar=element('div',undefined,'ro-gear-toolbar');
    const rarities=element('div',undefined,'ro-rarity-buttons');
    for(const [id,name] of RARITIES){const button=formButton(name,()=>{filterDraft.unwantedRarities=filterDraft.unwantedRarities.includes(id)?filterDraft.unwantedRarities.filter(v=>v!==id):[...filterDraft.unwantedRarities,id];drawFilter();});button.dataset.unwantedRarity=id;button.style.setProperty('--rarity-color',COLORS[Number(id)]);button.classList.toggle('excluded',filterDraft.unwantedRarities.includes(id));button.setAttribute('aria-pressed',String(filterDraft.unwantedRarities.includes(id)));button.setAttribute('aria-label',name+' 不要');rarities.append(button);}
    const manager=formButton('管理細項過濾器',openGearDetails);manager.classList.add('ro-manage-details');
    toolbar.append(rarities);
    const batch=element('div',undefined,'ro-tier-batch'),cutoff=element('select');cutoff.dataset.excludeTierSelect='';cutoff.setAttribute('aria-label','批次過濾階級');
    for(let tier=1;tier<equipmentMaxTier();tier++){const option=element('option','T'+tier+' 以下');option.value=String(tier);option.selected=tier===filterExcludeTier;cutoff.append(option);}
    cutoff.onchange=()=>{filterExcludeTier=Number(cutoff.value);};
    const applyTier=formButton('套用過濾',()=>{const tier=Number(cutoff.value);if(!Number.isInteger(tier)||tier<1||tier>=equipmentMaxTier())return;filterExcludeTier=tier;excludeEquipmentTiers(filterDraft,tier);drawFilter();});applyTier.dataset.excludeTierApply='';
    batch.append(cutoff,applyTier);toolbar.append(batch);
    toolbar.append(manager);panel.append(toolbar);
    const actions=element('div',undefined,'ro-gear-actions'),status=element('span','');
    const save=formButton('儲存並套用',()=>{
      if(!validEquipmentFilter(filterDraft)){status.textContent='設定不完整，無法儲存';return;}
      try{localStorage.setItem(FILTER_KEY,JSON.stringify(filterDraft));filterStore=copy(filterDraft);closeFilter();notify('圖鑑過濾器已儲存');}catch{status.textContent='儲存失敗，請匯出備份';}
    });save.dataset.filterSave='';
    actions.append(save,formButton('取消',closeFilter),formButton('全部保留',()=>{filterDraft={...emptyEquipmentFilter(),filters:copy(filterDraft.filters)};drawFilter();}),formButton('匯出',()=>{
      const url=URL.createObjectURL(new Blob([JSON.stringify({format:'ro-helper-equipment',settings:filterDraft},null,2)],{type:'application/json'}));
      const a=element('a');a.href=url;a.download='RO裝備圖鑑過濾器.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }));
    const file=element('input');file.type='file';file.accept='.json,application/json';file.hidden=true;
    file.onchange=async()=>{try{const f=file.files?.[0];if(!f)return;if(f.size>500000)throw new Error('檔案過大');filterDraft=parseFilterImport(await f.text());drawFilter();}catch(error){status.textContent='匯入失敗：'+error.message;}};
    actions.append(file,formButton('匯入',()=>file.click()),status);panel.append(actions);
    const tabs=element('nav',undefined,'ro-gear-tabs'),counts=equipmentGroups();
    for(const [id,name] of GEAR_SLOTS){const button=formButton(name+' '+counts.filter(g=>g.slot===id).length,()=>{filterSlot=id;filterWeaponType='';drawFilter();});button.dataset.gearSlot=id;button.classList.toggle('active',id===filterSlot);button.setAttribute('aria-pressed',String(id===filterSlot));tabs.append(button);}panel.append(tabs);
    if(['onehand','twohand'].includes(filterSlot)){
      const weapons=counts.filter(g=>g.slot===filterSlot),subtabs=element('nav',undefined,'ro-gear-tabs ro-weapon-tabs');subtabs.setAttribute('aria-label','武器細項分類');
      const available=new Set(weapons.map(groupWeaponType));
      const types=[['','全部'],...weaponTypeLabels.filter(([id])=>available.has(id)),...[...available].filter(id=>!weaponTypeLabels.some(([known])=>known===id)).map(id=>[id,'其他（'+id+'）'])];
      for(const [id,name] of types){const count=id?weapons.filter(g=>groupWeaponType(g)===id).length:weapons.length;const button=formButton(name+' '+count,()=>{filterWeaponType=id;drawFilter();});button.dataset.weaponType=id;button.classList.toggle('active',filterWeaponType===id);button.setAttribute('aria-pressed',String(filterWeaponType===id));subtabs.append(button);}panel.append(subtabs);
    }
    const search=element('input');search.type='search';search.placeholder='搜尋裝備、屬性、關卡或中文怪物';search.value=filterSearch;search.setAttribute('aria-label','搜尋裝備圖鑑');
    const summary=element('p'),cards=element('div',undefined,'ro-gear-grid');search.oninput=()=>{filterSearch=search.value;drawEquipmentCards(cards,summary);};panel.append(search,summary,cards);
    panel.append(element('p','屬性依遊戲目前載入的裝備 ID、固有加成與 Tier 函式顯示（未計入精煉、隨機詞綴或卡片）。名稱與掉落來源快照：2026-11-16；同名裝備依 ID 分開。未列出的特殊裝備或缺少必要判斷資料時保留手動檢查。'));
    drawEquipmentCards(cards,summary);
  }
  function closeFilter(){closeFilterMenus();closeGearDetails();filterDialog?.remove();filterDialog=null;filterDraft=null;}
  function openFilter(){
    closeFilter();filterDraft=copy(filterStore);filterDialog=element('div');filterDialog.id='ro-unwanted-dialog';filterDialog.setAttribute('role','dialog');filterDialog.setAttribute('aria-label','裝備圖鑑過濾器');filterDialog.setAttribute('aria-modal','true');
    const panel=element('div',undefined,'ro-filter-panel ro-equipment-filter');filterDialog.append(panel);document.body.append(filterDialog);
    filterDialog.onclick=event=>{if(event.target===filterDialog)closeFilter();};drawFilter();
  }
