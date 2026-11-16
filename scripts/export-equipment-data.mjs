import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseHTML} from 'linkedom';

const root=fileURLToPath(new URL('../',import.meta.url));
const input=process.argv[2];
if(!input)throw Error('Usage: node scripts/export-equipment-data.mjs <downloaded public soul_linker module>');
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
vm.runInNewContext(code,sandbox,{timeout:15000,filename:'public-equipment-module.js'});
const catalog=sandbox.catalog;
for(const value of Object.values(catalog))if(value&&typeof value==='object'&&typeof value.lang==='string')value.lang='zh-TW';
const definitions=Object.values(catalog).find(value=>value?.[1101]?.slot==='weapon'&&value?.[2254]?.slot==='head_top');
if(!definitions||typeof catalog.bs!=='function')throw Error('Actual equipment definitions/Tier adapter unavailable');
const twoHand=Object.values(catalog).find(value=>typeof value?.has==='function'&&value.has('양손검')&&value.has('활'));
const {window:helperWindow}=parseHTML('<html><head></head><body></body></html>');
const helper=vm.createContext({window:helperWindow,document:helperWindow.document,Element:helperWindow.Element,URL,location,
 localStorage:{getItem:()=>null,setItem(){}},MutationObserver:class{observe(){}},console:{info(){},warn(){},debug(){}},
 setTimeout:()=>0,clearTimeout(){},queueMicrotask:()=>{},performance,innerWidth:1200,innerHeight:800,catalog,definitions,twoHand});
let bundle=fs.readFileSync(path.join(root,'dist/RO倖存者助手.user.js'),'utf8');
bundle=bundle.replace(/\}\)\(\);\s*$/,`smithDefs=definitions;gameCatalog=catalog;if(twoHand)twoHandTypes=twoHand;
 globalThis.equipmentSnapshot={slots:GEAR_SLOTS,weaponTypes:weaponTypeLabels,maxTier:equipmentMaxTier(),records:equipmentGroups().map(group=>({
 id:group.records[0].id,name:group.name,slot:group.slot,wtype:groupWeaponType(group),icon:group.records[0].icon,
 tiers:equipmentTiers(group.records[0]).map(tier=>({tier,bonuses:actualEquipmentBonuses(group.records[0],tier)})),
 sources:group.records.flatMap(record=>record.sources)
 }))};})();`);
vm.runInContext(bundle,helper,{timeout:15000,filename:'helper-equipment-export.js'});
const data={updatedAt:new Date().toISOString().slice(0,10),source:process.argv[3]||'https://ro.hans-webgametw.com/build/soul_linker-DllBVIRO.hzf296bcc4.js',
 sourceSha256:crypto.createHash('sha256').update(raw).digest('hex'),...helper.equipmentSnapshot};
if(data.records.some(record=>record.tiers.some(row=>!Array.isArray(row.bonuses))))throw Error('Actual equipment bonuses missing; snapshot not written');
fs.writeFileSync(path.join(root,'doc/equipment/data.json'),JSON.stringify(data,null,2)+'\n');
console.log(`Exported ${data.records.length} equipment records, T1–T${data.maxTier}, using the helper filter functions`);
