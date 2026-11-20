const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');
const folder='doc/jobs/',data=JSON.parse(fs.readFileSync(folder+'data.json','utf8'));
const {window}=parseHTML(fs.readFileSync(folder+'index.html','utf8')),document=window.document;
assert.deepEqual(JSON.parse(document.querySelector('#job-data').textContent),data);
Object.defineProperty(document.querySelector('#job'),'value',{writable:true,value:''});
vm.runInNewContext([...document.querySelectorAll('script')].find(s=>!s.type).textContent,{window,document,Map,Set});
const select=document.querySelector('#job'),search=document.querySelector('#skill-search');
assert.equal(data.jobs.length,39);assert.equal(new Set(data.skills.map(s=>s.id)).size,data.skills.length);
for(const job of data.jobs){
  select.value=job.id;select.onchange();
  assert.equal(document.querySelectorAll('[data-tree-job]').length,job.lineage.length);
  const lineage=[];for(let j=job;j;j=data.jobs.find(parent=>parent.id===j.base))lineage.unshift(j.id);
  assert.deepEqual(job.lineage,lineage,'tree count follows native inheritance, including expanded jobs');
  assert.equal(document.querySelectorAll('.tree-col').length,lineage.length*3);
  assert.equal(document.querySelectorAll('[data-talent]').length,job.lineage.reduce((n,id)=>n+data.jobs.find(j=>j.id===id).talents.length,0));
  assert.equal(document.querySelectorAll('[data-skill]').length,job.skills.length);
  for(const talent of job.talents){
    assert.equal(talent.ranks.length,talent.maxRank);assert(talent.ranks.every(Boolean));
    assert(talent.requires.every(id=>job.talents.some(t=>t.id===id)));
    assert(talent.col>=0&&talent.col<job.columns);
  }
  const node=job.talents.at(-1),button=document.querySelector(`[data-talent="${node.id}"]`);button.click();
  const info=document.querySelector('#info-'+job.id);assert(info.textContent.includes(node.name));
  assert.equal(info.querySelectorAll('tbody tr').length,node.maxRank);
  assert.equal(button.getAttribute('aria-pressed'),'true');
}
select.value='rune_knight';select.onchange();
assert.deepEqual(data.jobs.find(j=>j.id==='kagerou').lineage,['ninja','kagerou']);
assert.deepEqual(data.jobs.find(j=>j.id==='rebellion').lineage,['gunslinger','rebellion']);
document.querySelector('#skills-tab').click();assert.equal(document.querySelector('#skills-panel').hidden,false);assert.equal(document.querySelector('#talents-panel').hidden,true);
search.value='完全不存在的技能';search.oninput();assert.equal(document.querySelectorAll('[data-skill]').length,0);assert(document.querySelector('.empty'));
search.value='狂擊';search.oninput();assert(document.querySelector('[data-skill="bash"]'));
select.value='mage';select.onchange();assert.equal(search.value,'');
document.querySelector('#talents-tab').click();assert.equal(document.querySelector('#talents-panel').hidden,false);
const skill=id=>data.skills.find(s=>s.id===id),aspect=(id,a)=>skill(id).upgrades.find(u=>u.aspect===a);
assert.equal(aspect('bash','cd').max,null);assert.equal(aspect('bash','reach').max,2);
assert.equal(skill('bash').upgrades.find(u=>u.effect==='stun').max,.8);
assert.equal(aspect('arrow_repel','count').max,3);
assert.equal(aspect('atk_infused','count'),undefined);
assert.equal(aspect('firebolt','count').max,12,'native countStep is applied after the last upgrade is clamped');
assert.equal(aspect('firebolt','count').stopThreshold,10);
assert(skill('pierce').unlocks.some(u=>u.job==='knight'));
assert(skill('hundred_spear').unlocks.some(u=>u.job==='rune_knight'));
assert(data.jobs.every(j=>j.skills.every(id=>skill(id))));
assert(data.jobs.every(j=>j.talents.every(t=>t.weapons.every(w=>!/[\uac00-\ud7af]/.test(w)))));
console.log('PASS 39 jobs, inherited talent trees, native prerequisites/ranks, skill unlocks, search, tabs, upgrade caps and offline embedded data');
