// 行程景點備案 UI：備案未啟用前不參與地圖、順序與抵達時間推算。
import * as store from "./store.js";
import { STOP_CATS } from "./app-core.js";
import { NOMINATIM_API } from "./config.js";

const expandedStopIds = new Set();
let initialized = false;
let decorating = false;
let observer = null;

const $ = (selector, root = document) => root.querySelector(selector);

function currentTrip() {
  return store.getActiveTrip();
}

function findStop(stopId) {
  const trip = currentTrip();
  return trip && Array.isArray(trip.stops)
    ? trip.stops.find((stop) => stop.id === stopId) || null
    : null;
}

function normalizedCoordinate(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function googleMapsNavUrl(place) {
  const lat = normalizedCoordinate(place.lat);
  const lng = normalizedCoordinate(place.lng);
  const destination = lat !== null && lng !== null ? `${lat},${lng}` : place.name;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination || "")}`;
}

function openExternal(url) {
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function parseGoogleMapsUrl(text) {
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  const host = url.hostname;
  if (host === "maps.app.goo.gl" || host === "goo.gl") return { short: true };
  if (!/(^|\.)google\.[a-z.]+$/.test(host)) return null;
  if (!url.pathname.startsWith("/maps") && !url.searchParams.has("q")) return null;

  const placeMatch = url.pathname.match(/\/(?:place|search)\/([^/@]+)/);
  let name = placeMatch
    ? decodeURIComponent(placeMatch[1].replace(/\+/g, " ")).trim()
    : null;
  if (name && /^-?\d+\.?\d*,\s*-?\d+\.?\d*$/.test(name)) name = null;

  const full = url.pathname + "?" + url.search;
  const precise = full.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
  const centered = url.pathname.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  const query = url.searchParams.get("q") || url.searchParams.get("query");
  const queryCoords = query && query.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);

  let lat = null;
  let lng = null;
  if (precise) {
    lat = Number(precise[1]);
    lng = Number(precise[2]);
  } else if (queryCoords) {
    lat = Number(queryCoords[1]);
    lng = Number(queryCoords[2]);
  } else if (centered) {
    lat = Number(centered[1]);
    lng = Number(centered[2]);
  }
  if (!name && query && !queryCoords) name = query;
  return { name, lat, lng, short: false };
}

async function reverseGeocode(lat, lng) {
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}` +
      `&lon=${lng}&accept-language=zh-TW`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    return data.name || String(data.display_name || "").split(",")[0] || null;
  } catch {
    return null;
  }
}

function showSearchMessage(results, text, subtext = "") {
  results.replaceChildren();
  const item = document.createElement("li");
  item.className = "backupSearchMessage";
  item.textContent = text;
  if (subtext) {
    const sub = document.createElement("span");
    sub.className = "sub";
    sub.textContent = subtext;
    item.appendChild(sub);
  }
  results.appendChild(item);
  results.classList.remove("hidden");
}

async function searchPlaces(query, results, onPick) {
  const value = String(query || "").trim();
  if (!value) return;

  const maps = parseGoogleMapsUrl(value);
  if (maps) {
    if (maps.short) {
      showSearchMessage(
        results,
        "這是 Google Maps 短網址，瀏覽器無法直接解析 😅",
        "請先在瀏覽器打開，再複製網址列的完整網址貼過來"
      );
      return;
    }
    if (maps.lat !== null && maps.lng !== null) {
      showSearchMessage(results, "解析網址中…");
      const name = maps.name || (await reverseGeocode(maps.lat, maps.lng)) || "地圖標記地點";
      onPick({ name, lat: maps.lat, lng: maps.lng });
      results.classList.add("hidden");
      return;
    }
    if (maps.name) {
      await searchPlaces(maps.name, results, onPick);
      return;
    }
    showSearchMessage(results, "看不懂這個地圖網址，請確認是地點頁面的網址");
    return;
  }

  showSearchMessage(results, "搜尋中…");
  try {
    const url =
      `${NOMINATIM_API}?format=jsonv2&limit=5&accept-language=zh-TW&q=` +
      encodeURIComponent(value);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const places = await response.json();
    if (!Array.isArray(places) || places.length === 0) {
      showSearchMessage(results, "找不到這個地點，換個關鍵字試試");
      return;
    }

    results.replaceChildren();
    for (const place of places) {
      const item = document.createElement("li");
      const title = document.createElement("b");
      title.textContent = place.name || String(place.display_name || "").split(",")[0];
      const sub = document.createElement("span");
      sub.className = "sub";
      sub.textContent = place.display_name || "";
      item.append(title, sub);
      item.addEventListener("click", () => {
        onPick({
          name: title.textContent,
          lat: Number.parseFloat(place.lat),
          lng: Number.parseFloat(place.lon),
        });
        results.classList.add("hidden");
      });
      results.appendChild(item);
    }
    results.classList.remove("hidden");
  } catch (error) {
    console.warn("備案地點搜尋失敗", error);
    showSearchMessage(results, "搜尋失敗（網路或服務暫時異常），稍後再試");
  }
}

