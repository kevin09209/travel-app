## 工作制度

本專案沿用全域工作制度，正文入口在 [claude-system/INDEX.md](claude-system/INDEX.md)。

非 trivial 任務（預估動 > 2 檔、> 5 輪工具呼叫、或含不可逆操作）開工前先讀該檔，並遵守其中鐵律。環境差異的說法：

- 制度檔裡的 `D:\AI\...` 絕對路徑，在本專案一律改讀 `claude-system/` 下的同名檔。
- auto-memory 是機器綁定的；雲端 session 沒有；跨 session 教訓改記 `claude-system/LESSONS.md`。
- `claude-system/LESSONS.md` 可寫，其餘制度檔在本專案視為唯讀。
- 制度檔的正式版本在本機。本專案內只是一個副本。
- 若發現制度檔本身有錯，記進 `claude-system/LESSONS.md`，並在回報中提醒使用者回本機修正，不要直接在專案內改制度檔。

# 旅遊小幫手 — 專案脈絡（給任何 Claude session）

和旅伴即時共編的旅遊 PWA。線上網址 https://kevin09209.github.io/travel-app/ 。
使用者慣用繁體中文；UI 文案繁中、程式註解繁中、技術術語保留英文。

## 架構（重要：無 build step）

純 HTML/CSS/JS ES modules，直接部署靜態檔，**不要引入 npm/bundler**。
開發機沒有 Node.js；本機測試用 `python -m http.server 8792`。

| 檔案 | 職責 |
|---|---|
| `js/store.js` | 資料層：state、CRUD、localStorage、pub/sub、雲端同步掛鉤 |
| `js/sync.js` | Supabase：匿名登入、分享/邀請碼加入、防抖推送、Realtime 訂閱、Storage 照片上傳 |
| `js/settle.js` | 分帳結算純函式（換匯、淨額、最少轉帳、分類統計） |
| `js/map.js` | Leaflet 地圖（OSM tiles、類別色標記、路線） |
| `js/app.js` | 全部 UI 渲染與事件；常數（類別、記事卡型別）在檔案頂部 |
| `js/config.js` | Supabase URL/publishable key（設計上可公開，勿改成 secret key） |
| `sw.js` | Service worker：自家資源 network-first、CDN cache-first、API 不快取 |

## Supabase（專案 eezgvybswzsjgnivgixn）

- schema 見 `supabase/schema.sql`：`trips` 表（整份旅程一筆 JSONB、last-write-wins）、
  RLS 只允許 member_uids 成員讀寫、`join_trip(code)` SECURITY DEFINER RPC、Realtime publication。
- 匿名登入已啟用（使用者與旅伴都無帳號）。Storage bucket `note-images`（公開讀、authenticated 寫、5MB）。
- **雲端 agent 無法操作 Supabase dashboard**：要改 schema/設定時，把 SQL 寫進
  `supabase/` 目錄並在回覆中附上，請使用者貼到 dashboard SQL editor 執行。

## 部署

push 到 `main` → GitHub Actions（`.github/workflows/deploy-pages.yml`）自動部署 Pages。
Pages build_type 是 workflow（不是 legacy Jekyll，legacy 會卡住）。

## 慣例與注意事項

- 視覺是「活潑旅遊風」：貼紙感卡片（2px ink 邊框＋實色投影）、珊瑚橘/海藍、按壓位移回饋，新 UI 沿用既有 CSS 變數。
- 改動 `sw.js` 快取行為或重要資產時，把 `CACHE_VERSION` +1。
- 已知限制：Google Maps 短網址（maps.app.goo.gl）瀏覽器無法解析（CORS），UI 會提示改貼完整網址——這是刻意的，不要試圖用第三方 proxy「修好」它。
- 交付標準：改完要能說出「在瀏覽器實際測過什麼」；分帳邏輯改動要附手算驗證。
