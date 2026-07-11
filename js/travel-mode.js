// 旅行模式：保留旅途中需要的時間、導航與備案，隱藏編輯控制項。
import * as store from "./store.js";

const STORAGE_KEY = "travel-app:ui-mode";
const EDIT_MODE = "edit";
const TRAVEL_MODE = "travel";

let initialized = false;
let mode = readSavedMode();
let observer = null;
let refreshTimer = null;
let decorating = false;

const $ = (selector, root = document) => root.querySelector(selector);

function readSavedMode() {
  try {
    return localStorage.getItem(STORAGE_KEY) === TRAVEL_MODE ? TRAVEL_MODE : EDIT_MODE;
  } catch {
    return EDIT_MODE;
  }
}

function saveMode(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // localStorage 不可用時仍可在本次開啟期間切換模式。
  }
}

function ensureToggleButton() {
  let button = $("#travelModeBtn");
  if (button) return button;

  const topbar = $("#topbar");
  if (!topbar) return null;

  button = document.createElement("button");
  button.id = "travelModeBtn";
  button.type = "button";

  const icon = document.createElement("span");
  icon.className = "travelModeIcon";
  const text = document.createElement("span");
  text.className = "travelModeText";
  button.append(icon, text);
  button.addEventListener("click", () => setMode(mode === TRAVEL_MODE ? EDIT_MODE : TRAVEL_MODE));

  const exportButton = $("#exportBtn", topbar);
  if (exportButton) topbar.insertBefore(button, exportButton);
  else topbar.appendChild(button);
  return button;
}

function updateToggleButton() {
  const button = ensureToggleButton();
  if (!button) return;

  const travel = mode === TRAVEL_MODE;
  $(".travelModeIcon", button).textContent = travel ? "✏️" : "✈️";
  $(".travelModeText", button).textContent = travel ? "編輯" : "旅行";
  button.title = travel ? "切換到編輯模式" : "切換到旅行模式";
  button.setAttribute("aria-label", button.title);
  button.setAttribute("aria-pressed", String(travel));
}

function openItineraryView() {
  const tab = $('.tab[data-view="itinerary"]');
  if (tab && !tab.classList.contains("active")) tab.click();
}

function setMode(nextMode, { persist = true } = {}) {
  mode = nextMode === TRAVEL_MODE ? TRAVEL_MODE : EDIT_MODE;
  if (persist) saveMode(mode);

  document.body.classList.toggle("travelMode", mode === TRAVEL_MODE);
  document.documentElement.dataset.uiMode = mode;
  updateToggleButton();

  if (mode === TRAVEL_MODE) openItineraryView();
  queueMicrotask(decorateTravelCards);
}

function activeDayIndex() {
  const chips = [...document.querySelectorAll("#dayChips .dayChip")];
  const index = chips.findIndex((chip) => chip.classList.contains("active"));
  return index >= 0 ? index : 0;
}

function selectedDayStart(trip, dayIndex) {
  if (!trip || !trip.startDate) return null;
  const date = new Date(`${trip.startDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + dayIndex);
  return date;
}

function parseArrival(label) {
  const text = String(label || "").trim();
  const match = text.match(/^(翌日)?(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return (match[1] ? 1440 : 0) + Number(match[2]) * 60 + Number(match[3]);
}

function clearStatus(card) {
  card.classList.remove("travel-completed", "travel-current", "travel-next");
  $(".travelStatusBadge", card)?.remove();
}

function addStatus(card, type, text) {
  card.classList.add(type);
  const left = $(".stopLeft", card);
  if (!left) return;
  const badge = document.createElement("span");
  badge.className = "travelStatusBadge";
  badge.textContent = text;
  left.appendChild(badge);
}

function restoreEditableFields() {
  document.querySelectorAll(".slotTitleInput[data-travel-readonly]").forEach((input) => {
    input.readOnly = false;
    input.removeAttribute("tabindex");
    delete input.dataset.travelReadonly;
  });
}

function lockEditableFields() {
  document.querySelectorAll(".slotTitleInput").forEach((input) => {
    input.readOnly = true;
    input.tabIndex = -1;
    input.dataset.travelReadonly = "true";
  });
}

function decorateTravelCards() {
  if (decorating) return;
  const stopList = $("#stopList");
  if (!stopList) return;

  decorating = true;
  try {
    const cards = [...stopList.querySelectorAll(":scope > .stopCard[data-stop-id]")];
    cards.forEach(clearStatus);

    if (mode !== TRAVEL_MODE) {
      restoreEditableFields();
      return;
    }

    lockEditableFields();
    const trip = store.getActiveTrip();
    const dayStart = selectedDayStart(trip, activeDayIndex());
    if (!trip || !dayStart || cards.length === 0) return;

    const stopsById = new Map((trip.stops || []).map((stop) => [stop.id, stop]));
    const schedule = cards
      .map((card) => {
        const stop = stopsById.get(card.dataset.stopId);
        const arrival = parseArrival($(".arriveBadge", card)?.textContent);
        if (!stop || arrival === null) return null;
        return {
          card,
          stop,
          arrival,
          end: arrival + Math.max(1, Number(stop.stayMin) || 0),
        };
      })
      .filter(Boolean);
    if (schedule.length === 0) return;

    const nowMinutes = Math.floor((Date.now() - dayStart.getTime()) / 60000);
    let currentIndex = -1;
    let nextIndex = -1;

    for (let index = 0; index < schedule.length; index += 1) {
      const item = schedule[index];
      if (nowMinutes < item.arrival) {
        nextIndex = index;
        break;
      }
      if (nowMinutes >= item.arrival && nowMinutes < item.end) {
        currentIndex = index;
        nextIndex = index + 1 < schedule.length ? index + 1 : -1;
        break;
      }
    }

    if (currentIndex >= 0) {
      schedule.forEach((item, index) => {
        if (index < currentIndex) addStatus(item.card, "travel-completed", "完成");
        else if (index === currentIndex) addStatus(item.card, "travel-current", "現在");
        else if (index === nextIndex) addStatus(item.card, "travel-next", "下一站");
      });
      return;
    }

    if (nextIndex >= 0) {
      schedule.forEach((item, index) => {
        if (index < nextIndex) addStatus(item.card, "travel-completed", "完成");
        else if (index === nextIndex) addStatus(item.card, "travel-next", "下一站");
      });
      return;
    }

    // 已超過最後一站的停留時間，整天行程都標為完成。
    schedule.forEach((item) => addStatus(item.card, "travel-completed", "完成"));
  } finally {
    decorating = false;
  }
}

export function initTravelMode() {
  if (initialized) return;
  initialized = true;

  const start = () => {
    ensureToggleButton();
    setMode(mode, { persist: false });

    const stopList = $("#stopList");
    if (stopList) {
      observer = new MutationObserver(() => queueMicrotask(decorateTravelCards));
      // App 每次 render 都會替換 stopList 的直接子節點，不需要監看整個 subtree。
      observer.observe(stopList, { childList: true });
    }

    store.subscribe(() => queueMicrotask(decorateTravelCards));
    window.addEventListener("focus", decorateTravelCards);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) decorateTravelCards();
    });
    refreshTimer = window.setInterval(() => {
      if (mode === TRAVEL_MODE) decorateTravelCards();
    }, 60000);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}
