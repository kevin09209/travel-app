# BOOTSTRAP — 在 GitHub 專案（含 claude.ai/code 雲端）使用這套制度

> 讀者：要把這套制度掛進某個 GitHub 專案的人或模型。本機 `D:\AI` 不需要本檔，
> 它已由 `~/.claude/CLAUDE.md` 與 `D:\AI\CLAUDE.md` 接好。

## 掛法（三步）

1. **把制度放進專案**：把本 repo（`kevin09209/claude-system`，私有）的內容放到專案根目錄的
   `claude-system/` 資料夾。最簡單的做法是下載後整個資料夾複製進去；會用 git 的可改用
   `git submodule add https://github.com/kevin09209/claude-system claude-system`。
2. **在專案根目錄的 `CLAUDE.md` 貼上下面這段**（沒有 CLAUDE.md 就新建一個）：

   ```markdown
   ## 工作制度
   本專案沿用全域工作制度，正本入口在 [claude-system/INDEX.md](claude-system/INDEX.md)。
   非 trivial 任務（預估動 >2 檔、>5 輪工具呼叫、或含不可逆操作）開工前先讀該檔，
   並遵守其中鐵律。環境差異的讀法：
   - 制度檔裡的 `D:\AI\...` 絕對路徑，在本專案一律改讀 `claude-system/` 下的同名檔。
   - auto-memory 是機器綁定的，雲端 session 沒有；跨 session 教訓改記
     `claude-system/LESSONS.md`（可寫，其餘制度檔在本專案視為唯讀）。
   - 制度檔的正本在使用者本機，本專案內只是副本——發現制度檔本身有錯，
     記進 LESSONS.md 並在回報中提醒使用者回本機修正本，不要在專案內改制度檔。
   ```

3. **驗一次**：開一個新 session 問「開工前你會遵守哪些鐵律？」——答案應該包含
   INDEX.md 裡的七條，且第 6 條要能講出「備份到 backups/、檔名加日期」。
   答不出來就檢查第 2 步的段落有沒有貼對位置。

## 更新流程（方向固定：本機 → GitHub → 各專案）

- 本機改了制度 → 跑 `claude-system\tools\sync-github.ps1`（重新生成 INDEX.md 並推送）。
- 各專案更新副本：submodule 用 `git submodule update --remote`；複製法就重新下載覆蓋
  `claude-system/`（LESSONS.md 例外，見下）。
- **LESSONS 回流**：雲端或他機 session 在專案內新增的 LESSONS 條目不會自動回到正本。
  回到本機工作時，把專案內新增的條目手動搬進 `D:\AI\claude-system\LESSONS.md`，
  再跑一次同步。
