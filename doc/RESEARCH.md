# RO 倖存者研究摘要

這是 2026-11-14 至 2026-11-15 的前端程式研究，不是伺服器實作或特定玩家的紀錄稽核。
新 Agent 應先重新抓 https://ro.hans-webgametw.com/ 的 script/modulepreload URL，再核對快照是否仍一致。
歷次快照皆保留以免把舊版數值混成現行規則。

## 快照索引

| 本地快照前綴 | 對應遊戲 build |
|---|---|
| .scratch-ro-main.js | main-BNOcv2PN.hzb35890d8.js |
| .scratch-ro-main-current.js | main-BNOcv2PN.hzb6d3d8f7.js |
| .scratch-ro-main-latest.js | main-BNOcv2PN.hzf32e9a82.js |
| .scratch-ro-main-now.js | main-BNOcv2PN.hz1b7a8457.js |
| .scratch-ro-main-merchant.js | main-BNOcv2PN.hz6d2a56e8.js |
| .scratch-ro-core.js | soul_linker-DllBVIRO.hz1919f0df.js |
| .scratch-ro-core-current.js | soul_linker-DllBVIRO.hz259adee5.js |
| .scratch-ro-core-now.js | soul_linker-DllBVIRO.hz5a95db7b.js |

這些 URL 的共同前綴是 `https://ro.hans-webgametw.com/build/`。
HTML 為最後一次抓取的首頁；manifest 原址為 `/assets/manifest.json`；CSS 為 `/build/main-D3mWrOYd.css`。
第三方遊戲快照僅供研究，並不因本助手的 MIT metadata 而改變其原本授權。

## 範圍、護甲與防禦

- 全域範圍加成 B（100%=1）先相加，再套 B/(1+B/2)，極限 +200%；技能本身的範圍修正另乘，不走此曲線。
- 全域範圍天賦受遞減；特定技能天賦的範圍修正不受，不能只看「天賦」兩字判定。
- 一般承傷為 max(1,round((傷害−armor−armor buff)×(1−有效減傷)×(1−DEF減傷率)))。
- 固定護甲先扣，再乘百分比。特殊 s=true 傷害繞過一般公式；護盾、格擋還可使實際扣血為零。
- 常駐減傷上限 60%；暫時減傷（含霸體）加進來後通常以 75% 封頂，brace 有特例；DEF 另乘。
- 常駐 Flee 上限 50%；Auto Guard 是獨立 hurt hook 的格擋，不是加 Flee。
  50% Flee + 25% block 合計避免命中率 62.5%，不能直接相加。

## 尋寶與掉落（務必區分版本）

- 角色 discovery 相加，品質權重為 weight[i]×(1+d/(1+d))^i，基本權重 [55,25,13,6.6,1.5]。
- discovery 影響裝備品質與升級／寶箱選項品質，不直接增加裝備是否掉落，也不乘王卡／蛋掉率。
- 後期版本將一般怪裝備倍率、王裝倍率、一般怪卡／蛋、王卡／蛋與傳說率分開。
  merchant 快照裡一般怪裝備最高 ×20，王裝最高 ×12.5；卡片不能套這兩個數字。
- 卡／蛋基礎率一般怪 0.01%，王 0.1%，另乘難度與數量補償；需怪本來有對應掉落。
- 最新研究參數包含 MAX=12.5、CARD_MAX=6、CARD_ALPHA=.45、HORDE=.1455、REF1=2.6、CAP=100、
  LEG_TOTAL=47.5、LEG_POW=2、T0=.01483679525222552；獸人村 ref=2.7，金字塔2.6，迷宮森林1.1。
- 一般怪每場裝備上限為100×人數；王裝與卡不占一般怪裝備上限。
  單人篩掉的低品質裝備不占額度，組隊機制不同。
- 難度視窗的傳說率保留百分比小數一位，四捨五入；固定用金字塔參考值，不能當作所有關卡或角色的實際值。
- 曾估算獸人村 count/events/speed=20、damage/hp=1、tier=2，整場固定 discovery=500% 時約77.8件傳說；
  tier8未封頂期望約101.7，tier20約119.3。這只是完整清怪參考模型，並非保證實際打滿100件；
  上限截斷後平均會降低，站位／實際擊殺量及逐步取得尋寶道具也會影響。

## 怪物傷害

