const {parseHTML}=require('linkedom');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'dist/RO倖存者助手.user.js'),'utf8');
const native=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/inventory-native.json'),'utf8'));
function setup({realObserver=false}={}){
 const {window}=parseHTML('<html><head></head><body></body></html>');delete window[Symbol.for('greydust.ro.helper.runtime')];delete window.visualViewport;
 const observers=[],observation={count:0,overflow:false};
 class CountingObserver extends window.MutationObserver{
  constructor(callback){super(records=>{if(++observation.count>50){observation.overflow=true;this.disconnect();return;}callback(records);});observers.push(this);}
 }
 const context=vm.createContext({window,document:window.document,Element:window.Element,MouseEvent:window.Event,URL,location:{href:'https://ro.hans-webgametw.com/'},
  localStorage:{getItem(){return null;},setItem(){}},MutationObserver:realObserver?CountingObserver:class{observe(){}},console,performance:{now:()=>2000},innerWidth:402,innerHeight:714,
  queueMicrotask:fn=>fn(),setTimeout:()=>1,clearTimeout(){}});
 vm.runInContext(source.replace(/\}\)\(\);\s*$/,'globalThis.inventoryAPI={updateInventoryViews,updateEquipCandidates,withInventoryView,withNativeCardPreview,inventoryPreviewItem,inventoryBonusLines,setDefs:value=>smithDefs=value,setCatalog:value=>gameCatalog=value,setSkills:value=>skillDefs=value,prototypes:()=>[Array.prototype.find,Array.prototype.filter]};})();'),context);
 const defs={1:{slot:'weapon',wtype:'검',bonuses:[]},2:{slot:'weapon',wtype:'단검',bonuses:[]},3:{slot:'weapon',wtype:'양손검',bonuses:[]},4:{slot:'head_top',bonuses:[]},5:{slot:'head_mid',bonuses:[]},6:{slot:'head_low',bonuses:[]},7:{slot:'armor',bonuses:[]}};
 context.inventoryAPI.setDefs(defs);
 return {window,document:window.document,context,api:context.inventoryAPI,run:code=>vm.runInContext(code,context),observation,disconnect:()=>observers.forEach(observer=>observer.disconnect())};
}
function fixtureFilters(e,storage=false){
 e.document.body.insertAdjacentHTML('beforeend',storage?'<section id="kstorage"><div id="ks-top"><span id="ks-filt"></span><input id="ks-q" type="search"></div><div id="ks-bag"></div><div id="ks-st"></div><button id="ks-bp-next">Next</button></section>':'<section id="charpanel"><div id="cp-inv-filters"></div><div id="cp-inventory"></div></section>');
 e.context.storageFixture=storage;
 e.run(`globalThis.gear=Array.from({length:130},(_,i)=>({uid:'g'+i,itemId:i<65?1:i<125?3:4+(i-125)%3,cards:[],owner:i%2?'@ks1':undefined}));
  globalThis.filterPage=0;let nativeFilter='all';
  globalThis.drawFilters=()=>{
   const f=document.querySelector(storageFixture?'#ks-filt':'#cp-inv-filters');
   f.innerHTML=['all','weapon','head','armor'].map(id=>'<button data-f="'+id+'" class="inv-chip '+(id===nativeFilter?'active':'')+'">'+id+'</button>').join('');
   for(const b of f.querySelectorAll('button'))b.onclick=()=>{if(nativeFilter!==b.dataset.f)filterPage=0;nativeFilter=b.dataset.f;drawFilters();};
   const allGear=gear.filter(item=>true);globalThis.nativeBulk=()=>allGear.filter(item=>!!item.owner).length;
   const G={id:nativeFilter},D=(category,item)=>category.id==='all'||category.id==='weapon'&&item.itemId<=3||category.id==='head'&&item.itemId>=4&&item.itemId<=6;
   const passes=item=>D(G,item);const chosen=storageFixture?allGear.filter(passes):allGear.filter(item=>D(G,item));
   const render=items=>items.slice(filterPage*60,(filterPage+1)*60).map(item=>'<div data-uid="'+item.uid+'"></div>').join('');
   if(storageFixture){document.querySelector('#ks-bag').innerHTML=render(chosen.filter(item=>!item.owner));document.querySelector('#ks-st').innerHTML=render(chosen.filter(item=>item.owner));document.querySelector('#ks-bp-next').onclick=()=>{filterPage++;drawFilters();};}
   else document.querySelector('#cp-inventory').innerHTML=render(chosen);
  };drawFilters();`);
 e.api.updateInventoryViews();
}
for(const storage of [false,true]){
 const e=setup();fixtureFilters(e,storage);const before=e.run('JSON.stringify(gear)');
 const panel=e.document.querySelector(storage?'#kstorage':'#charpanel');
 assert(panel.querySelector('[data-f="weapon"]').hidden);assert(panel.querySelector('[data-f="head"]').hidden);
 panel.querySelector('[data-ro-inventory-category="twohand"]').click();
 const cells=()=>[...panel.querySelectorAll(storage?'#ks-bag [data-uid],#ks-st [data-uid]':'#cp-inventory [data-uid]')];
 assert(cells().length>0);assert(cells().every(row=>Number(row.dataset.uid.slice(1))>=65&&Number(row.dataset.uid.slice(1))<125));
 assert(panel.querySelector('[data-ro-inventory-subtypes]').textContent.includes('雙手劍'));
 assert.equal(e.run('nativeBulk()'),65,'native bulk action must retain the complete page/account scope');
 panel.querySelector('[data-ro-inventory-category="head_mid"]').click();assert(cells().every(row=>[126,129].includes(Number(row.dataset.uid.slice(1)))));
 panel.querySelector('[data-f="all"]').click();assert(cells().some(row=>Number(row.dataset.uid.slice(1))<65));
 assert.equal(e.run('JSON.stringify(gear)'),before);
 console.log('PASS '+(storage?'storage':'backpack')+' split categories filter before pagination and preserve inventory');
}
{
 const e=setup();fixtureFilters(e,true);
 e.run("gear=Array.from({length:210},(_,i)=>({uid:'p'+i,itemId:i<140?1:3,cards:[],owner:'@ks1'}));drawFilters();");e.api.updateInventoryViews();
 e.document.querySelector('[data-ro-inventory-category="twohand"]').click();
 assert.equal(e.document.querySelectorAll('#ks-st [data-uid]').length,60);assert.equal(e.document.querySelector('#ks-st [data-uid]').dataset.uid,'p140');
 e.document.querySelector('#ks-bp-next').click();assert.equal(e.document.querySelectorAll('#ks-st [data-uid]').length,10);assert.equal(e.run('nativeBulk()'),210);
 e.document.querySelector('[data-ro-inventory-category="onehand"]').click();assert.equal(e.run('filterPage'),0);assert.equal(e.document.querySelector('#ks-st [data-uid]').dataset.uid,'p0');
 console.log('PASS warehouse filters precede the 60-item page and category changes reset pagination');
}
{
 const e=setup();fixtureFilters(e);e.document.querySelector('[data-ro-inventory-category="onehand"]').click();
 const sub=e.document.querySelector('[data-ro-inventory-subtypes]');assert(sub.textContent.includes('短劍'));assert(sub.textContent.includes('單手劍'));
 [...sub.querySelectorAll('button')].find(button=>button.textContent==='短劍').click();assert.equal(e.document.querySelectorAll('#cp-inventory [data-uid]').length,0);
 e.run("gear.push({uid:'new-dagger',itemId:2,cards:[]});drawFilters();");e.api.updateInventoryViews();assert.equal(e.document.querySelector('#cp-inventory [data-uid]').dataset.uid,'new-dagger');
 console.log('PASS subtype selection survives native redraw and empty categories');
}
function nativeComparison(e,{cards=[101,102],candidateCards=[null,null],newItem=false,rebuild=false}={}){
 e.document.body.insertAdjacentHTML('beforeend','<section id="charpanel"><div id="cp-eq-current"><div class="eq-name"></div></div><div id="cp-eq-cmp"></div><div id="cp-eq-list"></div></section>');
 e.context.fixtureOptions={cards,candidateCards,newItem,rebuild};e.context.fixtureNative=native;
 e.run(`
 const ye={1:{slot:'weapon'},2:{slot:'weapon'},3:{slot:'weapon',two:true},7:{slot:'shield'}};
 globalThis.account={inventory:[{uid:'old',itemId:1,cards:fixtureOptions.cards,affixes:[],base:100},{uid:'new',itemId:2,cards:fixtureOptions.candidateCards,affixes:[],base:120,isNew:fixtureOptions.newItem},{uid:'shield',itemId:7,cards:[],affixes:[],base:10}],equipped:{weapon:'old',shield:'shield'}};
 globalThis.saves=0;globalThis.equips=0;
 const t=account,Bt='weapon',ue=id=>document.getElementById(id),u=id=>id?t.inventory.find(item=>item.uid===id):undefined;
 const cardScore=id=>id===101?30:50,p=item=>item.base+item.cards.reduce((sum,id)=>sum+(id?cardScore(id):0),0);
 const qn=()=>true,_n=()=>true,J1=()=>false,zC=()=>['weapon'],RO_EQJ=()=>'',Qi=def=>!!def?.two,Uk=(ch,slot)=>ye[ch.inventory.find(item=>item.uid===ch.equipped[slot])?.itemId];
 ${native.equip}
 const R=ch=>({atk:Object.values(ch.equipped).reduce((sum,uid)=>{const item=ch.inventory.find(item=>item.uid===uid);return sum+(item?p(item):0);},0)});
 const Zj=[['ATK',stats=>stats.atk,'int']],Bv=value=>String(value),c=value=>value,De=value=>value,$e=()=>'',d=()=>'',l=item=>item.uid;
 const h=()=>({name:'Weapon'}),f=(score,diff=0)=>'<span class="gs">GS <b>'+score+'</b>'+(diff?'<i>'+diff+'</i>':'')+'</span>',v=()=>'',m=()=>'',w=()=>'',y=()=>[],k=()=>'',Am=()=>'',lm=()=>null;
 const z=()=>{},UC=()=>{},O={ui(){}},n=()=>{},la=()=>{};
 const T=()=>t.inventory.filter(item=>item.uid==='new').map(item=>({g:item,s:p(item)}));
 let j=null,C=null;
 const L=${native.compare},render=${native.render};
 render();
 const list=ue('cp-eq-list');
 const drawList=()=>{
  list.innerHTML='<div class="cand'+(C==='new'?' sel':'')+'" data-uid="new"><div class="cand-info"><b>new</b><small>STR 1</small></div><div class="cand-side">'+f(p(u('new')),p(u('new'))-p(u('old')))+'<button class="cand-eq">Equip</button></div></div>';
  const row=list.firstElementChild;
  row.onpointerenter=event=>{if(event.pointerType==='mouse'&&j!=='new'){j='new';render();}};
  row.onclick=()=>{j=C='new';const item=u('new');if(item.isNew){delete item.isNew;saves++;if(fixtureOptions.rebuild){drawList();render();return;}}list.querySelector('.cand').classList.add('sel');render();};
  row.querySelector('button').onclick=event=>{event.stopPropagation();equips++;Fy(account,'new','weapon');};
 };drawList();
 list.onpointerleave=()=>{if(j!==C){j=C;render();}};
 globalThis.nativeRender=()=>{j='new';render();};globalThis.nativeStats=()=>R(t);globalThis.nativeSetSelection=uid=>{j=uid;};
 `);
}
{
 const e=setup();nativeComparison(e);const before=e.run('JSON.stringify(account)');
 e.api.updateEquipCandidates();
 assert.equal(e.document.querySelector('#cp-eq-list .gs b').textContent,'200');
 e.document.querySelector('#cp-eq-list .cand').onpointerenter({pointerType:'mouse'});
 assert.equal(e.document.querySelector('#cp-eq-cmp .gs b').textContent,'200');
 assert(e.document.querySelector('#cp-eq-cmp .cmp-rows').textContent.includes('210'));
 assert(e.document.querySelector('[data-ro-card-preview]').textContent.includes('2 張'));
 assert.equal(e.run('JSON.stringify(account)'),before);assert.equal(e.run('saves'),0);
 e.document.querySelector('#cp-eq-list .cand-eq').click();assert.equal(e.run('equips'),1);assert.equal(e.run("account.equipped.weapon"),'new');assert.equal(e.run("account.inventory[1].cards.filter(Boolean).length"),0);
 console.log('PASS native GS and stat comparison use cloned cards while actual equip remains native and empty');
}
for(const [candidateCards,expected,count] of [[[null],150,1],[[999,null],170,null],[[],120,null]]){
 const e=setup();nativeComparison(e,{candidateCards});const before=e.run('JSON.stringify(account)');e.api.updateEquipCandidates();
 e.document.querySelector('#cp-eq-list .cand').onpointerenter({pointerType:'mouse'});
 assert.equal(Number(e.document.querySelector('#cp-eq-cmp .gs b').textContent),expected);
 const note=e.document.querySelector('[data-ro-card-preview]');if(count)assert(note.textContent.includes('1 張因插槽不足'));else if(!candidateCards.length)assert(note.textContent.includes('沒有插槽'));else assert(!note);
 assert.equal(e.run('JSON.stringify(account)'),before);
}
console.log('PASS fewer sockets, existing cards and zero sockets follow native capacity without mutating data');
{
 const e=setup();nativeComparison(e,{newItem:true});e.api.updateEquipCandidates();e.document.querySelector('#cp-eq-list .cand').click();
 assert.equal(e.run('saves'),1);assert.equal(e.run('equips'),0);assert.equal(e.run('account.inventory[1].cards[0]'),null);assert.equal(e.document.querySelector('#cp-eq-cmp .gs b').textContent,'200');
 console.log('PASS selecting a new item preserves the single native save and does not transfer cards');
}
{
 const e=setup();nativeComparison(e,{newItem:true,rebuild:true});e.api.updateEquipCandidates();e.document.querySelector('#cp-eq-list .cand').click();
 assert.equal(e.run('saves'),1);assert.equal(e.document.querySelector('#cp-eq-cmp .gs b').textContent,'200');assert.equal(e.run('account.inventory[1].cards[0]'),null);
 console.log('PASS native new-item rerender retains same-card preview without another save');
}
{
 const e=setup();nativeComparison(e);e.run('account.inventory[1].itemId=3;');const before=e.run('JSON.stringify(account)');e.api.updateEquipCandidates();e.document.querySelector('#cp-eq-list .cand').onpointerenter({pointerType:'mouse'});
 assert(e.document.querySelector('.cmp-rows').textContent.includes('200'));assert(!e.document.querySelector('.cmp-rows').textContent.includes('210'));assert.equal(e.run('JSON.stringify(account)'),before);
 console.log('PASS native two-handed equip preview also removes shield contributions');
}
{
 const e=setup(),before=e.api.prototypes();
 assert.throws(()=>e.api.withInventoryView(()=>{throw Error('render failed');},{category:'all',type:''}),/render failed/);
 assert.throws(()=>e.api.withNativeCardPreview(()=>{throw Error('preview failed');},'new'),/preview failed/);
 const after=e.api.prototypes();assert.equal(after[0],before[0]);assert.equal(after[1],before[1]);
 console.log('PASS synchronous read adapters restore native array methods after exceptions');
}
{
 const e=setup();e.run(`inventoryAPI.setDefs({1:{slot:'weapon',bonuses:[{text:mult=>'+fix '+(2*mult)}]}});inventoryAPI.setCatalog({bs:()=>[{text:mult=>'★ '+(3*mult)}],bt:affixes=>affixes.map(affix=>({text:mult=>affix.stat+' '+(affix.value*mult)}))});inventoryAPI.setSkills({bash:{name:'猛擊'}});`);
 const result=e.api.inventoryBonusLines({itemId:1,tier:4,refine:10,affixes:[{stat:'str',value:10},{stat:'flee',value:.03},{stat:'skill',skill:'bash',value:.2}]});
 assert(result.some(([label,value])=>label==='內建'&&value.includes('3.4')&&value.includes('5.1')));assert(result.some(([label,value])=>label==='屬性'&&value.includes('17')));assert(result.some(([label,value])=>label==='技能傷害'&&value==='猛擊 +34%'));
 console.log('PASS complete intrinsic, primary, secondary and skill bonuses include refinement');
}
(async()=>{
 const e=setup({realObserver:true});
 try{
  nativeComparison(e);e.api.updateInventoryViews();await new Promise(resolve=>setTimeout(resolve,30));assert(!e.observation.overflow);
  e.document.querySelector('#cp-eq-list .cand').click();await new Promise(resolve=>setTimeout(resolve,30));assert(!e.observation.overflow);
  const stable=e.observation.count;for(let i=0;i<20;i++)e.api.updateInventoryViews();await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(e.observation.count,stable,'unchanged comparison must perform no DOM writes');assert.equal(e.run('account.inventory[1].cards[0]'),null);
  console.log('PASS native comparison and detail enrichment settle with a real MutationObserver');
 }finally{e.disconnect();}
})().catch(error=>{console.error(error);process.exitCode=1;});
