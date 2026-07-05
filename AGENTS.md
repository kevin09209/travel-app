# AGENTS.md — 旅遊小幫手 · AI 協作規範

> 給任何在這個 repo 工作的 AI agent（Claude Code、Codex、Cursor、Copilot…）。
> 本檔是**工具中立**的入口：確保後續每個 AI 都用同一套規矩共同維護專案，
> 並尊重 Fable 5 留下的工作制度。開工前請讀完本檔。

## 0. 最高原則與正本順序

規則衝突時，優先順序由高到低：

1. **使用者當下的明確指示**
2. **Fable 5 的工作制度**：正本入口 [`claude-system/INDEX.md`](claude-system/INDEX.md)，
   專案脈絡入口 [`CLAUDE.md`](CLAUDE.md)。本檔不覆蓋它們，只做工具中立的轉述與補充。
3. **本檔（AGENTS.md）**的專案工程慣例
4. 你自己的預設判斷

這三份檔（`claude-system/`、`CLAUDE.md`、`AGENTS.md`）在本專案視為**治理檔**：
`claude-system/LESSONS.md` 可寫，其餘治理檔要改動前先照鐵律第 6 條備份。

## 1. 開工前必讀（路由）

非 trivial 任務動手前，依情境讀對應檔（細節在引用檔，本檔只放路由）：

| 情境 | 讀這個檔 |
|---|---|
| 專案架構、檔案職責、部署、Supabase | [`CLAUDE.md`](CLAUDE.md) |
| 派 subagent／選模型／自己做還是派工 | [`claude-system/10-model-dispatch.md`](claude-system/10-model-dispatch.md) |
| 該不該升級模型／算不算完成／該不該問使用者／方向對不對 | [`claude-system/20-judgment.md`](claude-system/20-judgment.md) |
| 寫派工 prompt（搜尋／實作／重構／研究／審查） | [`claude-system/30-delegation-templates.md`](claude-system/30-delegation-templates.md) |
| 動手前先看前人踩過的坑 | [`claude-system/LESSONS.md`](claude-system/LESSONS.md) |

**trivial 任務**（預估動 ≤2 檔、工具呼叫 ≤5 輪、且不含不可逆操作）直接做，不必讀引用檔。

## 2. 七條鐵律（不讀引用檔也必須遵守）

1. **指揮官不下場**：預估要完整讀 3 個以上檔案或單檔超過 1000 行、同一問題搜尋超過 2 輪、
   或要抓網頁全文 → 派 subagent，主對話只收結論與 `檔案:行號`。
2. **派工必含三件套**：目標與動機、可機械檢查的驗收條件、回報格式。缺一件不要送出。
3. **完成需要證據**：改檔要 read-back 核對、程式碼要測試或實跑輸出。沒有證據就說
   「已改，未驗證」，不准說「完成」。
4. **驗證不自驗**：驗收派 fresh-context 的 subagent 做，不由產出者自己驗。
5. **同一做法總共最多嘗試兩次**（含第一次）：第二次仍失敗就換方法或升級模型，不准原樣再試。
6. **改治理檔先備份**：修改 `claude-system/`、`CLAUDE.md` 或本檔前，先複製一份到
   `claude-system/backups/`（檔名加日期，如 `AGENTS.2026-07-06.md`；同日第二次加 `.2`）。
7. **踩坑即記錄**：發現工具怪癖、環境限制、使用者糾正，當下寫進
   [`claude-system/LESSONS.md`](claude-system/LESSONS.md)，不等 session 結尾。

## 3. 本專案工程慣例（硬規定）

- **無 build step**：純 HTML / CSS / JS ES modules，直接部署靜態檔。
  **不要引入 npm / bundler / 框架**。開發機沒有 Node.js。
- **本機測試**：`python -m http.server 8792`（或其他埠），用瀏覽器開。
- **交付標準（延伸鐵律第 3 條）**：改完要能具體說出「**在瀏覽器實際測過什麼**」。
  分帳／時間推算等邏輯改動要附**手算驗證**。UI 改動要在**手機寬度（≤390px）**確認不超框。
- **資料模型升級**：`js/store.js` 的 state 是整包存 localStorage／雲端。新增欄位時，
  **一定要在 `normalizeTrip()` 補上預設值**，否則舊資料（或雲端同步回來的資料）會壞。
