const number=value=>typeof value==='number'&&Number.isFinite(value)?Math.round(value*1e6)/1e6:null;
export function skillTargeting(w,{description='',resolve=()=>null}={}){
  if(!w)return [];
  const cfg=w.cfg??{},src=String(w.onFire??''),pick=String(w.pick??''),aim=String(w.aim??''),spot=String(w.spot??'');
  const value=key=>{
    try{return number(typeof cfg[key]==='function'?cfg[key].call(cfg,1):cfg[key]);}catch{return null;}
  };
  const constant=expression=>{
    if(!expression)return null;
    if(/^\d+(?:\.\d+)?$/.test(expression))return Number(expression);
    if(/^[\w$]+(?:\.[\w$]+)*$/.test(expression))return number(resolve(expression));
    return null;
  };
  const queryDistance=source=>constant(source.match(/nearestEnem(?:y|ies)\(\s*(?:\d+\s*,\s*)?([\w$.]+)\s*\)/)?.[1]??source.match(/enemiesInRadius\([^,]+,[^,]+,\s*([\w$.]+)\s*\)/)?.[1]);
  const unit=n=>`${n} 遊戲單位`;
  const radius=n=>`半徑 ${unit(n)}`;
  let mode,range,area,rule;
  const rawRange=value('range'),r=value('radius'),splash=value('splash');
  if(w.cfg){
    const melee=cfg.melee||/Lv\(/.test(String(w.reach??''));
    const rangeValue=rawRange===null?null:rawRange+(melee?30:0);
    if(w.bestAngle){
      mode='選擇命中權重最高的扇形方向（頭目 6、菁英 3、一般怪 1）';range=unit(rawRange);
      area=`扇形，距離 ${unit(rawRange)}、角度 ${cfg.angle}°`;
    }else if(cfg.cells){
      mode=cfg.at?'自身位置':cfg.on?'依技能指定位置':'最近的原生優先目標，朝其預測位置放置地面區域';
      range=cfg.at?'不選敵':cfg.on?'由技能指定位置決定':'420 遊戲單位';
      area=`${value('cells')} 格，每格半徑 ${unit(value('cellRadius'))}`;
    }else if(cfg.tickRadius!==undefined){
      mode='視野內敵群的加權密集區域';range='視野內';
      area=`落點分布半徑 ${unit(value('area'))}；每次命中半徑 ${unit(value('tickRadius'))}`;
    }else if(cfg.aim==='ring'){
      mode='自身為中心，向四周發射';range='不鎖定敵人';area='環形發射；各投射物沿飛行路徑判定';
    }else if((/kind:"self"/.test(aim)&&!/br\(|this\.pick\(/.test(aim))||(!w.pick&&cfg.ticks&&r!==null)){
      mode='自身為中心';range='不選敵';area=r!==null?radius(r):'自身周圍';
      if(cfg.uptime!==undefined)area=`繞身軌道半徑 ${unit(r)}；接觸時命中`;
    }else{
      if(cfg.target==='strongest'){mode='目前 HP 最高的敵人';range='視野內';}
      else if(cfg.target==='cluster'){mode=cfg.bossFirst?'頭目優先，再補選視野內的密集敵群':'視野內的加權密集敵群';range='視野內';}
      else if(w.pick&&cfg.target&&cfg.target!=='nearest'){mode='隨機可見敵人（原生優先目標優先）';range='視野內';}
      else{mode=w.id?.startsWith('atk_')?'最近的敵人':'原生優先目標，並優先分配尚未被其他技能鎖定者';
        range=unit(rangeValue??(pick.includes('s.range??160')?160:600));}
      if(w.isBolt){mode+='；數量不足時補選視野內敵人';range=`優先 ${unit(rawRange??160)}，可補選距離外可見敵人`;
        rule='目標已被其他技能鎖定時會擴大優先搜尋距離；無濺射時，原目標死亡可在其周圍重新選敵。';}
      area=splash>0?`主目標及其周圍，${radius(splash)}`:r!==null?`各投射物命中半徑 ${unit(r)}`:w.type==='single'||w.type==='multi'?'選中的目標':'沿投射物／攻擊路徑判定';
      if(cfg.cone)area='沿目標方向的扇形範圍';
    }
    if(cfg.cover)rule='先選原生優先目標，再選方向較分散的敵人，讓投射物覆蓋不同方向。';
    if(!w.isBolt&&cfg.aim!=='ring'&&/s\.range\?\?600/.test(String(w.fire??''))){
      rule=[rule,rawRange===null?'未指定個別選敵距離，沿用原生投射物預設 600 遊戲單位。':'',
        '沒有可選目標時等待，不朝空處發射；飛行壽命與速度另外限制投射物能飛多遠。'].filter(Boolean).join('');
    }
  }else{
    const mobility=new Set(['shadowstep','charge_attack','bowling_bash','back_stab','new_moon_kick']);
    if(w.type==='buff'&&!mobility.has(w.id)){
      mode='自身';range='不選敵';area=/隊友/.test(description)?'自身及符合技能條件的隊友':'自身';
      const trigger=queryDistance(src);if(trigger!==null)rule=`施放前檢查 ${unit(trigger)} 內是否有敵人；這是啟動條件，不是選敵距離。`;
      if(w.id==='hp_recovery')rule='未滿血時才施放。';
      if(w.id==='potion_pitcher')rule='HP 不高於最大 HP 的 80% 時才施放。';
      if(w.id==='enlarge_weight'){area='自身與周圍敵人';rule='HP 低於 20% 時觸發，推開周圍敵人並保護自身。';}
    }else{
      if(/clusterTarget|clusterSpot/.test(src)){mode='視野內的加權密集敵群';range='視野內';}
      else if(/strongestVisibleEnemies/.test(src)){mode='目前 HP 最高的可見敵人';range='視野內';}
      else if(/附近最強|6 公尺內最強/.test(description)){mode='距離內頭目優先，再按目前 HP 排序';range=queryDistance(src);}
      else if(/最近/.test(description)){mode='最近的敵人';range=queryDistance(src);}
      else if(/隨機敵人/.test(description)){mode='隨機敵人';range=queryDistance(src);}
      else{mode='自身位置／周圍區域';range='不鎖定單一敵人';}
      if(typeof range==='number')range=unit(range);
      if(range===null||range===undefined)range='由特殊施放規則決定';
      const areaExpression=src.match(/\b(?:r|R|n|i)\s*=\s*([\w$.]+)\s*\*\s*\w+\.stats\.areaMult/)?.[1];
      const areaRadius=constant(areaExpression);
      area=areaRadius!==null?radius(areaRadius):/走過/.test(description)?'角色走過的路徑':/直線|路線|衝鋒/.test(description)?'衝刺／直線路徑':/周圍|附近|腳下|身邊|環繞|身旁/.test(description)?'施放位置或目標周圍的區域':'選中的目標';
      rule=description;
    }
    const overrides={
      shadowstep:['附近頭目優先，再按目前 HP 排序',null,'選中的目標'],
      heal:['自身；有治癒之泉天賦時可選敵群位置','自身／天賦指定位置','自身脈衝半徑 140 遊戲單位；隊友依原生分享規則'],
      highness_heal:['自身與附近隊友','不選敵','自身傷害半徑 130 遊戲單位；隊友依原生分享規則'],
      dragon_tail:['700 遊戲單位內被標記者（基礎最多 3 個）；無標記時選目前 HP 最高的可見敵人','標記目標：700 遊戲單位；備援：視野內','各目標周圍半徑 60 遊戲單位'],
      silver_sniper:['砲台選最近的敵人','距砲台 340 遊戲單位','砲台選中的目標'],
      detecting:['目前 HP 最高的可見敵人（基礎 3 個）','視野內','選中的目標'],
      masquerade:['目前 HP 最高的可見敵人（基礎 4 個）','視野內','選中的目標'],
      dragon_breath:['視野內的加權密集敵群；無敵群時找 320 遊戲單位內最近敵人','視野內；備援 320 遊戲單位','自身前方扇形，半徑 270 遊戲單位、角度 70°'],
      cart_rush:['沿角色面朝方向衝刺','以附近敵人作啟動檢查','衝刺路徑'],
      charge_attack:['距離內頭目、菁英優先，再按目前 HP 排序',unit(constant('Jw')),'選中的目標；特殊天賦可追加路徑命中'],
      bowling_bash:['最近的敵人',unit(constant('S8')),`選中的目標與其後方 ${unit(constant('A8'))} 的擊退連鎖`],
      abracadabra:['隨機選取附近敵人作為隨機法術落點','420 遊戲單位','依抽中的法術：目標附近隕石、自身冰爆、可見敵人落雷、治癒或重力'],
      blitz_beat:['視野內密集敵群優先；無敵群時從附近敵人隨機選取','先檢查 480 遊戲單位內敵人；密集敵群取自視野','目標及俯衝波及範圍'],
      divest_weapon:['距離內頭目優先，再按目前 HP 排序（基礎 2 個）','260 遊戲單位','選中的目標'],
      volcano:['自身腳下','不選敵','腳下半徑 140 遊戲單位'],
      deluge:['自身腳下','不選敵','腳下半徑 140 遊戲單位'],
      vending:['自身位置放置販賣機','不選敵',`吸引半徑 ${unit(constant('qr.lure'))}；爆炸半徑 ${unit(constant('qr.radius'))}`],
      spirit_charm:['自身位置','不選敵','自身增益；施放時爆炸半徑 110 遊戲單位'],
      shadow_warrior:['目前 HP 最高的可見敵人','視野內','選中的目標；自身獲得後續增益'],
      elemental_spirit:['元素精靈選最近的敵人','距元素精靈 280 遊戲單位','主目標及其周圍半徑 40 遊戲單位'],
      flash_kick:['距離內頭目優先，再按目前 HP 排序','340 遊戲單位','主目標及周圍 220 遊戲單位內基礎 2 個印記；各印記落星半徑 40 遊戲單位'],
      reproduce:['視野內的加權密集敵群','視野內','落點分布半徑 130 遊戲單位；每次命中半徑 60 遊戲單位'],
      claymore_trap:['最近的敵人附近放置陷阱','380 遊戲單位','陷阱周圍半徑 85 遊戲單位'],
      summon_flora:['召喚物攻擊靠近的敵人','距召喚物 170 遊戲單位','召喚物選中的目標'],
      call_homunculus:['召喚物攻擊最近的敵人','距召喚物 230 遊戲單位','召喚物選中的目標'],
    };
    if(overrides[w.id]){const [m,d,a]=overrides[w.id];mode=m;range=d??range;area=a;}
    if(!rule)rule=description;
  }
  const rows=[['targetMode','選敵方式',mode],['targetDistance','選敵距離',range],['effectArea','作用範圍',area]];
  if(rule)rows.push(['targetRule',w.cfg?'選敵規則':'特殊規則',rule]);
  return rows.map(([key,label,value])=>({key,label,value,unit:''}));
}
