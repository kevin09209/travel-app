// 相容層：保留既有 store API，補上每個景點與分組地點的備案資料與操作。
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

function ensureBackups(target, fallbackCategory = "sight") {
  if (!target) return [];
  if (!Array.isArray(target.backups)) target.backups = [];
  target.backups = target.backups
    .map((backup) => normalizeBackup(backup, fallbackCategory))
    .filter((backup) => backup.name);
  return target.backups;
}

function ensureStopBackups(stop) {
  if (!stop) return [];
  const backups = ensureBackups(stop, stop.category);
  if (Array.isArray(stop.groups)) {
    stop.groups.forEach((group) => ensureBackups(group, stop.category));
  }
  return backups;
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

function activeGroup(stopId, groupId) {
  const stop = activeStop(stopId);
  if (!stop) return { stop: null, group: null };
  const group = (stop.groups || []).find((item) => item.id === groupId) || null;
  if (group) ensureBackups(group, stop.category);
  return { stop, group };
}

function samePlace(place, name, lat, lng) {
  return place.name === name && place.lat === lat && place.lng === lng;
}

function addBackup(target, fallbackCategory, { name, lat, lng, category, note } = {}) {
  if (!target) return { ok: false, error: "找不到這個行程" };
  const trimmed = String(name || "").trim();
  if (!trimmed) return { ok: false, error: "沒有地點名稱" };

  const normalizedLat = normalizeCoordinate(lat);
  const normalizedLng = normalizeCoordinate(lng);
  const backups = ensureBackups(target, fallbackCategory);
  if (samePlace(target, trimmed, normalizedLat, normalizedLng)) {
    return { ok: false, error: "這就是目前的主行程" };
  }
  if (backups.some((backup) => samePlace(backup, trimmed, normalizedLat, normalizedLng))) {
    return { ok: false, error: "這個地方已經是備案了" };
  }

  const backup = normalizeBackup(
    {
      id: crypto.randomUUID(),
      name: trimmed,
      category: category || fallbackCategory,
      lat: normalizedLat,
      lng: normalizedLng,
      note,
      createdAt: new Date().toISOString(),
    },
    fallbackCategory
  );
  return { ok: true, backup, backups: [...backups, backup] };
}

// 模組載入時先補齊本機舊旅程；不主動 persist，避免只開 App 就觸發雲端覆寫。
const initialState = core.getState();
if (initialState && Array.isArray(initialState.trips)) {
  initialState.trips.forEach(ensureTripBackups);
}

export function addStop(args) {
  const stop = core.addStop(args);
  if (stop && !Array.isArray(stop.backups)) {
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

export function convertStopToGroups(stopId) {
  const stop = activeStop(stopId);
  if (!stop) return null;
  const existingBackups = [...ensureBackups(stop, stop.category)];
  const newId = core.convertStopToGroups(stopId);
  if (!newId) return null;

  const firstGroup = stop.groups && stop.groups[0];
  if (firstGroup) {
    core.updateStopGroup(stopId, firstGroup.id, { backups: existingBackups });
  }
  core.updateStop(stopId, { backups: [] });
  return newId;
}

export function addStopGroup(stopId) {
  const groupId = core.addStopGroup(stopId);
  if (groupId) core.updateStopGroup(stopId, groupId, { backups: [] });
  return groupId;
}

export function removeStopGroup(stopId, groupId) {
  const stop = activeStop(stopId);
  if (!stop) return;
  const remaining = (stop.groups || []).filter((group) => group.id !== groupId);
  const lastBackups = remaining.length === 1 ? [...ensureBackups(remaining[0], stop.category)] : null;
  core.removeStopGroup(stopId, groupId);
  const updated = activeStop(stopId);
  if (updated && (!updated.groups || updated.groups.length === 0) && lastBackups) {
    core.updateStop(stopId, { backups: lastBackups });
  }
}

export function addStopBackup(stopId, values = {}) {
  const stop = activeStop(stopId);
  const result = addBackup(stop, stop && stop.category, values);
  if (!result.ok) return result;
  core.updateStop(stopId, { backups: result.backups });
  return { ok: true, backup: result.backup };
}

export function removeStopBackup(stopId, backupId) {
  const stop = activeStop(stopId);
  if (!stop) return false;
  const backups = ensureBackups(stop, stop.category);
  const next = backups.filter((backup) => backup.id !== backupId);
  if (next.length === backups.length) return false;
  core.updateStop(stopId, { backups: next });
  return true;
}

// 只互換地點本身；順序、抵達時間、停留與車程設定都留在原行程卡上。
export function swapStopBackup(stopId, backupId) {
  const stop = activeStop(stopId);
  if (!stop) return false;
  const backups = ensureBackups(stop, stop.category);
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

export function addStopGroupBackup(stopId, groupId, values = {}) {
  const { stop, group } = activeGroup(stopId, groupId);
  const result = addBackup(group, stop && stop.category, values);
  if (!result.ok) return result;
  core.updateStopGroup(stopId, groupId, { backups: result.backups });
  return { ok: true, backup: result.backup };
}

export function removeStopGroupBackup(stopId, groupId, backupId) {
  const { stop, group } = activeGroup(stopId, groupId);
  if (!stop || !group) return false;
  const backups = ensureBackups(group, stop.category);
  const next = backups.filter((backup) => backup.id !== backupId);
  if (next.length === backups.length) return false;
  core.updateStopGroup(stopId, groupId, { backups: next });
  return true;
}

// 分組備案只互換該組的地點與備註；同行成員及整個時段的時間設定維持不變。
export function swapStopGroupBackup(stopId, groupId, backupId) {
  const { stop, group } = activeGroup(stopId, groupId);
  if (!stop || !group) return false;
  const backups = ensureBackups(group, stop.category);
  const selected = backups.find((backup) => backup.id === backupId);
  if (!selected) return false;

  const previousMain = {
    name: group.name,
    category: stop.category || "sight",
    lat: normalizeCoordinate(group.lat),
    lng: normalizeCoordinate(group.lng),
    note: typeof group.note === "string" ? group.note : "",
  };
  const nextBackups = backups
    .map((backup) =>
      backup.id === backupId
        ? previousMain.name
          ? { ...backup, ...previousMain }
          : null
        : backup
    )
    .filter(Boolean);

  core.updateStopGroup(stopId, groupId, {
    name: selected.name,
    lat: normalizeCoordinate(selected.lat),
    lng: normalizeCoordinate(selected.lng),
    note: typeof selected.note === "string" ? selected.note : "",
    backups: nextBackups,
  });
  return true;
}
