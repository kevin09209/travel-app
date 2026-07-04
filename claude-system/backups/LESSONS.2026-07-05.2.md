# LESSONS — 踩坑記錄（新的寫最上面，格式見 40-maintenance.md 第 3 節）

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

## 2026-07-03 範例條目（格式示範，精簡時可刪）
- 情境：建立本制度時查證 effort 參數。
- 坑：憑印象以為 "think hard" 等關鍵字仍有效，實際上目前只有 `ultrathink` 被辨識。
- 之後怎麼做：涉及 Claude Code 參數規格的陳述，一律先派 claude-code-guide 查官方文件再寫。
