const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{parseHTML}=require('linkedom');
const native=JSON.parse(fs.readFileSync('tests/fixtures/advanced-choice-native.json','utf8'));
// Pointer/viewport behavior is exercised with deterministic geometry below.
function setup(initialStorage=[]){
 const {window}=parseHTML('<html><head></head><body class="in-lobby"><div id="lobby-ui"></div><div id="lobby-labels"><div class="lobby-name self">greydust</div></div><div id="picker" class="hidden"><b id="pk-title"></b><div id="pk-sub"></div><div id="pk-gain"></div><div id="lu-sockets"></div><div id="pk-hint"></div><div id="pk-cards"></div></div></body></html>');
 let clock=0,id=0;const timers=new Map(),saved=new Map(initialStorage),messages=[];
 const setTimer=(fn,delay=0)=>{timers.set(++id,{at:clock+delay,fn});return id;};
 const ctx=vm.createContext({window,document:window.document,Element:window.Element,console,performance:{now:()=>clock},localStorage:{get length(){return saved.size;},key:index=>[...saved.keys()][index],getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)},setTimeout:setTimer,clearTimeout:key=>timers.delete(key),setInterval:()=>0,clearInterval(){},requestAnimationFrame:()=>0,cancelAnimationFrame(){},queueMicrotask:fn=>setTimer(fn,0),notify:message=>messages.push(message),activeGame:null,skillDefs:null,gameCatalog:null,smithDefs:null,pickerIsOpen:()=>!window.document.querySelector('#picker').classList.contains('hidden'),installPickupHelpers(){},installHordeCount(){},fastHooked:new WeakMap(),rules:[]});
 window.setTimeout=setTimer;
 vm.runInContext(fs.readFileSync('src/advanced-choice.js','utf8')+`
 const c=text=>text,O={ui(){},play(){}},Nt=id=>document.getElementById(id),Ze=true,tb=()=>'',eb=()=>[],n1=()=>null,mn=()=>{};
 let sn=null;const RO_SAVEUP={after(){}};
 const Zy=(action,id)=>'<button class="pk-act" data-act="'+id+'" '+(action.disabled?'disabled':'')+'>'+action.label+'</button>';
 ${native.QT}${native.ZT}${native.kr}
 function render(game,cards,kind){
   const draw=kind==='skill'?QT(game,cards,card=>game.choose(card)):ZT(game,cards,0,card=>game.chooseChest(card));
   return kr({title:kind,extra:'sockets',bar:draw.bar,cards:cards.map((card,index)=>({color:'#fff',name:card.id||card.item,icon:'',lines:[],actions:draw.cardActions(card,index),...(kind==='item'&&game.runItems.slots.get(card.slot)&&game.runItems.slots.get(card.slot).item!==card.item?{confirm:{from:'old',to:'new',question:'replace'}}:{})})),onPick:index=>kind==='skill'?game.choose(cards[index]):game.chooseChest(cards[index])});
 }
 function Pf(game,cards){return render(game,cards,'skill');}function h1(game,cards){return render(game,cards,'item');}function o1(){document.getElementById('picker').classList.add('hidden');}
 globalThis.Game=class{
   constructor(){this.events={onLevelUp:cards=>Pf(this,cards),onChest:cards=>h1(this,cards)};this.slots=[];this.maxSkills=3;this.state='levelup';this.perksLeft={reroll:3,reroll_card:4,banish:3,focus:0,deity:0};this.perksMax={reroll:3,reroll_card:4,banish:3,focus:0};this.banished=new Set();this.focused=new Set();this.banishedItems=new Set();this.focusedItems=new Set();this.weapons=[];this.runItems={slots:new Map(),rollSlot:()=>this.nextItem||null,roll:()=>[]};this.chosen=[];this.newSkills=[];this.upgrades=[];this.pendingLevelUps=1;}
   freshChoices(){return this.newSkills.filter(card=>!this.banished.has(card.id));}upgradeChoices(){return this.upgrades.filter(card=>!this.banished.has(card.id));}takeChoice(cards){return cards[0];}
   rollChoices(){return this.deck||[];}rollChest(){return this.deck||[];}deityLearned(){return [];}chestOpts(){return {};}
   choose(card){this.chosen.push(card);if(card.isNew)this.slots.push(card.id);this.state='playing';}
   chooseChest(card){this.chosen.push(card);if(card)this.runItems.slots.set(card.slot,{item:card.item});this.state='playing';}
   ${['rerollDeck','canRerollCard','rerollCard','banishCard','rerollChest','canRerollChestCard','rerollChestCard','banishChestCard'].map(key=>native[key]).join('\n')}
 };
 const hn={p_cd:{},p_hp:{},p_regen:{}},Ng=()=>0,Ni=[{mult:1}];
 globalThis.api={decide:advancedDecision,configure:value=>advancedSettings={enabled:true,skills:{},items:{},priority:[],...value},capture:(game,cards,kind,render=null)=>{activeGame=game;installAdvancedChoiceMethods(game);captureAdvancedChoice(game,cards,kind,render);},run:runAdvancedChoice,cancel:cancelAdvancedChoice,input:advancedManualInput,ui:updateAdvancedChoiceUI,init:initializeAdvancedCatalog,catalog:advancedCatalog,upgrades:advancedSkillUpgrades,scope:advancedCharacterScope,read:advancedReadCharacter,scopedSkills:advancedScopedSkills,scopedItems:advancedScopedItems,setScope:value=>advancedScope=value,settings:()=>advancedSettings,state:()=>advancedChoice,save:saveAdvancedSettings,profiles:()=>advancedProfiles,selectProfile:selectAdvancedProfile,addProfile:addAdvancedProfile,removeProfile:removeAdvancedProfile,exportProfiles:exportAdvancedProfiles,importProfiles:importAdvancedProfiles};
 `,ctx);
 return {ctx,document:window.document,api:ctx.api,game:()=>new ctx.Game(),messages,saved,advance(ms){const end=clock+ms;let steps=0;while(true){const next=[...timers].filter(([,timer])=>timer.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;if(++steps>500)throw Error('timer loop');clock=next[1].at;timers.delete(next[0]);next[1].fn();}clock=end;}};
}
const fresh=id=>({id,isNew:true,rarity:0}),up=(id,aspect='dmg')=>({id,isNew:false,rarity:1,upgrade:{aspect,amount:1}}),item=(slot,id,quality=0,refine=0)=>({slot,item:id,quality,refine});
const normalize=value=>JSON.parse(JSON.stringify(value));
{
 const snapshot=JSON.parse(fs.readFileSync('tests/fixtures/third-job-native.json','utf8'));
 const thirdJobs=snapshot.jobs.filter(job=>snapshot.trees.some(tree=>tree.job===job.id));
 assert.equal(thirdJobs.length,16);assert.equal(snapshot.trees.length,48);
 for(const job of thirdJobs){
  const e=setup(),trees=snapshot.trees.filter(tree=>tree.job===job.id);
  const skillIds=[...new Set([...Object.values(snapshot.pool).flat(),...snapshot.trees.flatMap(tree=>tree.skills)])];
  e.ctx.kN=snapshot.jobs;e.ctx.Mp=snapshot.jobs;e.ctx.$E=snapshot.pool;
  // Skill constructors are stubs; job ancestry and pool functions are native.
  e.ctx.yt=Object.fromEntries(skillIds.map(id=>[id,{id,name:id,kind:'weapon',maxLevel:10,create:()=>({})}]));
  vm.runInContext(snapshot.lookup+snapshot.lineage+snapshot.skillPool+';api.catalog.pool=U9;api.catalog.lineage=tl;api.catalog.jobs=su;',e.ctx);
  e.api.catalog.skills=Object.values(e.ctx.yt);
  e.api.catalog.talents=Object.fromEntries(trees.flatMap((tree,index)=>tree.skills.map((skill,slot)=>[`${job.id}.${index+1}.s${slot+1}`,{job:job.id,learn:skill}])));
  e.ctx.skillDefs=e.ctx.yt;
  for(const representation of [{job:job.base,promotion:job.id},{job:job.id}]){
   const hero={id:'third-hero',name:'greydust',...representation,talents:{},equipped:{},inventory:[]};
   const skill=trees[0].skills[0],other=trees[1].skills[0];
   hero.talents[`${job.id}.1.s1`]=1;
   const scope=e.api.scope(hero);assert(scope,job.id);assert(scope.ids.has(skill),job.id+' learned third skill');assert(!scope.ids.has(other),job.id+' unlearned third skill');
   e.api.setScope(scope);assert(e.api.scopedSkills().some(row=>row.id===skill));
   assert(e.api.scopedItems('deity').some(row=>row.id===skill),job.id+' dedicated deity');
   e.saved.set('ro-survivors.characters.v1',JSON.stringify([hero]));e.api.ui();e.document.querySelector('#ro-advanced-choice').click();
   const names=[...e.document.querySelectorAll('.ro-ac-row[data-search]')].map(row=>row.firstElementChild.textContent);
   assert(names.includes(skill),job.id+' skill settings');assert(!names.includes(other));
   [...e.document.querySelectorAll('button')].find(button=>button.textContent==='新增條目').click();
   assert([...e.document.querySelectorAll('.ro-ac-priority select option')].some(option=>option.textContent===skill),job.id+' priority option');
   e.api.input({type:'keydown',key:'Escape',preventDefault(){},stopImmediatePropagation(){}});
   assert.equal(e.api.decide(e.game(),[fresh(skill)],'skill').index,0);
  }
 }
 console.log('PASS all 16 native third jobs: learned skills, settings, priority and deity in both character representations');
}
{
 const e=setup(),g=e.game();e.api.configure({skills:{must:{take:'must'},no:{take:'never'},stop:{upgrade:'banish'}}});g.newSkills=[fresh('must')];
 assert.deepEqual(normalize(e.api.decide(g,[fresh('must'),up('stop')],'skill')),{type:'banish',index:1});
 assert.deepEqual(normalize(e.api.decide(g,[fresh('fill'),fresh('must'),fresh('must2')],'skill')),{type:'pick',index:1});
 assert.equal(e.api.decide(g,[fresh('fill')],'skill').index,0,'fill leaves reserved must slot');
 g.slots=['a','b'];assert.equal(e.api.decide(g,[fresh('fill')],'skill').type,'deck');
 assert.equal(e.api.decide(g,[fresh('fill')],'skill').type,'deck','each new deck restarts skill decisions');
 assert.equal(e.api.decide(g,[fresh('no')],'skill',{available:()=>false}),null,'never-take cannot become fallback');
 e.api.configure({skills:{unavailable:{take:'must'}}});g.newSkills=[];assert.equal(e.api.decide(g,[fresh('fill')],'skill').type,'pick','other job required skills do not reserve slots');
 console.log('PASS skill new-card ordering, strict slot reservation, repeated rerolls and forbidden fallback');
}
{
 const e=setup(),g=e.game();g.slots=['a','b','c'];
 e.api.configure({skills:{b:{upgrade:'ignore'},c:{upgrade:'banish'}},priority:[{skill:'a',upgrades:['effect:stun']},{skill:'d',upgrades:[]}]});
 const parts=up('a');parts.upgrade={parts:[{aspect:'cd'},{aspect:'effect',effect:'stun'}]};
 assert.equal(e.api.decide(g,[up('b'),up('d'),parts],'skill').index,2,'any selected part of a composite upgrade matches');
 assert.equal(e.api.decide(g,[up('b'),up('d'),up('a','cd')],'skill').index,1,'arbitrary upgrade priority entry');
 assert.equal(e.api.decide(g,[up('b'),up('c')],'skill',{available:()=>false}).index,0,'exhausted banish is not chosen as upgrade');
 assert.equal(e.api.decide(g,[up('c')],'skill',{available:()=>false}),null);
 console.log('PASS detailed priority, multi-part upgrades, select/ignore and banish exhaustion');
}
{
 const e=setup(),g=e.game();g.slots=['auto_guard','b','c'];
 e.api.configure({priority:[{skill:'auto_guard',upgrades:['effect:block']}]});
 const mixed=up('auto_guard');mixed.rarity=4;mixed.upgrade={parts:[{aspect:'duration'},{aspect:'effect',effect:'block'}]};
 assert.equal(e.api.decide(g,[mixed,up('b')],'skill').index,0,'legendary card containing the requested aspect is eligible');
 g.choose(mixed);
 assert.equal(e.api.decide(g,[up('auto_guard','duration'),up('b')],'skill').index,1,'later duration-only cards cannot bypass the aspect filter');
 assert.equal(e.api.decide(g,[up('auto_guard','duration')],'skill'),null,'no matching upgrade leaves the choice manual');
 assert.equal(e.api.decide(g,[up('auto_guard','duration'),{id:'potion'}],'skill').index,1,'healing fallback remains available');
 e.api.configure({priority:[{skill:'auto_guard',upgrades:[]}]});
 assert.equal(e.api.decide(g,[up('auto_guard','duration')],'skill').index,0,'empty aspect selection still allows any upgrade');
 console.log('PASS legendary auto guard mixed upgrades do not enable duration-only fallback');
}
{
 const e=setup(),g=e.game();e.api.configure({items:{potion:{wanted:['p_hp','p_cd']},dish:{wanted:['d_str']}}});
 assert.equal(e.api.decide(g,[item('potion','p_hp',1),item('potion','p_cd',4)],'item').index,1,'wanted chooses highest rarity');
 assert.equal(e.api.decide(g,[item('potion','p_regen'),item('elixir','anything')],'item').index,1,'any category precedes single refresh');
 assert.equal(e.api.decide(g,[item('potion','p_regen')],'item').type,'single');
 g.runItems.slots.set('potion',{item:'p_cd'});assert.equal(e.api.decide(g,[item('potion','p_cd',0,1)],'item').type,'pick','owned wanted item upgrades without refresh');
 e.api.configure({items:{potion:{wanted:['p_cd'],upgrade:'banish'}}});assert.equal(e.api.decide(g,[item('potion','p_cd',0,1)],'item').type,'banish');
 assert.equal(e.api.decide(g,[item('potion','p_cd',0,1)],'item',{available:()=>false}).type,'pick','fallback 7 allows best upgrade after banish is exhausted');
 console.log('PASS item rarity, any-category preference, missing desired refresh and upgrade policy');
}
{
 const e=setup(),g=e.game();g.runItems.slots.set('potion',{item:'p_hp'});g.runItems.slots.set('dish',{item:'d_str'});g.runItems.slots.set('elixir',{item:'e_hp'});
 const cards=[item('potion','p_hp',1,1),item('dish','d_str',4,1),item('elixir','e_hp',4,1)];
 e.api.configure({});assert.equal(e.api.decide(g,cards,'item').index,1,'select upgrades use highest rarity, ties retain leftmost');
 e.api.configure({items:{potion:{upgrade:'ignore'},dish:{upgrade:'ignore'},elixir:{upgrade:'ignore'}}});
 assert.equal(e.api.decide(g,cards,'item').index,1,'ignore upgrades also use highest rarity');
 e.api.configure({items:{potion:{upgrade:'select'},dish:{upgrade:'ignore'},elixir:{upgrade:'ignore'}}});
 assert.equal(e.api.decide(g,cards,'item').index,0,'select tier retains priority over a higher rarity ignore upgrade');
 console.log('PASS item upgrade rarity within select/ignore tiers and leftmost ties');
}
{
 const e=setup(),g=e.game();e.api.configure({skills:{blocked:{upgrade:'banish'},must:{take:'must'}}});
 const cards=[up('blocked'),fresh('fill')];g.newSkills=[fresh('must')];g.deck=[fresh('must'),up('a')];
 e.ctx.Pf(g,cards);e.api.capture(g,cards,'skill');e.advance(3000);
 assert.equal(g.perksLeft.banish,2);assert(g.banished.has('blocked'));assert.equal(g.chosen.length,1);assert.equal(g.chosen[0].id,'must');
 assert.equal(g.perksLeft.reroll,3,'banish replacement must card is chosen without unnecessary refresh');
 console.log('PASS real native card actions and picker entrance/exit: banish redraw then choose required skill');
}
{
 const e=setup(),g=e.game();e.api.configure({skills:{must:{take:'must'}}});g.slots=['a','b'];g.newSkills=[fresh('must')];g.deck=[fresh('must')];
 const cards=[fresh('fill')];e.ctx.Pf(g,cards);e.api.capture(g,cards,'skill');e.advance(3000);
 assert.equal(g.perksLeft.reroll,2);assert.equal(g.chosen[0].id,'must');
 console.log('PASS native deck reroll updates authoritative offers before initial skill selection');
}
{
 const e=setup(),g=e.game();e.api.configure({items:{potion:{wanted:['p_cd']}}});g.runItems.slots.set('potion',{item:'p_regen'});g.nextItem=item('potion','p_cd',3);
 const cards=[item('potion','p_hp')];e.ctx.h1(g,cards);e.api.capture(g,cards,'item');e.advance(3500);
 assert.equal(g.perksLeft.reroll_card,3);assert.equal(g.chosen.length,1);assert.equal(g.chosen[0].item,'p_cd');
 console.log('PASS native single refresh and replacement confirmation complete through real picker');
}
{
 const e=setup(),g=e.game();e.api.configure({items:{potion:{wanted:['p_cd']}}});g.nextItem=item('potion','p_hp');const cards=[item('potion','p_hp')];g.deck=cards;
 e.ctx.h1(g,cards);e.api.capture(g,cards,'item');e.advance(5000);
 assert.equal(g.perksLeft.reroll_card,0);assert.equal(g.perksLeft.reroll,0);assert.equal(g.chosen.length,1,'fallback 9 chooses a new item after all native rerolls are exhausted');
 console.log('PASS native single and deck refresh exhaust normally before highest-rarity fallback');
}
{
 const e=setup(),g=e.game();e.api.configure({});const cards=[fresh('a')];e.ctx.Pf(g,cards);e.api.capture(g,cards,'skill');
 e.api.input({type:'keydown',key:'Escape'});e.advance(3000);assert.equal(g.chosen.length,0);
 e.api.capture(g,cards,'skill');g.player={dead:true};e.advance(3000);assert.equal(g.chosen.length,0);
 g.player.dead=false;e.api.capture(g,cards,'skill');e.api.configure({enabled:false});e.advance(3000);assert.equal(g.chosen.length,0);
 console.log('PASS manual cancellation, death and disabled automation never click');
}
{
 const e=setup(),g=e.game();e.api.configure({skills:{must:{take:'must'}}});
 vm.runInContext(fs.readFileSync('src/deity-preference.js','utf8')+fs.readFileSync('src/auto-pick.js','utf8').split('  function victoryMagnet(')[0]+';globalThis.installTest=installFastChoice;',e.ctx);
 e.ctx.rules=[{kind:'skill',id:'fill'}];e.ctx.installTest(g);
 g.events.onLevelUp([fresh('fill'),fresh('must')]);e.advance(3000);
 assert.equal(g.chosen.length,1);assert.equal(g.chosen[0].id,'must','advanced enabled supersedes old matching rule');
 g.state='levelup';g.events.onLevelUp([up('must')]);e.advance(3000);assert.equal(g.chosen.length,2,'subsequent level choice starts a fresh automation session');
 console.log('PASS initial and subsequent native event integration supersedes old auto-pick without double selection');
}
{
 const e=setup();e.ctx.skillDefs={bash:{id:'bash',name:'狂擊',kind:'weapon',create:()=>({upgradeAspects:()=>['dmg','cd'],effects:[{key:'stun',label:'暈眩'}]})}};
 e.api.init({skills:e.ctx.skillDefs,items:{p_regen:{id:'p_regen',name:'藥水',slot:'potion'},d_str:{id:'d_str',name:'力量料理',slot:'dish'}}});
 assert.deepEqual(normalize(e.api.upgrades('bash')).map(row=>row.id),['dmg','cd','effect:stun']);
 e.api.catalog.pool=()=>[{id:'bash'}];e.api.catalog.lineage=()=>['crusader'];
 e.saved.set('ro-survivors.characters.v1',JSON.stringify([{id:'hero',name:'greydust',job:'crusader',talents:{},equipped:{},inventory:[]}]));
 e.api.ui();e.document.querySelector('#ro-advanced-choice').click();assert(e.document.querySelector('#ro-advanced-choice-dialog'));
 const add=[...e.document.querySelectorAll('button')].find(button=>button.textContent==='新增條目');add.click();add.click();
 assert.equal(e.api.settings().priority.length,2);
 e.api.settings().priority[0].upgrades=['dmg'];e.api.settings().priority[1].upgrades=['cd'];
 const down=[...e.document.querySelectorAll('button')].find(button=>button.textContent==='↓'&&!button.disabled);down.click();
 assert.deepEqual(normalize(e.api.settings().priority[0].upgrades),['cd']);
 [...e.document.querySelectorAll('button')].find(button=>button.textContent==='刪除').click();assert.equal(e.api.settings().priority.length,1);
 e.api.input({type:'keydown',key:'Escape',preventDefault(){},stopImmediatePropagation(){}});assert(!e.document.querySelector('#ro-advanced-choice-dialog'));
 e.api.configure({skills:{bash:{take:'must',upgrade:'select'}},priority:[{skill:'bash',upgrades:['dmg']}]});e.api.save();assert(JSON.parse(e.saved.get('greydust.ro.advanced-choice.v1')).skills.bash.take==='must');
 console.log('PASS native upgrade metadata, lobby settings, modal Escape and persistent configuration');
}
{
 const e=setup();
 e.ctx.skillDefs={bash:{id:'bash',name:'狂擊',kind:'weapon'},shield_bash:{id:'shield_bash',name:'盾擊',kind:'weapon',needsShield:true},holy_cross:{id:'holy_cross',name:'聖十字攻擊',kind:'weapon'},firebolt:{id:'firebolt',name:'火箭術',kind:'weapon'},atk_sword:{id:'atk_sword',name:'攻擊：劍',kind:'weapon'}};
 e.api.catalog.skills=Object.values(e.ctx.skillDefs);e.api.catalog.items=[{id:'g_war',name:'戰爭神格',slot:'deity'}];
 e.ctx.smithDefs={1:{wtype:'검',slot:'weapon'},2:{slot:'shield'}};
 e.api.catalog.pool=(job,learned)=>[...(job==='crusader'?['bash','shield_bash']:['firebolt']),...learned].map(id=>({id}));
 e.api.catalog.lineage=job=>job==='crusader'?['swordsman','crusader']:['mage'];e.api.catalog.basic=()=> 'atk_sword';
 e.api.catalog.talents={learn:{job:'crusader',learn:'holy_cross'},wrong:{job:'mage',learn:'firebolt'}};
 const hero={id:'hero',name:'greydust',job:'crusader',talents:{learn:1,wrong:1},equipped:{weapon:'w',shield:'s'},inventory:[{uid:'w',itemId:1},{uid:'s',itemId:2}]};
 e.saved.set('ro-survivors.acct.example.characters.v1',JSON.stringify({...hero,inventory:undefined}));
 // Real rosters are arrays; account inventory is stored in a separate namespace.
 e.saved.set('ro-survivors.acct.example.characters.v1',JSON.stringify([{...hero,inventory:undefined}]));
 e.saved.set('ro-survivors.acct.example.account.v1',JSON.stringify({inventory:hero.inventory}));
 const read=e.api.read();assert.equal(read.inventory.length,2);
 const scope=e.api.scope(read);assert.deepEqual([...scope.ids],['bash','shield_bash','holy_cross','atk_sword']);e.api.setScope(scope);
 assert.deepEqual(e.api.scopedItems('deity').map(item=>item.id),['g_war','bash','shield_bash','holy_cross']);
 delete hero.equipped.shield;assert(!e.api.scope(hero).ids.has('shield_bash'),'shield-bound skills follow current equipment');
 e.api.configure({priority:[{skill:'firebolt',upgrades:[]},{skill:'bash',upgrades:[]},{skill:'holy_cross',upgrades:[]}]});
 e.api.ui();e.document.querySelector('#ro-advanced-choice').click();
 const names=[...e.document.querySelectorAll('.ro-ac-row[data-search]')].map(row=>row.firstElementChild.textContent);
 assert(!names.includes('火箭術'));assert(names.includes('聖十字攻擊'));
 const priorityNames=[...e.document.querySelectorAll('.ro-ac-priority select option')].map(option=>option.textContent);
 assert(!priorityNames.includes('火箭術'));
 assert(e.document.querySelector('#ro-advanced-choice-dialog').textContent.includes('聖十字攻擊 專屬神格'));
 assert(e.api.settings().priority.some(row=>row.skill==='firebolt'),'other-class settings preserved without appearing in current UI');
 [...e.document.querySelectorAll('.ro-ac-priority button')].find(button=>button.textContent==='↓'&&!button.disabled).click();
 assert.equal(e.api.settings().priority[0].skill,'firebolt');assert.equal(e.api.settings().priority[1].skill,'holy_cross','visible reorder skips hidden other-job entries');
 console.log('PASS current profession, learned talents, equipment, dedicated deities and scoped priority ordering');
}
{
 const e=setup();
 e.document.body.insertAdjacentHTML('beforeend','<button id="lobby-char"></button><section id="charpanel" class="hidden"><button id="cp-back"></button></section>');
 const before=vm.runInContext('Array.prototype.find',e.ctx);
 vm.runInContext(`globalThis.onlineHero={id:'online',name:'greydust',job:'crusader',talents:{},stats:{},equipped:{},inventory:[]};globalThis.closed=0;document.querySelector('#lobby-char').onclick=()=>{[onlineHero].find(char=>char.id==='online');document.querySelector('#charpanel').classList.remove('hidden');};document.querySelector('#cp-back').onclick=()=>{closed++;document.querySelector('#charpanel').classList.add('hidden');};`,e.ctx);
 assert.equal(e.api.read().id,'online','live native profile supports online saves not exposed in localStorage');
 assert.equal(vm.runInContext('Array.prototype.find',e.ctx),before);assert.equal(e.ctx.closed,1);assert(e.document.querySelector('#charpanel').classList.contains('hidden'));
 e.document.querySelector('#lobby-char').onclick=()=>{throw Error('profile error');};assert.equal(e.api.read(),null);assert.equal(vm.runInContext('Array.prototype.find',e.ctx),before);
 console.log('PASS native online profile lookup restores UI and array methods, including failures');
}
{
 const e=setup(),g=e.game();e.api.configure({skills:{must:{take:'must'},blocked:{upgrade:'banish'}}});
 const cards=[up('blocked'),fresh('fill')];g.newSkills=[fresh('must')];g.events.onLoot=(text,rarity)=>(g.notices??=[]).push({text,rarity});g.skillDef=id=>({name:id==='must'?'必拿技能':id});
 let shown=0;e.api.capture(g,cards,'skill',offers=>{shown++;e.ctx.Pf(g,offers);});
 e.advance(100);assert.equal(shown,0);assert(e.document.querySelector('#picker').classList.contains('hidden'));assert.equal(g.chosen[0].id,'must');assert.equal(g.perksLeft.banish,2);assert.equal(g.notices[0].text,'學會：必拿技能');
 console.log('PASS background skill banish/pick never creates picker and uses native central loot event');
}
{
 const e=setup(),g=e.game();e.api.configure({items:{potion:{wanted:['p_cd']}}});g.runItems.slots.set('potion',{item:'p_hp'});g.nextItem=item('potion','p_hp',1);g.deck=[item('potion','p_hp',1),item('potion','p_regen',4)];
 e.ctx.gameForNative=g;e.ctx.nativeChestSource=native.chooseChest;
 vm.runInContext('gameForNative.chooseChest=eval("({"+nativeChestSource+"}).chooseChest");',e.ctx);
 g.runItems.choose=card=>{g.chosen.push(card);g.runItems.slots.set(card.slot,{item:card.item});};g.recomputeStats=()=>{};g.runItemName=(slot,id)=>id;g.events.onLoot=(text,rarity)=>(g.notices??=[]).push({text,rarity});g.openingChest={dead:false};g.openingCost=100;
 let shown=0;e.api.capture(g,[item('potion','p_hp')],'item',offers=>{shown++;e.ctx.h1(g,offers);});e.advance(100);
 assert.equal(shown,0);assert.equal(g.perksLeft.reroll_card,0);assert.equal(g.perksLeft.reroll,0);assert.equal(g.chosen[0].item,'p_regen');assert.equal(g.notices.length,1,'native chooseChest already emits the acquisition notice');assert.equal(g.notices[0].rarity,4);assert.equal(g.openingChest,null);assert.equal(g.state,'playing');assert(e.document.querySelector('#picker').classList.contains('hidden'));
 console.log('PASS background item single/deck refresh, highest-rarity fallback, native replacement and one loot notice');
}
{
 const e=setup(),g=e.game();g.runItems.slots.set('potion',{item:'p_hp'});g.runItems.slots.set('dish',{item:'d_str'});
 e.api.configure({items:{potion:{wanted:['p_hp'],upgrade:'banish'},dish:{wanted:['d_str'],upgrade:'banish'}}});
 const cards=[item('potion','p_hp',1,1),item('dish','d_str',4,1)];
 assert.equal(e.api.decide(g,cards,'item',{available:()=>false}).index,1,'step 7 highest rarity among remaining upgrades');
 const freshCards=[item('potion','wrong',1),item('dish','wrong2',4)];
 assert.equal(e.api.decide(g,freshCards,'item',{available:type=>type==='deck'}).type,'deck','step 8 only when all cards are new');
 assert.equal(e.api.decide(g,freshCards,'item',{available:()=>false}).index,1,'step 9 best new item when deck reroll is unavailable');
 const onlyNew=[fresh('forbidden')];e.api.configure({skills:{forbidden:{take:'never'}}});
 let shown=0;e.api.capture(g,onlyNew,'skill',offers=>{shown++;e.ctx.Pf(g,offers);});e.advance(100);assert.equal(shown,1);assert(!e.document.querySelector('#picker').classList.contains('hidden'));assert(e.api.state().manual);
 e.document.querySelector('#picker').classList.add('hidden');g.state='levelup';e.api.capture(g,[fresh('fill')],'skill',offers=>{shown++;e.ctx.Pf(g,offers);});e.api.input({type:'keydown',key:'Escape'});e.advance(100);assert.equal(shown,2);assert.equal(g.chosen.length,0);
 console.log('PASS item fallback branches and background manual recovery/cancellation without stuck level-up state');
}
{
 const e=setup();e.api.configure({skills:{bash:{take:'must',upgrade:'select'}},items:{potion:{wanted:['p_cd'],upgrade:'select'}},priority:[{skill:'bash',upgrades:['dmg']}]});e.api.save();
 const first=e.api.profiles().active,second=e.api.addProfile('火法');assert.equal(e.api.settings().skills.bash.take,'must','new profile clones current settings');
 e.api.settings().skills.bash.take='never';e.api.save();e.api.selectProfile(first);assert.equal(e.api.settings().skills.bash.take,'must','profiles are isolated');
 const single=e.api.exportProfiles();assert.equal(JSON.parse(single).profiles.length,1);
 const all=e.api.exportProfiles(true),before=e.api.profiles().profiles.length;assert.equal(e.api.importProfiles(all),2);assert.equal(e.api.profiles().profiles.length,before+2);assert(e.api.profiles().profiles.some(profile=>profile.name==='預設 (2)'));
 const snapshot=JSON.stringify(e.api.profiles());
 assert.throws(()=>e.api.importProfiles('{bad json'));assert.equal(JSON.stringify(e.api.profiles()),snapshot);
 const invalid=JSON.parse(all);invalid.profiles[1].settings.priority=[{skill:'bash',upgrades:['__proto__']}];assert.throws(()=>e.api.importProfiles(JSON.stringify(invalid)));assert.equal(JSON.stringify(e.api.profiles()),snapshot,'entire invalid import is atomic');
 const reloaded=setup([...e.saved]);assert.equal(reloaded.api.profiles().active,e.api.profiles().active);assert.equal(reloaded.api.profiles().profiles.length,4);
 e.api.removeProfile();assert.equal(e.api.profiles().profiles.length,3);assert(!e.api.profiles().profiles.some(profile=>profile.id===e.api.profiles().active&&profile.id===second.id),'deletion selects a surviving profile');
 const migrated=setup([['greydust.ro.advanced-choice.v1',JSON.stringify({enabled:true,skills:{},items:{},priority:[]})]]);assert.equal(migrated.api.profiles().profiles.length,1);assert(migrated.api.settings().enabled);
 assert.throws(()=>migrated.api.removeProfile(),/至少保留/);
 console.log('PASS multi-profile isolation, selected-profile persistence, legacy migration, export/import, collision and atomic validation');
}
{
 const e=setup();let created=0;e.document.body.classList.remove('in-lobby');
 e.ctx.skillDefs={bash:{id:'bash',name:'狂擊',kind:'weapon',create:()=>{created++;return {upgradeAspects:()=>['dmg'],effects:[]};}}};
 e.api.init({skills:e.ctx.skillDefs});assert.equal(created,0);assert.equal(e.api.upgrades('bash').length,0);assert.equal(created,0,'combat must not create extra skill instances');
 e.document.body.classList.add('in-lobby');assert.equal(e.api.upgrades('bash').length,1);assert.equal(created,1);e.api.upgrades('bash');assert.equal(created,1,'metadata cached per skill');
 e.api.ui();e.document.querySelector('#ro-advanced-choice').click();e.document.querySelector('#lobby-ui').classList.add('hidden');e.api.ui();
 assert(!e.document.querySelector('#ro-advanced-choice'));assert(!e.document.querySelector('#ro-advanced-choice-dialog'));
 console.log('PASS metadata constructors are town-only and lazy; town exit closes settings');
}

