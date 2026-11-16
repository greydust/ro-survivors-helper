  function start() {
    loadFilterStore();
    const style = document.createElement('style');
    style.textContent = `
      #ro-horde-hud{position:fixed;right:12px;top:auto;bottom:12px;width:180px;max-width:calc(100vw - 24px);z-index:8;box-sizing:border-box;background:#101a2be8;border:1px solid #738ab466;border-radius:7px;padding:7px 8px;color:#e8eef8;font:12px/1.5 sans-serif;overflow:auto;pointer-events:none}
      #ro-horde-hud[hidden]{display:none!important}#ro-horde-hud [data-monster-toggle]{pointer-events:auto;touch-action:manipulation}#ro-horde-hud [data-monster-counts]{pointer-events:auto}#ro-horde-hud [data-monster-header]{display:flex;align-items:center;justify-content:space-between;gap:4px}#ro-horde-hud [data-monster-toggle]{padding:0 5px;min-width:22px;line-height:20px;color:#e8eef8;background:#26344c;border:1px solid #738ab466;border-radius:3px;cursor:pointer}#ro-horde-hud [data-monster-counts][hidden]{display:none}#ro-horde-hud [data-horde-progress][data-status=idle]{color:#9da9bb}#ro-horde-hud [data-horde-progress]{font-weight:700;color:#ffd78a;font-size:14px}#ro-horde-hud [data-horde-progress][data-status=complete]{color:#76f0b0}#ro-horde-hud [data-horde-progress][data-status=canceled]{color:#9da9bb}#ro-horde-hud [data-monster-total]{margin-top:7px;padding-top:6px;border-top:1px solid #738ab444;font-weight:700}#ro-horde-hud [data-monster-counts]>div{display:flex;justify-content:space-between;gap:10px;padding:2px 0}#ro-horde-hud b{font-variant-numeric:tabular-nums}
      .stg-mobs.ro-mob-schedule{display:flex;flex-wrap:wrap;align-items:stretch;gap:8px}.stg-mobs .ro-timed-mob{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;width:auto;min-width:112px;max-width:180px;height:auto;padding:8px;box-sizing:border-box}.ro-timed-mob [data-ro-mob-time]{display:flex;flex-direction:column;align-items:center;gap:3px;margin-top:6px;line-height:1.4}.ro-timed-mob [data-ro-mob-time] b{font-size:12px;overflow-wrap:anywhere}#stg-detail [data-ro-mob-level]{display:block;width:fit-content;max-width:100%;box-sizing:border-box;font-size:12px;font-weight:700;line-height:1.5;color:#ffe08a;background:#20304c;border:1px solid #a18442;border-radius:4px;padding:1px 6px}#stg-detail .stg-boss [data-ro-mob-level]{margin:3px auto}.ro-timed-mob [data-ro-mob-time] small{display:block;font-size:11px;white-space:nowrap;font-variant-numeric:tabular-nums;opacity:.85}
      #ro-unwanted-dialog .ro-filter-panel.ro-equipment-filter{background:#0c1423;color:#e5edf8;border-color:#415573;width:min(1280px,96vw)}
      #ro-unwanted-dialog .ro-gear-toolbar,#ro-unwanted-dialog .ro-gear-actions,#ro-unwanted-dialog .ro-gear-tabs{display:flex;align-items:center;flex-wrap:wrap;gap:5px}
      #ro-unwanted-dialog .ro-equipment-filter>.ro-gear-toolbar button,#ro-unwanted-dialog .ro-gear-actions button,#ro-unwanted-dialog .ro-gear-tabs button,#ro-unwanted-dialog .ro-gear-settings{background:#1a2940;color:#e5edf8;border:1px solid #415573;border-radius:6px;padding:7px 10px}
      #ro-unwanted-dialog .ro-gear-actions{padding-bottom:10px;border-bottom:1px solid #415573;margin-bottom:10px}#ro-unwanted-dialog .ro-gear-actions span{color:#bac9dc;font-size:12px}
      #ro-unwanted-dialog .ro-gear-tabs button.active{background:#b9e5d1;color:#12332c}#ro-unwanted-dialog .ro-gear-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
      #ro-unwanted-dialog .ro-gear-card{border:1px solid #415573;border-radius:9px;background:#152238;padding:12px;min-width:0}#ro-unwanted-dialog .ro-gear-card header{display:flex;align-items:center;gap:8px}#ro-unwanted-dialog .ro-gear-card header img{width:36px;height:36px;object-fit:contain;image-rendering:pixelated}#ro-unwanted-dialog .ro-gear-card header b{flex:1}
      #ro-unwanted-dialog .ro-gear-card .ro-gear-settings{margin-left:auto}#ro-unwanted-dialog .ro-gear-settings.configured{outline:2px solid #b9e5d1}#ro-unwanted-dialog .ro-gear-tier{display:flex;align-items:baseline;gap:6px;margin-top:7px;color:#b9e5d1}#ro-unwanted-dialog .ro-gear-tier button{flex:none;background:#b9e5d1;color:#12332c;border:1px solid #b9e5d1;border-radius:5px;padding:3px 8px}#ro-unwanted-dialog .ro-gear-tier button.excluded{background:#4a2731;color:#ffc7c7;border-color:#a96170;text-decoration:line-through}#ro-unwanted-dialog .ro-gear-card ul{padding-left:18px;font-size:12px;color:#bac9dc;line-height:1.6}
      #ro-unwanted-dialog .ro-equipment-filter .ro-filter-multi-list{color:#172238;width:400px}#ro-unwanted-dialog .ro-equipment-filter summary{color:#172238}#ro-unwanted-dialog .ro-gear-detail-backdrop{position:absolute;inset:0;background:#000a;display:flex;align-items:center;justify-content:center;padding:16px;z-index:5}#ro-unwanted-dialog .ro-gear-detail-panel{background:#f5f7fc;color:#172238;border:2px solid #738ab4;padding:18px;border-radius:10px;width:min(1000px,95vw);max-height:85vh;overflow:auto}#ro-unwanted-dialog .ro-gear-detail-field{display:flex;align-items:center;flex-wrap:nowrap;gap:8px;min-width:0}#ro-unwanted-dialog label.ro-gear-skill{display:flex;flex-wrap:nowrap;gap:5px}#ro-unwanted-dialog .ro-gear-skill span:first-of-type{flex:1}#ro-unwanted-dialog .ro-gear-skill input[type=number]{width:90px;flex:none}#ro-unwanted-dialog .ro-gear-error{color:#b02030}
      #ro-unwanted-dialog .ro-rarity-buttons{display:flex;flex-wrap:wrap;gap:4px}#ro-unwanted-dialog .ro-equipment-filter .ro-rarity-buttons button{color:var(--rarity-color);border-color:var(--rarity-color)}#ro-unwanted-dialog .ro-rarity-buttons button.excluded{text-decoration:line-through;opacity:.5}#ro-unwanted-dialog .ro-manage-details{margin-left:auto!important}
      #ro-unwanted-dialog select.ro-gear-filter-select{width:132px;flex:0 1 132px;margin-left:auto;min-width:0;text-overflow:ellipsis}#ro-unwanted-dialog .ro-gear-card header b{min-width:0;overflow-wrap:anywhere}
      #ro-unwanted-dialog .ro-detail-layout{display:grid;grid-template-columns:240px minmax(0,1fr);gap:18px}#ro-unwanted-dialog .ro-detail-list{max-height:55vh;overflow:auto}#ro-unwanted-dialog .ro-detail-list-row{display:flex;align-items:center}#ro-unwanted-dialog .ro-detail-list-row button:first-child{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#ro-unwanted-dialog .ro-detail-list-row button.active{background:#b9e5d1}#ro-unwanted-dialog .ro-detail-list-row button:not(:first-child){flex:none;padding:4px}
      #ro-unwanted-dialog .ro-detail-editor{min-width:0}#ro-unwanted-dialog .ro-gear-detail-field>b{flex:0 0 105px}#ro-unwanted-dialog .ro-gear-actions span:empty{display:none}#ro-unwanted-dialog .ro-selected-skills{margin:5px 0 12px}
      @media(max-width:700px){#ro-unwanted-dialog .ro-detail-layout{grid-template-columns:minmax(0,1fr)}#ro-unwanted-dialog .ro-detail-list{max-height:160px}#ro-unwanted-dialog .ro-gear-grid{grid-template-columns:minmax(0,1fr)}}
      #ro-character-details-toggle{position:fixed;z-index:8;pointer-events:auto;padding:5px 9px;border:1px solid #738ab4;border-radius:5px;background:#172238ed;color:#e8eef8;font:12px sans-serif;cursor:pointer}
      #ro-character-details{position:fixed;left:12px;top:20vh;width:min(420px,calc(100vw - 24px));max-height:70vh;overflow:auto;box-sizing:border-box;z-index:2147483646;padding:12px;border:1px solid #738ab4;border-radius:8px;background:#172238f5;color:#e8eef8;font:13px sans-serif;pointer-events:auto;box-shadow:0 6px 24px #0009}
      #ro-character-details header{display:flex;justify-content:space-between;align-items:center;gap:8px}#ro-character-details button{cursor:pointer;padding:4px 10px}#ro-character-details p{font-size:12px;color:#b9c8e4;line-height:1.5}
      #ro-character-details [data-character-stats]>div,#ro-character-details [data-character-raw]>div{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px solid #738ab433}#ro-character-details b{white-space:nowrap;font-variant-numeric:tabular-nums}#ro-character-details summary{cursor:pointer;margin-top:12px}#ro-character-details [data-character-raw]{overflow-wrap:anywhere}
      [data-ro-ap-enabled]{outline:2px solid #65edb1!important;outline-offset:2px}
      #smith-list [data-ro-smith-filtered]{display:none!important}
      [data-ro-inventory-categories]{display:contents}#cp-inv-filters [hidden],#ks-filt [hidden]{display:none!important}[data-ro-inventory-subtypes]{display:flex;gap:4px;flex:0 0 100%;order:1;min-width:0;max-width:100%;overflow-x:auto;flex-wrap:nowrap;margin:4px 0 8px}[data-ro-inventory-subtypes] button{flex:none;white-space:nowrap}[data-ro-gear-details]{font-size:11px;line-height:1.5;white-space:normal;overflow-wrap:anywhere;color:var(--ro-text,#24304f)}#cp-eq-list .cand-info{min-width:0}#cp-eq-list .cand-side{flex:none}[data-ro-card-preview]{font-size:12px;line-height:1.5;padding-top:6px}[data-ro-gs-preview]{display:block;font-size:10px}
      #smith-filters{flex-wrap:wrap}
      #ro-auto-refine{display:inline-flex;align-items:center;gap:6px;margin-right:8px;flex-wrap:wrap}
      #ro-auto-refine-target{padding:6px;border:1px solid #a0aec7;border-radius:4px;font:inherit}
      #ro-unwanted-dialog{position:fixed;inset:0;z-index:2147483647;background:#0009;display:flex;align-items:center;justify-content:center;padding:16px;font:14px sans-serif;color:#172238}
      #ro-unwanted-dialog .ro-filter-panel{background:#f5f7fc;border:2px solid #738ab4;border-radius:10px;padding:18px;width:min(1440px,96vw);max-width:100%;max-height:90vh;overflow:auto;box-sizing:border-box}
      #ro-unwanted-dialog h3{margin:0 0 10px}#ro-unwanted-dialog p{line-height:1.5}
      #ro-unwanted-dialog input,#ro-unwanted-dialog select{max-width:100%;padding:6px;margin:4px;border:1px solid #a0aec7;border-radius:4px;background:white;color:#172238;font:inherit}
      #ro-unwanted-dialog input[type=number]{width:90px}#ro-unwanted-dialog label{display:inline-flex;align-items:center;flex-wrap:wrap}
      #ro-unwanted-dialog button{margin:4px}
      #ro-unwanted-dialog .ro-filter-multi{position:relative;display:inline-block;width:240px;max-width:100%;min-width:0;flex:0 1 240px;margin:4px}
      #ro-unwanted-dialog .ro-filter-field{display:inline-flex;align-items:center;flex-wrap:wrap;max-width:100%;min-width:0}
      #ro-unwanted-dialog .ro-filter-multi summary{cursor:pointer;border:1px solid #a0aec7;border-radius:4px;background:white;padding:6px;width:100%;box-sizing:border-box;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #ro-unwanted-dialog .ro-filter-multi-list{position:fixed;z-index:2147483647;min-width:0;width:320px;max-width:calc(100vw - 24px);box-sizing:border-box;max-height:300px;overflow:auto;background:white;border:1px solid #738ab4;box-shadow:0 4px 12px #0004;padding:6px}
      #ro-unwanted-dialog .ro-filter-multi-list label{display:flex;flex-wrap:nowrap;margin:3px;cursor:pointer;white-space:normal;overflow-wrap:anywhere}
      #ro-unwanted-dialog .ro-filter-multi-list input{flex:none}
      #picker[data-ro-ap-hidden]{visibility:hidden!important;pointer-events:none!important}
      #ro-ap-menu{position:fixed;z-index:2147483647;background:#172238;color:#fff;border:1px solid #738ab4;border-radius:8px;padding:6px;box-shadow:0 6px 24px #0009;font:14px sans-serif;min-width:180px}
      #ro-ap-menu>div{padding:7px 10px;color:#b9c8e4;max-width:280px;overflow-wrap:anywhere}
      #ro-ap-menu button{display:block;width:100%;padding:10px 14px;color:#fff;background:#2c4365;border:0;border-radius:5px;text-align:left;cursor:pointer;font:inherit}
      #ro-ap-menu button:hover{background:#3b5f88}
      #ro-ap-toast{position:fixed;left:50%;top:16%;transform:translateX(-50%);z-index:2147483647;max-width:85vw;background:#172238ed;color:#d8ffe9;border:1px solid #65edb1;border-radius:8px;padding:10px 16px;font:14px sans-serif;pointer-events:none}

      html.touch #skillbar,html.touch #runitems{pointer-events:auto}
      #ro-safari-diagnostics-open{position:fixed;left:max(6px,env(safe-area-inset-left));bottom:max(6px,env(safe-area-inset-bottom));z-index:2147483647;pointer-events:auto;min-height:32px;padding:5px 8px;border:1px solid #8b9cb5;border-radius:6px;background:#172238;color:#fff;font:12px sans-serif}
      #ro-safari-diagnostics{position:fixed;inset:8px;inset:max(8px,env(safe-area-inset-top)) 8px max(8px,env(safe-area-inset-bottom));z-index:2147483647;box-sizing:border-box;background:#142033;color:#fff;border:1px solid #8b9cb5;border-radius:8px;padding:12px;overflow:auto;pointer-events:auto;font:14px/1.4 sans-serif}
      #ro-safari-diagnostics button,#ro-safari-diagnostics select{min-height:40px;font-size:16px;margin:3px;padding:6px}
      #ro-safari-diagnostics textarea{display:block;box-sizing:border-box;width:100%;height:55vh;min-height:140px;font:12px/1.4 monospace;background:#fff;color:#172238;user-select:text;-webkit-user-select:text;-webkit-touch-callout:default;pointer-events:auto}
      @media(pointer:coarse){
        #skillbar,#runitems{pointer-events:auto}
        #skillbar .skill-slot[data-skill],#runitems .run-slot[data-item],#lu-sockets .skill-slot[data-skill],#lu-sockets .run-slot[data-item]{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;touch-action:manipulation}
        #ro-ap-menu button,#ro-unwanted-dialog button,#ro-unwanted-dialog summary,#ro-character-details button{min-height:44px;touch-action:manipulation}
        #ro-horde-hud [data-monster-toggle]{min-width:28px;min-height:28px}
        #ro-character-details-toggle{min-height:36px}
        #ro-unwanted-dialog input,#ro-unwanted-dialog select{font-size:16px}
      }
      @media(max-width:700px),(pointer:coarse) and (max-height:500px){
        #ro-unwanted-dialog{padding:6px;padding-top:max(6px,env(safe-area-inset-top));padding-bottom:max(6px,env(safe-area-inset-bottom));box-sizing:border-box}
        #ro-unwanted-dialog .ro-filter-panel.ro-equipment-filter{width:100%;max-height:calc(100dvh - 12px);padding:10px;overscroll-behavior:contain}
        #ro-unwanted-dialog .ro-gear-grid{grid-template-columns:minmax(0,1fr);gap:8px}
        #ro-unwanted-dialog .ro-gear-card{padding:8px}
        #ro-unwanted-dialog .ro-gear-card header{flex-wrap:wrap;gap:4px}
        #ro-unwanted-dialog .ro-gear-card header b{flex:1;min-width:90px}
        #ro-unwanted-dialog select.ro-gear-filter-select{flex:0 0 100%;width:100%;margin:4px 0 0}
        #ro-unwanted-dialog .ro-gear-tabs{flex-wrap:nowrap;overflow-x:auto;padding:4px 0;overscroll-behavior-x:contain}
        #ro-unwanted-dialog .ro-gear-tabs button{flex:none;white-space:nowrap;margin:0}
        #ro-unwanted-dialog .ro-gear-toolbar button,#ro-unwanted-dialog .ro-gear-actions button{margin:2px;padding:6px 8px}
        #ro-unwanted-dialog .ro-manage-details{margin-left:2px!important}
        #ro-unwanted-dialog .ro-gear-detail-backdrop{position:fixed;padding:6px;box-sizing:border-box}
        #ro-unwanted-dialog .ro-gear-detail-panel{width:100%;box-sizing:border-box;max-height:calc(100dvh - 12px);padding:10px;overscroll-behavior:contain}
        #ro-unwanted-dialog .ro-detail-layout{grid-template-columns:minmax(0,1fr);gap:10px}
        #ro-unwanted-dialog .ro-detail-list{max-height:140px}
        #ro-unwanted-dialog .ro-gear-detail-field>b{flex:0 0 82px;font-size:12px}
        #ro-unwanted-dialog .ro-filter-multi{margin:4px 0;flex:1;min-width:0}
        #ro-unwanted-dialog .ro-gear-skill input[type=number]{width:72px;box-sizing:border-box}
        #ro-unwanted-dialog .ro-gear-tier span{min-width:0;overflow-wrap:anywhere}
        #ro-ap-menu{box-sizing:border-box;min-width:0;width:240px;max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px);overflow:auto}
        #ro-ap-menu button+button{margin-top:6px}
        #ro-character-details{left:max(6px,env(safe-area-inset-left));top:max(6px,env(safe-area-inset-top));width:calc(100vw - 12px);max-height:calc(100dvh - 12px);padding:10px;overscroll-behavior:contain}
        #ro-character-details [data-character-stats]>div,#ro-character-details [data-character-raw]>div{gap:8px}
        #ro-character-details [data-character-stats] span,#ro-character-details [data-character-raw] span{min-width:0;overflow-wrap:anywhere}
        #lu-feed.land{bottom:calc(max(6px,env(safe-area-inset-bottom)) + 140px)!important}#ro-horde-hud{font-size:10px;padding:4px 5px}#ro-horde-hud [data-monster-total]{margin-top:3px;padding-top:3px}#ro-horde-hud [data-horde-progress]{font-size:11px}
        #ro-ap-toast{box-sizing:border-box;max-width:calc(100vw - 20px);font-size:13px;padding:8px 10px}
        .stg-mobs .ro-timed-mob{min-width:90px;max-width:130px;padding:5px}
      }
    `;
    document.head.append(style);
    safariDiagnostics?.mount();
    document.addEventListener('contextmenu', touchContext, true);
    document.addEventListener('pointerdown',beginLongPress,true);
    document.addEventListener('pointermove',moveLongPress,true);
    document.addEventListener('pointerup',endLongPress,true);
    document.addEventListener('pointercancel',endLongPress,true);
    document.addEventListener('touchstart',startTouchPress,{capture:true,passive:true});
    document.addEventListener('touchmove',moveTouchPress,{capture:true,passive:true});
    document.addEventListener('touchend',finishTouchPress,{capture:true,passive:true});
    document.addEventListener('touchcancel',finishTouchPress,{capture:true,passive:true});
    document.addEventListener('click',suppressHeldEvent,true);
    document.addEventListener('scroll',cancelLongPress,true);
    window.addEventListener('blur',()=>{touchUiActive=false;clearLongPress();});
    window.addEventListener('resize',()=>{cancelLongPress();closeMenu();closeFilterMenus();});
    window.visualViewport?.addEventListener('resize',()=>{cancelLongPress();closeMenu();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){touchUiActive=false;clearLongPress();closeMenu();}});
    document.addEventListener('click',event=>{
      if(keepOffline&&event.target instanceof Element&&event.target.closest('#lobby-online')){
        event.preventDefault();event.stopImmediatePropagation();notify('保持離線遊玩已開啟；可到選項 → 遊戲關閉');return;
      }
      if(!autoRefine.active||!(event.target instanceof Element))return;
      if(event.target.closest('#smith-close'))stopAutoRefine();
      const row=event.target.closest('#smith-list .cand[data-uid]');
      if(row&&row.dataset.uid!==autoRefine.uid)stopAutoRefine('已切換裝備，自動精煉停止');
    },true);
    document.addEventListener('pointerdown', e => { if (!menu?.contains(e.target)) closeMenu(); }, true);
    document.addEventListener('keydown', e => {
      if(characterDetails&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeCharacterDetails();return;}
      if(filterDialog){
        // The game's Escape/number handlers must not react behind this modal.
        e.stopImmediatePropagation();
        if(e.key==='Escape'){e.preventDefault();const menu=filterDialog.querySelector('.ro-filter-multi[open]');if(menu)menu.closeMenu();else if(gearDetails)closeGearDetails();else closeFilter();}
        return;
      }
      if (e.key === 'Escape') {
        if(autoRefine.active)stopAutoRefine();
        closeMenu();
        if (job) {
          document.querySelectorAll('#pk-cards .pk-card').forEach(card => manualCards.add(card));
          cancel(); notify('已中止本次自動選擇');
        }
      }
    }, true);
    window.addEventListener('keydown',e=>{
      if(characterDetails&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeCharacterDetails();return;}
      if(filterDialog){e.stopImmediatePropagation();if(e.key==='Escape'){e.preventDefault();const menu=filterDialog.querySelector('.ro-filter-multi[open]');if(menu)menu.closeMenu();else if(gearDetails)closeGearDetails();else closeFilter();}}
    },true);
    window.addEventListener('blur', closeMenu);
    new MutationObserver(records => {
      // The game hides #hud when destroying a run and shows it for a new run.
      // oldValue also detects a hide/show pair within the same mutation batch.
      if (records.some(r => r.type === 'attributes' && r.target.id === 'hud' && r.attributeName === 'class'
        && /(?:^|\s)hidden(?:\s|$)/.test(r.oldValue || '') !== r.target.classList.contains('hidden'))) resetRun();
      const relevant = records.some(r => {
        // DOMTokenList can emit a class mutation even when add/toggle leaves
        // the value unchanged. Never schedule another scan for that no-op.
        if(r.type==='attributes'&&r.attributeName==='class'&&r.oldValue===r.target.getAttribute('class'))return false;
        const el = r.target instanceof Element ? r.target : r.target.parentElement;
        return el?.closest('#lap-tabs, #stages, #stg-detail, #stg-list, #picker, #skillbar, #runitems, #smith, #shop-quality, #shop-filters, #opt-body, #opt-tabs, #lobby-online, #npc-text, #npc-options, #pause, #charpanel, #kstorage') || [...r.addedNodes].some(n => n instanceof Element && (n.matches('#lap-tabs, #stages, #stg-detail, #stg-list, #picker, #skillbar, #runitems, #smith, #shop-quality, #opt-body, #opt-tabs, #lobby-online, #pause, #charpanel, #kstorage') || n.querySelector('#lap-tabs, #stages, #stg-detail, #stg-list, #picker, #skillbar, #runitems, #smith, #shop-quality, #opt-body, #opt-tabs, #lobby-online, #pause, #charpanel, #kstorage')));
      });
      if (relevant) schedule();
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['class', 'src'] });
    scan();
    installGameHooks();
    // Recover overlays independently of native ticks and DOM observer timing.
    function refreshBattleOverlays(){
      if(activeGame&&!pickerIsOpen()&&!touchUiIsQuiet()){
        runHelperHook(activeGame,'怪物統計',()=>updateHordeHud(activeGame));
        runHelperHook(activeGame,'角色資料',updateCharacterDetails);
      }
      setTimeout(refreshBattleOverlays,250)?.unref?.();
    }
    setTimeout(refreshBattleOverlays,250)?.unref?.();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
