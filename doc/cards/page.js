(() => {
  'use strict';
  const data=JSON.parse(document.querySelector('#card-data').textContent);
  const categories=document.querySelector('#categories'),grid=document.querySelector('#cards');
  const search=document.querySelector('#search'),job=document.querySelector('#job'),version=document.querySelector('#sort-version');
  const slots=new Map(data.slots),result=document.querySelector('#result');
  let category='all',monsterType='all';
  const monsterTypes=[['all','全部'],['mob','小怪'],['boss','Boss（含首領與 MVP）']];
  const matchesMonster=card=>monsterType==='all'||(monsterType==='boss'?!!card.boss:!card.boss);
  const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
  const searchable=new Map(data.records.map(card=>[card.id,[card.name,card.id,slots.get(card.slot),...card.sources.map(s=>s.stage),...card.versions.flatMap(v=>v.bonuses)].join(' ').toLocaleLowerCase()]));
  for(const item of data.jobs){const option=node('option',item.name);option.value=item.id;job.append(option);}
  job.value='swordsman';
  for(const row of data.records[0].versions){const option=node('option',row.label+(row.lap>1?'（第'+row.lap+'周目）':''));option.value=row.lap;version.append(option);}
  version.value=String(data.lapConfig.max);
  const getScore=card=>card.versions.find(v=>v.lap===Number(version.value)).scores[job.value];
  function render(){
    const query=search.value.trim().toLocaleLowerCase();
    categories.replaceChildren();
    for(const [id,label] of [['all','全部部位'],...data.slots]){
      const count=data.records.filter(card=>(id==='all'||card.slot===id)&&matchesMonster(card)&&(!query||searchable.get(card.id).includes(query))).length;
      const button=node('button',label);button.type='button';button.dataset.category=id;button.classList.toggle('active',category===id);button.setAttribute('aria-pressed',String(category===id));button.append(node('small',count));
      button.onclick=()=>{category=id;render();};categories.append(button);
    }
    const types=document.querySelector('#monster-types');types.replaceChildren();
    for(const [id,label] of monsterTypes){
      const button=node('button',label);button.type='button';button.dataset.monsterType=id;button.classList.toggle('active',monsterType===id);button.setAttribute('aria-pressed',String(monsterType===id));
      button.onclick=()=>{monsterType=id;render();};types.append(button);
    }
    const records=data.records.filter(card=>(category==='all'||card.slot===category)&&matchesMonster(card)&&(!query||searchable.get(card.id).includes(query)))
      .sort((a,b)=>getScore(b)-getScore(a)||a.id-b.id);
    grid.replaceChildren();
    for(const card of records){
      const article=node('article',undefined,'card');article.dataset.cardId=card.id;article.dataset.score=getScore(card);
      const header=node('header'),title=node('h2',card.name),score=node('div',undefined,'score');score.append(node('b',getScore(card)),document.createTextNode('GS · '+card.versions.find(v=>v.lap===Number(version.value)).label));header.append(title,score);article.append(header);
      article.append(node('p',slots.get(card.slot)+' · '+(card.boss==='mvp'?'MVP':card.boss?'頭目':'小怪')+' · #'+card.id,'meta'));
      const table=node('table');table.setAttribute('aria-label',card.name+'各版本 GS 與能力');
      const thead=node('thead'),head=node('tr');for(const text of ['版本','GS','能力']){const th=node('th',text);th.scope='col';head.append(th);}thead.append(head);table.append(thead);
      const tbody=node('tbody');
      for(const row of card.versions){
        const tr=node('tr');tr.dataset.lap=row.lap;tr.classList.toggle('selected',row.lap===Number(version.value));
        const effects=node('td');for(const bonus of row.bonuses)effects.append(node('span',bonus,'bonus'));
        tr.append(node('td',row.label),node('td',row.scores[job.value]),effects);tbody.append(tr);
      }
      table.append(tbody);article.append(table);
      article.append(node('p','掉落：'+card.sources.map(source=>source.stage+(source.rare?'（稀有頭目）':'')).join('、'),'sources'));
      grid.append(article);
    }
    if(!records.length)grid.append(node('p','沒有符合的卡片，請換個部位或關鍵字。','empty-result'));
    result.textContent=(category==='all'?'全部部位':slots.get(category))+' · '+monsterTypes.find(([id])=>id===monsterType)[1]+' · '+records.length+' 種卡片 · '+data.jobs.find(j=>j.id===job.value).name+' · '+data.records[0].versions.find(v=>v.lap===Number(version.value)).label+' GS 由高至低';
  }
  document.querySelector('#version-note').textContent='目前遊戲共有 '+data.lapConfig.max+' 個版本：普通版、改、改2～改'+(data.lapConfig.max-1)+'。第六周目＝改5。';
  document.querySelector('#snapshot-note').textContent='資料快照 '+data.updatedAt+' · '+data.records.length+' 種卡片 · '+data.records.length*data.lapConfig.max+' 筆版本資料';
  document.querySelector('#data-source').href=data.source;document.querySelector('#score-source').href=data.mainSource;
  search.oninput=render;job.onchange=render;version.onchange=render;render();
})();
