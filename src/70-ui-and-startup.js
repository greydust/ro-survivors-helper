  function start() {
    loadFilterStore();
    const style = document.createElement('style');
    style.textContent = `
      [data-ro-ap-enabled]{outline:2px solid #65edb1!important;outline-offset:2px}
      #smith-list [data-ro-smith-filtered]{display:none!important}
      #smith-filters{flex-wrap:wrap}
      #ro-auto-refine{display:inline-flex;align-items:center;gap:6px;margin-right:8px;flex-wrap:wrap}
      #ro-auto-refine-target{padding:6px;border:1px solid #a0aec7;border-radius:4px;font:inherit}
      #ro-unwanted-dialog{position:fixed;inset:0;z-index:2147483647;background:#0009;display:flex;align-items:center;justify-content:center;padding:16px;font:14px sans-serif;color:#172238}
      #ro-unwanted-dialog .ro-filter-panel{background:#f5f7fc;border:2px solid #738ab4;border-radius:10px;padding:18px;width:min(1440px,96vw);max-width:100%;max-height:90vh;overflow:auto;box-sizing:border-box}
      #ro-unwanted-dialog h3{margin:0 0 10px}#ro-unwanted-dialog p{line-height:1.5}
      #ro-unwanted-dialog input,#ro-unwanted-dialog select{max-width:100%;padding:6px;margin:4px;border:1px solid #a0aec7;border-radius:4px;background:white;color:#172238;font:inherit}
      #ro-unwanted-dialog input[type=number]{width:90px}#ro-unwanted-dialog label{display:inline-flex;align-items:center;flex-wrap:wrap}
      #ro-unwanted-dialog button{margin:4px}#ro-unwanted-dialog .ro-filter-rule{border-left:3px solid #7394be;border-radius:4px;background:#e7edf7;padding:8px;margin:8px 0 8px 10px}
      #ro-unwanted-dialog .ro-filter-rule small{display:block;color:#475b77;margin:4px}
      #ro-unwanted-dialog .ro-filter-rule-header{display:flex;align-items:center;flex-wrap:wrap;gap:3px}
      #ro-unwanted-dialog .ro-filter-not>.ro-filter-rule-header{align-items:flex-start}
      #ro-unwanted-dialog .ro-filter-inline-child{border:0;margin:0;padding:0;flex:1 1 auto;min-width:0}
      #ro-unwanted-dialog [data-filter-collapse]{min-width:30px;padding:4px 8px;font-weight:bold}
      #ro-unwanted-dialog .ro-filter-order{display:inline-flex;flex:none;gap:1px}
      #ro-unwanted-dialog [data-filter-move]{min-width:26px;padding:4px;margin:1px}
      #ro-unwanted-dialog .ro-filter-multi{position:relative;display:inline-block;max-width:100%;min-width:120px;margin:4px}
      #ro-unwanted-dialog .ro-filter-field{display:inline-flex;align-items:center;flex-wrap:wrap;max-width:100%;min-width:0}
      #ro-unwanted-dialog .ro-filter-multi summary{cursor:pointer;border:1px solid #a0aec7;border-radius:4px;background:white;padding:6px;max-width:360px;overflow-wrap:anywhere}
      #ro-unwanted-dialog .ro-filter-multi-list{position:relative;z-index:3;min-width:0;width:800px;max-width:100%;box-sizing:border-box;max-height:300px;overflow:auto;background:white;border:1px solid #738ab4;box-shadow:0 4px 12px #0004;padding:6px}
      #ro-unwanted-dialog .ro-filter-multi-list label{display:flex;flex-wrap:nowrap;margin:3px;cursor:pointer;white-space:normal;overflow-wrap:anywhere}
      #ro-unwanted-dialog .ro-filter-multi-list input{flex:none}
      #ro-unwanted-dialog .ro-filter-tier-tags{display:inline;font-size:inherit;color:inherit;white-space:nowrap}
      #ro-unwanted-dialog .ro-filter-tier-tags em{font-style:normal;font-size:10px;font-weight:800;padding:0 4px;border-radius:5px;color:#fff;background:var(--ro-blue-1,#496a9e);margin-right:4px}
      #picker[data-ro-ap-hidden]{visibility:hidden!important;pointer-events:none!important}
      #ro-ap-menu{position:fixed;z-index:2147483647;background:#172238;color:#fff;border:1px solid #738ab4;border-radius:8px;padding:6px;box-shadow:0 6px 24px #0009;font:14px sans-serif;min-width:180px}
      #ro-ap-menu>div{padding:7px 10px;color:#b9c8e4;max-width:280px;overflow-wrap:anywhere}
      #ro-ap-menu button{display:block;width:100%;padding:10px 14px;color:#fff;background:#2c4365;border:0;border-radius:5px;text-align:left;cursor:pointer;font:inherit}
      #ro-ap-menu button:hover{background:#3b5f88}
      #ro-ap-toast{position:fixed;left:50%;top:16%;transform:translateX(-50%);z-index:2147483647;max-width:85vw;background:#172238ed;color:#d8ffe9;border:1px solid #65edb1;border-radius:8px;padding:10px 16px;font:14px sans-serif;pointer-events:none}
    `;
    document.head.append(style);
    document.addEventListener('contextmenu', context, true);
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
      if(filterDialog){
        // The game's Escape/number handlers must not react behind this modal.
        e.stopImmediatePropagation();
        if(e.key==='Escape'){e.preventDefault();closeFilter();}
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
      if(filterDialog){e.stopImmediatePropagation();if(e.key==='Escape'){e.preventDefault();closeFilter();}}
    },true);
    window.addEventListener('blur', closeMenu);
    new MutationObserver(records => {
      // The game hides #hud when destroying a run and shows it for a new run.
      // oldValue also detects a hide/show pair within the same mutation batch.
      if (records.some(r => r.type === 'attributes' && r.target.id === 'hud' && r.attributeName === 'class'
        && /(?:^|\s)hidden(?:\s|$)/.test(r.oldValue || '') !== r.target.classList.contains('hidden'))) resetRun();
      const relevant = records.some(r => {
        const el = r.target instanceof Element ? r.target : r.target.parentElement;
        return el?.closest('#picker, #skillbar, #runitems, #smith, #shop-quality, #shop-filters, #opt-body, #opt-tabs, #lobby-online, #npc-text, #npc-options, #pause') || [...r.addedNodes].some(n => n instanceof Element && (n.matches('#picker, #skillbar, #runitems, #smith, #shop-quality, #opt-body, #opt-tabs, #lobby-online, #pause') || n.querySelector('#picker, #skillbar, #runitems, #smith, #shop-quality, #opt-body, #opt-tabs, #lobby-online, #pause')));
      });
      if (relevant) schedule();
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['class', 'src'] });
    scan();
    installGameHooks();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
