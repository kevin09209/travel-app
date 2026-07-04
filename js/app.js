// 進入點：狀態渲染、事件繫結。
import * as store from "./store.js";
import * as mapView from "./map.js";
import * as sync from "./sync.js";
import { getRate } from "./rates.js";
import { computeBalances, computeTransfers, computeCategoryStats } from "./settle.js";
import { NOMINATIM_API } from "./config.js";

// ---------- 常數 ----------
export const STOP_CATS = {
  sight: { label: "景點", emoji: "⛩️", color: "#2EA6FF" },
  food: { label: "餐廳", emoji: "🍜", color: "#FF6B57" },
  shop: { label: "逛街", emoji: "🛍️", color: "#C77DFF" },
  transport: { label: "交通", emoji: "🚉", color: "#3DBE7B" },
  hotel: { label: "住宿", emoji: "🏨", color: "#FFC53D" },
  other: { label: "其他", emoji: "📍", color: "#8B8798" },
};

const EXP_CATS = {
  food: { label: "餐飲", emoji: "🍜", color: "#FF6B57" },
  transport: { label: "交通", emoji: "🚃", color: "#3DBE7B" },
  ticket: { label: "門票", emoji: "🎫", color: "#2EA6FF" },
  shop: { label: "購物", emoji: "🛍️", color: "#C77DFF" },
  hotel: { label: "住宿", emoji: "🏨", color: "#FFC53D" },
  other: { label: "其他", emoji: "📦", color: "#8B8798" },
};

const SYNC_STATUS_TEXT = {
  local: "📴 尚未共享（資料只在這台裝置）",
  connecting: "🔄 連線中…",
  synced: "✅ 已連線，改動會即時同步",
  offline: "⚠️ 離線模式（無法連上雲端，資料保留在本機）",
  error: "❌ 同步異常，稍後會自動重試",
};

const NOTE_TYPES = {
  hotel: {
    label: "飯店", emoji: "🏨",
    fields: [
      { key: "checkIn", label: "入住日", type: "date" },
      { key: "checkOut", label: "退房日", type: "date" },
      { key: "address", label: "地址", type: "text" },
      { key: "code", label: "訂房確認碼", type: "text" },
    ],
  },
  flight: {
    label: "機票", emoji: "✈️",
    fields: [
      { key: "date", label: "日期", type: "date" },
      { key: "flightNo", label: "航班編號", type: "text" },
      { key: "dep", label: "起飛（機場/時間）", type: "text" },
      { key: "arr", label: "抵達（機場/時間）", type: "text" },
      { key: "code", label: "訂位代碼", type: "text" },
    ],
  },
  ticket: {
    label: "票券", emoji: "🎫",
    fields: [
      { key: "useDate", label: "使用日", type: "date" },
      { key: "code", label: "票號/兌換碼", type: "text" },
    ],
  },
  transport: {
    label: "交通", emoji: "🚃",
    fields: [
      { key: "date", label: "日期", type: "date" },
      { key: "route", label: "路線（出發→抵達）", type: "text" },
      { key: "line", label: "班次/車種", type: "text" },
      { key: "code", label: "訂位/票號", type: "text" },
    ],
  },
  memo: { label: "筆記", emoji: "📝", fields: [] },
};

// ---------- 畫面狀態（不需持久化） ----------
let currentView = "itinerary";
let currentDay = 0;
let selectedExpCat = "food";
let liveRate = null;
const expandedNoteIds = new Set();

const $ = (sel) => document.querySelector(sel);

// ---------- 初始化 ----------
mapView.initMap();
bindTopbar();
bindItinerary();
bindExpenses();
bindNotebook();
bindSync();
store.subscribe(render);
render();
refreshRate(false);
const syncReady = sync.initSync(); // 背景連線，不擋首屏
checkInviteLink(syncReady);

// PWA：註冊 service worker（localhost 與 https 才會生效）
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW 註冊失敗", e));
  });
}

// ---------- 匯率 ----------
async function refreshRate(force) {
  const trip = store.getActiveTrip();
  if (!trip) return;
  liveRate = await getRate(trip.localCurrency, trip.homeCurrency, { forceRefresh: force });
  render();
}

function effectiveRate(trip) {
  if (trip.manualRate) return trip.manualRate;
  if (liveRate) return liveRate.rate;
  return 0.2;
}

// ---------- 頂列與分頁 ----------
function bindTopbar() {
  $("#newTripBtn").addEventListener("click", openTripDialog);
  $("#emptyCreateBtn").addEventListener("click", openTripDialog);
  $("#exportBtn").addEventListener("click", () => {
    const trip = store.getActiveTrip();
    if (!trip) return;
    $("#printArea").replaceChildren(buildPrintReport(trip));
    window.print();
  });
  $("#tripSelect").addEventListener("change", (e) => {
    store.setActiveTrip(e.target.value);
    currentDay = 0;
    refreshRate(false);
  });
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      currentView = tab.dataset.view;
      render();
      if (currentView === "itinerary") mapView.refreshMapSize();
    });
  });

  const dialog = $("#tripDialog");
  $("#tripForm").addEventListener("submit", (e) => {
    if (e.submitter && e.submitter.value === "cancel") return;
    const name = $("#tripName").value.trim();
    const startDate = $("#tripStart").value;
    const endDate = $("#tripEnd").value;
    if (!name || !startDate || !endDate) return;
    if (endDate < startDate) {
      e.preventDefault();
      alert("回程日不能早於出發日");
      return;
    }
    store.createTrip({
      name,
      startDate,
      endDate,
      memberNames: $("#tripMembers").value.split(/[,，]/),
    });
    currentDay = 0;
    refreshRate(false);
  });

  function openTripDialog() {
    $("#tripForm").reset();
    dialog.showModal();
  }
}

