import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseHTML} from 'linkedom';

const root=fileURLToPath(new URL('../',import.meta.url));
const input=process.argv[2];
if(!input)throw Error('Usage: node scripts/export-equipment-data.mjs <core file> <core URL> [main file] [main URL] [manifest file]');
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
let manifest=null;
if(process.argv[6]){
 manifest=JSON.parse(fs.readFileSync(process.argv[6],'utf8'));
 const assets=Object.values(catalog).find(value=>value?.icons?.get&&value?.itemTextures?.get);
 if(!assets||typeof catalog.bp!=='function'||typeof catalog.ff!=='function')throw Error('Localized item/monster names unavailable');
 assets.manifest=manifest;
}
// Optional main module supplies stage tiers and the published lap configuration.
let lapConfig=null,mainSourceSha256=null;
if(process.argv[4]){
 const main=fs.readFileSync(process.argv[4],'utf8');
 mainSourceSha256=crypto.createHash('sha256').update(main).digest('hex');
 lapConfig=JSON.parse(main.match(/var RO_LAPC=(\{[^;]+\});/)[1]);
 const stagesText=main.match(/const xe=(\[.*?\]);/s)[1];
 const stages=vm.runInNewContext(stagesText,{yo:()=>({})},{timeout:1000});
 const stageNames={prontera:'普隆德拉原野',sewer:'普隆德拉地下水道',sunken:'失事輪',byalan:'柏伊亞嵐島',payon:'斐揚森林',payon_cave:'斐揚洞穴',prt_castle:'普隆德拉城',orcs:'獸人村',pyramid:'夢羅克金字塔',maze:'迷宮森林',xmas:'聖誕節',louyang:'元宵節',c2_gef:'吉芬地下城',c2_clock:'鐘樓地下',c2_abyss:'深淵之湖',c2_glast:'古城修道院',c2_nif:'尼芙菲姆原野'};
 const monsterText=fs.readFileSync(path.join(root,'src/monster-names.js'),'utf8');
 const monsters=JSON.parse(monsterText.match(/const MONSTER_NAMES = (\{.*\});/s)[1]);
 const previous=JSON.parse(fs.readFileSync(path.join(root,'src/equipment-catalog.js'),'utf8').match(/const EQUIPMENT_CATALOG = (\[.*\]);/s)[1]);
 const names=new Map(previous.map(record=>[record.id,record.name]));
 const records=new Map();
 for(const stage of stages){
  if(stage.chapter===2)stage.tier=6;
  const stageName=stageNames[stage.id];if(!stageName)throw Error('Unknown stage; supply its Chinese name before exporting');
  const script=catalog.ca?.[stage.id];if(!script)throw Error('Stage scripts unavailable');
  const enemies=[...new Set(script.waves.flatMap(wave=>wave.pool))].map(id=>({id,boss:false}));
  enemies.push(...script.bosses.map(boss=>({id:boss.id,boss:true})));
  for(const special of [script.rare,script.intruder])if(special?.id&&!enemies.some(enemy=>enemy.id===special.id))enemies.push({id:special.id,boss:true,rare:true});
  for(const enemy of enemies)for(const drop of catalog.cb?.[enemy.id]||[]){
   const def=definitions[drop.id];if(!def||def.secret||def.starter)continue;
   if(!monsters[enemy.id])monsters[enemy.id]=catalog.ff?.(catalog.bj[enemy.id]?.name||enemy.id)||enemy.id;
   if(/[A-Za-z]/.test(monsters[enemy.id]))throw Error('Missing Chinese monster name: '+enemy.id);
   const name=manifest?catalog.bp(drop.id,''):names.get(drop.id)||def.name;
   if(!name||name==='#'+drop.id)throw Error('Missing equipment name: '+drop.id);
   const icon=manifest?.items?.[drop.id]?.icon;
   if(!records.has(drop.id))records.set(drop.id,{id:drop.id,name,slot:def.slot,wtype:def.wtype||'',icon:icon?new URL(icon,'https://ro.hans-webgametw.com/assets/').href:'https://ro.hans-webgametw.com/assets/items/'+drop.id+'.png',tiers:[],sources:[]});
   const record=records.get(drop.id);if(!record.tiers.includes(stage.tier))record.tiers.push(stage.tier);
   record.sources.push({...stage.chapter?{chapter:stage.chapter}:{},tier:stage.tier,stage:stageName,monster:monsters[enemy.id],boss:enemy.boss,...enemy.rare?{rare:true}:{}});
  }
 }
 for(const record of previous)if(record.sources.some(source=>source.monster==='關卡獎勵')&&definitions[record.id]&&!records.has(record.id))records.set(record.id,record);
 if([...records.values()].some(record=>!record.name))throw Error('New equipment needs a Chinese name before export');
 fs.writeFileSync(path.join(root,'src/monster-names.js'),'  // Chinese names from the current public game translation catalog.\n  const MONSTER_NAMES = '+JSON.stringify(monsters)+';\n');
 fs.writeFileSync(path.join(root,'src/equipment-catalog.js'),'  // Generated from current public stage drop tables.\n  const EQUIPMENT_CATALOG = '+JSON.stringify([...records.values()])+';\n');
}
const twoHand=Object.values(catalog).find(value=>typeof value?.has==='function'&&value.has('양손검')&&value.has('활'));
const {window:helperWindow}=parseHTML('<html><head></head><body></body></html>');
const helper=vm.createContext({window:helperWindow,document:helperWindow.document,Element:helperWindow.Element,URL,location,
 localStorage:{getItem:()=>null,setItem(){}},MutationObserver:class{observe(){}},console:{info(){},warn(){},debug(){}},
 setTimeout:()=>0,clearTimeout(){},queueMicrotask:()=>{},performance,innerWidth:1200,innerHeight:800,catalog,definitions,twoHand});
