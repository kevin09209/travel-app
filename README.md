# 🧳 旅遊小幫手

和旅伴即時共編的旅遊 PWA：行程規劃＋地圖、多幣別分帳、旅遊資訊記事本。

## 功能

- **行程規劃**：逐日排景點、拖拉排序、類別標記（景點/餐廳/逛街…）、預計停留時間與抵達時間自動推算、地圖路線顯示（Leaflet + OpenStreetMap）、搜尋地點或直接貼 Google Maps 網址
- **分帳**：多幣別（即時匯率）、支出分類統計、最少轉帳結算、已還款標記
- **記事本**：飯店/機票/票券/交通結構化卡片、照片上傳
- **即時共編**：邀請碼加入，改動即時同步（Supabase Realtime，匿名登入，資料受 RLS 保護）
- **PWA**：可加入手機主畫面，離線可瀏覽

## 技術

純 HTML/CSS/JS（無 build step）。後端 Supabase 免費層（schema 見 [supabase/schema.sql](supabase/schema.sql)），
匯率用 open.er-api.com，地理服務用 Nominatim。

`js/config.js` 中的金鑰是 Supabase publishable key，設計上可公開；資料存取由 Row Level Security 控管。

## 本機開發

```
python -m http.server 8792
# 開 http://localhost:8792
```

🤖 Built with [Claude Code](https://claude.com/claude-code)
