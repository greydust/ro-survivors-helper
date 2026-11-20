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

## 拾取優化與投射物細分（format 2）

報告摘要與 JSON 新增以下資訊，操作方式維持不變：

- `pickupOptimization.start/end`：第一次採樣與結束時的場景快照。`current` 列出活物品、隱藏物品、已掛載動畫優化的物品，以及光柱的對應數量；`beamPositionPatched` 表示當前世界已掛載光柱定位優化。這比全域「曾識別成功」旗標更適合判斷目前場景。
- `pickupOptimization.start/end.inventory`：開始與結束各掃描一次的物品分類與參照檢查，摘要也會列出。`entries` 是陣列筆數；`live/dead` 按 `dead` 旗標統計物件筆數；`uniqueObjects/uniqueLiveObjects` 按物件身分去重；`duplicateReferences` 是每個物件第一次以外多出的筆數，`repeatedObjects` 是重複出現的不同物件數。例如同一物件出現三次：entries=3、uniqueObjects=1、duplicateReferences=2、repeatedObjects=1。內容相同但參照不同的物件仍分開計算。
- `inventory.byKind` 保留原始 kind 字串，依筆數由多至少列出各種類的上述統計，另含未死亡項目的 `hiddenLive`（隱藏筆數）及 `magnetLive`（吸取中旗標筆數）；缺少或非字串 kind 歸 null。`invalidEntries` 為 null、undefined、非物件等異常項目，不列入種類或物件數。entries = live + dead + invalidEntries；原有 `current.live` 仍為未去重筆數。只有開始／結束快照，不代表整段期間最大值，不會刪除或去重遊戲陣列。
- `pickupOptimization.skippedDuringMeasurement`：本次期間省略的物品動畫、光柱動畫、隱藏光柱定位、靜止光柱定位次數；不包含量測開始前的累計。大於零證明期間有略過工作，並不代表省下多少毫秒。零可能表示物品可見、光柱正在移動、沒有該類物件或版本未識別，需要對照覆蓋率解讀。未進入 playing 則沒有起始快照，差值為 null。
- `projectileBreakdown.totalMs`：`updateProjectiles` 含子呼叫總耗時。`visualCallbacksMs` 是在其執行範圍內的 `model.update` 與 `view.update` 排他耗時；`remainingMs` 是扣除這些回呼後的其餘時間。兩者相加等於 totalMs，不應再加到 effects 分類上。
- `remainingMs` **不是純邏輯耗時**：仍包含移動、碰撞、傷害、命中特效建立、模型清理、旋轉等未拆出的視覺工作。`placeOverlay` 的畫面投影在此方法以外，沒有算入這份細分。回呼內若觸發其他已量測方法，也會保留在其餘時間，避免把它誤算成視覺。
- `modelUpdateCalls/viewUpdateCalls` 是期間實際量到的回呼數；`modelTargets/viewTargets` 是觀察到有 update 的不同目標數；`unwrappedTargets` 是無法安全包裝的目標數，其耗時留在 remainingMs。每次投射物更新前觀察目前陣列，因此可捕捉兩次更新間產生的新投射物；同一次更新內才加入或換掉的目標可能未被細分。共享目標只包裝一次。

模型與精靈回呼按名稱彙總，樣本仍各最多 4096 筆，不為每顆投射物產生一列報告。只包裝方法，不替換投射物陣列或改變收集、移動、命中流程；非投射物更新範圍內的同一回呼不列入細分。停止時還原目標方法。逐物件計時及目標掃描增加額外負擔，應用同版本、相近負載比較，不能直接把 format 1/2 差值解讀成效能退步。

原生投射物快照來源見 `tests/fixtures/projectile-performance-native.json`；測試直接執行該方法，驗證移動、到期清理、動態新增目標、範圍外回呼排除、無法包裝目標及時間拆分。拾取測試另驗證期間差值與重複量測的基線。

## Console 介面

```js
const profile = window[Symbol.for('greydust.ro.helper.runtime')].profile;
profile.start(15); // 回傳 ok／錯誤，可指定 1～60 秒
profile.state();
profile.stop(); // 手動結束並取得報告
profile.report(); // 上次完成的報告
```

測試：`node tests/performance.test.cjs` 用可控時鐘驗證分類、巢狀呼叫扣除、樣本上限、原生回傳／例外、方法還原、限時停止與報告 UI。測試數字不代表實際場次耗時。`npm test` 已包含此測試。

