  const countedHordes = new WeakSet();
  function installHordeCount(game) {
    if (!game || countedHordes.has(game) || typeof game.horde !== 'function') return;
    countedHordes.add(game);
    const horde = game.horde;
    game.horde = function(...args) {
      if (typeof this.spawnEnemy !== 'function' || typeof this.spawnAnchors !== 'function'
        || typeof this.events?.onAnnounce !== 'function') return Reflect.apply(horde,this,args);
      const time=this.time,count=this.difficulty?.count;
      let actual=0,target=null,partyCount=1;
      const restore=[];
      const wrap=(object,key,make)=>{
        const descriptor=Object.getOwnPropertyDescriptor(object,key),original=object[key];
        object[key]=make(original);
        restore.push(()=>{if(descriptor)Object.defineProperty(object,key,descriptor);else delete object[key];});
      };
      try {
        // Observe the native calls and their results; never call RNG or spawn
        // extra enemies. Match the native per-anchor rounding for the target.
        if(typeof this.coop?.partyScale==='function')wrap(this.coop,'partyScale',original=>function(...values){
          const scale=Reflect.apply(original,this,values);partyCount=scale?.count??1;return scale;
        });
        wrap(this,'spawnAnchors',original=>function(...values){
          const anchors=Reflect.apply(original,this,values);
          const desired=Math.round(Math.min(120,36+time/8)*count*partyCount);
          if(anchors?.length&&Number.isFinite(desired)&&desired>=0)
            target=Math.round(desired/anchors.length)*anchors.length;
          return anchors;
        });
        wrap(this,'spawnEnemy',original=>function(...values){
          const enemy=Reflect.apply(original,this,values);if(enemy)actual++;return enemy;
        });
        wrap(this.events,'onAnnounce',original=>function(message,...values){
          if(Number.isFinite(target)&&typeof message==='string')
            message=message.replace(/怪物潮\s*包圍了你/,`怪物潮(${actual}/${target})包圍了你`);
          return Reflect.apply(original,this,[message,...values]);
        });
        return Reflect.apply(horde,this,args);
      } finally {for(const undo of restore.reverse())undo();}
    };
  }
