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
  function stageMonsterLevel(id,selected,lap){
    const monsters=gameCatalog?.bj,base=monsters?.[id]?.level;
    if(!Number.isFinite(base))return null;
    if(lap<=1)return base;
    // Native RO_LAPAVG/RO_LAPK: time-weighted pool mean, rounded difference
    // from the last eligible stage. Both later laps use the same level offset.
    const eligible=['prontera','sewer','sunken','byalan','payon','payon_cave','orcs','pyramid','maze'];
    if(!selected||!eligible.includes(selected.id))return null;
    const average=script=>{
      let sum=0,total=0;
      for(const wave of script?.waves||[]){
        const pool=(wave.pool||[]).map(key=>monsters[key]).filter(Boolean),duration=Math.max(0,(wave.to||0)-(wave.from||0));
        if(!pool.length||!duration)continue;
        sum+=duration*pool.reduce((n,m)=>n+(m.level||0),0)/pool.length;total+=duration;
      }
      return total?sum/total:null;
    };
    const current=average(selected.script),last=average(gameCatalog?.ca?.maze);
    return current===null||last===null?null:base+Math.max(0,Math.round(last-current));
  }
  function updateStageSpawnSchedule(){
    const detail=document.querySelector('#stg-detail'),mobs=detail?.querySelector('.stg-mobs');
    if(!mobs)return;
    detail.querySelector('section[data-ro-spawn-schedule]')?.remove();
    const selected=selectedStageScript(detail,gameCatalog?.ca),rows=stageSpawnRows(selected?.script);
    const byId=new Map(rows.map(row=>[row.id,row]));
    const lap=Number(document.querySelector('#lap-tabs [data-laptab].primary')?.dataset.laptab)||1;
    if(!mobs.classList.contains('ro-mob-schedule'))mobs.classList.add('ro-mob-schedule');
    for(const mob of mobs.querySelectorAll('[data-mob]')){
      const id=mob.dataset.mob,row=byId.get(id),times=row?row.times.split('、'):['時段未提供'];
      const name=MONSTER_NAMES[id]||gameCatalog?.bj?.[id]?.name||id;
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
  }