## 怪物更新細分（format 3）

`enemyBreakdown` 於 `updateEnemies` 範圍內量測下列方法，保留原生方法內容、參數、回傳、例外與順序：

- `groupsMs.view`：怪物 `updateView`，包含其內未另外拆出的動畫／視覺同步。
- `groupsMs.separation`：`buildSeparation`、`separate`。
- `groupsMs.navigation`：目前 `walk` 的 `lineClear`、`flowDir`、`resolve`、`warpAt`、`nearestWalkable`。
- `groupsMs.targeting`：`chaseTarget`、`followHost`。
- `groupsMs.bossAI`：`bossBrains` 對應目標的 `update`。

各組使用排他耗時，巢狀呼叫不重複相加；`remainingMs` 為 `updateEnemies` 本身的排他耗時，仍含狀態、移動計算、戰鬥、清理、未拆出的視覺與部分計時負擔，不是純邏輯時間。`nestedOtherMs` 為其中呼叫的其他已量測方法（例如投射物）；`totalMs = sum(groupsMs) + remainingMs + nestedOtherMs`。上述細分已包含在原有分類，不可再加到 categories 上。

`observedEnemies` 是每次怪物更新前累計觀察到的不同怪物物件；`viewTargets`／`missingViewTargets` 是首次觀察時有／無 `updateView` 的物件數；`unwrappedTargets` 是各組方法無法安全包裝的目標方法數，其耗時保留在呼叫者。它們是期間累計覆蓋資訊，不是當前怪物數；有目標不代表實際執行過，實際呼叫數見 methods 的 `enemy:*`。同一次更新內才新增或替換的目標可能漏拆。範圍外的同一方法不計入細分，停止時還原；未啟動時不掃描或包裝。

目標掃描在 `updateEnemies` 計時開始前執行，其負擔會留在外層呼叫者（通常為其餘遊戲更新／助手）。新增逐怪物掃描及計時負擔，應使用同版、相近負載比較。不能直接將 format 2/3 的差值當成效能變化。原生來源與回歸 fixture 見 `tests/fixtures/enemy-performance-native.json`。

## 降低怪物細分的量測負擔（format 4）

實際 format 3 報告在 15.021 秒內記錄約 800 萬次怪物相關包裝呼叫，畫面採樣降至 4.46 FPS。這顯示細粒度計時需要降低干擾；不同場景負載亦有差異，無法由此計算量測器單獨造成的降幅或各組原生耗時。

format 4 保留 `step`、`updateEnemies` 等整體方法逐次計時，但怪物細節只在第 1、33、65…次前景更新量測。只有這些更新會掃描、安裝細節包裝，並在該次更新返回或拋出例外時立即還原，其餘更新直接使用原方法。未改變遊戲更新頻率或內容。

`enemyBreakdown.sampling` 列出 `interval`（32）、`updateCalls` 與 `sampledCalls`。該區塊的 totalMs、groupsMs、remainingMs、nestedOtherMs **只代表抽樣更新**，合計關係維持不變，不能拿它們除以全程 gameSteps 或直接與全程 categories 相減，也不乘 32 外推。完整怪物耗時仍看 methods.updateEnemies 或 categories.enemies。methods 的 `enemy:*` 同樣僅為抽樣內的呼叫。摘要顯示抽樣次數。

覆蓋資訊僅包含抽樣前觀察到的目標，observedEnemies 等仍按物件去重；unwrappedTargets 改為抽樣時無法包裝的嘗試次數，同一目標跨抽樣可重複計入。安裝、掃描、還原的成本留在外層呼叫者；抽樣內的計時負擔仍會污染細分結果，並非無負擔基準。固定間隔可能錯過短暫工作，不宜由零值宣稱該工作不存在。

## 全流程細部抽樣（format 5）

沿用 15 秒操作；原有分類仍每次計時。新增 `detailedSampling.scopes`，每個 scope 各自每 32 次取一次，錯開相位以分散負擔：

