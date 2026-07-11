// 分組卡 UI 微調：把「加一組」改成小型浮動＋，對齊最後一位分組成員左側。
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
      const groupHeads = list ? [...list.querySelectorAll(":scope > .groupRow > .groupHead")] : [];
      const lastHead = groupHeads.at(-1);
      if (!body || !list || !addBtn || !lastHead) continue;

      addBtn.classList.remove("groupAddInlineBtn");
      addBtn.classList.add("groupAddFloatingBtn");
      addBtn.textContent = "＋";
      addBtn.title = "加一組";
      addBtn.setAttribute("aria-label", "加一組");

      // 對齊最後一個成員列中央，按鈕保持在分組框外的左側，不增加版位高度。
      const top = list.offsetTop + lastHead.offsetTop + lastHead.offsetHeight / 2 - 16;
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
