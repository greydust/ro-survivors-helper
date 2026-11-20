import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';

// Evaluate the public definitions offline, never the game's main entry point.
export function loadPublicModule(file) {
  const raw=fs.readFileSync(file,'utf8');
  const start=raw.lastIndexOf('export{'),end=raw.indexOf('};',start);
  if(start<0||end<0)throw Error('Public module export list not found');
  const exports=raw.slice(start+7,end).split(',').map(value=>{
    const [local,name]=value.trim().split(' as ');return `${JSON.stringify(name||local)}:${local}`;
  }).join(',');
  const code=(raw.slice(0,start)+`globalThis.catalog={${exports}};`+raw.slice(end+2)).replaceAll('import.meta.url',JSON.stringify('https://ro.hans-webgametw.com/build/catalog.js'));
  const {window}=parseHTML('<html><head></head><body></body></html>');
  window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  const sandbox={window,document:window.document,location:new URL('https://ro.hans-webgametw.com/'),navigator:{userAgent:'Mozilla/5.0',language:'zh-TW'},
    MutationObserver:class{observe(){}},localStorage:{getItem:()=>null,setItem(){}},console,URL,URLSearchParams,
    setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},performance,TextDecoder,TextEncoder,Uint8Array,ArrayBuffer,
    fetch(){throw Error('Network access is disabled during public data extraction');}};
  vm.runInNewContext(code,sandbox,{timeout:15000,filename:'public-definitions.js'});
  for(const value of Object.values(sandbox.catalog))if(value&&typeof value==='object'&&typeof value.lang==='string')value.lang='zh-TW';
  return {catalog:sandbox.catalog,raw,sandbox};
}
