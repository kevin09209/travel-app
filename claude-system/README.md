# claude-system — 個人 AI 工作制度（私有）

把高階模型的判斷力寫成弱模型也能照做的制度，讓日常由便宜模型運作的 session 保持品質。
正本在本機 `D:\AI\claude-system\`；本 repo 是**單向鏡像**（本地 → GitHub），
供其他機器與 claude.ai/code 雲端專案取用——掛進專案的方法見 [BOOTSTRAP.md](BOOTSTRAP.md)。

## 檔案地圖

| 檔案 | 內容 |
|---|---|
| [INDEX.md](INDEX.md) | 入口：路由表＋鐵律七條＋使用者偏好（由本機 CLAUDE.md 生成，勿手改） |
| [00-diagnosis.md](00-diagnosis.md) | 制度存在的理由：三大弱點診斷 |
| [10-model-dispatch.md](10-model-dispatch.md) | 模型調度：派工觸發、三件套、升降級、驗證不自驗 |
| [20-judgment.md](20-judgment.md) | 判斷力外化：升級／完成／問人／換路／品質底線的判準 |
| [30-delegation-templates.md](30-delegation-templates.md) | 派工模板六份：搜尋、實作、重構、研究、審查、交接 |
| [40-maintenance.md](40-maintenance.md) | 維護協議：權限分級、修改流程、審計重跑、回聘協議 |
| [50-acceptance.md](50-acceptance.md) | 驗收基準：黃金任務、盲測流程、負向結果帳本 |
| [90-letter.md](90-letter.md) | 給未來 session 的信：退化模式與預防 |
| [LESSONS.md](LESSONS.md) | 踩坑記錄（唯一在專案副本中可寫的檔） |
| `tools/` | check-system.ps1（行數＋斷鏈＋INDEX 新鮮度檢查）、sync-github.ps1（生成 INDEX 並推送） |
| `backups/` | 歷次修改前的備份 |
