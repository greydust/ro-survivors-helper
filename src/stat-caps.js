  const statCapFields=['damageReduction','flee'];
  const statCapValues=new WeakMap(),statCapPanels=new WeakSet(),statCapHandlers=new WeakMap(),statCapAttempts=new WeakSet();
  let statCapCapture=null;
  function captureUncappedStats(stats){
    const capture=statCapCapture;
    if(!capture||!stats||!statCapFields.every(key=>Number.isFinite(stats[key])))return;
    capture.latest=stats;
    if(capture.objects.has(stats))return;
    const before={},properties=[];
    for(const key of statCapFields){
      const descriptor=Object.getOwnPropertyDescriptor(stats,key);if(!descriptor?.configurable||!('value' in descriptor)||!descriptor.writable)continue;
      let value=descriptor.value;before[key]=value;
      Object.defineProperty(stats,key,{configurable:true,enumerable:descriptor.enumerable,get:()=>value,set(next){before[key]=value;value=next;}});
      properties.push({key,descriptor,read:()=>value});
    }
    capture.objects.set(stats,{before,properties});
  }
  function withStatCapCapture(action){
    if(statCapCapture)return action();
    const capture={objects:new Map(),latest:null},original=Array.prototype.forEach;
    statCapCapture=capture;
    const wrapped=function(callback,thisArg){
      // Native loadout.applyStats uses modifiers.forEach(fn => fn(stats)).
      // Observe its actual fresh stats, without rebuilding gear/talent rules.
      const source=typeof callback==='function'?Function.prototype.toString.call(callback).replace(/\s+/g,''):'';
      if(!/^([\w$]+)=>\1\([\w$]+\)$/.test(source)||!this.length||!this.every(fn=>typeof fn==='function'))return Reflect.apply(original,this,[callback,thisArg]);
      return Reflect.apply(original,this,[function(fn,index,array){
        const tap=function(stats,...args){captureUncappedStats(stats);return Reflect.apply(fn,this,[stats,...args]);};
        return Reflect.apply(callback,thisArg,[tap,index,array]);
      },thisArg]);
    };
    Array.prototype.forEach=wrapped;
    try{return action();}
    finally{
      if(Array.prototype.forEach===wrapped)Array.prototype.forEach=original;
      for(const [stats,{properties}] of capture.objects)for(const {key,descriptor,read} of properties)Object.defineProperty(stats,key,{...descriptor,value:read()});
      statCapCapture=null;
    }
  }
  function statCapSnapshot(){
    const stats=statCapCapture?.latest,entry=stats&&statCapCapture.objects.get(stats);if(!entry)return null;
    const raw={...entry.before},effective=Object.fromEntries(statCapFields.map(key=>[key,stats[key]]));
    // Crit is not clamped in stats; its single-roll probability saturates at 1.
    if(Number.isFinite(stats.critChance)){raw.critChance=stats.critChance;effective.critChance=Math.min(1,Math.max(0,stats.critChance));}
    return {raw,effective};
  }
  const statCapLabels={damageReduction:['受到的傷害','受到伤害','Daño recibido','Damage taken','Dano recebido'],flee:['Flee','Flee（迴避）'],areaMult:['範圍','范围','Área','Area'],reachMult:['近戰距離','近战距离','Alcance cuerpo a cuerpo','Melee reach','Alcance corpo a corpo'],speedMult:['速度','Velocidad','Speed','Velocidade'],critChance:['爆擊','爆擊率','暴击率','Crítico','Critical chance','Critical']};
  function statCapText(key,value){
    const percent=number=>String(Math.round(number*1000)/10)+'%';
    if(key==='damageReduction')return (value>=0?'-':'+')+percent(Math.abs(value));
    if(['areaMult','reachMult','speedMult'].includes(key))return (value>=1?'+':'')+percent(value-1);
    return percent(value);
  }
  function paintStatCaps(panel){
    const values=statCapValues.get(panel);if(!values)return;
    for(const row of panel.querySelectorAll('.stat-chip')){
      const normalize=text=>(text||'').replace(/[\s（）()]/g,'');
      const label=normalize(row.querySelector('span')?.textContent),key=Object.keys(statCapLabels).find(field=>statCapLabels[field].some(text=>normalize(text)===label)),value=row.querySelector('b');
      if(!key||!value||!Number.isFinite(values.raw[key]))continue;
      // Only show overflow actually lost to a hard cap, not diminishing returns.
      if(!['damageReduction','flee','critChance'].includes(key)||!(values.raw[key]>values.effective[key]+1e-9)){
        value.querySelector('[data-ro-stat-raw]')?.remove();continue;
      }
      if(key==='critChance'&&values.raw[key]>1){const node=value.firstChild,text=statCapText(key,values.effective[key]);if(node?.nodeType===3&&node.textContent!==text)node.textContent=text;}
      let note=value.querySelector('[data-ro-stat-raw]');
      if(!note){note=document.createElement('span');note.dataset.roStatRaw=key;value.append(note);}
      const text=' ('+statCapText(key,values.raw[key])+')';if(note.textContent!==text)note.textContent=text;
      note.title=key==='critChance'?'括號為面板原始爆擊率；單次判定最多 100%，未包含戰鬥 buff／技能額外爆率':'括號為硬上限截斷前的原始加總值';
    }
  }
  function updateStatCapDisplay(){
    const character=document.querySelector('#charpanel'),panel=character?.querySelector('#cp-stats');
    if(!character||character.classList.contains('hidden')||!panel)return;
    if(!statCapPanels.has(panel)){
      let proto=Object.getPrototypeOf(panel),descriptor;
      while(proto&&!descriptor){descriptor=Object.getOwnPropertyDescriptor(proto,'innerHTML');proto=Object.getPrototypeOf(proto);}
      if(!descriptor?.get||!descriptor?.set)return;
      Object.defineProperty(panel,'innerHTML',{configurable:true,get(){return descriptor.get.call(this);},set(value){
        descriptor.set.call(this,value);const snapshot=statCapSnapshot();
        if(!statCapCapture)statCapAttempts.delete(this);
        if(snapshot)statCapValues.set(this,snapshot);else statCapValues.delete(this);
        paintStatCaps(this);
      }});
      statCapPanels.add(panel);
    }
    for(const button of character.querySelectorAll('.tab-btn, .equip-slot')){
      const original=button.onclick;if(typeof original!=='function'||statCapHandlers.get(button)===original)continue;
      const wrapped=function(...args){return withStatCapCapture(()=>Reflect.apply(original,this,args));};
      button.onclick=wrapped;statCapHandlers.set(button,wrapped);
    }
    // Tabs only toggle visibility. Re-selecting the already-selected equipment
    // slot invokes native I(), which redraws the stats without equipping gear.
    const selected=character.querySelector('.tab-btn.active[data-tab="stats"]');
    const redraw=character.querySelector('.equip-slot.sel[data-slot]');
    if(selected&&redraw&&!statCapValues.has(panel)&&!statCapAttempts.has(panel)&&typeof redraw.onclick==='function'){
      statCapAttempts.add(panel);try{redraw.onclick();}catch(error){console.debug('[RO助手] 封頂前屬性讀取失敗，保留原生顯示',error);}
    }
    paintStatCaps(panel);
  }
