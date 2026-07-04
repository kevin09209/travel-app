# sync-github.ps1 — 由正本 D:\AI\CLAUDE.md 單向生成 INDEX.md，並推送整個 claude-system 到 GitHub
# 用法：powershell -File D:\AI\claude-system\tools\sync-github.ps1
# 方向固定：本地 → GitHub。永遠不要反向把 GitHub 的改動拉回來蓋掉本地正本。

$ErrorActionPreference = "Stop"
$sysDir  = Split-Path -Parent $PSScriptRoot   # D:\AI\claude-system
$rootDir = Split-Path -Parent $sysDir         # D:\AI
$git = "C:\Program Files\Git\cmd\git.exe"     # 本機 git 不在 PATH（見 LESSONS.md）

# --- 1. 生成 INDEX.md（相對路徑版正本） ---
# 只改寫 markdown 連結目標 ](claude-system/...) -> ](...)；
# 反引號 code span 裡的路徑保持原樣（在專案副本的目錄結構下它們仍然正確）。
$canon = Get-Content -Path (Join-Path $rootDir "CLAUDE.md") -Raw -Encoding UTF8
$body  = $canon -replace '\]\(claude-system/', ']('
$stamp = Get-Date -Format "yyyy-MM-dd HH:mm"
$header = "<!-- 本檔由 D:\AI\CLAUDE.md 單向生成（tools/sync-github.ps1，$stamp）。勿手改：改正本再重跑同步。 -->`r`n" +
          "<!-- 專案副本讀者注意：本檔內的 D:\AI 路徑與「GitHub 鏡像」一節屬本機端流程，環境差異照 BOOTSTRAP.md 的讀法。 -->`r`n"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $sysDir "INDEX.md"), ($header + $body), $utf8NoBom)
Write-Host "INDEX.md 已重新生成（$stamp）"

# --- 2. commit + push ---
Set-Location $sysDir
& $git add -A
$status = & $git status --porcelain
if ($status) {
    & $git commit -m "sync: $stamp"
    & $git push origin main
    Write-Host "已推送到 GitHub（單向鏡像）"
} else {
    Write-Host "沒有變更，不需推送"
}
