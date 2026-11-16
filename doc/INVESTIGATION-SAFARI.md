# Safari 選卡失效調查（2026-11-16）

## 使用者確認的情境

Safari、單人遠征，第一次三選一由使用者手動點選；之後按鈕有按下／放大反應，但動作不執行。1.9.9 曾回報可正常點擊，1.9.10、1.9.11 再次失效。早先寶箱案例也曾明確確認完全未開自選。

## 版本差異

比對 main 的 1.9.9（06e81ab）與 1.9.11（03d85ea），選卡相關差異限於安裝追蹤：WeakSet 一次性嘗試改為 WeakMap 按事件補裝，以及儲存自選設定時立即 installFastChoice(activeGame)。長按／click 攔截 CSS 與怪物面板在這兩個提交之間沒有變更。兩版都包含直接 choose/chooseChest 的程式碼，不能將它描述為 1.9.11 才新增。

## 原生流程核對

來源： https://ro.hans-webgametw.com/build/main-BNOcv2PN.hzcd62bfc7.js 。擷取原生 kr 選卡視窗函式、choose 與 chooseChest 方法，在隔離的 LinkeDOM/vm 測試環境中執行原函式，搭配兩版實際合併腳本。微任務採佇列，模擬原生820ms收尾計時。繪圖、音效與遊戲數值相關依賴使用替身，並非 Safari 引擎／完整遊戲實機測試。

原生選卡的820ms回呼會先停止繪圖、隱藏 picker、移除 closing、清空卡片，再呼叫 onPick→choose。因此正常的「手動選完後接直接自選」不會因為略過下一個視窗，就必然漏掉上一個視窗清理；先前對此的推論不成立。

| 情境 | 1.9.9 | 1.9.11 |
| --- | --- | --- |
| 連續三次手動選卡 | playing，picker隱藏、無closing、卡片清空 | 相同 |
| 連續三次直接自選 | playing，沒有建立picker | 相同 |
| 手動後接自選 | playing，picker隱藏、無closing、卡片清空 | 相同 |
| 自選後接手動 | playing，picker隱藏、無closing、卡片清空 | 相同 |
| 舊picker仍開啟時，另送入可自選事件 | playing，但舊picker仍可見 | 相同 |

最後一列證明既有視窗與直接自選競態可能留住舊視窗，但此情境是測試刻意送入第二事件，未取得證據顯示使用者單人實機走了相同路徑，不能當成已確認根因。

## 尚未確認

單靠卡片放大／active效果不能判斷 click 是否有送達。仍需實機失效當下的 capture/bubble click、defaultPrevented、JavaScript例外、picker的hidden/closing/選取狀態，以及game.state/pendingLevelUps，區分事件未送達、事件被取消與原生狀態未收尾。2,000層回呼套疊雖是1.9.10可重現缺陷，但1.9.11撤回後仍失效，不能用它解釋全部Safari案例。

本次僅記錄調查；未修改執行邏輯或發佈猜測修正。

## 擷取函式指紋（SHA256）

- picker: `eede47fbb062bf2478a045281c5b1c4d59525493b242c38a2728b01abb8042bd`
- chest: `393a83241a4e7257552b65f7058897b1f4b430aac6d6414d421bb64f03a6752e`
- choose: `46f0cd05ac030f8975ca23e88e8bf73ce97c24000f5c39c2f0f166a3b9e1b86e`

## 觸控自選顯示一致化（2026-11-16）

依使用者要求，移除 DOM 備援自選對 touchInterface 的顯示例外：命中自選時與桌面相同，隱藏 picker 等待原生可點擊時間再選取；重掃不再解除隱藏。沒有命中、需替換確認或五秒逾時時仍恢復手動。直接 choose/chooseChest 路徑及觸控事件攔截未修改。新增觸控未命中／逾時恢復測試，既有連續手動／自選與 Safari 診斷測試通過；未經 iPhone Safari 實機驗證，這不是已確認的舊點擊失效根因修正。

## 1.9.13 實機紀錄（2026-11-16 19:25:01Z）

使用者更正提供上次紀錄後，確認進關約18.4秒為playing；約19.4秒進levelup。22.3–24.7秒多次pointerdown/up與touchstart/end皆到bubble且defaultPrevented=false，沒有對應click；picker持續chosen=0、closing=false、helperHidden=false，errors空。這與先前1.9.12會產生click且完成選擇的紀錄不同，不能再把問題概括為click送達但原生choose拒絕。沒有click不能僅憑這份紀錄確認是Safari合成行為或哪個監聽器造成。

角色資料按鈕戰鬥時已存在，位置(8,114)、尺寸92×36，中心命中自身；選卡時則被原生picker覆蓋。怪物統計元素不存在，原因未明。範圍圈已掛接，嘗試640次，enabled=false、lastReason=disabled，未畫圈是設定關閉。

原生CSS的.pk-card:hover會translateY(-8px) scale(1.04)，觸控樣式未清除此transform。先讓html.touch的選卡hover/focus-visible不位移，並使用touch-action:manipulation；沒有加入代點、取消事件或新原生回呼包裝。此為待Safari實機驗證的針對性調整，不是已確認根因修正。

## 手機戰鬥資訊調整

角色資料按鈕移到body，座標夾在visualViewport內，避免HUD縮放與超界；右下怪物面板增加角色資料與範圍圈快捷按鈕。範圍圈未設定時預設開啟，已保存的false仍尊重，快捷按鈕與原設定共用同一儲存值。戰鬥面板新增250ms獨立補建，不依賴原生tick或DOM變動；面板不存在時略過節流，離開戰鬥仍隱藏／清除。這是缺失面板的恢復機制，尚非已確認Safari原始缺失根因。位置與aria僅在值變更時寫入，避免無效DOM更新。測試涵蓋無原生tick建立、外部刪除後重建、可視範圍夾限、快捷按鈕與離場清除。

## 1.9.14 首次選卡失效紀錄與收斂

19:39:10Z實機紀錄：大廳可產生click；第一次levelup反覆pointer/touch down/up/end，沒有click、沒有preventDefault、chosen與closing維持0/false。hit於多次手勢前後相同，故1.9.14取消hover位移並未解決，不能再將位移視為已確認原因。撤回該hover與touch-action覆寫。

此版實機已確認怪物統計存在、範圍圈692次繪製成功；角色資料按鈕存在且可命中。這三項不能再描述為全部未建立。

程式檢查發現scan在原生picker期間仍執行所有不相關介面更新，獨立250ms補建也持續運作。調整為picker可見時暫停不相關scan工作、角色資料刷新與定時補建；怪物統計僅在首次覆蓋時隱藏，之後不更新。選卡關閉再恢復，直接自選與必要DOM自選仍保留。使用者明確開關自選設定時只即時更新該slot標記。新增測試以Buff layout getter驗證picker期間沒有刷新，關閉後恢復。這驗證了助手更新範圍，未在實機重現Safari缺少合成click，仍需iPhone驗證。
