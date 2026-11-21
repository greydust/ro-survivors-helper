import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {installNativeCardFloor} from '../scripts/native-card-score.mjs';
const fixture=JSON.parse(fs.readFileSync('tests/fixtures/card-score-native.json','utf8'));
const main=fixture.stageHelper+'const xe='+fixture.stageExpression+';'+fixture.floor;
const context=vm.createContext({});
installNativeCardFloor(context,main,{ca:fixture.scripts,bT:fixture.cards});
const floor=context.RO_CARDFLOOR;
assert.equal(floor(4111,'swordsman',0),20);
assert.equal(floor(5004111,'swordsman',0),70);
assert.equal(floor(4144,'swordsman',0),30);
assert.equal(floor(5004144,'swordsman',0),30,'Osiris must not scale its floor');
assert.equal(floor(4111,'mage',200),200,'floor cannot lower the ability score');
assert.equal(floor(0,'mage',7),7,'unknown card preserves existing score');
const data=JSON.parse(fs.readFileSync('doc/cards/data.json','utf8'));
let checks=0;
for(const card of data.records)for(const version of card.versions)for(const score of Object.values(version.scores)){
  assert(score>=floor(version.id,'swordsman',0));checks++;
}
assert.throws(()=>installNativeCardFloor(vm.createContext({}),main,{ca:Object.fromEntries(Object.keys(fixture.scripts).map(id=>[id,{bosses:[],waves:[]}])) ,bT:fixture.cards}),/empty/);
console.log(`PASS native MINI/MVP card floors, lap scaling, Osiris exception, malformed metadata rejection and ${checks} snapshot scores`);
