// 雲端同步層：Supabase 匿名登入 + 文件式旅程同步 + Realtime 訂閱。
// 策略：整份旅程存一筆 JSONB，last-write-wins；只同步「目前開啟」的旅程。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";
import * as store from "./store.js";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 去掉易混淆字元
const PUSH_DEBOUNCE_MS = 600;
const RETRY_DELAYS_MS = [3000, 10000, 30000, 60000]; // 上傳失敗的重試間隔（逐次拉長）
const PENDING_KEY = "travel-app-sync-pending"; // 尚未成功上傳的雲端旅程 id，重開 App 也記得

let client = null;
let ready = false; // 匿名登入完成
let connecting = null;
let channel = null;
let watchedCloudId = null;
let sharing = false;
const pushTimers = new Map(); // cloudId → 防抖計時器（各旅程分開，切換旅程不會吃掉上一筆）
const pushing = new Set(); // 上傳中的 cloudId
const editSeq = new Map(); // cloudId → 修改次數，用來判斷上傳期間有沒有新修改
const pending = new Set(loadPending());
let retryTimer = null;
let retryCount = 0;
let status = "local"; // local | connecting | synced | offline | error
let statusCb = () => {};

export function onStatus(cb) {
  statusCb = cb;
  statusCb(status);
}

function setStatus(s) {
  if (status !== s) {
    status = s;
    statusCb(s);
  }
}

export function getStatus() {
  return status;
}

export async function initSync() {
  client = createClient(SUPABASE_URL, SUPABASE_KEY);
  // 先掛上資料層掛鉤：就算還沒連上（離線開 App），改動也會記成「待上傳」，連上後補傳
  store.setSyncHandler((trip) => {
    if (trip && trip.cloud) markDirty(trip.cloud.id);
  });
  store.subscribe(() => {
    if (ensureWatching()) pullActive(); // 切換到另一個共享旅程時順便拉最新版
  });
  window.addEventListener("online", () => reconnect());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") reconnect();
  });
  await connect();
}

// 匿名登入；失敗就維持離線，等 online / 回到前景時再試
async function connect() {
  if (ready) return true;
  if (connecting) return connecting;
  connecting = (async () => {
    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) {
        const { error } = await client.auth.signInAnonymously();
        if (error) throw error;
      }
      ready = true;
    } catch (e) {
      console.warn("匿名登入失敗，暫時離線模式", e);
      setStatus("offline");
      return false;
    } finally {
      connecting = null;
    }
    ensureWatching(true);
    await flushPending(); // 先補傳離線時的修改，再拉雲端版本
    await pullActive();
    return true;
  })();
  return connecting;
}

// 手機切回前景或網路恢復：背景時 Realtime 可能斷線漏接，重新訂閱並補拉
async function reconnect() {
  if (!client) return;
  if (!ready) {
    await connect();
    return;
  }
  ensureWatching(true);
  await flushPending();
  await pullActive();
}

async function currentUid() {
  const { data: { user } } = await client.auth.getUser();
  return user ? user.id : null;
}

function genCode() {
  let code = "";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return code;
}

// ---------- 分享／加入 ----------
export async function shareTrip(trip) {
  if (!(await ensureReady())) return { ok: false, error: "無法連上雲端，請檢查網路後重試" };
  if (sharing) return { ok: false, error: "上傳中，請稍候" };
  if (trip.cloud) return { ok: true, code: trip.cloud.code };
  sharing = true;
  try {
    return await insertTrip(trip);
  } finally {
    sharing = false;
  }
}

async function insertTrip(trip) {
  const uid = await currentUid();
  if (!uid) return { ok: false, error: "匿名登入失敗，請檢查網路後重試" };
  const code = genCode();
  const { data, error } = await client
    .from("trips")
    .insert({ invite_code: code, member_uids: [uid], data: store.stripCloud(trip) })
    .select()
    .single();
  if (error) {
    console.warn("分享失敗", error);
    return { ok: false, error: "上傳失敗：" + error.message };
  }
  store.linkTripCloud(trip.id, { id: data.id, code: data.invite_code });
  ensureWatching();
  setStatus("synced");
  return { ok: true, code: data.invite_code };
}

export async function joinTrip(code) {
  if (!(await ensureReady())) return { ok: false, error: "無法連上雲端，請檢查網路後重試" };
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return { ok: false, error: "請輸入邀請碼" };
  const { data, error } = await client.rpc("join_trip", { code: trimmed });
  if (error) {
    const msg = error.message.includes("INVALID_CODE")
      ? "邀請碼不存在，請確認後再試"
      : "加入失敗：" + error.message;
    return { ok: false, error: msg };
  }
  store.importCloudTrip(data);
  ensureWatching();
  await pullActive();
  setStatus("synced");
  return { ok: true, tripName: data.data.name };
}

// ---------- 推送（防抖＋待上傳佇列＋重試） ----------
function loadPending() {
  try {
    const ids = JSON.parse(localStorage.getItem(PENDING_KEY));
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

function savePending() {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify([...pending]));
  } catch (e) {
    console.warn("記錄待上傳清單失敗", e);
  }
}

function markDirty(cloudId) {
  pending.add(cloudId);
  savePending();
  editSeq.set(cloudId, (editSeq.get(cloudId) || 0) + 1);
  schedulePush(cloudId);
}

function schedulePush(cloudId, delay = PUSH_DEBOUNCE_MS) {
  clearTimeout(pushTimers.get(cloudId));
  pushTimers.set(
    cloudId,
    setTimeout(() => {
      pushTimers.delete(cloudId);
      pushNow(cloudId);
    }, delay)
  );
}

