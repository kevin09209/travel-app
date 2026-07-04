// 雲端同步層：Supabase 匿名登入 + 文件式旅程同步 + Realtime 訂閱。
// 策略：整份旅程存一筆 JSONB，last-write-wins；只同步「目前開啟」的旅程。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";
import * as store from "./store.js";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 去掉易混淆字元
const PUSH_DEBOUNCE_MS = 600;

let client = null;
let channel = null;
let watchedCloudId = null;
let pushTimer = null;
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
  try {
    const { data: { session } } = await client.auth.getSession();
    if (!session) {
      const { error } = await client.auth.signInAnonymously();
      if (error) throw error;
    }
  } catch (e) {
    console.warn("匿名登入失敗，暫時離線模式", e);
    setStatus("offline");
    return;
  }
  // 資料層每次變動 → 推雲端；旅程切換 → 重新訂閱
  store.setSyncHandler((trip) => {
    if (trip && trip.cloud) schedulePush(trip);
  });
  store.subscribe(() => ensureWatching());
  ensureWatching();
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
  if (!client) return { ok: false, error: "尚未連線" };
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
  if (!client) return { ok: false, error: "尚未連線" };
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

// ---------- 推送（防抖） ----------
function schedulePush(trip) {
  clearTimeout(pushTimer);
  const cloudId = trip.cloud.id;
  const payload = store.stripCloud(trip);
  pushTimer = setTimeout(async () => {
    try {
      const { error } = await client
        .from("trips")
        .update({ data: payload })
        .eq("id", cloudId);
      if (error) throw error;
      setStatus("synced");
    } catch (e) {
      console.warn("推送失敗", e);
      setStatus("error");
    }
  }, PUSH_DEBOUNCE_MS);
}

// ---------- 拉取與訂閱 ----------
async function pullActive() {
  const trip = store.getActiveTrip();
  if (!trip || !trip.cloud || !client) return;
  const { data, error } = await client
    .from("trips")
    .select()
    .eq("id", trip.cloud.id)
    .maybeSingle();
  if (error || !data) {
    if (error) console.warn("拉取失敗", error);
    return;
  }
  store.applyRemoteTrip(data.id, data.data);
}

// ---------- 記事本照片（Supabase Storage） ----------
export async function uploadNoteImage(blob) {
  if (!client) return { ok: false, error: "尚未連線，稍後再試" };
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

function ensureWatching() {
  const trip = store.getActiveTrip();
  const cloudId = trip && trip.cloud ? trip.cloud.id : null;
  if (cloudId === watchedCloudId) return;

  if (channel) {
    client.removeChannel(channel);
    channel = null;
  }
  watchedCloudId = cloudId;
  if (!cloudId) {
    setStatus("local");
    return;
  }
  setStatus("connecting");
  channel = client
    .channel("trip-" + cloudId)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "trips", filter: "id=eq." + cloudId },
      (payload) => {
        if (payload.new && payload.new.data) {
          store.applyRemoteTrip(payload.new.id, payload.new.data);
        }
      }
    )
    .subscribe((s) => {
      if (s === "SUBSCRIBED") setStatus("synced");
      else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") setStatus("error");
    });
}
