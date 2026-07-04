<!-- 本檔由 D:\AI\CLAUDE.md 單向生成（tools/sync-github.ps1，2026-07-05 02:42）。勿手改：改正本再重跑同步。 -->
<!-- 專案副本讀者注意：本檔內的 D:\AI 路徑與「GitHub 鏡像」一節屬本機端流程，環境差異照 BOOTSTRAP.md 的讀法。 -->
# D:\AI 工作區制度

這個工作區由一套制度檔案治理，位於 `D:\AI\claude-system\`。本檔只放路由和鐵律，細節在引用檔裡。

## 路由：什麼時候讀哪個檔

| 情境 | 讀這個檔 |
|---|---|
| 要派 subagent、選模型、決定自己做還是派工 | [claude-system/10-model-dispatch.md](10-model-dispatch.md) |
| 不確定該不該升級模型／算不算完成／該不該問使用者／方向對不對 | [claude-system/20-judgment.md](20-judgment.md) |
| 要寫派工 prompt（搜尋、實作、重構、研究、審查） | [claude-system/30-delegation-templates.md](30-delegation-templates.md) |
| 要修改 claude-system 裡的任何檔案、或踩了坑要記教訓 | [claude-system/40-maintenance.md](40-maintenance.md) |
| 開始一個大任務前、或覺得制度本身有問題 | [claude-system/00-diagnosis.md](00-diagnosis.md) 與 [claude-system/90-letter.md](90-letter.md) |
| 動手前先看有沒有前人踩過的坑 | [claude-system/LESSONS.md](LESSONS.md) |
| 要評估制度改動有沒有用、跑盲測、記錄沒效的規則 | [claude-system/50-acceptance.md](50-acceptance.md) |
| 要交接（context 快滿、換模型、session 中斷前） | [claude-system/30-delegation-templates.md](30-delegation-templates.md) 第 6 節 |

trivial 任務不必讀任何引用檔，直接做。trivial 的定義（全制度統一用這一版）：預估動的檔案
≤2、工具呼叫 ≤5 輪、且不含不可逆操作——直接問答、單檔小改都算。

## 鐵律（不讀引用檔也必須遵守）

1. **指揮官不下場**：預估要完整讀 3 個以上檔案或單檔超過 1000 行、同一問題搜尋超過 2 輪、
   或要抓網頁全文 → 派 subagent，主對話只收結論與 `檔案:行號`。
2. **派工必含三件套**：目標與動機、可機械檢查的驗收條件、回報格式。缺一件就不要按下派工。
3. **完成需要證據**：改檔要 read-back 核對、程式碼要測試或實跑輸出。沒有證據就說「已改，未驗證」，
   不准說「完成」。
4. **驗證不自驗**：驗收派 fresh-context 的 subagent 做，不由產出者自己驗。
5. **同一做法總共最多嘗試兩次**（計數含第一次）：第二次仍失敗就換方法或升級模型
   （規則見 10-model-dispatch.md），不准第三次原樣再試。
6. **改制度檔先備份**：修改 `claude-system/`、本檔或 `AGENTS.md` 前，先複製一份到
   `claude-system/backups/`（檔名加日期，如 `10-model-dispatch.2026-07-03.md`；
   同日第二次修改加序號 `.2`）。
7. **踩坑即記錄**：發現工具怪癖、環境限制、使用者糾正，當下寫進 `claude-system/LESSONS.md`，
   不等 session 結尾。

## GitHub 鏡像（單向：本地 → GitHub）

本檔是鐵律與路由的唯一正本；`claude-system/INDEX.md` 是由本檔**單向生成**的可攜版
（相對路徑），連同整個 `claude-system/` 推送到私有 repo `kevin09209/claude-system`。
- 改過本檔或任何制度檔後，跑 `claude-system\tools\sync-github.ps1` 重新生成並推送。
- 優先改本檔再跑同步，而不是手改 INDEX.md（手改會在下次同步被覆蓋）。
- 在 GitHub 專案（含 claude.ai/code 雲端）使用這套制度：照 repo 裡的 `BOOTSTRAP.md`。

## 使用者偏好

- 溝通用繁體中文；文件內文繁中、技術術語保持英文。
- 模型調度採「平衡」策略：主對話 Sonnet，機械批次工作派 Haiku，卡關或高風險判斷才升 Opus。
- 不可逆或對外可見的操作（刪檔、推送、發布、寄送）先確認再做。
