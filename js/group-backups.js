// 分組地點備案 UI：每一組各自維護備案，收合時不增加版位高度。
import * as store from "./store.js";
import { STOP_CATS } from "./app-core.js";
import { NOMINATIM_API } from "./config.js";

const expandedKeys = new Set();
let initialized = false;
let decorating = false;
let observer = null;

const $ = (selector, root = document) => root.querySelector(selector);
const keyOf = (stopId, groupId) => `${stopId}:${groupId}`;

function currentTrip() {
  return store.getActiveTrip();
}

function coordinates(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function navUrl(place) {
  const lat = coordinates(place.lat);
  const lng = coordinates(place.lng);
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
  if (url.hostname === "maps.app.goo.gl" || url.hostname === "goo.gl") return { short: true };
  if (!/(^|\.)google\.[a-z.]+$/.test(url.hostname)) return null;
  if (!url.pathname.startsWith("/maps") && !url.searchParams.has("q")) return null;

  const placeMatch = url.pathname.match(/\/(?:place|search)\/([^/@]+)/);
  let name = placeMatch ? decodeURIComponent(placeMatch[1].replace(/\+/g, " ")).trim() : null;
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
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=zh-TW`
    );
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
  item.className = "groupBackupSearchMessage";
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
      showSearchMessage(results, "Google Maps 短網址無法直接解析", "請貼上瀏覽器網址列中的完整網址");
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
  }

  showSearchMessage(results, "搜尋中…");
  try {
    const response = await fetch(
      `${NOMINATIM_API}?format=jsonv2&limit=5&accept-language=zh-TW&q=${encodeURIComponent(value)}`
    );
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
    console.warn("分組備案地點搜尋失敗", error);
    showSearchMessage(results, "搜尋失敗，稍後再試");
  }
}

function setMessage(panel, text, ok = false) {
  const message = $(".groupBackupMsg", panel);
  if (!message) return;
  message.textContent = text || "";
  message.classList.toggle("show", Boolean(text));
  message.classList.toggle("ok", Boolean(text) && ok);
}

function groupLabel(group, trip) {
  const names = (group.memberIds || []).map(
    (id) => (trip.members.find((member) => member.id === id) || { name: "?" }).name
  );
  return names.length ? names.join("、") : "（未指定）";
}

function matchGroups(stop, card, trip) {
  const unused = new Set(stop.groups || []);
  const pairs = [];
  for (const row of card.querySelectorAll(".groupRow")) {
    const placeText = $(".groupPlace", row)?.textContent || "";
    const whoText = $(".groupWho", row)?.textContent || "";
    let group = [...unused].find(
      (item) => (item.name || "新的一組…") === placeText && groupLabel(item, trip) === whoText
    );
    if (!group) group = [...unused].find((item) => (item.name || "新的一組…") === placeText);
    if (!group) group = [...unused][0] || null;
    if (group) unused.delete(group);
    pairs.push({ row, group });
  }
  return pairs;
}

function backupItem(stop, group, backup, panel) {
  const category = STOP_CATS[backup.category] || STOP_CATS[stop.category] || STOP_CATS.other;
  const item = document.createElement("div");
  item.className = "groupBackupItem";

  const name = document.createElement("div");
  name.className = "groupBackupName";
  name.textContent = `${category.emoji} ${backup.name}`;
  name.title = backup.name;

  const actions = document.createElement("div");
  actions.className = "groupBackupItemActions";

  const use = document.createElement("button");
  use.type = "button";
  use.className = "primary";
  use.textContent = "改用";
  use.addEventListener("click", () => {
    if (confirm(`改用「${backup.name}」取代這組的「${group.name || "目前地點"}」？\n原地點會保留在備案裡。`)) {
      store.swapStopGroupBackup(stop.id, group.id, backup.id);
    }
  });

  const nav = document.createElement("button");
  nav.type = "button";
  nav.textContent = "🧭";
  nav.title = "在 Google Maps 導航";
  nav.addEventListener("click", () => openExternal(navUrl(backup)));

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "groupBackupDelete";
  remove.textContent = "✕";
  remove.title = "刪除備案";
  remove.addEventListener("click", () => {
    if (confirm(`刪除備案「${backup.name}」？`)) {
      store.removeStopGroupBackup(stop.id, group.id, backup.id);
      setMessage(panel, "");
    }
  });

  actions.append(use, nav, remove);
  item.append(name, actions);
  return item;
}

function buildPanel(stop, group, trip) {
  const panel = document.createElement("div");
  panel.className = "groupBackupPanel";

  const searchRow = document.createElement("div");
  searchRow.className = "groupBackupSearchRow";
  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = "搜尋這組的備案地點，或貼 Google Maps 網址";
  input.autocomplete = "off";
  const searchButton = document.createElement("button");
  searchButton.type = "button";
  searchButton.className = "primary";
  searchButton.textContent = "搜尋";
  const results = document.createElement("ul");
  results.className = "searchResults groupBackupResults hidden";
  const doSearch = () => {
    setMessage(panel, "");
    searchPlaces(input.value, results, ({ name, lat, lng }) => {
      const added = store.addStopGroupBackup(stop.id, group.id, {
        name,
        lat,
        lng,
        category: stop.category,
      });
      if (!added.ok) setMessage(panel, added.error);
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
  if (favorites.length) {
    const favoriteRow = document.createElement("div");
    favoriteRow.className = "groupBackupFavoriteRow";
    const select = document.createElement("select");
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
    const add = document.createElement("button");
    add.type = "button";
    add.textContent = "加入備案";
    add.addEventListener("click", () => {
      const favorite = favorites.find((item) => item.id === select.value);
      if (!favorite) {
        setMessage(panel, "請先選一個最愛地點");
        return;
      }
      const added = store.addStopGroupBackup(stop.id, group.id, favorite);
      if (!added.ok) setMessage(panel, added.error);
      else {
        select.value = "";
        setMessage(panel, `已把「${favorite.name}」加入這組的備案`, true);
      }
    });
    favoriteRow.append(select, add);
    panel.appendChild(favoriteRow);
  }

  const message = document.createElement("div");
  message.className = "groupBackupMsg";
  message.setAttribute("aria-live", "polite");
  panel.appendChild(message);

  const list = document.createElement("div");
  list.className = "groupBackupList";
  const backups = Array.isArray(group.backups) ? group.backups : [];
  if (!backups.length) {
    const empty = document.createElement("div");
    empty.className = "groupBackupEmpty";
    empty.textContent = "這組還沒有備案。";
    list.appendChild(empty);
  } else {
    for (const backup of backups) list.appendChild(backupItem(stop, group, backup, panel));
  }
  panel.appendChild(list);
  return panel;
}

function createToggle(stop, group) {
  const backups = Array.isArray(group.backups) ? group.backups : [];
  const key = keyOf(stop.id, group.id);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "groupBackupToggleBtn";
  button.textContent = backups.length ? `🛟 備案 ${backups.length}` : "🛟 備案";
  button.title = "展開或收合這組的備案";
  button.classList.toggle("active", expandedKeys.has(key));
  button.addEventListener("click", () => {
    if (expandedKeys.has(key)) expandedKeys.delete(key);
    else expandedKeys.add(key);
    decorate();
  });
  return button;
}

function injectStyles() {
  if (document.getElementById("group-backups-style")) return;
  const style = document.createElement("style");
  style.id = "group-backups-style";
  style.textContent = `
    .groupBackupToggleBtn { font-size: 12px; padding: 5px 9px; border-radius: 999px; border-style: dashed; color: #0B6BB8; background: var(--blue-soft); box-shadow: none; }
    .groupBackupToggleBtn.active { box-shadow: var(--shadow-sm); }
    .groupBackupPanel { margin-top: 8px; padding-top: 8px; border-top: 1px dashed #33323D44; }
    .groupBackupSearchRow, .groupBackupFavoriteRow { display: flex; gap: 7px; margin-bottom: 7px; }
    .groupBackupSearchRow input, .groupBackupFavoriteRow select { flex: 1; min-width: 0; font-size: 12px; padding: 7px 8px; }
    .groupBackupSearchRow button, .groupBackupFavoriteRow button { flex-shrink: 0; font-size: 12px; padding: 7px 9px; }
    .groupBackupResults { margin-bottom: 7px; }
    .groupBackupResults li { padding: 8px 10px; font-size: 12px; }
    .groupBackupSearchMessage { cursor: default !important; }
    .groupBackupMsg { display: none; margin: 3px 0 7px; color: var(--danger); font-size: 12px; font-weight: 700; }
    .groupBackupMsg.show { display: block; }
    .groupBackupMsg.ok { color: var(--green); }
    .groupBackupList { display: grid; gap: 6px; }
    .groupBackupItem { display: flex; align-items: center; gap: 7px; padding: 7px; border: 1.5px solid var(--ink); border-radius: 9px; background: var(--card); }
    .groupBackupName { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 800; }
    .groupBackupItemActions { display: flex; gap: 4px; flex-shrink: 0; }
    .groupBackupItemActions button { padding: 4px 7px; border-radius: 7px; font-size: 11px; box-shadow: none; }
    .groupBackupDelete { border: none; background: transparent; color: var(--danger); }
    .groupBackupEmpty { padding: 8px; text-align: center; color: var(--muted); font-size: 12px; }
    @media (max-width: 480px) {
      .groupActions { flex-wrap: wrap; }
      .groupBackupToggleBtn { font-size: 11px; padding: 5px 8px; }
      .groupBackupItem { align-items: flex-start; flex-direction: column; }
      .groupBackupItemActions { width: 100%; justify-content: flex-end; }
    }
  `;
  document.head.appendChild(style);
}

function decorate() {
  if (decorating) return;
  const trip = currentTrip();
  const stopList = $("#stopList");
  if (!trip || !stopList) return;

  decorating = true;
  try {
    const validKeys = new Set();
    for (const stop of trip.stops || []) {
      for (const group of stop.groups || []) validKeys.add(keyOf(stop.id, group.id));
    }
    for (const key of [...expandedKeys]) {
      if (!validKeys.has(key)) expandedKeys.delete(key);
    }

    for (const card of stopList.querySelectorAll(".stopCard.splitCard[data-stop-id]")) {
      const stop = (trip.stops || []).find((item) => item.id === card.dataset.stopId);
      if (!stop) continue;

      for (const { row, group } of matchGroups(stop, card, trip)) {
        if (!group) continue;
        row.dataset.groupBackupId = group.id;
        row.querySelectorAll(".groupBackupToggleBtn, .groupBackupPanel").forEach((element) => element.remove());
        const detail = $(".groupDetail", row);
        const actions = $(".groupActions", row);
        if (!detail || !actions) continue;

        const toggle = createToggle(stop, group);
        const deleteButton = $(".groupDelBtn", actions);
        if (deleteButton) actions.insertBefore(toggle, deleteButton);
        else actions.appendChild(toggle);

        if (expandedKeys.has(keyOf(stop.id, group.id))) {
          detail.appendChild(buildPanel(stop, group, trip));
        }
      }
    }
  } finally {
    decorating = false;
  }
}

export function initGroupBackups() {
  if (initialized) return;
  initialized = true;
  injectStyles();

  const start = () => {
    const stopList = $("#stopList");
    if (!stopList) return;
    observer = new MutationObserver(() => queueMicrotask(decorate));
    observer.observe(stopList, { childList: true, subtree: true });
    store.subscribe(() => queueMicrotask(decorate));
    decorate();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}
