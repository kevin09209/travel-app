// 進入點：先載入既有 App，再掛上景點與分組備案 UI。
export * from "./app-core.js";
import { initStopBackups } from "./stop-backups.js";
import { initCompactStopBackupLayout } from "./stop-backups-compact.js";
import { initGroupBackups } from "./group-backups.js";

initStopBackups();
initCompactStopBackupLayout();

// 分組備案只需要知道行程列表是否被重新渲染。
// 若監看 stopList 的整個 subtree，備案模組自己增刪按鈕時也會再次觸發 observer，形成無限迴圈。
function initGroupBackupsWithSafeObserver() {
  const nativeObserve = MutationObserver.prototype.observe;
  MutationObserver.prototype.observe = function observe(target, options = {}) {
    const safeOptions =
      target && target.id === "stopList" && options.subtree
        ? { ...options, subtree: false }
        : options;
    return nativeObserve.call(this, target, safeOptions);
  };

  try {
    initGroupBackups();
  } finally {
    MutationObserver.prototype.observe = nativeObserve;
  }
}

// 等 DOM 完成後再初始化，確保上面的 observer 限制會套用到真正的分組備案 observer。
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initGroupBackupsWithSafeObserver, { once: true });
} else {
  initGroupBackupsWithSafeObserver();
}
