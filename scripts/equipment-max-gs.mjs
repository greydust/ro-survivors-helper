import vm from 'node:vm';

// All scoring, equipment eligibility and affix bounds come from the downloaded
// public build. This module never invokes the game's random affix generator.
export function createEquipmentScorer(main, catalog, sandbox) {
  const imported=main.match(/import\{([^}]+)\}from["'][^"']*soul_linker[^"']+["']/);
  if(!imported)throw Error('Native shared-module imports unavailable');
  const bindings=Object.fromEntries(imported[1].split(',').map(entry=>{
    const [key,local]=entry.trim().split(' as ');return [local||key,catalog[key]];
  }));
  function section(start,end){const a=main.indexOf(start),b=main.indexOf(end,a);if(a<0||b<0)throw Error('Native scoring section missing: '+start);return main.slice(a,b);}
  const bow=main.match(/function RO_BOW\(a\)\{try\{[^]*?catch\(x\)\{return!1\}\}/)?.[0];
  if(!bow)throw Error('Native bow eligibility unavailable');
  const context=vm.createContext({...bindings,bn:item=>{if(!Number.isInteger(item.tier))throw Error('Explicit Tier required');return item.tier;}});
  vm.runInContext(
    main.match(/const ba=\d+/)[0]+';const '+section('uC=[','const Sl=')+
    section('function RO_STARM(','function RO_STARNM(')+
    section('const Bk=','function Hk(')+
    section('function RO_EQJ(','function _n(')+bow+
    ';globalThis.native={score:or,base:Ma,bonus:vf,bonuses:Gm,eligible:qn,skills:QM};',context,{timeout:1000});
  vm.runInContext('globalThis.affixMetadata={main:Object.keys(ru),mainValue:vG,third:yG,fourth:bG,values:Object.fromEntries(Object.entries(Qy).map(([key,value])=>[key,value.base])),skillMax:y0[1],slots:Fv[4]};',sandbox,{timeout:1000});
  const rules=sandbox.affixMetadata,native=context.native;
  if(JSON.stringify(rules.slots)!=='[1,2,3,4]'||!sandbox.HZAF?.pool)throw Error('Unsupported legendary affix layout');
  const defs=catalog.br;
  const jobs=[...new Set([...Object.values(catalog).filter(Array.isArray).flat().filter(job=>job?.id&&job.scaling).map(job=>job.id)])]
    .map(id=>({id,name:catalog.ff(catalog.j(id).name),scaling:catalog.j(id).scaling}));
  if(jobs.length<30)throw Error('Native job catalog incomplete');
  const allocations=[],allocationIds=new Map();
  const item=(id,tier,affixes=[])=>({itemId:id,tier,quality:4,refine:0,star:0,cards:[],affixes});
  const eligible=(id,job)=>['m','f'].some(gender=>native.eligible({job,look:{gender}},defs[id]));
  const contribution=(affix,job)=>native.bonuses([affix]).reduce((sum,bonus)=>sum+native.bonus(bonus,job),0);
  function candidates(id,tier){
    const mult=catalog.bv(tier).mult;
    return [rules.main.map(stat=>({stat,value:rules.mainValue*mult})),
      rules.third(id).map(stat=>({stat,value:Number((rules.values[stat]*mult).toFixed(3))})),
      rules.fourth.map(stat=>({stat,value:Number((rules.values[stat]*mult).toFixed(3))}))];
  }
  function best(id,tier,job){
    const groups=candidates(id,tier),rank=rows=>rows.map(affix=>({affix,score:contribution(affix,job)})).sort((a,b)=>b.score-a.score);
    // Native GS is additive before its final rounding and two-hand multiplier;
    // legendary main attributes are drawn without replacement.
    const affixes=[...rank(groups[0]).slice(0,2).map(row=>row.affix),rank(groups[1])[0].affix,rank(groups[2])[0].affix];
    const skills=[...sandbox.HZAF.pool(id,job,tier)],scored=new Set(native.skills(job));
    const skill=skills.find(id=>scored.has(id))||skills[0];
    if(skill)affixes.push({stat:'skill',skill,value:rules.skillMax});
    const instance=item(id,tier,affixes),gs=native.score(instance,job);
    if(!Number.isFinite(gs))throw Error('Invalid native equipment GS');
    const key=JSON.stringify(affixes);
    if(!allocationIds.has(key)){
      allocationIds.set(key,allocations.length);
      allocations.push({affixes,text:native.bonuses(affixes).map(bonus=>String(bonus.text(1)).replace(/<[^>]*>/g,''))});
    }
    return {gs,allocation:allocationIds.get(key)};
  }
  return {jobs,allocations,eligible,best,candidates,item,native,skillPool:(id,job,tier)=>[...sandbox.HZAF.pool(id,job,tier)],skillMax:rules.skillMax};
}

export function enrichEquipmentScores(data,scorer){
  data.jobs=scorer.jobs;data.allocations=scorer.allocations;
  data.scoreConditions={quality:4,refine:0,star:0,cards:false,affixes:'native-maximum'};
  for(const record of data.records){
    record.jobs=scorer.jobs.filter(job=>scorer.eligible(record.id,job.id)).map(job=>job.id);
    for(const row of record.tiers){
      row.maxGS=Object.fromEntries(record.jobs.map(job=>[job,scorer.best(record.id,row.tier,job)]));
      row.base=scorer.native.base(scorer.item(record.id,row.tier));
    }
  }
  return data;
}

export function verifyEquipmentMaxima(data,scorer){
  const cases=[];
  for(const [id,tier,job] of [[1202,1,'swordsman'],[1202,8,'mage'],[1163,8,'swordsman'],[1823,8,'taekwon'],[1559,8,'sage'],[2102,1,'swordsman'],[2208,8,'wizard'],[2254,8,'arch_bishop']]){
    const record=data.records.find(record=>record.id===id),row=record?.tiers.find(row=>row.tier===tier);
    if(!row?.maxGS[job])throw Error('Native verification case unavailable: '+id);
    const [primary,third,fourth]=scorer.candidates(id,tier);
    const skills=scorer.skillPool(id,job,tier),skillChoices=skills.length?skills.map(skill=>[{stat:'skill',value:scorer.skillMax,skill}]):[[]];
    let maximum=-Infinity,combinations=0;
    // Independent exhaustive enumeration, using the unchanged native scorer.
    for(let a=0;a<primary.length;a++)for(let b=a+1;b<primary.length;b++)for(const c of third)for(const d of fourth)for(const skill of skillChoices){
      maximum=Math.max(maximum,scorer.native.score(scorer.item(id,tier,[primary[a],primary[b],c,d,...skill]),job));combinations++;
    }
    if(maximum!==row.maxGS[job].gs)throw Error('Equipment maximum mismatch: '+JSON.stringify({id,tier,job,maximum,actual:row.maxGS[job].gs}));
    cases.push({id,tier,job,maximum,combinations,base:row.base,primary,third,fourth,skills});
  }
  return {source:data.source,mainSource:data.mainSource,sourceSha256:data.sourceSha256,mainSourceSha256:data.mainSourceSha256,scoreConditions:data.scoreConditions,cases};
}
