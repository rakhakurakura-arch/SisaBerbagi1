/* ==============================================================================
 * INDEX.JS - LOGIKA REALTIME COUNTER DAMPAK UTAMA (LANDING PAGE)
 * ==============================================================================
 * Menggunakan `onSnapshot` dari Firestore untuk mendengarkan seluruh perubahan pada 
 * collection "food_listings". Dari data snapshot tersebut, kita menghitung 3 angka 
 * statistik agregasi secara real-time di sisi client:
 * 
 * 1. Total Porsi Diinput  : SUM(jumlahPorsi) dari seluruh dokumen.
 * 2. Total Disalurkan     : SUM(jumlahPorsi) dari dokumen dengan status "sudah diklaim".
 * 3. Jumlah Mitra Unik    : Jumlah namaRestoran unik (COUNT DISTINCT).
 * ==============================================================================
 */

import { db, collection, onSnapshot, query, where, orderBy, limit } from "./firebase-config.js";

// DOM Elements untuk angka statistik
const counterTotalPorsi = document.getElementById("counterTotalPorsi");
const counterPorsiDisalurkan = document.getElementById("counterPorsiDisalurkan");
const counterMitraUnik = document.getElementById("counterMitraUnik");
const counterPenerimaUnik = document.getElementById("counterPenerimaUnik");

// Menyimpan nilai terakhir untuk animasi smooth count-up
let lastTotalPorsi = 0;
let lastPorsiDisalurkan = 0;
let lastMitraUnik = 0;
let lastPenerimaUnik = 0;

// ==============================================================================
// FIRESTORE REALTIME LISTENER UNTUK AGREGASI DAMPAK
// ==============================================================================
const foodListingsRef = collection(db, "food_listings");

onSnapshot(foodListingsRef, (snapshot) => {
  let totalPorsiAll = 0;
  let totalPorsiDisalurkan = 0;
  const uniqueRestaurants = new Set(); // Menggunakan Set JS untuk mendapatkan nilai unik (DISTINCT)
  const uniquePenerima = new Set();

  // Iterasi dokumen di dalam snapshot Firestore
  snapshot.docs.forEach((docSnap) => {
    const data = docSnap.data();
    const porsi = Number(data.jumlahPorsi || 0);

    // 1. Tambahkan ke Total Porsi Keseluruhan
    totalPorsiAll += porsi;

    // 2. Jika status "sudah diklaim", tambahkan ke Total Porsi Disalurkan dan catat penerima unik
    if (data.status === "sudah diklaim") {
      totalPorsiDisalurkan += porsi;
      if (data.penerima && data.penerima.trim() !== "") {
        uniquePenerima.add(data.penerima.trim().toLowerCase());
      }
    }

    // 3. Catat nama restoran untuk menghitung mitra unik (case-insensitive & trimmed)
    if (data.namaRestoran && data.namaRestoran.trim() !== "") {
      uniqueRestaurants.add(data.namaRestoran.trim().toLowerCase());
    }
  });

  const totalMitraUnik = uniqueRestaurants.size;
  const totalPenerimaUnik = uniquePenerima.size;

  // Jalankan animasi count-up dari nilai lama ke nilai baru
  animateValue(counterTotalPorsi, lastTotalPorsi, totalPorsiAll, 1000);
  animateValue(counterPorsiDisalurkan, lastPorsiDisalurkan, totalPorsiDisalurkan, 1000);
  animateValue(counterMitraUnik, lastMitraUnik, totalMitraUnik, 1000);
  animateValue(counterPenerimaUnik, lastPenerimaUnik, totalPenerimaUnik, 1000);

  // Simpan nilai terbaru
  lastTotalPorsi = totalPorsiAll;
  lastPorsiDisalurkan = totalPorsiDisalurkan;
  lastMitraUnik = totalMitraUnik;
  lastPenerimaUnik = totalPenerimaUnik;

}, (error) => {
  console.error("Gagal mengambil data counter dampak realtime:", error);
  if (counterTotalPorsi) counterTotalPorsi.textContent = "0";
  if (counterPorsiDisalurkan) counterPorsiDisalurkan.textContent = "0";
  if (counterMitraUnik) counterMitraUnik.textContent = "0";
  if (counterPenerimaUnik) counterPenerimaUnik.textContent = "0";
});

// ==============================================================================
// FIRESTORE REALTIME LISTENER UNTUK PENYALURAN TERBARU (TOP 5)
// ==============================================================================
const recentDeliveriesEl = document.getElementById("recentDeliveries");
const recentQuery = query(
  collection(db, "food_listings"),
  where("status", "==", "sudah diklaim"),
  orderBy("waktuDiklaim", "desc"),
  limit(5)
);

if (recentDeliveriesEl) {
  onSnapshot(recentQuery, (snapshot) => {
    recentDeliveriesEl.innerHTML = "";

    if (snapshot.empty) {
      recentDeliveriesEl.innerHTML = `<div class="empty-state" style="text-align:center; padding:24px; color:var(--text-muted); font-style:italic;">Belum ada penyaluran yang tercatat.</div>`;
      return;
    }

    const listContainer = document.createElement("div");
    listContainer.className = "recent-deliveries-list";

    snapshot.docs.forEach((docSnap) => {
      const data = docSnap.data();
      const item = document.createElement("div");
      item.className = "recent-delivery-item";

      const namaResto = escapeHtml(data.namaRestoran || "Mitra Restoran");
      const namaMakanan = escapeHtml(data.namaMakanan || "Makanan");
      const porsi = Number(data.jumlahPorsi || 0);
      const namaPenerima = escapeHtml(data.penerima || "Penerima");

      item.innerHTML = `
        <div class="recent-delivery-content">
          <span class="recent-icon">🎁</span>
          <div>
            <strong>${namaResto}</strong> menyalurkan 
            <strong>${namaMakanan}</strong> (${porsi} porsi) 
            kepada <strong>${namaPenerima}</strong>
          </div>
        </div>
      `;
      listContainer.appendChild(item);
    });

    recentDeliveriesEl.appendChild(listContainer);
  }, (error) => {
    console.error("Gagal memuat penyaluran terbaru:", error);
    recentDeliveriesEl.innerHTML = `<div class="empty-state" style="text-align:center; padding:24px; color:var(--text-muted); font-style:italic;">Belum ada penyaluran yang tercatat.</div>`;
  });
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// ==============================================================================
// HELPER FUNCTION: ANIMASI COUNT-UP ANGKA
// ==============================================================================
function animateValue(element, start, end, duration) {
  if (!element) return;
  if (start === end) {
    element.textContent = end.toLocaleString("id-ID");
    return;
  }

  const range = end - start;
  let current = start;
  const increment = end > start ? 1 : -1;
  const stepTime = Math.abs(Math.floor(duration / (range || 1)));

  // Batasi kecepatan animasi jika angkanya sangat besar
  const actualStepTime = Math.max(stepTime, 20);
  const stepAmount = Math.max(1, Math.floor(Math.abs(range) / (duration / actualStepTime)));

  const timer = setInterval(() => {
    if (increment > 0) {
      current = Math.min(current + stepAmount, end);
    } else {
      current = Math.max(current - stepAmount, end);
    }
    
    element.textContent = current.toLocaleString("id-ID");

    if (current === end) {
      clearInterval(timer);
    }
  }, actualStepTime);
}
