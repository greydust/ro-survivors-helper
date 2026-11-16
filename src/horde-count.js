  const hordeStates = new WeakMap();
  const observedHordeQueues = new WeakSet();
  let nextHordeHudAt=0;
  const hordeSpawnKey=(id,hp,point)=>point&&[id,hp,point.x,point.y].join('|');
  function observeHordeQueue(game,state,queue){
    if(!Array.isArray(queue)||observedHordeQueues.has(queue))return;
    observedHordeQueues.add(queue);
    const push=queue.push,splice=queue.splice;
    Object.defineProperty(queue,'push',{configurable:true,writable:true,value:function(...tuples){
      const result=Reflect.apply(push,this,tuples),wave=state.current;
      if(this===queue&&wave)for(const tuple of tuples){
        if(!Array.isArray(tuple)||tuple.length<4||state.entries.has(tuple))continue;
        const entry={tuple,wave,status:'queued'};state.entries.set(tuple,entry);wave.pending.add(entry);wave.enqueued++;state.pendingWaves.add(wave);
      }
      return result;
    }});
    Object.defineProperty(queue,'splice',{configurable:true,writable:true,value:function(...args){
      const removed=Reflect.apply(splice,this,args);
      if(this===queue)for(const tuple of removed){
        const entry=state.entries.get(tuple);if(!entry||entry.status!=='queued')continue;
        entry.status='processing';const key=hordeSpawnKey(tuple[0],tuple[1],{x:tuple[2],y:tuple[3]});
        if(!state.processing.has(key))state.processing.set(key,[]);state.processing.get(key).push(entry);
      }
      return removed;
    }});
  }
  function observeNewHordeQueue(game,state){
    let value=game.roHq;observeHordeQueue(game,state,value);
    const descriptor=Object.getOwnPropertyDescriptor(game,'roHq');
    if(descriptor&&(!descriptor.configurable||descriptor.get||descriptor.set))return ()=>{};
    Object.defineProperty(game,'roHq',{configurable:true,enumerable:descriptor?.enumerable??true,
      get:()=>value,set:next=>{value=next;observeHordeQueue(game,state,next);}});
    return ()=>{
      if(!descriptor&&value===undefined)delete game.roHq;
      else Object.defineProperty(game,'roHq',descriptor?{...descriptor,value}:{configurable:true,enumerable:true,writable:true,value});
    };
  }
  function installHordeCount(game){
    if(!game||hordeStates.has(game)||typeof game.horde!=='function'||typeof game.spawnEnemy!=='function')return;
    const state={latest:null,current:null,entries:new WeakMap(),processing:new Map(),pendingWaves:new Set()};hordeStates.set(game,state);
    const spawnEnemy=game.spawnEnemy,horde=game.horde;
    game.spawnEnemy=function(...args){
      const key=hordeSpawnKey(args[0],args[1],args[3]),entries=state.processing.get(key),entry=entries?.shift();
      if(entries&&!entries.length)state.processing.delete(key);
      try{
        const enemy=Reflect.apply(spawnEnemy,this,args);
        if(entry){if(enemy)entry.wave.actual++;else entry.wave.failed++;}
        else if(state.current&&!Array.isArray(this.roHq)){state.current.enqueued++;if(enemy)state.current.actual++;else state.current.failed++;}
        return enemy;
      }catch(error){if(entry)entry.wave.canceled=true;else if(state.current)state.current.canceled=true;throw error;}
      finally{if(entry){entry.status='done';entry.wave.pending.delete(entry);if(!entry.wave.pending.size){state.pendingWaves.delete(entry.wave);if(entry.wave.closed&&!entry.wave.canceled)entry.wave.completedAt=performance.now();}}}
    };
    game.horde=function(...args){
      const wave={actual:0,theoretical:null,enqueued:0,failed:0,pending:new Set(),closed:false,canceled:false,completedAt:null};
      const previous=state.current;state.current=wave;state.latest=wave;
      let partyCount=1;const time=this.time,count=this.difficulty?.count,restore=[];
      const wrap=(object,key,make)=>{const descriptor=Object.getOwnPropertyDescriptor(object,key),original=object[key];object[key]=make(original);restore.push(()=>{if(descriptor)Object.defineProperty(object,key,descriptor);else delete object[key];});};
      try{
        restore.push(observeNewHordeQueue(this,state));
        if(typeof this.coop?.partyScale==='function')wrap(this.coop,'partyScale',original=>function(...values){const scale=Reflect.apply(original,this,values);partyCount=scale?.count??1;return scale;});
        if(typeof this.spawnAnchors==='function')wrap(this,'spawnAnchors',original=>function(...values){
          const anchors=Reflect.apply(original,this,values),desired=Math.round(Math.min(120,36+time/8)*count*partyCount);
          if(anchors?.length&&Number.isFinite(desired)&&desired>=0)wave.theoretical=Math.round(desired/anchors.length)*anchors.length;
          return anchors;
        });
        return Reflect.apply(horde,this,args);
      }catch(error){wave.canceled=true;throw error;}
      finally{for(const undo of restore.reverse())undo();wave.closed=true;if(!wave.pending.size&&!wave.canceled)wave.completedAt=performance.now();state.current=previous;try{updateHordeHud(this,true);}catch(error){console.debug('怪物潮面板更新失敗',error);}}
    };
  }
  function reconcileHordeCancellation(game,state){
    if(!state||!(game.bossArena||game.closeAt>=0||game.state==='over'))return;
    for(const wave of state.pendingWaves){wave.canceled=true;for(const entry of wave.pending)entry.status='canceled';wave.pending.clear();}
    state.pendingWaves.clear();state.processing.clear();
  }
  function hordeProgress(game){
    const state=hordeStates.get(game);reconcileHordeCancellation(game,state);
    const wave=state?.latest;if(!wave)return null;
    return {actual:wave.actual,theoretical:wave.theoretical,enqueued:wave.enqueued,failed:wave.failed,pending:wave.pending.size,
      complete:wave.theoretical!==null&&wave.closed&&!wave.pending.size&&!wave.canceled,canceled:wave.canceled,expired:wave.completedAt!==null&&performance.now()-wave.completedAt>=3000};
  }
  function fieldMonsterCounts(game){
    const counts=new Map();
    for(const enemy of game?.enemies||[]){
      if(!enemy||enemy.dead||enemy.removed||enemy.state==='dead'||(Number.isFinite(enemy.hp)&&enemy.hp<=0))continue;
      const id=enemy.def?.id||'unknown',name=MONSTER_NAMES[id]||enemy.def?.name||id;
      if(!counts.has(id))counts.set(id,{id,name,count:0});counts.get(id).count++;
    }
    return [...counts.values()].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'zh-Hant')||a.id.localeCompare(b.id));
  }
  function fieldMonsterLimit(game){
    const waves=game?.script?.waves,time=game?.waveTime;
    if(!Array.isArray(waves)||!waves.length||!Number.isFinite(time))return null;
    const wave=waves.find(row=>time>=row.from&&time<row.to)||waves[waves.length-1];
    const limit=wave.maxAlive*game.difficulty?.count*(game.coop?.partyScale?.()?.count??1)*(time<30?.2+.8*time/30:1);
    return Number.isFinite(limit)&&limit>=0?Math.ceil(limit):null;
  }
  function clearHordeHud(){document.querySelector('#ro-horde-hud')?.remove();nextHordeHudAt=0;}
  function updateHordeHud(game=activeGame,force=false){
    const hud=document.querySelector('#hud'),loot=document.querySelector('#loot-rolls');
    if(!game||!hud||hud.classList.contains('hidden')||game.state==='over'||!loot){clearHordeHud();return;}
    if(!force&&performance.now()<nextHordeHudAt)return;nextHordeHudAt=performance.now()+250;
    let panel=document.querySelector('#ro-horde-hud');
    if(!panel){
      panel=document.createElement('section');panel.id='ro-horde-hud';panel.setAttribute('aria-label','怪物潮與場上怪物');
      const progress=document.createElement('div');progress.dataset.hordeProgress='';
      const total=document.createElement('div');total.dataset.monsterTotal='';
      const list=document.createElement('div');list.dataset.monsterCounts='';list.id='ro-field-monsters';
      const header=document.createElement('div');header.dataset.monsterHeader='';
      const toggle=document.createElement('button');toggle.type='button';toggle.dataset.monsterToggle='';toggle.textContent='−';toggle.setAttribute('aria-label','折疊怪物明細');toggle.setAttribute('aria-expanded','true');toggle.setAttribute('aria-controls',list.id);
      toggle.onclick=()=>{list.hidden=!list.hidden;toggle.textContent=list.hidden?'+':'−';toggle.setAttribute('aria-expanded',String(!list.hidden));toggle.setAttribute('aria-label',list.hidden?'展開怪物明細':'折疊怪物明細');};
      header.append(progress,toggle);panel.append(header,total,list);hud.append(panel);
    }
    if(typeof loot.getBoundingClientRect==='function'){
      const rect=loot.getBoundingClientRect(),width=innerWidth<=700?150:180,top=Math.max(12,Math.min((rect.width||rect.height?rect.bottom:innerHeight*.34)+8,innerHeight-100));
      for(const [key,value] of Object.entries({top:top+'px',right:Math.max(8,innerWidth-(rect.right||innerWidth-12))+'px',width:Math.min(width,innerWidth-24)+'px',maxHeight:Math.max(80,innerHeight-top-16)+'px'}))if(panel.style[key]!==value)panel.style[key]=value;
    }
    const progress=hordeProgress(game),counter=panel.querySelector('[data-horde-progress]');
    const text=progress&&!progress.expired?'怪物潮('+progress.actual+'/'+(progress.theoretical??'?')+')':'怪物潮(-/-)';
    if(counter.textContent!==text)counter.textContent=text;
    const status=progress?.expired?'idle':progress?.canceled?'canceled':progress?.complete?'complete':'pending';
    if(counter.dataset.status!==status)counter.dataset.status=status;
    const title=progress?.expired?'本波生成已結束。':progress?`本波累計成功出生／理論總數；已排入 ${progress.enqueued}，待處理 ${progress.pending}，生成失敗 ${progress.failed}。`+(progress.canceled?'剩餘生成已中止。':progress.complete?'分批生成已結束；地形限制可能使出生數低於理論值。':'分批生成中。'):(game.coop?.replica?'隊員端尚未收到可追蹤的怪物潮佇列。':'尚未發生怪物潮。');
    if(counter.title!==title)counter.title=title;
    const counts=fieldMonsterCounts(game),total=panel.querySelector('[data-monster-total]'),totalText='場上怪物：'+counts.reduce((sum,row)=>sum+row.count,0)+' / '+(fieldMonsterLimit(game)??'—');
    if(total.textContent!==totalText)total.textContent=totalText;
    const list=panel.querySelector('[data-monster-counts]'),signature=JSON.stringify(counts);
    if(list.dataset.signature!==signature){
      list.dataset.signature=signature;list.replaceChildren();
      for(const row of counts){const line=document.createElement('div'),name=document.createElement('span'),number=document.createElement('b');name.textContent=row.name;number.textContent=String(row.count);line.append(name,number);list.append(line);}
    }
  }