// ---------- 行程 ----------
function bindItinerary() {
  $("#searchBtn").addEventListener("click", searchPlace);
  $("#placeInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") searchPlace();
  });
  $("#dayStartInput").addEventListener("change", () => {
    store.setDayStart(currentDay, $("#dayStartInput").value || "09:00");
  });
}

// 解析 Google Maps 網址：回傳 { name, lat, lng, short } 或 null（不是地圖網址）
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

  let name = null;
  const placeMatch = url.pathname.match(/\/(?:place|search)\/([^/@]+)/);
  if (placeMatch) {
    name = decodeURIComponent(placeMatch[1].replace(/\+/g, " ")).trim();
    if (/^-?\d+\.?\d*,\s*-?\d+\.?\d*$/.test(name)) name = null; // 名稱其實是座標
  }

  let lat = null, lng = null;
  const full = url.pathname + "?" + url.search;
  const dataMatch = full.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/); // 地標精確座標
  const atMatch = url.pathname.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/); // 地圖中心（次佳）
  const q = url.searchParams.get("q") || url.searchParams.get("query");
  const qCoord = q && q.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
  if (dataMatch) {
    lat = parseFloat(dataMatch[1]);
    lng = parseFloat(dataMatch[2]);
  } else if (qCoord) {
    lat = parseFloat(qCoord[1]);
    lng = parseFloat(qCoord[2]);
  } else if (atMatch) {
    lat = parseFloat(atMatch[1]);
    lng = parseFloat(atMatch[2]);
  }
  if (!name && q && !qCoord) name = q;
  return { name, lat, lng, short: false };
}

async function reverseGeocode(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=zh-TW`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.name || (data.display_name || "").split(",")[0] || null;
  } catch {
    return null;
  }
}

async function addFromGoogleMaps(gm) {
  const resultsEl = $("#searchResults");
  if (gm.short) {
    resultsEl.innerHTML =
      "<li>這是 Google Maps 短網址，瀏覽器無法直接解析 😅<br>" +
      "<span class='sub'>請先在瀏覽器打開它，再複製網址列的完整網址（含地名）貼過來</span></li>";
    resultsEl.classList.remove("hidden");
    return;
  }
  if (gm.lat != null && gm.lng != null) {
    resultsEl.innerHTML = "<li>解析網址中…</li>";
    resultsEl.classList.remove("hidden");
    const name = gm.name || (await reverseGeocode(gm.lat, gm.lng)) || "地圖標記地點";
    store.addStop({ dayIndex: currentDay, name, lat: gm.lat, lng: gm.lng });
    resultsEl.classList.add("hidden");
    $("#placeInput").value = "";
    return;
  }
  if (gm.name) {
    // 網址裡只有名稱沒座標 → 改用名稱搜尋
    $("#placeInput").value = gm.name;
    await searchPlace();
    return;
  }
  resultsEl.innerHTML = "<li>看不懂這個地圖網址，請確認是地點頁面的網址</li>";
  resultsEl.classList.remove("hidden");
}

async function searchPlace() {
  const q = $("#placeInput").value.trim();
  const resultsEl = $("#searchResults");
  if (!q) return;
  const gm = parseGoogleMapsUrl(q);
  if (gm) {
    await addFromGoogleMaps(gm);
    return;
  }
  resultsEl.innerHTML = "<li>搜尋中…</li>";
  resultsEl.classList.remove("hidden");
  try {
    const url = `${NOMINATIM_API}?format=jsonv2&limit=5&accept-language=zh-TW&q=${encodeURIComponent(q)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const places = await res.json();
    if (places.length === 0) {
      resultsEl.innerHTML = "<li>找不到這個地點，換個關鍵字試試</li>";
      return;
    }
    resultsEl.innerHTML = "";
    for (const p of places) {
      const li = document.createElement("li");
      const title = document.createElement("b");
      title.textContent = p.name || p.display_name.split(",")[0];
      const sub = document.createElement("span");
      sub.className = "sub";
      sub.textContent = p.display_name;
      li.append(title, sub);
      li.addEventListener("click", () => {
        store.addStop({
          dayIndex: currentDay,
          name: title.textContent,
          lat: parseFloat(p.lat),
          lng: parseFloat(p.lon),
        });
        resultsEl.classList.add("hidden");
        $("#placeInput").value = "";
      });
      resultsEl.appendChild(li);
    }
  } catch (e) {
    resultsEl.innerHTML = "<li>搜尋失敗（網路或服務暫時異常），稍後再試</li>";
    console.warn(e);
  }
}

// 依出發時間與各站停留分鐘，回傳每站的抵達時間字串
function computeArrivals(trip, dayIndex, stops) {
  const start = store.getDayStart(trip, dayIndex);
  const [h, m] = start.split(":").map(Number);
  let cursor = h * 60 + m;
  return stops.map((s) => {
    const label = formatMinutes(cursor);
    cursor += (s.stayMin || 0) + (s.travelMin || 0);
    return label;
  });
}

function formatMinutes(total) {
  const nextDay = total >= 1440;
  const t = total % 1440;
  const hh = String(Math.floor(t / 60)).padStart(2, "0");
  const mm = String(t % 60).padStart(2, "0");
  return (nextDay ? "翌日" : "") + `${hh}:${mm}`;
}

