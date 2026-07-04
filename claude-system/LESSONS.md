# LESSONS — 踩坑記錄（新的寫最上面，格式見 40-maintenance.md 第 3 節）

## 2026-07-06（travel-app）GitHub Pages 部署間歇性失敗，重跑失敗 job 會撞 duplicate artifact
- 情境：merge PR 後 deploy-pages.yml 自動部署，已兩次（PR #3、#6）遇到
  `deploy-pages@v4` 回報「Deployment failed, try again later.」（GitHub 端暫時性錯誤，
  上傳 artifact 都成功、程式碼沒問題）。
- 坑：此時若按「Re-run failed jobs」，upload-pages-artifact 會再傳一份同名 artifact，
  deploy-pages 看到兩份直接報錯 `Multiple artifacts named "github-pages"`——重跑必失敗。
- 之後怎麼做：merge 後要確認部署 run 是 success，不能只看 merge 完成；失敗時用
  `workflow_dispatch` 觸發**全新** run（`actions_run_trigger` method=run_workflow），
  不要 rerun 舊 run。

## 2026-07-06（travel-app）CSS class 選擇器輸給全域 input[type=X] 選擇器
- 情境：在 travel-app 專案給 `<input type="time">` 加 `.timePicker` class 想縮小寬度，
  結果手機上格子還是撐滿整排。
- 坑：專案裡有一條全域 `input[type="time"] { width: 100%; ... }`（給一般表單用）。
  `input[type="time"]`（元素+屬性）的特異性比純 class `.timePicker` 高，class 規則永遠輸，
  跟宣告順序無關。
- 之後怎麼做：要蓋過 `input[type=X]` 這類全域規則，選擇器至少要同時帶元素＋class
  （如 `input.timePicker`）讓特異性打平，再靠宣告順序（寫在後面）取勝；純加 class 不夠。

## 2026-07-05 含中文的 .ps1 必須存成 UTF-8 with BOM
- 情境：寫 tools/sync-github.ps1（含中文註解與字串）後用 powershell -File 執行。
- 坑：Windows PowerShell 5.1 讀無 BOM 的 UTF-8 腳本會當成 ANSI，中文變亂碼並破壞語法
  （報 Unexpected token，行號指向無辜的右大括號）。
- 之後怎麼做：.ps1 一律存 UTF-8 with BOM；用工具寫完後轉一次
  `[System.IO.File]::WriteAllText($f, $t, (New-Object System.Text.UTF8Encoding($true)))`。

## 2026-07-05 gh CLI 已安裝但不在 PATH
- 情境：建立 claude-system 的 GitHub 鏡像，要用 gh 建 repo。
- 坑：`gh` 直接呼叫失敗；實際位於 `C:\Program Files\GitHub CLI\gh.exe`（v2.96，已登入 kevin09209）。
- 之後怎麼做：用完整路徑 `& "C:\Program Files\GitHub CLI\gh.exe"` 呼叫，git 同理（見下一條）。

## 2026-07-05 Git 已安裝但不在 PowerShell PATH
- 情境：Codex 要用 `git status` / `git diff` 收尾確認制度檔修改。
- 坑：直接呼叫 `git` 會失敗；實際 Git 位於 `C:\Program Files\Git\cmd\git.exe` 與 `C:\Program Files\Git\bin\git.exe`。
- 之後怎麼做：需要 Git 時優先用完整路徑；若使用者同意，再把 `C:\Program Files\Git\cmd` 加到使用者 PATH。

## 2026-07-04 Monaco 編輯器（Supabase SQL editor 等）不能用鍵盤 type 多行文字
- 情境：用 claude-in-chrome 把多行 SQL 打進 Supabase dashboard 的 SQL editor。
- 坑：Monaco 的 auto-closing pairs 會在多行輸入時自己插入成對括號/引號，內容被打亂
  （單行測試看起來正常，因為 type-over 機制掩蓋了問題，多行必炸）。
- 之後怎麼做：用 javascript_tool 執行 `monaco.editor.getModels()[0].setValue(text)` 直接設值，
  再點編輯器按 ctrl+Return 執行。

## 2026-07-03 這台機器的 Python 不在 PATH
- 情境：建 meme-face-swap 專案要跑 Python。
- 坑：`python`/`py` 都不可用（只有 Microsoft Store 假捷徑，exit code 49）。經 winget 裝了
  Python.Python.3.12，裝在 `%LOCALAPPDATA%\Programs\Python\Python312`，仍不在 PATH。
- 之後怎麼做：用完整路徑呼叫，或建 venv 後用 `venv\Scripts\python.exe`。

## 2026-07-03 PowerShell Start-Process 會拆散帶空格的 -ArgumentList 字串
- 情境：想用 `Start-Process python -ArgumentList "-c", "import app; ..."` 背景啟動伺服器。
- 坑：含空格的參數字串被拆散，Python 只收到 `import`，SyntaxError。
- 之後怎麼做：多語句的啟動指令寫成臨時 .py 腳本檔再用 Start-Process 執行，不用 `-c` 內嵌。
