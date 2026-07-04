# 全域指標

這台機器的工作制度檔在 `D:\AI\claude-system\`，路由入口是 `D:\AI\CLAUDE.md`。

- 在 D:\AI 底下工作時，專案 CLAUDE.md 會自動載入，不必額外動作。
- 在**其他目錄**工作時：任務若非 trivial（會派 subagent、改多個檔案、或跑超過幾輪工具呼叫），
  先讀 `D:\AI\CLAUDE.md` 的鐵律再開工。trivial 任務直接做。
- 注意：auto-memory 是專案綁定的，D:\AI 的記憶在其他目錄讀不到；跨專案通用的教訓記在
  `D:\AI\claude-system\LESSONS.md`。
