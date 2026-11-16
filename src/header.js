// ==UserScript==
// @name         RO倖存者助手
// @namespace    greydust.ro.auto-pick
// @license      MIT
// @version      1.9.10
// @description  右鍵或手機長按設定自動選擇技能／道具，每關重設；勝利後觸發一次全圖磁鐵拾取。
// @match        https://ro.hans-webgametw.com/*
// @run-at       document-start
// @grant        none
// @sandbox      raw
// ==/UserScript==

(() => {
  'use strict';
  // Console and userscript installs share one instance per page.
  if(new URL(location.href).origin!=='https://ro.hans-webgametw.com'){
    console.warn('[RO助手] 請在 RO 倖存者遊戲頁面執行');return;
  }
  const runtimeKey=Symbol.for('greydust.ro.helper.runtime');
  if(window[runtimeKey]){console.info('[RO助手] 本頁已啟用助手；更新版本請重新整理後再執行');return;}
  window[runtimeKey]={version:'1.9.10'};