- **改動快取資產**：動到 `sw.js` 快取行為、或改了 `index.html`／`css`／`js`，
  把 `sw.js` 的 `CACHE_VERSION` +1，否則使用者裝置會拿到舊版。
- **視覺風格**：活潑旅遊風——貼紙感卡片（2px ink 邊框＋實色投影）、珊瑚橘／海藍、
  按壓位移回饋。新 UI 沿用既有 CSS 變數，不要自創色票。
- **文案與註解**：UI 文案繁中、程式註解繁中、技術術語保留英文。溝通用繁體中文。

## 4. Git / 交付流程

- 在指定的 feature branch 開發，commit 訊息清楚描述「做了什麼、為什麼」。
- **不可逆或對外操作（push、開 PR、發布）先確認**，除非使用者已明確授權。
- **PR 合併後**：該 branch 視為已結束。後續新工作要從最新 default branch 重開同名 branch
  （`git checkout -B <branch> origin/main`），不要在已合併的歷史上疊新 commit。

## 5. 部署與環境限制

- **部署**：push 到 `main` → GitHub Actions（`.github/workflows/deploy-pages.yml`）自動部署 Pages。
- **⚠️ Pages 部署間歇性失敗**：`actions/deploy-pages` 偶爾回「Deployment failed, try again later.」
  （GitHub 端暫時性錯誤，非程式問題）。**merge 後要確認部署 run 真的 success，別只看 merge 完成。**
  失敗時用 **`workflow_dispatch` 觸發一次全新 run**，**不要**按「Re-run failed jobs」——重跑會產生
  第二份同名 artifact，`deploy-pages` 看到兩份直接報 `Multiple artifacts named "github-pages"`。
- **雲端 agent 無法操作 Supabase dashboard**：要改 schema／設定時，把 SQL 寫進 `supabase/` 目錄
  並在回覆中附上，請使用者自己貼到 dashboard SQL editor 執行。
- **Google Maps 短網址**（maps.app.goo.gl）瀏覽器無法解析（CORS），這是刻意的，別想用第三方 proxy「修好」。

## 6. 這個 codebase 踩過的坑（完整清單見 LESSONS.md）

動 UI／PWA／CSS 前，先看這幾條高頻坑：

- **CSS 特異性**：全域 `input[type="time"] { width:100% }` 這種「元素＋屬性」選擇器，
  特異性高於純 class。要蓋過它，選擇器至少要 `input.myClass`（元素＋class），純加 class 沒用。
- **PWA 外開連結**：開 Google Maps 等外部連結用 `<a target="_blank">`，**不要用 `window.open`**——
  standalone PWA 裡 `window.open` 會原地把 app 的 webview 換成該網址，回到 app 就停在空白頁。
- **iOS `<input type="time">`**：滾動時每動一格就發 `change`；若當下就寫回＋重繪，會把還開著的
  滾輪彈掉。改成 `blur`（關掉滾輪後）才寫回。
- **模組頂層 TDZ**：`js/store.js` 的 `let state = load()` 在模組載入當下就同步執行，
  會呼叫到 `normalizeTrip` 等。它用到的 `const`／函式**必須定義在 `load()` 之前**，否則 TDZ 崩潰。

## 7. 環境適配（給非 Claude Code 的 agent）

制度檔裡的 Claude Code 專用詞，對應到你手上最接近的工具、保留其**目的**：

- `Explore` / `general-purpose` subagent → 你的探索用／實作用 subagent 或等效機制。
- `Sonnet` / `Haiku` / `Opus` 的調度 → 用你可用的預設強模型、較快模型、升級模型，按風險判斷。
- fresh-context 驗證 → 優先新開 subagent；若無，做 deterministic 驗證＋read-back，
  並在回報明說「未 fresh 驗證」。
- 制度規則與你的 harness 能力衝突時，保留制度目的（省 token、防錯、防漂移），
  用最接近的可執行方法落地，並把摩擦記進 `claude-system/LESSONS.md`。

---

_本檔是工具中立入口；工作制度正本在 `claude-system/INDEX.md`，專案脈絡在 `CLAUDE.md`。_
_發現本檔有錯：先備份再改（鐵律 6），並把教訓記進 `claude-system/LESSONS.md`。_