// 本機還有沒送出的修改：這段期間不套用雲端版本，免得自己的回音或舊資料蓋掉新修改
function hasLocalChanges(cloudId) {
  return pending.has(cloudId) || pushTimers.has(cloudId) || pushing.has(cloudId);
}

async function pushNow(cloudId) {
  if (!ready) {
    setStatus("offline"); // 連上後 connect() 會補傳
    return;
  }
  if (pushing.has(cloudId)) {
    schedulePush(cloudId); // 上一筆還在傳，等它傳完再送最新版
    return;
  }
  const trip = store.findTripByCloudId(cloudId);
  if (!trip) {
    pending.delete(cloudId); // 本機已刪除這個旅程
    savePending();
    return;
  }
  const seq = editSeq.get(cloudId) || 0;
  pushing.add(cloudId);
  try {
    // 送出當下的最新內容（不是排程當時的快照）
    let ok = await updateRow(cloudId, store.stripCloud(trip));
    if (!ok && (await rejoin(trip))) ok = await updateRow(cloudId, store.stripCloud(trip));
    if (!ok) {
      const err = new Error("沒有這個雲端旅程的編輯權限（邀請碼可能已失效）");
      err.permanent = true;
      throw err;
    }
    if ((editSeq.get(cloudId) || 0) === seq) {
      pending.delete(cloudId);
      savePending();
    }
    retryCount = 0;
    setStatus("synced");
  } catch (e) {
    console.warn("推送失敗", e);
    setStatus(navigator.onLine === false ? "offline" : "error");
    if (!e.permanent) scheduleRetry();
  } finally {
    pushing.delete(cloudId);
  }
}

// RLS 擋下時 update 不會報錯、只是 0 筆，所以要回傳筆數確認真的寫進去了
async function updateRow(cloudId, payload) {
  const { data, error } = await client
    .from("trips")
    .update({ data: payload })
    .eq("id", cloudId)
    .select("id");
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

// 匿名身分換了（清過瀏覽器資料、換 App）就不在成員名單內：用旅程記住的邀請碼重新加入
async function rejoin(trip) {
  if (!trip.cloud || !trip.cloud.code) return false;
  const { error } = await client.rpc("join_trip", { code: trip.cloud.code });
  if (error) console.warn("重新加入雲端旅程失敗", error);
  return !error;
}

function scheduleRetry() {
  if (retryTimer) return;
  const delay = RETRY_DELAYS_MS[Math.min(retryCount, RETRY_DELAYS_MS.length - 1)];
  retryCount++;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    reconnect();
  }, delay);
}

async function flushPending() {
  for (const cloudId of [...pending]) {
    if (!pushTimers.has(cloudId)) await pushNow(cloudId);
  }
}

async function ensureReady() {
  if (!client) return false;
  return ready || (await connect());
}

// ---------- 拉取與訂閱 ----------
async function pullActive() {
  const trip = store.getActiveTrip();
  if (!trip || !trip.cloud || !ready) return;
  const cloudId = trip.cloud.id;
  if (hasLocalChanges(cloudId)) return;
  let { data, error } = await fetchRow(cloudId);
  if (!error && !data && (await rejoin(trip))) ({ data, error } = await fetchRow(cloudId));
  if (error || !data) {
    if (error) console.warn("拉取失敗", error);
    return;
  }
  if (hasLocalChanges(cloudId)) return; // 拉取途中使用者又改了
  store.applyRemoteTrip(data.id, data.data);
}

function fetchRow(cloudId) {
  return client.from("trips").select().eq("id", cloudId).maybeSingle();
}

// ---------- 記事本照片（Supabase Storage） ----------
export async function uploadNoteImage(blob) {
  if (!(await ensureReady())) return { ok: false, error: "離線中無法上傳照片" };
  const uid = await currentUid();
  if (!uid) return { ok: false, error: "離線中無法上傳照片" };
  const path = `${uid}/${crypto.randomUUID()}.jpg`;
  const { error } = await client.storage
    .from("note-images")
    .upload(path, blob, { contentType: "image/jpeg" });
  if (error) return { ok: false, error: "上傳失敗：" + error.message };
  const { data } = client.storage.from("note-images").getPublicUrl(path);
  return { ok: true, image: { path, url: data.publicUrl } };
}

export async function deleteNoteImage(path) {
  if (!client || !path) return;
  try {
    await client.storage.from("note-images").remove([path]);
  } catch (e) {
    console.warn("刪除雲端照片失敗（不影響本地）", e);
  }
}

// 回傳 true 表示換了訂閱對象（切換到另一個共享旅程）
function ensureWatching(force = false) {
  if (!client) return false;
  const trip = store.getActiveTrip();
  const cloudId = trip && trip.cloud ? trip.cloud.id : null;
  if (cloudId === watchedCloudId && !force) return false;

  if (channel) {
    client.removeChannel(channel);
    channel = null;
  }
  watchedCloudId = cloudId;
  if (!cloudId) {
    setStatus("local");
    return true;
  }
  if (!ready) {
    setStatus("offline");
    return true;
  }
  if (!hasLocalChanges(cloudId)) setStatus("connecting");
  channel = client
    .channel("trip-" + cloudId)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "trips", filter: "id=eq." + cloudId },
      (payload) => {
        const row = payload.new;
        if (!row || !row.data || hasLocalChanges(row.id)) return;
        store.applyRemoteTrip(row.id, row.data);
      }
    )
    .subscribe((s) => {
      if (s === "SUBSCRIBED") setStatus("synced");
      else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
        setStatus("error");
        scheduleRetry();
      }
    });
  return true;
}