function renderItinerary(trip) {
  const chips = $("#dayChips");
  chips.innerHTML = "";
  const dayCount = store.tripDayCount(trip);
  if (currentDay >= dayCount) currentDay = dayCount - 1;
  for (let i = 0; i < dayCount; i++) {
    const btn = document.createElement("button");
    btn.className = "dayChip" + (i === currentDay ? " active" : "");
    btn.textContent = `Day ${i + 1} · ${store.tripDayDate(trip, i)}`;
    btn.addEventListener("click", () => {
      currentDay = i;
      render();
    });
    chips.appendChild(btn);
  }

  const dayStartInput = $("#dayStartInput");
  if (document.activeElement !== dayStartInput) {
    dayStartInput.value = store.getDayStart(trip, currentDay);
  }

  const stops = store.dayStops(currentDay);
  const arrivals = computeArrivals(trip, currentDay, stops);
  const list = $("#stopList");
  list.innerHTML = "";
  stops.forEach((stop, i) => {
    list.appendChild(stopCard(stop, i, stops.length, arrivals[i]));
    if (i < stops.length - 1) list.appendChild(travelConnector(stop));
  });
  if (stops.length === 0) {
    const empty = document.createElement("li");
    empty.style.cssText = "color:#8B8798;text-align:center;padding:18px;list-style:none;";
    empty.textContent = "這天還沒有行程，搜尋地點加入吧 🔍";
    list.appendChild(empty);
  }

  mapView.renderDay(stops, STOP_CATS);
}

function stopCard(stop, index, total, arrival) {
  const cat = STOP_CATS[stop.category] || STOP_CATS.other;
  const li = document.createElement("li");
  li.className = "stopCard";
  li.draggable = true;
  li.dataset.stopId = stop.id;

  const handle = document.createElement("span");
  handle.className = "dragHandle";
  handle.textContent = "☰";

  const left = document.createElement("div");
  left.className = "stopLeft";
  const order = document.createElement("span");
  order.className = "stopOrder";
  order.style.background = cat.color;
  order.textContent = index + 1;
  const arrive = document.createElement("span");
  arrive.className = "arriveBadge";
  arrive.textContent = arrival;
  arrive.title = "預計抵達時間（自動推算）";
  left.append(order, arrive);

  const body = document.createElement("div");
  body.className = "stopBody";
  const name = document.createElement("div");
  name.className = "stopName";
  name.textContent = `${cat.emoji} ${stop.name}`;
  name.title = stop.name;
  name.addEventListener("click", () => mapView.panTo(stop.lat, stop.lng));

  const meta = document.createElement("div");
  meta.className = "stopMeta";
  const catSel = document.createElement("select");
  for (const [key, c] of Object.entries(STOP_CATS)) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = `${c.emoji} ${c.label}`;
    catSel.appendChild(opt);
  }
  catSel.value = stop.category;
  catSel.addEventListener("change", () => store.updateStop(stop.id, { category: catSel.value }));

  const stayWrap = document.createElement("span");
  stayWrap.className = "stayWrap";
  const stay = document.createElement("input");
  stay.type = "number";
  stay.min = "0";
  stay.step = "5";
  stay.value = stop.stayMin;
  stay.title = "預計停留（分鐘）";
  stay.addEventListener("change", () => {
    const v = Math.max(0, parseInt(stay.value, 10) || 0);
    store.updateStop(stop.id, { stayMin: v });
  });
  stayWrap.append(document.createTextNode("停留"), stay, document.createTextNode("分"));
  meta.append(catSel, stayWrap);

  const note = document.createElement("input");
  note.className = "stopNote";
  note.placeholder = "備註…";
  note.value = stop.note;
  note.addEventListener("change", () => store.updateStop(stop.id, { note: note.value }));
  body.append(name, meta, note);

  const btns = document.createElement("div");
  btns.className = "stopBtns";
  const up = document.createElement("button");
  up.textContent = "↑";
  up.disabled = index === 0;
  up.addEventListener("click", () => store.moveStop(stop.id, index - 1));
  const down = document.createElement("button");
  down.textContent = "↓";
  down.disabled = index === total - 1;
  down.addEventListener("click", () => store.moveStop(stop.id, index + 1));
  const del = document.createElement("button");
  del.className = "stopDel";
  del.textContent = "✕";
  del.addEventListener("click", () => {
    if (confirm(`刪除「${stop.name}」？`)) store.removeStop(stop.id);
  });
  btns.append(up, down, del);

  li.append(handle, left, body, btns);

  li.addEventListener("dragstart", (e) => {
    li.classList.add("dragging");
    e.dataTransfer.setData("text/plain", stop.id);
    e.dataTransfer.effectAllowed = "move";
  });
  li.addEventListener("dragend", () => li.classList.remove("dragging"));
  li.addEventListener("dragover", (e) => e.preventDefault());
  li.addEventListener("drop", (e) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData("text/plain");
    if (draggedId && draggedId !== stop.id) store.moveStop(draggedId, index);
  });

  return li;
}

// 兩站之間的交通時間（連接線）
function travelConnector(stop) {
  const li = document.createElement("li");
  li.className = "travelConnector";
  const icon = document.createElement("span");
  icon.textContent = "🚗";
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.step = "5";
  input.value = stop.travelMin;
  input.title = "到下一站的交通時間（分鐘）";
  input.addEventListener("change", () => {
    const v = Math.max(0, parseInt(input.value, 10) || 0);
    store.updateStop(stop.id, { travelMin: v });
  });
  li.append(icon, input, document.createTextNode("分鐘車程"));
  return li;
}

