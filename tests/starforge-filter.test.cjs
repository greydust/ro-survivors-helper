const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{parseHTML}=require('linkedom');
const {window}=parseHTML('<html><head></head><body></body></html>');delete window[Symbol.for('greydust.ro.helper.runtime')];
const items=[{uid:'sword',itemId:1,quality:4},{uid:'mid',itemId:2,quality:4},{uid:'low',itemId:3,quality:3},{uid:'ring',itemId:4,quality:4}].map(x=>({...x,star:0,cards:[],affixes:[]}));
const defs={1:{slot:'weapon',wtype:'검'},2:{slot:'head_mid'},3:{slot:'head_low'},4:{slot:'acc'}};
const manifest={items:Object.fromEntries(Object.keys(defs).map(id=>[id,{icon:id+'.png'}]))};
const ctx=vm.createContext({window,document:window.document,Element:window.Element,MouseEvent:window.Event,URL,location:{href:'https://ro.hans-webgametw.com/'},console,MutationObserver:class{observe(){}},localStorage:{getItem(){return null},setItem(){}},performance:{now:()=>1},innerWidth:1200,innerHeight:800,setTimeout(){},clearTimeout(){},queueMicrotask:()=>{}});
const bundle=fs.readFileSync('dist/RO倖存者助手.user.js','utf8');
vm.runInContext(bundle.replace(/\}\)\(\);\s*$/,'globalThis.filterAPI={update:updateStarforgeFilters,setup:(d,a)=>{smithDefs=d;smithAssets=a;},starState};})();'),ctx);ctx.filterAPI.setup(defs,{manifest});
ctx.G={C:{CSS:'',max:10,step:1.05,low:5,ore:{weapon:[1,2],armor:[1,2]},rore:{weapon:[1,2],armor:[1,2]},oreName:{},rfee:1},
 ze:()=>({id:'c',inventory:items}),ye:()=>defs,blocked:()=>new Set(),vis:()=>true,worn:()=>false,gs:()=>100,os:x=>x.uid,img:id=>'/assets/'+id+'.png',qc:()=>'',ma:()=>({}),go:()=>[],cn:()=>[],et:()=>({materials:{1:100,2:100},kafra:10000}),ut:String,oe:()=>({3:{name:'史詩'},4:{name:'傳說'}}),ue:id=>window.document.getElementById(id).classList.remove('hidden'),ce:id=>window.document.getElementById(id).classList.add('hidden'),rr:()=>true,wa:()=>{},snd:()=>{}};
const native=JSON.parse(fs.readFileSync('tests/fixtures/starforge-native.json','utf8'));vm.runInContext(native.runtime+'(G);RO_SF.open();',ctx);
const d=window.document,visible=()=>[...d.querySelectorAll('#sf-list .cand:not([data-ro-star-filtered])')].map(n=>n.dataset.uid);
function choose(key){d.querySelector('[data-ro-star-category="'+key+'"]').click();}
ctx.filterAPI.update();ctx.filterAPI.update();assert.equal(d.querySelectorAll('[data-ro-star-filters]').length,1);assert.equal(d.querySelector('.sf-top').nextElementSibling.dataset.roStarFilters,'');
assert(!d.querySelector('[data-ro-star-category="weapon"]'));assert(!d.querySelector('[data-ro-star-category="armor"] span').textContent.includes('防具'));
choose('head_mid');assert.deepEqual(visible(),['mid']);assert.equal(d.querySelector('#sf-list .sel').dataset.uid,'mid');assert.equal(items.length,4);
choose('head_low');assert.deepEqual(visible(),['low']);
d.querySelector('[data-sft="reroll"]').click();ctx.filterAPI.update();assert.deepEqual(visible(),[],'native reroll excludes nonlegendary pieces');assert(d.querySelector('#sf-go').hidden);assert(d.querySelector('#sf-detail').hidden);assert.equal(ctx.filterAPI.starState(),null);
choose('acc');assert.deepEqual(visible(),['ring']);assert.equal(d.querySelector('#sf-list .sel').dataset.uid,'ring');assert(!d.querySelector('#sf-go').hidden);
choose('all');assert.deepEqual(visible(),['sword','mid','ring']);
d.querySelector('[data-sft="star"]').click();ctx.filterAPI.update();assert.equal(visible().length,4);
assert.equal(items.map(i=>i.star).join(','),'0,0,0,0');assert.equal(items.map(i=>i.uid).join(','),'sword,mid,low,ring');
console.log('Starforge native filters: detailed slots, safe selection, both tabs, native legendary restriction, empty categories and unchanged inventory passed');
