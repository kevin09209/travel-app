// 匯率：抓取免費 API、快取 12 小時、失敗時退回快取或 null。
import { RATE_API } from "./config.js";

const CACHE_KEY = "travel-app:rates";
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY)) || {};
  } catch {
    return {};
  }
}

// 回傳 { rate, fetchedAt, stale } 或 null。rate = 1 base 幣值多少 quote 幣。
export async function getRate(base, quote, { forceRefresh = false } = {}) {
  const cache = readCache();
  const key = `${base}->${quote}`;
  const cached = cache[key];
  const fresh = cached && Date.now() - cached.fetchedAt < MAX_AGE_MS;

  if (fresh && !forceRefresh) {
    return { rate: cached.rate, fetchedAt: cached.fetchedAt, stale: false };
  }

  try {
    const res = await fetch(RATE_API + encodeURIComponent(base));
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const rate = data && data.rates && data.rates[quote];
    if (typeof rate !== "number") throw new Error("回應中沒有 " + quote);
    cache[key] = { rate, fetchedAt: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    return { rate, fetchedAt: cache[key].fetchedAt, stale: false };
  } catch (e) {
    console.warn("匯率抓取失敗", e);
    if (cached) return { rate: cached.rate, fetchedAt: cached.fetchedAt, stale: true };
    return null;
  }
}