// ---------- 分帳 ----------
function bindExpenses() {
  $("#addMemberBtn").addEventListener("click", () => {
    const input = $("#memberInput");
    const result = store.addMember(input.value);
    if (!result.ok) {
      alert(result.error);
      return;
    }
    input.value = "";
  });

  $("#rateRefreshBtn").addEventListener("click", () => {
    store.setManualRate(null);
    refreshRate(true);
  });

  $("#rateInput").addEventListener("change", () => {
    const v = parseFloat($("#rateInput").value);
    store.setManualRate(v > 0 ? v : null);
  });

  $("#addExpenseBtn").addEventListener("click", () => {
    const trip = store.getActiveTrip();
    if (!trip) return;
    const splitIds = Array.from(
      document.querySelectorAll("#expSplit input:checked")
    ).map((c) => c.value);
    const result = store.addExpense({
      desc: $("#expDesc").value,
      amount: parseFloat($("#expAmount").value),
      currency: $("#expCurrency").value,
      category: selectedExpCat,
      payerId: $("#expPayer").value,
      splitIds,
    });
    const msg = $("#expenseMsg");
    if (!result.ok) {
      msg.textContent = result.error;
      return;
    }
    msg.textContent = "";
    $("#expDesc").value = "";
    $("#expAmount").value = "";
  });
}

