// Leaflet 地圖：顯示當日景點的編號標記與路線。
/* global L */

let map = null;
let layerGroup = null;

const TOKYO = [35.6812, 139.7671]; // 預設中心：東京車站

export function initMap() {
  map = L.map("map").setView(TOKYO, 12);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  layerGroup = L.layerGroup().addTo(map);
  return map;
}

export function refreshMapSize() {
  if (map) map.invalidateSize();
}

function numberIcon(n, color) {
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};color:#fff;width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;border:2px solid #33323D;box-shadow:2px 2px 0 rgba(51,50,61,.5)"><span style="transform:rotate(45deg);font-size:12px;font-weight:bold">${n}</span></div>`,
    iconSize: [28, 28],
    iconAnchor: [6, 28],
  });
}

// stops: 已排序的當日景點陣列；cats: 類別定義（取顏色與 emoji）
export function renderDay(stops, cats = {}) {
  if (!map) return;
  layerGroup.clearLayers();
  const points = [];
  stops.forEach((s, i) => {
    if (typeof s.lat !== "number" || typeof s.lng !== "number") return;
    const cat = cats[s.category] || { color: "#FF6B57", emoji: "" };
    const marker = L.marker([s.lat, s.lng], { icon: numberIcon(i + 1, cat.color) });
    marker.bindPopup(`<b>${i + 1}. ${cat.emoji} ${escapeHtml(s.name)}</b>`);
    layerGroup.addLayer(marker);
    points.push([s.lat, s.lng]);
  });
  if (points.length >= 2) {
    layerGroup.addLayer(
      L.polyline(points, { color: "#FF6B57", weight: 3, dashArray: "6 6", opacity: 0.85 })
    );
  }
  if (points.length > 0) {
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16 });
  }
}

export function panTo(lat, lng) {
  if (map) map.setView([lat, lng], Math.max(map.getZoom(), 14));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
