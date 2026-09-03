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

import { db, collection, onSnapshot } from "./firebase-config.js";

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
// FIRESTORE REALTIME LISTENER UNTUK AGREGASI DAMPAK & PENYALURAN TERBARU
// ==============================================================================
const foodListingsRef = collection(db, "food_listings");
const recentDeliveriesEl = document.getElementById("recentDeliveries");

onSnapshot(foodListingsRef, (snapshot) => {
  let totalPorsiAll = 0;
  let totalPorsiDisalurkan = 0;
  const uniqueRestaurants = new Set(); // Menggunakan Set JS untuk mendapatkan nilai unik (DISTINCT)
  const uniquePenerima = new Set();
  const allConfirmedDeliveries = [];

  // Iterasi dokumen di dalam snapshot Firestore
  snapshot.docs.forEach((docSnap) => {
    const data = docSnap.data();
    const docId = docSnap.id;
    const porsi = Number(data.jumlahPorsi || 0);

    // 1. Tambahkan ke Total Porsi Keseluruhan
    totalPorsiAll += porsi;

    // 2. Loop klaimList untuk menghitung porsi disalurkan, penerima unik, & penyaluran terbaru
    const klaimList = Array.isArray(data.klaimList) ? data.klaimList : [];
    klaimList.forEach((klaim) => {
      if (klaim.status === "sudah diklaim") {
        const porsiDiklaim = Number(klaim.porsiDiklaim || 0);
        totalPorsiDisalurkan += porsiDiklaim;

        if (klaim.penerima && klaim.penerima.trim() !== "") {
          uniquePenerima.add(klaim.penerima.trim().toLowerCase());
        }

        allConfirmedDeliveries.push({
          namaMakanan: data.namaMakanan,
          namaRestoran: data.namaRestoran,
          penerima: klaim.penerima,
          porsiDiklaim: klaim.porsiDiklaim,
          waktuDiklaim: klaim.waktuDiklaim
        });
      }
    });

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

  // Render Penyaluran Terbaru (Top 5)
  if (recentDeliveriesEl) {
    recentDeliveriesEl.innerHTML = "";

    if (allConfirmedDeliveries.length === 0) {
      recentDeliveriesEl.innerHTML = `<div class="empty-state" style="text-align:center; padding:24px; color:var(--text-muted); font-style:italic;">Belum ada penyaluran yang tercatat.</div>`;
    } else {
      // Sort descending berdasarkan waktuDiklaim string ISO
      allConfirmedDeliveries.sort((a, b) => {
        const timeA = a.waktuDiklaim ? new Date(a.waktuDiklaim).getTime() : 0;
        const timeB = b.waktuDiklaim ? new Date(b.waktuDiklaim).getTime() : 0;
        return timeB - timeA;
      });

      const top5Items = allConfirmedDeliveries.slice(0, 5);

      const listContainer = document.createElement("div");
      listContainer.className = "recent-deliveries-list";

      top5Items.forEach((data) => {
        const item = document.createElement("div");
        item.className = "recent-delivery-item";

        const namaResto = escapeHtml(data.namaRestoran || "Mitra Restoran");
        const namaMakanan = escapeHtml(data.namaMakanan || "Makanan");
        const porsi = Number(data.porsiDiklaim || 0);
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
    }
  }

}, (error) => {
  console.error("Gagal mengambil data counter dampak realtime:", error);
  if (counterTotalPorsi) counterTotalPorsi.textContent = "0";
  if (counterPorsiDisalurkan) counterPorsiDisalurkan.textContent = "0";
  if (counterMitraUnik) counterMitraUnik.textContent = "0";
  if (counterPenerimaUnik) counterPenerimaUnik.textContent = "0";
  if (recentDeliveriesEl) {
    recentDeliveriesEl.innerHTML = `<div class="empty-state" style="text-align:center; padding:24px; color:var(--text-muted); font-style:italic;">Belum ada penyaluran yang tercatat.</div>`;
  }
});

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
