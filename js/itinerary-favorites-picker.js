// 行程頁快捷「我的最愛」選擇器：直接把收藏地點加入目前顯示的 Day。
import * as store from "./store.js";

const FAVORITE_CATS = {
  sight: { label: "景點", emoji: "⛩️" },
  food: { label: "餐廳", emoji: "🍜" },
  shop: { label: "逛街", emoji: "🛍️" },
  transport: { label: "交通", emoji: "🚉" },
  hotel: { label: "住宿", emoji: "🏨" },
  other: { label: "其他", emoji: "📍" },
};

const $ = (selector) => document.querySelector(selector);
let pickerOpen = false;

function injectStyles() {
  const style = document.createElement("style");
  style.textContent = `
    #itineraryFavBtn {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      padding: 9px 11px;
      background: var(--coral-soft);
    }
    #itineraryFavBtn.hasFavorites { border-color: var(--coral); }
    .itineraryFavCount {
      min-width: 20px;
      height: 20px;
      padding: 0 6px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: var(--coral);
      color: #fff;
      font-size: 11px;
      line-height: 1;
    }
    .itineraryFavPicker {
      margin-top: 10px;
      padding: 12px;
      background: var(--card);
      border: 2px solid var(--ink);
      border-radius: 14px;
      box-shadow: var(--shadow);
    }
    .itineraryFavPickerHead {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 10px;
    }
    .itineraryFavPickerHead strong { font-size: 14px; }
    .itineraryFavCloseBtn {
      flex-shrink: 0;
      padding: 2px 8px;
      border: none;
      background: transparent;
      box-shadow: none;
      color: var(--muted);
    }
    .itineraryFavCloseBtn:hover { transform: none; box-shadow: none; color: var(--danger); }
    .itineraryFavList {
      display: grid;
      gap: 8px;
      max-height: 300px;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    .itineraryFavItem {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 9px;
      padding: 9px 10px;
      text-align: left;
      background: #fff;
      box-shadow: none;
    }
    .itineraryFavItem:hover { background: var(--coral-soft); box-shadow: var(--shadow-sm); }
    .itineraryFavItemEmoji { flex-shrink: 0; font-size: 19px; }
    .itineraryFavItemText { flex: 1; min-width: 0; }
    .itineraryFavItemName {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 14px;
      font-weight: 800;
    }
    .itineraryFavItemCat { display: block; color: var(--muted); font-size: 11px; }
    .itineraryFavItemAdd { flex-shrink: 0; color: var(--coral); font-size: 18px; font-weight: 800; }
    .itineraryFavEmpty {
      padding: 14px 8px;
      text-align: center;
      color: var(--muted);
      font-size: 13px;
    }
    .itineraryFavEmpty button { margin-top: 10px; }
    .itineraryFavMsg {
      min-height: 18px;
      margin-top: 8px;
      font-size: 12px;
      font-weight: 800;
      color: var(--green);
    }
    @media (max-width: 520px) {
      #searchBox { gap: 7px; }
      #searchBtn, #itineraryFavBtn { padding-left: 10px; padding-right: 10px; }
      .itineraryFavBtnText { display: none; }
    }
  `;
  document.head.appendChild(style);
}

function createPickerUi() {
  const searchBox = $("#searchBox");
  const searchResults = $("#searchResults");
  if (!searchBox || !searchResults || $("#itineraryFavBtn")) return false;

  const button = document.createElement("button");
  button.id = "itineraryFavBtn";
  button.type = "button";
  button.title = "從我的最愛加入行程";
  button.setAttribute("aria-controls", "itineraryFavPicker");
  button.setAttribute("aria-expanded", "false");
  button.innerHTML =
    '<span aria-hidden="true">❤️</span>' +
    '<span class="itineraryFavBtnText">最愛</span>' +
    '<span id="itineraryFavCount" class="itineraryFavCount">0</span>';
  searchBox.appendChild(button);

  const picker = document.createElement("div");
  picker.id = "itineraryFavPicker";
  picker.className = "itineraryFavPicker hidden";
  picker.innerHTML = `
    <div class="itineraryFavPickerHead">
      <div>
        <strong>❤️ 從我的最愛加入</strong>
        <div id="itineraryFavTarget" class="mutedText"></div>
      </div>
      <button id="itineraryFavCloseBtn" class="itineraryFavCloseBtn" type="button" aria-label="關閉">✕</button>
    </div>
    <div id="itineraryFavList" class="itineraryFavList"></div>
    <div id="itineraryFavMsg" class="itineraryFavMsg" aria-live="polite"></div>
  `;
  searchResults.insertAdjacentElement("afterend", picker);
  return true;
}

