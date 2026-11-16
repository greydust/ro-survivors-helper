  let characterDetails=null,characterDetailsTimer=null;
  let nextCharacterDetailsAt=0;
  const characterStatFields=[
    ['maxHp','最大生命','number'],['armor','護甲（固定減傷）','number'],['def','DEF','number'],
    ['damageReduction','減傷（stats）','percent'],['flee','Flee（stats）','percent'],
    ['discovery','尋寶率（內部值）','number'],['critChance','爆擊率（stats）','percent'],['critMult','爆擊傷害','multiplier'],
    ['atk','ATK','number'],['matk','MATK','number'],['damageMult','傷害倍率（stats）','multiplier'],
    ['haste','急速','number'],['castHaste','施法急速','number'],['speedMult','移動速度倍率（stats）','multiplier'],
    ['pierceChance','穿透機率','percent'],['doubleChance','雙重施法機率','percent'],
    ['areaMult','範圍倍率','multiplier'],['reachMult','近戰距離倍率','multiplier'],
    ['lifesteal','吸血','percent'],['regen','生命回復／秒','number'],['regen5','每 5 秒生命回復','number'],
    ['expMult','經驗倍率','multiplier'],['zenyMult','Zeny 倍率','multiplier'],
    ...['str','agi','vit','int','dex','luk'].map(key=>[key,key.toUpperCase(),'number'])
  ];
  function formatCharacterStat(value,format='number') {
    if(typeof value!=='number'||!Number.isFinite(value))return '—';
    const text=number=>String(Math.round(number*100)/100);
    return format==='percent'?text(value*100)+'%':format==='multiplier'?'×'+text(value):text(value);
  }
  function characterStatRows(game) {
    const stats=game?.stats;if(!stats)return [];
    const buff=key=>typeof game.buffValue==='function'?game.buffValue(key):0;
    const rows=[['生命',formatCharacterStat(game.hp)+' / '+formatCharacterStat(stats.maxHp)]];
    const brace=buff('brace');
    if(Number.isFinite(stats.damageReduction))rows.push(['減傷（含 buff，未含 DEF／護甲）',formatCharacterStat(Math.min(Math.max(.75,brace),stats.damageReduction+buff('reduction')+buff('soulWard')+brace),'percent')]);
    if(Number.isFinite(stats.flee))rows.push(['Flee（含 buff）',formatCharacterStat(stats.flee+buff('flee'),'percent')]);
    if(Number.isFinite(stats.critChance))rows.push(['爆擊率（含 buff）',formatCharacterStat(stats.critChance+buff('crit'),'percent')]);
    for(const [key,label,format] of characterStatFields)rows.push([label,formatCharacterStat(stats[key],format)]);
    return rows;
  }
  function closeCharacterDetails() {
    clearTimeout(characterDetailsTimer);characterDetailsTimer=null;
    characterDetails?.remove();characterDetails=null;
    document.querySelector('#ro-character-details-toggle')?.setAttribute('aria-expanded','false');
  }
  function updateCharacterDetails() {
    if(pickerIsOpen())return;
    const hud=document.querySelector('#hud'),buffs=document.querySelector('#buffs');
    if(!hud||hud.classList.contains('hidden')||!buffs||!activeGame?.stats){
      document.querySelector('#ro-character-details-toggle')?.remove();closeCharacterDetails();return;
    }
    let button=document.querySelector('#ro-character-details-toggle');
    if(!button){
      button=document.createElement('button');button.id='ro-character-details-toggle';button.type='button';
      button.textContent='角色詳細資料';button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','ro-character-details');
      button.onclick=event=>{event.stopPropagation();if(characterDetails)closeCharacterDetails();else openCharacterDetails();};document.body.append(button);
    }
    if(typeof buffs.getBoundingClientRect==='function'){
      const rect=buffs.getBoundingClientRect(),view=helperViewport();
      const left=Math.max(view.left+8,Math.min(rect.left,view.left+view.width-110))+'px';
      const top=Math.max(view.top+8,Math.min(rect.bottom+6,view.top+view.height-48))+'px';
      if(button.style.left!==left)button.style.left=left;
      if(button.style.top!==top)button.style.top=top;
    }
    if(!characterDetails)return;
    const populate=(target,rows)=>{
      const signature=JSON.stringify(rows);if(target.dataset.signature===signature)return;
      target.dataset.signature=signature;target.replaceChildren();
      for(const [label,value] of rows){const row=document.createElement('div'),name=document.createElement('span'),number=document.createElement('b');name.textContent=label;number.textContent=value;row.append(name,number);target.append(row);}
    };
    populate(characterDetails.querySelector('[data-character-stats]'),characterStatRows(activeGame));
    const raw=Object.entries(activeGame.stats).filter(([,v])=>typeof v==='boolean'||typeof v==='number').sort(([a],[b])=>a.localeCompare(b));
    populate(characterDetails.querySelector('[data-character-raw]'),raw.map(([key,value])=>[key,String(value)]));
  }
  function openCharacterDetails() {
    closeCharacterDetails();if(!activeGame?.stats)return;
    characterDetails=document.createElement('section');characterDetails.id='ro-character-details';
    characterDetails.setAttribute('role','region');characterDetails.setAttribute('aria-label','角色詳細資料');
    const header=document.createElement('header'),title=document.createElement('strong'),close=document.createElement('button');
    title.textContent='角色詳細資料';close.type='button';close.textContent='關閉';close.onclick=closeCharacterDetails;header.append(title,close);
    const note=document.createElement('p');note.textContent='每 0.25 秒更新。stats 為角色目前內部值；臨時增益另列。尋寶率不是單件物品掉落機率，減傷仍會受敵人與技能影響。';
    const rows=document.createElement('div');rows.setAttribute('data-character-stats','');
    const raw=document.createElement('details'),summary=document.createElement('summary'),values=document.createElement('div');
    summary.textContent='全部原始 stats 欄位';values.setAttribute('data-character-raw','');raw.append(summary,values);
    characterDetails.append(header,note,rows,raw);document.body.append(characterDetails);
    document.querySelector('#ro-character-details-toggle')?.setAttribute('aria-expanded','true');
    const refresh=()=>{updateCharacterDetails();if(characterDetails)characterDetailsTimer=setTimeout(refresh,250);};refresh();
  }
