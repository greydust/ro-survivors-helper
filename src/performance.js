  const performanceLabels={pickups:'拾取更新（含移動、動畫與收集）',enemies:'怪物更新',grid:'怪物空間索引',skills:'技能更新',effects:'投射物與技能效果',visuals:'特效與傷害數字',other:'其餘遊戲更新／助手',render:'3D 繪圖 CPU 提交'};
  let performanceSession=null,lastPerformanceReport=null;
  const performanceMethods={updatePickups:'pickups',updateEnemies:'enemies',rebuildGrid:'grid',updateProjectiles:'effects',updateHolyTrails:'effects',updateFireRings:'effects',updatePulls:'effects',updateBastion:'effects',updateYggdrasil:'effects',updateBuffAuras:'effects',updateFxList:'visuals'};
  function performancePercentile(values,fraction){if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.max(0,Math.ceil(sorted.length*fraction)-1)];}
  function startPerformanceMeasurement(seconds=15){
    if(performanceSession)return {ok:false,error:'已有量測正在進行'};
    const game=activeGame;
    if(!game||typeof game.step!=='function')return {ok:false,error:'請先進入一場遊戲，再啟動量測'};
    seconds=Number(seconds);if(!Number.isFinite(seconds)||seconds<1||seconds>60)return {ok:false,error:'量測秒數須為 1～60'};
    const session={game,seconds,phase:'waiting',createdAt:performance.now(),startedAt:null,endedAt:null,records:[],stack:[],stats:new Map(),missing:[],weapons:new WeakSet(),counts:{},frames:[],lastFrame:null,frameId:null,timer:null,waitTimer:null};
    performanceSession=session;
    function begin(){
      if(session.startedAt!==null)return;
      session.startedAt=performance.now();session.phase='recording';clearTimeout(session.waitTimer);
      session.timer=setTimeout(()=>stopPerformanceMeasurement('completed'),seconds*1000);
    }
    function wrap(object,key,category,name=key){
      if(!object||typeof object[key]!=='function'){session.missing.push(name);return;}
      const descriptor=Object.getOwnPropertyDescriptor(object,key),original=object[key];
      if(descriptor&&(!descriptor.configurable||descriptor.get||descriptor.set)){session.missing.push(name);return;}
      const stat={name,category,calls:0,totalMs:0,selfMs:0,maxMs:0,samples:[]};
      const wrapper=function(...args){
        if(performanceSession!==session||game.state!=='playing'||document.hidden)return Reflect.apply(original,this,args);
        begin();
        if(category==='step'){
          for(const weapon of game.weapons||[])if(weapon&&!session.weapons.has(weapon)){session.weapons.add(weapon);wrap(weapon,'update','skills','weapon:'+session.weaponsCount++);}
          for(const key of ['pickups','enemies','projectiles','fx','numbers','weapons']){const value=game[key]?.length;if(Number.isFinite(value)){const count=session.counts[key]||{samples:0,total:0,max:0};count.samples++;count.total+=value;count.max=Math.max(count.max,value);session.counts[key]=count;}}
        }
        const frame={start:performance.now(),children:0};session.stack.push(frame);
        try{return Reflect.apply(original,this,args);}
        finally{
          const elapsed=Math.max(0,performance.now()-frame.start);session.stack.pop();
          const parent=session.stack[session.stack.length-1];if(parent)parent.children+=elapsed;
          stat.calls++;stat.totalMs+=elapsed;stat.selfMs+=Math.max(0,elapsed-frame.children);stat.maxMs=Math.max(stat.maxMs,elapsed);
          if(stat.samples.length<4096)stat.samples.push(elapsed);else stat.samples[(stat.calls-1)%4096]=elapsed;
        }
      };
      try{Object.defineProperty(object,key,{configurable:true,enumerable:descriptor?.enumerable??false,writable:true,value:wrapper});}
      catch{session.missing.push(name);return;}
      session.stats.set(name,stat);session.records.push({object,key,descriptor,wrapper});
    }
    session.weaponsCount=0;
    wrap(game,'step','step');
    if(!session.stats.has('step')){performanceSession=null;return {ok:false,error:'無法安全包裝目前遊戲的 step 方法'};}
    for(const [method,category] of Object.entries(performanceMethods))wrap(game,method,category);
    wrap(game.world3d,'render','render','world3d.render');
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
  function stopPerformanceMeasurement(reason='manual'){
    const session=performanceSession;if(!session)return lastPerformanceReport;
    performanceSession=null;session.endedAt=performance.now();clearTimeout(session.timer);clearTimeout(session.waitTimer);
    if(session.frameId!==null)window.cancelAnimationFrame?.(session.frameId);
    for(const {object,key,descriptor,wrapper} of session.records.reverse())if(object[key]===wrapper){if(descriptor)Object.defineProperty(object,key,descriptor);else delete object[key];}
    const methods=[...session.stats.values()].map(({samples,...stat})=>({...stat,meanMs:stat.calls?stat.totalMs/stat.calls:null,p95Ms:performancePercentile(samples,.95),sampleCount:samples.length}));
    const step=methods.find(row=>row.category==='step'),steps=step?.calls||0;
    const categories=Object.entries(performanceLabels).map(([key,label])=>{
      const rows=methods.filter(row=>row.category===key),selfMs=key==='other'?(step?.selfMs||0):rows.reduce((sum,row)=>sum+row.selfMs,0);
      return {key,label,calls:key==='other'?steps:rows.reduce((sum,row)=>sum+row.calls,0),selfMs,msPerGameStep:steps&&key!=='render'?selfMs/steps:null,percentOfGameStep:step?.totalMs&&key!=='render'?100*selfMs/step.totalMs:null};
    });
    const frameSum=session.frames.reduce((sum,value)=>sum+value,0);
    lastPerformanceReport={format:1,reason,seconds:session.startedAt===null?0:(session.endedAt-session.startedAt)/1000,gameSteps:steps,coop:!!session.game.coop,replica:!!session.game.coop?.replica,
      categories,methods,counts:Object.fromEntries(Object.entries(session.counts).map(([key,value])=>[key,{mean:value.total/value.samples,max:value.max}])),missing:session.missing,
      frames:{samples:session.frames.length,fps:frameSum?session.frames.length*1000/frameSum:null,p95IntervalMs:performancePercentile(session.frames,.95)},
      notes:['同步 JavaScript／CPU 耗時，含計時負擔；不是 GPU 計時。','拾取更新包含距離掃描、吸取移動、視覺更新、收集與清理，無法單獨代表距離掃描。','分類使用排除已量測子呼叫後的耗時，避免重複相加；各方法 totalMs 為含子呼叫耗時。','每遊戲步平均不是每畫面幀平均；3D 繪圖單獨列出，不納入遊戲步占比。','未包裝的技能 hook、地圖／玩家／助手等工作歸其餘；p95 取各方法最多最近 4096 次樣本。','物件數為陣列長度，可能包含等待清除的物件。']};
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
    const text=document.createElement('textarea');text.readOnly=true;text.setAttribute('aria-label','效能報告 JSON');text.style.cssText='display:block;width:100%;height:35vh;box-sizing:border-box';text.value=lastPerformanceReport?JSON.stringify(lastPerformanceReport,null,2):'';
    const copy=document.createElement('button');copy.textContent='複製報告';copy.onclick=async()=>{try{if(!window.navigator?.clipboard?.writeText)throw Error('clipboard unavailable');await window.navigator.clipboard.writeText(text.value);note.textContent='已複製，可貼回對話分析。';}catch{text.focus();text.select?.();note.textContent='請手動複製下方已選取的報告。';}};
    const close=document.createElement('button');close.textContent='關閉';close.onclick=()=>panel.remove();panel.append(title,note,summary,copy,close,text);document.body.append(panel);
  }
  window[runtimeKey].profile={start:startPerformanceMeasurement,stop:stopPerformanceMeasurement,state:performanceMeasurementState,report:()=>lastPerformanceReport};
