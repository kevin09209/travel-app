# check-system.ps1 — 制度檔決定性檢查：行數上限 + 斷鏈 + INDEX 新鮮度
# 用法：powershell -File D:\AI\claude-system\tools\check-system.ps1
# 相容 Windows PowerShell 5.1。結果全過 exit 0，任一失敗 exit 1。

$ErrorActionPreference = "Stop"
$sysDir  = Split-Path -Parent $PSScriptRoot   # D:\AI\claude-system
$rootDir = Split-Path -Parent $sysDir         # D:\AI
$fail = 0

function Fail($msg) { Write-Host "[FAIL] $msg" -ForegroundColor Red; $script:fail = 1 }
function Ok($msg)   { Write-Host "[ ok ] $msg" }

# --- 1. 行數上限 ---
# INDEX.md 與入口檔 <=150；LESSONS.md <=300；其餘守則檔 <=120
$targets = @()
$targets += Get-ChildItem -Path $sysDir -Filter *.md | Where-Object { $_.DirectoryName -eq $sysDir }
$targets += Get-Item (Join-Path $rootDir "CLAUDE.md")
$targets += Get-Item (Join-Path $rootDir "AGENTS.md")

foreach ($f in $targets) {
    $lines = @(Get-Content -Path $f.FullName -Encoding UTF8).Count
    $limit = 120
    if ($f.Name -in @("INDEX.md", "CLAUDE.md", "AGENTS.md")) { $limit = 150 }
    if ($f.Name -eq "LESSONS.md") { $limit = 300 }
    if ($lines -gt $limit) { Fail "$($f.Name) 有 $lines 行，超過上限 $limit（先精簡再加內容）" }
    else { Ok "$($f.Name) 行數 $lines / $limit" }
}

# --- 2. 斷鏈檢查：markdown 相對連結的目標檔必須存在 ---
foreach ($f in $targets) {
    $text = Get-Content -Path $f.FullName -Raw -Encoding UTF8
    # 排除 fenced code block（``` ... ```）裡的示範連結，它們不是本地引用
    $text = [regex]::Replace($text, '(?s)```.*?```', '')
    $links = [regex]::Matches($text, '\[[^\]]*\]\(([^)#\s]+)[^)]*\)')
    foreach ($m in $links) {
        $target = $m.Groups[1].Value
        if ($target -match '^https?://') { continue }
        $resolved = Join-Path $f.DirectoryName $target
        if (-not (Test-Path $resolved)) { Fail "$($f.Name) 引用不存在的檔案：$target" }
    }
}
Ok "斷鏈檢查完成"

# --- 3. INDEX.md 新鮮度：不得比正本 CLAUDE.md 舊 ---
$index = Join-Path $sysDir "INDEX.md"
$canon = Join-Path $rootDir "CLAUDE.md"
if (Test-Path $index) {
    if ((Get-Item $index).LastWriteTime -lt (Get-Item $canon).LastWriteTime) {
        Fail "INDEX.md 比正本 CLAUDE.md 舊——跑 tools\sync-github.ps1 重新生成"
    } else { Ok "INDEX.md 不比正本舊" }
} else { Fail "INDEX.md 不存在——跑 tools\sync-github.ps1 生成" }

if ($fail -eq 0) { Write-Host "`n全部檢查通過" } else { Write-Host "`n有檢查未通過，見上方 [FAIL]" -ForegroundColor Red }
exit $fail
