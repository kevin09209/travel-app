// 資料層：單一 state、CRUD、localStorage 持久化、pub/sub。
// 結構刻意設計成之後可以換成 Supabase adapter（trips/stops/expenses/notes 各自成表）。
import { DEFAULT_HOME_CURRENCY, DEFAULT_LOCAL_CURRENCY } from "./config.js";

const STORAGE_KEY = "travel-app:v1";

// 打包清單預設項目（category 對應 app.js 的 PACKING_CATS key）
// 注意：這個常數必須定義在 `let state = load()` 之前——load() 會在模組載入當下就
// 同步跑到 normalizeTrip() → defaultPackingItems()，晚宣告會撞 TDZ ReferenceError。
const DEFAULT_PACKING = {
  docs: ["護照", "電子簽證", "信用卡", "外幣", "國際駕照", "居留證", "錢包/鑰匙"],
  checked: ["衣服", "內衣褲", "泳衣泳褲", "鞋子"],
  carry: ["手機", "行動電源", "手機充電器", "萬用插頭", "自拍棒", "ESIM", "耳機", "iPad"],
  toiletries: [
    "洗面乳", "牙刷牙膏", "毛巾", "保養品", "隱形眼鏡/眼鏡", "防曬/防蚊液",
    "衛生紙/濕紙巾", "衛生棉", "隨身藥品", "口罩", "刮鬍刀",
  ],
  other: ["保溫瓶", "筆", "行李秤", "塑膠袋", "雨傘"],
};

function defaultPackingItems() {
  const items = [];
  for (const [category, names] of Object.entries(DEFAULT_PACKING)) {
    for (const name of names) {
      items.push({ id: uid(), name, category, checked: false, createdAt: new Date().toISOString() });
    }
  }
  return items;
}

let state = load();
const listeners = new Set();

// 雲端同步掛鉤：persist 時通知 sync 層；套用遠端資料時抑制回推避免迴圈
let syncHandler = null;
let suppressSync = false;

export function setSyncHandler(fn) {
  syncHandler = fn;
}

function load() {
  let parsed = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) parsed = JSON.parse(raw);
  } catch (e) {
    console.warn("讀取本地資料失敗，使用空狀態", e);
  }
  if (!parsed || !Array.isArray(parsed.trips)) {
    parsed = { version: 1, trips: [], activeTripId: null };
  }
  parsed.trips.forEach(normalizeTrip);
  return parsed;
}

