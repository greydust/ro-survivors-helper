# 工作流程

## 1. 組合使用者腳本

需要 Node.js 20 以上。建置本身只用 Node 標準庫，不需先安裝套件。

```sh
npm run build
```

依相對檔名排序讀取 `src/` 所有 `.js`（包含子目錄），直接串接成
`dist/RO倖存者助手.user.js`。片段共享同一個 IIFE，不能各自執行；新增片段時以數字檔名前綴指定順序。
建置會檢查單一 metadata header、必要欄位、版本一致性與整體 JavaScript 語法，輸出 SHA-256。
請修改 `src/`，不要直接修改生成檔。升版時同步更新 `src/00-header.js` 與 `package.json`，並檢查啟動訊息版本字串。

```sh
npm ci
npm test
```

測試先重建再執行 LinkeDOM 模擬；不會登入遊戲、出售或精煉真實裝備。
測試中的「找不到共用模組」警告是無真實遊戲模組的 fixture 預期結果。

## 2. Greasy Fork 手動觸發發佈

```sh
npm run publish:greasyfork
```

此指令先建置與測試，再將合併程式碼與說明推送至 origin 的 `greasyfork` 分支；原生 webhook 收到該分支的 push 後同步至 Greasy Fork。推送 main 不會發佈。需先完成下方一次性同步與 webhook 設定。

只要離線預檢而不發佈，執行 `npm run check:greasyfork`。

本機發佈使用目前工作目錄的程式碼與說明（包含未提交修改），在獨立暫存 Git 儲存庫建立發佈 commit，不切換目前分支、不修改目前 index，也不推送 main。請先檢查要發佈的內容。使用 origin 的 push URL 與本機 Git 身分、認證；遠端發佈內容沒變時不推送，並行更新時一般 push 會拒絕覆寫，重新執行即可。

`.github/workflows/greasyfork.yml` 僅在手動從 main 執行時，安裝依賴、跑測試與預檢，全部成功後才將生成檔推到 `greasyfork` 分支的 `ro-survivors-helper.user.js`，並將 `doc/GREASYFORK.md` 發佈為 `greasyfork-description.md`。程式碼使用 build 合併產物；說明獨立維護，初始內容複製自 README.md，之後不會自動跟隨 README.md。兩個檔案內容都相同不產生 commit，不強制推送。發佈分支不觸發本 workflow，因此不會循環。請將此分支保留作為發佈用途；Actions 同時發佈會排隊，本機並行推送則由 Git 的非強制推送保護。

### 一次性設定（需帳號擁有者操作）

1. 將專案提交並推送到 `https://github.com/greydust/ro-survivors-helper` 的 `main`，在本機執行 `npm run publish:greasyfork` 產生 `greasyfork` 分支；也可手動執行 Actions workflow。儲存庫與生成檔必須可公開讀取。本機 Git 帳號需有推送權限；若使用 Actions 替代方式，需啟用 Actions 並允許 workflow 的 `contents: write` 權限。分支規則需允許使用的帳號推送 `greasyfork`。
2. 登入 Greasy Fork，開啟**既有腳本 605561** 的管理／同步設定，將程式碼同步網址設為下列網址（不要另建新腳本）：

   ```text
   https://raw.githubusercontent.com/greydust/ro-survivors-helper/greasyfork/ro-survivors-helper.user.js
   ```

   在同一腳本的說明（Additional info）同步設定中選 Markdown，使用以下網址：

   ```text
   https://raw.githubusercontent.com/greydust/ro-survivors-helper/greasyfork/greasyfork-description.md
   ```

3. 在 Greasy Fork 帳號的 Webhook 設定頁取得專屬 Payload URL 與 Secret。在 GitHub 儲存庫的 Settings → Webhooks → Add webhook 填入，Content type 選 `application/json`，事件選 `Just the push event`，啟用 Active。Secret 填入 GitHub webhook 設定，不要提交到程式碼，也不需要提供 Greasy Fork 密碼或 Cookie 給 Actions。
4. 儲存同步設定後，首次使用 Greasy Fork 的手動同步功能匯入已產生的檔案；此時第一次 push 已發生，不會自動重播。後續發佈由 webhook 觸發。
5. 檢查 GitHub webhook 的 Recent deliveries：除了 HTTP 成功，回應的 `updated_scripts` 必須包含腳本 605561，`updated_failed` 應為空。最後確認 Greasy Fork 的版本與程式碼。Actions 成功僅代表同步來源已更新，不代表 Greasy Fork 已接受更新。

### 日常發佈與故障處理

升版時同步修改 `package.json`、`src/00-header.js` 與啟動訊息，完成遊戲內瀏覽器驗證，再推送 main。推送 main 不會發佈；確定要公開時，在本機執行 `npm run publish:greasyfork`；也可至 Actions → Publish Greasy Fork source → Run workflow，選 main 執行。需要修改腳本頁說明時編輯 `doc/GREASYFORK.md`，提交後以相同方式發佈。

測試失敗不更新發佈分支；修正並推送後，重新手動執行 workflow。Webhook 失敗時，先查 Recent deliveries 的回應，再重新傳送該次 delivery 或在 Greasy Fork 手動同步。需要回復時，以更高版本號發布修正版，避免使用者腳本管理器忽略降版。

原生同步的 URL 格式、事件與 Secret 設定依據：[Greasy Fork 官方 webhook 頁面原始碼](https://github.com/greasyfork-org/greasyfork/blob/master/app/views/users/webhook_info.html.erb)。

## 研究重現

`doc/research/` 保留原始命名的抓取快照、地圖資料、模擬數據與 Python 腳本。
先安裝 `doc/research/requirements.txt`，再以該目錄為工作目錄執行 `.scratch-ro-maze-analysis.py`、
`.scratch-ro-maze-score.py`、`.scratch-ro-maze-score-extra.py`、`.scratch-ro-maze-render.py`。
繪圖字型目前使用 Windows 微軟正黑體；其他平台需調整 render 腳本的字型路徑。
score 與 score-extra 原先會各自覆寫 results JSON，網格 `.npy` 才保留每個半徑的完整輸出。
FILES.json 記錄遷移前原始研究檔案的大小與 SHA-256；Python 腳本僅移除舊臨時依賴目錄的 sys.path 設定。
