import assert from 'node:assert/strict';
import {skillBaseStats} from '../scripts/job-base-stats.mjs';

let fired=false;
const w={cdBase:5,cooldown(){throw Error('overridden CD must not be evaluated');},castTime:0,dmgScale:1.5,
  cfg:{cd:()=>.9,dmg:level=>200*level,range:()=>100,radius:0,count:()=>1,
    burst:(level,game)=>{throw Error('requires battle');}},
  countUnit:()=> '目標',effects:[{key:'stun',label:'暈眩機率',base:0}],
  onFire(){fired=true;}};
const result=skillBaseStats(w),row=key=>result.rows.find(row=>row.key===key);
assert.equal(row('cooldown').value,5);
assert.equal(row('castTime').value,0);
assert.equal(row('dmg').value,200);
assert.equal(row('dmgScale').value,1.5);
assert.equal(row('targetDistance').value,'100 遊戲單位');
assert.equal(result.definition.config.radius,0,'raw zero values must stay available');
assert.equal(row('effectArea').value,'各投射物命中半徑 0 遊戲單位');
assert.equal(row('dmg').label,'基礎傷害');
assert.equal(row('dmgScale').label,'技能內建傷害倍率');
assert.equal(row('burst'),undefined,'game-dependent functions are not evaluated');
assert(result.definition.config.cd.includes('.9'));
assert.equal(fired,false);
const special=skillBaseStats({cd:()=>10,cooldown:()=>10,castTime:0,dmgScale:1,onFire:w.onFire});
assert.equal(special.special,true);assert(special.definition.onFire.includes('fired=true'));
assert.equal(fired,false);assert.equal(skillBaseStats(null).rows.length,0);
console.log('PASS raw skill extraction: effective base CD, level-one values, zeroes, unscaled damage, special definitions and no battle execution');