for(const background of [false,true]){
 for(const outcome of ['must','banish','exhaust']){
  const e=setup(),g=e.game();
  e.api.configure({skills:{must:{take:'must'},blocked:{upgrade:'banish'}}});
  g.slots=['a','b'];g.newSkills=[fresh('must')];
  let rolls=0,shown=0;
  g.rollChoices=()=>{
   rolls++;
   return rolls<2||outcome==='exhaust'?[fresh('fill'),up('a')]:outcome==='banish'?[up('blocked'),fresh('fill')]:[fresh('must')];
  };
  const cards=[fresh('fill'),up('a')];
  if(!background)e.ctx.Pf(g,cards);
  e.api.capture(g,cards,'skill',background?offers=>{shown++;e.ctx.Pf(g,offers);}:null);
  e.advance(5000);
  assert.equal(rolls,outcome==='exhaust'?3:2,'reroll again before choosing an upgrade');
  assert.equal(g.perksLeft.reroll,outcome==='exhaust'?0:1);
  assert.equal(g.chosen.length,1);
  assert.equal(g.chosen[0].id,outcome==='exhaust'?'a':'must');
  assert.equal(g.perksLeft.banish,outcome==='banish'?2:3,'restart with banish branch after reroll');
  if(background)assert.equal(shown,0);
 }
 console.log('PASS '+(background?'background':'native picker')+' skill rerolls restart branches until match or exhaustion');
}
{
 const e=setup();vm.runInContext('globalThis.helperViewport=()=>({left:0,top:0,width:360,height:640})',e.ctx);
 e.api.ui();const button=e.document.querySelector('#ro-advanced-choice');
 button.getBoundingClientRect=()=>({left:240,top:580,width:100,height:44});
 const pointer=(type,x,y)=>{const event=new e.document.defaultView.Event(type,{bubbles:true,cancelable:true});Object.assign(event,{pointerId:1,button:0,clientX:x,clientY:y});button.dispatchEvent(event);};
 pointer('pointerdown',250,590);e.advance(300);pointer('pointermove',-100,900);pointer('pointerup',-100,900);
 assert.equal(button.style.left,'0px');assert.equal(button.style.top,'596px','drag clamps to viewport');
 const click=new e.document.defaultView.Event('click',{bubbles:true,cancelable:true});button.dispatchEvent(click);assert(click.defaultPrevented,'drag suppresses following click');
 pointer('pointerdown',250,590);pointer('pointerup',250,590);button.click();assert(e.document.querySelector('#ro-advanced-choice-dialog'),'short tap opens settings');
 const first=e.document.createElement('div'),second=e.document.createElement('div');first.className='overlay';second.className='overlay';e.document.body.append(first,second);
 e.api.ui();assert(button.hidden);assert(e.document.querySelector('#ro-advanced-choice-dialog').hidden);
 first.classList.add('hidden');e.api.ui();assert(button.hidden,'another open window keeps button hidden');
 second.hidden=true;e.api.ui();assert(!button.hidden);assert(!e.document.querySelector('#ro-advanced-choice-dialog').hidden,'settings restore after all native windows close');
 assert.equal(button.style.left,'0px','position survives hide/show');
 pointer('pointerdown',100,100);e.advance(300);pointer('pointercancel',100,100);pointer('pointermove',200,200);assert.equal(button.style.left,'0px','cancel stops dragging');
 console.log('PASS floating choice button hold/drag, viewport bounds, tap, cancellation and multiple native windows');
}