function setPanelMessage(panel, text, ok = false) {
  const message = $(".backupMsg", panel);
  if (!message) return;
  message.textContent = text || "";
  message.classList.toggle("show", Boolean(text));
  message.classList.toggle("ok", Boolean(text) && ok);
}

function backupItem(stop, backup, panel) {
  const category = STOP_CATS[backup.category] || STOP_CATS.other;
  const item = document.createElement("div");
  item.className = "backupItem";

  const main = document.createElement("div");
  main.className = "backupItemMain";
  const name = document.createElement("div");
  name.className = "backupName";
  name.textContent = `${category.emoji} ${backup.name}`;
  name.title = backup.name;
  main.appendChild(name);
  if (backup.note) {
    const note = document.createElement("div");
    note.className = "backupNote";
    note.textContent = backup.note;
    main.appendChild(note);
  }

  const actions = document.createElement("div");
  actions.className = "backupActions";

  const use = document.createElement("button");
  use.type = "button";
  use.className = "primary backupUseBtn";
  use.textContent = "改用";
  use.title = "改用此備案，原地點會回到備案清單";
  use.addEventListener("click", () => {
    const approved = confirm(
      `改用「${backup.name}」取代「${stop.name}」？\n原地點會保留在備案裡。`
    );
    if (approved) store.swapStopBackup(stop.id, backup.id);
  });

  const nav = document.createElement("button");
  nav.type = "button";
  nav.className = "backupNavBtn";
  nav.textContent = "🧭";
  nav.title = "在 Google Maps 導航";
  nav.addEventListener("click", () => openExternal(googleMapsNavUrl(backup)));

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "backupDelBtn";
  remove.textContent = "✕";
  remove.title = "刪除備案";
  remove.addEventListener("click", () => {
    if (confirm(`刪除備案「${backup.name}」？`)) {
      store.removeStopBackup(stop.id, backup.id);
      setPanelMessage(panel, "");
    }
  });

  actions.append(use, nav, remove);
  item.append(main, actions);
  return item;
}

