  const MINIMAP_MAGNET_KEY='greydust.ro.hide-minimap-magnets.v1';
  const HORDE_RING_KEY='greydust.ro.show-horde-ring.v1';
  let hideMinimapMagnets=false;
  let showHordeRing=true;
  let hordeScout=null;
  function setScoutButtonState(button,enabled){
    button.setAttribute('aria-pressed',String(enabled));
    button.setAttribute('aria-label',enabled?'關閉怪物潮站位標記':'掃描怪物潮最佳站位');
    const slash=button.querySelector('[data-scout-slash]');if(slash)slash.style.display=enabled&&hordeScout?.result?'':'none';
  }
  function toggleHordeScout(button){
    if(button.getAttribute('aria-busy')==='true')return;
    if(hordeScout){
      hordeScout=null;button.removeAttribute('aria-busy');setScoutButtonState(button,false);
      button.title='怪物潮站位已關閉；點擊重新掃描';return;
    }
    return scanHordePosition(button);
  }
  const scoutReach=game=>typeof game?.logicReach==='function'?game.logicReach():game?.world3d?.viewReach;
  function scoutIsCurrent(scan){
    return scan&&activeGame===scan.game&&scan.game.map===scan.map&&scan.game.walk===scan.walk&&
      scan.game.walk?.warpsKey===scan.warpsKey&&Math.abs(scoutReach(scan.game)-scan.reach)<1&&scan.game.state!=='over';
  }
  function scoutValidPoint(game,x,y){
    const b=game.bounds;
    return x>b.x0&&x<b.x1&&y>b.y0&&y<b.y1&&(!game.walk||(game.walk.walkable(x,y)&&game.walk.reachable(x,y)));
  }
  // Integrate each independent radius attempt, rather than treating three
  // successful samples as three monsters. No native RNG or spawn methods run.
  function scoutDirections(reach,count,jitters=1,samples=3){
    const directions=[];
    for(let i=0;i<count;i++)for(let j=0;j<jitters;j++){
      const angle=i/count*Math.PI*2+((j+.5)/jitters-.5)*.04,c=Math.cos(angle),s=Math.sin(angle);
      directions.push([0,90,180].map(extra=>Array.from({length:samples},(_,k)=>{
        const radius=reach+90+extra+(k+.5)*40/samples;return [c*radius,s*radius];
      })));
    }
    return directions;
  }
  function scoutScore(game,x,y,directions){
    let total=0;
    for(const attempts of directions){
      let failure=1;
      for(const samples of attempts){
        let valid=0;for(const [dx,dy] of samples)if(scoutValidPoint(game,x+dx,y+dy))valid++;
        failure*=1-valid/samples.length;if(!failure)break;
      }
      total+=1-failure;
    }
    return total/directions.length;
  }
  async function scanHordePosition(button){
    const game=activeGame,reach=scoutReach(game);
    if(!game?.map||!game.player||!game.bounds||!Number.isFinite(reach)||reach<=0||
      (game.walk&&(!game.walk.walkable||!game.walk.reachable))){notify('目前無法取得地圖與視野資料');return;}
    const scan={game,map:game.map,walk:game.walk,warpsKey:game.walk?.warpsKey,reach,result:null};hordeScout=scan;
    setScoutButtonState(button,true);button.disabled=true;button.setAttribute('aria-busy','true');button.title='正在掃描怪物潮站位…';
    try{
      const directions=scoutDirections(reach,96),best=[];
      let deadline=performance.now()+8;
      const consider=(x,y)=>{
        if(!scoutValidPoint(game,x,y))return;
        const score=scoutScore(game,x,y,directions),distance=Math.hypot(x-game.player.x,y-game.player.y);
        best.push({x,y,score,distance});best.sort((a,b)=>b.score-a.score||a.distance-b.distance);if(best.length>24)best.pop();
      };
      // Native walk cells are 32 world units; scan every cell centre.
      const b=game.bounds;
      for(let y=Math.floor(b.y0/32)*32+16;y<b.y1;y+=32)for(let x=Math.floor(b.x0/32)*32+16;x<b.x1;x+=32){
        if(hordeScout!==scan||!scoutIsCurrent(scan))return;
        consider(x,y);
        if(performance.now()>=deadline){await new Promise(resolve=>setTimeout(resolve,0));deadline=performance.now()+8;}
      }
      if(scoutValidPoint(game,game.player.x,game.player.y))consider(game.player.x,game.player.y);
      const fine=scoutDirections(reach,720,3,5);
      for(const point of best){
        if(hordeScout!==scan||!scoutIsCurrent(scan))return;
        point.score=scoutScore(game,point.x,point.y,fine);
        await new Promise(resolve=>setTimeout(resolve,0));
      }
      if(!scoutIsCurrent(scan)||hordeScout!==scan)return;
      best.sort((a,b)=>b.score-a.score||a.distance-b.distance);scan.result=best[0]||null;
      if(scan.result){
        setScoutButtonState(button,true);
        button.title=`怪物潮最佳站位：估計出生成功率 ${(scan.result.score*100).toFixed(1)}%（地形抽樣）；點擊關閉標記`;
        notify(`已標記綠色三角形：估計怪物潮出生成功率 ${(scan.result.score*100).toFixed(1)}%`);
      }else{hordeScout=null;setScoutButtonState(button,false);button.title='找不到可到達的站位；點擊重新掃描';notify('目前地圖找不到可到達的站位');}
    }catch(error){if(hordeScout===scan){hordeScout=null;setScoutButtonState(button,false);button.title='掃描失敗；點擊重試';notify('怪物潮站位掃描失敗');}console.debug('[RO助手] 站位掃描失敗',error);}
    finally{
      if(hordeScout===scan||!hordeScout){button.disabled=false;button.removeAttribute('aria-busy');}
      if(hordeScout===scan&&!scoutIsCurrent(scan)){hordeScout=null;setScoutButtonState(button,false);button.title='地圖或視野已改變；請重新掃描';}
    }
  }
  function updateHordeScoutButton(){
    const anchor=document.querySelector('#dps-toggle');if(!anchor)return;
    let button=document.querySelector('#ro-horde-scout');
    if(!button){
      button=document.createElement('button');button.id='ro-horde-scout';button.className=anchor.className;button.type='button';
      button.setAttribute('aria-label','掃描怪物潮最佳站位');button.title='依目前視野掃描怪物潮最佳站位（地形抽樣估計）';
      button.setAttribute('aria-pressed','false');
      button.innerHTML='<svg viewBox="0 0 20 16" width="14" height="12" aria-hidden="true"><path d="M1 8Q10 -4 19 8Q10 20 1 8Z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="10" cy="8" r="3" fill="currentColor"/><path data-scout-slash d="M2 1L18 15" fill="none" stroke="currentColor" stroke-width="2" style="display:none"/></svg>';
      button.onclick=event=>{event.stopPropagation();return toggleHordeScout(button);};
    }
    if(anchor.nextElementSibling!==button)anchor.after(button);
    button.style.cssText=`position:absolute;left:${anchor.offsetWidth?anchor.offsetLeft+anchor.offsetWidth+4:30}px;bottom:4px;top:auto;right:auto;width:${anchor.offsetWidth||22}px;height:${anchor.offsetHeight||22}px;margin:0;padding:0;line-height:1;border-radius:7px;pointer-events:auto;display:grid;place-items:center;opacity:.9;`;
    if(hordeScout&&!scoutIsCurrent(hordeScout)){hordeScout=null;button.disabled=false;button.removeAttribute('aria-busy');setScoutButtonState(button,false);button.title='地圖或視野已改變；請重新掃描';}
  }
  function paintHordeScout(context,image,crop){
    const scan=hordeScout;if(!scan?.result||!scoutIsCurrent(scan))return;
    const proxy={map:scan.map,player:scan.result,logicReach:()=>scan.reach},point=hordeRingGeometry(proxy,image,crop);if(!point)return;
    const size=6*Math.min(2,window.devicePixelRatio||1);
    context.save();try{
      context.setTransform(1,0,0,1,0,0);context.globalAlpha=1;context.setLineDash([]);
      context.beginPath();context.moveTo(point.x,point.y-size);context.lineTo(point.x+size,point.y+size);context.lineTo(point.x-size,point.y+size);context.closePath();
      context.fillStyle='#45ff73';context.strokeStyle='#123d20';context.lineWidth=Math.max(1,size/4);context.fill();context.stroke();
    }finally{context.restore();}
  }
  try{hideMinimapMagnets=localStorage.getItem(MINIMAP_MAGNET_KEY)==='true';}catch{}
  try{showHordeRing=localStorage.getItem(HORDE_RING_KEY)!=='false';}catch{}
  function setHordeRingEnabled(value){
    showHordeRing=!!value;
    try{localStorage.setItem(HORDE_RING_KEY,String(showHordeRing));}catch{notify('設定無法保存，目前只在本分頁有效');}
    updateMinimapOption();
  }
  function hordeRingGeometry(game,image,crop){
    if(!game?.player||!game.map||!image||!crop)return null;
    const [sx,sy,sw,sh,dx,dy,dw,dh]=crop;
    const worldWidth=game.map.width*64,worldHeight=game.map.height*64;
    const iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height;
    const scale=Math.min(iw/worldWidth,ih/worldHeight);
    const reach=typeof game.logicReach==='function'?game.logicReach():game.world3d?.viewReach;
    if(!Number.isFinite(reach)||reach<=0||![scale,sw,sh,dw,dh].every(value=>Number.isFinite(value)&&value>0))return null;
    const padX=(iw-worldWidth*scale)/2,padY=(ih-worldHeight*scale)/2;
    return {x:dx+(padX+game.player.x*scale-sx)*dw/sw,y:dy+(padY+game.player.y*scale-sy)*dh/sh,
      rx:(reach+90)*scale*dw/sw,ry:(reach+90)*scale*dh/sh,
      outerX:(reach+130)*scale*dw/sw,outerY:(reach+130)*scale*dh/sh};
  }
  function paintHordeRing(context,image,crop){
    if(!showHordeRing){safariDiagnostics?.recordMinimap('attempt','disabled');return;}
    const ring=hordeRingGeometry(activeGame,image,crop);
    safariDiagnostics?.recordMinimap('attempt',ring?null:'geometry-unavailable');
    if(!ring)return;
    context.save();
    try{
      context.setTransform(1,0,0,1,0,0);context.globalAlpha=.9;context.strokeStyle='#5de7ff';
      const dpr=Math.min(2,window.devicePixelRatio||1);context.lineWidth=1.3*dpr;
      context.setLineDash([]);context.beginPath();context.ellipse(ring.x,ring.y,ring.rx,ring.ry,0,0,Math.PI*2);context.stroke();
      context.globalAlpha=.55;context.setLineDash([3*dpr,3*dpr]);context.beginPath();context.ellipse(ring.x,ring.y,ring.outerX,ring.outerY,0,0,Math.PI*2);context.stroke();
      safariDiagnostics?.recordMinimap('drawn');
    }finally{context.restore();}
  }
  const patchedMinimapContexts=new WeakSet();
  function patchMinimapContext(context){
    if(!context||patchedMinimapContexts.has(context))return;
    if(!['beginPath','arc','stroke','fillRect'].every(key=>typeof context[key]==='function'))return;
    patchedMinimapContexts.add(context);
    safariDiagnostics?.recordMinimap('patched');
    let magnetPath=false;
    const begin=context.beginPath,arc=context.arc,stroke=context.stroke,fillRect=context.fillRect;
    context.beginPath=function(...args){magnetPath=false;return Reflect.apply(begin,this,args);};
    context.arc=function(x,y,radius,start,end,reverse,...rest){
      // The native minimap magnet is a U-shaped, reversed half-circle. Player,
      // bosses and teammates use full circles; equipment uses diamond paths.
      if(Math.abs(start-Math.PI)<1e-8&&Math.abs(end)<1e-8&&reverse===true)magnetPath=true;
      return Reflect.apply(arc,this,[x,y,radius,start,end,reverse,...rest]);
    };
    context.stroke=function(...args){if(hideMinimapMagnets&&magnetPath)return;return Reflect.apply(stroke,this,args);};
    context.fillRect=function(...args){
      if(hideMinimapMagnets&&magnetPath&&String(this.fillStyle).toLowerCase()==='#e8eef8')return;
      return Reflect.apply(fillRect,this,args);
    };
    // Capture the game's exact minimap crop instead of guessing its zoom/pan.
    let image=null,crop=null,playerArrow=false,drawingOverlay=false;
    if(typeof context.drawImage==='function'){
      const drawImage=context.drawImage;
      context.drawImage=function(...args){if(args.length===9){image=args[0];crop=args.slice(1);}return Reflect.apply(drawImage,this,args);};
    }
    if(typeof context.rotate==='function'&&typeof context.restore==='function'){
      const rotate=context.rotate,restore=context.restore;
      context.rotate=function(...args){if(!drawingOverlay)playerArrow=true;return Reflect.apply(rotate,this,args);};
      context.restore=function(...args){
        const result=Reflect.apply(restore,this,args);
        if(playerArrow&&!drawingOverlay){
          playerArrow=false;drawingOverlay=true;
          try{paintHordeRing(this,image,crop);paintHordeScout(this,image,crop);}catch(error){console.debug('[RO助手] 怪潮範圍繪製失敗',error);}finally{drawingOverlay=false;}
        }
        return result;
      };
    }
  }
  function installMinimapGate(){
    const prototype=window.HTMLCanvasElement?.prototype;if(typeof prototype?.getContext!=='function')return;
    const getContext=prototype.getContext;
    prototype.getContext=function(...args){
      const context=Reflect.apply(getContext,this,args);
      if(args[0]==='2d'&&this.closest('#minimap'))patchMinimapContext(context);
      return context;
    };
  }
  function updateMinimapOption(){
    updateHordeScoutButton();
    const original=document.querySelector('#lu-p-hide');
    const row=original?.closest('label');
    if(row&&!document.querySelector('[data-ro-hide-minimap-magnets]')){
      const label=document.createElement('label');label.className='opt-row opt-check';
      const text=document.createElement('span'),title=document.createElement('b'),hint=document.createElement('small');
      title.textContent='隱藏小地圖磁鐵';hint.textContent='只隱藏小地圖上的磁鐵標記，不影響地上磁鐵與拾取';text.append(title,hint);
      const input=document.createElement('input');input.type='checkbox';input.setAttribute('data-ro-hide-minimap-magnets','');
      input.onchange=()=>{hideMinimapMagnets=input.checked;try{localStorage.setItem(MINIMAP_MAGNET_KEY,String(hideMinimapMagnets));}catch{notify('設定無法保存，目前只在本分頁有效');}};
      const toggle=document.createElement('i');toggle.className='opt-switch';label.append(text,input,toggle);row.after(label);
    }
    const input=document.querySelector('[data-ro-hide-minimap-magnets]');if(input)input.checked=hideMinimapMagnets;
    const magnetRow=input?.closest('label');
    if(magnetRow&&!document.querySelector('[data-ro-show-horde-ring]')){
      const label=document.createElement('label');label.className='opt-row opt-check';
      const text=document.createElement('span'),title=document.createElement('b'),hint=document.createElement('small');
      title.textContent='顯示怪物潮第一圈範圍';hint.textContent='青色實線為基礎半徑，虛線為第一圈隨機距離上限；不代表地形允許出生';text.append(title,hint);
      const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=showHordeRing;checkbox.setAttribute('data-ro-show-horde-ring','');
      checkbox.onchange=()=>setHordeRingEnabled(checkbox.checked);
      const toggle=document.createElement('i');toggle.className='opt-switch';label.append(text,checkbox,toggle);magnetRow.after(label);
    }
    const ringInput=document.querySelector('[data-ro-show-horde-ring]');if(ringInput)ringInput.checked=showHordeRing;
  }
  installMinimapGate();
