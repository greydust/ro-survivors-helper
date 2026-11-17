const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const fixture=JSON.parse(fs.readFileSync('tests/fixtures/weather-native.json','utf8'));
const context=vm.createContext({localStorage:{getItem:()=>null},innerWidth:402,innerHeight:714});
vm.runInContext(`const compactFunction=fn=>Function.prototype.toString.call(fn).replace(/\\s+/g,'').replace(/\\b0\\./g,'.');`+fs.readFileSync('src/weather.js','utf8')+`;globalThis.api={installWeatherEffects,setHidden:v=>hideBattleWeather=v};`,context);
vm.runInContext(`
let calls={rain:0,sounds:0,clear:0,tint:0};const vi={clear:{fog:.2,rain:.5,dark:.1,wind:.3,lightning:0}},d5=()=>({tint:[.8,.9,1],fog:[.4,.5,.6]}),h5=()=>0;
class Atmosphere {constructor(){this.view={visible:true};this.world={atmos:{envTint:{value:{set(...args){calls.tint++;this.args=args}}},fogColor:{value:{x:0,y:0,z:0,set(){}}},fogAmount:{value:.4},playerLight:{value:.2},atmosTime:{value:0}},renderer:{setClearColor(value){this.color=value}}};this.rainG={clear(){calls.clear++}};this.flashG={clear(){calls.clear++}};this.time=0;this.weatherLeft=100;this.weather='clear';this.cur={...vi.clear};this.flash=0;this.flashSeq=[];this.nextBolt=8;}phase(){return .5}drawRain(){calls.rain++}sounds(){calls.sounds++}${fixture.update}}
globalThis.fixture={Atmosphere,calls};`,context);
const {api,fixture:t}=context,a=new t.Atmosphere(),game={atmosphere:a};api.installWeatherEffects(game);const wrapped=a.update;api.installWeatherEffects(game);assert.equal(a.update,wrapped);
a.update(.1,402,714);assert.equal(t.calls.rain,1);assert.equal(t.calls.sounds,1);
api.setHidden(true);api.installWeatherEffects(game);assert.equal(a.view.visible,false);assert.equal(a.world.atmos.fogAmount.value,0);assert.equal(a.world.atmos.playerLight.value,0);assert.deepEqual(Array.from(a.world.atmos.envTint.value.args),[1,1,1]);
const time=a.time,clears=t.calls.clear;for(let i=0;i<100;i++)a.update(.016,402,714);assert.equal(a.time,time);assert.equal(t.calls.rain,1);assert.equal(t.calls.sounds,1);assert.equal(t.calls.clear,clears,'hidden frames do not repeat graphics clears');
api.setHidden(false);api.installWeatherEffects(game);assert(a.view.visible);assert.equal(t.calls.rain,2,'native appearance restores immediately');a.update(.1,402,714);assert.equal(t.calls.rain,3);
const gloom={update(){throw Error('must not run')}};api.setHidden(true);api.installWeatherEffects({gloom});assert.equal(gloom.update.toString(),"update(){throw Error('must not run')}");
const unknown={view:{visible:true},update(){this.called=true}};const original=unknown.update;api.installWeatherEffects({atmosphere:unknown});assert.equal(unknown.update,original);assert(unknown.view.visible);
const next=new t.Atmosphere();api.installWeatherEffects({atmosphere:next});assert.equal(next.view.visible,false,'new battles inherit the option');
console.log('Weather: native appearance, disabled frame work, immediate restoration, next battle and unknown/indoor safety passed');
