# RO 倖存者助手

本專案是給 https://ro.hans-webgametw.com/ 使用的 Tampermonkey 等瀏覽器使用者腳本。
專注於客戶端體驗優化，不修改遊戲原始程式、規則、數值或存檔，不進行伺服器端工作；沿用遊戲原本的操作流程。

- 組合流程：執行 `npm run build`，依檔名順序組合 `src/` 全部 JavaScript，產生可直接複製貼上的 `dist/RO倖存者助手.user.js`。
- 發佈流程：`npm run publish:greasyfork` 僅做離線預檢。手動從 GitHub Actions 的 main 執行發佈 workflow，建置、測試後將合併程式碼與 `doc/GREASYFORK.md` 說明更新至 `greasyfork` 分支，交由 Greasy Fork 原生 webhook 同步。推送 main 不發佈；首次帳號設定見 `doc/WORKFLOWS.md`。