function activeDayIndex() {
  const chips = Array.from(document.querySelectorAll("#dayChips .dayChip"));
  const index = chips.findIndex((chip) => chip.classList.contains("active"));
  return index >= 0 ? index : 0;
}

function setMessage(text) {
  const msg = $("#itineraryFavMsg");
  if (msg) msg.textContent = text;
}

function setPickerOpen(open) {
  const picker = $("#itineraryFavPicker");
  const button = $("#itineraryFavBtn");
  if (!picker || !button) return;

  pickerOpen = open;
  picker.classList.toggle("hidden", !open);
  button.setAttribute("aria-expanded", String(open));
  if (open) {
    $("#searchResults")?.classList.add("hidden");
    renderPicker();
  }
}

function updateButton(trip) {
  const button = $("#itineraryFavBtn");
  const countEl = $("#itineraryFavCount");
  if (!button || !countEl) return;
  const count = trip && Array.isArray(trip.favorites) ? trip.favorites.length : 0;
  countEl.textContent = String(count);
  button.classList.toggle("hasFavorites", count > 0);
  button.disabled = !trip;
}

function renderEmptyState(list) {
  const empty = document.createElement("div");
  empty.className = "itineraryFavEmpty";
  empty.textContent = "目前還沒有收藏地點。";

  const go = document.createElement("button");
  go.type = "button";
  go.textContent = "前往我的最愛收藏";
  go.addEventListener("click", () => {
    document.querySelector('.tab[data-view="favorites"]')?.click();
    setPickerOpen(false);
  });
  empty.appendChild(document.createElement("br"));
  empty.appendChild(go);
  list.appendChild(empty);
}

function favoriteButton(favorite, dayIndex) {
  const cat = FAVORITE_CATS[favorite.category] || FAVORITE_CATS.other;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "itineraryFavItem";
  button.title = `把「${favorite.name}」加入目前這天`;

  const emoji = document.createElement("span");
  emoji.className = "itineraryFavItemEmoji";
  emoji.textContent = cat.emoji;

  const text = document.createElement("span");
  text.className = "itineraryFavItemText";
  const name = document.createElement("span");
  name.className = "itineraryFavItemName";
  name.textContent = favorite.name;
  const category = document.createElement("span");
  category.className = "itineraryFavItemCat";
  category.textContent = cat.label;
  text.append(name, category);

  const add = document.createElement("span");
  add.className = "itineraryFavItemAdd";
  add.textContent = "＋";
  add.setAttribute("aria-hidden", "true");
  button.append(emoji, text, add);

  button.addEventListener("click", () => {
    store.addStop({
      dayIndex,
      name: favorite.name,
      lat: favorite.lat,
      lng: favorite.lng,
      category: favorite.category,
    });
    setMessage(`已加入「${favorite.name}」到 Day ${dayIndex + 1}`);
  });
  return button;
}

function renderPicker() {
  const trip = store.getActiveTrip();
  updateButton(trip);
  if (!pickerOpen) return;
  if (!trip) {
    setPickerOpen(false);
    return;
  }

  const dayIndex = activeDayIndex();
  const dayCount = store.tripDayCount(trip);
  const safeDayIndex = Math.min(Math.max(dayIndex, 0), dayCount - 1);
  const target = $("#itineraryFavTarget");
  const list = $("#itineraryFavList");
  if (!target || !list) return;

  target.textContent = `點選後加入 Day ${safeDayIndex + 1}・${store.tripDayDate(trip, safeDayIndex)}`;
  list.replaceChildren();
  setMessage("");

  const favorites = Array.isArray(trip.favorites) ? trip.favorites : [];
  if (favorites.length === 0) {
    renderEmptyState(list);
    return;
  }
  favorites.forEach((favorite) => list.appendChild(favoriteButton(favorite, safeDayIndex)));
}

function bindEvents() {
  $("#itineraryFavBtn")?.addEventListener("click", () => setPickerOpen(!pickerOpen));
  $("#itineraryFavCloseBtn")?.addEventListener("click", () => setPickerOpen(false));
  $("#searchBtn")?.addEventListener("click", () => setPickerOpen(false));
  $("#placeInput")?.addEventListener("focus", () => setPickerOpen(false));

  $("#dayChips")?.addEventListener("click", () => {
    if (pickerOpen) setTimeout(renderPicker, 0);
  });

  $("#tabs")?.addEventListener("click", (event) => {
    const tab = event.target.closest(".tab");
    if (tab && tab.dataset.view !== "itinerary") setPickerOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && pickerOpen) setPickerOpen(false);
  });
}

function init() {
  injectStyles();
  if (!createPickerUi()) return;
  bindEvents();
  store.subscribe(renderPicker);
  renderPicker();
}

init();
