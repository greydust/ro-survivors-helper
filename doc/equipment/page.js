(() => {
  'use strict';
  const data=JSON.parse(document.querySelector('#equipment-data').textContent);
  const categories=document.querySelector('#categories'),subtypes=document.querySelector('#subtypes'),grid=document.querySelector('#equipment');
  const search=document.querySelector('#search'),job=document.querySelector('#job'),tier=document.querySelector('#tier'),result=document.querySelector('#result');
  let category='all',subtype='';
  const names=new Map(data.weaponTypes),slots=[['all','全部部位'],...data.slots];
  const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
  for(const entry of data.jobs){const option=node('option',entry.name);option.value=entry.id;job.append(option);}job.value='swordsman';
  for(let n=data.maxTier;n>=1;n--){const option=node('option','T'+n);option.value=String(n);tier.append(option);}tier.value=String(data.maxTier);
  function button(label,active,action){const el=node('button',label);el.type='button';el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));el.onclick=action;return el;}
  function render(){
    const query=search.value.trim().toLocaleLowerCase(),selectedTier=Number(tier.value);
    const eligible=data.records.filter(record=>record.jobs.includes(job.value)&&record.tiers.some(row=>row.tier===selectedTier));
    const rowOf=record=>record.tiers.find(row=>row.tier===selectedTier);
    const searchable=record=>[record.name,record.id,...rowOf(record).bonuses,...data.allocations[rowOf(record).maxGS[job.value].allocation].text,...record.sources.flatMap(source=>[source.stage,source.monster])].join(' ').toLocaleLowerCase();
    categories.replaceChildren();
    for(const [id,label] of slots){
      const count=eligible.filter(record=>(id==='all'||record.slot===id)&&(!query||searchable(record).includes(query))).length;
      const el=button(label,!query&&category===id,()=>{category=id;subtype='';search.value='';render();});el.dataset.category=id;el.append(node('small',count));categories.append(el);
    }
    subtypes.replaceChildren();
    const available=new Set(eligible.filter(record=>record.slot===category).map(record=>record.wtype));
    if(subtype&&!available.has(subtype))subtype='';
    if(!query&&['onehand','twohand'].includes(category)){
      const types=[['','全部'],...data.weaponTypes.filter(([id])=>available.has(id)),...[...available].filter(id=>!names.has(id)).map(id=>[id,'其他'])];
      for(const [id,label] of types){const el=button(label,subtype===id,()=>{subtype=id;render();});el.dataset.subtype=id;subtypes.append(el);}
    }
    subtypes.hidden=!subtypes.children.length;
    const records=eligible.filter(record=>query?searchable(record).includes(query):(category==='all'||record.slot===category)&&(!subtype||record.wtype===subtype));
    records.sort((a,b)=>rowOf(b).maxGS[job.value].gs-rowOf(a).maxGS[job.value].gs||a.id-b.id);
    grid.replaceChildren();
    for(const record of records){
      const row=rowOf(record),maximum=row.maxGS[job.value],allocation=data.allocations[maximum.allocation];
      const card=node('article',undefined,'gear');card.dataset.itemId=record.id;card.dataset.score=maximum.gs;card.dataset.tier=selectedTier;
      const header=node('header'),icon=node('img'),title=node('h2',record.name),id=node('small','#'+record.id);
      icon.src=record.icon;icon.alt='';icon.loading='lazy';header.append(icon,title,id);card.append(header);
      const list=node('ul',undefined,'gear-sources'),sources=new Map();list.setAttribute('aria-label','掉落來源');
      for(const source of record.sources){if(!sources.has(source.stage))sources.set(source.stage,new Set());sources.get(source.stage).add((source.boss?'👑 ':'')+source.monster+(source.rare?'（闖入者）':''));}
      for(const [stage,monsters] of sources){const line=node('li');line.append(node('b',stage),document.createTextNode('：'+[...monsters].join('、')));list.append(line);}card.append(list);
      const score=node('div',undefined,'max-gs');score.append(node('span','理論最高 GS'),node('strong',maximum.gs.toLocaleString('zh-TW')));card.append(score);
      const stats=Object.entries(row.base).filter(([,value])=>value!==0).map(([key,value])=>key.toUpperCase()+' '+value).join(' · ');
      card.append(node('p',stats||'無基礎 ATK／MATK／DEF','base-stats'));
      const fixed=node('div',undefined,'tier'+(row.bonuses.length?'':' empty'));fixed.dataset.tier=selectedTier;
      fixed.append(node('b','T'+selectedTier),node('span',row.bonuses.join(' · ')||'無固定加成'));card.append(fixed);
      const section=node('section',undefined,'allocation'),affixes=node('ul');section.append(node('b','最高 GS 詞綴範例'));
      for(const text of allocation.text)affixes.append(node('li',text));section.append(affixes);card.append(section);grid.append(card);
    }
    if(!records.length)grid.append(node('p','沒有符合此職業與 Tier 的裝備，請調整條件。','empty-result'));
    const label=query?'搜尋全部部位':slots.find(([id])=>id===category)[1]+(subtype?'／'+(names.get(subtype)||'其他'):'');
    result.textContent=data.jobs.find(entry=>entry.id===job.value).name+' · T'+selectedTier+' · '+label+'：'+records.length+' 件裝備 · GS 由高至低';
  }
  document.querySelector('#snapshot-note').textContent='資料快照 '+data.updatedAt+' · '+data.records.length+' 件裝備 · '+data.jobs.length+' 個職業';
  search.oninput=render;job.onchange=render;tier.onchange=render;render();
})();