function renderExpenses(trip) {
  const rate = effectiveRate(trip);
  const nameOf = (id) => (trip.members.find((m) => m.id === id) || { name: "?" }).name;

  // 成員 chips
  const chips = $("#memberChips");
  chips.innerHTML = "";
  for (const m of trip.members) {
    const chip = document.createElement("span");
    chip.className = "memberChip";
    chip.textContent = m.name;
    const x = document.createElement("button");
    x.textContent = "✕";
    x.title = "移除成員";
    x.addEventListener("click", () => {
      const result = store.removeMember(m.id);
      if (!result.ok) alert(result.error);
    });
    chip.appendChild(x);
    chips.appendChild(chip);
  }

  // 匯率列
  document.querySelectorAll(".localCur").forEach((el) => (el.textContent = trip.localCurrency));
  document.querySelectorAll(".homeCur").forEach((el) => (el.textContent = trip.homeCurrency));
  const rateInput = $("#rateInput");
  if (document.activeElement !== rateInput) rateInput.value = rate.toFixed(4);
  const info = $("#rateInfo");
  if (trip.manualRate) {
    info.textContent = "使用手動設定的匯率（按 ↻ 恢復即時匯率）";
  } else if (liveRate) {
    const when = new Date(liveRate.fetchedAt).toLocaleString("zh-TW");
    info.textContent = (liveRate.stale ? "⚠ 離線快取匯率，" : "即時匯率，") + "更新於 " + when;
  } else {
    info.textContent = "⚠ 無法取得即時匯率，使用預設值，建議手動輸入";
  }

  // 支出分類 chips
  const catBox = $("#expCategory");
  catBox.innerHTML = "<label style='flex-shrink:0'>分類：</label>";
  for (const [key, c] of Object.entries(EXP_CATS)) {
    const chip = document.createElement("span");
    chip.className = "catChk" + (selectedExpCat === key ? " selected" : "");
    chip.textContent = `${c.emoji} ${c.label}`;
    chip.addEventListener("click", () => {
      selectedExpCat = key;
      renderExpenses(trip);
    });
    catBox.appendChild(chip);
  }

  // 表單選項
  const payerSel = $("#expPayer");
  const prevPayer = payerSel.value;
  payerSel.innerHTML = "";
  for (const m of trip.members) {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.name;
    payerSel.appendChild(opt);
  }
  if (trip.members.some((m) => m.id === prevPayer)) payerSel.value = prevPayer;

  const curSel = $("#expCurrency");
  const prevCur = curSel.value;
  curSel.innerHTML = "";
  for (const c of [trip.localCurrency, trip.homeCurrency]) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    curSel.appendChild(opt);
  }
  if (prevCur) curSel.value = prevCur;

  const split = $("#expSplit");
  const prevChecked = new Set(
    Array.from(split.querySelectorAll("input:checked")).map((c) => c.value)
  );
  const hadAny = split.querySelectorAll("input").length > 0;
  split.innerHTML = "<label style='flex-shrink:0'>分給：</label>";
  for (const m of trip.members) {
    const label = document.createElement("label");
    label.className = "splitChk";
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.value = m.id;
    chk.checked = hadAny ? prevChecked.has(m.id) : true;
    label.append(chk, document.createTextNode(m.name));
    split.appendChild(label);
  }

  // 統計
  const stats = computeCategoryStats(trip, rate);
  $("#statTotal").innerHTML =
    `NT$${Math.round(stats.total).toLocaleString()} <small>／ 總支出（每人平均 NT$${
      trip.members.length ? Math.round(stats.total / trip.members.length).toLocaleString() : 0
    }）</small>`;
  const bars = $("#statBars");
  bars.innerHTML = "";
  const entries = Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    bars.innerHTML = "<span class='mutedText'>記幾筆支出就會有統計囉</span>";
  }
  for (const [key, amt] of entries) {
    const c = EXP_CATS[key] || EXP_CATS.other;
    const pct = stats.total > 0 ? (amt / stats.total) * 100 : 0;
    const row = document.createElement("div");
    row.className = "statBarRow";
    row.innerHTML =
      `<span>${c.emoji} ${c.label}　NT$${Math.round(amt).toLocaleString()}（${pct.toFixed(0)}%）</span>` +
      `<div class="statBarTrack"><div class="statBarFill" style="width:${pct}%;background:${c.color}"></div></div>`;
    bars.appendChild(row);
  }

  // 支出清單
  const list = $("#expenseList");
  list.innerHTML = "";
  for (const exp of [...trip.expenses].reverse()) {
    const c = EXP_CATS[exp.category] || EXP_CATS.other;
    const li = document.createElement("li");
    const emoji = document.createElement("span");
    emoji.className = "expEmoji";
    emoji.textContent = c.emoji;
    emoji.title = c.label;
    const body = document.createElement("div");
    const title = document.createElement("span");
    title.textContent = exp.desc;
    const who = document.createElement("span");
    who.className = "who";
    who.textContent = `${nameOf(exp.payerId)} 付 · 分給 ${exp.splitIds.map(nameOf).join("、")}`;
    body.append(title, who);
    const amt = document.createElement("span");
    amt.className = "amt";
    amt.textContent = `${exp.currency === "JPY" ? "¥" : "NT$"}${exp.amount.toLocaleString()}`;
    const del = document.createElement("button");
    del.className = "del";
    del.textContent = "✕";
    del.addEventListener("click", () => {
      if (confirm(`刪除「${exp.desc}」？`)) store.removeExpense(exp.id);
    });
    li.append(emoji, body, amt, del);
    list.appendChild(li);
  }
  if (trip.expenses.length === 0) {
    list.innerHTML = "<li style='color:#8B8798'>還沒有支出紀錄</li>";
  }

  // 結算
  const balances = computeBalances(trip, rate);
  const balancesEl = $("#balances");
  balancesEl.innerHTML = "";
  for (const m of trip.members) {
    const row = document.createElement("div");
    row.className = "balanceRow";
    const bal = balances[m.id];
    const cls = bal >= 0.005 ? "pos" : bal <= -0.005 ? "neg" : "";
    const text = bal >= 0.005 ? `應收 NT$${bal.toFixed(0)}` : bal <= -0.005 ? `應付 NT$${(-bal).toFixed(0)}` : "結清 ✓";
    row.innerHTML = `<span>${escapeHtml(m.name)}</span><span class="${cls}">${text}</span>`;
    balancesEl.appendChild(row);
  }

  const transfersEl = $("#transfers");
  transfersEl.innerHTML = "";
  const transfers = computeTransfers(balances);
  if (transfers.length === 0) {
    transfersEl.innerHTML = "<div class='transferRow'>目前不需要任何轉帳 🎉</div>";
  }
  for (const t of transfers) {
    const row = document.createElement("div");
    row.className = "transferRow";
    const text = document.createElement("span");
    text.innerHTML = `${escapeHtml(nameOf(t.fromId))} → ${escapeHtml(nameOf(t.toId))}：<b>NT$${t.amount.toFixed(0)}</b>`;
    const doneBtn = document.createElement("button");
    doneBtn.textContent = "✓ 已還";
    doneBtn.title = "標記這筆已經還了";
    doneBtn.addEventListener("click", () => {
      store.addSettlement({ fromId: t.fromId, toId: t.toId, amount: t.amount });
    });
    row.append(text, doneBtn);
    transfersEl.appendChild(row);
  }

  // 已還款紀錄
  const settledList = $("#settledList");
  settledList.innerHTML = "";
  if (trip.settlements.length === 0) {
    settledList.innerHTML = "<span class='mutedText'>還沒有還款紀錄</span>";
  }
  for (const s of [...trip.settlements].reverse()) {
    const row = document.createElement("div");
    row.className = "settledRow";
    const when = new Date(s.createdAt).toLocaleDateString("zh-TW");
    const text = document.createElement("span");
    text.textContent = `✅ ${nameOf(s.fromId)} 已還 ${nameOf(s.toId)} NT$${s.amount.toFixed(0)}（${when}）`;
    const undo = document.createElement("button");
    undo.textContent = "取消";
    undo.title = "刪除這筆還款紀錄";
    undo.addEventListener("click", () => store.removeSettlement(s.id));
    row.append(text, undo);
    settledList.appendChild(row);
  }
}