| scope | 細分掛載點 |
|---|---|
| step | 相機、玩家／寵物、hall／atmosphere／gloom、ambient／mapEffects、walk.updateFlow／移動與傳送、spawn／horde、地圖火焰、回血、buffValue、stateHash、story／endless、既存 scheduled.fn |
| updateFxList | fx.update（依抽樣時 hidden／visible 分組）、numbers.update、view.destroy；回呼內的傷害與特效建立等共用方法 |
| updatePickups | 各已知 kind 的 update、collect、replicaPickups、sweepPickups、tryOpenChest、gainExp、vacuum、setBeam／removeBeam、view.destroy |
| rebuildGrid | grid.clear／get／set |
| weapon:N 與各 update… 技能效果方法 | 傷害、死亡、範圍搜尋、特效／數字建立、回血、射線檢查、投射物拖曳／渦流、光跡／火圈／結界／世界樹／光環的 update／dispose 等存在的方法 |
| updateProjectiles | 上列共用方法及 model.dispose／view.destroy；原有 projectileBreakdown 的 model.update／view.update 仍維持原範圍 |
| renderWorld | 相機、翅膀、滑鼠／劇情、placeOverlay、血條、screenPos／pixelScale、world.project／scaleAt／spriteLift／groundSquashAt／heightAt |
| world3d.render | 場景 walk／emit／heightAt、批次 flush、陰影／光暈提交、地面／柱體／特效淡出、cosmos／altar、renderer.getSize／setSize／render、program 維護 |

怪物沿用 `enemyBreakdown` 的低頻抽樣；新細分不再次拆怪物，避免重複安裝。`renderWorld` 整體額外列在 methods，分類為 renderFrame；它包含 world3d.render，兩者不能相加。原 categories.render 仍只代表 world3d.render 的 CPU 時間，不代表完整畫面或 GPU。畫面投影現在可由 renderWorld scope 檢查。

每個 scope 的 `sampling.interval/offset/updateCalls/sampledCalls` 標示抽樣範圍。`totalMs` 是抽樣根方法的含子呼叫耗時，`methods` 保存方法 totalMs／selfMs／calls／p95Ms，`detailedMs` 是這些方法的 selfMs 總和；`nestedMeasuredMs` 是根方法直接呼叫其他原有已計時方法的時間；`remainingMs` 是剩餘未拆出時間。三者合計為 totalMs。所有細部數字只代表該 scope 的抽樣更新，不乘 32 外推、不除以全程 gameSteps、不跨 scope 相加，也不另加到 categories。不同 scope／物件中相同方法的工作會依最近的原有計時範圍歸屬；巢狀細節與原有計時方法都扣除子呼叫，避免重複計帳。

每次抽樣最多讀取每個集合 256 筆（陣列每次抽樣輪換起點；其他 iterator 取前段）、安裝 512 個目標方法、執行 2,048 次細節計時；超出時原方法照常執行，其成本留在剩餘或呼叫者。`collectionEntriesSkipped` 是略過集合項目數（未知長度 iterator 為下界）、`targetLimitSkips` 是掛載額滿嘗試數、`budgetSkippedCalls` 是呼叫計時額滿次數。`attemptedMethods/installedMethods/missingMethods/unwrappedMethods` 為累計掛載嘗試資訊，不是當前目標數，也不是物件身分去重統計。無法安全包裝時不改動該方法；缺少可選方法不視為整份報告失效。同次更新才產生／替換的目標可能漏拆。固定相位與集合上限可能漏掉短暫／未觀察工作，零值不能證明沒有成本。

`setupMs/restoreMs` 記錄各 scope 可直接觀察的掃描、掛載及還原 CPU 成本；`profilerOverhead.enemySetupMs/enemyRestoreMs` 記錄怪物抽樣的同類成本。這些成本已可能包含在外層更新／其餘更新內，不能再加到全程總耗時或直接相減推算無負擔時間，也沒有涵蓋所有包裝、計時、統計、GC 或 JIT 影響。抽樣內的方法耗時同樣受計時負擔與瀏覽器計時精度影響。較大的 setup／restore 成本可幫助判斷「其餘」是否受到診斷干擾。

摘要列出每個 scope 的抽樣次數、掛載／還原成本、未拆出時間及最重的五個細節方法；完整 methods 與覆蓋資訊保留於 JSON。原生快照見 `tests/fixtures/deep-performance-native.json`。回歸測試實際執行原生 step、拾取、特效與空間索引，另驗證繪圖巢狀計帳、範圍隔離、集合／呼叫上限、例外還原與原方法中途替換。

未拆出的行內計算、模組閉包內的技能 hook、助手自身閉包或未暴露的原生操作仍留在 remainingMs；不以改寫原生方法內容或替換遊戲陣列的方式製造更細的區段。
