  const FILTER_KEY = 'greydust.ro.unwanted.v1';
  const PRIMARY = [['str','STR'],['agi','AGI'],['vit','VIT'],['int','INT'],['dex','DEX'],['luk','LUK']];
  const SECOND3 = [['crit','爆擊'],['cd','急速'],['area','範圍'],['pierce','穿透機率']];
  const SECOND4 = [['spd','移動速度'],['flee','Flee'],['armor','護甲'],['hp','最大 HP']];
  const GEAR_SLOTS = [['weapon','武器'],['twohand','雙手武'],['onehand','單手武'],['shield','盾牌'],['head_top','頭部（上）'],['head_mid','頭部（中）'],['head_low','頭部（下）'],['armor','護甲'],['garment','披肩'],['shoes','鞋子'],['acc','飾品']];
  const RARITIES=[['0','普通'],['1','優良'],['2','稀有'],['3','史詩'],['4','傳說']];
  const RULE_TYPES = [['rarity','稀有度'],['tier','Tier'],['slot','部位與基底'],['primary','屬性'],['secondary','副屬性'],['skill','技能傷害'],['not','NOT'],['and','AND'],['or','OR']];
  const newProfile = () => ({id: String(Date.now()) + Math.random().toString(36).slice(2),name:'未命名過濾器',rule:null});
  let filterStore = {version:1,activeId:'',profiles:[]}, filterDraft = null, filterDialog = null;
  const collapsedRules=new WeakSet();
  const selections=value=>Array.isArray(value)?value:(value===undefined||value===null||value===''?[]:[value]);
  function validRule(node, depth=0, budget={left:200}) {
    if (!node || typeof node !== 'object' || depth>8 || --budget.left<0) return false;
    const oneOf=(value,options)=>selections(value).length<=options.length&&selections(value).every(entry=>typeof entry==='string'&&options.some(([id])=>id===entry));
    if (node.type==='rarity') return selections(node.values).length>0&&oneOf(node.values,RARITIES);
    if (node.type==='tier') return ['<=','=','>='].includes(node.op) && Number.isInteger(node.value) && node.value>=1 && node.value<=10000;
    if (node.type==='slot') return GEAR_SLOTS.some(([id])=>id===node.slot) && selections(node.base).length<=1000&&selections(node.base).every(id=>(typeof id==='string'||Number.isInteger(id))&&/^\d+$/.test(String(id)));
    if (node.type==='primary') return selections(node.first).length>0&&oneOf(node.first,PRIMARY)&&oneOf(node.second,PRIMARY)&&(!selections(node.second).length||selections(node.first).some(a=>selections(node.second).some(b=>a!==b)));
    if (node.type==='secondary') return !!(selections(node.third).length||selections(node.fourth).length) && oneOf(node.third,SECOND3) && oneOf(node.fourth,SECOND4);
    if (node.type==='skill') return selections(node.skill).length>0&&selections(node.skill).length<=500&&selections(node.skill).every(id=>typeof id==='string'&&id.length>0&&id.length<100);
    if (['not','and','or'].includes(node.type)) return Array.isArray(node.children)
      && (node.type==='not'?node.children.length===1:node.children.length>=1)
      && node.children.length<=50 && node.children.every(child=>validRule(child,depth+1,budget));
    return false;
  }
  function matchesRule(node,item) {
    if (!validRule(node) || !item || !Array.isArray(item.affixes) || !smithDefs?.[item.itemId]) return false;
    // Unknown legacy tiers are never guessed, including inside a NOT expression.
    const needsTier=n=>n.type==='tier'||(n.children||[]).some(needsTier);
    if (needsTier(node) && (!Number.isInteger(item.tier)||item.tier<1)) return false;
    const needsRarity=n=>n.type==='rarity'||(n.children||[]).some(needsRarity);
    if(needsRarity(node)&&(!Number.isInteger(item.quality??0)||(item.quality??0)<0||(item.quality??0)>4))return false;
    const evaluate=n=>{
      if(n.type==='and')return n.children.every(evaluate);
      if(n.type==='or')return n.children.some(evaluate);
      if(n.type==='not')return !evaluate(n.children[0]);
      if(n.type==='rarity')return selections(n.values).includes(String(item.quality??0));
      if(n.type==='tier')return n.op==='<='?item.tier<=n.value:n.op==='>='?item.tier>=n.value:item.tier===n.value;
      if(n.type==='slot') {
        const def=smithDefs[item.itemId];
        return (n.slot==='weapon'?def.slot==='weapon':smithCategory(def)===n.slot)&&(!selections(n.base).length||selections(n.base).some(id=>String(item.itemId)===String(id)));
      }
      const has=stat=>item.affixes.some(affix=>affix.stat===stat);
      if(n.type==='primary')return selections(n.first).some(a=>has(a)&&(!selections(n.second).length||selections(n.second).some(b=>a!==b&&has(b))));
      if(n.type==='secondary')return (!selections(n.third).length||selections(n.third).some(has))&&(!selections(n.fourth).length||selections(n.fourth).some(has));
      if(n.type==='skill')return item.affixes.some(affix=>affix.stat==='skill'&&selections(n.skill).includes(affix.skill));
      return false;
    };
    return evaluate(node);
  }
  function loadFilterStore() {
    try {
      const saved=JSON.parse(localStorage.getItem(FILTER_KEY)||'null');
      if(saved?.version===1 && Array.isArray(saved.profiles) && saved.profiles.length<=50) {
        filterStore={version:1,activeId:String(saved.activeId||''),profiles:saved.profiles.filter(p=>p&&typeof p.id==='string'&&typeof p.name==='string'&&(p.rule===null||validRule(p.rule)))};
      }
    } catch(error){console.warn('[RO助手] 商人過濾器設定讀取失敗',error);}
    if(!filterStore.profiles.length)filterStore.profiles.push(newProfile());
    if(!filterStore.profiles.some(p=>p.id===filterStore.activeId))filterStore.activeId=filterStore.profiles[0].id;
  }
  const currentProfile=store=>store.profiles.find(p=>p.id===store.activeId)||store.profiles[0];
  const copy=value=>JSON.parse(JSON.stringify(value));
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
    const rule=currentProfile(filterStore)?.rule;
    if(!validRule(rule)){openFilter();notify('請先設定並儲存一條完整規則');return;}
    let captured;
    try{captured=captureMerchantInventory();}catch(error){console.warn('[RO助手] 讀取商人清單失敗',error);notify('讀取商人清單失敗，未變更選取');return;}
    if(!captured){notify('無法讀取商人裝備資料，未變更選取');return;}
    const {inventory,selection}=captured;
    const byId=new Map(inventory.map(item=>[item.uid,item]));
    const cells=[...document.querySelectorAll('#shop-items [data-uid]')];
    if(cells.some(cell=>!byId.has(cell.dataset.uid))){notify('商人資料與清單不一致，未變更選取');return;}
    const targets=cells.filter(cell=>!cell.classList.contains('worn')&&!cell.classList.contains('safe'))
      .map(cell=>byId.get(cell.dataset.uid)).filter(item=>!item.safe&&!item.owner&&!smithDefs[item.itemId]?.starter&&matchesRule(rule,item)).map(item=>item.uid);
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
  function formSelect(options,value,onchange,placeholder='請選擇') {
    const select=document.createElement('select');
    for(const [id,name] of [['',placeholder],...options]){const option=document.createElement('option');option.value=id;option.textContent=name;if(String(id)===String(value||''))option.selected=true;select.append(option);}
    select.onchange=()=>onchange(select.value);return select;
  }
  function formButton(text,action) {const button=document.createElement('button');button.type='button';button.className='ro-btn small';button.textContent=text;button.onclick=action;return button;}
  function formMulti(options,value,onchange,placeholder='不限') {
    const details=document.createElement('details');details.className='ro-filter-multi';
    const summary=document.createElement('summary'),list=document.createElement('div');list.className='ro-filter-multi-list';details.append(summary,list);
    let selected=selections(value).map(String);
    const refresh=()=>{const names=options.filter(([id])=>selected.includes(String(id))).map(([,name])=>name.split(' ｜ ')[0]);summary.textContent=names.length?names.join('、')+'（OR）':placeholder;};
    const clear=formButton('清除選擇',()=>{selected=[];list.querySelectorAll('input').forEach(input=>input.checked=false);refresh();onchange([]);});list.append(clear);
    for(const [id,name,metadata]of options){
      const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=id;input.checked=selected.includes(String(id));
      input.onchange=()=>{selected=input.checked?[...new Set([...selected,String(id)])]:selected.filter(entry=>entry!==String(id));refresh();onchange([...selected]);};
      label.append(input);
      if(metadata){
        const content=document.createElement('span');content.className='ro-filter-base-info';content.append(document.createTextNode(metadata.name+' '));
        const tags=document.createElement('span');tags.className='wk-star ro-filter-tier-tags';
        for(const tier of metadata.tiers){const tag=document.createElement('em');tag.textContent='T'+tier;tags.append(tag);}
        content.append(tags);
        if(!metadata.tiers.length)content.append(document.createTextNode(metadata.tierNote));
        content.append(document.createTextNode(' ｜ '+metadata.bonuses));label.append(content);
      }else label.append(document.createTextNode(name));
      list.append(label);
    }
    refresh();return details;
  }
  function nodeDefault(type){return ['and','or'].includes(type)?{type,children:[{type:'tier',op:'<=',value:null},{type:'tier',op:'<=',value:null}]}:type==='not'?{type,children:[{type:'tier',op:'<=',value:null}]}:{type};}
  function baseOptions(slot) {
    if(!smithDefs||!smithAssets?.manifest?.items)return [];
    return Object.entries(smithDefs).filter(([,def])=>slot==='weapon'?def.slot==='weapon':smithCategory(def)===slot)
      .filter(([id])=>smithAssets.manifest.items[id]&&baseDropTiers(Number(id)).length>0).map(([id])=>{
        const name=gameCatalog?.bp?.(Number(id),'')||smithAssets.manifest.items[id].name||`#${id}`;
        const info=baseDisplay(Number(id));
        return {id,name,label:`${name} ｜ ${baseDetails(Number(id))}`,metadata:{name,...info}};
      }).sort((a,b)=>a.name.localeCompare(b.name,'zh-Hant')).map(item=>[item.id,item.label,item.metadata]);
  }
  const STAGE_TIERS={prontera:1,sewer:1,sunken:1,byalan:2,payon:2,payon_cave:2,prt_castle:2,orcs:3,pyramid:3,maze:3};
  let tierIndexSource=null,tierDropSource=null;
  const baseTierIndex=new Map();
  function baseDropTiers(id){
    const stages=gameCatalog?.ca,drops=gameCatalog?.cb;
    if(!stages||!drops)return [];
    if(tierIndexSource!==stages||tierDropSource!==drops){
      tierIndexSource=stages;tierDropSource=drops;baseTierIndex.clear();
      const add=(itemId,tier)=>{if(!baseTierIndex.has(Number(itemId)))baseTierIndex.set(Number(itemId),new Set());baseTierIndex.get(Number(itemId)).add(tier);};
      // These are the native region tiers, not the independently adjustable
      // difficulty slider labelled 刷關等級. Special shop/event sources are not
      // claimed to be covered by the normal expedition drop table.
      for(const [stageId,tier] of Object.entries(STAGE_TIERS)){
        const stage=stages[stageId];if(!stage)continue;
        const monsters=new Set([...(stage.waves||[]).flatMap(wave=>wave.pool||[]),...(stage.bosses||[]).map(boss=>boss.id)]);
        for(const monster of monsters)for(const drop of drops[monster]||[])add(drop.id,tier);
        if(Number.isInteger(stage.reward))add(stage.reward,tier);
      }
    }
    return [...(baseTierIndex.get(Number(id))||[])].sort((a,b)=>a-b);
  }
  const bonusText=(bonus,multiplier)=>String(bonus.text(multiplier)).replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();
  function tierFormula(bonus){
    const first=bonusText(bonus,1).replace(/^★\s*/,''),second=bonusText(bonus,2).replace(/^★\s*/,'');
    const pattern=/\d+(?:[.,]\d+)?/g,ones=[...first.matchAll(pattern)],twos=[...second.matchAll(pattern)];
    if(ones.length!==twos.length||first.replace(pattern,'#')!==second.replace(pattern,'#'))return first;
    let index=0;
    return first.replace(pattern,token=>{
      const one=Number(token.replace(',','.')),two=Number(twos[index++][0].replace(',','.'));
      if(one!==0&&Math.abs(two-2*one)<1e-8)return one===1?'T':'T×'+token;
      return token;
    });
  }
  function baseDisplay(id){
    const def=smithDefs?.[id];if(!def)return {tiers:[],tierNote:'資料未列',bonuses:'資料未列'};
    const tiers=baseDropTiers(id);
    const text=(def.bonuses||[]).filter(bonus=>typeof bonus?.text==='function').map(bonus=>{
      try{return bonusText(bonus,1);}catch{return '';}
    }).filter(Boolean);
    try{if(typeof gameCatalog?.bs==='function')text.push(...gameCatalog.bs(id,1).map(tierFormula));}catch{ /* Keep known base bonuses. */ }
    return {tiers,tierNote:tiers.length?'':def.starter?'初始裝備':'Tier 未列',bonuses:text.length?text.join('、'):'無額外詞條'};
  }
  function baseDetails(id){
    const info=baseDisplay(id);
    return (info.tiers.length?info.tiers.map(tier=>'[T'+tier+']').join(' '):info.tierNote)+' ｜ '+info.bonuses;
  }
  function damageSkillOptions() {
    try {
      const ids=gameCatalog?.bU?.();
      if(!Array.isArray(ids))return [];
      return [...new Set(ids)].filter(id=>skillDefs?.[id]).map(id=>[id,`${skillDefs[id].name}傷害`]).sort((a,b)=>a[1].localeCompare(b[1],'zh-Hant'));
    } catch{return [];}
  }
  function parseFilterImport(text) {
    if(typeof text!=='string'||text.length>100000)throw new Error('檔案過大');
    const data=JSON.parse(text);
    if(data?.format!=='ro-helper-unwanted'||data.version!==1||typeof data.name!=='string'||!validRule(data.rule))throw new Error('格式或規則不正確');
    const knownSkills=new Set(damageSkillOptions().map(([id])=>id));
    const check=node=>{
      if(node.type==='skill'&&knownSkills.size&&selections(node.skill).some(id=>!knownSkills.has(id)))throw new Error('包含遊戲不能骰出的技能傷害');
      if(node.type==='slot'&&smithDefs){
        for(const id of selections(node.base)){
          const def=smithDefs[id];
          if(!def||(node.slot==='weapon'?def.slot!=='weapon':smithCategory(def)!==node.slot))throw new Error('基底不屬於指定部位');
        }
      }
      (node.children||[]).forEach(check);
    };check(data.rule);return data;
  }
  function ruleEditor(node,setNode,depth=0,onRemove=null,movement=null) {
    const box=document.createElement('div');box.className='ro-filter-rule';
    const header=document.createElement('div');header.className='ro-filter-rule-header';box.append(header);
    const order=document.createElement('span');order.className='ro-filter-order';
    for(const [direction,label]of [['up','↑'],['down','↓']]){
      const button=formButton(label,()=>movement?.[direction]?.());button.disabled=!movement?.[direction];button.setAttribute('data-filter-move',direction);button.setAttribute('aria-label',direction==='up'?'上移規則':'下移規則');order.append(button);
    }header.append(order);
    if(node&&['and','or'].includes(node.type)){
      const collapsed=collapsedRules.has(node);
      const toggle=formButton(collapsed?'+':'−',()=>{if(collapsedRules.has(node))collapsedRules.delete(node);else collapsedRules.add(node);drawFilter();});
      toggle.setAttribute('data-filter-collapse','');toggle.setAttribute('aria-expanded',String(!collapsed));toggle.setAttribute('aria-label',collapsed?'展開規則':'折疊規則');header.append(toggle);
    }
    header.append(formSelect(depth>=8?RULE_TYPES.filter(([id])=>!['and','or','not'].includes(id)):RULE_TYPES,node?.type,type=>{setNode(type?nodeDefault(type):null);drawFilter();},'選擇規則類型'));
    const remove=()=>{if(onRemove){const button=formButton('刪除此子規則',onRemove);button.setAttribute('data-filter-remove','');header.append(button);}};
    if(!node){remove();return box;}
    const subtreeDepth=value=>value?.children?.length?1+Math.max(...value.children.map(subtreeDepth)):0;
    const wrapControl=()=>{
      if(depth+subtreeDepth(node)>=8)return;
      const wrap=formSelect([['and','AND'],['or','OR'],['not','NOT']],null,type=>{
        if(!['and','or','not'].includes(type))return;
        setNode({type,children:[node]});drawFilter();
      },'包入…');
      wrap.setAttribute('data-filter-wrap','');wrap.setAttribute('aria-label','將此規則包入新規則');header.append(wrap);
    };
    const change=()=>{drawFilter();};
    const field=(title,el)=>{const label=document.createElement(el.tagName==='DETAILS'?'div':'label');label.className='ro-filter-field';label.append(document.createTextNode(title+' '),el);header.append(label);};
    if(['and','or','not'].includes(node.type)) {
      remove();
      wrapControl();
      if(collapsedRules.has(node))return box;
      (node.children||[]).forEach((child,index)=>{
        const move=offset=>{const other=index+offset;[node.children[index],node.children[other]]=[node.children[other],node.children[index]];change();};
        const childBox=ruleEditor(child,value=>node.children[index]=value,depth+1,node.type!=='not'?()=>{node.children.splice(index,1);change();}:null,{up:index>0?()=>move(-1):null,down:index<node.children.length-1?()=>move(1):null});
        if(node.type==='not'){
          box.classList.add('ro-filter-not');childBox.classList.add('ro-filter-inline-child');header.append(childBox);
        }else box.append(childBox);
      });
      if(node.type!=='not'&&depth<8&&node.children.length<50)box.append(formButton('＋新增子規則',()=>{node.children.push(null);change();}));
    } else if(node.type==='rarity') {
      field('稀有度',formMulti(RARITIES,node.values,value=>{node.values=value;updateFilterValidity();},'請選擇（可多選）'));
    } else if(node.type==='tier') {
      field('比較',formSelect([['<=','≤'],['=','='],['>=','≥']],node.op||'<=',value=>{node.op=value;change();}));node.op ||= '<=';
      const input=document.createElement('input');input.type='number';input.min='1';input.max='10000';input.step='1';input.value=node.value??'';
      input.oninput=()=>{node.value=input.value===''?null:Number(input.value);updateFilterValidity();};field('Tier',input);
    } else if(node.type==='slot') {
      field('部位',formSelect(GEAR_SLOTS,node.slot,value=>{node.slot=value;node.base='';change();}));
      if(node.slot)field('基底',formMulti(baseOptions(node.slot),node.base,value=>{node.base=value;updateFilterValidity();},'全部基底'));
    } else if(node.type==='primary') {
      field('第一個屬性',formMulti(PRIMARY,node.first,value=>{const hadFirst=selections(node.first).length>0;node.first=value;if(!value.length)node.second=[];if(hadFirst!==!!value.length)change();else updateFilterValidity();},'請選擇（可多選）'));
      if(selections(node.first).length)field('第二個屬性',formMulti(PRIMARY,node.second,value=>{node.second=value;updateFilterValidity();},'不限'));
      else{const disabled=document.createElement('span');disabled.textContent='第二個屬性：請先選第一個屬性';header.append(disabled);}
    } else if(node.type==='secondary') {
      field('第三類詞條',formMulti(SECOND3,node.third,value=>{node.third=value;updateFilterValidity();},'不限'));
      field('第四類詞條',formMulti(SECOND4,node.fourth,value=>{node.fourth=value;updateFilterValidity();},'不限'));
    } else if(node.type==='skill') {
      const options=damageSkillOptions();field('技能傷害',formMulti(options,node.skill,value=>{node.skill=value;updateFilterValidity();},options.length?'請選擇技能（可多選）':'技能資料尚未就緒，請稍後重開'));
    }
    if(!['and','or','not'].includes(node.type)){wrapControl();remove();}
    return box;
  }
  function updateFilterValidity(){
    const rule=currentProfile(filterDraft)?.rule,valid=rule===null||validRule(rule);
    const status=filterDialog?.querySelector('[data-filter-status]');if(status)status.textContent=rule===null?'未設定規則，不會選取任何裝備':valid?'規則完整，可儲存並使用':'規則尚未完整；AND／OR 至少一條、NOT 恰好一條。空白規則不會選取裝備。';
    const save=filterDialog?.querySelector('[data-filter-save]');if(save)save.disabled=!valid;
  }
  function drawFilter(){
    if(!filterDialog||!filterDraft)return;
    const panel=filterDialog.querySelector('.ro-filter-panel');panel.replaceChildren();
    const heading=document.createElement('h3');heading.textContent='不需要裝備過濾器';panel.append(heading);
    const help=document.createElement('p');help.textContent='只有一條根規則；用 AND／OR 組合條件，用 NOT 反向匹配。「不需要」會重新勾選目前商人分類，排除穿著中、保護中與初始裝備，不會自動出售。';panel.append(help);
    panel.append(formSelect(filterDraft.profiles.map(p=>[p.id,p.name]),filterDraft.activeId,id=>{if(id){filterDraft.activeId=id;drawFilter();}},'選擇過濾器'));
    panel.append(formButton('新增',()=>{if(filterDraft.profiles.length>=50){notify('最多保存 50 個過濾器');return;}const p=newProfile();filterDraft.profiles.push(p);filterDraft.activeId=p.id;drawFilter();}),formButton('刪除',()=>{
      filterDraft.profiles=filterDraft.profiles.filter(p=>p.id!==filterDraft.activeId);if(!filterDraft.profiles.length)filterDraft.profiles.push(newProfile());filterDraft.activeId=filterDraft.profiles[0].id;drawFilter();
    }));
    const profile=currentProfile(filterDraft),name=document.createElement('input');name.type='text';name.maxLength=80;name.value=profile.name;name.placeholder='過濾器名稱';name.oninput=()=>profile.name=name.value;panel.append(name);
    panel.append(ruleEditor(profile.rule,value=>profile.rule=value));
    const status=document.createElement('p');status.setAttribute('data-filter-status','');panel.append(status);
    const save=formButton('儲存並套用',()=>{
      if(profile.rule!==null&&!validRule(profile.rule))return;
      // Unfinished inactive profiles are not persisted.
      const next=copy(filterDraft);next.profiles=next.profiles.filter(p=>p.rule===null||validRule(p.rule));next.profiles.forEach(p=>p.name=p.name.trim()||'未命名過濾器');
      try{localStorage.setItem(FILTER_KEY,JSON.stringify(next));filterStore=next;closeFilter();notify('商人過濾器已儲存');}catch{notify('儲存失敗，請匯出備份');}
    });save.setAttribute('data-filter-save','');panel.append(save,formButton('取消',closeFilter));
    panel.append(formButton('匯出此過濾器',()=>{
      if(!validRule(profile.rule)){notify('請先完成規則再匯出');return;}
      const data={format:'ro-helper-unwanted',version:1,name:profile.name,rule:profile.rule};
      const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download=(profile.name||'RO過濾器').replace(/[<>:"/\\|?*]/g,'_')+'.json';link.hidden=true;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }));
    const file=document.createElement('input');file.type='file';file.accept='.json,application/json';file.hidden=true;
    file.onchange=async()=>{
      try{
        const selected=file.files?.[0];if(!selected)return;if(selected.size>100000)throw new Error('檔案過大');
        const data=parseFilterImport(await selected.text());
        if(filterDraft.profiles.length>=50)throw new Error('最多保存 50 個過濾器');
        const p=newProfile();p.name=data.name.slice(0,80);p.rule=copy(data.rule);filterDraft.profiles.push(p);filterDraft.activeId=p.id;drawFilter();notify('已匯入；按儲存並套用後生效');
      }catch(error){notify('匯入失敗：'+error.message);}
    };panel.append(file,formButton('匯入',()=>file.click()));updateFilterValidity();
  }
  function closeFilter(){filterDialog?.remove();filterDialog=null;filterDraft=null;}
  function openFilter(){
    closeFilter();filterDraft=copy(filterStore);filterDialog=document.createElement('div');filterDialog.id='ro-unwanted-dialog';filterDialog.setAttribute('role','dialog');filterDialog.setAttribute('aria-label','不需要裝備過濾器');filterDialog.setAttribute('aria-modal','true');
    const panel=document.createElement('div');panel.className='ro-filter-panel';filterDialog.append(panel);document.body.append(filterDialog);
    filterDialog.onclick=event=>{if(event.target===filterDialog)closeFilter();};drawFilter();
  }

