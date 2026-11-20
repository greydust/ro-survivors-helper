  const performanceLabels={pickups:'拾取更新（含移動、動畫與收集）',enemies:'怪物更新',grid:'怪物空間索引',skills:'技能更新',effects:'投射物與技能效果',visuals:'特效與傷害數字',other:'其餘遊戲更新／助手',render:'3D 繪圖 CPU 提交'};
  let performanceSession=null,lastPerformanceReport=null;
  const performanceMethods={updatePickups:'pickups',updateEnemies:'enemies',rebuildGrid:'grid',updateProjectiles:'effects',updateHolyTrails:'effects',updateFireRings:'effects',updatePulls:'effects',updateBastion:'effects',updateYggdrasil:'effects',updateBuffAuras:'effects',updateFxList:'visuals'};
  function performancePercentile(values,fraction){if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.max(0,Math.ceil(sorted.length*fraction)-1)];}
  // Detail timing uses a separate stack: it never changes the coarse category accounting.
  function createPerformanceDetailSampler(session){
    const profiles=new Map(),active=[],roots=new Set(['step',...Object.keys(performanceMethods),'renderWorld','world3d.render']);
    const offsets={step:8,updatePickups:24,updateFxList:16,rebuildGrid:4,updateProjectiles:12,renderWorld:20,'world3d.render':28};
    const limits={interval:32,maxTargets:512,maxCollectionEntries:256,maxTimedCalls:2048};
    function begin(name){
      if(name==='updateEnemies'||(!roots.has(name)&&!name.startsWith('weapon:')))return null; // Existing enemy sampler owns this scope.
      if(!profiles.has(name))profiles.set(name,{scope:name,updateCalls:0,sampledCalls:0,totalMs:0,nestedMeasuredMs:0,setupMs:0,restoreMs:0,attemptedMethods:0,installedMethods:0,missingMethods:0,unwrappedMethods:0,collectionEntries:0,collectionEntriesSkipped:0,targetLimitSkips:0,budgetSkippedCalls:0,methods:new Map()});
      const profile=profiles.get(name),index=profile.updateCalls++;
      if(index%limits.interval!==(offsets[name]??0))return null;
      const ctx={profile,name,records:[],targets:new WeakMap(),stack:[],timedCalls:0};
      const start=performance.now();
      function hook(object,key,label){
        if(!object||typeof object[key]!=='function'){profile.missingMethods++;return;}
        let keys=ctx.targets.get(object);if(!keys){keys=new Set();ctx.targets.set(object,keys);}if(keys.has(key))return;keys.add(key);
        profile.attemptedMethods++;
        if(ctx.records.length>=limits.maxTargets){profile.targetLimitSkips++;return;}
        const descriptor=Object.getOwnPropertyDescriptor(object,key),original=object[key];
        if(descriptor&&(!descriptor.configurable||descriptor.get||descriptor.set)){profile.unwrappedMethods++;return;}
        const stat=profile.methods.get(label)||{name:label,calls:0,totalMs:0,selfMs:0,maxMs:0,samples:[]};
        const wrapper=function(...args){
          // Only the nearest coarse scope may attribute this callback. For example,
          // step's spawn/addFx hooks must not charge work inside updateEnemies to step.
          if(performanceSession!==session||session.stack[session.stack.length-1]?.name!==name)return Reflect.apply(original,this,args);
          if(ctx.timedCalls>=limits.maxTimedCalls){profile.budgetSkippedCalls++;return Reflect.apply(original,this,args);}
          ctx.timedCalls++;
          const frame={start:performance.now(),children:0,baseDepth:session.stack.length};ctx.stack.push(frame);
          try{return Reflect.apply(original,this,args);}
          finally{
            const elapsed=Math.max(0,performance.now()-frame.start);ctx.stack.pop();
            const parent=ctx.stack[ctx.stack.length-1];if(parent)parent.children+=elapsed;
            const self=Math.max(0,elapsed-frame.children);
            stat.calls++;stat.totalMs+=elapsed;stat.selfMs+=self;stat.maxMs=Math.max(stat.maxMs,elapsed);
            if(stat.samples.length<4096)stat.samples.push(elapsed);else stat.samples[(stat.calls-1)%4096]=elapsed;
          }
        };
        try{Object.defineProperty(object,key,{configurable:true,enumerable:descriptor?.enumerable??false,writable:true,value:wrapper});}
        catch{profile.unwrappedMethods++;return;}
        profile.installedMethods++;profile.methods.set(label,stat);ctx.records.push({object,key,descriptor,wrapper});
      }
      function hooks(object,keys,prefix){for(const key of keys)hook(object,key,prefix+'.'+key);}
      function collection(items,visit){
        if(!items)return;
        if(Array.isArray(items)){
          const count=Math.min(items.length,limits.maxCollectionEntries),start=items.length?Math.floor(index/limits.interval)*limits.maxCollectionEntries%items.length:0;
          profile.collectionEntriesSkipped+=items.length-count;
          for(let i=0;i<count;i++){profile.collectionEntries++;const item=items[(start+i)%items.length];if(item)visit(item);}return;
        }
        let count=0;
        for(const item of items){if(count++>=limits.maxCollectionEntries){profile.collectionEntriesSkipped+=Math.max(1,(items.length??items.size??count)-limits.maxCollectionEntries);break;}profile.collectionEntries++;if(item)visit(item);}
      }
      const game=session.game,world=game.world3d;
      const combat=['enemiesInRadius','damageEnemy','killEnemy','addFx','addNumber','healPlayer','hurtPlayer'];
      if(name==='step'){
        hooks(game,['updateCamera','warpSwirls','updateMapFires','spawn','spawnEnemy','horde','flushHeal','trickleHeal','buffValue','stateHash','meteorRain','leaveUpperFloor','addFx','addNumber'],'game');
        for(const key of ['player','pet','hall','atmosphere','gloom','ambient','mapEffects','endless','story'])hooks(game[key],['update'],key);
        hooks(game.walk,['updateFlow','resolve','warpAt'],'walk');
        hooks(world,['setView','project'],'world');
        collection(game.scheduled,item=>hook(item,'fn','scheduled.callback'));
      }else if(name==='updateFxList'){
        for(const key of ['fx','numbers'])collection(game[key],item=>{
          const kind=key==='numbers'?'numbers':item.roHid||item.view?.visible===false?'fx.hidden':'fx.visible';
          hook(item,'update',kind+'.update');hook(item.view,'destroy',kind+'.destroy');
        });
        hooks(game,combat,'game');
      }else if(name==='updatePickups'){
        collection(game.pickups,item=>{
          const kind=['zeny','gem_red','gem_yellow','gem_blue','meat','magnet','loot','card','chest','egg'].includes(item.kind)?item.kind:'other';
          hook(item,'update','pickup.'+kind+'.update');hook(item.view,'destroy','pickup.destroy');
        });
        hooks(game,['collect','replicaPickups','sweepPickups','tryOpenChest','gainExp','vacuum','buffValue'],'game');
        hooks(world,['setBeam','removeBeam'],'world');
      }else if(name==='rebuildGrid')hooks(game.grid,['clear','get','set'],'grid');
      else if(name==='renderWorld'){
        hooks(game,['updateWings','updateCamera','placeOverlay','placeHpBars','placePlayerBar','screenPos','pixelScale','heightAt'],'game');
        hooks(game.mouse,['update'],'mouse');hooks(game.story,['render'],'story');
        hooks(world,['setView','project','scaleAt','spriteLift','groundSquashAt','heightAt'],'world');
      }else if(name==='world3d.render'){
        hooks(world,['updateGroundTheme','walk','emit','pruneBatches','updateCylinders','updateGroundSprites','fadeEffects','pinPrograms','heightAt'],'world');
        hooks(world?.renderer,['getSize','setSize','render'],'renderer');
        hooks(world?.cosmos,['update'],'cosmos');hooks(world?.altar,['update'],'altar');
        for(const key of ['batches','ghostBatches'])collection(world?.[key]?.values(),item=>hook(item,'flush',key+'.flush'));
        hooks(world?.shadows,['flush'],'shadows');hooks(world?.glows,['flush'],'glows');
      }else{
        hooks(game,[...combat,'nearestEnemy','growHolyTrail','vortexGather','vortexCarry','dragCarried','buffValue','fxRoom'],'game');
        hooks(game.walk,['lineClear','resolve'],'walk');
        if(name==='updateProjectiles')collection(game.projectiles,item=>{
          hooks(item.model,['dispose'],'projectile.model');hooks(item.view,['destroy'],'projectile.view');
        });
        for(const key of name==='updateHolyTrails'?['holyTrails']:name==='updateFireRings'?['fireRings']:[])
          collection(game[key],item=>hooks(item.trail??item.ring,['update','dispose'],key));
        if(name==='updateBastion')hooks(game.bastion?.dome,['update'],'bastion.dome');
        if(name==='updateYggdrasil')hooks(game.yggdrasil?.circle,['update'],'yggdrasil.circle');
        if(name==='updateBuffAuras')collection(game.buffAuras?.values(),item=>hooks(item.ring,['update','dispose'],'aura.ring'));
      }
      profile.setupMs+=Math.max(0,performance.now()-start);active.push(ctx);return ctx;
    }
    function end(ctx,elapsed,children){
      if(!ctx)return;active.splice(active.lastIndexOf(ctx),1);
      const p=ctx.profile;p.sampledCalls++;p.totalMs+=elapsed;p.nestedMeasuredMs+=children;
      const start=performance.now();restorePerformanceRecords(ctx.records);p.restoreMs+=Math.max(0,performance.now()-start);
    }
    function baseFinished(elapsed){
      for(const ctx of active){const frame=ctx.stack[ctx.stack.length-1];if(frame&&session.stack.length===frame.baseDepth)frame.children+=elapsed;}
    }
    function report(){return [...profiles.values()].map(({methods,...p})=>{
      const rows=[...methods.values()].map(({samples,...row})=>({...row,meanMs:row.calls?row.totalMs/row.calls:null,p95Ms:performancePercentile(samples,.95),sampleCount:samples.length}));
      const detailedMs=rows.reduce((sum,row)=>sum+row.selfMs,0);
      return {...p,sampling:{interval:limits.interval,offset:offsets[p.scope]??0,updateCalls:p.updateCalls,sampledCalls:p.sampledCalls},methods:rows,detailedMs,remainingMs:Math.max(0,p.totalMs-p.nestedMeasuredMs-detailedMs)};
    });}
    function restore(){for(const ctx of [...active].reverse())restorePerformanceRecords(ctx.records);}
    return {begin,end,baseFinished,report,restore,limits};
  }
  function startPerformanceMeasurement(seconds=15){
    if(performanceSession)return {ok:false,error:'已有量測正在進行'};
    const game=activeGame;
    if(!game||typeof game.step!=='function')return {ok:false,error:'請先進入一場遊戲，再啟動量測'};
    seconds=Number(seconds);if(!Number.isFinite(seconds)||seconds<1||seconds>60)return {ok:false,error:'量測秒數須為 1～60'};
    const session={game,seconds,phase:'waiting',createdAt:performance.now(),startedAt:null,endedAt:null,records:[],stack:[],stats:new Map(),missing:[],weapons:new WeakSet(),counts:{},frames:[],lastFrame:null,frameId:null,timer:null,waitTimer:null,projectileTargets:new WeakMap(),projectileCoverage:{modelTargets:0,viewTargets:0,unwrappedTargets:0},pickupStart:null,profilerOverhead:{enemySetupMs:0,enemyRestoreMs:0},enemyTargets:new WeakMap(),enemyObserved:new WeakSet(),enemySampling:{interval:32,updateCalls:0,sampledCalls:0,totalMs:0,selfMs:0},enemyCoverage:{observedEnemies:0,viewTargets:0,missingViewTargets:0,unwrappedTargets:0}};
    performanceSession=session;
    session.details=createPerformanceDetailSampler(session);
    function begin(){
      if(session.startedAt!==null)return;
      session.startedAt=performance.now();session.phase='recording';clearTimeout(session.waitTimer);
      session.pickupStart=typeof pickupPerformanceSnapshot==='function'?pickupPerformanceSnapshot(game):null;
      session.timer=setTimeout(()=>stopPerformanceMeasurement('completed'),seconds*1000);
    }
    function wrap(object,key,category,name=key,scope=null){
      if(!object||typeof object[key]!=='function'){session.missing.push(name);return;}
      const descriptor=Object.getOwnPropertyDescriptor(object,key),original=object[key];
      if(descriptor&&(!descriptor.configurable||descriptor.get||descriptor.set)){session.missing.push(name);return;}
      const stat=session.stats.get(name)||{name,category,calls:0,totalMs:0,selfMs:0,maxMs:0,samples:[]};
      const wrapper=function(...args){
        if(performanceSession!==session||game.state!=='playing'||document.hidden)return Reflect.apply(original,this,args);
        if(scope&&!session.stack.some(frame=>frame.name===scope))return Reflect.apply(original,this,args);
        begin();
        if(name==='updateProjectiles')observeProjectiles();
        const enemySample=name==='updateEnemies'&&session.enemySampling.updateCalls++%session.enemySampling.interval===0;
        const detailStart=session.records.length;
        if(enemySample){const start=performance.now();session.enemyTargets=new WeakMap();observeEnemies();session.profilerOverhead.enemySetupMs+=Math.max(0,performance.now()-start);}
        if(category==='step'){
          for(const weapon of game.weapons||[])if(weapon&&!session.weapons.has(weapon)){session.weapons.add(weapon);wrap(weapon,'update','skills','weapon:'+session.weaponsCount++);}
          for(const key of ['pickups','enemies','projectiles','fx','numbers','weapons']){const value=game[key]?.length;if(Number.isFinite(value)){const count=session.counts[key]||{samples:0,total:0,max:0};count.samples++;count.total+=value;count.max=Math.max(count.max,value);session.counts[key]=count;}}
        }
        const detail=session.details.begin(name);
        const frame={name,start:performance.now(),children:0};session.stack.push(frame);
        try{return Reflect.apply(original,this,args);}
        finally{
          const elapsed=Math.max(0,performance.now()-frame.start);session.stack.pop();
          session.details.end(detail,elapsed,frame.children);
          session.details.baseFinished(elapsed);
          const parent=session.stack[session.stack.length-1];if(parent)parent.children+=elapsed;
          if(enemySample){
            session.enemySampling.sampledCalls++;session.enemySampling.totalMs+=elapsed;session.enemySampling.selfMs+=Math.max(0,elapsed-frame.children);
            const restoreStart=performance.now();
            const added=session.records.splice(detailStart);
            session.records.push(...added.filter(record=>!record.enemyDetail));
            restorePerformanceRecords(added.filter(record=>record.enemyDetail));
            session.profilerOverhead.enemyRestoreMs+=Math.max(0,performance.now()-restoreStart);
          }
          stat.calls++;stat.totalMs+=elapsed;stat.selfMs+=Math.max(0,elapsed-frame.children);stat.maxMs=Math.max(stat.maxMs,elapsed);
          if(stat.samples.length<4096)stat.samples.push(elapsed);else stat.samples[(stat.calls-1)%4096]=elapsed;
        }
      };
      try{Object.defineProperty(object,key,{configurable:true,enumerable:descriptor?.enumerable??false,writable:true,value:wrapper});}
      catch{session.missing.push(name);return;}
      session.stats.set(name,stat);session.records.push({object,key,descriptor,wrapper,enemyDetail:scope==='updateEnemies'});
      return true;
    }
    function observeProjectiles(){
      for(const projectile of game.projectiles||[])for(const kind of ['model','view']){
        const target=projectile?.[kind];if(!target||typeof target.update!=='function')continue;
        if(session.projectileTargets.has(target))continue;
        session.projectileTargets.set(target,true);session.projectileCoverage[kind+'Targets']++;
        if(!wrap(target,'update','effects','projectile:'+kind+'.update','updateProjectiles'))session.projectileCoverage.unwrappedTargets++;
      }
    }
    function enemyWrap(target,key,group){
      if(!target||typeof target[key]!=='function')return false;
      let keys=session.enemyTargets.get(target);if(!keys){keys=new Set();session.enemyTargets.set(target,keys);}
      if(keys.has(key))return true;keys.add(key);
      if(!wrap(target,key,'enemies','enemy:'+group+':'+key,'updateEnemies'))session.enemyCoverage.unwrappedTargets++;
      return true;
    }
    function observeEnemies(){
      for(const [key,group] of [['buildSeparation','separation'],['separate','separation'],['chaseTarget','targeting'],['followHost','targeting']])enemyWrap(game,key,group);
      for(const key of ['lineClear','flowDir','resolve','warpAt','nearestWalkable'])enemyWrap(game.walk,key,'navigation');
      for(const enemy of game.enemies||[]){
        if(!enemy||typeof enemy!=='object')continue;
        let keys=session.enemyTargets.get(enemy);if(!keys){keys=new Set();session.enemyTargets.set(enemy,keys);}
        if(!session.enemyObserved.has(enemy)){session.enemyObserved.add(enemy);session.enemyCoverage.observedEnemies++;
          if(typeof enemy.updateView==='function')session.enemyCoverage.viewTargets++;else session.enemyCoverage.missingViewTargets++;
        }
        enemyWrap(enemy,'updateView','view');
        enemyWrap(game.bossBrains?.get(enemy),'update','bossAI');
      }
    }
    session.weaponsCount=0;
    wrap(game,'step','step');
    if(!session.stats.has('step')){performanceSession=null;return {ok:false,error:'無法安全包裝目前遊戲的 step 方法'};}
    for(const [method,category] of Object.entries(performanceMethods))wrap(game,method,category);
    wrap(game.world3d,'render','render','world3d.render');
    if(typeof game.renderWorld==='function')wrap(game,'renderWorld','renderFrame');
    function sampleFrame(now){
      if(performanceSession!==session)return;
      if(session.phase==='recording'&&game.state==='playing'&&!document.hidden){if(session.lastFrame!==null&&session.frames.length<8192)session.frames.push(now-session.lastFrame);session.lastFrame=now;}
      else session.lastFrame=null;
      session.frameId=window.requestAnimationFrame?.(sampleFrame)??null;
    }
    session.frameId=window.requestAnimationFrame?.(sampleFrame)??null;
    session.waitTimer=setTimeout(()=>stopPerformanceMeasurement('no-playing-scene'),120000);
    return {ok:true,phase:'waiting',seconds};
  }
  function restorePerformanceRecords(records){
    for(const {object,key,descriptor,wrapper} of records.reverse())if(object[key]===wrapper){if(descriptor)Object.defineProperty(object,key,descriptor);else delete object[key];}
  }
  function stopPerformanceMeasurement(reason='manual'){
    const session=performanceSession;if(!session)return lastPerformanceReport;
    performanceSession=null;session.endedAt=performance.now();clearTimeout(session.timer);clearTimeout(session.waitTimer);
    if(session.frameId!==null)window.cancelAnimationFrame?.(session.frameId);
    session.details.restore();
    restorePerformanceRecords(session.records);
    const methods=[...session.stats.values()].map(({samples,...stat})=>({...stat,meanMs:stat.calls?stat.totalMs/stat.calls:null,p95Ms:performancePercentile(samples,.95),sampleCount:samples.length}));
    const step=methods.find(row=>row.category==='step'),steps=step?.calls||0;
    const categories=Object.entries(performanceLabels).map(([key,label])=>{
      const rows=methods.filter(row=>row.category===key),selfMs=key==='other'?(step?.selfMs||0):rows.reduce((sum,row)=>sum+row.selfMs,0);
      return {key,label,calls:key==='other'?steps:rows.reduce((sum,row)=>sum+row.calls,0),selfMs,msPerGameStep:steps&&key!=='render'?selfMs/steps:null,percentOfGameStep:step?.totalMs&&key!=='render'?100*selfMs/step.totalMs:null};
    });
    const frameSum=session.frames.reduce((sum,value)=>sum+value,0);
    const projectile=methods.find(row=>row.name==='updateProjectiles'),model=methods.find(row=>row.name==='projectile:model.update'),view=methods.find(row=>row.name==='projectile:view.update');
    const visualMs=(model?.selfMs||0)+(view?.selfMs||0),pickupEnd=typeof pickupPerformanceSnapshot==='function'?pickupPerformanceSnapshot(session.game):null;
    const skipped={};for(const key of ['visualCallsSkipped','beamCallsSkipped','beamPositionsSkipped','stationaryBeamPositionsSkipped'])skipped[key]=session.pickupStart&&pickupEnd?pickupEnd.counters[key]-session.pickupStart.counters[key]:null;
    const enemy=methods.find(row=>row.name==='updateEnemies');
    const enemyGroups=Object.fromEntries(['view','separation','navigation','targeting','bossAI'].map(group=>[group,methods.filter(row=>row.name.startsWith('enemy:'+group+':')).reduce((sum,row)=>sum+row.selfMs,0)]));
    const enemyMeasured=Object.values(enemyGroups).reduce((sum,value)=>sum+value,0);
    lastPerformanceReport={format:5,reason,seconds:session.startedAt===null?0:(session.endedAt-session.startedAt)/1000,gameSteps:steps,coop:!!session.game.coop,replica:!!session.game.coop?.replica,
      pickupOptimization:{start:session.pickupStart,end:pickupEnd,skippedDuringMeasurement:skipped},
      projectileBreakdown:{totalMs:projectile?.totalMs??null,visualCallbacksMs:visualMs,remainingMs:projectile?Math.max(0,projectile.totalMs-visualMs):null,modelUpdateCalls:model?.calls||0,viewUpdateCalls:view?.calls||0,...session.projectileCoverage},
      enemyBreakdown:{sampling:{interval:session.enemySampling.interval,updateCalls:session.enemySampling.updateCalls,sampledCalls:session.enemySampling.sampledCalls},totalMs:enemy?session.enemySampling.totalMs:null,groupsMs:enemyGroups,remainingMs:enemy?session.enemySampling.selfMs:null,nestedOtherMs:enemy?Math.max(0,session.enemySampling.totalMs-session.enemySampling.selfMs-enemyMeasured):null,...session.enemyCoverage},
      profilerOverhead:session.profilerOverhead,
      detailedSampling:{limits:session.details.limits,scopes:session.details.report()},
      categories,methods,counts:Object.fromEntries(Object.entries(session.counts).map(([key,value])=>[key,{mean:value.total/value.samples,max:value.max}])),missing:session.missing,
      frames:{samples:session.frames.length,fps:frameSum?session.frames.length*1000/frameSum:null,p95IntervalMs:performancePercentile(session.frames,.95)},
      notes:['detailedSampling 各 scope 只代表自己的抽樣更新，totalMs = detailedMs + nestedMeasuredMs + remainingMs；各 scope 不相加或外推為全程。setupMs/restoreMs 為可觀察到的掛載與還原成本，未涵蓋全部計時負擔。renderWorld 含 world3d.render，不再與其相加。','怪物細節每 32 次更新抽樣一次，totalMs/groupsMs/remainingMs 僅代表抽樣更新，不外推為全程；分類與 updateEnemies 方法仍逐次計時。細節包裝僅在抽樣更新期間安裝，完成即還原，安裝及還原成本留在外層呼叫者。','怪物細分使用排他耗時，groupsMs、remainingMs、nestedOtherMs 合計為 totalMs，已含於原分類；其餘不是純邏輯。逐怪物掃描與計時增加負擔，請使用同版本比較；同次更新內新增目標可能漏拆。','同步 JavaScript／CPU 耗時，含計時負擔；不是 GPU 計時。','拾取更新包含距離掃描、吸取移動、視覺更新、收集與清理，無法單獨代表距離掃描。','分類使用排除已量測子呼叫後的耗時，避免重複相加；各方法 totalMs 為含子呼叫耗時。','每遊戲步平均不是每畫面幀平均；3D 繪圖單獨列出，不納入遊戲步占比。','未拆出的技能 hook／助手與行內運算等工作歸其餘；p95 取各方法最多最近 4096 次樣本。','物件數為陣列長度，可能包含等待清除的物件。','投射物視覺回呼僅計 updateProjectiles 內 model.update／view.update 的排他耗時；其餘包含移動、碰撞、傷害、命中特效建立、清理及未拆出的視覺工作，並非純邏輯。畫面投影 placeOverlay 不在此範圍。','拾取 start/end 為當前場景快照；skippedDuringMeasurement 為期間差值，零代表沒有觀察到略過，不能單憑零判定優化失效。投射物逐物件計時會增加負擔，不能直接和舊版當作無負擔基準比較。']};
    return lastPerformanceReport;
  }
  function performanceMeasurementState(){return {phase:performanceSession?.phase||'idle',seconds:performanceSession?.seconds??null,hasReport:!!lastPerformanceReport};}
  function updatePerformanceOption(){
    const anchor=document.querySelector('[data-ro-pickup-option="show-fps"]')?.closest('label');if(!anchor||document.querySelector('#ro-performance-start'))return;
    const row=document.createElement('div');row.className='opt-row';
    const label=document.createElement('span');label.textContent='戰鬥效能量測';
    const start=document.createElement('button');start.id='ro-performance-start';start.type='button';start.textContent='量測 15 秒';
    const view=document.createElement('button');view.type='button';view.textContent='查看報告';view.onclick=openPerformanceReport;
    const status=document.createElement('small');status.setAttribute('role','status');
    start.onclick=()=>{
      if(performanceSession){stopPerformanceMeasurement();status.textContent='量測已停止';start.textContent='量測 15 秒';openPerformanceReport();return;}
      const result=startPerformanceMeasurement();if(!result.ok){status.textContent=result.error;return;}
      start.textContent='停止量測';status.textContent='回到戰鬥後開始，15 秒後自動完成';
      function refresh(){
        if(!row.isConnected)return;
        if(performanceSession){status.textContent=performanceSession.phase==='waiting'?'等待回到戰鬥…':'量測中，請維持平常遊玩方式';setTimeout(refresh,500);}
        else{status.textContent='量測已結束，可查看報告';start.textContent='量測 15 秒';}
      }
      setTimeout(refresh,500);
    };
    row.append(label,start,view,status);anchor.after(row);
  }
  function openPerformanceReport(){
    document.querySelector('#ro-performance-report')?.remove();
    const panel=document.createElement('section');panel.id='ro-performance-report';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','戰鬥效能量測報告');
    panel.style.cssText='position:fixed;inset:5%;z-index:2147483647;overflow:auto;padding:16px;background:#101b2b;color:#eef;border:1px solid #789;border-radius:8px;font:14px/1.5 sans-serif';
    const title=document.createElement('h3');title.textContent='戰鬥效能量測報告';
    const note=document.createElement('p');note.textContent=performanceSession?'量測尚未結束，以下是上次完成的報告。':lastPerformanceReport?'以下為同步 CPU 耗時；資料僅留在本分頁，不會上傳。':'尚無報告，請在遊戲選項按「量測 15 秒」，再回到戰鬥。';
    const summary=document.createElement('pre');summary.style.whiteSpace='pre-wrap';
    if(lastPerformanceReport)summary.textContent=lastPerformanceReport.categories.map(row=>row.key==='render'?`${row.label}：總計 ${row.selfMs.toFixed(2)} ms`:`${row.label}：${row.msPerGameStep===null?'無樣本':row.msPerGameStep.toFixed(3)+' ms／遊戲步'}${row.percentOfGameStep===null?'':'（'+row.percentOfGameStep.toFixed(1)+'%）'}`).join('\n');
    if(lastPerformanceReport){
      const pickup=lastPerformanceReport.pickupOptimization,projectile=lastPerformanceReport.projectileBreakdown;
      if(pickup)summary.textContent+='\n拾取視覺優化：'+(pickup.end?.helpersInstalled?'已掛載':'未掛載／無資料')+'；期間略過（物品動畫／光柱動畫／隱藏光柱定位／靜止光柱定位）：'+Object.values(pickup.skippedDuringMeasurement).map(value=>value??'無資料').join('／');
      if(pickup?.end){const current=pickup.end.current;summary.textContent+='\n結束時物品動畫覆蓋：'+current.visualPatched+'/'+current.live+'（隱藏 '+current.hidden+'）；光柱動畫覆蓋：'+current.beamPatched+'/'+current.beams+'（隱藏 '+current.hiddenBeams+'）；光柱定位快取：'+(pickup.end.beamPositionPatched?'已掛載':'未掛載');}
      for(const [key,label] of [['start','開始'],['end','結束']]){
        const inventory=pickup?.[key]?.inventory;if(!inventory)continue;
        summary.textContent+='\n'+label+'物品檢查：陣列 '+inventory.entries+' 筆，未死亡 '+inventory.live+' 筆／'+inventory.uniqueLiveObjects+' 個不同物件，死亡 '+inventory.dead+' 筆，重複參照 '+inventory.duplicateReferences+' 筆（'+inventory.repeatedObjects+' 個物件重複），無效 '+inventory.invalidEntries+' 筆';
        for(const row of inventory.byKind)summary.textContent+='\n  '+(row.kind===null?'[缺少或非字串 kind]':row.kind)+': '+row.entries+' 筆，未死亡 '+row.live+' 筆／'+row.uniqueLiveObjects+' 個不同物件，死亡 '+row.dead+' 筆，重複 '+row.duplicateReferences+' 筆，隱藏 '+row.hiddenLive+' 筆，吸取中 '+row.magnetLive+' 筆';
      }
      const enemy=lastPerformanceReport.enemyBreakdown;if(enemy)summary.textContent+='\n怪物更新細分（僅抽樣 '+enemy.sampling.sampledCalls+'/'+enemy.sampling.updateCalls+' 次，ms）：'+Object.entries(enemy.groupsMs).map(([key,value])=>key+' '+value.toFixed(2)).join('／')+'；其餘 '+(enemy.remainingMs?.toFixed(2)??'無樣本')+'；視覺目標 '+enemy.viewTargets+'/'+enemy.observedEnemies+'；無法包裝 '+enemy.unwrappedTargets;
      for(const scope of lastPerformanceReport.detailedSampling?.scopes||[]){summary.textContent+='\n細部抽樣 '+scope.scope+'：'+scope.sampledCalls+'/'+scope.updateCalls+' 次；掛載／還原 '+scope.setupMs.toFixed(2)+'／'+scope.restoreMs.toFixed(2)+' ms；未拆出 '+scope.remainingMs.toFixed(2)+' ms；超額略過 '+scope.budgetSkippedCalls+' 次';for(const row of [...scope.methods].sort((a,b)=>b.selfMs-a.selfMs).slice(0,5))summary.textContent+='\n  '+row.name+'：排他 '+row.selfMs.toFixed(2)+' ms（'+row.calls+' 次）';}
      if(projectile)summary.textContent+='\n投射物視覺回呼：'+projectile.visualCallbacksMs.toFixed(2)+' ms；其餘更新（含未拆出視覺）：'+(projectile.remainingMs?.toFixed(2)??'無樣本')+' ms；無法包裝目標：'+projectile.unwrappedTargets;
    }
    const text=document.createElement('textarea');text.readOnly=true;text.setAttribute('aria-label','效能報告 JSON');text.style.cssText='display:block;width:100%;height:35vh;box-sizing:border-box';text.value=lastPerformanceReport?JSON.stringify(lastPerformanceReport,null,2):'';
    const copy=document.createElement('button');copy.textContent='複製報告';copy.onclick=async()=>{try{if(!window.navigator?.clipboard?.writeText)throw Error('clipboard unavailable');await window.navigator.clipboard.writeText(text.value);note.textContent='已複製，可貼回對話分析。';}catch{text.focus();text.select?.();note.textContent='請手動複製下方已選取的報告。';}};
    const close=document.createElement('button');close.textContent='關閉';close.onclick=()=>panel.remove();panel.append(title,note,summary,copy,close,text);document.body.append(panel);
  }
  window[runtimeKey].profile={start:startPerformanceMeasurement,stop:stopPerformanceMeasurement,state:performanceMeasurementState,report:()=>lastPerformanceReport};
