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
