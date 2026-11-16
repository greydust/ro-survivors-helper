# Safari 手機診斷

僅 Safari 啟用（包含 iPhone／iPad）；Chrome、Firefox 等瀏覽器不安裝診斷監聽、不寫診斷紀錄。

## 卡住時怎麼取出

1. 左下角有「Safari 診斷」，可查看本次紀錄並按「複製紀錄」。
2. 若當下所有按鈕都無效，先重新整理遊戲，再開啟「Safari 診斷」，選「上次紀錄」後複製。
3. 若不方便先點按鈕，直接在 Safari 網址列開啟 https://ro.hans-webgametw.com/?rodiag=1 。此網址會自動顯示診斷面板，有上次紀錄時預先選取上次紀錄。
4. 自動複製不可用時，可按「選取全部」，或長按下方唯讀文字框，選擇「全選 → 複製」，再貼回對話。

完整頁面程序凍結時，當下無法保證複製成功；重新載入後可恢復最後成功存入 localStorage 的紀錄。若瀏覽器禁止本機保存，面板會顯示提示，此時重新整理後可能無法保留。不要清除網站資料或切換至另一個瀏覽模式取紀錄；它們的本機儲存可能不同。

## 記錄範圍

- 最近80筆相關輸入／狀態紀錄，另保留最近12筆錯誤。
- JavaScript未捕捉錯誤、未處理Promise拒絕，以及助手更新時已捕捉的錯誤；相同錯誤在2秒內去重，堆疊長度有限。
- 選卡與按鈕的pointer/touch/click事件是否進入觀察點、是否走到bubble觀察點，以及defaultPrevented。沒有bubble紀錄只代表未到達該觀察點，不等於已識別是哪個監聽器攔截。
- picker的hidden／closing／asking／chosen與卡片數，遊戲state／pendingLevelUps及簡單的每秒狀態變化；長時間主執行緒停頓只能在執行恢復後記錄。
- 助手版本與Safari使用者代理。沒有擷取聊天、帳號資料或一般畫面文字；不會上傳紀錄。

輸入監聽全部為passive，未呼叫preventDefault、stopPropagation、stopImmediatePropagation，也不代為click或包裝遊戲的原生卡片回呼。診斷面板自己的按鈕只操作本機顯示與剪貼簿。

不是完整Web Inspector：不攔截console API或網路流量，也無法保證腳本管理器隔離環境／跨來源錯誤提供完整堆疊。原先的本機紀錄不會補回診斷功能安裝之前的事件。
