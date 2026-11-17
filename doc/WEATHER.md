# 戰鬥天氣顯示

「隱藏戰鬥天氣」預設關閉，設定存於助手 localStorage。開啟後停用戶外 atmosphere 的更新、雨滴、閃電、天氣霧色、天氣變暗與後續環境音排程；既有天氣覆蓋圖層清空並隱藏，環境色恢復中性。暫停的純視覺天氣時間在關閉選項後繼續，並立即以原生 update(0, width, height) 恢復外觀。已排程的原生延遲音效不額外攔截。

只包裝完整方法指紋符合已查核版本的戶外 atmosphere.update，未知方法保持原樣。室內 gloom（洞穴、水道、海底等）、戰鬥數值、掉落物與拾取掃描均不修改。

查核來源（2026-11-17）：

- https://ro.hans-webgametw.com/build/main-BNOcv2PN.hz70eb4bc4.js

原生 Sb.update 負責天氣轉換、環境 uniforms、drawRain、閃電圖層及 sounds；獨立 Yc 處理室內光影。原生室內關閉效果使用 envTint=(1,1,1)、fogAmount=0、playerLight=0、clearColor=727603，助手沿用這組中性設定。

測試 tests/weather.test.cjs 執行擷取的原生更新方法，驗證停用時不執行雨滴／聲音／動畫步進，關閉後立即恢復、下一戰沿用、未知方法與室內效果不動。tests/pickups.test.cjs 驗證選項單一實例及保存。
