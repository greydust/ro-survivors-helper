const { parseHTML } = require('linkedom');
const vm = require('node:vm');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'dist', 'RO倖存者助手.user.js'), 'utf8');
function setup(bundle=source) {
  const { window } = parseHTML('<html><head></head><body><div id="skillbar"></div><div id="runitems"></div><div id="skill-tip" class="hidden"></div><div id="picker" class="hidden"><div id="pk-title">Level Up！</div><div id="lu-sockets"></div><div id="pk-cards"></div></div></body></html>');
  const { document } = window;
  // LinkeDOM windows share a proxy backing store; each fixture is a new page.
  delete window[Symbol.for('greydust.ro.helper.runtime')];
  delete window.visualViewport;
  let time = 0, next = 1;
  const timers = new Map(), storage = new Map();
  let observer;
  const context = vm.createContext({ document, window, Element: window.Element, MouseEvent: window.Event,
    MutationObserver: class { constructor(callback) { observer = callback; } observe() {} }, location: { href: 'https://ro.hans-webgametw.com/' }, URL,
    localStorage: { getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v) },
    console, JSON, Set, innerWidth: 1200, innerHeight: 800, performance: { now: () => time },
    setTimeout: (fn, delay) => { const id = next++; timers.set(id, { fn, at: time+delay }); return id; },
    clearTimeout: id => timers.delete(id), queueMicrotask: fn => fn() });
  vm.runInContext(bundle.replace(/\}\)\(\);\s*$/, 'stageLevelRules={config:{max:6,stages:null,exp:{from:3,base:54,span:44}},chapter2:{},stages:[{id:"prontera"},{id:"pyramid"},{id:"maze"}]}; globalThis.api = { equipmentTiers, stageSpawnRows, selectedStageScript, updateStageSpawnSchedule, spawnTime, characterStatRows, updateCharacterDetails, openCharacterDetails, closeCharacterDetails, resetRun, helperTick, beginLongPress, moveLongPress, endLongPress, suppressHeldEvent, touchContext, helperViewport, installHordeCount, hordeProgress, fieldMonsterCounts, fieldMonsterLimit, updateHordeHud, clearHordeHud, scan, context, choose, rank, cancel, installOfflineGate, setKeepOffline, isLobbySocket, updateOfflineUI, getKeepOffline:()=>keepOffline, patchMinimapContext, updateMinimapOption, setHideMagnets:value=>hideMinimapMagnets=value, hordeRingGeometry, setShowRing:value=>showHordeRing=value, setActiveGame:value=>activeGame=value, victoryMagnet, fastChoice, installFastChoice, updateSmith, smithCategory, setSmithData:(defs,assets)=>{smithDefs=defs;smithAssets=assets;}, updateAutoRefine, startAutoRefine, stopAutoRefine, setRefineTarget:value=>autoRefine.target=value, getAutoRefine:()=>autoRefine, actualEquipmentBonuses, getEquipmentCatalog:()=>EQUIPMENT_CATALOG, migrateEquipmentFilter, validDetailSettings, emptyEquipmentFilter, validEquipmentFilter, isUnwantedEquipment, equipmentGroups, setEquipmentTier, excludeEquipmentTiers, damageSkillOptions, setSkillDefs:value=>skillDefs=value, setGameCatalog:value=>gameCatalog=value, formMulti, updateMerchant, captureMerchantInventory, selectUnwanted, openFilter, closeFilter, openGearDetails, closeGearDetails, drawFilter, parseFilterImport, loadFilterStore, getFilterDraft:()=>filterDraft, setFilterStore:value=>filterStore=value, getFilterStore:()=>filterStore, getRules:()=>rules, setRules:r=>rules=r }; })();'), context);
  function tick(ms) {
    const end = time + ms;
    while (true) {
      const due = [...timers].filter(([,t]) => t.at <= end).sort((a,b)=>a[1].at-b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]); time = due[1].at; due[1].fn();
    }
    time = end;
  }
  return { document, window, vmContext:context, api: context.api, tick, storage, mutations: records => observer(records) };
}
function rule(kind, name, icon) { return {kind, name, icon:'https://ro.hans-webgametw.com/'+icon, id:kind==='skill'?'test':'potion'}; }
function picker(env, cards, kind='skill') {
  const {document}=env;
  document.querySelector('#pk-title').textContent=kind==='skill'?'Level Up！':'寶箱';
  document.querySelector('#pk-cards').innerHTML=cards.map(([name,icon,q])=>`<div class="pk-slot"><button class="pk-card"><span class="pk-badge">${q}</span><span class="pk-art"><img src="${icon}"></span><b class="pk-name">${name}</b></button></div>`).join('');
  document.querySelector('#picker').className='';
  return [...document.querySelectorAll('.pk-card')];
}
let count=0;
function test(name,fn) {fn(); console.log('PASS',name); count++;}
test('console build starts normally and repeated execution never duplicates installation',()=>{
  const consoleSource=fs.readFileSync(path.join(root,'dist','RO倖存者助手.console.js'),'utf8');
  assert(!consoleSource.includes('// ==UserScript=='));assert(consoleSource.includes('installGameHooks();'));
  const e=setup(consoleSource),styles=e.document.querySelectorAll('style').length;
  assert.equal(styles,1);assert(e.api);assert.equal(e.window[Symbol.for('greydust.ro.helper.runtime')].version,JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version);
  vm.runInContext(consoleSource,e.vmContext);vm.runInContext(source,e.vmContext);
  assert.equal(e.document.querySelectorAll('style').length,styles);
  const slot=touchSlot(e);pointer(e,slot,'pointerdown');e.tick(550);assert.equal(e.document.querySelectorAll('#ro-ap-menu').length,1);
});
test('highest rarity among enabled items; ignore unselected legendary',()=>{
  const e=setup(); e.api.setRules([rule('skill','A','a.png'),rule('skill','B','b.png')]);
  const c=picker(e,[['A','a.png','稀有'],['B','b.png','史詩'],['C','c.png','傳說']]);
  assert.equal(e.api.choose(c,'skill').card,c[1]);
});
test('rarity ties choose leftmost; upgrade suffix does not change identity',()=>{
  const e=setup();e.api.setRules([rule('item','生命藥水','p.png'),rule('item','傷害藥水','d.png')]);
  const c=picker(e,[['生命藥水 +3','p.png','傳說'],['傷害藥水','d.png','傳說'],['C','c.png','普通']],'item');
  assert.equal(e.api.choose(c,'item').card,c[0]);
});
test('same translated name but different icon is not selected; kind separated',()=>{
  const e=setup();e.api.setRules([rule('item','範圍藥水','area.png')]);
  const c=picker(e,[['範圍藥水','reach.png','傳說'],['C','c.png','普通'],['D','d.png','稀有']],'item');
  assert.equal(e.api.choose(c,'item'),null); assert.equal(e.api.choose(c,'skill'),null);
});
test('hidden automatic picker waits for game lock then calls normal click',()=>{
  const e=setup();e.api.setRules([rule('skill','A','a.png')]);
  const c=picker(e,[['A','a.png','稀有'],['C','c.png','普通'],['D','d.png','傳說']]);
  let clicks=0;c[0].onclick=()=>{clicks++;e.document.querySelector('#picker').classList.add('closing');};
  e.api.scan();assert(e.document.querySelector('#picker').hasAttribute('data-ro-ap-hidden'));
  e.tick(799);assert.equal(clicks,0);e.tick(1);assert.equal(clicks,1);
  e.document.querySelector('#picker').className='hidden';e.api.scan();assert(!e.document.querySelector('#picker').hasAttribute('data-ro-ap-hidden'));
});
test('no match, story rewards, replacement confirms remain manual',()=>{
  const e=setup();e.api.setRules([rule('item','A','a.png')]);
  picker(e,[['A','a.png','稀有'],['C','c.png','普通'],['D','d.png','傳說']],'item');
  e.document.querySelector('.pk-slot').insertAdjacentHTML('beforeend','<div class="pk-back"></div>');
  e.api.scan();assert(!e.document.querySelector('#picker').hasAttribute('data-ro-ap-hidden'));
  e.document.querySelector('.pk-back').remove();e.document.querySelector('#pk-title').textContent='劇情道具';
  e.api.scan();assert(!e.document.querySelector('#picker').hasAttribute('data-ro-ap-hidden'));
});
test('right click enables and disables without saving',()=>{
  const e=setup();e.document.querySelector('#runitems').innerHTML='<div class="run-slot" data-item="potion"><img src="p.png"></div>';
  const el=e.document.querySelector('.run-slot');
  el.addEventListener('mouseover',()=>{const tip=e.document.querySelector('#skill-tip');tip.className='';tip.innerHTML='<div class="st-head"><img src="p.png"><b>生命藥水 +2</b></div>';});
  const event={target:el,clientX:50,clientY:50,preventDefault(){},stopImmediatePropagation(){}};
  e.api.context(event);assert.equal(e.document.querySelector('#ro-ap-menu button').textContent,'開啟自動選擇');
  e.document.querySelector('#ro-ap-menu button').click();assert.equal(e.api.getRules().length,1);assert(el.hasAttribute('data-ro-ap-enabled'));assert.equal(e.storage.size,0);
  e.api.context(event);assert.equal(e.document.querySelector('#ro-ap-menu button').textContent,'關閉自動選擇');
  e.document.querySelector('#ro-ap-menu button').click();assert.equal(e.api.getRules().length,0);
});
function touchSlot(e,kind='skill'){
  const host=e.document.querySelector(kind==='skill'?'#skillbar':'#runitems');
  host.innerHTML=kind==='skill'?'<div class="skill-slot" data-skill="bash"><img src="bash.png"></div>':'<div class="run-slot" data-item="potion"><img src="potion.png"></div>';
  const slot=host.firstElementChild;
  slot.addEventListener('mouseover',()=>{const tip=e.document.querySelector('#skill-tip');tip.className='';tip.innerHTML=`<div class="st-head"><img src="${kind==='skill'?'bash':'potion'}.png"><b>${kind==='skill'?'狂擊':'生命藥水'} +2</b></div>`;});
  return slot;
}
function pointer(e,slot,type,values={}){const event=new e.window.Event(type,{bubbles:true,cancelable:true});Object.assign(event,{pointerType:'touch',pointerId:1,isPrimary:true,button:0,clientX:300,clientY:650,...values});slot.dispatchEvent(event);return event;}
test('touch hold opens skill/item settings, suppresses release click and permits menu selection',()=>{
  for(const kind of ['skill','item']){
    const e=setup(),slot=touchSlot(e,kind);pointer(e,slot,'pointerdown');e.tick(549);assert(!e.document.querySelector('#ro-ap-menu'));
    e.tick(1);assert(e.document.querySelector('#ro-ap-menu'));assert.equal(e.api.getRules().length,0);
    // Even a continued hold must not expire the release suppression.
    e.tick(3000);const release=pointer(e,slot,'pointerup');assert(!release.defaultPrevented);
    const click=pointer(e,slot,'click');assert(click.defaultPrevented);
    e.document.querySelector('#ro-ap-menu button').click();assert.equal(e.api.getRules().length,1);assert.equal(e.api.getRules()[0].kind,kind);
    pointer(e,slot,'pointerdown');e.tick(550);assert.equal(e.document.querySelector('#ro-ap-menu button').textContent,'關閉自動選擇');
    pointer(e,slot,'pointerup');e.document.querySelector('#ro-ap-menu button').click();assert.equal(e.api.getRules().length,0);
  }
});
test('short taps, movement, multitouch, canceled and stale slots never open hold settings',()=>{
  const e=setup(),slot=touchSlot(e);
  pointer(e,slot,'pointerdown');e.tick(200);assert(!pointer(e,slot,'pointerup').defaultPrevented);e.tick(600);assert(!e.document.querySelector('#ro-ap-menu'));
  pointer(e,slot,'pointerdown');pointer(e,slot,'pointermove',{clientX:312});e.tick(600);assert(!e.document.querySelector('#ro-ap-menu'));
  pointer(e,slot,'pointerdown');pointer(e,slot,'pointerdown',{pointerId:2,isPrimary:false});e.tick(600);assert(!e.document.querySelector('#ro-ap-menu'));
  pointer(e,slot,'pointerdown');pointer(e,slot,'pointercancel');e.tick(600);assert(!e.document.querySelector('#ro-ap-menu'));
  pointer(e,slot,'pointerdown');slot.dataset.skill='other';e.tick(600);assert(!e.document.querySelector('#ro-ap-menu'));
  pointer(e,slot,'pointerdown');e.document.dispatchEvent(new e.window.Event('scroll'));e.tick(600);assert(!e.document.querySelector('#ro-ap-menu'));
  pointer(e,slot,'pointerdown');e.api.resetRun();e.tick(600);assert(!e.document.querySelector('#ro-ap-menu'));
  pointer(e,slot,'pointerdown',{pointerType:'mouse'});e.tick(600);assert(!e.document.querySelector('#ro-ap-menu'));
});
test('native touch contextmenu opens once and blocks ghost click without blocking next tap',()=>{
  const e=setup(),slot=touchSlot(e);pointer(e,slot,'pointerdown');e.tick(300);
  pointer(e,slot,'contextmenu');const menu=e.document.querySelector('#ro-ap-menu');assert(menu);
  e.tick(400);pointer(e,slot,'contextmenu');assert.equal(e.document.querySelector('#ro-ap-menu'),menu);
  pointer(e,slot,'pointerup');assert(pointer(e,slot,'click').defaultPrevented);
  pointer(e,slot,'pointerdown');assert(!pointer(e,slot,'pointerup').defaultPrevented);assert(!pointer(e,slot,'click').defaultPrevented);
});
test('mobile name fallback uses actual skill definition and unknown items remain unconfigured',()=>{
  const e=setup();e.document.querySelector('#skillbar').innerHTML='<div class="skill-slot" data-skill="bash"><img src="bash.png"></div>';
  e.api.setSkillDefs({bash:{name:'狂擊'}});const slot=e.document.querySelector('.skill-slot');pointer(e,slot,'pointerdown');e.tick(550);
  assert(e.document.querySelector('#ro-ap-menu').textContent.includes('狂擊'));pointer(e,slot,'pointerup');
  e.document.querySelector('#ro-ap-menu button+button').click();assert(!e.document.querySelector('#ro-ap-menu'));
  e.document.querySelector('#runitems').innerHTML='<div class="run-slot" data-item="unknown"><img src="unknown.png"></div>';
  const item=e.document.querySelector('.run-slot');pointer(e,item,'pointerdown');e.tick(550);assert(!e.document.querySelector('#ro-ap-menu'));assert.equal(e.api.getRules().length,0);
});
test('mobile menu respects visible viewport and dropdown stays above the software keyboard',()=>{
  const e=setup(),slot=touchSlot(e),view=new e.window.EventTarget();Object.assign(view,{offsetLeft:10,offsetTop:30,width:320,height:400});e.window.visualViewport=view;
  const original=e.window.HTMLElement.prototype.getBoundingClientRect;
  e.window.HTMLElement.prototype.getBoundingClientRect=function(){return this.id==='ro-ap-menu'?{width:240,height:160}:original.call(this);};
  try{e.api.context({target:slot,clientX:320,clientY:500,preventDefault(){},stopImmediatePropagation(){}});
    const menu=e.document.querySelector('#ro-ap-menu');assert.equal(menu.style.left,'82px');assert.equal(menu.style.top,'262px');
    const multi=e.api.formMulti([['str','力量']],[],()=>{});e.document.body.append(multi);
    multi.querySelector('summary').getBoundingClientRect=()=>({left:280,top:350,bottom:390});multi.open=true;multi.ontoggle();
    const list=multi.querySelector('.ro-filter-multi-list');assert.equal(list.style.width,'296px');assert.equal(list.style.left,'22px');assert.equal(list.style.top,'auto');assert.equal(list.style.maxHeight,'280px');multi.closeMenu();
    e.window.dispatchEvent(new e.window.Event('resize'));assert(!e.document.querySelector('#ro-ap-menu'));
  }finally{e.window.HTMLElement.prototype.getBoundingClientRect=original;}
});
test('held menu refuses to configure a slot replaced before confirmation',()=>{
  const e=setup(),slot=touchSlot(e);pointer(e,slot,'pointerdown');e.tick(550);pointer(e,slot,'pointerup');slot.dataset.skill='other';
  e.document.querySelector('#ro-ap-menu button').click();assert.equal(e.api.getRules().length,0);assert(!e.document.querySelector('#ro-ap-menu'));
});
function safariTouch(e,slot,type,values={}){
 const event=new e.window.Event(type,{bubbles:true,cancelable:true});const point={identifier:7,clientX:100,clientY:100,...values};
 Object.assign(event,{touches:type==='touchend'||type==='touchcancel'?[]:[point],changedTouches:[point]});slot.dispatchEvent(event);return event;
}
test('Safari touch-only input opens battle bar settings without preventing touch release',()=>{
 const e=setup(),slot=touchSlot(e);e.document.documentElement.classList.add('touch');
 assert(!safariTouch(e,slot,'touchstart').defaultPrevented);e.tick(550);assert(e.document.querySelector('#ro-ap-menu'));
 assert(!safariTouch(e,slot,'touchend').defaultPrevented);assert(pointer(e,slot,'click').defaultPrevented);
 e.document.querySelector('#ro-ap-menu button').click();assert.equal(e.api.getRules().length,1);
 safariTouch(e,slot,'touchstart');safariTouch(e,slot,'touchmove',{clientX:130});e.tick(600);assert(!e.document.querySelector('#ro-ap-menu'));
 safariTouch(e,slot,'touchstart');safariTouch(e,slot,'touchcancel');e.tick(600);assert(!e.document.querySelector('#ro-ap-menu'));
});
test('Safari combined pointer and touch events create one hold and lost release expires',()=>{
 const e=setup(),slot=touchSlot(e);pointer(e,slot,'pointerdown');safariTouch(e,slot,'touchstart');e.tick(550);
 const menu=e.document.querySelector('#ro-ap-menu');assert(menu);assert(!pointer(e,slot,'pointerup').defaultPrevented);assert(!safariTouch(e,slot,'touchend').defaultPrevented);
 assert.equal(e.document.querySelector('#ro-ap-menu'),menu);
 safariTouch(e,slot,'touchstart');pointer(e,slot,'pointerdown');e.tick(550);assert(e.document.querySelector('#ro-ap-menu'));
 e.tick(1201);assert(!pointer(e,slot,'click').defaultPrevented,'a lost release must never leave an infinite click interceptor');
});
test('Safari auto selection hides matching choices and manual input still cancels pending automation',()=>{
 for(const kind of ['skill','item']){
  const e=setup();e.document.documentElement.classList.add('touch');e.api.setRules([rule(kind,'A','a.png')]);
  const cards=picker(e,[['A','a.png','稀有'],['B','b.png','普通'],['C','c.png','普通']],kind);let picks=0;cards[1].onclick=()=>picks++;
  e.api.scan();assert(e.document.querySelector('#picker').hasAttribute('data-ro-ap-hidden'));
  e.api.scan();assert(e.document.querySelector('#picker').hasAttribute('data-ro-ap-hidden'),'rescanning must keep the pending automatic choice hidden');
  assert(!safariTouch(e,cards[1],'touchstart').defaultPrevented);assert(!safariTouch(e,cards[1],'touchend').defaultPrevented);assert(!pointer(e,cards[1],'click').defaultPrevented);assert.equal(picks,1);
  e.tick(6000);assert(!e.document.querySelector('#picker').hasAttribute('data-ro-ap-hidden'));assert.equal(picks,1);
 }
});
test('Safari unmatched choices remain manual and stalled automatic choices become visible',()=>{
 const e=setup();e.document.documentElement.classList.add('touch');e.api.setRules([rule('skill','A','a.png')]);
 picker(e,[['B','b.png','普通']]);e.api.scan();assert(!e.document.querySelector('#picker').hasAttribute('data-ro-ap-hidden'));
 picker(e,[['A','a.png','稀有']]);e.api.scan();assert(e.document.querySelector('#picker').hasAttribute('data-ro-ap-hidden'));
 e.tick(5200);assert(!e.document.querySelector('#picker').hasAttribute('data-ro-ap-hidden'));
 e.api.scan();assert(!e.document.querySelector('#picker').hasAttribute('data-ro-ap-hidden'));
});

