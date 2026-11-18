# 各部位裝備：獨立網頁

直接以瀏覽器開啟 `index.html`，不需登入、啟動遊戲或安裝使用者腳本。文字、分類與搜尋可離線使用；原遊戲裝備圖片需要網路。

與助手過濾器共用 `equipmentGroups`、`equipmentTiers`、`actualEquipmentBonuses`、部位與武器類型資料。目前共 320 個裝備 ID、10 個部位分類，提供單手／雙手武器細分類、跨部位搜尋、T4～T8 及中文掉落來源。同名不同 ID 分開呈現，避免把其中一件的詞條誤套到另一件。

固定加成來自實際遊戲定義與 Tier 詞條，不再使用舊圖書館的說明。數值未含精煉、品質基礎面板或隨機詞綴；來源清單保留基礎周目的關卡及 Tier，T4～T8 的規則與過濾器一致。沒有固定詞條的 Tier 明確顯示「無固定加成」。例如紫蝶髮帶 2208 沒有固定減傷，而同名 2209 的原生固定詞條不同，兩者分開顯示。

## 更新資料

1. 從遊戲首頁確認最新公開 `soul_linker` 與 `main` 模組網址，以及 `assets/manifest.json`，下載至本機暫存檔。
2. 執行 `npm run build`。
3. 執行 `node scripts/export-equipment-data.mjs <core暫存檔> <core網址> <main暫存檔> <main網址> <manifest暫存檔>`，以隔離 VM 初始化共用資料，禁止網路與計時工作；main 只擷取關卡資料與多周目設定，不執行主遊戲、登入或帳號流程。匯出會重建一般、聖誕節、元宵節與稀有首領掉落表、保留仍有效的關卡獎勵，並檢查助手的六周目／T8 上限是否符合原生設定。
4. 執行 `npm run build:equipment` 產生完整單檔 `index.html`。
5. 執行 `npm test`，確認資料、分類、搜尋及助手測試。

`data.json` 保留兩個模組的來源網址、SHA256、原生周目設定與日期；`template.html`、`page.js` 是網頁原始碼。發布的 `index.html` 已內嵌資料與介面程式，不需要讀取本機 JSON，也不會在瀏覽時匯入或執行遊戲程式。

本次公開資料來源：

- https://ro.hans-webgametw.com/build/soul_linker-DllBVIRO.hzd1f6294e.js
- https://ro.hans-webgametw.com/build/main-BNOcv2PN.hz8a698f4b.js

遊戲更新不會自動更新此快照。裝備與圖像權利屬原權利人。

2026-11-17 更新：由 201 擴充至 300 件，新增 99 件節慶與稀有首領掉落。名稱透過官方 zh-TW 翻譯與資產清單取得；圖片沿用官方 manifest 的 icon，避免聖誕版或改名裝備誤用不存在的同 ID 圖片。一般關卡獎勵仍保留。

2026-11-18 新版核對：支援 `intruder` 特殊入侵首領來源；重新匯出現行掉落、固定能力與職業 GS。詳細範圍及驗證限制見 [相容性檢查](../COMPATIBILITY.md)。
