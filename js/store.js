// 相容層：保留既有 store API，補上每個景點的備案資料與操作。
import * as core from "./store-core.js";
export * from "./store-core.js";

function normalizeCoordinate(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeBackup(backup, fallbackCategory = "sight") {
  return {
    ...backup,
    id: backup && backup.id ? backup.id : crypto.randomUUID(),
    name: String((backup && backup.name) || "").trim(),
    category: (backup && backup.category) || fallbackCategory || "sight",
    lat: normalizeCoordinate(backup && backup.lat),
    lng: normalizeCoordinate(backup && backup.lng),
    note: typeof (backup && backup.note) === "string" ? backup.note : "",
    createdAt: (backup && backup.createdAt) || new Date().toISOString(),
  };
}

function ensureStopBackups(stop) {
  if (!stop) return [];
  if (!Array.isArray(stop.backups)) stop.backups = [];
  stop.backups = stop.backups
    .map((backup) => normalizeBackup(backup, stop.category))
    .filter((backup) => backup.name);
  return stop.backups;
}

function ensureTripBackups(trip) {
  if (!trip || !Array.isArray(trip.stops)) return trip;
  trip.stops.forEach(ensureStopBackups);
  return trip;
}

function activeStop(stopId) {
  const trip = core.getActiveTrip();
  if (!trip) return null;
  ensureTripBackups(trip);
  return trip.stops.find((stop) => stop.id === stopId) || null;
}

// 模組載入時先補齊本機舊旅程；不主動 persist，避免只開 App 就觸發雲端覆寫。
const initialState = core.getState();
if (initialState && Array.isArray(initialState.trips)) {
  initialState.trips.forEach(ensureTripBackups);
}

export function addStop(args) {
  const stop = core.addStop(args);
  if (stop && !Array.isArray(stop.backups)) {
    // 核心 addStop 先完成既有 persist；再補欄位，確保新景點資料本身也有 backups。
    core.updateStop(stop.id, { backups: [] });
  }
  return stop;
}

export function setActiveTrip(tripId) {
  const result = core.setActiveTrip(tripId);
  ensureTripBackups(core.getActiveTrip());
  return result;
}

export function applyRemoteTrip(cloudId, data) {
  ensureTripBackups(data);
  return core.applyRemoteTrip(cloudId, data);
}

export function importCloudTrip(row) {
  if (row && row.data) ensureTripBackups(row.data);
  return core.importCloudTrip(row);
}

export function addStopBackup(stopId, { name, lat, lng, category, note } = {}) {
  const stop = activeStop(stopId);
  if (!stop) return { ok: false, error: "找不到這個行程" };

  const trimmed = String(name || "").trim();
  if (!trimmed) return { ok: false, error: "沒有地點名稱" };

  const normalizedLat = normalizeCoordinate(lat);
  const normalizedLng = normalizeCoordinate(lng);
  const backups = ensureStopBackups(stop);
  const samePlace = (place) =>
    place.name === trimmed && place.lat === normalizedLat && place.lng === normalizedLng;

  if (samePlace(stop)) return { ok: false, error: "這就是目前的主行程" };
  if (backups.some(samePlace)) return { ok: false, error: "這個地方已經是備案了" };

  const backup = normalizeBackup(
    {
      id: crypto.randomUUID(),
      name: trimmed,
      category: category || stop.category,
      lat: normalizedLat,
      lng: normalizedLng,
      note,
      createdAt: new Date().toISOString(),
    },
    stop.category
  );
  core.updateStop(stopId, { backups: [...backups, backup] });
  return { ok: true, backup };
}

export function removeStopBackup(stopId, backupId) {
  const stop = activeStop(stopId);
  if (!stop) return false;
  const backups = ensureStopBackups(stop);
  const next = backups.filter((backup) => backup.id !== backupId);
  if (next.length === backups.length) return false;
  core.updateStop(stopId, { backups: next });
  return true;
}

// 只互換地點本身；順序、抵達時間、停留與車程設定都留在原行程卡上。
export function swapStopBackup(stopId, backupId) {
  const stop = activeStop(stopId);
  if (!stop) return false;
  const backups = ensureStopBackups(stop);
  const selected = backups.find((backup) => backup.id === backupId);
  if (!selected) return false;

  const previousMain = {
    name: stop.name,
    category: stop.category || "sight",
    lat: normalizeCoordinate(stop.lat),
    lng: normalizeCoordinate(stop.lng),
    note: typeof stop.note === "string" ? stop.note : "",
  };
  const nextBackups = backups.map((backup) =>
    backup.id === backupId ? { ...backup, ...previousMain } : backup
  );

  core.updateStop(stopId, {
    name: selected.name,
    category: selected.category || "sight",
    lat: normalizeCoordinate(selected.lat),
    lng: normalizeCoordinate(selected.lng),
    note: typeof selected.note === "string" ? selected.note : "",
    backups: nextBackups,
  });
  return true;
}
