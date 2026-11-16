  const MINIMAP_MAGNET_KEY='greydust.ro.hide-minimap-magnets.v1';
  const HORDE_RING_KEY='greydust.ro.show-horde-ring.v1';
  let hideMinimapMagnets=false;
  let showHordeRing=true;
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
          try{paintHordeRing(this,image,crop);}catch(error){console.debug('[RO助手] 怪潮範圍繪製失敗',error);}finally{drawingOverlay=false;}
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