test('held touch cannot cancel unrelated native buttons or release events',()=>{
 const e=setup(),slot=touchSlot(e);pointer(e,slot,'pointerdown');e.tick(550);
 e.document.body.insertAdjacentHTML('beforeend','<button id="native-settings">遊戲設定</button>');const native=e.document.querySelector('#native-settings');let clicks=0;native.onclick=()=>clicks++;
 assert(!pointer(e,native,'pointerup').defaultPrevented);assert(!safariTouch(e,native,'touchend').defaultPrevented);assert(!pointer(e,native,'click').defaultPrevented);assert.equal(clicks,1);
});
test('HUD rendering failure cannot escape native game tick or stop other helper actions',()=>{
 const e=setup();e.document.body.insertAdjacentHTML('beforeend','<div id="hud"></div><div id="loot-rolls"></div>');let calls=0;
 const game={state:'playing',lootUntil:1,player:{dead:false},get enemies(){throw new Error('simulated monster data failure');},vacuum(){calls++;}};
 assert.doesNotThrow(()=>e.api.helperTick(game));assert.equal(calls,1);
 e.tick(300);assert.doesNotThrow(()=>e.api.helperTick(game));assert.equal(calls,1);
});
test('without auto rules consecutive native chests retain callback, markup and touch events',()=>{
 const e=setup();e.document.documentElement.classList.add('touch');let opens=0,picks=0;
 const game={events:{onChest(cards,cost){assert.equal(this,game.events);assert.equal(cost,25);opens++;const buttons=picker(e,[['生命藥水 +'+opens,'p.png','普通']],'item');buttons[0].onclick=()=>picks++;return buttons[0];}},chooseChest(){throw Error('no automatic choice expected');}};
 e.api.installFastChoice(game);
 for(let i=0;i<3;i++){
  const cards=[{slot:'potion',item:'hp',quality:0}],button=game.events.onChest(cards,25),callback=button.onclick,markup=e.document.querySelector('#pk-cards').innerHTML;
  e.document.querySelector('#skill-tip').className='';e.api.scan();
  for(const type of ['pointerdown','pointerup'])assert(!pointer(e,button,type).defaultPrevented);
  for(const type of ['touchstart','touchend'])assert(!safariTouch(e,button,type).defaultPrevented);
  assert.equal(e.document.querySelector('#pk-cards').innerHTML,markup);assert.equal(button.onclick,callback);assert.equal(button.dataset.roApKind,undefined);
  assert.equal(e.document.querySelector('#skill-tip').className,'');assert(!e.document.querySelector('#picker').hasAttribute('data-ro-ap-hidden'));
  assert(!pointer(e,button,'click').defaultPrevented);assert.equal(picks,i+1);
 }
 assert.equal(opens,3);
});
test('Escape restores current choice and prevents immediate reselection',()=>{
  const e=setup();e.api.setRules([rule('skill','A','a.png')]);
  const c=picker(e,[['A','a.png','稀有'],['C','c.png','普通'],['D','d.png','傳說']]);
  let clicks=0;c[0].onclick=()=>clicks++;
  e.api.scan();const ev=new e.window.Event('keydown');ev.key='Escape';e.document.dispatchEvent(ev);
  e.api.scan();e.tick(2000);assert.equal(clicks,0);assert(!e.document.querySelector('#picker').hasAttribute('data-ro-ap-hidden'));
});
test('rejected clicks time out visibly and remain manual',()=>{
  const e=setup();e.api.setRules([rule('skill','A','a.png')]);
  picker(e,[['A','a.png','稀有'],['C','c.png','普通'],['D','d.png','傳說']]);
  e.api.scan();e.tick(5200);e.api.scan();assert(!e.document.querySelector('#picker').hasAttribute('data-ro-ap-hidden'));
});
test('consecutive level-up choices each select once',()=>{
  const e=setup();e.api.setRules([rule('skill','A','a.png')]);let clicks=0;
  for(let i=0;i<2;i++) {
    const c=picker(e,[['A','a.png','稀有'],['C','c.png','普通'],['D','d.png','傳說']]);
    c[0].onclick=()=>{clicks++;e.document.querySelector('#picker').classList.add('closing');};
    e.api.scan();e.tick(800);
    e.document.querySelector('#picker').className='hidden';e.api.scan();
  }
  assert.equal(clicks,2);
});
test('run HUD lifecycle clears rules and green markers',()=>{
  const e=setup();e.document.body.insertAdjacentHTML('beforeend','<div id="hud"></div>');
  const hud=e.document.querySelector('#hud');
  e.api.setRules([rule('skill','A','a.png')]);
  e.mutations([{type:'attributes',target:hud,attributeName:'class',oldValue:'hidden',addedNodes:[]}]);
  assert.equal(e.api.getRules().length,0);
  assert.equal(e.storage.size,0);
});
test('victory magnet only triggers after victory, once per run',()=>{
  const e=setup();let calls=0;
  const game={lootUntil:-1,player:{dead:false},vacuum(){calls++;}};
  e.api.victoryMagnet(game);assert.equal(calls,0);
  game.lootUntil=900;e.api.victoryMagnet(game);e.api.victoryMagnet(game);assert.equal(calls,1);
  e.api.victoryMagnet({...game});assert.equal(calls,2);
});
test('victory magnet skips dead players, story and endless modes',()=>{
  const e=setup();let calls=0;
  for(const extra of [{player:{dead:true}},{isStory:true},{endless:{}},{lootUntil:undefined}])
    e.api.victoryMagnet({lootUntil:900,player:{dead:false},vacuum(){calls++;},...extra});
  assert.equal(calls,0);
});
test('party client requests gear/card/egg through normal host pickup once',()=>{
  const e=setup();const takes=[];
  const game={lootUntil:900,player:{dead:false},coop:{replica:true,take:p=>takes.push(p.kind)},
    pickups:[{kind:'loot'},{kind:'card'},{kind:'egg'},{kind:'loot',dead:true},{kind:'chest'},{kind:'meat'}]};
  e.api.victoryMagnet(game);e.api.victoryMagnet(game);assert.deepEqual(takes,['loot','card','egg']);
});
test('basic attack supports right-click enable, green marker, auto-pick and disable',()=>{
  const e=setup();
  e.document.querySelector('#skillbar').innerHTML='<div class="skill-slot basic" data-skill="basic_sword"><img src="sword.png"></div>';
  const el=e.document.querySelector('.basic');
  el.addEventListener('mouseover',()=>{
    const tip=e.document.querySelector('#skill-tip');tip.className='';
    tip.innerHTML='<div class="st-head"><img src="sword.png"><b>普通攻擊 <span class="ro-orig">(Basic Attack)</span></b></div>';
  });
  const event={target:el,clientX:50,clientY:50,preventDefault(){},stopImmediatePropagation(){}};
  e.api.context(event);assert.equal(e.document.querySelector('#ro-ap-menu button').textContent,'開啟自動選擇');
  e.document.querySelector('#ro-ap-menu button').click();
  assert.equal(e.api.getRules()[0].id,'basic_sword');assert(el.hasAttribute('data-ro-ap-enabled'));
  const cards=picker(e,[['普通攻擊','sword.png','史詩'],['C','c.png','普通'],['D','d.png','傳說']]);
  assert.equal(e.api.choose(cards,'skill').card,cards[0]);
  let clicks=0;cards[0].onclick=()=>{clicks++;e.document.querySelector('#picker').classList.add('closing');};
  e.api.scan();e.tick(800);assert.equal(clicks,1);
  e.api.context(event);assert.equal(e.document.querySelector('#ro-ap-menu button').textContent,'關閉自動選擇');
  e.document.querySelector('#ro-ap-menu button').click();assert.equal(e.api.getRules().length,0);
  assert(!el.hasAttribute('data-ro-ap-enabled'));
});
test('fast skill choice skips original picker and preserves rarity/left priority',()=>{
  const e=setup();let shown=0;const picked=[];
  const game={events:{onLevelUp(){shown++;}},choose:c=>picked.push(c),player:{dead:false},state:'levelup'};
  e.api.installFastChoice(game);e.api.setRules([{kind:'skill',id:'a'},{kind:'skill',id:'b'}]);
  const cards=[{id:'a',rarity:3},{id:'b',rarity:3},{id:'c',rarity:4}];
  game.events.onLevelUp(cards);assert.equal(shown,0);assert.equal(picked[0],cards[0]);
  e.api.setRules([]);game.events.onLevelUp(cards);assert.equal(shown,1);
});
test('fast chest matches actual item id and skips all picker animation',()=>{
  const e=setup();let shown=0;const picked=[];
  const game={events:{onChest(){shown++;}},chooseChest:c=>picked.push(c),player:{dead:false},state:'chest',runItems:{slots:new Map([['potion',{item:'p_area'}]])}};
  e.api.installFastChoice(game);e.api.setRules([{kind:'item',id:'potion',itemId:'p_area'}]);
  const cards=[{slot:'potion',item:'p_reach',quality:4},{slot:'potion',item:'p_area',quality:2},{slot:'elixir',item:'e_hp',quality:4}];
  game.events.onChest(cards,50);assert.equal(shown,0);assert.equal(picked[0],cards[1]);
});
test('mobile matching choices bypass each native window while unmatched choices stay manual',()=>{
 const e=setup();e.document.documentElement.classList.add('touch');let shown=0;const chosen=[];
 const game={events:{onLevelUp(){shown++;},onChest(){shown++;}},choose:card=>chosen.push(card),chooseChest:card=>chosen.push(card),runItems:{slots:new Map([['potion',{item:'hp'}]])},player:{dead:false},state:'levelup'};
 e.api.installFastChoice(game);e.api.setRules([{kind:'skill',id:'bash'},{kind:'item',id:'potion',itemId:'hp'}]);
 for(let n=0;n<3;n++){const skill={id:'bash',rarity:n},item={slot:'potion',item:'hp',quality:n};game.events.onLevelUp([skill,{id:'other',rarity:4}]);game.events.onChest([item],25);assert.equal(chosen[n*2],skill);assert.equal(chosen[n*2+1],item);}
 assert.equal(shown,0);assert(e.document.querySelector('#picker').classList.contains('hidden'));
 game.events.onLevelUp([{id:'other',rarity:4}]);assert.equal(shown,1);
 game.runItems.slots.set('potion',{item:'other'});game.events.onChest([{slot:'potion',item:'hp',quality:4}],25);assert.equal(shown,2);
});
test('event bridge returning fresh function references never wraps a callback every tick',()=>{
 const e=setup();let shown=0,writes=0,current=function(){shown++;};
 const events={};Object.defineProperty(events,'onLevelUp',{configurable:true,get(){return current.bind(events);},set(fn){writes++;current=fn;}});
 const game={events,choose(){},player:{dead:false}};
 for(let i=0;i<2000;i++)e.api.installFastChoice(game);
 assert.equal(writes,1,'a changed function reference must not create another wrapper');
 assert.doesNotThrow(()=>game.events.onLevelUp([{id:'other',rarity:1}]));assert.equal(shown,1);
});
test('fast hook installs late callbacks once and leaves native callback replacements alone',()=>{
 const e=setup();let shown=0,picks=0;const game={events:{},choose(){picks++;},player:{dead:false}};
 e.api.installFastChoice(game);e.api.setRules([{kind:'skill',id:'bash'}]);
 game.events.onLevelUp=()=>shown++;e.api.installFastChoice(game);const first=game.events.onLevelUp;
 e.api.installFastChoice(game);assert.equal(game.events.onLevelUp,first);game.events.onLevelUp([{id:'bash',rarity:1}]);assert.equal(picks,1);assert.equal(shown,0);
 const replacement=()=>shown++;game.events.onLevelUp=replacement;
 for(let i=0;i<100;i++)e.api.installFastChoice(game);assert.equal(game.events.onLevelUp,replacement);
 game.events.onLevelUp([{id:'bash',rarity:1}]);assert.equal(shown,1);assert.equal(picks,1);
 const events={onLevelUp:()=>shown++};game.events=events;e.api.installFastChoice(game);assert.equal(game.events,events);assert.equal(game.events.onLevelUp,events.onLevelUp);
 game.events.onLevelUp([{id:'bash',rarity:1}]);assert.equal(shown,2);assert.equal(picks,1);
});
test('swordsman with four skill slots auto-picks basic attack from 1/2/3 offers',()=>{
  for(const n of [1,2,3]) {
    const e=setup();let shown=0;const picked=[];
    const game={maxSkills:4,basicAttack:'atk_sword',slots:['bash','magnum','endure','hp_recovery'],
      events:{onLevelUp(){shown++;}},choose:c=>picked.push(c),player:{dead:false},state:'levelup'};
    e.api.installFastChoice(game);e.api.setRules([{kind:'skill',id:'atk_sword'}]);
    const cards=[{id:'atk_sword',rarity:2},{id:'bash',rarity:4},{id:'magnum',rarity:3}].slice(0,n);
    game.events.onLevelUp(cards);assert.equal(shown,0);assert.equal(picked[0],cards[0]);
  }
});
test('DOM fallback selects basic attack when only one or two cards exist',()=>{
  for(const n of [1,2]) {
    const e=setup();e.api.setRules([rule('skill','普通攻擊','sword.png')]);
    const c=picker(e,[['普通攻擊','sword.png','稀有'],['狂擊','bash.png','傳說']].slice(0,n));
    let clicked=0;c[0].onclick=()=>{clicked++;e.document.querySelector('#picker').classList.add('closing');};
    e.api.scan();e.tick(800);assert.equal(clicked,1);
  }
});
test('basic fallback resolves game skill ID despite changed icon and stored label',()=>{
  const e=setup();const game={events:{},skillDef:id=>id==='atk_sword'?{name:'攻擊：劍'}:null};
  e.api.installFastChoice(game);e.api.setRules([{kind:'skill',id:'atk_sword',name:'舊名稱',icon:'https://ro.hans-webgametw.com/old-sword.png'}]);
  const cards=picker(e,[['攻擊：劍','new-sword.png','史詩'],['狂擊','bash.png','傳說']]);
  assert.equal(e.api.choose(cards,'skill').card,cards[0]);
});
test('authoritative offer ID overrides misleading text/icon in fallback',()=>{
  const e=setup();e.api.setRules([{kind:'skill',id:'atk_sword',name:'攻擊：劍',icon:'old.png'}]);
  const cards=picker(e,[['另一個名稱','new.png','不認識的品質']]);
  Object.assign(cards[0].dataset,{roApKind:'skill',roApId:'atk_sword',roApQuality:'2'});
  assert.equal(e.api.choose(cards,'skill').card,cards[0]);
});
test('actual game uncommon and common colors work without recognized labels',()=>{
  const e=setup();const cards=picker(e,[['A','a.png',''],['B','b.png','']]);
  cards[0].closest('.pk-slot').style.setProperty('--q','#3ddc5a');
  cards[1].closest('.pk-slot').style.setProperty('--q','#f2f2f2');
  assert.equal(e.api.rank(cards[0]),1);assert.equal(e.api.rank(cards[1]),0);
});
function smithFixture(e) {
  const defs={1101:{slot:'weapon',wtype:'검'},1163:{slot:'weapon',wtype:'양손검'},1701:{slot:'weapon',wtype:'활'},2101:{slot:'shield'},2254:{slot:'head_top'},2301:{slot:'armor'},2501:{slot:'garment'},2401:{slot:'shoes'}};
  const manifest={items:Object.fromEntries(Object.keys(defs).map(id=>[id,{icon:`items/${id}.png`}] ))};
  e.api.setSmithData(defs,{manifest});
  e.document.body.insertAdjacentHTML('beforeend','<div id="smith"><div id="smith-filters"></div><div id="smith-list"></div></div>');
  let inventory=Object.keys(defs);
  function render(category='all') {
    e.document.querySelector('#smith-filters').innerHTML=['all','weapon','armor'].map(id=>`<button class="inv-chip ${id===category?'active':''}" data-f="${id}">${id}</button>`).join('');
    for(const b of e.document.querySelectorAll('#smith-filters [data-f]')) b.onclick=()=>render(b.dataset.f);
    e.document.querySelector('#smith-list').innerHTML=inventory.filter(id=>category==='all'||(defs[id].slot==='weapon')===(category==='weapon')).map(id=>`<div class="cand" data-uid="uid-${id}"><div class="ico"><img src="assets/items/${id}.png"></div><div class="cand-info"><small>已裝備</small></div></div>`).join('');
  }
  render();e.api.updateSmith();
  return {render, remove:id=>{inventory=inventory.filter(x=>x!==String(id));}};
}
test('Safari town touch resumes skipped smith and starforge controls without another mutation',()=>{
 const e=setup();smithFixture(e);e.document.querySelector('[data-ro-smith-extra]').remove();
 const d=e.document;d.documentElement.classList.add('touch');
 d.body.insertAdjacentHTML('beforeend','<div id="starforge"><div class="sf-top"></div><div id="sf-list"><div class="cand" data-uid="star"><div class="ico"><img src="assets/items/2101.png"></div></div></div><div id="sf-detail"></div><button id="sf-go"></button></div>');
 safariTouch(e,d.body,'touchstart');e.api.scan();
 e.tick(1500);assert(!d.querySelector('[data-ro-smith-extra]'));assert(!d.querySelector('[data-ro-star-filters]'),'never refresh during an active gesture');
 safariTouch(e,d.body,'touchend');e.api.scan();e.tick(999);
 assert(!d.querySelector('[data-ro-smith-extra]'));
 e.tick(1);assert.equal(d.querySelectorAll('[data-ro-smith-category]').length,7);
 assert.equal(d.querySelector('[data-ro-star-category="shield"] small').textContent,'1');
 const extras=d.querySelector('[data-ro-smith-extra]');
 safariTouch(e,d.body,'touchstart');safariTouch(e,d.body,'touchcancel');e.tick(1000);
 assert.equal(d.querySelector('[data-ro-smith-extra]'),extras,'cancelled touches recover without duplicate controls');
});
test('smith shows unmodified GS copies and preserves native equipment through redraws',()=>{
  const e=setup();smithFixture(e);
  e.document.querySelector('#smith').insertAdjacentHTML('beforeend','<div id="smith-detail"><span class="gs">GS <b>184</b></span><div class="ref-ore"><span class="pct">100%</span></div><div class="ref-ladder">'+Array.from({length:10},(_,i)=>'<span class="'+(i<4?'done':'')+'">+'+(i+1)+'<b>100%</b></span>').join('')+'</div></div>');
  vm.runInContext(`
    globalThis.smithGear=[
      {uid:'refined',itemId:1101,refine:4,star:3,cards:[4001,null],tier:2,quality:4,affixes:[{stat:'str',value:3}]},
      {uid:'plain',itemId:1101,refine:0,star:0,cards:[null]},
      {uid:'star',itemId:1101,star:2,cards:[]},
      {uid:'card',itemId:1101,cards:[4001]}
    ];
    globalThis.originalSmithFilter=Array.prototype.filter;
    globalThis.drawSmith=()=>{
      const items=smithGear.filter(x=>true);
      document.querySelector('#smith-list').innerHTML=items.map(x=>'<div class="cand '+(x.uid==='refined'?'sel':'')+'" data-uid="'+x.uid+'"><div class="ico"><img src="assets/items/1101.png"></div><span class="gs">GS <b>'+(100+(x.tier||0)+(x.quality||0)+(x.affixes?.[0]?.value||0)+(x.refine||0)*10+(x.star||0)*5+x.cards.filter(Boolean).length*20)+'</b></span></div>').join('');
    };
    document.querySelector('#smith-filters [data-f="all"]').onclick=drawSmith;
    drawSmith();
  `,e.vmContext);
  const before=vm.runInContext('JSON.stringify(smithGear)',e.vmContext);
  e.api.updateSmith();
  const score=uid=>e.document.querySelector('[data-uid="'+uid+'"] .gs');
  assert.equal(score('refined').textContent,'GS 184 (109)');
  assert.deepEqual([...e.document.querySelectorAll('#smith-detail .ref-ladder [data-ro-gs-gain]')].map(n=>n.textContent),['GS +10','GS +20','GS +30','GS +40','GS +50','GS +60']);
  assert.equal(e.document.querySelector('#smith-detail .ref-ore [data-ro-gs-gain]'),null);
  assert.equal(score('plain').textContent,'GS 100');
  assert.equal(score('star').textContent,'GS 110 (100)');
  assert.equal(score('card').textContent,'GS 120 (100)');
  assert.equal(e.document.querySelector('#smith-detail .gs').textContent,'GS 184 (109)');
  const html=e.document.querySelector('#smith').innerHTML;
  e.api.updateSmith();assert.equal(e.document.querySelector('#smith').innerHTML,html);
  vm.runInContext('smithGear[0].refine=5;drawSmith()',e.vmContext);e.api.updateSmith();
  assert.equal(score('refined').textContent,'GS 194 (109)');
  assert.equal(e.document.querySelectorAll('#smith-detail [data-ro-smith-base-gs]').length,1);
  vm.runInContext('smithGear[0].refine=8;drawSmith()',e.vmContext);
  e.document.querySelector('#smith-detail .gs b').textContent='224';
  [...e.document.querySelector('.ref-ladder').children].forEach((node,index)=>node.classList.toggle('done',index<8));
  e.api.updateSmith();
  assert.deepEqual([...e.document.querySelectorAll('#smith-detail [data-ro-gs-gain]')].map(n=>n.textContent),['GS +10','GS +20'],'+9 and +10 compare with the current +8');
  assert.equal(e.document.querySelector('#smith-detail [data-ro-gs-gain]').style.fontSize,'10px');
  vm.runInContext('smithGear[0].refine=4',e.vmContext);
  assert.equal(vm.runInContext('JSON.stringify(smithGear)',e.vmContext),before);
  assert(vm.runInContext('Array.prototype.filter===originalSmithFilter',e.vmContext));
});
test('smith categories use native item IDs when artwork is unavailable or shared',()=>{
  const e=setup();smithFixture(e);
  e.api.setSmithData({1101:{slot:'weapon',wtype:'검'},2101:{slot:'shield'}},null);
  vm.runInContext(`
    globalThis.smithGear=[{uid:'a',itemId:1101,cards:[]},{uid:'b',itemId:2101,cards:[]}];
    globalThis.drawSmith=()=>{document.querySelector('#smith-list').innerHTML=smithGear.filter(x=>true).map(x=>'<div class="cand" data-uid="'+x.uid+'"><div class="ico"><img src="blob:shared"></div><span class="gs"><b>100</b></span></div>').join('');};
    document.querySelector('#smith-filters [data-f="all"]').onclick=drawSmith;drawSmith();
  `,e.vmContext);
  const before=vm.runInContext('JSON.stringify(smithGear)',e.vmContext);e.api.updateSmith();
  assert.equal(e.document.querySelector('[data-ro-smith-category="onehand"] small').textContent,'1');
  assert.equal(e.document.querySelector('[data-ro-smith-category="shield"] small').textContent,'1');
  e.document.querySelector('[data-ro-smith-category="shield"]').click();
  assert(e.document.querySelector('[data-uid="a"]').hasAttribute('data-ro-smith-filtered'));
  assert(!e.document.querySelector('[data-uid="b"]').hasAttribute('data-ro-smith-filtered'));
  assert.equal(vm.runInContext('JSON.stringify(smithGear)',e.vmContext),before);
});
test('native starforge displays base GS without resetting selection, confirmation or result text',()=>{
  const e=setup();smithFixture(e);
  const native=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/starforge-native.json'),'utf8'));
  e.document.querySelector('#smith').insertAdjacentHTML('beforeend','<button id="smith-star">升星</button>');
  vm.runInContext(`
    globalThis.pendingStar=[];queueMicrotask=fn=>pendingStar.push(fn);
    globalThis.starGear=[{uid:'s1',itemId:1101,star:5,refine:3,cards:[4001],quality:4,tier:2,affixes:[{stat:'str',value:3}]},{uid:'s2',itemId:1101,cards:[],quality:4,affixes:[{stat:'str',value:1}]}];
    globalThis.starCalls=0;
    globalThis.starNativeG={
      C:{CSS:'',max:10,step:1.05,low:5,ore:{weapon:[1,2],armor:[3,4]},rore:{weapon:[5,6],armor:[5,6]},oreName:{},rfee:1},
      ze:()=>({id:'c',inventory:starGear}),ye:()=>({1101:{slot:'weapon'}}),blocked:()=>new Set(),vis:()=>true,worn:()=>false,
      gs:x=>100+(x.refine||0)*10+(x.star||0)*5+x.cards.filter(Boolean).length*20+(x.tier||0)+(x.affixes?.[0]?.value||0),
      os:x=>x.uid,img:()=>'',qc:()=>'',ma:()=>({atk:0,matk:0,def:0}),go:()=>[],cn:()=>[],aff:()=>[],
      et:()=>({materials:{1:100,2:100,5:100},kafra:100000}),ut:String,oe:()=>({4:{name:'傳說'}}),
      ue:id=>document.getElementById(id).classList.remove('hidden'),ce:id=>document.getElementById(id).classList.add('hidden'),
      rr:()=>true,wa:()=>{},snd:()=>{},uc:()=>{starCalls++;throw Error('must not send requests');}
    };
  `,e.vmContext);
  vm.runInContext(native.runtime+'(starNativeG);RO_SF.smith("c");document.getElementById("smith-star").onclick=RO_SF.open;',e.vmContext);
  e.api.updateSmith();e.document.querySelector('#smith-star').click();
  const score=()=>e.document.querySelector('#sf-detail .gs').textContent;
  assert.equal(score(),'GS 180 (105)');
  assert.deepEqual([...e.document.querySelectorAll('#sf-detail .ref-ladder [data-ro-gs-gain]')].map(n=>n.textContent),['GS +5','GS +10','GS +15','GS +20','GS +25']);
  assert.equal(e.document.querySelector('#sf-detail .ref-ore [data-ro-gs-gain]'),null);
  assert.equal(e.document.querySelector('#sf-detail [data-ro-gs-gain]').style.color,'#183b70');
  assert.equal(e.document.querySelector('#sf-list [data-uid="s2"] .gs').textContent,'GS 101');
  e.document.querySelector('#sf-go').click();e.api.updateSmith();
  assert.equal(e.document.querySelector('#sf-go').textContent,'確定？再按一次');
  assert.equal(score(),'GS 180 (105)');
  const html=e.document.querySelector('#starforge').innerHTML;e.api.updateSmith();assert.equal(e.document.querySelector('#starforge').innerHTML,html);
  assert.equal(vm.runInContext('starCalls',e.vmContext),0);
  e.document.querySelector('#sf-list [data-uid="s2"]').click();e.api.updateSmith();
  assert.equal(score(),'GS 101');
  e.document.querySelector('#sf-list [data-uid="s1"]').click();e.api.updateSmith();assert.equal(score(),'GS 180 (105)');
  e.document.querySelector('[data-sft="reroll"]').click();e.api.updateSmith();
  assert.equal(e.document.querySelector('#sf-detail [data-ro-gs-gain]'),null);
  e.document.querySelector('[data-aff="0"]').click();e.api.updateSmith();assert.equal(score(),'GS 180 (105)');
  assert.equal(e.document.querySelectorAll('#sf-detail [data-ro-smith-base-gs]').length,1);
  vm.runInContext('starGear[0].star=10',e.vmContext);
  e.document.querySelector('[data-sft="star"]').click();e.api.updateSmith();
  assert.equal(e.document.querySelectorAll('#sf-detail .ref-ladder [data-ro-gs-gain]').length,0,'max stars have no higher levels');
  vm.runInContext('pendingStar.splice(0).forEach(fn=>fn())',e.vmContext);
});
test('smith adds all detailed categories and accurate counts from game definitions',()=>{
  const e=setup();smithFixture(e);
  assert.equal(e.document.querySelectorAll('[data-ro-smith-category]').length,7);
  assert.equal(e.document.querySelector('[data-ro-smith-category="twohand"] small').textContent,'2');
  assert.equal(e.document.querySelector('[data-ro-smith-category="onehand"] small').textContent,'1');
  assert.equal(e.document.querySelector('[data-ro-smith-category="shield"] small').textContent,'1');
  assert.equal(e.document.querySelector('[data-ro-smith-category="head_mid"]'),null);
  assert.equal(e.document.querySelector('[data-ro-smith-category="head_low"]'),null);
  assert.equal(e.document.querySelector('[data-ro-smith-category="acc"]'),null);
  assert(e.document.querySelector('[data-ro-smith-category="head_top"]').textContent.startsWith('頭部（上）'));
});
test('smith subfilter survives redraw and native All restores list',()=>{
  const e=setup();const f=smithFixture(e);
  e.document.querySelector('[data-ro-smith-category="twohand"]').click();
  let visible=()=>[...e.document.querySelectorAll('#smith-list .cand')].filter(r=>!r.hasAttribute('data-ro-smith-filtered'));
  assert.equal(visible().length,2);
  f.remove(1163);f.render();e.api.updateSmith();assert.equal(visible().length,1);
  assert.equal(e.document.querySelector('[data-ro-smith-category="twohand"] small').textContent,'1');
  e.document.querySelector('[data-f="all"]').click();e.api.updateSmith();assert.equal(visible().length,7);
});
test('smith detailed controls stay mounted and selection redraw reapplies filters synchronously',()=>{
  const e=setup(),f=smithFixture(e),extras=e.document.querySelector('[data-ro-smith-extra]');
  let redraws=0;
  const row=e.document.querySelector('#smith-list .cand');
  row.onclick=()=>{redraws++;f.render();};e.api.updateSmith();
  const category=e.document.querySelector('[data-ro-smith-category="twohand"]');
  category.click();assert.equal(e.document.querySelector('#smith-list .cand'),row,'subfilter must not redraw an already complete list');
  row.click();assert.equal(redraws,1);
  assert.equal(e.document.querySelector('[data-ro-smith-extra]'),extras,'native redraw must not remove helper controls');
  assert.equal(e.document.querySelector('[data-ro-smith-category="twohand"]'),category,'touch target remains the same node');
  assert(category.classList.contains('active'));
  const visible=[...e.document.querySelectorAll('#smith-list .cand')].filter(row=>!row.hasAttribute('data-ro-smith-filtered'));
  assert.equal(visible.length,2,'native equipment click keeps subfilter without waiting for observer');
});
test('smith reopening resets detailed filter and does not alter row handlers',()=>{
  const e=setup();smithFixture(e);let selected=0;
  const row=e.document.querySelector('#smith-list .cand');row.onclick=()=>selected++;
  e.api.updateSmith();row.click();assert.equal(selected,1);
  e.document.querySelector('[data-ro-smith-category="shield"]').click();
  e.document.querySelector('#smith').classList.add('hidden');e.api.updateSmith();
  e.document.querySelector('#smith').classList.remove('hidden');e.api.updateSmith();
  assert.equal(e.document.querySelectorAll('#smith-list [data-ro-smith-filtered]').length,0);
});
function catalogEnv(){const e=setup();e.api.setSmithData({1202:{slot:'weapon',wtype:'단검'},1163:{slot:'weapon',wtype:'양손검'},2101:{slot:'shield'},2301:{slot:'armor'}},{manifest:{items:{}}});return e;}
const gearItem=(overrides={})=>({uid:'gear',itemId:1202,tier:1,quality:4,affixes:[],...overrides});
const gearSettings=(overrides={})=>({first:[],second:[],third:[],fourth:[],skills:[],...overrides});
function setDetail(c,id,d){c.filters=[{...d,id:'test-detail',name:'測試細項'}];c.assignments[id]='test-detail';}
test('catalog defaults keep everything and tier exclusion is exact per equipment',()=>{
  const e=catalogEnv(),c=e.api.emptyEquipmentFilter();assert(e.api.validEquipmentFilter(c));assert(!e.api.isUnwantedEquipment(c,gearItem()));
  e.api.setEquipmentTier(c,[1202],1,false);assert(e.api.isUnwantedEquipment(c,gearItem()));
  assert(!e.api.isUnwantedEquipment(c,gearItem({tier:2})));assert(!e.api.isUnwantedEquipment(c,gearItem({itemId:2101})));
  e.api.setEquipmentTier(c,[1202],1,true);assert(!e.api.isUnwantedEquipment(c,gearItem()));
});
test('catalog excludes selected rarities and all low tiers across categories',()=>{
  const e=catalogEnv(),c=e.api.emptyEquipmentFilter();c.unwantedRarities=['0','2'];
  assert(e.api.isUnwantedEquipment(c,gearItem({quality:0})));assert(e.api.isUnwantedEquipment(c,gearItem({quality:2})));
  assert(!e.api.isUnwantedEquipment(c,gearItem({quality:4})));
  e.api.excludeEquipmentTiers(c,2);assert(c.disabledTiers['1202:1']);assert(c.disabledTiers['2102:2']);assert(!c.disabledTiers['1163:3']);
});
test('multi-lap gear exposes T4 through T8, bulk exclusions stop below highest and persist',()=>{
  const e=catalogEnv(),seen=[];
  e.api.setSmithData({1202:{slot:'weapon',wtype:'단검',bonuses:[]}},{manifest:{items:{}}});
  e.api.setGameCatalog({bs:(id,tier)=>{seen.push(tier);return [{text:()=>`實際 T${tier} 屬性`}];}});
  e.api.openFilter();
  const card=e.document.querySelector('[data-gear-id="1202"]');
  assert.deepEqual([...card.querySelectorAll('[data-gear-tier]')].map(b=>b.dataset.gearTier),['1','4','5','6','7','8']);
  assert(card.textContent.includes('實際 T4 屬性'));assert(card.textContent.includes('實際 T5 屬性'));assert(seen.includes(8));const sources=card.querySelector('.ro-gear-sources');assert(sources.textContent.includes('波利'));assert(!sources.closest('details'));assert(!/T[1-8]|周目/.test(sources.textContent));assert.equal(card.querySelector('summary').textContent,'各階屬性');
  assert.deepEqual([...e.document.querySelectorAll('[data-exclude-tier-select] option')].map(b=>b.value),['1','2','3','4','5','6','7']);
  const cutoff=e.document.querySelector('[data-exclude-tier-select]');cutoff.querySelector('[value="7"]').selected=true;cutoff.onchange();
  assert(!e.api.getFilterDraft().disabledTiers['1163:7'],'selecting a cutoff does not apply changes');
  e.document.querySelector('[data-exclude-tier-apply]').click();
  assert.equal(e.document.querySelectorAll('[data-exclude-tier-apply]').length,1);assert.equal(e.document.querySelector('[data-exclude-tier-select]').value,'7');
  const draft=e.api.getFilterDraft();assert(e.api.validEquipmentFilter(draft));
  assert(e.api.isUnwantedEquipment(draft,gearItem({tier:4})));assert(!e.api.isUnwantedEquipment(draft,gearItem({tier:8})));
  assert(draft.disabledTiers['1163:3']);assert(draft.disabledTiers['1163:4']);assert(draft.disabledTiers['1163:7']);assert(!draft.disabledTiers['1163:8']);
  e.document.querySelector('[data-gear-id="1202"] [data-gear-tier="8"]').click();
  e.document.querySelector('[data-filter-save]').click();assert(e.api.isUnwantedEquipment(e.api.getFilterStore(),gearItem({tier:8})));
  e.api.openFilter();assert.equal(e.document.querySelector('[data-gear-id="1202"] [data-gear-tier="8"]').getAttribute('aria-pressed'),'false');
});
test('catalog primary conditions are OR within a field, AND across fields and require distinct affixes',()=>{
  const e=catalogEnv(),c=e.api.emptyEquipmentFilter();setDetail(c,1202,gearSettings({first:['str','agi'],second:['luk','dex']}));
  assert(!e.api.isUnwantedEquipment(c,gearItem({affixes:[{stat:'luk'},{stat:'agi'}]})));
  assert(e.api.isUnwantedEquipment(c,gearItem({affixes:[{stat:'str'},{stat:'vit'}]})));
  setDetail(c,1202,gearSettings({first:['str'],second:['str']}));assert(e.api.isUnwantedEquipment(c,gearItem({affixes:[{stat:'str'}]})));
});
test('catalog secondary and skill minima combine using raw affixes only and inclusive percent boundary',()=>{
  const e=catalogEnv(),c=e.api.emptyEquipmentFilter();setDetail(c,1202,gearSettings({third:['crit','cd'],fourth:['flee'],skills:[{id:'bash',min:15},{id:'magnum',min:20}]}));
  const affixes=[{stat:'cd'},{stat:'flee'},{stat:'skill',skill:'bash',value:.15}];
  assert(!e.api.isUnwantedEquipment(c,gearItem({affixes})));
  assert(e.api.isUnwantedEquipment(c,gearItem({affixes:affixes.map(a=>a.stat==='skill'?{...a,value:.149}:a)})));
  assert(e.api.isUnwantedEquipment(c,gearItem({affixes:affixes.filter(a=>a.stat!=='flee'),cards:[4001]})));
  assert(!e.api.isUnwantedEquipment(c,gearItem({affixes:[{stat:'crit'},{stat:'flee'},{stat:'skill',skill:'magnum',value:.2}]})));
});
test('unknown gear, unsafe metadata and protected items are retained; invalid configs cannot select anything',()=>{
  const e=catalogEnv(),c=e.api.emptyEquipmentFilter();c.unwantedRarities=['4'];
  for(const patch of [{itemId:999999},{tier:undefined},{tier:NaN},{quality:8},{safe:true},{owner:'char'}])assert(!e.api.isUnwantedEquipment(c,gearItem(patch)));
  setDetail(c,1202,gearSettings({first:['str']}));assert(!e.api.isUnwantedEquipment(c,gearItem({quality:3,affixes:undefined})));
  c.filters[0].skills=[{id:'bash',min:-1}];assert(!e.api.validEquipmentFilter(c));assert(!e.api.isUnwantedEquipment(c,gearItem()));
  c.filters[0].skills=[{id:'bash',min:Infinity}];assert(!e.api.validEquipmentFilter(c));
});
test('catalog UI has handedness tabs, Chinese monster names, explicit tiers, bulk controls and cancel isolation',()=>{
  const e=catalogEnv();e.api.openFilter();const d=e.document;
  assert(d.querySelector('[data-gear-slot="onehand"]'));assert(d.querySelector('[data-gear-slot="twohand"]'));assert(!d.querySelector('[data-gear-slot="weapon"]'));
  const card=d.querySelector('[data-gear-id="1202"]');assert(card);assert(card.textContent.includes('波利'));assert(card.textContent.includes('T1'));
  card.querySelector('[data-gear-tier="1"]').click();assert(e.api.getFilterDraft().disabledTiers['1202:1']);
  assert(!e.api.getFilterStore().disabledTiers['1202:1']);
  d.querySelector('[data-exclude-tier-select] [value="2"]').selected=true;d.querySelector('[data-exclude-tier-apply]').click();
  assert(e.api.getFilterDraft().disabledTiers['2102:2']);
  d.querySelector('[data-gear-slot="twohand"]').click();assert(d.querySelector('.ro-gear-card [data-gear-tier="3"]'));
  e.api.closeFilter();assert(!e.api.getFilterStore().disabledTiers['1202:1']);assert.equal(d.querySelector('#ro-unwanted-dialog'),null);
});
test('weapon subcategories filter cards within handedness and preserve draft settings',()=>{
 const e=catalogEnv();e.api.openFilter();let d=e.document;
 assert(d.querySelector('[aria-label="武器細項分類"]'));d.querySelector('[data-weapon-type="단검"]').click();
 const cards=[...d.querySelectorAll('.ro-gear-card')];assert(cards.length>0);assert(cards.every(c=>e.api.equipmentGroups().find(g=>String(g.records[0].id)===c.dataset.gearId).records[0].wtype==='단검'));
 d.querySelector('[data-gear-id="1202"] [data-gear-tier="1"]').click();
 d.querySelector('[data-gear-slot="twohand"]').click();assert(d.querySelector('[data-weapon-type="활"]'));assert(!d.querySelector('[data-weapon-type="단검"]'));
 d.querySelector('[data-weapon-type="활"]').click();assert(d.querySelectorAll('.ro-gear-card').length>0);assert(e.api.getFilterDraft().disabledTiers['1202:1']);
 d.querySelector('[data-gear-slot="shield"]').click();assert.equal(d.querySelector('[aria-label="武器細項分類"]'),null);
 d.querySelector('[data-gear-slot="onehand"]').click();assert.equal(d.querySelector('[data-weapon-type=""]').getAttribute('aria-pressed'),'true');
});
test('rarity buttons cross out exclusions immediately and no unsaved placeholder is shown',()=>{
 const e=catalogEnv();e.api.openFilter();assert.equal(e.document.querySelectorAll('[data-unwanted-rarity]').length,5);
 assert(!e.document.querySelector('#ro-unwanted-dialog').textContent.includes('設定尚未儲存'));
 e.document.querySelector('[data-unwanted-rarity="2"]').click();assert(e.api.getFilterDraft().unwantedRarities.includes('2'));assert(e.document.querySelector('[data-unwanted-rarity="2"]').classList.contains('excluded'));
 e.document.querySelector('[data-unwanted-rarity="2"]').click();assert(!e.api.getFilterDraft().unwantedRarities.includes('2'));
});
function clickText(root,text){const button=[...root.querySelectorAll('button')].find(b=>b.textContent===text);assert(button,'button '+text);button.click();}
test('named detail manager adds, renames, reorders and cancels without mutating draft',()=>{
 const e=catalogEnv();e.api.openFilter();clickText(e.document,'管理細項過濾器');clickText(e.document,'新增');
 let name=e.document.querySelector('[aria-label="細項過濾器名稱"]');name.value='力量';name.oninput();
 clickText(e.document,'新增');name=e.document.querySelector('[aria-label="細項過濾器名稱"]');name.value='魔法';name.oninput();
 e.document.querySelector('[aria-label="新細項過濾器上移"]').click();
 clickText(e.document,'套用管理設定');assert.equal(e.api.getFilterDraft().filters[0].name,'魔法');assert.equal(e.api.getFilterDraft().filters[1].name,'力量');
 assert.equal(e.api.getFilterStore().filters.length,0);clickText(e.document,'管理細項過濾器');clickText(e.document,'移除');
 clickText(e.document.querySelector('.ro-gear-detail-panel'),'取消');assert.equal(e.api.getFilterDraft().filters.length,2);
});
test('skill multi-select reveals only selected percent rows, validates minima and assigns reusable filters',()=>{
 const e=catalogEnv();e.api.setGameCatalog({bU:()=>['bash','magnum']});e.api.setSkillDefs({bash:{name:'狂擊'},magnum:{name:'怒爆'}});
 e.api.openFilter();clickText(e.document,'管理細項過濾器');clickText(e.document,'新增');let panel=e.document.querySelector('.ro-gear-detail-panel');
 const name=panel.querySelector('[aria-label="細項過濾器名稱"]');name.value='物理配裝';name.oninput();
 const str=panel.querySelector('input[value="str"]');str.checked=true;str.onchange();
 assert.equal(panel.querySelectorAll('.ro-selected-skills input').length,0);
 const skill=panel.querySelector('input[value="bash"]');skill.checked=true;skill.onchange();
 assert.equal(panel.querySelectorAll('.ro-selected-skills input').length,1);assert.equal(panel.querySelector('[aria-label="怒爆傷害最低百分比"]'),null);
 let min=panel.querySelector('[aria-label="狂擊傷害最低百分比"]');min.value='-1';min.oninput();clickText(panel,'套用管理設定');assert(panel.querySelector('.ro-gear-error').textContent);
 min.value='15';min.oninput();clickText(panel,'套用管理設定');
 const select=e.document.querySelector('[data-gear-id="1202"] select');for(const option of select.querySelectorAll('option'))option.selected=option.value===e.api.getFilterDraft().filters[0].id;select.onchange();
 assert.equal(e.api.getFilterDraft().assignments[1202],e.api.getFilterDraft().filters[0].id);
 e.document.querySelector('[data-filter-save]').click();assert(e.storage.has('greydust.ro.unwanted.catalog.v3'));
 e.api.setFilterStore(e.api.emptyEquipmentFilter());e.api.loadFilterStore();const config=e.api.getFilterStore();assert.equal(config.filters[0].skills[0].min,15);
 assert(e.api.isUnwantedEquipment(config,gearItem()));assert(!e.api.isUnwantedEquipment(config,gearItem({affixes:[{stat:'str'},{stat:'skill',skill:'bash',value:.15}]})));
 const imported=e.api.parseFilterImport(JSON.stringify({format:'ro-helper-equipment',settings:config}));assert.equal(imported.assignments[1202],config.filters[0].id);
});
test('migration deduplicates former per-item settings and removal clears every assignment',()=>{
 const e=catalogEnv(),d=gearSettings({first:['str']});const c=e.api.migrateEquipmentFilter({version:2,unwantedRarities:['0'],disabledTiers:{'1202:1':true},details:{1202:d,2102:d}});
 assert.equal(c.filters.length,1);assert.equal(c.assignments[1202],c.assignments[2102]);assert(c.disabledTiers['1202:1']);
 e.api.setFilterStore(c);e.api.openFilter();clickText(e.document,'管理細項過濾器');clickText(e.document,'移除');clickText(e.document,'套用管理設定');assert.equal(Object.keys(e.api.getFilterDraft().assignments).length,0);
});
test('invalid names and dangling assignments are rejected; all keep preserves the reusable library',()=>{
 const e=catalogEnv(),c=e.api.emptyEquipmentFilter();setDetail(c,1202,gearSettings({first:['str']}));e.api.setFilterStore(c);e.api.openFilter();clickText(e.document,'全部保留');assert.equal(e.api.getFilterDraft().filters.length,1);assert.equal(Object.keys(e.api.getFilterDraft().assignments).length,0);
 c.filters[0].name=' ';assert(!e.api.validEquipmentFilter(c));c.filters[0].name='a';c.assignments[1202]='missing';assert(!e.api.validEquipmentFilter(c));
});
function catalogMerchant(e,nativeSelection=null){
  e.document.body.insertAdjacentHTML('beforeend','<div id="shop"><div id="shop-filters"><button class="active" data-f="weapon">武器</button></div><div id="shop-quality"><button data-q="4">傳說</button><button data-q="none">清除</button></div><div id="shop-items"></div><button id="shop-sell">出售</button></div>');
  const inventory=[gearItem({uid:'low'}),gearItem({uid:'safe',safe:true}),gearItem({uid:'worn'}),gearItem({uid:'high',tier:3})];let sells=0;
  const render=()=>{JSON.parse(JSON.stringify({inventory}));const root=e.document.querySelector('#shop-items');root.replaceChildren();for(const item of inventory){const cell=e.document.createElement('div');cell.dataset.uid=item.uid;if(nativeSelection?.has(item.uid))cell.classList.add('picked');if(item.safe)cell.classList.add('safe');if(item.uid==='worn')cell.classList.add('worn');cell.onclick=()=>cell.classList.toggle('picked');root.append(cell);}};
  e.document.querySelector('[data-f="weapon"]').onclick=render;e.document.querySelector('[data-q="none"]').onclick=()=>e.document.querySelectorAll('.picked').forEach(x=>x.classList.remove('picked'));e.document.querySelector('#shop-sell').onclick=()=>sells++;render();return()=>sells;
}
test('merchant selects excluded tiers without selling or selecting worn and protected equipment',()=>{
  const e=catalogEnv(),sells=catalogMerchant(e),c=e.api.emptyEquipmentFilter();e.api.setEquipmentTier(c,[1202],1,false);e.api.setFilterStore(c);
  e.api.updateMerchant();assert(e.document.querySelector('[data-ro-unwanted]'));e.api.selectUnwanted();
  assert.deepEqual([...e.document.querySelectorAll('#shop-items .picked')].map(c=>c.dataset.uid),['low']);assert.equal(sells(),0);
});
test('catalog merchant batch selection uses the original selection Set and restores hooks',()=>{
  const e=catalogEnv(),selection=new Set(['safe','high']),sells=catalogMerchant(e,selection),c=e.api.emptyEquipmentFilter();
  e.api.setEquipmentTier(c,[1202],1,false);e.api.setFilterStore(c);
  const parse=JSON.parse,has=Set.prototype.has;e.api.selectUnwanted();
  assert.deepEqual([...selection],['low']);assert.equal(sells(),0);assert.equal(JSON.parse,parse);assert.equal(Set.prototype.has,has);
});
test('catalog metadata has Chinese drop sources without cached library bonuses',()=>{
  const e=catalogEnv(),catalog=e.api.getEquipmentCatalog();assert.equal(catalog.length,488);
  for(const r of catalog){assert(r.tiers.length);for(const source of r.sources)assert(/[\u4e00-\u9fff]/.test(source.monster));}
  assert(catalog.every(r=>!Object.hasOwn(r,'bonuses')));
  const c=e.api.emptyEquipmentFilter();const group=e.api.equipmentGroups().find(g=>g.name==='長戟');
  e.api.setEquipmentTier(c,group.records.map(r=>r.id),3,false);for(const r of group.records)assert(c.disabledTiers[r.id+':3']);
});
test('spawn windows merge adjacent pools, retain separate returns and omit bosses',()=>{
 const e=setup(),rows=e.api.stageSpawnRows({runLength:360,waves:[{from:0,to:120,pool:['poring','lunatic']},{from:120,to:240,pool:['poring']},{from:240,to:360,pool:['lunatic']}],bosses:[{id:'mastering',t:360}]});
 const times=Object.fromEntries(rows.map(r=>[r.id,r.times]));assert.equal(times.poring,'00:00–04:00');assert.equal(times.lunatic,'00:00–02:00、04:00–06:00');assert(!times.mastering);
 assert.equal(e.api.spawnTime(65),'01:05');assert.equal(e.api.stageSpawnRows(null).length,0);
});
test('normal spawn windows stop at final boss time instead of boss-fight allowance',()=>{
 const e=setup(),script={runLength:1020,waves:[{from:0,to:600,pool:['poring']},{from:600,to:1020,pool:['lunatic']},{from:900,to:1020,pool:['fabre']}],bosses:[{id:'mini',t:180},{id:'mvp',t:840}]};
 const rows=e.api.stageSpawnRows(script);assert.equal(rows.find(r=>r.id==='poring').times,'00:00–10:00');assert.equal(rows.find(r=>r.id==='lunatic').times,'10:00–14:00');assert(!rows.some(r=>r.id==='fabre'));
 assert(!rows.some(r=>r.times.includes('17:00')));
 const early=e.api.stageSpawnRows({...script,bosses:[{t:1200,id:'late'}]});assert(early.some(r=>r.times.includes('17:00')));
 assert.equal(e.api.stageSpawnRows({...script,bosses:[{t:0,id:'immediate'}]}).length,0);
});
test('spawn windows clip to run length and use native last-wave fallback in gaps',()=>{
 const e=setup(),rows=e.api.stageSpawnRows({runLength:180,waves:[{from:0,to:60,pool:['poring']},{from:120,to:999,pool:['lunatic']}]});
 assert.equal(rows.find(r=>r.id==='lunatic').times,'01:00–03:00');
});
test('stage selection annotates each original mob and updates without duplicates',()=>{
 const e=setup();e.document.body.insertAdjacentHTML('beforeend',`<div id="stg-detail"><div class="stg-banner" style="--art:url('https://ro.hans-webgametw.com/assets/stages/prontera.jpg')"></div><div class="stg-sec"><div class="stg-mobs"><span data-mob="poring"></span></div></div></div>`);
 const stage={runLength:120,waves:[{from:0,to:120,pool:['poring']}],bosses:[]};
 e.api.setGameCatalog({ca:{prontera:stage}});e.api.updateStageSpawnSchedule();e.api.updateStageSpawnSchedule();
 assert.equal(e.document.querySelectorAll('[data-ro-mob-time]').length,1);
 let panel=e.document.querySelector('[data-ro-mob-time]');assert.equal(e.document.querySelector('[data-mob="poring"]').lastElementChild,panel);assert(panel.textContent.includes('波利'));assert(panel.textContent.includes('00:00–02:00'));
 e.api.setGameCatalog({ca:{prontera:{...stage,waves:[{from:0,to:120,pool:['lunatic']}]}}});e.document.querySelector('[data-mob="poring"]').dataset.mob='lunatic';e.api.updateStageSpawnSchedule();panel=e.document.querySelector('[data-ro-mob-time]');assert(panel.textContent.includes('瘋兔'));assert(!panel.textContent.includes('波利'));
});
test('two spawn windows appear on separate lines beneath the original monster icon',()=>{
 const e=setup();e.document.body.insertAdjacentHTML('beforeend',`<div id="stg-detail"><div class="stg-banner" style="--art:url('/assets/stages/a.jpg')"></div><div class="stg-mobs"><span data-mob="poring"><img src="poring.png"></span></div></div>`);
 const mob=e.document.querySelector('[data-mob="poring"]'),image=mob.firstElementChild;let clicks=0;mob.onclick=()=>clicks++;
 e.api.setGameCatalog({ca:{a:{runLength:180,waves:[{from:0,to:60,pool:['poring']},{from:60,to:120,pool:['lunatic']},{from:120,to:180,pool:['poring']}]}}});e.api.updateStageSpawnSchedule();e.api.updateStageSpawnSchedule();
 assert.deepEqual([...mob.querySelectorAll('small')].map(n=>n.textContent),['00:00–01:00','02:00–03:00']);assert.equal(mob.firstElementChild,image);mob.click();assert.equal(clicks,1);assert.equal(mob.querySelectorAll('[data-ro-mob-time]').length,1);
});
test('monster level sits between name and times and follows native lap level offset',()=>{
 const e=setup();e.document.body.insertAdjacentHTML('beforeend',`<div id="stages"><div id="lap-tabs"><button data-laptab="1" class="primary"></button><button data-laptab="2"></button><button data-laptab="3"></button></div><div id="stg-detail"><div class="stg-banner" style="--art:url('/assets/stages/prontera.jpg')"></div><div class="stg-mobs"><span data-mob="poring"><img></span></div></div></div>`);
 const script=pool=>({map:"test",runLength:120,waves:[{from:0,to:120,pool}],bosses:[]});
 e.api.setGameCatalog({bj:{poring:{level:1},lunatic:{level:3},late:{level:52}},ca:{prontera:script(['poring','lunatic']),maze:script(['late'])}});
 e.api.updateStageSpawnSchedule();const caption=e.document.querySelector('[data-ro-mob-time]');assert.equal(caption.children[0].tagName,'B');assert.equal(caption.children[1].textContent,'等級 1');assert.equal(caption.children[2].textContent,'00:00–02:00');
 for(const lap of ['2','3']){e.document.querySelector('#lap-tabs .primary').classList.remove('primary');e.document.querySelector(`[data-laptab="${lap}"]`).classList.add('primary');e.api.updateStageSpawnSchedule();assert.equal(e.document.querySelector('[data-ro-mob-level]').textContent,lap==='2'?'等級 51':'等級 66');}
 e.api.setGameCatalog({ca:{prontera:script(['poring'])}});e.api.updateStageSpawnSchedule();assert.equal(e.document.querySelector('[data-ro-mob-level]').textContent,'等級 —');
});
test('boss levels appear below names, preserve native times and update without duplicate rows',()=>{
 const e=setup();e.document.body.insertAdjacentHTML('beforeend',`<div id="lap-tabs"><button data-laptab="2" class="primary"></button></div><div id="stg-detail"><div class="stg-banner" style="--art:url('/assets/stages/pyramid.jpg')"></div><div class="stg-bosses"><div class="stg-boss mvp" data-mob="osiris"><span class="stg-boss-face"><img></span><b>俄塞里斯</b><small>MVP · min 14:00</small></div></div></div>`);
 const script=pool=>({map:"test",runLength:120,waves:[{from:0,to:120,pool}],bosses:[]});
 e.api.setGameCatalog({bj:{mummy:{level:40},late:{level:53},osiris:{level:50}},ca:{pyramid:script(['mummy']),maze:script(['late'])}});
 const boss=e.document.querySelector('.stg-boss'),name=boss.querySelector('b'),time=boss.querySelector('small');let clicks=0;boss.onclick=()=>clicks++;
 e.api.updateStageSpawnSchedule();const line=boss.querySelector('[data-ro-mob-level]');assert.equal(line.textContent,'等級 63');assert.equal(name.nextElementSibling,line);assert.equal(line.nextElementSibling,time);
 e.api.updateStageSpawnSchedule();assert.equal(boss.querySelector('[data-ro-mob-level]'),line);assert.equal(boss.querySelectorAll('[data-ro-mob-level]').length,1);assert.equal(time.textContent,'MVP · min 14:00');boss.click();assert.equal(clicks,1);
 e.document.querySelector('[data-laptab]').dataset.laptab='1';e.api.updateStageSpawnSchedule();assert.equal(line.textContent,'等級 50');
 e.api.setGameCatalog({ca:{pyramid:script(['mummy'])}});e.api.updateStageSpawnSchedule();assert.equal(line.textContent,'等級 —');
});
test('ambiguous or missing stage data never displays an invented timetable',()=>{
 const e=setup();e.document.body.insertAdjacentHTML('beforeend','<div id="stg-detail"><div class="stg-mobs"><span data-mob="poring"></span></div><div class="stg-bosses"></div></div>');
 const stage={runLength:120,waves:[{from:0,to:120,pool:['poring']}],bosses:[]};e.api.setGameCatalog({ca:{a:stage,b:stage}});e.api.updateStageSpawnSchedule();
 assert(e.document.querySelector('[data-ro-mob-time]').textContent.includes('時段未提供'));assert.equal(e.document.querySelector('[data-ro-spawn-schedule]'),null);
});
test('actual item ID bonuses override library snapshot and same-name gear never shares tier switches',()=>{
 const e=setup();e.api.setSmithData({2208:{slot:'head_top',bonuses:[]},2209:{slot:'head_top',bonuses:[]}},{manifest:{items:{}}});
 e.api.setGameCatalog({bs:(id,tier)=>id===2209?[{text:()=>'-'+tier+'% 受到傷害'}]:[]});
 const catalog=e.api.getEquipmentCatalog(),a=catalog.find(r=>r.id===2208),b=catalog.find(r=>r.id===2209);
 assert.equal(e.api.actualEquipmentBonuses(a,3).length,0);assert.equal(e.api.actualEquipmentBonuses(b,1)[0],'-1% 受到傷害');
 const groups=e.api.equipmentGroups().filter(g=>g.name==='紫蝶髮帶');assert.equal(groups.length,2);assert(groups.every(g=>g.records.length===1));
 const config=e.api.emptyEquipmentFilter();e.api.setEquipmentTier(config,[2208],3,false);assert(!config.disabledTiers['2209:3']);
 e.api.openFilter();e.document.querySelector('[data-gear-slot="head_top"]').click();
 const card=e.document.querySelector('[data-gear-id="2208"]');assert(card.textContent.includes('ID 2208'));assert(!card.textContent.includes('受到傷害'));assert(card.textContent.includes('無固有加成'));
});
test('unavailable live bonus data is unknown instead of falling back to library effects',()=>{
 const e=setup(),record=e.api.getEquipmentCatalog().find(r=>r.id===2209);assert.equal(e.api.actualEquipmentBonuses(record,1),null);
 e.api.setSmithData({2209:{slot:'head_top',bonuses:[]}},{manifest:{items:{}}});e.api.setGameCatalog({bs:()=>{throw new Error('changed API');}});assert.equal(e.api.actualEquipmentBonuses(record,1),null);
});
function refineFixture(e,{level=0,mode='success',materials=99,risky=false}={}){
  e.document.body.insertAdjacentHTML('beforeend','<div id="smith"><div id="smith-list"><div class="cand sel" data-uid="piece"></div></div><div id="smith-detail"></div><div><button id="smith-go">精煉</button></div></div><div id="npc-dialog" class="hidden"><div id="npc-options"></div></div>');
  let calls=0,confirmations=0,pending=null;
  const go=e.document.querySelector('#smith-go'),dialog=e.document.querySelector('#npc-dialog');
  const render=()=>{
    e.document.querySelector('#smith-detail').innerHTML='<div class="eq-item"><img class="big" src="piece.png"></div><div class="ref-ladder">'+Array.from({length:10},(_,i)=>`<span class="${i<level?'done':''}">+${i+1}</span>`).join('')+'</div>';
    go.disabled=materials<=0||level>=10;
  };
  const commit=()=>{
    calls++;go.disabled=true;
    const finish=()=>{
      pending=null;materials--;
      if(mode==='break'){e.document.querySelector('#smith-list .cand').remove();e.document.querySelector('#smith-detail').innerHTML='<div class="ref-result fail">裝備破損</div>';return;}
      level++;render();
    };
    if(mode==='delayed')pending=finish;else finish();
  };
  go.onclick=()=>{
    if(go.disabled)return;
    if(!risky){commit();return;}
    dialog.className='';dialog.innerHTML='<div class="confirm-piece"><div class="item-cell"><img src="piece.png"></div></div><div id="npc-options"><button class="primary">精煉</button></div>';
    dialog.querySelector('button').onclick=()=>{confirmations++;dialog.className='hidden';commit();};
  };
  render();e.api.updateAutoRefine();
  return {calls:()=>calls,level:()=>level,confirmations:()=>confirmations,finish:()=>pending?.(),go};
}
test('automatic refinement controls appear before native button and stop at target',()=>{
  const e=setup();const native=refineFixture(e);e.api.setRefineTarget(4);
  assert.equal(e.document.querySelector('#ro-auto-refine').nextElementSibling,native.go);
  e.api.startAutoRefine();assert.equal(e.document.querySelector('#ro-auto-refine-button').textContent,'停止');
  e.tick(5000);assert.equal(native.calls(),4);assert.equal(native.level(),4);assert(!e.api.getAutoRefine().active);
});
test('automatic risky refinement confirms only matching native prompts and stops on breakage',()=>{
  const e=setup();const native=refineFixture(e,{level:4,mode:'break',risky:true});e.api.setRefineTarget(8);
  e.api.startAutoRefine();e.tick(2000);assert.equal(native.calls(),1);assert.equal(native.confirmations(),1);assert(!e.api.getAutoRefine().active);
});
test('automatic refinement stops when material runs out',()=>{
  const e=setup();const native=refineFixture(e,{materials:1});e.api.setRefineTarget(4);e.api.startAutoRefine();
  e.tick(3000);assert.equal(native.calls(),1);assert(!e.api.getAutoRefine().active);
});
test('in-flight refinement is never duplicated and Stop prevents the next request',()=>{
  const e=setup();const native=refineFixture(e,{mode:'delayed'});e.api.setRefineTarget(4);e.api.startAutoRefine();
  e.tick(3000);assert.equal(native.calls(),1);assert(e.api.getAutoRefine().active);
  e.document.querySelector('#ro-auto-refine-button').click();assert(!e.api.getAutoRefine().active);
  native.finish();e.tick(3000);assert.equal(native.calls(),1);assert.equal(native.level(),1);
});
test('refinement stops on close or selection change and will not accept an existing dialog',()=>{
  const e=setup();const native=refineFixture(e);e.api.setRefineTarget(4);
  e.document.querySelector('#npc-dialog').className='';e.api.startAutoRefine();assert(!e.api.getAutoRefine().active);assert.equal(native.calls(),0);
  e.document.querySelector('#npc-dialog').className='hidden';e.api.startAutoRefine();e.document.querySelector('#smith-list .cand').dataset.uid='other';
  e.tick(500);assert(!e.api.getAutoRefine().active);assert.equal(native.calls(),0);
});
function offlineFixture(e){
  const created=[];class Socket extends e.window.EventTarget{
    static CLOSED=3;static OPEN=1;
    constructor(url){super();this.url=String(url);this.readyState=1;created.push(this);}
    close(){this.readyState=3;this.dispatchEvent(new e.window.Event('close'));}
  }
  e.window.WebSocket=Socket;e.api.installOfflineGate();return {created,Socket};
}
test('offline gate blocks only same-origin lobby sockets and persists preference',()=>{
  const e=setup();const native=offlineFixture(e);e.api.setKeepOffline(true);
  const blocked=new e.window.WebSocket('wss://ro.hans-webgametw.com/ws?l=1');assert.equal(blocked.readyState,3);assert.equal(native.created.length,0);
  new e.window.WebSocket('wss://ro.hans-webgametw.com/ws-run?l=1');new e.window.WebSocket('wss://example.com/ws');
  assert.equal(native.created.length,2);assert.equal(e.storage.get('greydust.ro.keep-offline.v1'),'true');
});
test('enabling offline closes existing lobby connection but leaves run sockets alone',()=>{
  const e=setup();offlineFixture(e);
  const lobby=new e.window.WebSocket('wss://ro.hans-webgametw.com/ws?l=2');const run=new e.window.WebSocket('wss://ro.hans-webgametw.com/ws-run?l=2');
  e.api.setKeepOffline(true);assert.equal(lobby.readyState,3);assert.equal(run.readyState,1);
});
test('disabling offline releases blocked native connection for its normal retry',()=>{
  const e=setup();const native=offlineFixture(e);e.api.setKeepOffline(true);
  const blocked=new e.window.WebSocket('wss://ro.hans-webgametw.com/ws?l=1');let released=0;blocked.onclose=()=>released++;
  e.api.setKeepOffline(false);assert.equal(released,1);new e.window.WebSocket('wss://ro.hans-webgametw.com/ws?l=1');assert.equal(native.created.length,1);
});
test('offline setting appears under game options and does not accept unrelated dialogs',()=>{
  const e=setup();offlineFixture(e);
  e.document.body.insertAdjacentHTML('beforeend','<div id="opt-tabs"><button class="active" data-opt-tab="game">遊戲</button></div><div id="opt-body"></div><div id="lobby-online">連線中</div><div id="npc-dialog"><div id="npc-options"><button>確定出售</button></div></div>');
  let otherClicked=0;e.document.querySelector('#npc-options button').onclick=()=>otherClicked++;
  e.api.updateOfflineUI();const check=e.document.querySelector('[data-ro-keep-offline]');assert(check);check.checked=true;check.onchange();
  assert(e.api.getKeepOffline());assert.equal(otherClicked,0);assert.equal(e.document.querySelector('#lobby-online').textContent,'離線遊玩（助手）');
});
test('offline preference automatically dismisses native lobby chooser via offline action',()=>{
  const e=setup();offlineFixture(e);e.api.setKeepOffline(true);
  e.document.body.insertAdjacentHTML('beforeend','<div id="npc-dialog"><div class="lb-pick"><button data-lb="1">Asgard</button></div><div id="npc-options"><button>離線遊玩</button></div></div>');
  let clicked=0;e.document.querySelector('#npc-options button').onclick=()=>{clicked++;e.document.querySelector('#npc-dialog').classList.add('hidden');};
  e.api.updateOfflineUI();assert.equal(clicked,1);
});
test('minimap magnet option appears directly below hide-ground-drops and persists',()=>{
  const e=setup();e.document.body.insertAdjacentHTML('beforeend','<div id="pause"><label class="opt-row"><input id="lu-p-hide"></label></div>');
  e.api.updateMinimapOption();const original=e.document.querySelector('#lu-p-hide').closest('label'),row=original.nextElementSibling;
  assert.equal(row.querySelector('b').textContent,'隱藏小地圖磁鐵');const input=row.querySelector('input');input.checked=true;input.onchange();
  assert.equal(e.storage.get('greydust.ro.hide-minimap-magnets.v1'),'true');e.api.updateMinimapOption();assert.equal(e.document.querySelectorAll('[data-ro-hide-minimap-magnets]').length,1);
});
test('minimap hides magnet U-strokes and white tips while preserving other markers',()=>{
  const e=setup();const calls=[];const ctx={beginPath(){},arc(){},stroke(){calls.push('stroke');},fillRect(){calls.push('fillRect');},fillStyle:'#e8eef8'};
  e.api.patchMinimapContext(ctx);e.api.patchMinimapContext(ctx);e.api.setHideMagnets(true);
  ctx.beginPath();ctx.arc(10,10,3.6,Math.PI,0,true);ctx.stroke();ctx.fillRect(1,1,2,2);assert.equal(calls.length,0);
  ctx.beginPath();ctx.arc(10,10,3.2,0,Math.PI*2);ctx.stroke();ctx.fillRect(1,1,2,2);assert.deepEqual(calls,['stroke','fillRect']);
  e.api.setHideMagnets(false);ctx.beginPath();ctx.arc(10,10,3.6,Math.PI,0,true);ctx.stroke();ctx.fillRect(1,1,2,2);assert.equal(calls.length,4);
});
test('character details show live stats and buffs without changing game data',()=>{
  const e=setup();e.document.body.insertAdjacentHTML('beforeend','<div id="hud"><div id="buffs"></div></div>');
  e.document.querySelector('#buffs').getBoundingClientRect=()=>({left:8,bottom:130});
  const stats={maxHp:500,damageReduction:.6,flee:.5,critChance:.2,critMult:1.8,discovery:12.5,enabled:true};
  const game={hp:250,stats,buffValue:key=>({reduction:.3,flee:.1,crit:.05}[key]||0)};
  const before=JSON.stringify(game.stats);e.api.setActiveGame(game);e.api.updateCharacterDetails();
  const button=e.document.querySelector('#ro-character-details-toggle');assert(button);assert.equal(button.style.top,'136px');
  button.click();const panel=e.document.querySelector('#ro-character-details');assert(panel);
  const values=Object.fromEntries(e.api.characterStatRows(game));
  assert.equal(values['生命'],'250 / 500');assert.equal(values['減傷（含 buff，未含 DEF／護甲）'],'75%');
  assert.equal(values['Flee（含 buff）'],'60%');assert.equal(values['爆擊率（含 buff）'],'25%');
  assert.equal(values['爆擊傷害'],'×1.8');assert.equal(values['尋寶率（內部值）'],'12.5');assert.equal(values['ATK'],'—');
  game.hp=123;game.stats={...stats,critMult:2.2};e.tick(250);assert(panel.textContent.includes('123 / 500'));assert(panel.textContent.includes('×2.2'));
  assert.equal(JSON.stringify(stats),before);assert(panel.textContent.includes('enabledtrue'));
  e.document.querySelector('#hud').classList.add('hidden');e.tick(250);
  assert.equal(e.document.querySelector('#ro-character-details'),null);assert.equal(e.document.querySelector('#ro-character-details-toggle'),null);
});
test('character details toggle is unique and run reset removes stale player data',()=>{
  const e=setup();e.document.body.insertAdjacentHTML('beforeend','<div id="hud"><div id="buffs"></div></div>');
  e.api.setActiveGame({hp:10,stats:{maxHp:20}});e.api.updateCharacterDetails();e.api.updateCharacterDetails();
  assert.equal(e.document.querySelectorAll('#ro-character-details-toggle').length,1);
  e.api.openCharacterDetails();e.api.resetRun();e.tick(1000);
  assert.equal(e.document.querySelector('#ro-character-details'),null);assert.equal(e.document.querySelector('#ro-character-details-toggle'),null);
});
test('horde progress counts successful spawns and preserves native announcements',()=>{
  const e=setup(),announcements=[];
  let calls=0;
  const announce=function(text){assert.equal(this,game.events);announcements.push(text);};
  const spawn=function(){assert.equal(this,game);calls++;return calls%2?{}:null;};
  const anchors=()=>[{}, {}, {}];
  const scale=()=>({count:1.1});
  const game={time:120,difficulty:{count:1},coop:{partyScale:scale},events:{onAnnounce:announce},
    spawnAnchors:anchors,spawnEnemy:spawn,horde(pool){
      assert.equal(pool,'pool');
      const desired=Math.round(Math.min(120,36+this.time/8)*this.difficulty.count*this.coop.partyScale().count);
      const n=this.spawnAnchors().length;
      for(let i=0;i<Math.round(desired/n)*n;i++)this.spawnEnemy();
      this.events.onAnnounce('其他提示');this.events.onAnnounce('怪物潮包圍了你！');return 123;
    }};
  e.api.installHordeCount(game);const wrapped=game.horde;e.api.installHordeCount(game);assert.equal(game.horde,wrapped);
  assert.equal(game.horde('pool'),123);assert.equal(calls,57);
  assert.deepEqual(announcements,['其他提示','怪物潮包圍了你！']);
  assert.equal(e.api.hordeProgress(game).actual,29);assert.equal(e.api.hordeProgress(game).theoretical,57);assert.equal(e.api.hordeProgress(game).complete,true);
  game.spawnEnemy();assert.equal(e.api.hordeProgress(game).actual,29);assert.equal(game.spawnAnchors,anchors);
  assert.equal(game.coop.partyScale,scale);assert.equal(game.events.onAnnounce,announce);
});
test('horde observers restore inherited methods after native failure and do not invent zero-spawn alerts',()=>{
  const e=setup(),messages=[];
  const prototype={spawnEnemy(){return null;},spawnAnchors(){return [{}];}};
  const game=Object.assign(Object.create(prototype),{time:0,difficulty:{count:1},events:{onAnnounce:t=>messages.push(t)},horde(){
    this.spawnAnchors();this.spawnEnemy();throw new Error('native failure');
  }});
  const announce=game.events.onAnnounce;
  e.api.installHordeCount(game);assert.throws(()=>game.horde(),/native failure/);
  assert.equal(e.api.hordeProgress(game).canceled,true);assert.equal(Object.hasOwn(game,'spawnAnchors'),false);
  assert.equal(game.events.onAnnounce,announce);assert.deepEqual(messages,[]);
});
function queuedHordeFixture(e){
  const game={time:120,difficulty:{count:10},closeAt:-1,enemies:[],spawnAnchors:()=>[{}, {}, {}],
    spawnEnemy(id,hp,normal,point){if(id==='failed')return null;const enemy={def:{id,name:id},hp};this.enemies.push(enemy);return enemy;},
    horde(id='poring',amount=450){this.spawnAnchors();for(let i=0;i<amount;i++)(this.roHq||(this.roHq=[])).push([id,10,i,0]);flush();return 'native';}};
  function flush(){if(!game.roHq?.length)return;if(game.bossArena||game.closeAt>=0){game.roHq.length=0;return;}for(const [id,hp,x,y] of game.roHq.splice(0,200))game.spawnEnemy(id,hp,false,{x,y});}
  e.api.installHordeCount(game);return {game,flush};
}
test('batched hordes count successful births independently of survivors and theory',()=>{
  const e=setup(),{game,flush}=queuedHordeFixture(e);
  assert.equal(game.horde(),'native');assert.equal(game.roHq.length,250);
  let progress=e.api.hordeProgress(game);assert.equal(progress.actual,200);assert.equal(progress.theoretical,510);assert.equal(progress.complete,false);
  game.enemies[0].hp=0;game.spawnEnemy('normal',10,true,{x:999,y:0});
  assert.equal(e.api.hordeProgress(game).actual,200);
  flush();assert.equal(e.api.hordeProgress(game).actual,400);flush();
  progress=e.api.hordeProgress(game);assert.equal(progress.actual,450);assert.equal(progress.complete,true);
  assert.equal(e.api.fieldMonsterCounts(game).reduce((sum,row)=>sum+row.count,0),450);
});
test('overlapping waves retain queue attribution and canceled waves never finish green',()=>{
  const e=setup(),{game,flush}=queuedHordeFixture(e);game.horde();game.horde('failed',10);
  assert.equal(e.api.hordeProgress(game).actual,0);assert.equal(e.api.hordeProgress(game).pending,10);
  flush();assert.equal(e.api.hordeProgress(game).failed,10);assert.equal(e.api.hordeProgress(game).complete,true);
  game.horde();game.bossArena=true;flush();assert.equal(e.api.hordeProgress(game).canceled,true);assert.equal(e.api.hordeProgress(game).complete,false);
});
test('right HUD separates cumulative horde births from live monster totals and reuses rows',()=>{
  const e=setup();e.document.body.insertAdjacentHTML('beforeend','<div id="hud"></div><div id="loot-rolls"></div>');
  e.document.querySelector('#loot-rolls').getBoundingClientRect=()=>({width:250,height:100,bottom:370,right:1188});
  const {game,flush}=queuedHordeFixture(e);game.horde();
  const panel=e.document.querySelector('#ro-horde-hud');assert(panel);assert.equal(panel.style.top,'auto');assert.equal(panel.style.bottom,'12px');
  assert.equal(panel.querySelector('[data-horde-progress]').textContent,'怪物潮(200/510)');
  assert.equal(panel.querySelector('[data-monster-total]').textContent,'場上怪物：200 / —');
  const row=panel.querySelector('[data-monster-counts]').firstElementChild;e.api.updateHordeHud(game,true);assert.equal(panel.querySelector('[data-monster-counts]').firstElementChild,row);
  game.enemies[0].hp=0;e.api.updateHordeHud(game,true);assert.equal(panel.querySelector('[data-monster-total]').textContent,'場上怪物：199 / —');
  assert.equal(panel.querySelector('[data-horde-progress]').textContent,'怪物潮(200/510)');
  flush();flush();e.api.updateHordeHud(game,true);assert.equal(panel.querySelector('[data-horde-progress]').dataset.status,'complete');
  e.document.querySelector('#hud').classList.add('hidden');e.api.updateHordeHud(game,true);assert.equal(e.document.querySelector('#ro-horde-hud'),null);
});
test('monster HUD folds details, keeps counts live and clears completed horde after three seconds',()=>{
  const e=setup();e.document.body.insertAdjacentHTML('beforeend','<div id="hud"></div><div id="loot-rolls"></div>');
  e.document.querySelector('#loot-rolls').getBoundingClientRect=()=>({width:250,height:100,bottom:370,right:1188});
  const {game,flush}=queuedHordeFixture(e);game.waveTime=30;game.script={waves:[{from:0,to:100,maxAlive:50}]};game.horde();
  const panel=e.document.querySelector('#ro-horde-hud'),toggle=panel.querySelector('[data-monster-toggle]'),list=panel.querySelector('[data-monster-counts]'),counter=panel.querySelector('[data-horde-progress]');
  assert.equal(panel.style.width,'180px');assert.equal(panel.querySelector('[data-monster-total]').textContent,'場上怪物：200 / 500');
  toggle.click();assert.equal(list.hidden,true);assert.equal(toggle.textContent,'+');assert.equal(toggle.getAttribute('aria-expanded'),'false');
  e.tick(4000);e.api.updateHordeHud(game,true);assert.equal(counter.textContent,'怪物潮(200/510)');
  flush();flush();e.api.updateHordeHud(game,true);assert.equal(counter.dataset.status,'complete');
  e.tick(2999);e.api.updateHordeHud(game,true);assert.equal(counter.textContent,'怪物潮(450/510)');
  e.tick(1);e.api.updateHordeHud(game,true);assert.equal(counter.textContent,'怪物潮(-/-)');assert.equal(counter.dataset.status,'idle');
  assert.equal(panel.querySelector('[data-monster-total]').textContent,'場上怪物：450 / 500');
  toggle.click();assert.equal(list.hidden,false);assert.equal(toggle.textContent,'−');
  game.horde();e.api.updateHordeHud(game,true);assert.equal(counter.textContent,'怪物潮(200/510)');
});
test('map monster limit follows wave, early ramp and party difficulty without inventing missing limits',()=>{
  const e=setup(),game={waveTime:0,difficulty:{count:1.5},coop:{partyScale:()=>({count:2})},script:{waves:[{from:0,to:30,maxAlive:100},{from:30,to:60,maxAlive:200}]}};
  assert.equal(e.api.fieldMonsterLimit(game),60);game.waveTime=15;assert.equal(e.api.fieldMonsterLimit(game),181);
  game.waveTime=30;assert.equal(e.api.fieldMonsterLimit(game),600);game.waveTime=80;assert.equal(e.api.fieldMonsterLimit(game),600);
  assert.equal(e.api.fieldMonsterLimit({}),null);
});
test('desktop horde HUD stays bottom-right as loot appears and fits ten monster kinds',()=>{
 const e=setup();e.document.body.insertAdjacentHTML('beforeend','<div id="hud"></div><div id="lu-feed"></div>');
 const feed=e.document.querySelector('#lu-feed');feed.getBoundingClientRect=()=>{throw Error('fixed HUD must not depend on loot geometry');};
 const game={state:'playing',enemies:Array.from({length:10},(_,i)=>({def:{id:'test-'+i,name:'怪物'+i},hp:10}))};
 e.api.updateHordeHud(game,true);const panel=e.document.querySelector('#ro-horde-hud');
 const position=()=>[panel.style.top,panel.style.bottom,panel.style.right,panel.style.maxHeight];
 assert.deepEqual(position(),['auto','12px','12px','340px']);assert.equal(panel.querySelector('[data-monster-counts]').children.length,10);
 feed.innerHTML='<div>新裝備掉落</div>';e.api.updateHordeHud(game,true);assert.deepEqual(position(),['auto','12px','12px','340px']);
 feed.remove();e.api.updateHordeHud(game,true);assert.equal(e.document.querySelector('#ro-horde-hud'),panel);assert.deepEqual(position(),['auto','12px','12px','340px']);
});
test('mobile horde HUD stays outside scaled HUD, docks top-left and preserves changing count rows',()=>{
  const e=setup();vm.runInContext('innerWidth=640;innerHeight=360',e.vmContext);
  e.document.body.insertAdjacentHTML('beforeend','<div id="hud" style="zoom:2"><div id="lu-feed" class="land"></div></div>');
  const feed=e.document.querySelector('#lu-feed');let bottom=200;feed.getBoundingClientRect=()=>({width:180,height:90,right:632,bottom});
  const game={state:'playing',enemies:[{def:{id:'poring'},hp:10},{def:{id:'poring'},hp:10}]};e.api.setActiveGame(game);e.api.updateHordeHud(game,true);
  const panel=e.document.querySelector('#ro-horde-hud'),list=panel.querySelector('[data-monster-counts]'),row=list.firstElementChild;
  assert.equal(panel.parentElement,e.document.body);assert.equal(panel.style.width,'132px');assert.equal(panel.style.bottom,'auto');assert.equal(panel.style.left,'8px');assert.equal(panel.style.top,'112px');assert(list.hidden);
  game.enemies[0].hp=0;bottom=290;e.api.updateHordeHud(game,true);assert.equal(list.firstElementChild,row);assert.equal(row.lastElementChild.textContent,'1');assert.equal(panel.style.bottom,'auto');
  e.document.querySelector('#picker').classList.remove('hidden');e.api.updateHordeHud(game,true);assert(panel.hidden);
  e.document.querySelector('#picker').classList.add('hidden');e.api.updateHordeHud(game,true);assert(!panel.hidden);assert.equal(e.document.querySelector('#ro-horde-hud'),panel);
});
test('mobile battle overlays recover without native ticks and have no duplicate controls',()=>{
 const e=setup();vm.runInContext('innerWidth=402;innerHeight=714',e.vmContext);
 e.document.body.insertAdjacentHTML('beforeend','<div id="hud" style="zoom:2"><div id="buffs"></div></div>');
 e.document.querySelector('#buffs').getBoundingClientRect=()=>({left:600,bottom:900});
 e.api.setActiveGame({state:'playing',hp:10,stats:{maxHp:20},enemies:[]});e.tick(250);
 const character=e.document.querySelector('#ro-character-details-toggle');assert.equal(character.parentElement,e.document.body);
 assert.equal(character.style.left,'292px');assert.equal(character.style.top,'666px');
 let panel=e.document.querySelector('#ro-horde-hud');assert(panel);assert(!panel.querySelector('[data-battle-controls]'));assert(!panel.querySelector('[data-horde-ring-toggle]'));
 character.click();assert(e.document.querySelector('#ro-character-details'));
 panel.remove();e.tick(250);panel=e.document.querySelector('#ro-horde-hud');assert(panel);
 e.document.querySelector('#hud').classList.add('hidden');e.tick(250);assert(!e.document.querySelector('#ro-horde-hud'));assert(!e.document.querySelector('#ro-character-details-toggle'));
});
test('mobile monster panel follows character button and remains below native overlays',()=>{
 const e=setup();vm.runInContext('innerWidth=402;innerHeight=714',e.vmContext);
 e.document.body.insertAdjacentHTML('beforeend','<div id="hud"><div id="buffs"></div></div><div id="pause" class="overlay hidden"></div>');
 e.document.querySelector('#buffs').getBoundingClientRect=()=>({left:8,bottom:108});
 e.api.setActiveGame({state:'playing',stats:{maxHp:20},hp:10,enemies:[]});e.tick(500);
 const button=e.document.querySelector('#ro-character-details-toggle'),panel=e.document.querySelector('#ro-horde-hud');
 assert.equal(button.style.top,'114px');assert.equal(panel.style.top,'156px');assert.equal(panel.style.left,'8px');assert.equal(panel.style.bottom,'auto');assert.equal(panel.style.right,'auto');
 assert(!panel.querySelector('[data-battle-controls]'));assert(panel.querySelector('[data-monster-toggle]'));
 e.document.querySelector('#buffs').getBoundingClientRect=()=>({left:8,bottom:140});e.tick(500);assert.equal(panel.style.top,'188px');
});