// ---------- 共享同步 ----------
function bindSync() {
  const dialog = $("#syncDialog");
  $("#syncBtn").addEventListener("click", () => {
    renderSyncDialog();
    dialog.showModal();
  });
  $("#syncCloseBtn").addEventListener("click", () => dialog.close());

  sync.onStatus((s) => {
    const btn = $("#syncBtn");
    btn.classList.toggle("synced", s === "synced");
    btn.classList.toggle("error", s === "error" || s === "offline");
    $("#syncStatusLine").textContent = SYNC_STATUS_TEXT[s] || s;
  });

  $("#shareBtn").addEventListener("click", async () => {
    const trip = store.getActiveTrip();
    if (!trip) return;
    setSyncMsg("上傳中…", true);
    const result = await sync.shareTrip(trip);
    if (result.ok) {
      setSyncMsg("上傳成功！邀請碼已產生", true);
      renderSyncDialog();
    } else {
      setSyncMsg(result.error, false);
    }
  });

  $("#copyCodeBtn").addEventListener("click", async () => {
    const code = $("#inviteCode").textContent;
    try {
      await navigator.clipboard.writeText(code);
      setSyncMsg("已複製邀請碼", true);
    } catch {
      setSyncMsg("複製失敗，請手動選取", false);
    }
  });

  $("#copyInviteMsgBtn").addEventListener("click", async () => {
    const trip = store.getActiveTrip();
    if (!trip || !trip.cloud) return;
    try {
      await navigator.clipboard.writeText(buildInviteMessage(trip));
      setSyncMsg("已複製邀請訊息，貼給旅伴吧！", true);
    } catch {
      setSyncMsg("複製失敗，請手動選取", false);
    }
  });

  $("#joinBtn").addEventListener("click", async () => {
    const input = $("#joinCodeInput");
    setSyncMsg("加入中…", true);
    const result = await sync.joinTrip(input.value);
    if (result.ok) {
      setSyncMsg(`已加入「${result.tripName}」！`, true);
      input.value = "";
      currentDay = 0;
      renderSyncDialog();
      refreshRate(false);
    } else {
      setSyncMsg(result.error, false);
    }
  });
}

function setSyncMsg(text, ok) {
  const el = $("#syncMsg");
  el.textContent = text;
  el.className = ok ? "ok" : "err";
}

function renderSyncDialog() {
  const trip = store.getActiveTrip();
  const linked = Boolean(trip && trip.cloud);
  $("#shareUnlinked").classList.toggle("hidden", linked || !trip);
  $("#shareLinked").classList.toggle("hidden", !linked);
  if (linked) $("#inviteCode").textContent = trip.cloud.code;
}

function inviteLink(code) {
  return `${location.origin}${location.pathname}?join=${code}`;
}

function buildInviteMessage(trip) {
  const owner = trip.members[0] ? trip.members[0].name : "主揪人";
  return (
    `行程名稱：${trip.name}\n` +
    `行程日期：${trip.startDate.replaceAll("-", "/")} ~ ${trip.endDate.replaceAll("-", "/")}\n` +
    `主揪人 : ${owner}\n\n` +
    `點擊下方連結，接受好友的邀請，一起來編輯 !\n${inviteLink(trip.cloud.code)}`
  );
}

// 從邀請連結（?join=CODE）自動加入旅程
async function checkInviteLink(syncReady) {
  const code = new URLSearchParams(location.search).get("join");
  if (!code) return;
  history.replaceState(null, "", location.pathname + location.hash);
  const dialog = $("#syncDialog");
  renderSyncDialog();
  setSyncMsg("偵測到邀請連結，加入中…", true);
  dialog.showModal();
  await syncReady;
  const result = await sync.joinTrip(code);
  if (result.ok) {
    setSyncMsg(`已加入「${result.tripName}」！`, true);
    currentDay = 0;
    renderSyncDialog();
    refreshRate(false);
  } else {
    setSyncMsg(result.error, false);
  }
}

// ---------- 記事本 ----------
function bindNotebook() {
  document.querySelectorAll(".noteAddBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const note = store.addNote(btn.dataset.type); // 這裡會同步觸發一次 render，當下還不知道要展開
      if (!note) return;
      expandedNoteIds.add(note.id); // 新增的卡片預設展開，方便直接填資料
      const trip = store.getActiveTrip();
      if (trip) renderNotebook(trip); // 補一次渲染讓卡片變展開狀態
    });
  });
}

function toggleNoteExpand(noteId) {
  if (expandedNoteIds.has(noteId)) expandedNoteIds.delete(noteId);
  else expandedNoteIds.add(noteId);
  const trip = store.getActiveTrip();
  if (trip) renderNotebook(trip);
}

function renderNotebook(trip) {
  const list = $("#noteList");
  list.innerHTML = "";
  if (trip.notes.length === 0) {
    list.innerHTML =
      "<div style='color:#8B8798;text-align:center;padding:24px'>把飯店訂房、機票、票券資訊都收進來，旅途中不用翻信箱 📮</div>";
    return;
  }
  for (const type of Object.keys(NOTE_TYPES)) {
    const notes = trip.notes.filter((n) => n.type === type);
    if (notes.length === 0) continue;
    list.appendChild(noteSection(type, notes));
  }
}

function noteSection(type, notes) {
  const t = NOTE_TYPES[type];
  const section = document.createElement("div");
  section.className = "noteSection";
  const h = document.createElement("h4");
  h.className = "noteSectionTitle";
  h.textContent = `${t.emoji} ${t.label}（${notes.length}）`;
  section.appendChild(h);
  for (const note of notes) section.appendChild(noteCard(note));
  return section;
}

