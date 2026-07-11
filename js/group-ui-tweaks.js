// 分組卡 UI 微調：把「加一組」改成小型浮動＋，只在分組展開時顯示。
let initialized = false;
let decorating = false;
let observer = null;

const $ = (selector, root = document) => root.querySelector(selector);

function injectStyles() {
  if (document.getElementById("group-ui-tweaks-style")) return;
  const style = document.createElement("style");
  style.id = "group-ui-tweaks-style";
  style.textContent = `
    .splitCard .stopBody {
      position: relative;
    }
    .groupAddFloatingBtn.addGroupBtn {
      position: absolute;
      left: -54px;
      width: 32px;
      height: 32px;
      margin: 0;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      border-style: dashed;
      color: var(--blue);
      background: var(--blue-soft);
      box-shadow: var(--shadow-sm);
      font-size: 22px;
      font-weight: 700;
      line-height: 1;
      z-index: 2;
    }
    .groupAddFloatingBtn.addGroupBtn:hover {
      transform: translateY(-1px);
    }
    @media (max-width: 480px) {
      .groupAddFloatingBtn.addGroupBtn {
        left: -50px;
        width: 30px;
        height: 30px;
        font-size: 20px;
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
      const body = $(".stopBody", card);
      const list = $(".groupList", card);
      const addBtn = $(":scope > .stopBody > .addGroupBtn", card);
      if (!body || !list || !addBtn) continue;

      addBtn.classList.remove("groupAddInlineBtn");
      addBtn.classList.add("groupAddFloatingBtn");
      addBtn.textContent = "＋";
      addBtn.title = "加一組";
      addBtn.setAttribute("aria-label", "加一組");

      // 只有分組細節展開時才顯示；全部收合時，按鈕要一起消失。
      const openRows = [...list.querySelectorAll(":scope > .groupRow.open")];
      const activeRow = openRows.at(-1);
      const activeHead = activeRow ? $(".groupHead", activeRow) : null;
      if (!activeHead) {
        addBtn.style.display = "none";
        addBtn.style.removeProperty("top");
        continue;
      }

      addBtn.style.display = "flex";
      // 對齊目前展開的分組成員列中央，保持在分組框外左側，不增加版位高度。
      const top = list.offsetTop + activeRow.offsetTop + activeHead.offsetHeight / 2 - 16;
      addBtn.style.top = `${Math.max(0, top)}px`;
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
