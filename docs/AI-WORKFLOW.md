# 旅遊小幫手 — AI 開發流程 Playbook

> 給任何要在這個 repo 做功能的 AI 模型。照這份走，就能做到「規劃 → 實作 → **在瀏覽器真的測過** → PR → 盯部署」的完整品質。
> 規範正本在 [`AGENTS.md`](../AGENTS.md) 與 [`claude-system/INDEX.md`](../claude-system/INDEX.md)；本檔是**可操作的 how-to**，兩者搭配看。

---

## 如何讓其他 AI 用這份流程（給導入的人看）

想讓別的 AI（Cursor、Copilot、Codex/OpenAI、Gemini、其他 Claude session…）做到同等品質，方法看它是哪一種：

- **會自動讀 repo 規範檔的 agent**（Claude Code 讀 `CLAUDE.md`、多數 agentsmd 相容工具如 Cursor / Codex / Zed 讀根目錄 `AGENTS.md`）：
  → 只要 `AGENTS.md`／`CLAUDE.md` 裡有指到本檔的連結（已加在 `AGENTS.md` 的路由表），它們讀入口檔時就會被導來這份流程。**這是最省事、最可靠的方式**——把這份文件留在 repo 裡就會被沿用。
- **Cursor**：在 `.cursorrules` 或 Project Rules 裡加一行「開工前先讀 `docs/AI-WORKFLOW.md` 並遵守」。
- **貼上式的網頁 AI**（ChatGPT、Claude.ai、Gemini 的 Project/自訂指令）：把**整份 `docs/AI-WORKFLOW.md` 貼進 system prompt／專案指令**。本檔是自足的，貼過去即可用。
- **直接交檔**：這份文件可獨立閱讀，直接把檔案給對方模型也行。
- **保持更新**：踩到新坑先記進 `claude-system/LESSONS.md`，重大的再回頭補進本檔第 6 節（地雷清單）。文件跟著 repo 走，下一個 AI 就自動接手到最新版。

---

## 0. 心法（做不到就別交付）

1. **證據 > 宣稱**：說「完成」前一定有證據——瀏覽器實跑、資料層斷言、截圖。沒證據就寫「已改，未驗證」。
2. **改動範圍收斂**：`git diff --stat` 裡不該有你解釋不了的檔案；不夾帶無關重排。
3. **真正的決策才問使用者**（品味題、需求分歧、不可逆操作）；有慣例的技術選擇自己決定並說明。
4. **踩坑當下記進 `claude-system/LESSONS.md`**，不等 session 結束。
5. **手機優先**：所有 UI 改動都在 **390px（iPhone 邏輯寬）** 下確認不換行、不超框、無水平捲動。

---

## 1. 開工前：定位 + 同步 + 讀規範

```bash
# 1. 看目前分支與 main 差多少
git fetch origin main
git log --oneline origin/main -3
git log --oneline -3
git status --short

# 2. 若上一個 PR 已 merge → 從最新 main 重開分支（不要疊在已合併的歷史上）
git checkout -B claude/<你的分支> origin/main
```

- **一定要看使用者附的截圖／圖片**（`Read` 圖片路徑）。很多需求的關鍵在圖裡（哪裡換行、哪個縫隙、哪個型號）。
- 非 trivial 任務（>2 檔 / >5 輪工具 / 含不可逆操作）開工前讀 `CLAUDE.md`、`claude-system/INDEX.md`、`claude-system/LESSONS.md`。
- **查前人有沒有做過／撤回過**：`git log --oneline origin/main -15`。這個 repo 出現過「被撤回的功能」——照做前先看它為什麼被撤（例：有人做同功能卻改壞了 Leaflet 的 integrity hash 導致地圖掛掉）。

---

## 2. 規劃：立錨 + 盤副作用 + 需要時先給示意圖

**開工回覆的開頭先寫 3–5 行錨點**（compaction 後靠它重建方向）：
- 目標與動機
- 資料模型影響（這個 app 幾乎所有資料都在 `trip` 物件裡、整包雲端同步）
- 會動哪些檔
- **副作用盤點**：改行程要想到 → 抵達時間推算、旅伴篩選、地圖、拖曳排序、匯出 PDF、雲端同步是否受影響
- 不做什麼