function noteCard(note) {
  const t = NOTE_TYPES[note.type] || NOTE_TYPES.memo;
  const expanded = expandedNoteIds.has(note.id);
  const card = document.createElement("div");
  card.className = `noteCard ${note.type}` + (expanded ? " expanded" : "");

  // 卡頭：一開始只顯示這行，點擊展開/收合細項
  const head = document.createElement("div");
  head.className = "noteHead";
  const type = document.createElement("span");
  type.className = "noteType";
  type.textContent = t.emoji;
  const title = document.createElement("span");
  title.className = "noteHeadTitle";
  title.textContent = note.title || `${t.label}未命名`;
  if (!note.title) title.classList.add("placeholder");
  const chevron = document.createElement("span");
  chevron.className = "noteChevron";
  chevron.textContent = expanded ? "▲" : "▼";
  const del = document.createElement("button");
  del.className = "noteDel";
  del.textContent = "✕";
  del.addEventListener("click", (e) => {
    e.stopPropagation();
    if (confirm(`刪除這張${t.label}卡片？`)) store.removeNote(note.id);
  });
  head.append(type, title, chevron, del);
  head.addEventListener("click", () => toggleNoteExpand(note.id));
  card.appendChild(head);

  if (!expanded) return card;

  const details = document.createElement("div");
  details.className = "noteDetails";

  const titleInput = document.createElement("input");
  titleInput.className = "noteTitle";
  titleInput.placeholder = `${t.label}名稱…`;
  titleInput.value = note.title;
  titleInput.addEventListener("change", () => store.updateNote(note.id, { title: titleInput.value }));
  details.appendChild(titleInput);

  if (t.fields.length > 0) {
    const grid = document.createElement("div");
    grid.className = "noteFields";
    for (const f of t.fields) {
      const label = document.createElement("label");
      label.textContent = f.label;
      const input = document.createElement("input");
      input.type = f.type;
      input.value = note.fields[f.key] || "";
      input.addEventListener("change", () =>
        store.updateNote(note.id, { fields: { [f.key]: input.value } })
      );
      label.appendChild(input);
      grid.appendChild(label);
    }
    details.appendChild(grid);
  }

  const body = document.createElement("textarea");
  body.className = "noteBody";
  body.placeholder = "備註、注意事項…";
  body.value = note.body;
  body.addEventListener("change", () => store.updateNote(note.id, { body: body.value }));
  details.appendChild(body);

  // 照片區
  const imgRow = document.createElement("div");
  imgRow.className = "noteImgs";
  for (const img of note.images || []) {
    const wrap = document.createElement("div");
    wrap.className = "noteImgWrap";
    const thumb = document.createElement("img");
    thumb.className = "noteImg";
    thumb.src = img.url;
    thumb.loading = "lazy";
    thumb.addEventListener("click", () => window.open(img.url, "_blank"));
    const rm = document.createElement("button");
    rm.className = "noteImgDel";
    rm.textContent = "✕";
    rm.title = "移除照片";
    rm.addEventListener("click", () => {
      if (!confirm("移除這張照片？")) return;
      sync.deleteNoteImage(img.path);
      store.updateNote(note.id, {
        images: (note.images || []).filter((i) => i.path !== img.path),
      });
    });
    wrap.append(thumb, rm);
    imgRow.appendChild(wrap);
  }

  const addImg = document.createElement("button");
  addImg.className = "noteImgAdd";
  addImg.textContent = "📷 加照片";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.style.display = "none";
  addImg.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    addImg.disabled = true;
    addImg.textContent = "上傳中…";
    try {
      const blob = await compressImage(file);
      const result = await sync.uploadNoteImage(blob);
      if (!result.ok) {
        alert(result.error);
        return;
      }
      store.updateNote(note.id, {
        images: [...(note.images || []), result.image],
      });
    } catch (e) {
      console.warn(e);
      alert("照片處理失敗，換一張試試");
    } finally {
      addImg.disabled = false;
      addImg.textContent = "📷 加照片";
    }
  });
  imgRow.append(addImg, fileInput);
  details.appendChild(imgRow);

  card.appendChild(details);
  return card;
}

// ---------- 匯出 PDF（走瀏覽器列印，手機直接「儲存為 PDF」）----------
function buildPrintReport(trip) {
  const frag = document.createDocumentFragment();

  const header = document.createElement("div");
  header.className = "printHeader";
  const h1 = document.createElement("h1");
  h1.textContent = trip.name;
  const meta = document.createElement("p");
  meta.textContent =
    `${trip.startDate.replaceAll("-", "/")} ~ ${trip.endDate.replaceAll("-", "/")}　` +
    `成員：${trip.members.map((m) => m.name).join("、")}`;
  header.append(h1, meta);
  frag.appendChild(header);

  const dayCount = store.tripDayCount(trip);
  for (let i = 0; i < dayCount; i++) {
    frag.appendChild(buildPrintDay(trip, i));
  }
  frag.appendChild(buildPrintExpenses(trip));
  frag.appendChild(buildPrintNotes(trip));
  return frag;
}

function buildPrintDay(trip, dayIndex) {
  const stops = store.dayStops(dayIndex);
  const arrivals = computeArrivals(trip, dayIndex, stops);
  const day = document.createElement("section");
  day.className = "printDay";
  const h2 = document.createElement("h2");
  h2.textContent = `Day ${dayIndex + 1}・${store.tripDayDate(trip, dayIndex)}（出發 ${store.getDayStart(trip, dayIndex)}）`;
  day.appendChild(h2);

  if (stops.length === 0) {
    const p = document.createElement("p");
    p.className = "mutedText";
    p.textContent = "這天還沒有安排行程";
    day.appendChild(p);
    return day;
  }

  const ol = document.createElement("ol");
  ol.className = "printStopList";
  stops.forEach((s, idx) => {
    const cat = STOP_CATS[s.category] || STOP_CATS.other;
    const li = document.createElement("li");
    const line = document.createElement("div");
    line.className = "printStopLine";
    line.textContent = `${arrivals[idx]}　${cat.emoji} ${s.name}（${cat.label}・停留 ${s.stayMin} 分）`;
    li.appendChild(line);
    if (s.note) {
      const noteLine = document.createElement("div");
      noteLine.className = "printStopNote";
      noteLine.textContent = `備註：${s.note}`;
      li.appendChild(noteLine);
    }
    if (idx < stops.length - 1 && s.travelMin > 0) {
      const travel = document.createElement("div");
      travel.className = "printTravel";
      travel.textContent = `🚗 交通 ${s.travelMin} 分鐘 ↓`;
      li.appendChild(travel);
    }
    ol.appendChild(li);
  });
  day.appendChild(ol);
  return day;
}

