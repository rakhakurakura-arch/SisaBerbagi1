/* ==============================================================================
 * RIWAYAT.JS - LOGIKA RIWAYAT PENYALURAN MAKANAN (REALTIME HISTORY & SUMMARY)
 * ==============================================================================
 * Menggunakan `onSnapshot` dari Firestore dengan query filter `where("status", "==", "sudah diklaim")`
 * untuk mendengarkan seluruh data makanan yang telah berhasil disalurkan ke panti/komunitas.
 * 
 * Dari data ini, kita secara otomatis menghitung:
 * 1. Total Porsi Tersalurkan sepanjang waktu.
 * 2. Total Transaksi Klaim yang berhasil terjadi.
 * ==============================================================================
 */

import { db, collection, onSnapshot } from "./firebase-config.js";

// DOM Elements
const historyTotalPorsi = document.getElementById("historyTotalPorsi");
const historyTotalTransaksi = document.getElementById("historyTotalTransaksi");
const historyListings = document.getElementById("historyListings");

// Menyimpan data snapshot lokal untuk sorting & render
let historyDataList = [];

// ==============================================================================
// FIRESTORE REALTIME QUERY: LISTEN SELURUH COLLECTION FOOD_LISTINGS
// ==============================================================================
onSnapshot(collection(db, "food_listings"), (snapshot) => {
  historyDataList = [];
  let totalPorsiSum = 0;

  snapshot.docs.forEach((docSnap) => {
    const docData = docSnap.data();
    const klaimList = Array.isArray(docData.klaimList) ? docData.klaimList : [];

    klaimList.forEach((klaim) => {
      if (klaim.status === "sudah diklaim") {
        const porsi = Number(klaim.porsiDiklaim || 0);
        totalPorsiSum += porsi;

        historyDataList.push({
          namaMakanan: docData.namaMakanan,
          namaRestoran: docData.namaRestoran,
          jumlahPorsi: klaim.porsiDiklaim,
          penerima: klaim.penerima,
          alamatPenerima: klaim.alamatPenerima,
          kontakPenerima: klaim.kontakPenerima,
          jumlahOrangPenerima: klaim.jumlahOrangPenerima,
          caraPengambilan: klaim.caraPengambilan,
          waktuDiklaim: klaim.waktuDiklaim
        });
      }
    });
  });

  // 1. Update Ringkasan Total Porsi & Transaksi di Atas Halaman
  if (historyTotalPorsi) historyTotalPorsi.textContent = totalPorsiSum.toLocaleString("id-ID");
  if (historyTotalTransaksi) historyTotalTransaksi.textContent = historyDataList.length.toLocaleString("id-ID");

  // 2. Render Tabel Riwayat Makanan
  renderHistoryTable();

}, (error) => {
  console.error("Gagal memuat data riwayat penyaluran:", error);
  if (historyListings) {
    historyListings.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state" style="color: #ef4444;">
          ⚠️ Gagal memuat data riwayat dari Firestore.
        </td>
      </tr>
    `;
  }
});

// ==============================================================================
// FUNGSI RENDER TABEL RIWAYAT PENYALURAN (DIURUTKAN DARI TERBARU)
// ==============================================================================
function renderHistoryTable() {
  if (!historyListings) return;

  historyListings.innerHTML = "";

  if (historyDataList.length === 0) {
    historyListings.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state">
          🍃 Belum ada riwayat penyaluran makanan. Makanan yang telah berhasil diklaim akan otomatis muncul di sini secara realtime.
        </td>
      </tr>
    `;
    return;
  }

  // Urutkan dari yang paling baru diklaim (waktuDiklaim string ISO)
  const sortedHistory = [...historyDataList].sort((a, b) => {
    const timeA = a.waktuDiklaim ? new Date(a.waktuDiklaim).getTime() : 0;
    const timeB = b.waktuDiklaim ? new Date(b.waktuDiklaim).getTime() : 0;
    return timeB - timeA;
  });

  const svgCheck = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;

  sortedHistory.forEach((item) => {
    const tr = document.createElement("tr");

    // Format info waktu klaim
    let waktuKlaimFormatted = "Baru saja";
    if (item.waktuDiklaim) {
      const d = new Date(item.waktuDiklaim);
      waktuKlaimFormatted = d.toLocaleString("id-ID", {
        day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
      });
    }

    // Format detail penerima
    const namaPenerimaStr = escapeHtml(item.penerima || "Penerima Manfaat");
    const alamatStr = item.alamatPenerima ? `<div class="recipient-sub">📍 ${escapeHtml(item.alamatPenerima)}</div>` : "";
    const kontakStr = item.kontakPenerima ? `<div class="recipient-sub">📞 WA: ${escapeHtml(item.kontakPenerima)}</div>` : "";
    const porsiStr = item.jumlahOrangPenerima ? `<span class="recipient-sub"> (Penerima: ${item.jumlahOrangPenerima} Jiwa)</span>` : "";
    const caraPengambilanLabel = item.caraPengambilan === "diantar"
      ? "🚚 Diantar oleh restoran"
      : item.caraPengambilan === "diambil_sendiri"
      ? "🚶 Diambil sendiri"
      : null;
    const caraPengambilanStr = caraPengambilanLabel ? `<div class="recipient-sub">🛵 ${caraPengambilanLabel}</div>` : "";

    tr.innerHTML = `
      <td>
        <div class="food-title-cell">${escapeHtml(item.namaMakanan)}</div>
        <span class="portion-badge">📦 ${item.jumlahPorsi} Porsi</span>
      </td>
      <td>
        <strong>${escapeHtml(item.namaRestoran)}</strong>
      </td>
      <td>
        <div class="recipient-info">
          <div class="recipient-name">${namaPenerimaStr}${porsiStr}</div>
          ${alamatStr}
          ${kontakStr}
          ${caraPengambilanStr}
        </div>
      </td>
      <td>
        <span style="font-size:0.88rem; color:#68776C;">${waktuKlaimFormatted}</span>
      </td>
      <td>
        <span class="status-tag">
          ${svgCheck} Tersalurkan
        </span>
      </td>
    `;

    historyListings.appendChild(tr);
  });
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// ==============================================================================
// FITUR CETAK / EXPORT LAPORAN KESELURUHAN (PDF / PRINT)
// ==============================================================================
const btnPrintReport = document.getElementById("btnPrintReport");
const printDateEl = document.getElementById("printDate");

if (btnPrintReport) {
  btnPrintReport.addEventListener("click", () => {
    if (printDateEl) {
      const now = new Date();
      const formattedDate = now.toLocaleDateString("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
      printDateEl.textContent = `Dicetak secara otomatis dari Sistem SisaBerbagi pada: ${formattedDate} WIB`;
    }
    window.print();
  });
}