**遇到品味題／多種合理解讀 → 不要猜**：
- 用 `AskUserQuestion` 給 2–4 個選項（推薦的放第一個、標「(推薦)」）。
- 值得的話**做一份互動示意圖 Artifact**（沿用 app 視覺）讓使用者點著選——這個 session 的「分組卡三選一」就是這樣定案的。先讀 `artifact-design` skill 再做。

---

## 3. 讀碼與實作：本專案硬慣例

| 慣例 | 說明 |
|---|---|
| **無 build step** | 純 HTML/CSS/JS ES modules。**不要引入 npm/bundler/框架**。 |
| **資料層在 `js/store.js`** | 新增欄位**一定要在 `normalizeTrip()` 補預設值**，否則舊資料／雲端同步回來的資料會壞。`createTrip()` 也要初始化。 |
| **整包同步** | 資料掛在 `trip` 物件上就會自動隨雲端同步，**不用改 `sync.js`**。 |
| **改到資產就 `CACHE_VERSION` +1**（`sw.js`） | 動了 `index.html`/`css`/`js` 沒 +1，使用者裝置會拿到舊版。 |
| **沿用既有 helper** | 例：地點搜尋用 `runPlaceSearch()`、導航用 `openNav()`/`openExternal()`（**不要用 `window.open`**，PWA 會被原地換頁）、類別常數 `STOP_CATS`。 |
| **整合而非外掛** | 功能寫進 `js/app.js`（能拿到 `currentDay` 等 module state），不要另外掛一支 `<script>`。 |
| **視覺沿用 CSS 變數** | 貼紙感卡片（2px ink 邊框＋實色投影）、珊瑚橘/海藍，別自創色票。 |
| **文案/註解繁中、術語英文** | 溝通也用繁體中文。 |

**改共用函式前先 `Grep` 所有呼叫點**，順手清掉改完後變成 dead code 的東西。

---

## 4. 驗證（本專案能不能做到同等品質的關鍵）

> ⚠️ **這個沙盒的對外連線政策會擋掉 CDN**（`esm.sh`、`unpkg.com` 回 403）。
> 直接開瀏覽器會因為 Leaflet / Supabase 載不出來而卡住。**解法是攔截並 stub 掉這些 CDN**，就能在本機把整個前端跑起來實測。不知道這招的模型會誤以為「沒辦法測」而放棄——這是關鍵。

### 4.1 起本機伺服器
```bash
python3 -m http.server 8809     # 專案根目錄；換個沒被占用的埠
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8809/index.html   # 期望 200
```

### 4.2 Playwright 測試範本（stub 掉被擋的 CDN）
- 執行：`NODE_PATH=/opt/node22/lib/node_modules node test.js`
- 瀏覽器：`executablePath: "/opt/pw-browsers/chromium"`（**別跑 `playwright install`**）

