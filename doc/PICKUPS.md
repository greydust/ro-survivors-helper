# 掉落物吸取與隱藏特效優化

隱藏掉落物效能優化固定啟用，不提供開關。設定只存於助手的 localStorage。

## 2026-11-17：靜止光柱定位快取

- 靜止且可見的光柱重用上次定位，省略重複的 `setBeam`／地形高度取樣。移動、重新顯示、外部更動光柱位置、地圖／高度資料來源／高度比例／heightAt 更換時重新定位。有祭壇的場景維持原生取樣，避免動態高度失效。僅包裝完整內容符合已查核版本的 `setBeam`。
- 診斷 `currentUI.pickups.stationaryBeamPositionsSkipped` 記錄省下的靜止定位次數。
- `tests/pickup-performance.test.cjs` 驗證 10,000 次靜止定位只取樣一次，並直接執行公開拾取方法，覆蓋單人、組隊主機／隊員拾取、擲骰、寶箱及磁鐵移動。快照來源存於 `tests/fixtures/pickup-performance-native.json`。此為呼叫數及原生方法測試，並非實機 FPS 測量。

小地圖掉落快取與實驗開關已移除，回到原生每次更新流程。原方案依賴特定 build 檔名及固定 stack 行／列，才能把共用 pickups 陣列的繪圖讀取與拾取讀取隔離；目前沒有取得小地圖實例更新方法的可靠介面，因此未放寬辨識限制。助手不再攔截 pickups 屬性、不建立快取圖層、不讀取舊快取設定；舊 localStorage 值可留存但不生效。原有「隱藏小地圖磁鐵」與怪潮圈保留。

## 原生流程查核

2026-11-16 查核公開客戶端：

- https://ro.hans-webgametw.com/build/main-BNOcv2PN.hzcd62bfc7.js
- https://ro.hans-webgametw.com/build/soul_linker-DllBVIRO.hzf296bcc4.js

2026-11-17：依使用者確認，官方磁鐵已支援吸取寶箱。助手的寶箱吸取選項、設定讀取、目標追蹤與 vacuum/updatePickups 包裝已全部移除，拾取行為交由官方處理。

原生隱藏掉落物仍逐件執行 updatePickups 距離判定，以及 Pickup.update 浮動、位置同步、光暈更新；光柱也繼續執行縮放、shader uniforms 及 setBeam 地形高度取樣。

助手只在函式完整內容符合已確認的純視覺方法時，略過 visible=false 的上述視覺工作。重新顯示時補回累積動畫時間。無法辨識的新版本方法保持原樣。

## 邊界與驗證

- 保留全部原生掉落資料、拾取判定及清除流程；不刪除隱藏物品。
- 拾取距離判定與完整拾取陣列維持原生流程；已移除空間網格試作與其開關，保留隱藏物件的純視覺優化。
- tests/fixtures/pickups-native.json 保存上述公開程式的相關原生方法；tests/pickups.test.cjs 直接執行方法，驗證扣款、團隊請求、拾取清理及視覺恢復。
- 一萬件隱藏物件的一次更新可省下 10,000 次位置同步、20,000 次正弦計算；這是運算呼叫數測試，並非手機 FPS 測量。
- Safari 診斷 currentUI.pickups 提供開關、物件數、識別狀態與省略呼叫累計。

## 磁鐵數量上限

原生 dropPickup 的 RO_MAGFULL 只計算地上未死亡磁鐵，達三個便不建立新的磁鐵，並非整場掉落總量。新增預設關閉的「解除磁鐵數量上限」，不修改怪物死亡時的掉落機率。

僅在 dropPickup 完整方法指紋符合查核版本時，使用暫時的 receiver Proxy 讓 RO_MAGFULL 使用既有 deterministic 例外；實際遊戲 deterministic 旗標不變，其他種類使用原 receiver。未辨識的新版本保持原樣。關閉選項會立即恢復限制，但不刪除已掉落的磁鐵。組隊仍由原生主機處理掉落，不新增同步訊息。

測試直接執行公開原生 dropPickup 與 RO_MAGFULL，驗證預設三個、開啟超過三個、關閉恢復、死亡磁鐵不計數、其他掉落種類與實際遊戲旗標不受影響。

「顯示 FPS」預設關閉，開啟後在戰鬥左下角顯示 requestAnimationFrame 的每半秒平均更新率；非遊玩狀態隱藏，不攔截點擊。這是瀏覽器畫面更新率，非伺服器 tick 或 GPU 計時。

## 2026-11-16：經驗與回血合併查核

查核 main-BNOcv2PN.hz9861d82d.js：原生 dropGem 的 DP=350、pv=60。未死亡經驗球數大於 350 才合併新掉落；優先加入距離掉落點小於 60 的既有球，否則移除距離玩家最遠的一顆並把其經驗加入新球。從空場正常累積可達 351 顆，不會把既有大量經驗球主動壓縮成少數物件。

RO_MEAT 在未死亡回血物達 60 個後，把新回血量加入距離掉落點最近且未吸取中的回血物；若全部正在吸取，使用最後一個。deterministic 模式略過回血合併。隱藏狀態不參與上述條件。

這些合併在新掉落產生時執行，仍掃描 pickups；不是背景空間分區，也不會省略既有物件的每幀距離判定。助手未替換 dropGem/dropMeat/RO_MEAT，開啟助手的隔離原生方法測試仍可合併、保留總經驗／回血值。tests/pickups.test.cjs 另驗證原本已有 1000 顆的場景不會因一次新掉落而自動縮減數量。這是公開方法測試，非使用者當前場次的計數量測。
