import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseHTML} from 'linkedom';

const root=fileURLToPath(new URL('../',import.meta.url));
const input=process.argv[2];
if(!input||!process.argv[4])throw Error('Usage: node scripts/export-stage-data.mjs <core file> <core URL> <main file> <main URL>');
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
const main=fs.readFileSync(process.argv[4],'utf8');
const stages=vm.runInNewContext(main.match(/const xe=(\[.*?\]);/s)[1],{yo:id=>catalog.ca[id]||{}});
const functions=main.slice(main.indexOf('function RO_LAPST('),main.indexOf('function RO_LAPM('))+main.slice(main.indexOf('var RO_LAPEXK='),main.indexOf(';var RO_LAPGAIN='))+';';
const c2=JSON.parse(main.match(/RO_C2T=(\{[^;]+\});/)[1]);
fs.writeFileSync(path.join(root,'tests/fixtures/stage-level-native.json'),JSON.stringify({source:process.argv[5],lapConfig:JSON.parse(main.match(/var RO_LAPC=(\{[^;]+\});/)[1]),stages,scripts:catalog.ca,monsters:catalog.bj,rulesSource:main.match(/var RO_LAPC=(\{[^;]+\});/)[0]+main.match(/RO_C2T=(\{[^;]+\});/)[0]+main.match(/const xe=(\[.*?\]);/s)[0],functions:'var RO_C2T='+JSON.stringify(c2)+';'+functions},null,2)+'\n');