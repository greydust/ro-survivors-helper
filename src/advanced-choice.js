  const advancedChoiceKey='greydust.ro.advanced-choice.v1';
  const advancedProfilesKey='greydust.ro.advanced-choice.profiles.v1';
  const advancedSlots=[['potion','藥水'],['elixir','秘藥'],['blessing','祝福'],['dish','料理'],['deity','神格']];
  const advancedAspectNames={dmg:'傷害',cd:'冷卻',count:'數量',area:'範圍',reach:'近戰距離',pierce:'穿透',speed:'速度',duration:'持續時間'};
  const advancedCatalog={skills:[],items:[],upgrades:new Map(),factories:new Map(),pool:null,jobs:null,lineage:null,basic:null,talents:null};
  let advancedScope=null;
  let advancedProfiles=loadAdvancedProfiles(),advancedSettings=advancedProfiles.profiles.find(profile=>profile.id===advancedProfiles.active).settings,advancedDialog=null,advancedChoice=null,advancedTimer=null,advancedClicking=false;
  const advancedMethodHooks=new WeakMap();
  function loadAdvancedSettings(){
    try{
      const saved=JSON.parse(localStorage.getItem(advancedChoiceKey)||'null');
      return {enabled:saved?.enabled===true,skills:saved?.skills&&typeof saved.skills==='object'?saved.skills:{},items:saved?.items&&typeof saved.items==='object'?saved.items:{},priority:Array.isArray(saved?.priority)?saved.priority.filter(row=>row&&typeof row.skill==='string'&&Array.isArray(row.upgrades)):[]};
    }catch{return {enabled:false,skills:{},items:{},priority:[]};}
  }
  function advancedProfileId(){return 'profile-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);}
  function validateAdvancedSettings(value){
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('設定格式不正確');
    const validId=id=>typeof id==='string'&&/^[\w.:-]{1,120}$/.test(id)&&!['__proto__','constructor','prototype'].includes(id);
    const skills=[],items=[],priority=[];
    if(!value.skills||typeof value.skills!=='object'||Array.isArray(value.skills)||!value.items||typeof value.items!=='object'||Array.isArray(value.items)||!Array.isArray(value.priority)||value.priority.length>1000)throw Error('缺少技能、道具或優先順序');
    if(Object.keys(value.skills).length>2000)throw Error('技能設定過多');
    for(const [id,rule]of Object.entries(value.skills)){
      if(!validId(id)||!rule||!['must','fill','never'].includes(rule.take)||!['select','ignore','banish'].includes(rule.upgrade))throw Error('技能規則格式不正確');
      skills.push([id,{take:rule.take,upgrade:rule.upgrade}]);
    }
    for(const [slot,rule]of Object.entries(value.items)){
      if(!advancedSlots.some(([id])=>id===slot)||!rule||!Array.isArray(rule.wanted)||rule.wanted.length>1000||!rule.wanted.every(validId)||!['select','ignore','banish'].includes(rule.upgrade))throw Error('道具規則格式不正確');
      items.push([slot,{wanted:[...new Set(rule.wanted)],upgrade:rule.upgrade}]);
    }
    for(const row of value.priority){
      if(!row||!validId(row.skill)||!Array.isArray(row.upgrades)||row.upgrades.length>100||!row.upgrades.every(validId))throw Error('升級順序格式不正確');
      priority.push({skill:row.skill,upgrades:[...new Set(row.upgrades)]});
    }
    return {enabled:value.enabled===true,skills:Object.fromEntries(skills),items:Object.fromEntries(items),priority};
  }
  function loadAdvancedProfiles(){
    try{
      const value=JSON.parse(localStorage.getItem(advancedProfilesKey)||'null');
      if(value?.version===1&&Array.isArray(value.profiles)&&value.profiles.length&&value.profiles.length<=100){
        const profiles=value.profiles.map(profile=>({id:String(profile.id),name:String(profile.name).trim().slice(0,60)||'未命名',settings:validateAdvancedSettings(profile.settings)}));
        if(new Set(profiles.map(profile=>profile.id)).size!==profiles.length)throw Error('設定檔 ID 重複');
        return {version:1,active:profiles.some(profile=>profile.id===value.active)?value.active:profiles[0].id,profiles};
      }
    }catch{}
    return {version:1,active:'default',profiles:[{id:'default',name:'預設',settings:loadAdvancedSettings()}]};
  }
  function selectAdvancedProfile(id){
    const profile=advancedProfiles.profiles.find(profile=>profile.id===id);if(!profile)return;
    cancelAdvancedChoice();advancedProfiles.active=id;advancedSettings=profile.settings;saveAdvancedSettings();renderAdvancedDialog();
  }
  function uniqueAdvancedProfileName(base,names){
    let name=base,index=2;while(names.has(name)){const suffix=' ('+(index++)+')';name=base.slice(0,60-suffix.length)+suffix;}return name;
  }
  function addAdvancedProfile(name){
    if(advancedProfiles.profiles.length>=100)throw Error('最多 100 個設定檔');
    name=String(name||'').trim().slice(0,60);if(!name)throw Error('請輸入設定檔名稱');
    name=uniqueAdvancedProfileName(name,new Set(advancedProfiles.profiles.map(profile=>profile.name)));
    const profile={id:advancedProfileId(),name,settings:JSON.parse(JSON.stringify(advancedSettings))};
    advancedProfiles.profiles.push(profile);selectAdvancedProfile(profile.id);return profile;
  }
  function removeAdvancedProfile(){
    if(advancedProfiles.profiles.length<=1)throw Error('至少保留一個設定檔');
    advancedProfiles.profiles=advancedProfiles.profiles.filter(profile=>profile.id!==advancedProfiles.active);selectAdvancedProfile(advancedProfiles.profiles[0].id);
  }
  function exportAdvancedProfiles(all=false){
    return JSON.stringify({format:'ro-survivors-advanced-choice',version:1,profiles:advancedProfiles.profiles.filter(profile=>all||profile.id===advancedProfiles.active).map(({name,settings})=>({name,settings}))},null,2);
  }
  function importAdvancedProfiles(text){
    if(typeof text!=='string'||text.length>1024*1024)throw Error('設定檔不可超過 1 MB');
    const value=JSON.parse(text);
    if(value?.format!=='ro-survivors-advanced-choice'||value.version!==1||!Array.isArray(value.profiles)||!value.profiles.length||value.profiles.length+advancedProfiles.profiles.length>100)throw Error('不支援的設定檔格式或設定檔數量過多');
    // Validate the entire import before touching any current profile.
    const names=new Set(advancedProfiles.profiles.map(profile=>profile.name));
    const profiles=value.profiles.map(profile=>{
      if(typeof profile?.name!=='string'||!profile.name.trim()||profile.name.length>60)throw Error('設定檔名稱不正確');
      const name=uniqueAdvancedProfileName(profile.name.trim(),names);names.add(name);
      return {id:advancedProfileId(),name,settings:validateAdvancedSettings(profile.settings)};
    });
    advancedProfiles.profiles.push(...profiles);selectAdvancedProfile(profiles[0].id);return profiles.length;
  }
  function saveAdvancedSettings(){
    const active=advancedProfiles.profiles.find(profile=>profile.id===advancedProfiles.active);if(active)active.settings=advancedSettings;
    try{localStorage.setItem(advancedProfilesKey,JSON.stringify(advancedProfiles));localStorage.setItem(advancedChoiceKey,JSON.stringify(advancedSettings));}
    catch{notify('自動選卡設定無法保存；本頁仍可使用');}
    cancelAdvancedChoice();updateAdvancedChoiceUI();
  }
  function advancedSkillRule(id){
    const rule=advancedSettings.skills[id];
    return {take:['must','fill','never'].includes(rule?.take)?rule.take:'fill',upgrade:['select','ignore','banish'].includes(rule?.upgrade)?rule.upgrade:'select'};
  }
  function advancedItemRule(slot,game=null){
    const rule=advancedSettings.items[slot];
    let wanted=Array.isArray(rule?.wanted)?rule.wanted.filter(id=>typeof id==='string'):[];
    if(slot==='deity'){
      let skills=advancedScope?.ids;
      if(game&&advancedCatalog.pool)try{skills=new Set([...advancedCatalog.pool(game.classDef.id,game.loadout?.learned||[]).map(row=>row.id),...(game.slots||[])]);}catch{skills=null;}
      if(skills)wanted=wanted.filter(id=>advancedCatalog.items.some(item=>item.slot==='deity'&&item.id===id)||skills.has(id));
    }
    return {wanted,upgrade:['select','ignore','banish'].includes(rule?.upgrade)?rule.upgrade:'select'};
  }
  function advancedReadCharacter(){
    const panel=document.querySelector('#charpanel'),open=document.querySelector('#lobby-char');
    const name=document.querySelector('#lobby-labels .lobby-name.self')?.textContent?.trim();
    if(panel?.classList.contains('hidden')&&typeof open?.onclick==='function'){
      // Online saves live in the game's private memory store, not necessarily
      // localStorage. Observe the real profile lookup through its native UI.
      const original=Array.prototype.find;let captured=null;
      try{
        Array.prototype.find=function(...args){
          const result=Reflect.apply(original,this,args);
          if(!captured&&result?.id&&(!name||result.name===name)&&typeof result.job==='string'&&result.talents&&result.equipped&&Array.isArray(result.inventory)&&result.stats)captured=result;
          return result;
        };
        open.onclick();
      }catch(error){console.debug('[RO助手] 角色資料讀取失敗',error);}
      finally{
        Array.prototype.find=original;
        if(!panel.classList.contains('hidden')){
          const back=panel.querySelector('#cp-back');if(typeof back?.onclick==='function')back.onclick();
        }
      }
      if(captured)return captured;
    }
    if(!name)return null;
    // Read only character rosters and their matching equipment namespace.
    // Identical names in multiple stored accounts are ambiguous: never guess.
    const matches=[],keys=new Set();
    try{
      for(let index=0;index<localStorage.length;index++)keys.add(localStorage.key(index));
      for(const key of Object.keys(localStorage))keys.add(key);
      for(const key of keys){
        if(typeof key!=='string'||!/^ro-survivors\.(?:acct\..+\.|dev\.)?characters\.v1$/.test(key))continue;
        const roster=JSON.parse(localStorage.getItem(key)||'null');if(!Array.isArray(roster))continue;
        for(const character of roster)if(character?.name===name&&typeof character.job==='string'&&character.id){
          const account=JSON.parse(localStorage.getItem(key.replace(/characters\.v1$/,'account.v1'))||'null');
          matches.push({...character,inventory:Array.isArray(account?.inventory)?account.inventory:character.inventory||[]});
        }
      }
    }catch{return null;}
    return matches.length===1?matches[0]:null;
  }
  function advancedCharacterScope(character){
    if(!character||!advancedCatalog.pool||!advancedCatalog.lineage)return null;
    try{
      const lineage=advancedCatalog.lineage(character.promotion||character.job);
      const jobs=new Set(lineage.includes(character.job)?lineage:advancedCatalog.lineage(character.job));
      // Settings describe the profession's possible build, independently of
      // allocated talents and current equipment. Runtime offers remain native.
      const learnable=Object.values(advancedCatalog.talents||{}).filter(talent=>jobs.has(talent.job)&&talent.learn).map(talent=>talent.learn);
      const ids=new Set([...jobs].flatMap(job=>advancedCatalog.pool(job,learnable).map(row=>row.id)).filter(id=>skillDefs?.[id]));
      for(const def of Object.values(skillDefs||{})){
        if(!def?.id?.startsWith('atk_'))continue;
        if(['atk_infused','atk_infused_melee'].includes(def.id)&&!jobs.has('mage'))continue;
        ids.add(def.id);
      }
      const job=advancedCatalog.jobs?.(character.promotion||character.job);
      return {character:character.id,job:character.promotion||character.job,name:String(job?.name||character.job),ids};
    }catch{return null;}
  }
  function advancedScopedSkills(){return advancedScope?advancedCatalog.skills.filter(skill=>advancedScope.ids.has(skill.id)):[];}
  function advancedScopedItems(slot){
    const items=advancedCatalog.items.filter(item=>item.slot===slot);
    if(slot==='deity')for(const skill of advancedScopedSkills())if(skill.kind==='weapon'&&!skill.id.startsWith('atk_'))items.push({id:skill.id,slot,name:skill.name+' 專屬神格'});
    return items;
  }
  function initializeAdvancedCatalog(module){
    advancedCatalog.skills=[];advancedCatalog.upgrades.clear();advancedCatalog.factories.clear();
    const definitions=skillDefs||Object.values(module).find(value=>value?.bash?.kind==='weapon');
    const items=Object.values(module).find(value=>value&&typeof value==='object'&&value.p_regen?.slot==='potion'&&value.d_str?.slot==='dish');
    const pool=Object.values(module).find(value=>typeof value==='function'&&/\.flatMap\(/.test(String(value))&&/\.maxLevel/.test(String(value))&&/new Set/.test(String(value)));
    advancedCatalog.pool=pool||null;
    advancedCatalog.jobs=Object.values(module).find(value=>typeof value==='function'&&/\.find\(\w+=>\w+\.id===\w+\)\?\?/.test(String(value)))||null;
    advancedCatalog.lineage=Object.values(module).find(value=>typeof value==='function'&&/\.base\?\[\.\.\./.test(String(value)))||null;
    advancedCatalog.basic=Object.values(module).find(value=>typeof value==='function'&&/return .*\|\|["']atk_fist["']/.test(String(value)))||null;
    advancedCatalog.talents=Object.values(module).find(value=>value&&typeof value==='object'&&value['crusader.1.s1']?.learn==='holy_cross')||null;
    // Build the union of the native job pools, including learnable weapons.
    const ids=new Set();
    for(const value of Object.values(module))if(Array.isArray(value))for(const job of value){
      if(job?.id&&job.scaling&&pool)try{for(const entry of pool(job.id,[]))ids.add(entry.id);}catch{}
    }
    for(const def of Object.values(definitions||{})){
      if(!def?.id||!['weapon','passive'].includes(def.kind)||(!ids.has(def.id)&&typeof def.create!=='function'&&def.kind!=='passive'))continue;
      advancedCatalog.skills.push({id:def.id,name:String(def.name||def.id),kind:def.kind});
      if(typeof def.create==='function')advancedCatalog.factories.set(def.id,def.create);

    }
    advancedCatalog.skills.sort((a,b)=>a.name.localeCompare(b.name,'zh-TW'));
    advancedCatalog.items=Object.values(items||{}).filter(item=>advancedSlots.some(([slot])=>slot===item.slot)).map(item=>({id:item.id,slot:item.slot,name:String(item.name||item.id)}));
    updateAdvancedChoiceUI();if(advancedDialog)renderAdvancedDialog();
  }
  function advancedSkillUpgrades(id){
    if(advancedCatalog.upgrades.has(id))return advancedCatalog.upgrades.get(id);
    // Constructors may initialize random state. Read metadata only while in
    // town, before the next run receives its native seed, and only on demand.
    if(!document.body.classList.contains('in-lobby'))return [];
    const upgrades=[],create=advancedCatalog.factories.get(id);
    if(create)try{
      const weapon=create();
      for(const aspect of weapon.upgradeAspects())upgrades.push({id:aspect,name:advancedAspectNames[aspect]||aspect});
      for(const effect of weapon.effects||[])upgrades.push({id:'effect:'+effect.key,name:advancedTranslate(effect.label)});
    }catch{/* Unknown native constructors retain the any-upgrade option. */}
    advancedCatalog.upgrades.set(id,upgrades);return upgrades;
  }
  function advancedTranslate(text){
    try{return typeof gameCatalog?.t==='function'?gameCatalog.t(text):String(text);}catch{return String(text);}
  }
  function advancedUpgradeIds(card){
    if(!card.upgrade)return [];
    return (card.upgrade.parts||[card.upgrade]).map(part=>part.aspect==='effect'?'effect:'+part.effect:part.aspect);
  }
  function advancedDecision(game,cards,kind,{available=()=>true}={}){
    const action=(type,index)=>({type,index});
    if(kind==='skill'){
      const upgrades=cards.map((card,index)=>({card,index,rule:advancedSkillRule(card.id)})).filter(row=>!row.card.isNew&&row.card.id!=='potion');
      const banish=upgrades.find(row=>row.rule.upgrade==='banish'&&available('banish',row.index));
      if(banish)return action('banish',banish.index);
      const required=cards.findIndex(card=>card.isNew&&advancedSkillRule(card.id).take==='must');
      if(required>=0)return action('pick',required);
      const slots=game.slots||[],remaining=Math.max(0,(game.maxSkills||0)-slots.length);
      let eligible=[];try{eligible=game.freshChoices?.()||[];}catch{}
      const missing=new Set(eligible.filter(card=>!slots.includes(card.id)&&advancedSkillRule(card.id).take==='must').map(card=>card.id)).size;
      const fill=cards.findIndex(card=>card.isNew&&advancedSkillRule(card.id).take==='fill');
      if(fill>=0&&remaining>missing)return action('pick',fill);
      if(remaining>0&&missing>=remaining&&available('deck',-1))return action('deck',-1);
      for(const priority of advancedSettings.priority){
        if(advancedSkillRule(priority.skill).upgrade!=='select')continue;
        const match=upgrades.find(row=>row.rule.upgrade==='select'&&row.card.id===priority.skill&&(!priority.upgrades.length||advancedUpgradeIds(row.card).some(id=>priority.upgrades.includes(id))));
        if(match)return action('pick',match.index);
      }
      // Detailed aspect selections also constrain the fallback. A legendary
      // mixed upgrade must not make an unselected aspect eligible on later cards.
      const selected=upgrades.find(row=>row.rule.upgrade==='select'&&(
        !advancedSettings.priority.some(entry=>entry.skill===row.card.id)||
        advancedSettings.priority.some(entry=>entry.skill===row.card.id&&(!entry.upgrades.length||advancedUpgradeIds(row.card).some(id=>entry.upgrades.includes(id))))
      ))||upgrades.find(row=>row.rule.upgrade==='ignore');
      if(selected)return action('pick',selected.index);
      const potion=cards.findIndex(card=>card.id==='potion');
      return potion>=0?action('pick',potion):null;
    }
    const rows=cards.map((card,index)=>({card,index,rule:advancedItemRule(card.slot,game),current:game.runItems?.slots.get(card.slot)}));
    const upgraded=row=>row.card.refine>0&&row.current?.item===row.card.item;
    const banish=rows.find(row=>upgraded(row)&&row.rule.upgrade==='banish'&&available('banish',row.index));
    if(banish)return action('banish',banish.index);
    const wanted=rows.filter(row=>!upgraded(row)&&row.rule.wanted.includes(row.card.item)).sort((a,b)=>b.card.quality-a.card.quality||a.index-b.index)[0];
    if(wanted)return action('pick',wanted.index);
    const any=rows.find(row=>!upgraded(row)&&!row.rule.wanted.length);
    if(any)return action('pick',any.index);
    const refresh=rows.find(row=>row.rule.wanted.length&&!row.rule.wanted.includes(row.current?.item)&&available('single',row.index));
    if(refresh)return action('single',refresh.index);
    const highest=list=>list.slice().sort((a,b)=>b.card.quality-a.card.quality||a.index-b.index)[0];
    const upgrade=highest(rows.filter(row=>upgraded(row)&&row.rule.upgrade==='select'))||highest(rows.filter(row=>upgraded(row)&&row.rule.upgrade==='ignore'));
    if(upgrade)return action('pick',upgrade.index);
    const fallbackUpgrade=highest(rows.filter(upgraded));if(fallbackUpgrade)return action('pick',fallbackUpgrade.index);
    if(rows.length&&rows.every(row=>!upgraded(row))&&available('deck',-1))return action('deck',-1);
    const fallbackNew=highest(rows.filter(row=>!upgraded(row)));return fallbackNew?action('pick',fallbackNew.index):null;
  }
  function advancedActionButton(state,type,index){
    const {game,kind,cards}=state,offer=cards[index];
    if(type==='deck')return document.querySelector('#pk-bar [data-act="bar:0"]');
    if(!offer)return null;
    const allowed=kind==='skill'?offer.id!=='potion':true;
    if(!allowed)return null;
    let single=false;
    try{single=(game.perksMax?.reroll_card||0)>0&&(kind==='skill'?game.canRerollCard?.(offer):game.canRerollChestCard?.(offer));}catch{}
    const actions=[...(single?['single']:[]),...((game.perksMax?.focus||0)>0?['focus']:[]),...((game.perksMax?.banish||0)>0?['banish']:[])];
    const position=actions.indexOf(type);return position<0?null:document.querySelector('#pk-cards [data-act="'+index+':'+position+'"]');
  }
  function revealAdvancedChoice(state){
    if(!state?.background||state.game!==activeGame||state.game.state!=='levelup'||state.game.player?.dead)return;
    state.background=false;state.manual=true;state.render?.(state.cards);
  }
  function cancelAdvancedChoice(reveal=true){
    clearTimeout(advancedTimer);advancedTimer=null;if(advancedChoice){advancedChoice.manual=true;if(reveal)revealAdvancedChoice(advancedChoice);}
  }
  function resetAdvancedChoice(){cancelAdvancedChoice(false);advancedChoice=null;}
  function captureAdvancedChoice(game,cards,kind,render=null){
    clearTimeout(advancedTimer);advancedTimer=null;
    advancedChoice={game,cards,kind,render,background:typeof render==='function',manual:false,started:performance.now(),pending:null,actions:0};
    queueAdvancedChoice();
  }
  function queueAdvancedChoice(delay){
    clearTimeout(advancedTimer);advancedTimer=setTimeout(runAdvancedChoice,delay??(advancedChoice?.background?0:100));
  }
  function installAdvancedChoiceMethods(game){
    if(advancedMethodHooks.has(game))return;
    const hooked=new Map();advancedMethodHooks.set(game,hooked);
    for(const name of ['rerollDeck','rerollChest','rerollCard','rerollChestCard','banishCard','banishChestCard']){
      const original=game[name];if(typeof original!=='function')continue;
      const wrapper=function(...args){
        const result=Reflect.apply(original,this,args),state=advancedChoice;
        if(state?.game===game){
          if((name==='rerollDeck'||name==='rerollChest')&&Array.isArray(result))state.cards=result;
          state.pending=null;state.started=performance.now();
          if(advancedClicking)queueAdvancedChoice(state.background?0:150);
        }
        return result;
      };
      game[name]=wrapper;hooked.set(name,{original,wrapper});
    }
  }
  function advancedBackgroundAvailable(state,type,index){
    const {game,kind,cards}=state,card=cards[index],left=game.perksLeft||{},max=game.perksMax||{};
    if(type==='deck')return max.reroll>0&&left.reroll>0&&typeof game[kind==='skill'?'rerollDeck':'rerollChest']==='function';
    if(type==='banish')return !!card&&max.banish>0&&left.banish>0&&(kind!=='skill'||card.id!=='potion')&&typeof game[kind==='skill'?'banishCard':'banishChestCard']==='function';
    if(type==='single')return !!card&&max.reroll_card>0&&left.reroll_card>0&&typeof game.rerollChestCard==='function'&&game.canRerollChestCard?.(card)===true;
    return false;
  }
  function finishAdvancedBackground(state,card){
    const game=state.game;
    clearTimeout(advancedTimer);advancedTimer=null;state.manual=true;state.background=false;
    if(state.kind==='item')game.chooseChest(card);
    else{
      game.choose(card);
      const name=game.skillDef?.(card.id)?.name||skillDefs?.[card.id]?.name||card.id;
      const upgrades=advancedUpgradeIds(card).map(id=>id.startsWith('effect:')?card.upgrade?.text||'特殊效果':advancedAspectNames[id]||id);
      const message=card.id==='potion'?'回復 50 HP':card.isNew?'學會：'+name:name+(Number.isFinite(card.rank)?' Lv '+card.rank:' 升級')+(upgrades.length?'：'+upgrades.join('、'):'');
      try{game.events.onLoot?.(message,card.rarity||0);}catch(error){console.debug('[RO助手] 自選完成訊息顯示失敗',error);}
    }
  }
  function runAdvancedBackground(state){
    const {game,kind}=state;
    if(game.state!=='levelup')return cancelAdvancedChoice(false);
    if(++state.actions>1000||performance.now()-state.started>10000)return cancelAdvancedChoice();
    const decision=advancedDecision(game,state.cards,kind,{available:(type,index)=>advancedBackgroundAvailable(state,type,index)});
    if(!decision)return revealAdvancedChoice(state);
    const card=state.cards[decision.index];advancedClicking=true;
    try{
      if(decision.type==='pick')return finishAdvancedBackground(state,card);
      if(decision.type==='deck'){
        const cards=game[kind==='skill'?'rerollDeck':'rerollChest']();
        if(!Array.isArray(cards)||!cards.length)return revealAdvancedChoice(state);state.cards=cards;
      }else if(decision.type==='single'){
        const replacement=game.rerollChestCard(card);if(!replacement)return revealAdvancedChoice(state);state.cards[decision.index]=replacement;
      }else if(decision.type==='banish'){
        const replacement=game[kind==='skill'?'banishCard':'banishChestCard'](card,state.cards);
        if(replacement)state.cards[decision.index]=replacement;else state.cards.splice(decision.index,1);
        if(!state.cards.length){
          if(kind==='skill')state.cards.push({id:'potion',rank:0,isNew:false,rarity:0});
          else return finishAdvancedBackground(state,null);
        }
      }
      if(advancedChoice===state&&!state.manual)queueAdvancedChoice();
    }catch(error){
      if(advancedChoice===state&&game.state==='levelup'){
        state.background=typeof state.render==='function';cancelAdvancedChoice();
      }
      console.warn('[RO助手] 背景自選停止，保留原生流程',error);
    }finally{advancedClicking=false;}
  }
  function runAdvancedChoice(){
    advancedTimer=null;const state=advancedChoice,picker=document.querySelector('#picker');
    if(!advancedSettings.enabled||!state||state.manual||state.game!==activeGame||state.game.player?.dead||state.game.state==='over'||advancedDialog)return;
    if(state.background)return runAdvancedBackground(state);
    if(!picker||picker.classList.contains('hidden')||picker.classList.contains('closing'))return;
    const nodes=[...picker.querySelectorAll('#pk-cards .pk-card')];
    if(!nodes.length||nodes.length!==state.cards.length||nodes.some((node,index)=>node.dataset.i!==String(index)))return;
    if(performance.now()-state.started>10000){cancelAdvancedChoice();notify('自動選卡未完成，已恢復手動選擇');return;}
    const available=(type,index)=>{const button=advancedActionButton(state,type,index);return !!button&&!button.disabled&&!button.classList.contains('disabled');};
    const decision=state.pending||advancedDecision(state.game,state.cards,state.kind,{available});
    if(!decision)return;
    const node=nodes[decision.index];
    // Retain native entrance locks, animation, coop deadline and replacement
    // confirmation. Only click controls belonging to these exact offers.
    advancedClicking=true;
    try{
      if(decision.type==='pick'){
        state.pending=decision;
        const slot=node.closest('.pk-slot');
        if(slot?.classList.contains('asking'))slot.querySelector('[data-yes]')?.click();else node.click();
        if(!picker.classList.contains('closing'))queueAdvancedChoice(100);
      }else{
        const button=advancedActionButton(state,decision.type,decision.index);
        if(!button||button.disabled)return;
        button.click();
        // Native methods schedule the next pass only when an action ran.
      }
    }catch(error){cancelAdvancedChoice();console.warn('[RO助手] 自動選卡停止',error);notify('自動選卡遇到錯誤，請手動選擇');}
    finally{advancedClicking=false;}
  }
  function advancedManualInput(event){
    if(advancedClicking)return;
    if(event.type==='keydown'&&advancedDialog&&!advancedDialog.hidden){event.stopImmediatePropagation();if(event.key==='Escape'){event.preventDefault();closeAdvancedDialog();}return;}
    if(!advancedSettings.enabled)return;
    if(event.type==='keydown'){
      if(!pickerIsOpen()&&!advancedChoice?.background)return;
      if(event.key==='Escape'||/^[1-9]$/.test(event.key)||event.key==='Enter'||event.key===' ')cancelAdvancedChoice();
    }else if(event.target instanceof Element&&event.target.closest('#pk-cards, #pk-bar'))cancelAdvancedChoice();
  }
  function closeAdvancedDialog(){advancedDialog?.remove();advancedDialog=null;}
  function advancedSelect(value,options,change){
    const select=document.createElement('select');
    for(const [id,label]of options){const option=document.createElement('option');option.value=id;option.textContent=label;select.append(option);}
    select.value=value;select.onchange=()=>change(select.value);return select;
  }
  function advancedButton(label,action){const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=action;return button;}
  function renderAdvancedProfiles(root){
    const panel=document.createElement('section');panel.className='ro-ac-profiles';
    const label=document.createElement('strong');label.textContent='設定檔';panel.append(label);
    panel.append(advancedSelect(advancedProfiles.active,advancedProfiles.profiles.map(profile=>[profile.id,profile.name]),selectAdvancedProfile));
    const profile=advancedProfiles.profiles.find(profile=>profile.id===advancedProfiles.active),name=document.createElement('input');
    name.type='text';name.maxLength=60;name.value=profile.name;name.setAttribute('aria-label','設定檔名稱');panel.append(name);
    const attempt=action=>()=>{try{action();}catch(error){notify(error.message||'設定檔操作失敗');}};
    panel.append(advancedButton('新增（複製目前）',attempt(()=>addAdvancedProfile(name.value))),advancedButton('重新命名',attempt(()=>{const value=name.value.trim();if(!value)throw Error('請輸入名稱');profile.name=value.slice(0,60);saveAdvancedSettings();renderAdvancedDialog();})));
    const remove=advancedButton('移除目前設定檔',attempt(removeAdvancedProfile));remove.disabled=advancedProfiles.profiles.length<=1;panel.append(remove);
    const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='匯入／匯出設定檔';details.append(summary);
    const text=document.createElement('textarea');text.rows=5;text.placeholder='貼上匯出的 JSON，或選擇 JSON 檔案';text.setAttribute('aria-label','設定檔 JSON');text.style.width='100%';text.style.boxSizing='border-box';details.append(text);
    const download=all=>{
      text.value=exportAdvancedProfiles(all);
      const url=URL.createObjectURL(new Blob([text.value],{type:'application/json'})),link=document.createElement('a');
      link.href=url;link.download=(all?'自動選卡全部設定檔':profile.name.replace(/[<>:"/\\|?*]/g,'_'))+'.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    };
    details.append(advancedButton('匯出目前',attempt(()=>download(false))),advancedButton('匯出全部',attempt(()=>download(true))),advancedButton('匯入貼上內容',attempt(()=>{const count=importAdvancedProfiles(text.value);notify('已匯入 '+count+' 個設定檔');})));
    const file=document.createElement('input');file.type='file';file.accept='.json,application/json';file.setAttribute('aria-label','匯入設定檔 JSON');
    file.onchange=async()=>{try{const selected=file.files?.[0];if(!selected)return;if(selected.size>1024*1024)throw Error('設定檔不可超過 1 MB');const count=importAdvancedProfiles(await selected.text());notify('已匯入 '+count+' 個設定檔');}catch(error){notify(error.message||'匯入失敗');}finally{file.value='';}};
    details.append(file);panel.append(details);root.append(panel);
  }
  function renderAdvancedDialog(){
    if(!advancedDialog)return;
    const dialog=advancedDialog;dialog.replaceChildren();
    const head=document.createElement('header'),title=document.createElement('strong');title.textContent='自動選卡';
    head.append(title,advancedButton('關閉',closeAdvancedDialog));dialog.append(head);
    renderAdvancedProfiles(dialog);
    const enabled=document.createElement('label'),toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=advancedSettings.enabled;
    toggle.onchange=()=>{advancedSettings.enabled=toggle.checked;saveAdvancedSettings();};enabled.append(toggle,' 啟用進階自動選卡（設定會保存；啟用時取代舊自選）');dialog.append(enabled);
    const note=document.createElement('p');note.textContent='填充只在仍能保留所有必拿技能格時選。刷新／放逐使用原生剩餘次數；無可選項時保留手動。點選卡片、刷新按鈕或按 Escape，可中止當次自動選擇。';dialog.append(note);
    if(!advancedCatalog.skills.length||!advancedScope){const loading=document.createElement('p');loading.textContent='尚無法確認目前角色或職業資料，請回到主城重新開啟設定；不會顯示其他職業的技能。';dialog.append(loading);return;}
    const scopeLabel=document.createElement('p');scopeLabel.textContent='目前職業：'+advancedScope.name+'（含繼承職業、全部天賦技能及普攻；可提前設定）';dialog.append(scopeLabel);
    const search=document.createElement('input');search.type='search';search.placeholder='搜尋技能名稱或 ID';search.setAttribute('aria-label','搜尋技能');dialog.append(search);
    const table=document.createElement('div');table.className='ro-ac-table';dialog.append(table);
    const heading=document.createElement('div');heading.className='ro-ac-row';heading.append(...['技能','新技能','升級卡'].map(text=>{const span=document.createElement('b');span.textContent=text;return span;}));table.append(heading);
    for(const skill of advancedScopedSkills()){
      const row=document.createElement('div');row.className='ro-ac-row';row.dataset.search=(skill.name+' '+skill.id).toLowerCase();
      const name=document.createElement('span');name.textContent=skill.name;name.title=skill.id;const rule=advancedSkillRule(skill.id);
      row.append(name,advancedSelect(rule.take,[['must','必拿'],['fill','填充'],['never','必不拿']],value=>{advancedSettings.skills[skill.id]={...advancedSkillRule(skill.id),take:value};saveAdvancedSettings();}),advancedSelect(rule.upgrade,[['select','選取'],['ignore','無視'],['banish','放逐']],value=>{advancedSettings.skills[skill.id]={...advancedSkillRule(skill.id),upgrade:value};saveAdvancedSettings();renderAdvancedPriority(priority);}));table.append(row);
    }
    search.oninput=()=>{for(const row of table.querySelectorAll('[data-search]'))row.hidden=!row.dataset.search.includes(search.value.trim().toLowerCase());};
    const priority=document.createElement('section');dialog.append(priority);renderAdvancedPriority(priority);
    const itemTitle=document.createElement('h3');itemTitle.textContent='道具';dialog.append(itemTitle);
    for(const [slot,label]of advancedSlots){
      const row=document.createElement('section'),name=document.createElement('strong');name.textContent=label;row.append(name);
      row.append(advancedSelect(advancedItemRule(slot).upgrade,[['select','選取升級'],['ignore','無視升級'],['banish','放逐升級']],value=>{advancedSettings.items[slot]={...advancedItemRule(slot),wanted:advancedSettings.items[slot]?.wanted||[],upgrade:value};saveAdvancedSettings();}));
      const choices=document.createElement('details'),summary=document.createElement('summary');
      const updateSummary=()=>{const count=advancedItemRule(slot).wanted.length;summary.textContent=count?'已指定 '+count+' 種道具':'任意道具（未勾選）';};updateSummary();choices.append(summary);
      for(const item of advancedScopedItems(slot)){
        const label=document.createElement('label'),checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=advancedItemRule(slot).wanted.includes(item.id);
        checkbox.onchange=()=>{const rule=advancedItemRule(slot),stored=advancedSettings.items[slot]?.wanted||[];rule.wanted=checkbox.checked?[...new Set([...stored,item.id])]:stored.filter(id=>id!==item.id);advancedSettings.items[slot]=rule;saveAdvancedSettings();updateSummary();};label.append(checkbox,item.name);choices.append(label);
      }
      row.append(choices);dialog.append(row);
    }
  }
  function renderAdvancedPriority(root){
    root.replaceChildren();const title=document.createElement('h3');title.textContent='選取升級的詳細優先順序';root.append(title);
    const skills=advancedScopedSkills().filter(skill=>advancedSkillRule(skill.id).upgrade==='select');
    const options=skills.map(skill=>[skill.id,skill.name]);
    root.append(advancedButton('新增條目',()=>{if(!skills.length)return;advancedSettings.priority.push({skill:skills[0].id,upgrades:[]});saveAdvancedSettings();renderAdvancedPriority(root);}));
    const visible=advancedSettings.priority.map((entry,index)=>({entry,index})).filter(({entry})=>skills.some(skill=>skill.id===entry.skill));
    for(const [position,{index,entry}]of visible.entries()){
      const row=document.createElement('div');row.className='ro-ac-priority';
      const existing=advancedCatalog.skills.find(skill=>skill.id===entry.skill);
      const available=options.some(([id])=>id===entry.skill)?options:[[entry.skill,(existing?.name||entry.skill)+'（目前非選取）'],...options];
      row.append(String(position+1)+'. ',advancedSelect(entry.skill,available,value=>{entry.skill=value;entry.upgrades=[];saveAdvancedSettings();renderAdvancedPriority(root);}));
      for(const [label,offset]of [['↑',-1],['↓',1]]){const target=visible[position+offset]?.index;const button=advancedButton(label,()=>{if(target===undefined)return;[advancedSettings.priority[index],advancedSettings.priority[target]]=[advancedSettings.priority[target],advancedSettings.priority[index]];saveAdvancedSettings();renderAdvancedPriority(root);});button.disabled=target===undefined;row.append(button);}
      row.append(advancedButton('刪除',()=>{advancedSettings.priority.splice(index,1);saveAdvancedSettings();renderAdvancedPriority(root);}));
      const choices=document.createElement('details'),summary=document.createElement('summary');summary.textContent=entry.upgrades.length?'已指定 '+entry.upgrades.length+' 種升級':'任意升級（未勾選）';choices.append(summary);
      for(const upgrade of advancedSkillUpgrades(entry.skill)){
        const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=entry.upgrades.includes(upgrade.id);
        check.onchange=()=>{entry.upgrades=check.checked?[...new Set([...entry.upgrades,upgrade.id])]:entry.upgrades.filter(id=>id!==upgrade.id);saveAdvancedSettings();renderAdvancedPriority(root);};label.append(check,upgrade.name);choices.append(label);
      }
      row.append(choices);root.append(row);
    }
  }
  const floatingHelperPositions=new Map();
  function placeFloatingHelperButton(button){
    const position=floatingHelperPositions.get(button.id);if(!position)return;
    const view=helperViewport(),rect=button.getBoundingClientRect();
    position.left=Math.max(view.left,Math.min(position.left,view.left+view.width-rect.width));position.top=Math.max(view.top,Math.min(position.top,view.top+view.height-rect.height));
    Object.assign(button.style,{left:position.left+'px',top:position.top+'px',right:'auto',bottom:'auto'});
  }
  function installFloatingHelperDrag(button){
    let hold=null,suppressClick=false;
    const clear=()=>{if(hold)clearTimeout(hold.timer);hold=null;button.style.cursor='grab';};
    button.addEventListener('pointerdown',event=>{
      if(event.isPrimary===false||(event.button!==undefined&&event.button!==0))return;
      clear();suppressClick=false;
      const rect=button.getBoundingClientRect();
      hold={id:event.pointerId,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top,dragging:false};
      hold.timer=setTimeout(()=>{if(hold){hold.dragging=true;button.style.cursor='grabbing';}},300);
      button.setPointerCapture?.(event.pointerId);
    });
    button.addEventListener('pointermove',event=>{
      if(!hold||hold.id!==event.pointerId)return;
      const dx=event.clientX-hold.x,dy=event.clientY-hold.y;
      if(!hold.dragging){if(Math.hypot(dx,dy)>10){suppressClick=true;clear();}return;}
      event.preventDefault();suppressClick=true;
      floatingHelperPositions.set(button.id,{left:hold.left+dx,top:hold.top+dy});placeFloatingHelperButton(button);
    });
    button.addEventListener('pointerup',event=>{if(hold?.id===event.pointerId){suppressClick=hold.dragging||suppressClick;clear();}});
    button.addEventListener('pointercancel',()=>{suppressClick=true;clear();});
    button.addEventListener('lostpointercapture',clear);
    button.addEventListener('contextmenu',event=>event.preventDefault());
    button.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopImmediatePropagation();suppressClick=false;}},true);
  }
  function nativeGameWindowOpen(){
    return [...document.querySelectorAll('.overlay,dialog[open],[role="dialog"]')].some(panel=>{
      if(panel.closest('#ro-advanced-choice-dialog, #ro-safari-diagnostics'))return false;
      for(let node=panel;node instanceof Element;node=node.parentElement){
        if(node.hidden||node.classList.contains('hidden')||node.getAttribute('aria-hidden')==='true')return false;
        const style=window.getComputedStyle?.(node);
        if(style?.display==='none'||style?.visibility==='hidden')return false;
      }
      return true;
    });
  }
  function updateAdvancedChoiceUI(){
    const lobby=document.querySelector('#lobby-ui');let button=document.querySelector('#ro-advanced-choice');
    if(!lobby||lobby.classList.contains('hidden')||!document.body.classList.contains('in-lobby')){button?.remove();closeAdvancedDialog();return;}
    if(!button){button=advancedButton('自動選卡',()=>{if(advancedDialog)return;advancedScope=advancedCharacterScope(advancedReadCharacter());advancedDialog=document.createElement('section');advancedDialog.id='ro-advanced-choice-dialog';advancedDialog.setAttribute('role','dialog');advancedDialog.setAttribute('aria-modal','true');advancedDialog.setAttribute('aria-label','自動選卡設定');document.body.append(advancedDialog);renderAdvancedDialog();});button.id='ro-advanced-choice';document.body.append(button);}
    if(!button.dataset.roDraggable){button.dataset.roDraggable='true';button.title='點一下開啟設定；長按後拖曳移動';installFloatingHelperDrag(button);}
    const blocked=nativeGameWindowOpen();
    if(button.hidden!==blocked)button.hidden=blocked;
    if(advancedDialog&&advancedDialog.hidden!==blocked)advancedDialog.hidden=blocked;
    const text='自動選卡'+(advancedSettings.enabled?'：開':'：關');if(button.textContent!==text)button.textContent=text;
    if(!blocked)placeFloatingHelperButton(button);
  }
