// 漢堡選單與介面風格：收納頂列低頻操作，並提供三種本機外觀偏好。
const THEME_STORAGE_KEY = "travel-app:theme";
const THEMES = {
  sticker: {
    icon: "🧳",
    name: "活力貼紙",
    description: "粗框、珊瑚橘與海藍的原始風格",
    themeColor: "#FF6B57",
  },
  night: {
    icon: "🌙",
    name: "夜間旅行",
    description: "深色低亮度，晚上看行程更舒服",
    themeColor: "#111827",
  },
  journal: {
    icon: "📔",
    name: "旅行手帳",
    description: "米色紙張、票根與手寫筆記感",
    themeColor: "#C96B4B",
  },
};

let initialized = false;
let currentTheme = readSavedTheme();
let menuButton = null;
let overlay = null;
let sheet = null;

const $ = (selector, root = document) => root.querySelector(selector);
const hasTheme = (value) => Object.prototype.hasOwnProperty.call(THEMES, value);

function readSavedTheme() {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return hasTheme(value) ? value : "sticker";
  } catch {
    return "sticker";
  }
}

function saveTheme(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // localStorage 不可用時，外觀仍可在本次開啟期間切換。
  }
}

function applyTheme(theme, { persist = true } = {}) {
  currentTheme = hasTheme(theme) ? theme : "sticker";
  document.documentElement.dataset.theme = currentTheme;
  if (persist) saveTheme(currentTheme);

  const meta = $('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEMES[currentTheme].themeColor);

  document.querySelectorAll(".themeChoice").forEach((button) => {
    const active = button.dataset.theme === currentTheme;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function closeMenu({ restoreFocus = true } = {}) {
  if (!overlay || !sheet) return;
  overlay.classList.remove("open");
  sheet.classList.remove("open");
  overlay.setAttribute("aria-hidden", "true");
  menuButton?.setAttribute("aria-expanded", "false");
  document.body.classList.remove("appMenuOpen");
  if (restoreFocus) menuButton?.focus();
}

function openMenu() {
  if (!overlay || !sheet) return;
  overlay.classList.add("open");
  sheet.classList.add("open");
  overlay.setAttribute("aria-hidden", "false");
  menuButton?.setAttribute("aria-expanded", "true");
  document.body.classList.add("appMenuOpen");
  $("#appMenuClose", sheet)?.focus();
}

function actionMarkup(icon, text, detail) {
  return `<span class="menuActionIcon" aria-hidden="true">${icon}</span><span class="menuActionCopy"><b>${text}</b><small>${detail}</small></span>`;
}

function moveActionButton(button, icon, text, detail, host) {
  if (!button || !host) return;
  button.classList.add("menuActionBtn");
  button.innerHTML = actionMarkup(icon, text, detail);
  button.removeAttribute("title");
  // 使用 capture，確保開 dialog 或列印前先收起底部選單。
  button.addEventListener("click", () => closeMenu({ restoreFocus: false }), { capture: true });
  host.appendChild(button);
}

function buildThemeChoices(host) {
  if (!host) return;
  for (const [key, theme] of Object.entries(THEMES)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "themeChoice";
    button.dataset.theme = key;
    button.innerHTML = `
      <span class="themeSwatch themeSwatch-${key}" aria-hidden="true"><span>${theme.icon}</span></span>
      <span class="themeChoiceCopy"><b>${theme.name}</b><small>${theme.description}</small></span>
      <span class="themeCheck" aria-hidden="true">✓</span>
    `;
    button.addEventListener("click", () => applyTheme(key));
    host.appendChild(button);
  }
}

function buildMenu() {
  const topbar = $("#topbar");
  if (!topbar || $("#appMenuBtn")) return;

  menuButton = document.createElement("button");
  menuButton.id = "appMenuBtn";
  menuButton.type = "button";
  menuButton.textContent = "☰";
  menuButton.title = "開啟更多功能";
  menuButton.setAttribute("aria-label", "開啟更多功能");
  menuButton.setAttribute("aria-haspopup", "dialog");
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.addEventListener("click", openMenu);
  topbar.appendChild(menuButton);

  overlay = document.createElement("div");
  overlay.id = "appMenuOverlay";
  overlay.setAttribute("aria-hidden", "true");
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeMenu();
  });

  sheet = document.createElement("section");
  sheet.id = "appMenuSheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-labelledby", "appMenuTitle");
  sheet.innerHTML = `
    <div class="appMenuHandle" aria-hidden="true"></div>
    <div class="appMenuHeader">
      <div>
        <h2 id="appMenuTitle">更多功能</h2>
        <p>旅程工具與介面風格</p>
      </div>
      <button id="appMenuClose" type="button" aria-label="關閉選單">✕</button>
    </div>
    <div class="appMenuSection">
      <h3>旅程工具</h3>
      <div id="appMenuActions" class="appMenuActions"></div>
    </div>
    <div class="appMenuSection">
      <h3>介面風格</h3>
      <div id="themeChoices" class="themeChoices"></div>
    </div>
  `;
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  $("#appMenuClose", sheet)?.addEventListener("click", () => closeMenu());
  const actionHost = $("#appMenuActions", sheet);
  moveActionButton($("#newTripBtn"), "＋", "新增旅程", "建立另一趟旅行", actionHost);
  moveActionButton($("#syncBtn"), "🔗", "分享與同步", "邀請旅伴一起編輯", actionHost);
  moveActionButton($("#exportBtn"), "📄", "匯出 PDF", "保存或傳送行程", actionHost);
  buildThemeChoices($("#themeChoices", sheet));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && overlay.classList.contains("open")) closeMenu();
  });
}

export function initAppMenuThemes() {
  if (initialized) return;
  initialized = true;

  // 先套用偏好，避免選單建立時主題預覽狀態不一致。
  applyTheme(currentTheme, { persist: false });

  const start = () => {
    buildMenu();
    applyTheme(currentTheme, { persist: false });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}