test('ordinary battle taps pause background layout updates through native click and then resume',()=>{
 const e=setup();e.document.body.insertAdjacentHTML('beforeend','<div id="hud"><div id="buffs"></div></div><button id="native-action">Action</button>');
 const game={state:'playing',hp:10,stats:{maxHp:20},enemies:[]};e.api.setActiveGame(game);e.tick(250);
 let reads=0,clicks=0;e.document.querySelector('#buffs').getBoundingClientRect=()=>{reads++;return {left:100,bottom:200};};
 const button=e.document.querySelector('#native-action');button.onclick=()=>clicks++;
 assert(!safariTouch(e,button,'touchstart').defaultPrevented);e.tick(1500);e.api.scan();e.api.helperTick(game);assert.equal(reads,0,'a held finger must keep updates paused');
 assert(!safariTouch(e,button,'touchend').defaultPrevented);e.tick(750);assert.equal(reads,0);
 assert(!pointer(e,button,'click').defaultPrevented);assert.equal(clicks,1);
 e.tick(500);assert(reads>0,'background updates resume after touch settles');
});

test('manual native picker pauses unrelated helper UI writes and resumes them after closing',()=>{
 const e=setup();e.document.documentElement.classList.add('touch');
 e.document.body.insertAdjacentHTML('beforeend','<div id="hud"><div id="buffs"></div></div>');
 const game={state:'playing',hp:10,stats:{maxHp:20},enemies:[]};e.api.setActiveGame(game);e.tick(250);
 const character=e.document.querySelector('#ro-character-details-toggle'),hud=e.document.querySelector('#ro-horde-hud');
 const originalLeft=character.style.left;
 picker(e,[['A','a.png','普通']]);e.api.scan();e.api.helperTick(game);
 assert(hud.hidden);const before=hud.innerHTML;
 let layoutReads=0;e.document.querySelector('#buffs').getBoundingClientRect=()=>{layoutReads++;return {left:100,bottom:200};};
 e.api.scan();e.api.updateCharacterDetails();e.tick(1250);e.api.helperTick(game);
 assert.equal(layoutReads,0);assert.equal(character.style.left,originalLeft);assert.equal(hud.innerHTML,before);
 e.document.querySelector('#picker').classList.add('hidden');e.tick(250);
 assert(layoutReads>0);assert(!hud.hidden);assert.equal(character.style.left,'100px');
});

