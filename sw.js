// Service Worker：離線快取 app shell；動態資料（Supabase/匯率/地理服務）永遠走網路。
// 發新版時把 CACHE_VERSION +1，舊快取會在 activate 時清掉。
const CACHE_VERSION = "v6";
const CACHE_NAME = "travel-app-" + CACHE_VERSION;

const CORE_ASSETS = [
  ".",
  "index.html",
  "css/style.css",
  "js/app.js",
  "js/store.js",
  "js/sync.js",
  "js/map.js",
  "js/rates.js",
  "js/settle.js",
  "js/config.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

// 這些網域是動態 API，不快取（Supabase 資料、匯率、地點搜尋）
const NETWORK_ONLY_HOSTS = [
  "eezgvybswzsjgnivgixn.supabase.co",
  "open.er-api.com",
  "nominatim.openstreetmap.org",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (NETWORK_ONLY_HOSTS.includes(url.hostname)) return; // 交給瀏覽器直接連網

  if (url.origin === location.origin) {
    // 自家資源：網路優先（拿最新版），失敗退快取（離線可用）
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request, { ignoreSearch: true }))
    );
  } else {
    // CDN（Leaflet、字型、supabase-js、地圖磚）：快取優先，背景更新
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetched = fetch(request)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            return res;
          })
          .catch(() => cached);
        return cached || fetched;
      })
    );
  }
});
