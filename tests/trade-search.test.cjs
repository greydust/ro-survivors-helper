const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{parseHTML}=require('linkedom');
const {window}=parseHTML('<html><body><div id="trade"><div id="tr-filters"></div><div id="tr-inv"></div><div id="tr-mine-items"><div class="item-cell"></div></div></div></body></html>');
const ctx=vm.createContext({document:window.document,URL,location:{href:'https://ro.hans-webgametw.com/'},smithAssets:{manifest:{items:{1:{icon:'items/1.png'},2:{icon:'items/2.png'}}}}});
vm.runInContext(fs.readFileSync('src/trade-search.js','utf8')+`;tradeItemName=id=>({1:'短劍',2:'鐵盾',3:'神之金屬'})[id];tradeCardName=id=>id===1001?'波利卡片':'波利卡片・改';globalThis.update=updateTradeSearch;`,ctx);
const doc=window.document,list=doc.querySelector('#tr-inv');
function gear(id){return '<div class="item-cell" data-uid="g'+id+'"><img src="https://ro.hans-webgametw.com/assets/items/'+id+'.png"></div>';}
list.innerHTML=gear(1)+gear(2);ctx.update();const input=doc.querySelector('[data-ro-trade-search] input');let clicks=0;list.firstElementChild.onclick=()=>clicks++;
input.value='短劍';input.oninput();assert.equal(list.firstElementChild.hidden,false);assert.equal(list.lastElementChild.hidden,true);list.firstElementChild.click();assert.equal(clicks,1,'native action preserved');assert.equal(doc.querySelector('#tr-mine-items .item-cell').hidden,false);
ctx.update();assert.equal(doc.querySelectorAll('[data-ro-trade-search]').length,1);
list.innerHTML='<div class="item-cell" data-card="1001"></div><div class="item-cell" data-card="1001001"></div>';input.value='波利 改';input.oninput();assert.equal(list.firstElementChild.hidden,true);assert.equal(list.lastElementChild.hidden,false);
input.value='不存在';input.oninput();assert.equal(doc.querySelector('[data-ro-trade-empty]').hidden,false);
input.value='';input.oninput();assert([...list.children].every(cell=>!cell.hidden&&cell.style.display!=='none'));assert.equal(doc.querySelector('[data-ro-trade-empty]').hidden,true);
list.innerHTML='<div class="item-cell" data-ore="3"></div>';input.value='神之';input.oninput();assert.equal(list.firstElementChild.hidden,false);
list.innerHTML=gear(1)+gear(2);input.value='盾';ctx.update();assert.equal(list.lastElementChild.hidden,false,'native redraw preserves query');assert.equal(list.firstElementChild.hidden,true);
list.innerHTML=gear(999);ctx.update();assert.equal(list.firstElementChild.hidden,false,'unknown assets remain accessible');
doc.querySelector('#trade').classList.add('hidden');ctx.update();doc.querySelector('#trade').classList.remove('hidden');ctx.update();assert.equal(input.value,'','new transaction clears query');
console.log('Trade search: names, card variants, ores, redraw, native clicks, offer isolation, unknown assets, clear and reopen passed');

const native=JSON.parse(fs.readFileSync('tests/fixtures/trade-search-native.json','utf8'));
vm.runInContext('const wa={manifest:{items:{1:{name:"短劍"},2:{name:"鐵盾"},3:{name:"神之金屬"}},cards:{1001:{name:"波利卡片"}}}},_a={lang:"zh-TW"};const Ta=text=>text,gy=text=>text;'+native.itemName+native.cardName+';initializeTradeSearch({item:L1,card:G7});globalThis.names=[tradeItemName(1),tradeCardName(1001001)];',ctx);
assert.deepEqual(Array.from(ctx.names),['短劍','波利卡片・改']);
console.log('Trade search: current native name functions discovered and modified card names preserved');
