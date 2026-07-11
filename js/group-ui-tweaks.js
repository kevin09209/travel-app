// 分組卡 UI 微調：把「＋ 加一組」縮成小按鈕，放進分組列表左下角。
let initialized = false;
let decorating = false;
let observer = null;

const $ = (selector, root = document) => root.querySelector(selector);

function injectStyles() {
  if (document.getElementById("group-ui-tweaks-style")) return;
  const style = document.createElement("style");
  style.id = "group-ui-tweaks-style";
  style.textContent = `
    .groupAddInlineRow {
      display: flex;
      justify-content: flex-start;
      padding: 8px 11px 10px;
      border-top: 1.5px dashed #33323D33;
      background: var(--card);
    }
    .groupAddInlineBtn.addGroupBtn {
      width: auto;
      margin-top: 0;
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 800;
      border-radius: 999px;
    }
    @media (max-width: 480px) {
      .groupAddInlineRow {
        padding: 7px 10px 9px;
      }
      .groupAddInlineBtn.addGroupBtn {
        font-size: 11px;
        padding: 4px 9px;
      }
    }
  `;
  document.head.appendChild(style);
}

function decorate() {
  if (decorating) return;
  const stopList = $("#stopList");
  if (!stopList) return;

  decorating = true;
  try {
    for (const card of stopList.querySelectorAll(".stopCard.splitCard")) {
      const list = $(".groupList", card);
      const addBtn = $(":scope > .stopBody > .addGroupBtn", card) || $(":scope .groupAddInlineRow > .addGroupBtn", card);
      if (!list || !addBtn) continue;

      let row = $(".groupAddInlineRow", list);
      if (!row) {
        row = document.createElement("div");
        row.className = "groupAddInlineRow";
      }
      addBtn.classList.add("groupAddInlineBtn");
      row.replaceChildren(addBtn);
      if (row.parentElement !== list) list.appendChild(row);
    }
  } finally {
    decorating = false;
  }
}

export function initGroupUiTweaks() {
  if (initialized) return;
  initialized = true;
  injectStyles();

  const start = () => {
    const stopList = $("#stopList");
    if (!stopList) return;
    observer = new MutationObserver(() => queueMicrotask(decorate));
    observer.observe(stopList, { childList: true });
    decorate();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}
