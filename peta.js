/* ==============================================================================
 * PETA.JS - MENAMPILKAN SEBARAN LOKASI MITRA DI PETA (LEAFLET + OPENSTREETMAP)
 * ============================================================================== */

import { db, collection, onSnapshot } from "./firebase-config.js";

const emptyState = document.getElementById("petaEmptyState");

// Peta default berpusat di Indonesia (Jakarta) jika belum ada titik mitra
const map = L.map("petaMitra").setView([-6.2, 106.816666], 11);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19
}).addTo(map);

let markersLayer = L.layerGroup().addTo(map);

const iconRestoran = L.divIcon({
  className: "",
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#C84B31;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
  iconSize: [16, 16]
});

const iconPenerima = L.divIcon({
  className: "",
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#2D5D3F;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
  iconSize: [16, 16]
});

onSnapshot(collection(db, "mitra_profiles"), (snapshot) => {
  markersLayer.clearLayers();
  const bounds = [];

  snapshot.docs.forEach((docSnap) => {
    const data = docSnap.data();
    if (typeof data.lat !== "number" || typeof data.lng !== "number") return;

    const icon = data.jenis === "restoran" ? iconRestoran : iconPenerima;
    const jenisLabel = data.jenis === "restoran" ? "🍱 Restoran / Toko" : "🏠 Panti / Komunitas";
    const verifBadge = data.terverifikasi
      ? '<span style="color:#52C41A;font-weight:700;">✓ Terverifikasi</span>'
      : '<span style="color:#D9822B;font-weight:700;">Belum diverifikasi</span>';

    const marker = L.marker([data.lat, data.lng], { icon }).bindPopup(`
      <div class="popup-mitra-nama">${escapeHtml(data.nama || "Mitra")}</div>
      <div class="popup-mitra-jenis">${jenisLabel} · ${verifBadge}</div>
      <div class="popup-mitra-alamat">${escapeHtml(data.alamat || "")}</div>
    `);

    markersLayer.addLayer(marker);
    bounds.push([data.lat, data.lng]);
  });

  if (bounds.length > 0) {
    emptyState.style.display = "none";
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  } else {
    emptyState.style.display = "block";
  }
}, (error) => {
  console.error("Gagal memuat data peta mitra:", error);
});

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
