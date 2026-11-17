import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseHTML} from 'linkedom';

const root=fileURLToPath(new URL('../',import.meta.url));
const input=process.argv[2];
if(!input||!process.argv[6])throw Error('Usage: node scripts/export-card-data.mjs <core file> <core URL> <main file> <main URL> <manifest file>');
const raw=fs.readFileSync(input,'utf8');
const start=raw.lastIndexOf('export{'),end=raw.indexOf('};',start);
if(start<0||end<0)throw Error('Public module export list not found');
const exports=raw.slice(start+7,end).split(',').map(value=>{
 const [local,name]=value.trim().split(' as ');return `${JSON.stringify(name||local)}:${local}`;
}).join(',');
const code=(raw.slice(0,start)+`globalThis.catalog={${exports}};`+raw.slice(end+2)).replaceAll('import.meta.url',JSON.stringify('https://ro.hans-webgametw.com/build/catalog.js'));
const {window}=parseHTML('<html><head></head><body></body></html>');
window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
const location=new URL('https://ro.hans-webgametw.com/');
const sandbox={window,document:window.document,location,navigator:{userAgent:'Mozilla/5.0',language:'zh-TW'},
 MutationObserver:class{observe(){}},localStorage:{getItem:()=>null,setItem(){}},console,URL,URLSearchParams,
 setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},performance,TextDecoder,TextEncoder,Uint8Array,ArrayBuffer,
 fetch(){throw Error('Network access is disabled during public data extraction');}};
vm.runInNewContext(code,sandbox,{timeout:15000,filename:'public-card-module.js'});
const catalog=sandbox.catalog;
for(const value of Object.values(catalog))if(value&&typeof value==='object'&&typeof value.lang==='string')value.lang='zh-TW';
if(!catalog.bT?.[4001]||typeof catalog.dr!=='function'||typeof catalog.j!=='function')throw Error('Native card definitions unavailable');
let manifest=null;
if(process.argv[6]){
 manifest=JSON.parse(fs.readFileSync(process.argv[6],'utf8'));
 const assets=Object.values(catalog).find(value=>value?.icons?.get&&value?.itemTextures?.get);
 if(!assets||typeof catalog.bp!=='function'||typeof catalog.ff!=='function')throw Error('Localized item/monster names unavailable');
 assets.manifest=manifest;
}

const main=fs.readFileSync(process.argv[4],'utf8');
const lapConfig=JSON.parse(main.match(/var RO_LAPC=(\{[^;]+\});/)[1]);
const scoreStart=main.indexOf('const Bk='),scoreEnd=main.indexOf('function PC(',scoreStart);
if(scoreStart<0||scoreEnd<0)throw Error('Native GS scoring section unavailable');
const scoreContext=vm.createContext({es:catalog.bW,be:catalog.j,Yo:catalog.bX});
vm.runInContext(main.slice(scoreStart,scoreEnd)+';globalThis.score=(card,job)=>Math.max(0,Math.round(card.bonuses.reduce((sum,bonus)=>sum+vf(bonus,job),0)));',scoreContext,{timeout:1000});
const jobIds=[...new Set([...raw.matchAll(/"?id"?:"([^" ]+)"/g)].map(m=>m[1]))].filter(id=>catalog.j(id)?.id===id);
const jobs=jobIds.map(id=>({id,name:catalog.ff(catalog.j(id).name),scaling:catalog.j(id).scaling}));
if(!jobs.some(j=>j.id==='swordsman')||!jobs.some(j=>j.id==='mage'))throw Error('Native job catalog unavailable');
const stages={prontera:'普隆德拉原野',sewer:'普隆德拉地下水道',sunken:'失事輪',byalan:'柏伊亞嵐島',payon:'斐揚森林',payon_cave:'斐揚洞穴',prt_castle:'普隆德拉城',orcs:'獸人村',pyramid:'夢羅克金字塔',maze:'迷宮森林',xmas:'聖誕節',louyang:'元宵節'};
const slots=[['weapon','武器'],['shield','盾牌'],['headgear','頭部'],['armor','護甲'],['garment','披肩'],['shoes','鞋子'],['accessory','飾品']];
const records=Object.values(catalog.bT).filter(card=>!card.lap&&card.id<lapConfig.cardStep).map(base=>{
 const monster=catalog.bj[base.monster];if(!monster)throw Error('Unknown card monster '+base.monster);
 const sources=Object.entries(stages).filter(([id])=>{const stage=catalog.ca[id];return stage&&(stage.waves.some(w=>w.pool.includes(base.monster))||stage.bosses.some(b=>b.id===base.monster)||stage.rare?.id===base.monster);}).map(([id,name])=>({stage:name,boss:!!monster.boss,rare:catalog.ca[id].rare?.id===base.monster}));
 const versions=Array.from({length:lapConfig.max},(_,i)=>{const card=catalog.bT[base.id+lapConfig.cardStep*i];if(!card)throw Error('Missing native card version '+base.id+' lap '+(i+1));return {id:card.id,lap:i+1,label:i?'改'+(i===1?'':i):'普通版',bonuses:catalog.dr(card.bonuses),scores:Object.fromEntries(jobs.map(job=>[job.id,scoreContext.score(card,job.id)]))};}).reverse();
 return {id:base.id,name:catalog.ff(monster.name)+'卡片',monster:catalog.ff(monster.name),slot:base.compound,boss:monster.boss||null,sources,versions};
});
if(records.some(r=>!slots.some(([slot])=>r.slot===slot)))throw Error('Unknown compound slot: '+[...new Set(records.map(r=>r.slot))]);
const data={updatedAt:new Date().toISOString().slice(0,10),source:process.argv[3],mainSource:process.argv[5],manifestSource:'https://ro.hans-webgametw.com/assets/manifest.json',manifestSha256:crypto.createHash('sha256').update(fs.readFileSync(process.argv[6])).digest('hex'),sourceSha256:crypto.createHash('sha256').update(raw).digest('hex'),mainSourceSha256:crypto.createHash('sha256').update(main).digest('hex'),lapConfig,jobs,slots,records};
fs.mkdirSync(path.join(root,'doc/cards'),{recursive:true});fs.writeFileSync(path.join(root,'doc/cards/data.json'),JSON.stringify(data,null,2)+'\n');console.log('Exported '+records.length+' cards × '+lapConfig.max+' versions; '+jobs.length+' job scores');