test('mobile chest cards and replacement confirmation retain native taps after a held slot',()=>{
  const e=setup(),slot=touchSlot(e,'item');pointer(e,slot,'pointerdown');e.tick(550);pointer(e,slot,'pointerup');
  const cards=picker(e,[['生命藥水','potion.png','普通'],['其他','other.png','稀有']],'item');
  const nativeSlot=cards[0].closest('.pk-slot');nativeSlot.insertAdjacentHTML('beforeend','<div class="pk-back"><button data-yes>確認替換</button><button data-no>取消</button></div>');
  let picks=0,confirmed=0;cards[0].onclick=()=>{picks++;nativeSlot.classList.add('asking');};const confirm=nativeSlot.querySelector('[data-yes]');confirm.onclick=()=>confirmed++;
  assert(!pointer(e,cards[0],'pointerdown').defaultPrevented);assert(!pointer(e,cards[0],'pointerup').defaultPrevented);pointer(e,cards[0],'click');assert.equal(picks,1);
  assert(!e.document.querySelector('#ro-ap-menu'));
  assert(!pointer(e,confirm,'pointerdown').defaultPrevented);assert(!pointer(e,confirm,'pointerup').defaultPrevented);pointer(e,confirm,'click');assert.equal(confirmed,1);
});
test('horde circle maps world position and radius to exact minimap crop',()=>{
  const e=setup();const game={map:{width:100,height:100},player:{x:3200,y:3200},logicReach:()=>900};
  const image={naturalWidth:512,naturalHeight:512};
  const full=e.api.hordeRingGeometry(game,image,[0,0,512,512,0,0,200,200]);
  assert.equal(full.x,100);assert.equal(full.y,100);assert.equal(full.rx,990/6400*200);assert.equal(full.outerX,1030/6400*200);
  const zoom=e.api.hordeRingGeometry(game,image,[128,128,256,256,0,0,200,200]);assert.equal(zoom.x,100);assert.equal(zoom.rx,2*full.rx);
});
test('horde circle option is directly below hide minimap magnets and persists',()=>{
  const e=setup();e.document.body.insertAdjacentHTML('beforeend','<div id="pause"><label><input id="lu-p-hide"></label></div>');e.api.updateMinimapOption();
  const magnet=e.document.querySelector('[data-ro-hide-minimap-magnets]').closest('label');
  const ring=magnet.nextElementSibling.querySelector('[data-ro-show-horde-ring]');assert(ring);ring.checked=true;ring.onchange();
  assert.equal(e.storage.get('greydust.ro.show-horde-ring.v1'),'true');
});
test('minimap draws ring only after native player marker and only when enabled',()=>{
  const e=setup();e.api.setShowRing(false);const calls=[];const ctx={beginPath(){},arc(){},stroke(){},fillRect(){},drawImage(){},rotate(){},restore(){},save(){},setTransform(){},setLineDash(){},ellipse(...args){calls.push(args);}};
  e.api.patchMinimapContext(ctx);e.api.setActiveGame({map:{width:100,height:100},player:{x:3200,y:3200},logicReach:()=>900});
  ctx.drawImage({naturalWidth:512,naturalHeight:512},0,0,512,512,0,0,200,200);ctx.rotate(0);ctx.restore();assert.equal(calls.length,0);
  e.api.setShowRing(true);ctx.rotate(0);ctx.restore();assert.equal(calls.length,2);assert.equal(calls[0][0],100);assert.equal(calls[0][2],990/6400*200);
});
test('removed minimap cache has no option or pickup accessor even with an old saved preference',()=>{
  const e=setup();e.storage.set('greydust.ro.minimap-pickup-cache.v1','true');
  e.document.body.insertAdjacentHTML('beforeend','<div id="pause"><label><input id="lu-p-hide"></label></div>');
  e.api.scan();assert.equal(e.document.querySelector('[data-ro-pickup-option="minimap-pickup-cache"]'),null);
  const game={pickups:[]};const descriptor=Object.getOwnPropertyDescriptor(game,'pickups');
  e.api.installFastChoice(game);assert.deepEqual(Object.getOwnPropertyDescriptor(game,'pickups'),descriptor);
});
console.log(`${count} tests passed`);