function buildPrintExpenses(trip) {
  const rate = effectiveRate(trip);
  const nameOf = (id) => (trip.members.find((m) => m.id === id) || { name: "?" }).name;
  const section = document.createElement("section");
  section.className = "printExpenses";
  section.appendChild(Object.assign(document.createElement("h2"), { textContent: "💰 分帳" }));

  const stats = computeCategoryStats(trip, rate);
  const totalP = document.createElement("p");
  totalP.textContent =
    `總支出：NT$${Math.round(stats.total).toLocaleString()}（每人平均 NT$` +
    `${trip.members.length ? Math.round(stats.total / trip.members.length).toLocaleString() : 0}）`;
  section.appendChild(totalP);

  if (trip.expenses.length > 0) {
    const ul = document.createElement("ul");
    for (const exp of trip.expenses) {
      const c = EXP_CATS[exp.category] || EXP_CATS.other;
      const li = document.createElement("li");
      li.textContent =
        `${c.emoji} ${exp.desc}　${exp.currency === "JPY" ? "¥" : "NT$"}${exp.amount.toLocaleString()}　` +
        `${nameOf(exp.payerId)} 付・分給 ${exp.splitIds.map(nameOf).join("、")}`;
      ul.appendChild(li);
    }
    section.appendChild(ul);
  }

  section.appendChild(Object.assign(document.createElement("h3"), { textContent: "結算" }));
  const balances = computeBalances(trip, rate);
  const transfers = computeTransfers(balances);
  if (transfers.length === 0) {
    section.appendChild(
      Object.assign(document.createElement("p"), { className: "mutedText", textContent: "目前不需要任何轉帳" })
    );
  } else {
    const ul = document.createElement("ul");
    for (const t of transfers) {
      const li = document.createElement("li");
      li.textContent = `${nameOf(t.fromId)} → ${nameOf(t.toId)}：NT$${t.amount.toFixed(0)}`;
      ul.appendChild(li);
    }
    section.appendChild(ul);
  }
  return section;
}

function buildPrintNotes(trip) {
  const section = document.createElement("section");
  section.className = "printNotes";
  section.appendChild(Object.assign(document.createElement("h2"), { textContent: "📔 資訊" }));

  if (trip.notes.length === 0) {
    section.appendChild(
      Object.assign(document.createElement("p"), { className: "mutedText", textContent: "還沒有資訊卡片" })
    );
    return section;
  }

  for (const type of Object.keys(NOTE_TYPES)) {
    const notes = trip.notes.filter((n) => n.type === type);
    if (notes.length === 0) continue;
    const t = NOTE_TYPES[type];
    section.appendChild(
      Object.assign(document.createElement("h3"), { textContent: `${t.emoji} ${t.label}` })
    );
    for (const note of notes) {
      const card = document.createElement("div");
      card.className = "printNoteCard";
      card.appendChild(
        Object.assign(document.createElement("div"), {
          className: "printNoteTitle",
          textContent: note.title || `（未命名${t.label}）`,
        })
      );
      const fieldParts = t.fields
        .map((f) => (note.fields[f.key] ? `${f.label}：${note.fields[f.key]}` : null))
        .filter(Boolean);
      if (fieldParts.length > 0) {
        card.appendChild(
          Object.assign(document.createElement("div"), {
            className: "printNoteFields",
            textContent: fieldParts.join("　"),
          })
        );
      }
      if (note.body) {
        card.appendChild(
          Object.assign(document.createElement("div"), { className: "printNoteBody", textContent: note.body })
        );
      }
      section.appendChild(card);
    }
  }
  return section;
}

// 客戶端壓縮：長邊縮到 1280px、JPEG 品質 0.8，避免流量與空間爆炸
function compressImage(file, maxDim = 1280, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      reject(new Error("圖片載入失敗"));
    };
    img.src = objUrl;
  });
}

// ---------- 總渲染 ----------
function render() {
  const state = store.getState();
  const trip = store.getActiveTrip();

  const sel = $("#tripSelect");
  sel.innerHTML = "";
  for (const t of state.trips) {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.name;
    sel.appendChild(opt);
  }
  if (trip) sel.value = trip.id;

  const hasTrip = Boolean(trip);
  $("#emptyState").classList.toggle("hidden", hasTrip);
  $("#itineraryView").classList.toggle("hidden", !hasTrip || currentView !== "itinerary");
  $("#expensesView").classList.toggle("hidden", !hasTrip || currentView !== "expenses");
  $("#notebookView").classList.toggle("hidden", !hasTrip || currentView !== "notebook");
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === currentView);
  });

  if (!trip) return;
  if (currentView === "itinerary") {
    renderItinerary(trip);
    // 地圖容器可能剛從隱藏變可見，Leaflet 需要重算尺寸才會補滿 tiles
    requestAnimationFrame(() => mapView.refreshMapSize());
  } else if (currentView === "expenses") {
    renderExpenses(trip);
  } else {
    renderNotebook(trip);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
