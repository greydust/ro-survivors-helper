(() => {
  'use strict';
  const data=JSON.parse(document.querySelector('#job-data').textContent);
  const jobs=new Map(data.jobs.map(job=>[job.id,job])),skills=new Map(data.skills.map(skill=>[skill.id,skill]));
  const select=document.querySelector('#job'),search=document.querySelector('#skill-search');
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const image=(url,name)=>url?`<img src="${esc(url)}" alt="" loading="lazy" onerror="this.hidden=true">`:`<span aria-hidden="true">${esc(name?.slice(0,1))}</span>`;
  let selected=data.jobs[0].id;
  select.innerHTML=[1,2,3].map(rank=>`<optgroup label="${rank} 轉">${data.jobs.filter(j=>j.rank===rank).map(j=>`<option value="${esc(j.id)}">${esc(j.name)}</option>`).join('')}</optgroup>`).join('');
  select.value=selected;
  function talentInfo(job,talent){
    const branch=job.branches[talent.branch],path=branch.paths[talent.path];
    return `<header>${image(talent.icon,talent.name)}<h3>${esc(talent.name)}</h3></header><p class="muted">${esc(job.name)} · ${esc(branch.name)} · 最高 ${talent.maxRank} 級</p>${path?`<p class="path-note">路線：${esc(path.name)}<br>${esc(path.desc)}<br>同一技能的兩條路線互斥。</p>`:''}${talent.learn?`<p class="unlock">解鎖技能：${esc(skills.get(talent.learn)?.name??talent.learn)}</p>`:''}${talent.weapons.length||talent.needsShield?`<p class="req">裝備需求：${esc([...talent.weapons,...talent.needsShield?['盾牌']:[]].join('、'))}</p>`:''}<p class="req">分支前列需求：${talent.requiredPoints} 點${talent.requires.map(id=>{const p=job.talents.find(t=>t.id===id);return `<br>前置：${esc(p.name)} ${p.maxRank}/${p.maxRank}`;}).join('')}</p><table><thead><tr><th>等級</th><th>效果</th></tr></thead><tbody>${talent.ranks.map((desc,i)=>`<tr><th>${i+1}</th><td>${esc(desc)}</td></tr>`).join('')}</tbody></table>`;
  }
  function tree(job,branch,index){
    const nodes=job.talents.filter(t=>t.branch===index),rows=Math.max(...job.talents.map(t=>t.row))+1;
    const x=col=>(col+.5)/job.columns*100,y=row=>(row+.5)/rows*100;
    const lines=nodes.flatMap(t=>t.requires.map(id=>{
      const p=job.talents.find(n=>n.id===id);
      return `<path d="M ${x(p.col)} ${y(p.row)} H ${x(t.col)} V ${y(t.row)}"/>`;
    })).join('');
    return `<section class="tree-col"><header class="tree-head">${image(branch.icon,branch.name)}<h3>${esc(branch.name)}</h3></header><div class="tree-desc">${esc(branch.desc)}</div><div class="tree-board" style="height:${rows*62}px">${Array.from({length:rows-1},(_,i)=>`<div class="tier" style="top:${(i+1)/rows*100}%;height:${100/rows}%"></div>`).join('')}<svg class="links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>${nodes.map(t=>`<button class="talent${t.learn?' learn':''}" type="button" data-talent="${esc(t.id)}" aria-label="${esc(t.name)}，最高 ${t.maxRank} 級" aria-pressed="false" aria-controls="info-${esc(job.id)}" title="${esc(t.name)}" style="left:${x(t.col)}%;top:${y(t.row)}%">${image(t.icon,t.name)}<span class="rank">${t.maxRank}</span>${t.weapons.length||t.needsShield?`<span class="wpn-tag" aria-hidden="true">${t.needsShield?'🛡':'⚔'}</span>`:''}</button>`).join('')}</div></section>`;
  }
  function renderTrees(){
    const job=jobs.get(selected),line=job.lineage.map(id=>jobs.get(id));
    document.querySelector('#trees').innerHTML=`<div class="lineage">${line.map(j=>`<span>${j.rank} 轉 · ${esc(j.name)}</span>`).join(' / ')}</div>`+line.map(j=>`<section class="job-tree" data-tree-job="${esc(j.id)}"><header><h2>${esc(j.name)}</h2><span class="badge">${j.rank} 轉</span><span class="muted">${j.talents.length} 個天賦</span></header><div class="tree-layout"><div class="talent-trees">${j.branches.map((b,i)=>tree(j,b,i)).join('')}</div><aside id="info-${esc(j.id)}" class="talent-info" aria-live="polite">${talentInfo(j,j.talents[0])}</aside></div></section>`).join('');
    document.querySelectorAll('[data-talent]').forEach(button=>button.onclick=()=>{
      const section=button.closest('[data-tree-job]'),j=jobs.get(section.dataset.treeJob),t=j.talents.find(t=>t.id===button.dataset.talent);
      section.querySelectorAll('[data-talent]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
      const info=section.querySelector('.talent-info');info.innerHTML=talentInfo(j,t);
      if(window.matchMedia?.('(max-width:1100px)').matches)info.scrollIntoView({behavior:'smooth',block:'nearest'});
    });
  }
  function renderSkills(){
    const job=jobs.get(selected),query=search.value.trim().toLocaleLowerCase();
    const list=job.skills.map(id=>skills.get(id)).filter(s=>JSON.stringify(s).toLocaleLowerCase().includes(query));
    document.querySelector('#skill-count').textContent=`${job.name} · ${list.length} / ${job.skills.length} 個技能與普通攻擊`;
    document.querySelector('#skills').innerHTML=list.map(s=>{
      const unlocks=s.unlocks.filter(u=>job.lineage.includes(u.job));
      return `<article class="skill" data-skill="${esc(s.id)}"><header>${image(s.icon,s.name)}<h2>${esc(s.name)}</h2></header><p class="muted">${s.basic?'普通攻擊':s.kind==='passive'?'被動技能':esc(s.tags.join(' · '))}</p><p>${esc(s.desc)}</p>${unlocks.length?`<p class="unlock">天賦解鎖：${unlocks.map(u=>`${esc(jobs.get(u.job).name)} · ${esc(jobs.get(u.job).branches[u.branch].name)}`).join('／')}</p>`:''}${s.weapons.length||s.needsShield?`<p class="muted">裝備需求：${esc([...s.weapons,...s.needsShield?['盾牌']:[]].join('、'))}</p>`:''}${s.upgrades.length?`<table><thead><tr><th>可用強化</th><th>升級上限</th></tr></thead><tbody>${s.upgrades.map(u=>`<tr><td>${esc(u.label)}<small>${esc(u.example)}</small></td><td>${esc(u.capText)}${u.note?`<small>${esc(u.note)}</small>`:''}</td></tr>`).join('')}</tbody></table>`:'<p class="muted">沒有翻牌強化項目。</p>'}</article>`;
    }).join('')||'<p class="empty">沒有符合的技能。</p>';
  }
  function changeTab(name){
    for(const button of document.querySelectorAll('[data-tab]')){const on=button.dataset.tab===name;button.setAttribute('aria-selected',String(on));button.tabIndex=on?0:-1;document.querySelector('#'+button.dataset.tab+'-panel').hidden=!on;}
  }
  for(const button of document.querySelectorAll('[data-tab]')){
    button.onclick=()=>changeTab(button.dataset.tab);
    button.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const name=event.key==='Home'?'talents':event.key==='End'?'skills':button.dataset.tab==='talents'?'skills':'talents';changeTab(name);document.querySelector('#'+name+'-tab').focus();};
  }
  select.onchange=()=>{selected=jobs.has(select.value)?select.value:data.jobs[0].id;const job=jobs.get(selected);document.querySelector('#job-summary').textContent=job.desc;search.value='';renderTrees();renderSkills();};
  search.oninput=renderSkills;
  document.querySelector('#source-note').innerHTML=`資料更新：${esc(data.updatedAt)} · ${data.jobs.length} 職業 · ${data.skills.length} 技能與普通攻擊。<br>公開遊戲資料快照：<a href="${esc(data.source)}" target="_blank" rel="noopener noreferrer">共用模組</a> · <a href="${esc(data.mainSource)}" target="_blank" rel="noopener noreferrer">主程式</a>。圖示需連線載入；此頁不讀寫遊戲帳號。`;
  select.onchange();
})();
