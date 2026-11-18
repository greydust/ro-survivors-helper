# 戰鬥效能量測

更新助手並重新整理後，進入要檢查的場次，在「選項 → 遊戲 → 戰鬥效能量測」按「量測 15 秒」，關閉選項回到戰鬥。第一個前景 playing 更新才開始計時，15 秒後自動還原所有計時包裝。再次開啟選項按「查看報告 → 複製報告」，可貼回對話分析。也可在選項手動停止；等待回到戰鬥超過兩分鐘會取消。

資料僅留在本分頁記憶體，不上傳、不保存存檔。重新整理前請先複製報告。平常未啟動時沒有計時包裝或 FPS 採樣；啟動時會有計時及物件計數負擔，因此數字是診斷參考，不能當作無負擔效能基準。

## 分類與解讀

| 分類 | 量測範圍 |
|---|---|
| 拾取更新 | updatePickups，包括距離掃描、吸取移動、動畫、收集、清除，組隊隊員端包括其呼叫的 replicaPickups |
| 怪物更新 | updateEnemies |
| 怪物空間索引 | rebuildGrid |
| 技能更新 | weapons 中各實例 update；新技能在下一次 step 掛載 |
| 投射物與技能效果 | updateProjectiles、updateHolyTrails、updateFireRings、updatePulls、updateBastion、updateYggdrasil、updateBuffAuras |
| 特效與傷害數字 | updateFxList |
| 其餘遊戲更新／助手 | step 中扣除上述量測子呼叫後的耗時，包含未單獨包裝的技能 hook、地圖、玩家、助手等 |
| 3D 繪圖 CPU 提交 | world3d.render，與遊戲步分開報告；不是 GPU 渲染時間，也不是小地圖或全部 HUD 耗時 |

- categories 的 selfMs 為扣除已量測子呼叫後的時間，避免怪物或技能內又呼叫其他分類造成重複相加。msPerGameStep 以 step 呼叫數為分母，並不是每畫面幀平均。
- methods 的 totalMs、meanMs、maxMs、p95Ms 為包含子呼叫時間的單方法統計。p95 只保存各方法最多最近 4096 次樣本；完整呼叫數與總耗時仍持續累加。
- counts 是各陣列在遊戲步開始時的長度平均及最大值，可能含死亡待清除物件。frames 為前景 playing 時的 requestAnimationFrame 間隔，最多 8192 筆，不能解讀成 GPU 計時。
- seconds 是首次實際採樣至停止的牆鐘時間；期間暫停、升級、掉寶揭示、背景分頁不採樣，但停止計時仍持續。gameSteps 太少或 missing 有關鍵方法時，不宜比較百分比。先在空場、再在卡頓場景各量一次較容易比較。
- 不改寫遊戲方法內容、掉落陣列或任何遊戲數值；包裝保留 this、參數、回傳值、例外與呼叫順序。停止時還原原本屬性描述；量測中若別人替換了方法，停止不覆蓋該新方法。

## Console 介面

```js
const profile = window[Symbol.for('greydust.ro.helper.runtime')].profile;
profile.start(15); // 回傳 ok／錯誤，可指定 1～60 秒
profile.state();
profile.stop(); // 手動結束並取得報告
profile.report(); // 上次完成的報告
```

測試：`node tests/performance.test.cjs` 用可控時鐘驗證分類、巢狀呼叫扣除、樣本上限、原生回傳／例外、方法還原、限時停止與報告 UI。測試數字不代表實際場次耗時。`npm test` 已包含此測試。