```js
const { chromium } = require("playwright");

// 假 Leaflet：只要 app 初始化不炸、地圖容器能 render
const FAKE_LEAFLET = `window.L={map:()=>m(),tileLayer:()=>({addTo:()=>({})}),layerGroup:()=>lg(),divIcon:()=>({}),marker:()=>({bindPopup(){return this;}}),polyline:()=>({}),latLngBounds:()=>({})};function m(){return{setView(){return this;},invalidateSize(){},fitBounds(){},getZoom(){return 12;}};}function lg(){return{addTo(){return this;},clearLayers(){},addLayer(){}};}`;
// 假 Supabase：離線模式，不真的連雲
const FAKE_SUPABASE = `export function createClient(){return{auth:{async getSession(){return{data:{session:null}};},async signInAnonymously(){return{error:null};},async getUser(){return{data:{user:{id:"u"}}};}},from(){return{insert(){return{select(){return{async single(){return{data:null,error:null};}};}};},update(){return{eq:async()=>({error:null})};},select(){return{eq(){return{async maybeSingle(){return{data:null,error:null};}};}};}};},rpc(){return Promise.resolve({data:null,error:null});},channel(){return{on(){return this;},subscribe(cb){if(cb)cb("SUBSCRIBED");return this;}};},removeChannel(){},storage:{from(){return{async upload(){return{error:null};},getPublicUrl(){return{data:{publicUrl:""}};},async remove(){}};}}};}`;
// 假 Nominatim 搜尋（要測搜尋/最愛時用）
const FAKE_NOMINATIM = JSON.stringify([{ name:"白色戀人公園", display_name:"白色戀人公園, 札幌市", lat:"43.0895", lon:"141.2860" }]);

// 關鍵：把 index.html 的 SRI integrity/crossorigin 拿掉，stub 的 script 才載得進來
async function stripIntegrity(route){
  const res = await route.fetch();
  const body = (await res.text()).replace(/\s+integrity="[^"]*"/g,"").replace(/\s+crossorigin(="[^"]*")?/g,"");
  await route.fulfill({ response: res, body, headers: { ...res.headers(), "content-type":"text/html; charset=utf-8" } });
}

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); // iPhone 尺寸
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message)); // 抓 JS 例外

  const HOST = "http://localhost:8809/index.html";
  await page.route(HOST, stripIntegrity);
  await page.route("https://unpkg.com/leaflet@1.9.4/dist/leaflet.js", r => r.fulfill({ contentType:"application/javascript", body: FAKE_LEAFLET }));
  await page.route("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css", r => r.fulfill({ contentType:"text/css", body:"" }));
  await page.route("https://esm.sh/@supabase/supabase-js@2", r => r.fulfill({ contentType:"application/javascript", body: FAKE_SUPABASE }));
  await page.route("https://fonts.googleapis.com/**", r => r.abort());
  await page.route("https://fonts.gstatic.com/**", r => r.abort());
  await page.route("https://nominatim.openstreetmap.org/**", r => r.fulfill({ contentType:"application/json", body: FAKE_NOMINATIM }));
  await page.context().route("https://www.google.com/**", r => r.fulfill({ contentType:"text/html", body:"maps" })); // 攔導航 popup

  await page.goto(HOST);
  await page.waitForTimeout(800);

  // 建旅程、操作 UI …（用 page.click/fill）
  // 直接讀資料層做斷言：import 同一個 store module 實例
  const data = await page.evaluate(async () => {
    const s = await import("/js/store.js");
    return s.getActiveTrip();
  });
  console.log("assert:", JSON.stringify(data).slice(0, 200));

  // 版面檢查
  const overflow = await page.evaluate(() => ({
    hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  }));
  console.log("hScroll(應 false):", overflow.hScroll);

  await page.screenshot({ path: "/tmp/shot.png" });   // 之後用 Read 這張圖「親眼」看
  await browser.close();
})();
```

### 4.3 每次驗證都要看的東西
- **`PAGEERROR`**：有就是初始化壞了（例如改壞 SRI hash → Leaflet 載不出來）。
- **資料層斷言**：`await import("/js/store.js")` 讀 `getActiveTrip()`，確認 CRUD 真的寫對。
- **DOM 斷言**：`page.locator(...)` 數量、文字、class（展開/收合、篩選結果…）。
- **截圖**：`page.screenshot(...)` 存檔後**用 `Read` 讀圖親眼確認**視覺；別只看數字。
- **版面**：`hScroll` 必須 false；卡片 `getBoundingClientRect().right` 不超過視窗寬。
  - 小心 flex `align-items:center` 造成「子元素 top 不同」的**假換行**——用截圖確認別誤判。
- **邏輯改動附手算**：抵達時間、分帳結算等，在回報裡附上手算驗證。
- **便宜的 parse sanity**：`node -e "new Function(require('fs').readFileSync('js/app.js','utf8').replace(/import .*/g,'').replace(/export /g,''))"`

### 4.4 誠實標註測不到的部分
沙盒測不了「真的 Supabase 同步」「真實 iOS 的原生控制項顯示」——這些**明講「建議實機確認」**，不要假裝驗過。

---

## 5. 交付：diff → commit → push → PR → 盯部署

```bash
# 1. 審 diff，範圍要收斂
git --no-pager diff --stat
git --no-pager diff <關鍵檔>

# 2. CACHE_VERSION 記得 +1（有動資產的話）

# 3. commit（繁中訊息：做什麼、為什麼、含 bug 修正說明）＋ 必要 trailer
git commit -m "$(cat <<'EOF'
<標題：一句話>

<內文：條列做了什麼、為什麼、順手修的 bug>

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: <你的 session 連結>
EOF
)"

# 4. push
git push -u origin claude/<你的分支>

# 4b. 若分支的前一個 PR 已 merge：先 rebase 到最新 main 再 force-with-lease
git rebase origin/main
git push --force-with-lease -u origin claude/<你的分支>
```

