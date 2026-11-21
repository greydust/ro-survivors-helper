import vm from 'node:vm';

// Keep the game's post-processing, including MINI/MVP score floors and the
// unscaled Osiris exception. Never substitute a second hand-written scorer.
export function installNativeCardFloor(context,main,catalog){
  const start=main.indexOf('var RO_CARDFLOOR=');
  const end=main.indexOf('})();',start);
  const stages=main.match(/const xe=(\[.*?\]);/s)?.[1];
  if(start<0||end<0||!stages)throw Error('Native card score floor/stage metadata unavailable');
  const stageHelperStart=main.indexOf('function yo('),stageHelperEnd=main.indexOf('const xe=',stageHelperStart);
  if(stageHelperStart<0||stageHelperEnd<0)throw Error('Native stage boss metadata adapter unavailable');
  const metadata=vm.runInNewContext(main.slice(stageHelperStart,stageHelperEnd)+';('+stages+')',{tt:catalog.ca},{timeout:1000});
  if(!metadata.some(stage=>stage.mvp?.id&&stage.minis?.length))throw Error('Native card floor boss sets are empty');
  context.xe=metadata;
  context.Ht=catalog.bT;
  vm.runInContext(main.slice(start,end+5),context,{timeout:1000});
  if(typeof context.RO_CARDFLOOR!=='function')throw Error('Native card score floor did not initialize');
}
