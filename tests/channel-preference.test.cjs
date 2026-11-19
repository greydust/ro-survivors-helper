const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseHTML}=require('linkedom');
const source=fs.readFileSync('src/offline.js','utf8');
function setup(saved={}){
 const {window}=parseHTML('<html><body><div id="opt-tabs"><b data-opt-tab="game" class="active"></b></div><div id="opt-body"></div></body></html>');
 const storage=new Map(Object.entries(saved));
 class Socket extends EventTarget{static CLOSED=3;constructor(url){super();this.url=url;this.sent=[];}send(data){this.sent.push(JSON.parse(data));}close(){this.dispatchEvent(new Event('close'));}receive(data){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(data)}));}}
 window.WebSocket=Socket;window.EventTarget=EventTarget;
 const ctx=vm.createContext({window,document:window.document,location:{href:'https://ro.hans-webgametw.com/'},URL,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},notify(){}});
 vm.runInContext(source+';globalThis.ui=updateOfflineUI;globalThis.toggle=setKeepChannel;',ctx);
 return {window,ctx,storage,connect:(l=1)=>new window.WebSocket('wss://ro.hans-webgametw.com/ws?l='+l)};
}
const keep='greydust.ro.keep-channel.v1',channels='greydust.ro.last-channels.v1';
{
 const e=setup();e.ctx.ui();e.ctx.ui();const inputs=e.window.document.querySelectorAll('[data-ro-keep-channel]');assert.equal(inputs.length,1);assert.equal(inputs[0].closest('label').previousElementSibling.querySelector('b').textContent,'保持離線遊玩');
 const s=e.connect();s.receive({t:'welcome',channel:8});e.ctx.toggle(true);assert.equal(e.storage.get(keep),'true');
 s.close();const returned=e.connect();returned.receive({t:'welcome',channel:1});assert.deepEqual(returned.sent,[{t:'hop',n:8}]);assert.equal(JSON.parse(e.storage.get(channels))['1'],8);
 returned.receive({t:'welcome',channel:8});returned.send(JSON.stringify({t:'hop',n:12}));returned.receive({t:'welcome',channel:12});assert.equal(JSON.parse(e.storage.get(channels))['1'],12);
 const reload=setup(Object.fromEntries(e.storage)),r=reload.connect();r.receive({t:'welcome',channel:1});assert.deepEqual(r.sent,[{t:'hop',n:12}]);r.receive({t:'hopErr',e:'full'});assert.equal(r.sent.length,1);assert.equal(JSON.parse(reload.storage.get(channels))['1'],12);
 const other=reload.connect(2);other.receive({t:'welcome',channel:2});assert.deepEqual(other.sent,[]);
 reload.ctx.toggle(false);const disabled=reload.connect();disabled.receive({t:'welcome',channel:1});assert.deepEqual(disabled.sent,[]);
}
{
 const e=setup({[keep]:'true',[channels]:'{"1":5}','greydust.ro.keep-offline.v1':'true'});const s=e.connect();assert.equal(s.readyState,3);
 const run=new e.window.WebSocket('wss://ro.hans-webgametw.com/ws-run?l=1');run.receive({t:'welcome',channel:1});assert.deepEqual(run.sent,[]);
}
console.log('Channel preference: UI order, return/relogin, confirmed manual hops, full channel, lobby isolation, disabled and offline passed');

function picker(e,rows){
 const dialog=e.window.document.createElement('div');dialog.id='npc-dialog';dialog.innerHTML='<div class="lb-pick">'+rows+'</div>';e.window.document.body.append(dialog);return dialog;
}
{
 const e=setup({[keep]:'true','greydust.ro.last-lobby.v1':'2'}),dialog=picker(e,'<button data-lb="1"></button><button data-lb="2"></button>');let clicks=0;dialog.querySelector('[data-lb="2"]').onclick=()=>clicks++;e.ctx.ui();e.ctx.ui();assert.equal(clicks,1,'skip once and preserve later manual selection');
}
for(const mode of ['disabled','offline','full','missing']){
 const e=setup({[keep]:mode==='disabled'?'false':'true','greydust.ro.last-lobby.v1':'2','greydust.ro.keep-offline.v1':mode==='offline'?'true':'false'});
 const dialog=picker(e,mode==='missing'?'<button data-lb="1"></button>':'<button data-lb="2" '+(mode==='full'?'class="full" disabled':'')+'></button>');let clicks=0;dialog.querySelector('button').onclick=()=>clicks++;e.ctx.ui();assert.equal(clicks,0,mode+' keeps native selection');
}
{
 const e=setup({[keep]:'true'}),dialog=picker(e,'<button data-lb="2" class="me"></button>');let clicks=0;dialog.querySelector('button').onclick=()=>clicks++;e.ctx.ui();assert.equal(clicks,1,'existing native last-lobby marker supports upgrades');
 const socket=e.connect(3);socket.receive({t:'welcome',channel:7});assert.equal(e.storage.get('greydust.ro.last-lobby.v1'),'3');
}
console.log('Initial lobby picker: remembered/native previous server, one attempt, unavailable server and offline priority passed');
