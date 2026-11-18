const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{parseHTML}=require('linkedom');
const native=JSON.parse(fs.readFileSync('tests/fixtures/stat-caps-native.json','utf8'));
function setup(){
 const {window}=parseHTML('<html><body><section id="charpanel"><button class="tab-btn active" data-tab="stats"></button><button class="tab-btn" data-tab="equip"></button><div id="cp-slots"><div class="equip-slot sel" data-slot="weapon"></div></div><div id="cp-stats"></div></section></body></html>');
 const ctx=vm.createContext({document:window.document,console});
 vm.runInContext(fs.readFileSync('src/stat-caps.js','utf8')+native.diminishing+`
 const es=definition=>({...definition}),dr=character=>character.base,be=()=>({rank:1});
 const Uh=character=>({applyStats:stats=>character.modifiers.forEach(fn=>fn(stats))});
 const Zm=stats=>{stats.flee+=.1;};const dw=t9;
 ${native.lobbyStats}
 globalThis.character={job:'test',base:{maxHp:100,damageReduction:0,flee:.03,areaMult:1,reachMult:1,speedMult:1,critChance:.03},modifiers:[stats=>{stats.damageReduction+=.9;stats.flee+=.6;stats.areaMult+=3;stats.reachMult+=4;stats.speedMult+=1;stats.critChance+=1.2;}]};
 const labels={damageReduction:'受到的傷害',flee:'Flee（迴避）',areaMult:'範圍',reachMult:'近戰距離',speedMult:'速度',critChance:'爆擊'};
 globalThis.redraw=()=>{const stats=Hk(character);document.querySelector('#cp-stats').innerHTML=Object.entries(labels).map(([key,label])=>'<div class="stat-chip"><span>'+label+'</span><b>'+statCapText(key,stats[key])+'</b></div>').join('');return stats;};
 let Bt='weapon',j=null,C=null;globalThis.redrawCount=0;
 const I=()=>{redrawCount++;document.querySelector('#cp-slots').innerHTML='<div class="equip-slot sel" data-slot="'+Bt+'"></div>';bindSlot();return redraw();};
 const wg=tab=>{for(const button of document.querySelectorAll('.tab-btn'))button.classList.toggle('active',button.dataset.tab===tab);};
 function bindSlot(){const ne=document.querySelector('.equip-slot');ne.onclick=${native.slotHandler};}bindSlot();
 for(const S of document.querySelectorAll('.tab-btn'))S.onclick=${native.tabHandler};
 globalThis.api={update:updateStatCapDisplay,capture:withStatCapCapture,snapshot:statCapSnapshot,native:Hk,foreach:()=>Array.prototype.forEach,slot:()=>Bt};
 `,ctx);
 return {ctx,api:ctx.api,document:window.document};
}
{
 const e=setup(),original=e.api.foreach(),baseline=e.api.native(e.ctx.character);e.ctx.redraw();e.api.update();
 const value=key=>e.document.querySelector('[data-ro-stat-raw="'+key+'"]').parentElement.textContent;
 assert.equal(value('damageReduction'),'-60% (-90%)');assert.equal(value('flee'),'50% (73%)','raw includes primary-stat additions before cap');
 for(const [label,text] of [['範圍','+120%'],['近戰距離','+133.3%'],['速度','+66.7%']]){
  const row=[...e.document.querySelectorAll('.stat-chip')].find(row=>row.querySelector('span').textContent===label);
  assert.equal(row.querySelector('b').textContent,text,'diminishing returns retain native value without parentheses');
 }
 assert.equal(value('critChance'),'100% (123%)');
 e.api.update();assert.equal(e.document.querySelectorAll('[data-ro-stat-raw]').length,3);
 assert.equal(e.ctx.redrawCount,1,'native stats tab does not redraw; selected equipment slot is used once');assert.equal(e.api.slot(),'weapon');assert(e.document.querySelector('[data-tab="stats"]').classList.contains('active'));
 assert.equal(e.api.foreach(),original);const after=e.api.native(e.ctx.character);assert.deepEqual(JSON.parse(JSON.stringify(after)),JSON.parse(JSON.stringify(baseline)),'UI observation leaves all native effective values unchanged');assert.equal(e.ctx.character.base.damageReduction,0);
 vm.runInContext('character.modifiers=[stats=>{stats.flee+=.01;stats.damageReduction+=.2;}];',e.ctx);
 // Simulate a native asynchronous equip/save redraw outside the capture scope.
 e.ctx.redraw();assert.equal(e.document.querySelectorAll('[data-ro-stat-raw]').length,0,'old uncapped values are invalidated');e.api.update();assert.equal(e.document.querySelectorAll('[data-ro-stat-raw]').length,0,'below-cap values have no parentheses');
 vm.runInContext('character.base.flee=0;character.base.critChance=1;character.modifiers=[stats=>{stats.flee=.4;stats.damageReduction=.6;}];',e.ctx);
 e.ctx.redraw();e.api.update();assert.equal(e.document.querySelectorAll('[data-ro-stat-raw]').length,0,'values exactly at the hard cap have no overflow');
}
{
 const e=setup(),original=e.api.foreach();let observed;
 assert.throws(()=>e.api.capture(()=>{observed=e.api.native(e.ctx.character);throw Error('native failure');}),/native failure/);
 assert.equal(e.api.foreach(),original);for(const key of ['damageReduction','flee','areaMult'])assert.equal(Object.getOwnPropertyDescriptor(observed,key).get,undefined,'stats properties restored after exception');
 assert.equal(observed.damageReduction,.6);assert.equal(observed.flee,.5);
}
{
 const e=setup();let redraws=0;e.document.querySelector('.equip-slot').onclick=()=>{redraws++;e.document.querySelector('#cp-stats').innerHTML='<div class="stat-chip"><span>Flee</span><b>50%</b></div>';};
 e.api.update();e.api.update();e.api.update();assert.equal(redraws,1,'unknown native implementations do not cause redraw loops');assert.equal(e.document.querySelectorAll('[data-ro-stat-raw]').length,0,'no invented raw values');
}
{
 const e=setup();e.ctx.redraw();e.document.querySelector('[data-tab="equip"]').click();e.api.update();assert.equal(e.ctx.redrawCount,0);assert.equal(e.document.querySelectorAll('[data-ro-stat-raw]').length,0);
 e.document.querySelector('[data-tab="stats"]').click();assert.equal(e.ctx.redrawCount,0,'real native tab handler only switches visibility');e.api.update();
 assert.equal(e.ctx.redrawCount,1);assert.equal(e.document.querySelector('[data-ro-stat-raw="damageReduction"]').textContent,' (-90%)');assert.equal(e.api.slot(),'weapon');
}
console.log('Stat caps: real native tab/slot handlers, selected-slot redraw, uncapped totals, equip invalidation and exception restoration passed');
