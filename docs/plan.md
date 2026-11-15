# 巫師魔杖遊戲 — 第一階段（狼人試玩版）製作計畫
Spec: https://claude.ai/artifact/J55NYSwPbpwH8k3bh6fpBu
目標：驗證魔杖追蹤手感（攻擊／回魔／反彈），1–2 人打一隻狼人。
架構：靜態網頁。js/logic.js 純邏輯（手勢判定、戰鬥規則，可用 node 測試）；js/main.js 鏡頭、MediaPipe 姿勢追蹤、Three.js 3D 畫面、HUD、音效。
任務：
1. logic.js + test/logic.test.js（TDD）：WandTracker、Fight。
2. main.js + index.html：場景、狼人、魔杖、特效、HUD、鏡頭追蹤、滑鼠備援。
3. 檢查：node --test、node --check；打包 zip。
審查重點：追蹤遺失不當機；舉手動作不誤觸攻擊；魔力不足不能施法；兩人站同一側；鏡頭被拒絕時有備援。
後續階段：PK 模式 → 故事五關 → 打磨。