- **開 PR**（用 GitHub MCP `create_pull_request`）：Body 要有 **## Summary**、**## Test plan（勾你實測過的）**、必要時 **## 設計選擇/討論點**。**除非使用者明講，不要主動開 PR**——這個 repo 是使用者要你開才開。
- **PR merge 後 → 盯 Pages 部署**（見下方踩坑）。
- **踩到新坑 → 補一條進 `claude-system/LESSONS.md`**。

---

## 6. 這個 repo 的地雷（踩過的，務必避開）

| 地雷 | 正解 |
|---|---|
| **Leaflet 的 SRI `integrity` hash** | **絕對不要動 `index.html` 裡那行**。改壞一個字元 → 地圖 script 過不了完整性檢查、整個 app 掛掉（曾因此被整包撤回）。 |
| **GitHub Pages 部署間歇性失敗** | `deploy-pages` 偶爾回「Deployment failed, try again later」（GitHub 端暫時性錯誤）。**用 `workflow_dispatch` 觸發全新 run**（MCP `actions_run_trigger` method=`run_workflow`），**不要按 rerun failed jobs**——重跑會產生第二份同名 artifact 撞 `Multiple artifacts named "github-pages"`。merge 後要確認部署 run 真的 success，別只看 merge 完成。 |
| **CSS 特異性** | 全域 `input[type="time"]{width:100%}` 這種「元素+屬性」選擇器，特異性高於純 class。要蓋過要用 `input.myClass`（元素+class），純加 class 沒用。 |
| **PWA 外開連結** | 用 `<a target="_blank">`（`openExternal`），**別用 `window.open`**——standalone PWA 會原地把 app 換成該網址，回來停在空白頁。 |
| **iOS `<input type="time">`** | (1) 顯示格式跟著裝置語言/地區設定跑、無法控制、各機不一 → 「時長」類（停留/車程）改用自訂 `<select>`「X 小時 Y 分」。(2) 滾動時每格連發 `change`，別在 change 當下就 `updateStop`＋重繪，會把滾輪彈掉。 |
| **模組頂層 TDZ** | `js/store.js` 的 `let state = load()` 在載入當下就同步跑到 `normalizeTrip`。它用到的 `const`／函式**必須定義在 `load()` 之前**，否則 TDZ 崩潰、所有既有旅程一開就白畫面。 |
| **雲端 agent 不能碰 Supabase dashboard** | 要改 schema 就把 SQL 寫進 `supabase/` 並請使用者自己貼上執行。 |

---

## 7. 一頁 checklist（交付前逐條打勾）

- [ ] 分支從最新 `origin/main` 開；前一個 PR 若已 merge 有 rebase。
- [ ] 看過使用者的截圖；非 trivial 有寫錨點、盤過副作用。
- [ ] 新資料欄位有進 `normalizeTrip()` + `createTrip()`。
- [ ] 沿用既有 helper／視覺；沒外掛 script；沒動 Leaflet hash。
- [ ] **本機瀏覽器實測過**（stub CDN）：無 `PAGEERROR`、資料層斷言過、截圖親眼看過、390px 無水平捲動/不換行。
- [ ] 邏輯改動附手算；測不到的部分誠實標「建議實機」。
- [ ] `CACHE_VERSION` +1；`git diff --stat` 範圍收斂。
- [ ] commit 訊息清楚 + trailer；push 成功。
- [ ] （使用者要才）開 PR，含 Summary + Test plan。
- [ ] merge 後盯 Pages 部署 success（失敗用 workflow_dispatch 重觸發）。
- [ ] 新踩的坑寫進 `claude-system/LESSONS.md`。

---

_本檔是操作指南（`docs/`，非治理檔）；規範正本在 `AGENTS.md` 與 `claude-system/`。_
_踩到新坑：先記 `claude-system/LESSONS.md`，重大的再補進本檔第 6 節。_
