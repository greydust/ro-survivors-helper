const {parseHTML}=require('linkedom');
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
 const {window}=parseHTML('<html><head></head><body class="in-lobby"><div id="lobby-ui"></div><div id="smith" class="overlay"><div id="smith-filters"><button data-f="all" class="active">全部</button></div><div id="smith-list"></div><div id="smith-detail"><div class="ref-ladder"><span class="done"></span><span></span></div></div><button id="smith-go"></button></div></body></html>');
 delete window[Symbol.for('greydust.ro.helper.runtime')];
 const browserWindow=new Proxy(window,{get:(target,key)=>key==='navigator'?{userAgent:'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1'}:Reflect.get(target,key)});
 const observers=[];let callbacks=0,overflow=false;
 class Observer extends window.MutationObserver{constructor(callback){super(records=>{if(++callbacks>40){overflow=true;this.disconnect();return;}callback(records);});observers.push(this);}}
 const context=vm.createContext({window:browserWindow,document:window.document,Element:window.Element,MutationObserver:Observer,URL,location:{href:'https://ro.hans-webgametw.com/'},console,performance,innerWidth:390,innerHeight:844,queueMicrotask,localStorage:{getItem:()=>null,setItem(){}},setTimeout:(fn,ms)=>{const t=setTimeout(fn,ms);t.unref();return t;},clearTimeout});
 const source=fs.readFileSync('dist/RO倖存者助手.user.js','utf8');
 vm.runInContext(source.replace(/\}\)\(\);\s*$/,'globalThis.api={scan,updateSmith,setup:(defs,assets)=>{smithDefs=defs;smithAssets=assets;}};})();'),context);
 const d=window.document;
 const defs={1:{slot:'weapon',wtype:'검'},2:{slot:'shield'}};
 context.api.setup(defs,{manifest:{items:{1:{icon:'items/1.png'},2:{icon:'items/2.png'}}}});
 d.querySelector('#smith-list').innerHTML=Array.from({length:200},(_,i)=>'<div class="cand'+(i===0?' sel':'')+'" data-uid="'+i+'"><div class="ico"><img src="assets/items/'+(i%2+1)+'.png"></div><span class="gs"><b>123</b></span></div>').join('');
 let redraws=0;d.querySelector('[data-f="all"]').onclick=()=>{redraws++;throw Error('Opening Safari smith must not replay native list render');};
 const settle=()=>new Promise(resolve=>setTimeout(resolve,30));
 try{
  context.api.scan();await settle();assert(!overflow);assert.equal(redraws,0);
  assert.equal(d.querySelector('[data-ro-smith-category="shield"] small').textContent,'100');
  assert(d.querySelector('#ro-auto-refine'));assert(!d.querySelector('[data-ro-smith-base-gs]'));assert.equal(d.querySelector('.gs b').textContent,'123');
  const stable=callbacks;for(let i=0;i<10;i++)context.api.updateSmith();await settle();assert.equal(callbacks,stable,'idle smith must perform zero DOM writes');
  d.querySelector('[data-ro-smith-category="shield"]').click();await settle();assert(!overflow);assert.equal(d.querySelectorAll('[data-ro-smith-filtered]').length,100);assert.equal(redraws,0);
  d.body.insertAdjacentHTML('beforeend','<div id="starforge" class="overlay"><div class="sf-top"><button data-sft="reroll" class="active"></button></div><div id="sf-list"><div class="cand sel" data-uid="sf"><div class="ico"><img src="assets/items/2.png"></div></div></div><div id="sf-detail"></div><button id="sf-go"></button></div>');
  context.api.scan();await settle();assert(!overflow);assert(d.querySelector('#ro-auto-star').hidden);
  const starStable=callbacks;for(let i=0;i<10;i++)context.api.updateSmith();await settle();assert.equal(callbacks,starStable,'reroll must not repeatedly show and hide auto-star controls');
  assert.equal(d.querySelector('[data-ro-star-category="shield"] small').textContent,'1');
  console.log('PASS Safari smith: 200 rows, no automatic native redraw, unchanged GS, working categories/controls, zero idle DOM writes and stable reroll');
 }finally{observers.forEach(o=>o.disconnect());}
})().catch(error=>{console.error(error);process.exitCode=1;});
