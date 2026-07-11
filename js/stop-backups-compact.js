// 將備案收合按鈕放進行程卡右下角的既有操作列；只有展開時才佔用額外高度。
let initialized = false;
let arranging = false;
let observer = null;

const STYLE_ID = "stop-backups-compact-style";

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .companionRow.backupCompactHost {
      flex-wrap: nowrap;
    }

    .companionRow.backupCompactHost .splitToggleBtn {
      margin-left: auto;
    }

    .backupCompactHost .backupToggleBtn,
    .backupCompactMetaHost .backupToggleBtn {
      width: auto;
      min-width: 0;
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      margin: 0;
      padding: 4px 9px;
      border-radius: 999px;
      font-size: 12px;
      line-height: 1.2;
      box-shadow: none;
      white-space: nowrap;
    }

    .backupCompactHost .backupToggleBtn > span:last-child,
    .backupCompactMetaHost .backupToggleBtn > span:last-child {
      font-size: 9px;
    }

    .stopMeta.backupCompactMetaHost {
      flex-wrap: nowrap;
    }

    .stopMeta.backupCompactMetaHost .backupToggleBtn {
      margin-left: auto;
    }

    .backupSection.backupExpandedSection {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px dashed #33323D44;
    }

    @media (max-width: 480px) {
      .backupCompactHost .backupToggleBtn,
      .backupCompactMetaHost .backupToggleBtn {
        gap: 3px;
        padding: 4px 7px;
        font-size: 11px;
      }

      .companionRow.backupCompactHost {
        gap: 5px;
      }

      .companionRow.backupCompactHost .companionLabel {
        font-size: 11px;
      }
    }
  `;
  document.head.appendChild(style);
}

function compactToggleLabel(toggle) {
  const label = toggle.firstElementChild;
  if (!label) return;
  const count = Number.parseInt((label.textContent.match(/\d+/) || ["0"])[0], 10);
  label.textContent = count > 0 ? `🛟 備案 ${count}` : "🛟 備案";
  toggle.title = "展開或收合這個景點的備案";
}

function arrangeCards() {
  if (arranging) return;
  const stopList = document.querySelector("#stopList");
  if (!stopList) return;

  arranging = true;
  try {
    for (const card of stopList.querySelectorAll(".stopCard[data-stop-id]")) {
      if (card.classList.contains("splitCard")) continue;

      const section = card.querySelector(".backupSection");
      if (!section || section.dataset.compacted === "true") continue;

      const freshToggle = section.querySelector(".backupToggleBtn");
      if (!freshToggle) continue;

      card.querySelectorAll(".backupToggleBtn").forEach((button) => {
        if (button !== freshToggle) button.remove();
      });

      const body = card.querySelector(".stopBody");
      if (!body) continue;
      const companion = body.querySelector(".companionRow");
      const meta = body.querySelector(".stopMeta");
      const host = companion || meta;
      if (!host) continue;

      host.classList.add(companion ? "backupCompactHost" : "backupCompactMetaHost");
      compactToggleLabel(freshToggle);
      host.appendChild(freshToggle);

      section.dataset.compacted = "true";
      if (section.querySelector(".backupPanel")) {
        section.classList.add("backupExpandedSection");
        body.appendChild(section);
      } else {
        section.remove();
      }
    }
  } finally {
    arranging = false;
  }
}

export function initCompactStopBackupLayout() {
  if (initialized) return;
  initialized = true;
  injectStyles();

  const start = () => {
    const stopList = document.querySelector("#stopList");
    if (!stopList) return;
    observer = new MutationObserver(() => queueMicrotask(arrangeCards));
    observer.observe(stopList, { childList: true, subtree: true });
    arrangeCards();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}