獸人村一般怪暖場倍率 .3+.7×min(waveTime/450,1)，出生時套用，不因怪存活而持續增加；王不走此暖場。
菁英先把基礎傷害乘1.5取整數，再乘暖場、難度傷害、刷關等級與特殊怪物倍率，注意取整數順序。
狼在獸人村有1.9倍特殊傷害。Lv5且damage=100%，完整暖場後獸人戰士普攻180、腐屍190、
獸人英雄普攻440；王技能另有倍率，例如獸人英雄部分技能2.6倍。

## 怪物潮與站位

- 目標數量 round(min(120,36+time/8)×difficulty.count×partyScale.count)。圈大小不改目標數量。
- 玩家／隊友為圓心，角度均分並加±.02弧度擾動；每個方向依序嘗試 R+U(0,40)、R+90+U(0,40)、R+180+U(0,40)。
- R=logicReach()+90。正常遊玩 logicReach 是 world3d.viewReach，即鏡頭地面足跡最遠距離（上限1700）；
  確定性模式採900。縮放同時改俯角與FOV，所以不能以「畫面拉近」直接推斷半徑較小。
- 出生檢查邊界、walkable、reachable；不檢查已有怪物占位，故不會因「圈塞滿」失敗。
- 一般生怪受 maxAlive×count×partyScale×開場暖場限制；額外怪潮不套這個停止門檻，可以超出。
- 無效出生方向三次失敗就放棄，不補到其他角度；貼邊／卡角可能大幅少生。
- 勝利後原生只提供限時拾取，沒有自動全圖磁鐵；助手才另做一次 magnet。

### 迷宮森林分析

原址：`/assets/maps/prt_maze02/map.json`、`walk.bin`、`minimap.png`。
map width/height=100，世界 tile=64，walk grid=200×200，每格32；可走格9504，單一連通區，無warps。
遊戲邊界每側7×64，即walk格14～186。小地圖顯示座標約 floor(worldX/32)、floor(200−worldY/32)。

模型以720角度×3擾動樣本，依三次半徑嘗試計算候選點覆蓋；百分比是出生方向有效率，不是掉率或擊殺率。
候選點 A(94,50) 適合較小半徑，B(108,95)適合中大半徑，C(105,112)適合接近半徑上限。
例：viewReach=1000時A約78.8%，1300時B約73.5%，1700時C約64.3%。
實際最優位置受螢幕比例、鏡頭、地形高度、路徑擁堵與清怪效率影響，不能宣稱其中一點在所有情況最高。
圖在 `research/figures/RO-迷宮森林-怪潮站位.png`。原始minimap的可視地面不等於碰撞格可走地面，分析以walk.bin為準。

## 永久 Base 經驗（重要更正）

- 永久 Base 與局內撿寶石的等級分開。Kf.kill 累計怪物原始exp×等級差修正，菁英原始經驗5倍。
- 等級差修正：角色不高於怪物為1，超過每級乘.5，最低.01。刷關等級不改怪物定義的等級。
- 每級需求 round(30×L²×1.07^L)，上限99。一般遠征離場結算永久經驗。
- 前端沒有在這條路徑套角色 expMult；該倍率用於局內寶石經驗。也未找到無限塔的同款永久Base結算。
  這不等於已審計伺服器所有活動、補償或歷史規則。
- 迷宮普通怪Lv52～56；63以上一般怪都只剩1%經驗。若五種普通怪等比例、每場20萬隻且不算菁英／王，
  每場約65,600，Base69滿空條到70約232場；不能外推為所有玩家的實際場數。
- 先前漏掉的關鍵：yA 保留舊存檔遷移，levelRules<2 時 newLevel=min(99,oldLevel×2−1)，
  舊50可轉99。因此只見到99級不能判定修改／bug；不能確認某個玩家是否真的經過轉換或伺服器如何認定。

## 道具與詞條

已整理藥水11種、秘藥10種、祝福10種、料理6種，完整定義在 core 快照。
同名「範圍」可能是area或reach；護甲藥水加固定armor，護甲秘藥加damageReduction；不要靠翻譯名稱識別。
主屬性為str/agi/vit/int/dex/luk；第三類crit/cd/area，armor與特定遠程武器可加pierce；
第四類hp/armor/spd/flee。傳說可加skill傷害，選單取原生可骰技能集合。
自帶詞條須包含原生固定star bonuses（bs），而不只是裝備def.bonuses；很多普通掉落的def.bonuses已被遊戲清空。
