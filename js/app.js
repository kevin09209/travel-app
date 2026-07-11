// 進入點：先載入既有 App，再掛上景點與分組備案 UI。
export * from "./app-core.js";
import { initStopBackups } from "./stop-backups.js";
import { initCompactStopBackupLayout } from "./stop-backups-compact.js";
import { initGroupBackups } from "./group-backups.js";

initStopBackups();
initCompactStopBackupLayout();
initGroupBackups();
