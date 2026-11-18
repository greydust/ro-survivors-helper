  const DEITY_SWAP_KEY='greydust.ro.deity-swap-enabled.v1';
  let deitySwapEnabled=true;
  try{deitySwapEnabled=localStorage.getItem(DEITY_SWAP_KEY)!=='false';}catch{}
  const deitySwapGames=new WeakSet();
  function installDeitySwapPreference(game){
    if(!game||deitySwapGames.has(game)||typeof game.chestOpts!=='function')return;
    const original=game.chestOpts;
    game.chestOpts=function(...args){
      const options=Reflect.apply(original,this,args);
      // Reuse the native locked-perk mode without changing perk ranks, saves,
      // existing offers, refresh charges, or the native roll/selection methods.
      return deitySwapEnabled||!options?.swap?options:{...options,swap:false};
    };
    deitySwapGames.add(game);
  }
  function updateDeitySwapPreferenceUI(){
    const root=document.querySelector('#chr-perks');if(!root)return;
    const names=new Set(['神格切換','Deity cambiante','Shifting Deity','Divindade Mutável']);
    const row=[...root.querySelectorAll('.chr-perk')].find(node=>node.querySelector('[data-perk="deity"]')||names.has(node.querySelector('.chr-info > b')?.textContent.trim()));
    if(!row)return;
    const unlocked=!!row.querySelector('.chr-pips i.on');
    let label=row.querySelector('[data-ro-deity-swap]');
    if(!unlocked){label?.remove();return;}
    if(!label){
      label=document.createElement('label');label.dataset.roDeitySwap='';label.className='opt-check';label.style.cssText='display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px';
      const input=document.createElement('input');input.type='checkbox';input.setAttribute('role','switch');input.setAttribute('aria-label','允許切換神格');
      input.onchange=()=>{deitySwapEnabled=input.checked;try{localStorage.setItem(DEITY_SWAP_KEY,String(deitySwapEnabled));}catch{notify('神格切換偏好無法保存；本頁仍可使用');}};
      const track=document.createElement('i');track.className='opt-switch';track.setAttribute('aria-hidden','true');label.append(input,track);
      const completed=row.querySelector(':scope > .chr-maxed');
      if(completed)completed.replaceWith(label);else row.append(label);
    }
    const input=label.querySelector('input');input.checked=deitySwapEnabled;
  }