test('equipment drop sources stay visible, merge stages and omit source Tier labels',()=>{
 const e=catalogEnv();e.api.openFilter();
 const catalog=e.api.getEquipmentCatalog();
 const cards=[...e.document.querySelectorAll('.ro-gear-card')];assert(cards.length);
 for(const card of cards){
  const record=catalog.find(row=>String(row.id)===card.dataset.gearId),sources=card.querySelector('.ro-gear-sources');
  assert(sources);assert(!sources.closest('details'));assert(!/T[1-8]|周目/.test(sources.textContent));
  assert.equal(sources.children.length,new Set(record.sources.map(source=>source.stage)).size);
  for(const source of record.sources){assert(sources.textContent.includes(source.stage));assert(sources.textContent.includes(source.monster));if(source.rare)assert(sources.textContent.includes('闖入者'));}
 }
});

test('Taekwon weapon display subtype uses catalog fallback without changing native type',()=>{
 const e=catalogEnv(),defs={1823:{id:1823,slot:'weapon',jobs:['taekwon']}};e.api.setSmithData(defs,null);e.api.openFilter();
 const before=JSON.stringify(defs),subtype=e.document.querySelector('[data-weapon-type="taekwon"]');assert(subtype);assert(subtype.textContent.includes('跆拳拳套'));subtype.click();
 const ids=[...e.document.querySelectorAll('.ro-gear-card')].map(card=>Number(card.dataset.gearId));
 assert.equal(ids.length,9);assert(ids.includes(1823));assert(ids.every(id=>e.api.getEquipmentCatalog().find(record=>record.id===id).wtype==='taekwon'));
 assert.equal(JSON.stringify(defs),before);assert.equal(defs[1823].wtype,undefined);
});

test('story-only reward has no extrapolated high-lap Tier toggles',()=>{
 const e=catalogEnv();
 const badge=e.api.getEquipmentCatalog().find(record=>record.id===22847);assert(badge.sources.every(source=>source.reward));assert.deepEqual([...e.api.equipmentTiers(badge)],[2]);
});
