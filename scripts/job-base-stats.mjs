import {skillTargeting} from './job-targeting.mjs';
// Read definitions only: never fire a skill or construct a synthetic battle.
const fields={
  dmg:['基礎傷害',''],
  count:['基礎數量',''],ticks:['脈衝次數',''],burst:['每次連擊數',''],volleys:['齊射次數',''],
  splashPct:['濺射傷害比例','ratio'],
  cells:['區域格數',''],cellRadius:['單格半徑','遊戲單位'],gap:['格子間距','遊戲單位'],
  duration:['持續時間','秒'],life:['投射物存活時間','秒'],tick:['區域觸發間隔','秒'],
  interval:['觸發間隔','秒'],burstGap:['連擊間隔','秒'],delay:['延遲','秒'],
  speed:['速度','遊戲單位／秒'],pierce:['基礎穿透',''],
  tickRadius:['觸發半徑','遊戲單位'],uptime:['啟用時間','秒'],hitCd:['同目標命中間隔','秒'],
  width:['寬度','遊戲單位'],dash:['衝刺距離','遊戲單位'],dashTime:['衝刺時間','秒'],
  immune:['無敵時間','秒'],flight:['飛行時間','秒']
};
const levelFunctions=new Set(['dmg','range','radius','count','ticks','burst','volleys','splash','cells','duration','pierce','area']);
const round=n=>Math.round(n*1e6)/1e6;
function definition(value,depth=0){
  if(typeof value==='function')return String(value);
  if(typeof value==='number')return Number.isFinite(value)?value:String(value);
  if(value===null||typeof value!=='object')return value;
  if(depth>5)return '[nested definition]';
  return Array.isArray(value)?value.map(v=>definition(v,depth+1)):Object.fromEntries(Object.entries(value).map(([k,v])=>[k,definition(v,depth+1)]));
}
export function skillBaseStats(w,{translate=v=>v,formatEffect=(e,v)=>String(v),description='',resolve}={}){
  if(!w)return {rows:[],special:false,definition:null};
  const rows=[];
  const add=(key,label,value,unit='',note='')=>{
    if(typeof value==='number'&&Number.isFinite(value))rows.push({key,label,value:round(value),unit,note});
  };
  const cooldown=w.cdBase??w.cooldown();
  add('cooldown','基礎 CD',cooldown,'秒','未計急速、天賦、裝備或無限塔修正');
  add('castTime','基礎詠唱',w.castByLevel?w.castByLevel(1):w.castTime,'秒','未計 DEX 與施法急速；與 CD 分開');
  add('dmgScale','技能內建傷害倍率',w.dmgScale,'倍');
  rows.push(...skillTargeting(w,{description,resolve}));
  const config=w.cfg??{};
  for(const [key,[label,unit]] of Object.entries(fields)){
    const original=config[key];let value=original;
    if(original===undefined)continue;
    if(typeof original==='function'){
      if(!levelFunctions.has(key)||original.length>1)continue;
      try{value=original.call(config,1);}catch{continue;}
    }
    add(key,label,unit==='ratio'?value*100:value,unit==='ratio'?'%':unit,
      key==='dmg'?'尚未計角色傷害縮放、技能修正倍率、敵人防禦與命中效果':key==='count'?translate(w.countUnit()):'');
  }
  for(const effect of w.effects??[])rows.push({key:'effect:'+effect.key,label:translate(effect.label)+'（初始）',value:formatEffect(effect,effect.base),unit:'',note:''});
  const special=!w.cfg;
  return {rows,special,definition:definition({level:1,cdBase:w.cdBase,dmgScale:w.dmgScale,castTime:w.castTime,
    castByLevel:w.castByLevel,effects:w.effects,config:w.cfg,
    ...special?{cooldown:w.cd,onFire:w.onFire}:{}
  })};
}