function buildPanel(stop, trip) {
  const panel = document.createElement("div");
  panel.className = "backupPanel";

  const hint = document.createElement("div");
  hint.className = "backupHint";
  hint.textContent = "備案不影響目前地圖、順序與抵達時間；需要時再按「改用」。";
  panel.appendChild(hint);

  const searchRow = document.createElement("div");
  searchRow.className = "backupSearchRow";
  const input = document.createElement("input");
  input.type = "search";
  input.className = "backupSearchInput";
  input.placeholder = "搜尋備案地點，或貼 Google Maps 網址";
  input.autocomplete = "off";
  const searchButton = document.createElement("button");
  searchButton.type = "button";
  searchButton.className = "primary backupSearchBtn";
  searchButton.textContent = "搜尋";
  const results = document.createElement("ul");
  results.className = "searchResults backupSearchResults hidden";

  const doSearch = () => {
    setPanelMessage(panel, "");
    searchPlaces(input.value, results, ({ name, lat, lng }) => {
      const added = store.addStopBackup(stop.id, {
        name,
        lat,
        lng,
        category: stop.category,
      });
      if (!added.ok) setPanelMessage(panel, added.error);
      else input.value = "";
    });
  };
  searchButton.addEventListener("click", doSearch);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      doSearch();
    }
  });
  searchRow.append(input, searchButton);
  panel.append(searchRow, results);

  const favorites = Array.isArray(trip.favorites) ? trip.favorites : [];
  if (favorites.length > 0) {
    const favoriteRow = document.createElement("div");
    favoriteRow.className = "backupFavRow";
    const select = document.createElement("select");
    select.className = "backupFavSelect";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "❤️ 從我的最愛選擇";
    select.appendChild(placeholder);
    for (const favorite of favorites) {
      const category = STOP_CATS[favorite.category] || STOP_CATS.other;
      const option = document.createElement("option");
      option.value = favorite.id;
      option.textContent = `${category.emoji} ${favorite.name}`;
      select.appendChild(option);
    }
    const addFavorite = document.createElement("button");
    addFavorite.type = "button";
    addFavorite.className = "backupFavAddBtn";
    addFavorite.textContent = "加入備案";
    addFavorite.addEventListener("click", () => {
      const favorite = favorites.find((item) => item.id === select.value);
      if (!favorite) {
        setPanelMessage(panel, "請先選一個最愛地點");
        return;
      }
      const added = store.addStopBackup(stop.id, {
        name: favorite.name,
        lat: favorite.lat,
        lng: favorite.lng,
        category: favorite.category,
      });
      if (!added.ok) setPanelMessage(panel, added.error);
      else {
        select.value = "";
        setPanelMessage(panel, `已把「${favorite.name}」加入備案`, true);
      }
    });
    favoriteRow.append(select, addFavorite);
    panel.appendChild(favoriteRow);
  }

  const message = document.createElement("div");
  message.className = "backupMsg";
  message.setAttribute("aria-live", "polite");
  panel.appendChild(message);

  const list = document.createElement("div");
  list.className = "backupList";
  const backups = Array.isArray(stop.backups) ? stop.backups : [];
  if (backups.length === 0) {
    const empty = document.createElement("div");
    empty.className = "backupEmpty";
    empty.textContent = "還沒有備案，先加入一個雨天或臨時替代地點吧。";
    list.appendChild(empty);
  } else {
    for (const backup of backups) list.appendChild(backupItem(stop, backup, panel));
  }
  panel.appendChild(list);
  return panel;
}

function backupSection(stop, trip) {
  const backups = Array.isArray(stop.backups) ? stop.backups : [];
  const section = document.createElement("div");
  section.className = "backupSection";
  section.dataset.backupFor = stop.id;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "backupToggleBtn";
  const expanded = expandedStopIds.has(stop.id);
  toggle.classList.toggle("active", expanded);
  toggle.setAttribute("aria-expanded", String(expanded));

  const label = document.createElement("span");
  label.textContent = `🛟 備案${backups.length ? ` ${backups.length}` : ""}`;
  const arrow = document.createElement("span");
  arrow.textContent = expanded ? "▲" : "▼";
  toggle.append(label, arrow);
  toggle.addEventListener("click", () => {
    if (expandedStopIds.has(stop.id)) expandedStopIds.delete(stop.id);
    else expandedStopIds.add(stop.id);
    decorateCards();
  });
  section.appendChild(toggle);
  if (expanded) section.appendChild(buildPanel(stop, trip));
  return section;
}

function decorateCards() {
  if (decorating) return;
  const trip = currentTrip();
  const stopList = $("#stopList");
  if (!trip || !stopList) return;

  decorating = true;
  try {
    const validIds = new Set((trip.stops || []).map((stop) => stop.id));
    for (const id of [...expandedStopIds]) {
      if (!validIds.has(id)) expandedStopIds.delete(id);
    }

    for (const card of stopList.querySelectorAll(".stopCard[data-stop-id]")) {
      const old = $(".backupSection", card);
      if (old) old.remove();
      if (card.classList.contains("splitCard")) continue;

      const stop = findStop(card.dataset.stopId);
      const body = $(".stopBody", card);
      if (!stop || !body) continue;
      const section = backupSection(stop, trip);
      const companion = $(".companionRow", body);
      if (companion) body.insertBefore(section, companion);
      else body.appendChild(section);
    }
  } finally {
    decorating = false;
  }
}

export function initStopBackups() {
  if (initialized) return;
  initialized = true;

  const start = () => {
    const stopList = $("#stopList");
    if (!stopList) return;
    observer = new MutationObserver(() => decorateCards());
    observer.observe(stopList, { childList: true });
    store.subscribe(() => queueMicrotask(decorateCards));
    decorateCards();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}