let bundle=fs.readFileSync(path.join(root,'dist/RO倖存者助手.user.js'),'utf8');
if(process.argv[4])bundle=bundle.replace(/const EQUIPMENT_CATALOG = \[.*?\];/s,fs.readFileSync(path.join(root,'src/equipment-catalog.js'),'utf8').trim());
bundle=bundle.replace(/\}\)\(\);\s*$/,`smithDefs=definitions;gameCatalog=catalog;if(twoHand)twoHandTypes=twoHand;
 globalThis.equipmentSnapshot={slots:GEAR_SLOTS,weaponTypes:weaponTypeLabels,maxTier:equipmentMaxTier(),lapCount:EQUIPMENT_LAP_COUNT,records:equipmentGroups().map(group=>({
 id:group.records[0].id,name:group.name,slot:group.slot,wtype:groupWeaponType(group),icon:group.records[0].icon,
 tiers:equipmentTiers(group.records[0]).map(tier=>({tier,bonuses:actualEquipmentBonuses(group.records[0],tier)})),
 sources:group.records.flatMap(record=>record.sources)
 }))};})();`);
vm.runInContext(bundle,helper,{timeout:15000,filename:'helper-equipment-export.js'});
const data={updatedAt:new Date().toISOString().slice(0,10),source:process.argv[3]||'https://ro.hans-webgametw.com/build/soul_linker-DllBVIRO.hzf296bcc4.js',
 ...(manifest?{manifestSource:'https://ro.hans-webgametw.com/assets/manifest.json',manifestSha256:crypto.createHash('sha256').update(fs.readFileSync(process.argv[6])).digest('hex')} :{}),...(lapConfig?{lapConfig,mainSource:process.argv[5]||null,mainSourceSha256}:{}),sourceSha256:crypto.createHash('sha256').update(raw).digest('hex'),...helper.equipmentSnapshot};
if(lapConfig&&(data.maxTier!==lapConfig.tierMax||data.lapCount!==lapConfig.max))throw Error('Helper lap/Tier settings differ from the current game');
if(data.records.some(record=>record.tiers.some(row=>!Array.isArray(row.bonuses))))throw Error('Actual equipment bonuses missing; snapshot not written');
fs.writeFileSync(path.join(root,'doc/equipment/data.json'),JSON.stringify(data,null,2)+'\n');
console.log(`Exported ${data.records.length} equipment records, T1–T${data.maxTier}, using the helper filter functions`);
