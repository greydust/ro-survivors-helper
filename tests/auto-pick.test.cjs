const { parseHTML } = require('linkedom');
const vm = require('node:vm');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'dist', 'RO倖存者助手.user.js'), 'utf8');
function setup() {
  const { window } = parseHTML('<html><head></head><body><div id="skillbar"></div><div id="runitems"></div><div id="skill-tip" class="hidden"></div><div id="picker" class="hidden"><div id="pk-title">Level Up！</div><div id="lu-sockets"></div><div id="pk-cards"></div></div></body></html>');
  const { document } = window;
  let time = 0, next = 1;
  const timers = new Map(), storage = new Map();
  let observer;
  const context = vm.createContext({ document, window, Element: window.Element, MouseEvent: window.Event,
    MutationObserver: class { constructor(callback) { observer = callback; } observe() {} }, location: { href: 'https://ro.hans-webgametw.com/' }, URL,
    localStorage: { getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v) },
    console, JSON, Set, innerWidth: 1200, innerHeight: 800, performance: { now: () => time },
    setTimeout: (fn, delay) => { const id = next++; timers.set(id, { fn, at: time+delay }); return id; },
    clearTimeout: id => timers.delete(id), queueMicrotask: fn => fn() });
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, 'globalThis.api = { scan, context, choose, rank, cancel, installOfflineGate, setKeepOffline, isLobbySocket, updateOfflineUI, getKeepOffline:()=>keepOffline, patchMinimapContext, updateMinimapOption, setHideMagnets:value=>hideMinimapMagnets=value, hordeRingGeometry, setShowRing:value=>showHordeRing=value, setActiveGame:value=>activeGame=value, victoryMagnet, fastChoice, installFastChoice, updateSmith, smithCategory, setSmithData:(defs,assets)=>{smithDefs=defs;smithAssets=assets;}, updateAutoRefine, startAutoRefine, stopAutoRefine, setRefineTarget:value=>autoRefine.target=value, getAutoRefine:()=>autoRefine, validRule, matchesRule, baseDetails, baseOptions, setGameCatalog:value=>gameCatalog=value, tierFormula, formMulti, updateMerchant, captureMerchantInventory, selectUnwanted, openFilter, closeFilter, parseFilterImport, loadFilterStore, setFilterStore:value=>filterStore=value, getFilterStore:()=>filterStore, getRules:()=>rules, setRules:r=>rules=r }; })();'), context);
  function tick(ms) {
    const end = time + ms;
    while (true) {
      const due = [...timers].filter(([,t]) => t.at <= end).sort((a,b)=>a[1].at-b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]); time = due[1].at; due[1].fn();
    }
    time = end;
  }
  return { document, window, api: context.api, tick, storage, mutations: records => observer(records) };
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
test('smith reopening resets detailed filter and does not alter row handlers',()=>{
  const e=setup();smithFixture(e);let selected=0;
  const row=e.document.querySelector('#smith-list .cand');row.onclick=()=>selected++;
  e.api.updateSmith();row.click();assert.equal(selected,1);
  e.document.querySelector('[data-ro-smith-category="shield"]').click();
  e.document.querySelector('#smith').classList.add('hidden');e.api.updateSmith();
  e.document.querySelector('#smith').classList.remove('hidden');e.api.updateSmith();
  assert.equal(e.document.querySelectorAll('#smith-list [data-ro-smith-filtered]').length,0);
});
const tierRule=(op,value)=>({type:'tier',op,value});
function gearEnv(){const e=setup();e.api.setSmithData({1101:{slot:'weapon',wtype:'검'},1163:{slot:'weapon',wtype:'양손검'},2301:{slot:'armor'},2101:{slot:'shield'}},{manifest:{items:{}}});return e;}
test('rule engine supports nested AND OR NOT with exact tier boundary',()=>{
  const e=gearEnv();const item={uid:'a',itemId:1101,tier:2,affixes:[]};
  assert(e.api.matchesRule(tierRule('<=',2),item));assert(e.api.matchesRule(tierRule('=',2),item));assert(!e.api.matchesRule(tierRule('>=',3),item));
  assert(e.api.matchesRule({type:'and',children:[tierRule('<=',2),{type:'not',children:[{type:'slot',slot:'armor'}]}]},item));
  assert(e.api.matchesRule({type:'or',children:[tierRule('>=',3),{type:'slot',slot:'onehand'}]},item));
});
test('main affixes are order-independent and require both when specified',()=>{
  const e=gearEnv();const item={itemId:1101,tier:2,affixes:[{stat:'luk',value:2},{stat:'str',value:2}]};
  assert(e.api.matchesRule({type:'primary',first:'str'},item));
  assert(e.api.matchesRule({type:'primary',first:'str',second:'luk'},item));
  assert(!e.api.matchesRule({type:'primary',first:'str',second:'dex'},item));
  assert(!e.api.validRule({type:'primary',second:'luk'}));
  assert(!e.api.validRule({type:'primary',first:'str',second:'str'}));
});
test('secondary groups can be specified independently and ignore card/base bonuses',()=>{
  const e=gearEnv();const item={itemId:1101,tier:3,affixes:[{stat:'str'},{stat:'luk'},{stat:'pierce'},{stat:'flee'}],cards:[4001]};
  assert(e.api.matchesRule({type:'secondary',third:'pierce'},item));
  assert(e.api.matchesRule({type:'secondary',fourth:'flee'},item));
  assert(!e.api.matchesRule({type:'secondary',third:'crit',fourth:'flee'},item));
  assert(!e.api.matchesRule({type:'primary',first:'agi'},item));
});
test('base, weapon handedness and skill damage use raw IDs',()=>{
  const e=gearEnv();const item={itemId:1163,tier:3,affixes:[{stat:'skill',skill:'magnum',value:.15}]};
  assert(e.api.matchesRule({type:'slot',slot:'twohand',base:'1163'},item));
  assert(!e.api.matchesRule({type:'slot',slot:'onehand'},item));
  assert(!e.api.matchesRule({type:'slot',slot:'twohand',base:'1101'},item));
  assert(e.api.matchesRule({type:'skill',skill:'magnum'},item));
  assert(!e.api.matchesRule({type:'skill',skill:'shield_bash'},item));
});
test('incomplete and excessive rules never match even when negated',()=>{
  const e=gearEnv();const item={itemId:1101,tier:2,affixes:[]};
  for(const rule of [null,{type:'and',children:[]},{type:'or',children:[]},{type:'not',children:[null]},{type:'tier',op:'<=',value:0},{type:'secondary'}]) {
    assert(!e.api.validRule(rule));assert(!e.api.matchesRule(rule,item));
  }
  assert(!e.api.matchesRule({type:'not',children:[tierRule('=',2)]},{itemId:1101,affixes:[]}));
});
function merchantFixture(e){
  const inventory=[
    {uid:'low',itemId:1101,tier:1,affixes:[],cards:[]},
    {uid:'high',itemId:1163,tier:3,affixes:[],cards:[]},
    {uid:'safe',itemId:2301,tier:1,affixes:[],cards:[],safe:true},
    {uid:'worn',itemId:2101,tier:1,affixes:[],cards:[]},
  ];const selection=new Set(['high']);let sold=0;
  e.document.body.insertAdjacentHTML('beforeend','<div id="shop"><div id="shop-filters"></div><div id="shop-quality"></div><div id="shop-items"></div><button id="shop-sell-btn"></button></div>');
  function render(){
    const account=JSON.parse(JSON.stringify({inventory,cards:{},kafra:0}));
    e.document.querySelector('#shop-filters').innerHTML='<button data-f="all" class="active">全部</button>';
    e.document.querySelector('[data-f="all"]').onclick=render;
    e.document.querySelector('#shop-quality').innerHTML='<button data-q="4">傳說</button>'+(selection.size?'<button data-q="none">取消</button>':'');
    const clear=e.document.querySelector('[data-q="none"]');if(clear)clear.onclick=()=>{selection.clear();render();};
    e.document.querySelector('#shop-items').innerHTML=account.inventory.map(item=>`<div class="shop-cell ${selection.has(item.uid)?'picked':''} ${item.safe?'safe':''} ${item.uid==='worn'?'worn':''}" data-uid="${item.uid}"></div>`).join('');
    for(const cell of e.document.querySelectorAll('#shop-items [data-uid]'))cell.onclick=()=>{selection.has(cell.dataset.uid)?selection.delete(cell.dataset.uid):selection.add(cell.dataset.uid);render();};
  }
  e.document.querySelector('#shop-sell-btn').onclick=()=>sold++;render();return {selection,sold:()=>sold};
}
test('merchant appends buttons directly after legendary and never sells',()=>{
  const e=gearEnv();const native=merchantFixture(e);
  e.api.setFilterStore({version:1,activeId:'a',profiles:[{id:'a',name:'低階裝',rule:tierRule('<=',2)}]});
  e.api.updateMerchant();assert.equal(e.document.querySelector('[data-q="4"]').nextElementSibling.textContent,'不需要');
  assert.equal(e.document.querySelector('[data-ro-unwanted]').nextElementSibling.textContent,'過濾器');
  const original=JSON.parse,has=Set.prototype.has;e.api.selectUnwanted();
  assert.equal(JSON.parse,original);assert.equal(Set.prototype.has,has);
  assert.deepEqual([...native.selection],['low']);assert.equal(native.sold(),0);
});
test('filter store persists named nested rules without changing auto-pick settings',()=>{
  const e=gearEnv();const data={version:1,activeId:'a',profiles:[{id:'a',name:'我的規則',rule:{type:'not',children:[tierRule('>=',3)]}}]};
  e.storage.set('greydust.ro.unwanted.v1',JSON.stringify(data));e.api.loadFilterStore();
  assert.equal(e.api.getFilterStore().profiles[0].name,'我的規則');assert.equal(e.api.getRules().length,0);
});
test('named filter import round trip validates schema, nesting and base-slot consistency',()=>{
  const e=gearEnv();const data={format:'ro-helper-unwanted',version:1,name:'低階或不合適的劍',rule:{type:'or',children:[tierRule('<=',2),{type:'and',children:[{type:'slot',slot:'twohand',base:'1163'},{type:'not',children:[{type:'primary',first:'str',second:'luk'}]}]}]}};
  assert.equal(JSON.stringify(e.api.parseFilterImport(JSON.stringify(data))),JSON.stringify(data));
  assert.throws(()=>e.api.parseFilterImport('{broken'));
  assert.throws(()=>e.api.parseFilterImport(JSON.stringify({...data,version:2})));
  assert.throws(()=>e.api.parseFilterImport(JSON.stringify({...data,rule:{type:'slot',slot:'shield',base:'1163'}})));
  assert.throws(()=>e.api.parseFilterImport(JSON.stringify({...data,rule:{type:'not',children:[null]}})));
});
test('filter modal renders one root and cancels without saving',()=>{
  const e=gearEnv();e.api.setFilterStore({version:1,activeId:'a',profiles:[{id:'a',name:'低階',rule:tierRule('<=',2)}]});
  e.api.openFilter();assert(e.document.querySelector('#ro-unwanted-dialog'));
  assert.equal(e.document.querySelectorAll('.ro-filter-rule').length,1);
  e.api.closeFilter();assert.equal(e.document.querySelector('#ro-unwanted-dialog'),null);
  assert.equal(e.api.getFilterStore().profiles[0].name,'低階');assert.equal(e.storage.size,0);
});
test('primary editor disables second attribute until first is set and saves named profile',()=>{
  const e=gearEnv();e.api.setFilterStore({version:1,activeId:'a',profiles:[{id:'a',name:'保留配裝外的物品',rule:{type:'primary'}}]});
  e.api.openFilter();
  assert.equal(e.document.querySelectorAll('.ro-filter-rule details').length,1);
  const checkbox=e.document.querySelector('.ro-filter-rule input[value="str"]');checkbox.checked=true;checkbox.onchange();
  assert.equal(e.document.querySelectorAll('.ro-filter-rule details').length,2);
  assert(!e.document.querySelector('[data-filter-save]').disabled);
  e.document.querySelector('[data-filter-save]').click();
  const saved=JSON.parse(e.storage.get('greydust.ro.unwanted.v1'));assert.deepEqual(saved.profiles[0].rule.first,['str']);
  assert.equal(saved.profiles[0].name,'保留配裝外的物品');assert.equal(e.document.querySelector('#ro-unwanted-dialog'),null);
});
test('NOT around an incomplete group does not select all inventory',()=>{
  const e=gearEnv();const item={itemId:1101,tier:1,affixes:[]};
  assert(!e.api.matchesRule({type:'not',children:[{type:'and',children:[tierRule('=',1),null]}]},item));
});
test('delete buttons belong to the same rule header with group delete after selector',()=>{
  const e=gearEnv();const rule={type:'and',children:[tierRule('<=',2),{type:'not',children:[{type:'slot',slot:'shield'}]}]};
  e.api.setFilterStore({version:1,activeId:'a',profiles:[{id:'a',name:'排版',rule}]});e.api.openFilter();
  const boxes=e.document.querySelectorAll('.ro-filter-rule');
  const leafHeader=boxes[1].firstElementChild;assert(leafHeader.lastElementChild.hasAttribute('data-filter-remove'));assert.equal(leafHeader.querySelectorAll('label').length,2);
  const notHeader=boxes[2].firstElementChild;assert(notHeader.querySelector(':scope > select').nextElementSibling.hasAttribute('data-filter-remove'));
});
test('AND and OR folding preserves rule contents and supports reopening',()=>{
  const e=gearEnv();const rule={type:'or',children:[tierRule('<=',2),{type:'and',children:[{type:'slot',slot:'shield'},{type:'not',children:[tierRule('>=',4)]}]}]};
  e.api.setFilterStore({version:1,activeId:'a',profiles:[{id:'a',name:'折疊',rule}]});e.api.openFilter();
  const count=e.document.querySelectorAll('.ro-filter-rule').length;
  e.document.querySelector('[data-filter-collapse]').click();assert.equal(e.document.querySelectorAll('.ro-filter-rule').length,1);
  assert.equal(e.document.querySelector('[data-filter-collapse]').textContent,'+');
  e.document.querySelector('[data-filter-collapse]').click();assert.equal(e.document.querySelectorAll('.ro-filter-rule').length,count);
  e.api.closeFilter();assert.equal(JSON.stringify(e.api.getFilterStore().profiles[0].rule),JSON.stringify(rule));
});
test('corrected crusader filter excludes both kept cloaks at Tier 3 and preserves low-tier rule',()=>{
  const e=setup();e.api.setSmithData({2507:{slot:'garment'},2511:{slot:'garment'},2501:{slot:'garment'},2114:{slot:'shield'},2411:{slot:'shoes'}},{manifest:{items:{}}});
  const data=JSON.parse(fs.readFileSync(path.join(root,'doc','examples','十字軍-修正版.json'),'utf8'));assert(e.api.validRule(data.rule));
  for(const id of [2507,2511])assert(!e.api.matchesRule(data.rule,{itemId:id,tier:3,affixes:[]}));
  assert(e.api.matchesRule(data.rule,{itemId:2501,tier:3,affixes:[]}));
  assert(e.api.matchesRule(data.rule,{itemId:2507,tier:2,affixes:[]}));
});
test('base dropdown shows all normal drop tiers and inherent Tier-1 bonuses',()=>{
  const e=setup();e.api.setSmithData({2507:{slot:'garment',bonuses:[{text:()=>'+10 最大 HP'}]}},{manifest:{items:{2507:{name:'伯爵斗篷',icon:'items/2507.png'}}}});
  e.api.setGameCatalog({ca:{prontera:{waves:[{pool:['a']}],bosses:[]},orcs:{waves:[{pool:['b']}],bosses:[]}},cb:{a:[{id:2507}],b:[{id:2507}]},bs:(id,tier)=>[{text:mult=>`★ STR +${tier*mult}`}],bp:()=> '伯爵斗篷'});
  const options=e.api.baseOptions('garment');assert.equal(options[0][0],'2507');
  assert(options[0][1].includes('[T1] [T3]'));assert(options[0][1].includes('+10 最大 HP'));assert(options[0][1].includes('STR +T'));
});
test('base details explicitly distinguish unlisted drop sources and no inherent affixes',()=>{
  const e=setup();e.api.setSmithData({2507:{slot:'garment',bonuses:[]}},{manifest:{items:{2507:{name:'測試披肩'}}}});
  e.api.setGameCatalog({ca:{},cb:{},bs:()=>[]});const label=e.api.baseDetails(2507);
  assert(label.includes('Tier 未列'));assert(label.includes('無額外詞條'));
});
test('multiple bases are OR while the part condition remains required',()=>{
  const e=gearEnv();const rule={type:'slot',slot:'weapon',base:['1101','1163']};
  assert(e.api.validRule(rule));for(const itemId of [1101,1163])assert(e.api.matchesRule(rule,{itemId,tier:3,affixes:[]}));
  assert(!e.api.matchesRule(rule,{itemId:2101,tier:3,affixes:[]}));
  const imported=e.api.parseFilterImport(JSON.stringify({format:'ro-helper-unwanted',version:1,name:'多基底',rule}));assert.equal(imported.rule.base.length,2);
});
test('multi-select attributes use OR within each field and distinct attributes across two fields',()=>{
  const e=gearEnv();const make=stats=>({itemId:1101,tier:3,affixes:stats.map(stat=>({stat}))});
  assert(e.api.matchesRule({type:'primary',first:['str','luk']},make(['luk','dex'])));
  assert(!e.api.matchesRule({type:'primary',first:['str','luk']},make(['agi','dex'])));
  assert(e.api.matchesRule({type:'primary',first:['str','luk'],second:['dex','agi']},make(['str','agi'])));
  assert(!e.api.matchesRule({type:'primary',first:['str','luk'],second:['str','luk']},make(['str'])));
  assert(e.api.matchesRule({type:'primary',first:['str','luk'],second:['str','luk']},make(['str','luk'])));
});
test('multiple secondary and skill entries use OR within their field',()=>{
  const e=gearEnv();const item={itemId:1101,tier:3,affixes:[{stat:'cd'},{stat:'hp'},{stat:'skill',skill:'magnum'}]};
  assert(e.api.matchesRule({type:'secondary',third:['crit','cd'],fourth:['hp','flee']},item));
  assert(!e.api.matchesRule({type:'secondary',third:['crit','area'],fourth:['hp','flee']},item));
  assert(e.api.matchesRule({type:'skill',skill:['bash','magnum']},item));
  assert(!e.api.validRule({type:'primary',first:[],second:['str']}));
});
test('Tier formulas scale changing values and preserve fixed interval numbers',()=>{
  const e=setup();assert.equal(e.api.tierFormula({text:n=>`★ +${n} VIT`}),'+T VIT');
  assert.equal(e.api.tierFormula({text:n=>`★ 最大HP +${8*n}%`}), '最大HP +T×8%');
  assert.equal(e.api.tierFormula({text:n=>`★ 每 5 秒回復 ${2*n} HP`}), '每 5 秒回復 T×2 HP');
});
test('base multi-select renders library-style Tier tags and formula text',()=>{
  const e=setup();const control=e.api.formMulti([['2507','伯爵斗篷 ｜ [T3] ｜ +T VIT',{name:'伯爵斗篷',tiers:[3],tierNote:'',bonuses:'+T VIT'}]],[],()=>{});
  assert.equal(control.querySelector('.wk-star em').textContent,'T3');
  assert(control.querySelector('.ro-filter-base-info').textContent.includes('+T VIT'));
  assert(!control.textContent.includes('自帶（T1）'));
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
test('rarity rule supports multiple OR choices and default common quality',()=>{
  const e=gearEnv();const rule={type:'rarity',values:['1','4']};
  assert(e.api.validRule(rule));
  for(const quality of [1,4])assert(e.api.matchesRule(rule,{itemId:1101,quality,affixes:[]}));
  assert(!e.api.matchesRule(rule,{itemId:1101,quality:3,affixes:[]}));
  assert(e.api.matchesRule({type:'rarity',values:['0']},{itemId:1101,affixes:[]}));
  assert(!e.api.validRule({type:'rarity',values:[]}));assert(!e.api.validRule({type:'rarity',values:['5']}));
});
test('AND OR with one child behave exactly as that child',()=>{
  const e=gearEnv();for(const type of ['and','or']){
    const rule={type,children:[tierRule('<=',2)]};assert(e.api.validRule(rule));
    assert(e.api.matchesRule(rule,{itemId:1101,tier:2,affixes:[]}));assert(!e.api.matchesRule(rule,{itemId:1101,tier:3,affixes:[]}));
  }
});
test('rule arrows reorder siblings, preserve nested content and disable at boundaries',()=>{
  const e=gearEnv();const rule={type:'or',children:[tierRule('=',1),{type:'and',children:[{type:'slot',slot:'shield'}]},tierRule('=',3)]};
  e.api.setFilterStore({version:1,activeId:'a',profiles:[{id:'a',name:'排序',rule}]});e.api.openFilter();
  let boxes=e.document.querySelectorAll('.ro-filter-rule');assert(boxes[0].querySelector('[data-filter-move="up"]').disabled);
  assert(boxes[1].querySelector('[data-filter-move="up"]').disabled);
  boxes[1].querySelector('[data-filter-move="down"]').click();
  boxes=e.document.querySelectorAll('.ro-filter-rule');assert.equal(boxes[1].querySelector(':scope > .ro-filter-rule-header > select').value,'and');
  boxes[1].querySelector('[data-filter-move="down"]').click();
  boxes=e.document.querySelectorAll('.ro-filter-rule');boxes[2].querySelector('[data-filter-move="down"]').click();
  e.document.querySelector('[data-filter-save]').click();
  const saved=e.api.getFilterStore().profiles[0].rule;assert.equal(saved.children[0].value,1);assert.equal(saved.children[1].value,3);assert.equal(saved.children[2].type,'and');assert.equal(saved.children[2].children[0].slot,'shield');
});
test('wrap existing root in AND OR NOT preserves the exact rule and saves successfully',()=>{
  for(const type of ['and','or','not']){
    const e=gearEnv();const original={type:'primary',first:['str','luk']};
    e.api.setFilterStore({version:1,activeId:'a',profiles:[{id:'a',name:'包入',rule:original}]});e.api.openFilter();
    const control=e.document.querySelector('[data-filter-wrap]');control.querySelector(`option[value="${type}"]`).selected=true;control.onchange();
    e.document.querySelector('[data-filter-save]').click();const rule=e.api.getFilterStore().profiles[0].rule;
    assert.equal(rule.type,type);assert.equal(rule.children.length,1);assert.equal(JSON.stringify(rule.children[0]),JSON.stringify(original));
  }
});
test('wrap nested subtree without losing its siblings or descendants',()=>{
  const e=gearEnv();const original={type:'and',children:[tierRule('<=',2),{type:'slot',slot:'shield'}]};
  e.api.setFilterStore({version:1,activeId:'a',profiles:[{id:'a',name:'巢狀',rule:{type:'or',children:[original,tierRule('=',3)]}}]});e.api.openFilter();
  const subtree=e.document.querySelectorAll('.ro-filter-rule')[1],control=subtree.querySelector(':scope > .ro-filter-rule-header > [data-filter-wrap]');
  control.querySelector('option[value="not"]').selected=true;control.onchange();e.document.querySelector('[data-filter-save]').click();
  const root=e.api.getFilterStore().profiles[0].rule;assert.equal(root.children[1].value,3);assert.equal(root.children[0].type,'not');assert.equal(JSON.stringify(root.children[0].children[0]),JSON.stringify(original));
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
  const e=setup();const calls=[];const ctx={beginPath(){},arc(){},stroke(){},fillRect(){},drawImage(){},rotate(){},restore(){},save(){},setTransform(){},setLineDash(){},ellipse(...args){calls.push(args);}};
  e.api.patchMinimapContext(ctx);e.api.setActiveGame({map:{width:100,height:100},player:{x:3200,y:3200},logicReach:()=>900});
  ctx.drawImage({naturalWidth:512,naturalHeight:512},0,0,512,512,0,0,200,200);ctx.rotate(0);ctx.restore();assert.equal(calls.length,0);
  e.api.setShowRing(true);ctx.rotate(0);ctx.restore();assert.equal(calls.length,2);assert.equal(calls[0][0],100);assert.equal(calls[0][2],990/6400*200);
});
console.log(`${count} tests passed`);
