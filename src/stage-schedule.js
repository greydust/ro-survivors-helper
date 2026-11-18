  function spawnTime(seconds){
    if(!Number.isFinite(seconds)||seconds<0)return '時間未提供';
    const n=Math.floor(seconds);return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
  }
  function stageSpawnRows(script){
    if(!script||!Array.isArray(script.waves))return [];
    const rows=[],lastBoss=script.bosses?.[script.bosses.length-1];
    // The final scheduled boss triggers clearMobs/bossArena. runLength also
    // includes the boss-fight allowance and is not the normal-spawn cutoff.
    const cutoff=Number.isFinite(lastBoss?.t)&&lastBoss.t>=0?lastBoss.t:Infinity;
    const length=Math.min(script.runLength,cutoff);
    const waves=script.waves.filter(w=>Number.isFinite(w.from)&&Number.isFinite(w.to)&&w.to>w.from&&Array.isArray(w.pool));
    if(Number.isFinite(length)&&length>0&&waves.length){
      // The native scheduler uses the first matching pool, falling back to its
      // last wave in gaps. This is availability, not an individual spawn timer.
      const boundaries=[...new Set([0,length,...waves.flatMap(w=>[w.from,w.to]).filter(t=>t>0&&t<length)])].sort((a,b)=>a-b);
      const intervals=new Map();
      for(let i=0;i<boundaries.length-1;i++){
        const from=boundaries[i],to=boundaries[i+1],wave=waves.find(w=>from>=w.from&&from<w.to)??waves[waves.length-1];
        if(wave.perSecond===0)continue;
        for(const id of new Set(wave.pool)){
          if(typeof id!=='string')continue;
          if(!intervals.has(id))intervals.set(id,[]);
          const ranges=intervals.get(id),last=ranges[ranges.length-1];
          if(last&&last.to===from)last.to=to;else ranges.push({from,to});
        }
      }
      for(const [id,ranges] of intervals)rows.push({id,kind:'一般怪（隨機）',times:ranges.map(r=>spawnTime(r.from)+'–'+spawnTime(r.to)).join('、')});
    }
    return rows;
  }
  function selectedStageScript(detail,scripts){
    if(!scripts||typeof scripts!=='object')return null;
    const art=detail.querySelector('.stg-banner')?.style.getPropertyValue('--art')||'';
    const match=art.match(/\/stages\/([^/"'()?]+)\.jpg/);
    if(match&&scripts[match[1]])return {id:match[1],script:scripts[match[1]]};
    // Fallback only when the visible normal and boss pools identify one stage.
    const mobs=[...detail.querySelectorAll('.stg-mobs [data-mob]')].map(n=>n.dataset.mob).sort();
    const bosses=[...detail.querySelectorAll('.stg-bosses [data-mob]')].map(n=>n.dataset.mob).sort();
    if(!mobs.length)return null;
    const candidates=Object.entries(scripts).filter(([,s])=>Array.isArray(s?.waves)&&Array.isArray(s.bosses)
      &&JSON.stringify([...new Set(s.waves.flatMap(w=>w.pool||[]))].sort())===JSON.stringify(mobs)
      &&JSON.stringify(s.bosses.map(b=>b.id).sort())===JSON.stringify(bosses));
    return candidates.length===1?{id:candidates[0][0],script:candidates[0][1]}:null;
  }
  let stageLevelRules=null,stageRulesRequest=null;
  function parseStageLevelRules(source){
    // Read JSON and stage metadata only; never execute downloaded source.
    const config=JSON.parse(source.match(/var RO_LAPC=(\{[^;]+\});/)[1]);
    const chapter2=JSON.parse(source.match(/RO_C2T=(\{[^;]+\});/)[1]);
    const list=source.match(/const xe=(\[.*?\]);/s)[1];
    const stages=[...list.matchAll(/\{id:"([^"]+)"([^]*?)(?=\},\{id:|\}\]$)/g)].map(match=>({id:match[1],special:/special:!0|special:true/.test(match[2]),chapter:/chapter:2/.test(match[2])?2:1}));
    if(!Number.isInteger(config.max)||config.max<1||!stages.length||!config.exp||![config.exp.from,config.exp.base,config.exp.span].every(Number.isFinite))throw Error('Unknown native stage rules');
    return {config,chapter2,stages};
  }
  function loadStageLevelRules(){
    if(stageRulesRequest)return stageRulesRequest;
    const script=[...document.querySelectorAll('script[type="module"][src]')].find(node=>/\/main-[^/]+\.js(?:\?|$)/.test(node.getAttribute('src')));
    if(!script)return Promise.resolve();
    const url=new URL(script.getAttribute('src'),location.href);
    if(url.origin!==new URL(location.href).origin)return Promise.resolve();
    stageRulesRequest=(async()=>{
      try{const response=await fetch(url.href,{credentials:'omit'});if(!response.ok)throw Error('HTTP '+response.status);
        stageLevelRules=parseStageLevelRules(await response.text());updateStageSpawnSchedule();
      }catch(error){console.warn('[RO助手] 無法讀取目前周目設定；多周目等級暫顯示 —',error);}
    })();
    return stageRulesRequest;
  }
  function stageMonsterLevel(id,selected,lap){
    const monsters=gameCatalog?.bj,base=monsters?.[id]?.level;
    if(!Number.isFinite(base))return null;
    if(lap<=1)return base;
    if(!selected||!stageLevelRules)return null;
    const {config,chapter2,stages}=stageLevelRules;
    if(selected.script?.storyOnly||chapter2[selected.id])return base;
    const allowed=stage=>gameCatalog?.ca?.[stage.id]?.map&&!gameCatalog.ca[stage.id].storyOnly&&(!config.stages||config.stages.includes(stage.id));
    const currentStage=stages.find(stage=>stage.id===selected.id);
    if(!currentStage)return null;
    if(!allowed(currentStage))return base;
    const eligible=stages.filter(stage=>allowed(stage)&&!stage.special&&stage.chapter!==2);
    const index=eligible.findIndex(stage=>stage.id===selected.id),special=currentStage.special;
    if(index<0&&!special)return null;
    const average=script=>{
      let sum=0,total=0;
      for(const wave of script?.waves||[]){
        const pool=(wave.pool||[]).map(key=>monsters[key]).filter(Boolean),duration=Math.max(0,(wave.to||0)-(wave.from||0));
        if(!pool.length||!duration)continue;
        sum+=duration*pool.reduce((n,m)=>n+(m.level||0),0)/pool.length;total+=duration;
      }
      return total?sum/total:null;
    };
    const current=average(selected.script),last=average(gameCatalog.ca[eligible.at(-1)?.id]);
    if(current===null||last===null)return null;
    let offset=Math.max(0,Math.round((special?current:last)-current));
    lap=Math.max(1,Math.min(config.max,lap));
    if(lap>=config.exp.from){const f=((lap-2)*eligible.length+(special?eligible.length:index+1))/(eligible.length*(config.max-1));offset=Math.max(offset,Math.round(config.exp.base+config.exp.span*f-current));}
    return base+offset;
  }
  function updateStageSpawnSchedule(){
    const detail=document.querySelector('#stg-detail'),mobs=detail?.querySelector('.stg-mobs'),bosses=detail?.querySelector('.stg-bosses');
    if(!detail||(!mobs&&!bosses))return;
    detail.querySelector('section[data-ro-spawn-schedule]')?.remove();
    const selected=selectedStageScript(detail,gameCatalog?.ca),rows=stageSpawnRows(selected?.script);
    const byId=new Map(rows.map(row=>[row.id,row]));
    const lap=Number(document.querySelector('#lap-tabs [data-laptab].primary')?.dataset.laptab)||1;
    if(mobs&&!mobs.classList.contains('ro-mob-schedule'))mobs.classList.add('ro-mob-schedule');
    for(const mob of mobs?.querySelectorAll('[data-mob]')||[]){
      const id=mob.dataset.mob,row=byId.get(id),times=row?row.times.split('、'):['時段未提供'];
      const nativeName=gameCatalog?.bj?.[id]?.name;
      const name=(typeof gameCatalog?.ff==='function'&&nativeName?gameCatalog.ff(nativeName):null)||MONSTER_NAMES[id]||nativeName||id;
      const level=stageMonsterLevel(id,selected,lap),signature=JSON.stringify([name,level,times]);
      if(mob.dataset.roScheduleSignature===signature&&mob.querySelector('[data-ro-mob-time]'))continue;
      mob.dataset.roScheduleSignature=signature;mob.classList.add('ro-timed-mob');
      mob.querySelector('[data-ro-mob-time]')?.remove();
      const caption=document.createElement('span');caption.dataset.roMobTime='';
      caption.title='可隨機生成的時段，非固定出生時間。依最後頭目預定出場時間截斷；若頭目出生延遲，實際停刷也可能延後。';
      const label=document.createElement('b');label.textContent=name;caption.append(label);
      const levelLine=document.createElement('span');levelLine.dataset.roMobLevel='';levelLine.textContent='等級 '+(level??'—');levelLine.title='計算經驗衰減使用的怪物等級（含目前周目修正）';caption.append(levelLine);
      for(const time of times){const line=document.createElement('small');line.textContent=time;caption.append(line);}
      mob.append(caption);
    }
    for(const boss of bosses?.querySelectorAll('[data-mob]')||[]){
      const level=stageMonsterLevel(boss.dataset.mob,selected,lap),text='等級 '+(level??'—');
      let line=boss.querySelector('[data-ro-mob-level]');
      if(!line){line=document.createElement('span');line.dataset.roMobLevel='';line.title='計算經驗衰減使用的怪物等級（含目前周目修正）';const name=boss.querySelector('b');if(name)name.after(line);else boss.append(line);}
      if(line.textContent!==text)line.textContent=text;
    }
  }
