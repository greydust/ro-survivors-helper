# 接手說明

遷移日期：2026-11-15。腳本版本：1.9.0。使用者主要以繁體中文溝通。
來源工作區：`C:/Users/greyd/Desktop/greydust/Projects/windows-tool`。
這次只重整專案與研究資料，不改功能、不發佈、不操作真實遊戲。

## 程式結構

| 片段 | 內容 |
|---|---|
| 00-header | userscript metadata 與 IIFE 開頭 |
| 10-offline | 主城 WebSocket gate、選項與保存 |
| 20-minimap | 磁鐵標記隱藏、第一圈範圍繪製與保存 |
| 30-state-and-refine | 共用狀態、原生自動精煉、鐵匠分類定義 |
| 40-merchant-filter | 規則判定、商人勾選、樹狀編輯器、基底與 Tier、匯入匯出 |
| 50-smith | 裝備圖示對應與細分類 UI |
| 60-auto-pick | 即時自選掛鉤、勝利磁鐵、右鍵選單與 DOM 備援 |
| 70-ui-and-startup | 樣式、事件、MutationObserver、啟動與 IIFE 結尾 |

組合檔應與遷移前 1.9.0 腳本保持等價；初次遷移另有 SHA-256 驗證。

## 已實作的行為與使用者偏好

- 普攻及技能／道具右鍵自選；最高稀有度優先，同品質選最左。一般選項可能只有一或兩張，不能限定三張。
- 自選名單只在當關有效，不保存；下一關清空。成功掛鉤時，在 picker 建立前選取，省去動畫與防誤觸等待。
- 沒有掛鉤時以 DOM 備援；Escape 可取消本次備援自選。不要刪除普通攻擊支援。
- 勝利後一次磁鐵；單人／房主沿用 vacuum，隊員走原本拾取請求及擲骰。
- 鐵匠只新增雙手武、單手武、盾牌、頭部（上）、護甲、披肩、鞋子；不加不能精煉的頭中、頭下、飾品。
- 自動精煉使用原生精煉及確認按鈕，序列化等待；到目標、爆裝、缺材料、切換／關閉時停止。停止不能撤回已送出的那一次。
- 商人「不需要」只重設目前分類的勾選，不自行出售。排除穿著、保護、初始裝備。既有插卡／精煉裝若符合規則仍可能被勾選，使用者須自行檢查。
- 商人過濾器改為裝備圖鑑式介面，取代舊 AND／OR／NOT 規則與具名設定；新設定獨立存放 `greydust.ro.unwanted.catalog.v3`；可將 v2 逐件細項轉換成去重的具名細項過濾器，不讀取舊 AND／OR／NOT 規則。
- 分類為單手武、雙手武與所有其他裝備部位；依實際裝備 ID 分開，同名不同 ID 不混用屬性與開關，怪物顯示中文。來源快照 `src/equipment-catalog.js` 記錄一般關卡與獎勵、201 個裝備 ID，名稱與掉落資料更新需重新擷取。屬性不再快取圖書館說明，改讀目前遊戲裝備定義的 bonuses 與 bs(itemId,tier)，按未精煉倍率 1 顯示；缺資料標示未就緒，不推定無加成。紫蝶髮帶 2209 有 Tier 減傷，而同名 2208 沒有，因此不得以名稱合併效果。
- 每個 Tier 都明示 T 標籤，可切換保留／不要；稀有度五個按鈕點擊劃掉代表不要，另有全域 T1 以下、T2 以下批次關閉按鈕。預設全部保留；未列圖鑑的特殊裝備、未知 Tier、判斷需要但缺少的詞綴資料保留手動檢查。
- 可重用細項過濾器為保留條件：同格多選 OR，不同格 AND；兩個主屬性格須由不同詞綴滿足，順序不限。技能傷害多選 OR，各有最低百分比，原始 value ×100 與門檻比較（含等於）；不計卡片、精煉或基底加成。條件不符時納入不需要。
- 第一排最右側「管理細項過濾器」支援新增、移除、命名與上下排序，裝備卡片右上方下拉選單選用。設定共用同一份條件；移除會解除所有裝備對該設定的選用。技能傷害從多選下拉清單選取後才顯示最低百分比欄位。所有多選清單使用定位浮層，展開不改變列高，點外面／Escape 可關閉。
- 管理設定套用只修改草稿，最後按「儲存並套用」才生效；取消不存檔。「全部保留」解除裝備選用及稀有度／Tier 排除，但保留具名細項庫。新版 JSON 匯入匯出使用 `ro-helper-equipment` 格式，支援 v2 細項轉換；不支援舊 AND／OR／NOT 規則檔。
- 保持離線只封鎖同來源 `/ws` 主城連線；不封鎖帳號 HTTP 同步，也不封鎖 `/ws-run`。不要改成全面切斷網路以免存檔不同步。
- 戰鬥選項順序：隱藏地上掉落物 → 隱藏小地圖磁鐵 → 顯示怪物潮第一圈範圍。
- 第一圈實線為 `logicReach()+90`，虛線為加上隨機距離上限 40；只是距離，不代表地形有效。

