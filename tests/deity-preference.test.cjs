const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{parseHTML}=require('linkedom');
const native=JSON.parse(fs.readFileSync('tests/fixtures/deity-preference-native.json','utf8'));
const key='greydust.ro.deity-swap-enabled.v1';
function setup(saved){
 const {window}=parseHTML('<html><body><div id="chr-perks"><div class="chr-perk"><div class="chr-info"><b>神格切換</b><div class="chr-pips"><i class="on"></i></div></div><span class="chr-maxed"></span></div></div></body></html>');
 const storage=new Map(saved===undefined?[]:[[key,saved]]),messages=[];
 const context=vm.createContext({window,document:window.document,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},notify:m=>messages.push(m)});
 vm.runInContext(fs.readFileSync('src/deity-preference.js','utf8')+`
 const ws={g_war:{slot:'deity',range:[10,20],unit:true}},Wi=4,Xx=.25,Ih=3,Wa=()=>0,Yx=()=>0,Rv=()=>0,zx=()=>10;
 class Items{constructor(){this.slots=new Map();}${native.slotItems}${native.rollSlot}}
 class Game{constructor(){this.runItems=new Items();this.perksLeft={deity:1};this.banishedItems=new Set();this.focusedItems=new Set();}uselessItems(){return new Set();}${native.chestOpts}}
 globalThis.api={install:installDeitySwapPreference,ui:updateDeitySwapPreferenceUI,game:()=>new Game(),reload:value=>deitySwapEnabled=value};`,context);
 return {api:context.api,document:window.document,storage,messages};
}
{
 const e=setup(),g=e.api.game();e.api.install(g);const wrapped=g.chestOpts;e.api.install(g);assert.equal(g.chestOpts,wrapped,'install once');
 const skills=['bash','firebolt'];g.runItems.slots.set('deity',{item:'bash',vals:[1,1],quality:4});
 const roll=()=>g.runItems.rollSlot('deity',skills,g.chestOpts());
 assert.equal(roll().item,'firebolt','default retains unlocked native replacement');
 e.api.ui();const input=e.document.querySelector('input');assert(input.checked);assert(!input.disabled);
 const toggle=input.parentElement;assert(toggle.classList.contains('opt-check'));assert(input.nextElementSibling.classList.contains('opt-switch'));assert.equal(input.getAttribute('role'),'switch');assert.equal(toggle.parentElement,e.document.querySelector('.chr-perk'));assert.equal(toggle.textContent,'','no extra text');assert(!e.document.querySelector('.chr-maxed'),'toggle replaces completed unlock action');assert(!toggle.hasAttribute('title'));
 input.checked=false;input.onchange();assert.equal(e.storage.get(key),'false');
 const before=JSON.stringify([...g.runItems.slots]);const card=roll();assert.equal(card.item,'bash');assert.equal(card.refine,2,'existing deity continues native refinement');
 assert.deepEqual([...g.runItems.slotItems('deity',skills,g.chestOpts())],['bash']);
 assert.equal(g.chestOpts().banished,g.banishedItems);assert.equal(g.chestOpts().focused,g.focusedItems);assert.equal(g.perksLeft.deity,1);assert.equal(JSON.stringify([...g.runItems.slots]),before);
 input.checked=true;input.onchange();assert.equal(roll().item,'firebolt');
 g.perksLeft.deity=0;assert.equal(g.chestOpts().swap,false,'preference cannot grant locked perk');assert.equal(roll().item,'bash');
 const loaded=setup('false'),fresh=loaded.api.game();loaded.api.install(fresh);assert.equal(fresh.chestOpts().swap,false,'preference persists across pages and runs');
 fresh.runItems.slots.clear();assert.equal(fresh.runItems.rollSlot('deity',skills,fresh.chestOpts()).item,'bash','first deity selection remains available');
 e.api.ui();e.api.ui();assert.equal(e.document.querySelectorAll('[data-ro-deity-swap]').length,1);
 e.document.querySelector('.chr-pips i').classList.remove('on');e.api.ui();assert(!e.document.querySelector('[data-ro-deity-swap]'),'locked perk never shows toggle');
 const locked=setup();locked.document.querySelector('.chr-pips i').classList.remove('on');const unlock=locked.document.createElement('button');unlock.dataset.perk='deity';unlock.onclick=()=>{locked.document.querySelector('.chr-pips i').classList.add('on');unlock.replaceWith(locked.document.createElement('span'));};locked.document.querySelector('.chr-maxed').replaceWith(unlock);locked.api.ui();assert(!locked.document.querySelector('input'));assert.equal(locked.document.querySelector('[data-perk="deity"]'),unlock,'native unlock button remains');unlock.click();locked.api.ui();assert(locked.document.querySelector('input'),'toggle appears after native purchase');
 console.log('PASS native deity replacement toggle, original refinement, first pick, unlock limit, unchanged inventory and persistence');
}
