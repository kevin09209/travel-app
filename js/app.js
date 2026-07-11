// 進入點：先載入既有 App，再掛上景點備案 UI。
export * from "./app-core.js";
import { initStopBackups } from "./stop-backups.js";

initStopBackups();