## 掛鉤與已知限制

關卡選擇的 `.stg-mobs` 內，各怪物圖示下方顯示中文名稱與隨機生成時段，多個時段分行呈現，不另建表格；保留原圖示與 data-mob 互動。由已載入共用模組的 `ca` 關卡腳本讀取 waves，依 from/to 合併連續區段，以 runLength 與最後頭目預定 t 的較早者截斷（最後頭目成功出生即 clearMobs／bossArena，runLength 包含頭目戰階段，不能當一般怪停刷時間）；不是每隻怪的確切出生秒數。優先以關卡 banner 的地圖圖檔名稱辨識腳本，備援僅在一般怪與頭目名單唯一吻合時使用；無法確認時不猜測。頭目時間維持原介面。`src/monster-names.js` 是中文名稱快照，新增怪物需更新。
新增標註須做到重複執行不寫入 DOM。原生 classList.add 已存在的 class 仍可能產生 MutationRecord，先 contains 再 add，監聽器也忽略 oldValue 與目前 class 相同的事件，避免 scan／queueMicrotask 反覆排程使遠征選單卡死。`tests/stage-observer.test.cjs` 使用真實 LinkeDOM MutationObserver，設回呼上限以確保迴歸時能失敗而不掛住 CI。

`@grant none`、`@sandbox raw`，需要頁面執行環境。只 import 頁面已載入的 soul_linker 共用模組，不重跑 main。
hooks registry 依 start/tick/hurt/damageMult/hit/kill/cast 陣列形狀尋找；裝備、技能與素材表也使用形狀辨識。
部分資料仍使用已核對的 minified export（bp、bs、bU、ca、cb）；遊戲更新後必須重新檢查，不能當成穩定 API。

商人帳號資料對登入使用者不在普通 localStorage 中。現行作法暫時攔截一次原生清單重繪期間的
JSON.parse 與 Set.has，原樣回傳並在 finally 還原，以讀取裝備並辨識原生「勾選 Set」。
只有唯一且與可見勾選狀態吻合才批量更新該 Set，否則使用原生逐件點選備援。
不要把此處改成修改帳號存檔、直接呼叫出售 API，或常駐攔截所有 JSON.parse。

小地圖只攔截 minimap 的 2D context。磁鐵依原生 U 形路徑隱藏；範圍透過原生 drawImage crop 對應座標，
在玩家箭頭繪製後疊圖。若原生畫法變更，需要重新驗證。

## 驗證狀態

現有 65 個 LinkeDOM／假計時器模擬測試，含自選、規則、篩選、排序／包入、精煉、離線 gate 與小地圖。
已通過語法及模擬測試；未宣稱已在真實帳號逐項驗證。測試不連線、不出售、不精煉真實裝備。
之前普攻兩次修正未能直接重現使用者狀況，後續才加入 ID 優先辨識、名稱／圖示變化備援及診斷訊息。
上線前仍要關注這條路徑，不應將模擬測試等同實際瀏覽器驗證。

## 持久設定

