  const HIDE_WEATHER_KEY='greydust.ro.hide-battle-weather.v1';
  let hideBattleWeather=false,weatherGame=null;
  try{hideBattleWeather=localStorage.getItem(HIDE_WEATHER_KEY)==='true';}catch{}
  const weatherHelpers=new WeakMap();
  function installWeatherEffects(game){
    weatherGame=game;const atmosphere=game?.atmosphere;
    if(!atmosphere||!atmosphere.view||!atmosphere.world?.atmos)return;
    let entry=weatherHelpers.get(atmosphere);
    if(!entry){
      const original=atmosphere.update;if(typeof original!=='function')return;
      const source=compactFunction(original);let hash=2166136261;
      for(let i=0;i<source.length;i++)hash=Math.imul(hash^source.charCodeAt(i),16777619)>>>0;
      // Verified outdoor atmosphere update only: never intercept indoor gloom.
      if(hash!==4040674621)return;
      entry={original,hidden:false,visible:atmosphere.view.visible};weatherHelpers.set(atmosphere,entry);
      atmosphere.update=function(...args){
        applyWeatherVisibility(this,entry);
        if(hideBattleWeather)return;
        return Reflect.apply(original,this,args);
      };
    }
    const wasHidden=entry.hidden;applyWeatherVisibility(atmosphere,entry);
    if(wasHidden&&!entry.hidden)Reflect.apply(entry.original,atmosphere,[0,game.app?.screen?.width||innerWidth,game.app?.screen?.height||innerHeight]);
  }
  function applyWeatherVisibility(atmosphere,entry){
    if(entry.hidden===hideBattleWeather)return;
    entry.hidden=hideBattleWeather;
    if(!hideBattleWeather){atmosphere.view.visible=entry.visible;return;}
    entry.visible=atmosphere.view.visible;atmosphere.view.visible=false;
    atmosphere.rainG.clear();atmosphere.flashG.clear();
    const uniforms=atmosphere.world.atmos;
    uniforms.envTint.value.set(1,1,1);uniforms.fogAmount.value=0;uniforms.playerLight.value=0;
    atmosphere.world.renderer.setClearColor(727603);
  }