// 舊資料補上新版欄位，避免升級後壞檔
function normalizeTrip(trip) {
  if (!Array.isArray(trip.settlements)) trip.settlements = [];
  if (!Array.isArray(trip.notes)) trip.notes = [];
  if (!Array.isArray(trip.packing)) trip.packing = [];
  // 舊旅程第一次看到打包清單功能時，若還沒動過（空清單）就補上預設項目；
  // 已加過自己項目的不動，且只補這一次，避免使用者清空後又被重新塞回來
  if (!trip.packingSeeded) {
    if (trip.packing.length === 0) trip.packing = defaultPackingItems();
    trip.packingSeeded = true;
  }
  if (!trip.dayStarts || typeof trip.dayStarts !== "object") trip.dayStarts = {};
  trip.stops.forEach((s) => {
    if (!s.category) s.category = "sight";
    if (typeof s.stayMin !== "number") s.stayMin = 60;
    if (typeof s.travelMin !== "number") s.travelMin = 0;
    if (!Array.isArray(s.memberIds)) s.memberIds = []; // 同行旅伴；空＝全員一起
  });
  trip.expenses.forEach((e) => {
    if (!e.category) e.category = "other";
  });
  trip.notes.forEach((n) => {
    if (!Array.isArray(n.images)) n.images = [];
  });
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  listeners.forEach((fn) => fn(state));
  if (syncHandler && !suppressSync) syncHandler(getActiveTrip());
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getState() {
  return state;
}

export function getActiveTrip() {
  return state.trips.find((t) => t.id === state.activeTripId) || null;
}

function uid() {
  return crypto.randomUUID();
}

// ---------- 旅程 ----------
export function createTrip({ name, startDate, endDate, memberNames }) {
  const members = (memberNames || [])
    .map((n) => n.trim())
    .filter(Boolean)
    .map((n) => ({ id: uid(), name: n }));
  if (members.length === 0) members.push({ id: uid(), name: "我" });

  const trip = {
    id: uid(),
    name,
    startDate,
    endDate,
    homeCurrency: DEFAULT_HOME_CURRENCY,
    localCurrency: DEFAULT_LOCAL_CURRENCY,
    manualRate: null,
    members,
    stops: [],
    expenses: [],
    settlements: [], // 已還款紀錄 { id, fromId, toId, amount(home幣), createdAt }
    notes: [],       // 記事本卡片
    packing: defaultPackingItems(), // 打包清單 { id, name, category, checked, createdAt }
    packingSeeded: true,
    dayStarts: {},   // { [dayIndex]: "HH:MM" } 每日出發時間
  };
  state.trips.push(trip);
  state.activeTripId = trip.id;
  persist();
  return trip;
}

export function setActiveTrip(tripId) {
  if (state.trips.some((t) => t.id === tripId)) {
    state.activeTripId = tripId;
    persist();
  }
}

export function tripDayCount(trip) {
  const start = new Date(trip.startDate + "T00:00:00");
  const end = new Date(trip.endDate + "T00:00:00");
  const days = Math.round((end - start) / 86400000) + 1;
  return Math.max(1, days);
}

export function tripDayDate(trip, dayIndex) {
  const d = new Date(trip.startDate + "T00:00:00");
  d.setDate(d.getDate() + dayIndex);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function setManualRate(rate) {
  const trip = getActiveTrip();
  if (!trip) return;
  trip.manualRate = rate;
  persist();
}

export function setDayStart(dayIndex, time) {
  const trip = getActiveTrip();
  if (!trip) return;
  trip.dayStarts[dayIndex] = time;
  persist();
}

export function getDayStart(trip, dayIndex) {
  return trip.dayStarts[dayIndex] || "09:00";
}

// ---------- 行程景點 ----------
export function addStop({ dayIndex, name, lat, lng }) {
  const trip = getActiveTrip();
  if (!trip) return null;
  const sameDay = trip.stops.filter((s) => s.dayIndex === dayIndex);
  const stop = {
    id: uid(),
    dayIndex,
    order: sameDay.length,
    name,
    lat,
    lng,
    category: "sight",
    stayMin: 60,
    travelMin: 0,
    memberIds: [], // 同行旅伴；空＝全員一起
    note: "",
  };
  trip.stops.push(stop);
  persist();
  return stop;
}

export function updateStop(stopId, patch) {
  const trip = getActiveTrip();
  if (!trip) return;
  const stop = trip.stops.find((s) => s.id === stopId);
  if (!stop) return;
  Object.assign(stop, patch);
  persist();
}

// 切換某景點的同行旅伴（有就移除、沒有就加入）
export function toggleStopMember(stopId, memberId) {
  const trip = getActiveTrip();
  if (!trip) return;
  const stop = trip.stops.find((s) => s.id === stopId);
  if (!stop) return;
  if (!Array.isArray(stop.memberIds)) stop.memberIds = [];
  if (stop.memberIds.includes(memberId)) {
    stop.memberIds = stop.memberIds.filter((id) => id !== memberId);
  } else {
    stop.memberIds.push(memberId);
  }
  persist();
}

export function removeStop(stopId) {
  const trip = getActiveTrip();
  if (!trip) return;
  const stop = trip.stops.find((s) => s.id === stopId);
  if (!stop) return;
  trip.stops = trip.stops.filter((s) => s.id !== stopId);
  reindexDay(trip, stop.dayIndex);
  persist();
}

export function dayStops(dayIndex) {
  const trip = getActiveTrip();
  if (!trip) return [];
  return trip.stops
    .filter((s) => s.dayIndex === dayIndex)
    .sort((a, b) => a.order - b.order);
}

export function moveStop(stopId, targetIndex) {
  const trip = getActiveTrip();
  if (!trip) return;
  const stop = trip.stops.find((s) => s.id === stopId);
  if (!stop) return;
  const list = dayStops(stop.dayIndex).filter((s) => s.id !== stopId);
  const clamped = Math.max(0, Math.min(targetIndex, list.length));
  list.splice(clamped, 0, stop);
  list.forEach((s, i) => (s.order = i));
  persist();
}

function reindexDay(trip, dayIndex) {
  trip.stops
    .filter((s) => s.dayIndex === dayIndex)
    .sort((a, b) => a.order - b.order)
    .forEach((s, i) => (s.order = i));
}

// ---------- 成員 ----------
export function addMember(name) {
  const trip = getActiveTrip();
  if (!trip) return { ok: false, error: "沒有旅程" };
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "名字不能是空的" };
  if (trip.members.some((m) => m.name === trimmed)) {
    return { ok: false, error: "已經有同名成員了" };
  }
  trip.members.push({ id: uid(), name: trimmed });
  persist();
  return { ok: true };
}

export function removeMember(memberId) {
  const trip = getActiveTrip();
  if (!trip) return { ok: false, error: "沒有旅程" };
  const used =
    trip.expenses.some(
      (e) => e.payerId === memberId || e.splitIds.includes(memberId)
    ) ||
    trip.settlements.some((s) => s.fromId === memberId || s.toId === memberId);
  if (used) {
    return { ok: false, error: "這位成員已有分帳／還款紀錄，請先刪除相關紀錄" };
  }
  if (trip.members.length <= 1) {
    return { ok: false, error: "至少要留一位成員" };
  }
  trip.members = trip.members.filter((m) => m.id !== memberId);
  persist();
  return { ok: true };
}

// ---------- 支出 ----------
export function addExpense({ desc, amount, currency, category, payerId, splitIds }) {
  const trip = getActiveTrip();
  if (!trip) return { ok: false, error: "沒有旅程" };
  if (!desc.trim()) return { ok: false, error: "請填項目名稱" };
  if (!(amount > 0)) return { ok: false, error: "金額要大於 0" };
  if (!trip.members.some((m) => m.id === payerId)) {
    return { ok: false, error: "請選擇付款人" };
  }
  if (!splitIds || splitIds.length === 0) {
    return { ok: false, error: "至少要有一個人分攤" };
  }
  trip.expenses.push({
    id: uid(),
    desc: desc.trim(),
    amount,
    currency,
    category: category || "other",
    payerId,
    splitIds: [...splitIds],
    createdAt: new Date().toISOString(),
  });
  persist();
  return { ok: true };
}

export function removeExpense(expenseId) {
  const trip = getActiveTrip();
  if (!trip) return;
  trip.expenses = trip.expenses.filter((e) => e.id !== expenseId);
  persist();
}

// ---------- 還款 ----------
export function addSettlement({ fromId, toId, amount }) {
  const trip = getActiveTrip();
  if (!trip) return;
  trip.settlements.push({
    id: uid(),
    fromId,
    toId,
    amount,
    createdAt: new Date().toISOString(),
  });
  persist();
}

export function removeSettlement(settlementId) {
  const trip = getActiveTrip();
  if (!trip) return;
  trip.settlements = trip.settlements.filter((s) => s.id !== settlementId);
  persist();
}

// ---------- 雲端同步 ----------
// 去掉本機專用的 cloud 欄位（雲端 jsonb 只存旅程內容本體）
export function stripCloud(trip) {
  const { cloud, ...rest } = trip;
  return rest;
}

export function linkTripCloud(tripId, cloud) {
  const trip = state.trips.find((t) => t.id === tripId);
  if (!trip) return;
  trip.cloud = cloud;
  suppressSync = true;
  persist();
  suppressSync = false;
}

// 套用遠端版本（不回推雲端）。內容相同時直接跳過。
export function applyRemoteTrip(cloudId, data) {
  const trip = state.trips.find((t) => t.cloud && t.cloud.id === cloudId);
  if (!trip) return;
  if (JSON.stringify(stripCloud(trip)) === JSON.stringify(data)) return;
  const cloud = trip.cloud;
  const idx = state.trips.indexOf(trip);
  const merged = { ...data, cloud };
  normalizeTrip(merged);
  state.trips[idx] = merged;
  if (state.activeTripId === trip.id) state.activeTripId = merged.id;
  suppressSync = true;
  persist();
  suppressSync = false;
}

// 用邀請碼加入的旅程：整份寫進本地並設為使用中
export function importCloudTrip(row) {
  const tripObj = { ...row.data, cloud: { id: row.id, code: row.invite_code } };
  normalizeTrip(tripObj);
  const existing = state.trips.find((t) => t.cloud && t.cloud.id === row.id);
  if (existing) {
    state.trips[state.trips.indexOf(existing)] = tripObj;
  } else {
    state.trips.push(tripObj);
  }
  state.activeTripId = tripObj.id;
  suppressSync = true;
  persist();
  suppressSync = false;
}

// ---------- 記事本 ----------
export function addNote(type) {
  const trip = getActiveTrip();
  if (!trip) return null;
  const note = {
    id: uid(),
    type, // hotel | flight | ticket | transport | memo
    title: "",
    fields: {}, // 依類型的欄位（入住日、航班、確認碼…）
    body: "",
    images: [], // { path, url } 存於 Supabase Storage
    createdAt: new Date().toISOString(),
  };
  trip.notes.unshift(note);
  persist();
  return note;
}

export function updateNote(noteId, patch) {
  const trip = getActiveTrip();
  if (!trip) return;
  const note = trip.notes.find((n) => n.id === noteId);
  if (!note) return;
  if (patch.fields) {
    note.fields = { ...note.fields, ...patch.fields };
    delete patch.fields;
  }
  Object.assign(note, patch);
  persist();
}

export function removeNote(noteId) {
  const trip = getActiveTrip();
  if (!trip) return;
  trip.notes = trip.notes.filter((n) => n.id !== noteId);
  persist();
}

// ---------- 打包清單 ----------
export function addPackingItem({ name, category }) {
  const trip = getActiveTrip();
  if (!trip) return { ok: false, error: "沒有旅程" };
  const trimmed = (name || "").trim();
  if (!trimmed) return { ok: false, error: "請輸入項目名稱" };
  trip.packing.push({
    id: uid(),
    name: trimmed,
    category: category || "other",
    checked: false,
    createdAt: new Date().toISOString(),
  });
  persist();
  return { ok: true };
}

export function updatePackingItem(itemId, patch) {
  const trip = getActiveTrip();
  if (!trip) return;
  const item = trip.packing.find((p) => p.id === itemId);
  if (!item) return;
  Object.assign(item, patch);
  persist();
}

export function removePackingItem(itemId) {
  const trip = getActiveTrip();
  if (!trip) return;
  trip.packing = trip.packing.filter((p) => p.id !== itemId);
  persist();
}