- greydust.ro.unwanted.v1：具名商人規則；格式 version 1，舊字串欄位與新陣列欄位相容。
- greydust.ro.keep-offline.v1：保持主城離線。
- greydust.ro.hide-minimap-magnets.v1：隱藏磁鐵標記。
- greydust.ro.show-horde-ring.v1：顯示第一圈。
- 技能自選名單不使用 localStorage。

研究結論與限制見 RESEARCH.md；來源快照及可重現地圖分析在 research/。

## 分批怪物潮與場上數量

- `src/horde-count.js` 追蹤每波原生 `roHq` 佇列項目及 `spawnEnemy` 成功回傳，支援每批 200 隻及重疊怪物潮。X 是累計成功出生數，死亡不扣除；Y 沿用原生隊伍倍率與錨點取整的理論總數。
- 右側裝備掉落區下方顯示進度，佇列全部處理完轉綠字，即使地形限制使 X 小於 Y；頭目場地或關卡關閉取消生成時不轉綠字。原生公告、生成座標、順序及數值不變。
- 下方獨立掃描 `game.enemies`，排除死亡與移除項目，顯示場上總數及中文分類數量，每 250ms 更新；不把存活數當成怪物潮進度。重繪無變更時不寫 DOM，回歸測試使用真實 MutationObserver 防止觀察器循環。

- 面板寬度 180px；＋／－ 折疊種類明細，怪物潮及場上總數維持顯示。最後一筆生成處理完成起三秒後，進度改為 `怪物潮(-/-)`；新怪物潮獨立計時。
- 場上數量顯示 N / M；M 依目前原生波次 `maxAlive × difficulty.count × partyScale().count × 起始30秒漸增倍率(.2→1)` 向上取整。這是普通刷怪的停止門檻，怪物潮、頭目等仍可能超過；缺少波次資料時以「—」表示未知。已對照公開 `main-BNOcv2PN.hz0107ea21.js` 的 `spawn`、`mv=30`、`fv=.2`。

## 多周目裝備 Tier

- 2026-11-16 公開遊戲 `main-BNOcv2PN.hz0107ea21.js` 的 `RO_LAPC.max=3`、`tierMax=5`；`RO_LAPTIER(g,t)` 在二周目以上回傳 `RO_LAPTOP()+lap-1`，不是在各件裝備原 Tier 加一。基礎最高 T3，因此二、三周目分別 T4／T5。
- 圖鑑保留各裝備原有 Tier，另加 T4／T5，屬性仍交給實際 `bs(id,tier)`。批次排除按鈕從 T1 到最高 T-1，涵蓋所有分類；既有設定相容且新增 Tier 預設保留。多周目數目前依公開配置記錄在 `EQUIPMENT_LAP_COUNT`，遊戲改動時須重新核對。

## 手機長按與關卡怪物等級

- 技能／道具格以 touch/pen Pointer Events 長按 550ms 開啟原本的自選設定；移動超過 10px、多指、pointercancel、scroll、失焦、切關取消。長按後攔截同格的 release/相容滑鼠事件，下一次新觸控恢復普通點按。原生 contextmenu 提早出現時沿用同一流程，避免重複開啟。技能名稱可從實際 skillDef 讀取，缺少可確認名稱的道具不猜測。
- 觸控介面增加取消按鈕、44px 主要按鈕及 16px 輸入框；窄螢幕對話框改單欄、分類橫捲，戰鬥統計縮至 150px。自選選單與多選清單位置依 visualViewport，避免軟鍵盤遮蔽；旋轉視窗時關閉浮動選單。
- 關卡怪物名稱下方新增「等級 X」，取目前共用模組 bj 的 level。#lap-tabs [data-laptab].primary 決定周目；二／三周目照原生 RO_LAPAVG/RO_LAPK，以最後關卡 maze 與目前關卡的波次時長加權平均等級差取整，兩周目加成相同。未能判定等級顯示 —。名稱／等級／時段共同參與簽章，避免 MutationObserver 循環。
- 新增手勢、取消、重複 contextmenu、放手誤點、軟鍵盤可視範圍及周目等級回歸測試。本次本機 file: 預覽被瀏覽器 URL 安全政策阻擋，未進行手機實機或視覺驗證。

