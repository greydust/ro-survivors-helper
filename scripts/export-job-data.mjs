import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {loadPublicModule} from './public-module.mjs';
import {skillBaseStats} from './job-base-stats.mjs';

const [file,url,mainFile,mainUrl,manifestFile]=process.argv.slice(2);
if(!manifestFile)throw Error('Usage: node scripts/export-job-data.mjs <core file> <core URL> <main file> <main URL> <manifest file>');
const {catalog:c,raw,sandbox}=loadPublicModule(file);
const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
const text=value=>{const element=sandbox.document.createElement('div');element.innerHTML=String(value??'');return element.textContent.trim();};
const tr=value=>text(c.ff(value));
const weaponLabels=new Map(JSON.parse(fs.readFileSync(new URL('../doc/equipment/data.json',import.meta.url),'utf8')).weaponTypes);
const weaponName=value=>weaponLabels.get(value)??tr(value);
const icon=key=>manifest.icons[key]?new URL(manifest.icons[key],'https://ro.hans-webgametw.com/assets/').href:null;
if(!c.cU?.length||!c.d||!c.g||!c.i||typeof c.fz!=='function'||typeof sandbox.RO_TREQ!=='function')throw Error('Native job/talent adapters unavailable');
// These unexported rules are verified against the same public build as the definitions.
vm.runInContext('globalThis.jobRules={caps:Sx,countLimited:OH,noCount:UH,countIncrements:rC.map((_,i)=>iC(i))};',vm.createContext(sandbox));
const rules=sandbox.jobRules;
const label={dmg:'傷害',cd:'急速',area:'範圍',reach:'近戰距離',count:'數量',targets:'目標數',pierce:'穿透機率',speed:'速度',duration:'持續時間'};
const pct=n=>`${Math.round(n*10000)/100}%`;
function countMaximum(threshold,step){
  // rollPart multiplies qH's already-clamped amount by countStep. A final
  // upgrade can therefore exceed qH's stopping threshold for bolt skills.
  const reached=new Set([0]);
  for(const value of reached)if(value<threshold)for(const amount of rules.countIncrements)reached.add(value+Math.min(amount,threshold-value)*step);
  return Math.max(...reached);
}
const skillIds=new Set();
const jobs=c.cU.map(job=>{
  const lineage=[...c.c1(job.id)];
  const talents=c.fz(job.id).map(t=>({id:t.id,name:tr(t.name),icon:icon(t.icon),branch:t.branch,row:t.row,col:t.col,maxRank:t.maxRank,
    requires:[t.req,t.req2].filter(Boolean),requiredPoints:sandbox.RO_TREQ(t),path:t.path??null,learn:t.learn??null,
    weapons:t.weapons?.map(weaponName)??[],needsShield:!!t.needsShield,
    ranks:Array.from({length:t.maxRank},(_,i)=>text(t.desc(i+1)))}));
  const skills=[...c.e3(job.id).map(s=>s.id),...lineage.flatMap(id=>c.fz(id).map(t=>t.learn).filter(Boolean))];
  // Include native basic attacks for every weapon eligible for this job.
  const basics=new Set(['atk_fist']);
  if(lineage.includes('mage')&&c.d['mage.0.fire_infusion']&&c.g.atk_infused)basics.add('atk_infused');
  for(const def of Object.values(c.br))if(def.slot==='weapon'&&!def.secret&&(!def.jobs||c.c7(def)?.some(id=>lineage.includes(id))))basics.add(c.dP(def.wtype));
  for(const id of basics)if(c.g[id])skills.push(id);
  const ids=[...new Set(skills)];ids.forEach(id=>skillIds.add(id));
  const branches=c.i[job.id]?.map(b=>({name:tr(b.name),desc:tr(b.desc),icon:icon(b.icon),paths:Object.fromEntries(Object.entries(b.paths??{}).map(([id,p])=>[id,{name:tr(p.name),desc:tr(p.desc)}]))}));
  if(!talents.length||branches?.length!==3||talents.some(t=>!t.name||!t.ranks.every(Boolean)))throw Error('Incomplete native talent tree: '+job.id);
  return {id:job.id,name:tr(job.name),desc:tr(job.desc),rank:job.rank??1,base:job.base??null,lineage,columns:c.k(job.id),branches,talents,skills:ids};
});
const skills=[...skillIds].map(id=>{
  const d=c.g[id];if(!d)throw Error('Missing skill '+id);
  const w=d.create?.();
  const upgrades=w?w.upgradeAspects().filter(aspect=>aspect!=='count'||!rules.noCount.includes(id)).map(aspect=>{
    const rule=rules.caps[aspect];if(!rule)throw Error('Missing upgrade rule '+aspect);
    const count=aspect==='count',limited=count&&rules.countLimited.includes(id);
    const max=limited?c.fZ*w.countStep:count?countMaximum(rule.max,w.countStep):rule.max;
    const amount=rule.int?1:rule.base;
    return {aspect,label:aspect==='speed'?tr(c.cJ[w.speedKey()]):count?`數量（${tr(w.countUnit())}）`:label[aspect],
      example:c.cF({aspect,amount:count?amount*w.countStep:amount},w.countUnit(),w.speedKey(),w.durNote),
      max:Number.isFinite(max)?max:null,...count&&!limited?{stopThreshold:rule.max}:{},
      capText:Number.isFinite(max)?aspect==='cd'?`+${max*100} 急速`:['dmg','area','reach','pierce','speed','duration'].includes(aspect)?`+${pct(max)}`:`+${max}`:'無固定上限',
      note:limited?'原生額外數量最多強化 3 次':count&&w.countStep!==1?`累積達 +${rule.max} 後不再出現；末次強化可超出門檻，每單位增加 ${w.countStep}`:''};
  }):[];
  for(const effect of w?.effects??[])upgrades.push({aspect:'effect',effect:effect.key,label:tr(effect.label),
    example:`每單位 +${c.cP(effect,effect.step)}`,base:effect.base,max:effect.max??null,
    capText:effect.max===undefined?'無固定上限':`效果總值 ${c.cP(effect,effect.max)}`,note:`初始 ${c.cP(effect,effect.base)}`});
  const unlocks=jobs.flatMap(j=>j.talents.filter(t=>t.learn===id||(id==='atk_infused'&&/^mage\.[012]\.(fire|water|wind)_infusion$/.test(t.id))).map(t=>({job:j.id,branch:t.branch,talent:t.id})));
  return {id,name:tr(d.name),icon:icon(d.icon),kind:d.kind,type:d.type??null,tags:d.tags?.map(tag=>tr(c.cH[tag]??tag))??[],
    desc:text(d.desc(1)),weapons:d.weapons?.map(weaponName)??[],needsShield:!!d.needsShield,basic:id.startsWith('atk_'),unlocks,upgrades,
    baseStats:skillBaseStats(w,{translate:tr,formatEffect:c.cP,description:text(d.desc(1)),resolve:expression=>{
      if(!/^[\w$]+(?:\.[\w$]+)*$/.test(expression))return null;
      try{return vm.runInContext(expression,vm.createContext(sandbox),{timeout:100});}catch{return null;}
    }})};
});
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const data={updatedAt:new Date().toISOString().slice(0,10),source:url,sourceSha256:sha(raw),mainSource:mainUrl,mainSourceSha256:sha(fs.readFileSync(mainFile)),manifestSource:'https://ro.hans-webgametw.com/assets/manifest.json',manifestSha256:sha(fs.readFileSync(manifestFile)),jobs,skills};
fs.mkdirSync(new URL('../doc/jobs/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('../doc/jobs/data.json',import.meta.url),JSON.stringify(data,null,2)+'\n');
console.log(`Exported ${jobs.length} jobs, ${jobs.reduce((n,j)=>n+j.talents.length,0)} talents and ${skills.length} skills`);
