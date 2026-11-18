# 神格切換偏好

功績記錄者 → 抽卡強化 →「神格切換」解鎖後，在原本解鎖按鈕的位置顯示原生樣式的滑動開關，預設開啟，不附加說明文字。尚未解鎖時僅保留原生購買按鈕。開關保存於本機 `greydust.ro.deity-swap-enabled.v1`，不變更帳號功績、購買等級或裝備存檔。

功績記錄者視窗寬度上限提高至 900px，強化清單依內容延伸；視窗最大尺寸扣除手機安全區並配合原生 UI 縮放。內容超過畫面時只捲動視窗內文，標題與關閉按鈕保持可見，強化清單不再使用固定高度的內層捲軸。

關閉後，後續寶箱、整組重抽、單張重抽及放逐補卡透過原生 `chestOpts()` 取得 `swap:false`；保留其他抽卡條件及原生次數，不替換已顯示的三選一卡片。第一次選神格仍使用原生候選，已持有的技能神格繼續依原生流程精煉；再開啟時恢復原生解鎖能力，未解鎖者不會因此獲得更換能力。

2026-11-18 核對公開客戶端：Game 的 `rollChest()` 呼叫局內道具 `roll()`，`chestOpts()` 以 `perksLeft.deity > 0` 決定 `swap`；道具 `slotItems()`／`rollSlot()` 依此決定是否加入其他已學技能的神格。功績記錄者 `.chr-perk` 以 `.chr-pips i.on` 表示已購買級數。

- https://ro.hans-webgametw.com/build/main-BNOcv2PN.hz8a698f4b.js
- https://ro.hans-webgametw.com/build/soul_linker-DllBVIRO.hzd1f6294e.js

`tests/fixtures/deity-preference-native.json` 保存原生選卡片段；測試涵蓋預設行為、開關還原、已選神格精煉、第一次選取、解鎖限制與不改變現有道具。連線模式若候選由其他主機產生，本機偏好不會改寫其他主機提供的卡片。
