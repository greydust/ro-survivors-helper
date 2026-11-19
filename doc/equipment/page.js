(() => {
  'use strict';
  const data=JSON.parse(document.querySelector('#equipment-data').textContent);
  const categories=document.querySelector('#categories'),subtypes=document.querySelector('#subtypes'),grid=document.querySelector('#equipment');
  const search=document.querySelector('#search'),result=document.querySelector('#result');
  let category=data.slots[0][0],subtype='';
  const names=new Map(data.weaponTypes);
  const searchable=record=>[record.name,...record.tiers.flatMap(row=>row.bonuses),...record.sources.flatMap(source=>[source.stage,source.monster])].join(' ').toLocaleLowerCase();
  const searchIndex=new Map(data.records.map(record=>[record.id,searchable(record)]));
  function button(label,active,action){
    const node=document.createElement('button');node.type='button';node.textContent=label;node.classList.toggle('active',active);node.setAttribute('aria-pressed',String(active));node.onclick=action;return node;
  }
  function render(){
    const query=search.value.trim().toLocaleLowerCase();
    categories.replaceChildren();
    for(const [id,label] of data.slots){
      const count=data.records.filter(record=>record.slot===id).length;
      const node=button(label,!query&&category===id,()=>{category=id;subtype='';search.value='';render();});
      node.dataset.category=id;const number=document.createElement('small');number.textContent=count;node.append(number);categories.append(node);
    }
    subtypes.replaceChildren();
    const available=new Set(data.records.filter(record=>record.slot===category).map(record=>record.wtype));
    if(!query&&['onehand','twohand'].includes(category)){
      const types=[['','全部'],...data.weaponTypes.filter(([id])=>available.has(id)),...[...available].filter(id=>!names.has(id)).map(id=>[id,'其他'])];
      for(const [id,label] of types){const node=button(label,subtype===id,()=>{subtype=id;render();});node.dataset.subtype=id;subtypes.append(node);}
    }
    subtypes.hidden=!subtypes.children.length;
    const records=data.records.filter(record=>query?searchIndex.get(record.id).includes(query):record.slot===category&&(!subtype||record.wtype===subtype));
    grid.replaceChildren();
    for(const record of records){
      const card=document.createElement('article');card.className='gear';card.dataset.itemId=record.id;
      const header=document.createElement('header'),icon=document.createElement('img'),title=document.createElement('h2'),id=document.createElement('small');
      icon.src=record.icon;icon.alt='';icon.loading='lazy';title.textContent=record.name;id.textContent='#'+record.id;header.append(icon,title,id);card.append(header);
      for(const row of record.tiers){
        const line=document.createElement('div');line.className='tier'+(row.bonuses.length?'':' empty');line.dataset.tier=row.tier;
        const tier=document.createElement('b'),text=document.createElement('span');tier.textContent='T'+row.tier;text.textContent=row.bonuses.join(' · ')||'無固定加成';line.append(tier,text);card.append(line);
      }
      const list=document.createElement('ul'),sources=new Map();
      for(const source of record.sources){
        const key=source.stage;
        if(!sources.has(key))sources.set(key,{stage:source.stage,monsters:new Set()});
        sources.get(key).monsters.add((source.boss?'👑 ':'')+source.monster+(source.rare?'（闖入者）':''));
      }
      for(const source of sources.values()){
        const line=document.createElement('li'),stage=document.createElement('b');stage.textContent=source.stage;
        line.append(stage,document.createTextNode('：'+[...source.monsters].join('、')));list.append(line);
      }
      list.className='gear-sources';list.setAttribute('aria-label','掉落來源');
      card.insertBefore(list,header.nextSibling);grid.append(card);
    }
    if(!records.length){const note=document.createElement('p');note.className='empty-result';note.textContent='沒有符合的裝備，請換個分類或關鍵字。';grid.append(note);}
    const label=query?'搜尋全部部位':data.slots.find(([id])=>id===category)[1]+(subtype?'／'+(names.get(subtype)||'其他'):'');
    result.textContent=label+'：'+records.length+' 件裝備';
  }
  document.querySelector('#snapshot-note').textContent='資料快照 '+data.updatedAt+' · '+data.records.length+' 件裝備 · 最高 T'+data.maxTier;
  search.oninput=render;render();
})();