- 等級改為金黃色文字／深藍底的獨立標籤，避免沿用原遊戲淺色背景時看不清楚；頭目 `.stg-bosses [data-mob]` 在原名稱後、原生出場時間前插入同一等級標籤。頭目也用相同周目修正，保留原生圖示、時間與點擊事件；重複更新只修改變動文字。

## Console 建置

- build 同步輸出 `.user.js` 與 `.console.js`，後者只去掉 metadata，執行邏輯相同。header 在遊戲 origin 以外不啟動，並用 `Symbol.for('greydust.ro.helper.runtime')` 在 window 記錄已啟動版本，避免重貼／與新版使用者腳本混用造成事件與 WebSocket Proxy 疊加。更新版本須重新整理。
- Console 注入無法觀測先前已建立的主城 WebSocket，建議主畫面進關前執行；詳細限制見 CONSOLE.md。回歸測試涵蓋 Console 首次啟動、重複執行與使用者腳本混合載入。LinkeDOM 多視窗測試的 Proxy backing store 會共用 window Symbol，獨立頁面 fixture 建立時須清除測試實例標記。

## 手機 HUD 與寶箱觸控修正

- 原生 #hud 有介面 zoom；助手用 getBoundingClientRect 的螢幕座標時，面板應掛 body，不能再放進縮放 HUD。原版放在 HUD 且 z-index 12，存在位置縮放與覆蓋選擇層的風險。現改 body／z-index 8，卡片選擇期間 hidden；面板背景不攔點擊，只有折疊按鈕與怪物明細可互動。
- 手機／橫向窄高螢幕寬度132px、固定右下、預設折疊，保留原生 #lu-feed 裝備文字區在上；橫向 .land 通知往上留出140px空間。數量更新依怪物 ID 重用 DOM 列，只改名字或數字，避免高頻重建／重新排序造成閃動。
- #pk-cards 與 #pk-bar 的 pointerdown 清除長按殘留、關閉助手選單／原生技能提示，保留原生 click 與替換確認流程；若手動碰到待自選的卡片，停止該次自動選取。測試涵蓋長按物品後再點寶箱卡片、確認替換、面板與通知高度變動及 picker 顯隱。
- 此次沒有手機實機重現；修正針對已確認的縮放座標與圖層風險及觸控隔離，不應宣稱寶箱問題已經實機驗證解決。

## Safari 長按與選卡修正

- 已確認遊戲 CSS 的 #hud 為 pointer-events:none，只有 html:not(.touch) 才為 #skillbar/#runitems 開啟 pointer-events:auto；這直接解釋「一般戰鬥介面長按無效，選卡介面能長按」。助手為 html.touch 與 coarse pointer 的技能／道具列開啟接收觸控。
- Safari 追加 passive Touch Events，與 Pointer Events 視為同一手勢，避免一個手指被誤認為多指而取消；touchmove/cancel 仍取消長按。放開事件不再 preventDefault／stopPropagation，僅短暫阻擋同格 click/contextmenu，移除 Infinity 狀態避免漏掉 release 後永久攔截。觸控開啟選單時不再強制 focus。
- 手機 DOM 自選不再用 data-ro-ap-hidden 隱藏整個 picker；保留卡片可見可點，自選仍在原生解鎖後嘗試，手動觸碰卡片立即取消該次自選並讓原生接手。桌面原隱藏選卡流程保留。此項是針對偶發不可點的保守處理，尚未在 Safari 實機重現與驗證。
- 回歸測試包含 touch-only、pointer/touch 同時出現、失去 release 的有限攔截時間，以及技能／寶箱手動點選不中斷。以上新行為取代前述「攔截 release／相容滑鼠事件」策略。

- 使用者補充：Safari 1.9.7 發作時整個介面按下有視覺反應但動作不執行，切換分頁無法恢復。此描述尚不能證明是長按攔截；避免宣稱已定位整頁卡死原因。助手 start/tick 的各個更新獨立捕捉錯誤，單一面板例外不再傳回原生遊戲迴圈，其他助手動作繼續；同類錯誤每個遊戲實例僅記錄一次，保留可診斷資訊。
