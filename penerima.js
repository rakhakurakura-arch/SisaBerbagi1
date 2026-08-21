/* ==============================================================================
 * PENERIMA.JS - DASHBOARD PENERIMA BANATUAN MAKANAN (REALTIME, KLAIM & WA SHARE)
 * ==============================================================================
 * Menggunakan listener `onSnapshot` dari Firestore untuk menampilkan seluruh makanan 
 * dengan status "tersedia".
 * 
 * FITUR UTAMA:
 * 1. Read Realtime makanan yang tersedia, diurutkan dinamis (Urgensi / Terbaru).
 * 2. Tombol Bagikan ke WhatsApp (.btn-wa-share) khusus makanan dengan skor urgensi 4 & 5.
 * 3. Modal Formulir Klaim dengan input data penerima lengkap (Nama, Alamat, Kontak, Jumlah Jiwa).
 * 4. Firestore Transaction (`runTransaction`) untuk mencegah Race Condition (Double-Claim).
 * 5. Floating Toast Notification yang tetap muncul 3,5 detik meskipun card terhapus secara realtime.
 * ==============================================================================
 */

// 1. IMPORT FIREBASE INSTANCE & HELPERS DARI firebase-config.js
import {
  db,
  collection,
  doc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  runTransaction
} from "./firebase-config.js";
import { getSession, clearSession } from "./session.js";

// DOM Elements Utama
const availableListings = document.getElementById("availableListings");
const sortFilter = document.getElementById("sortFilter");

// Modal Claim Elements
const claimModal = document.getElementById("claimModal");
const claimForm = document.getElementById("claimForm");
const modalFoodInfo = document.getElementById("modalFoodInfo");
const namaPenerimaInput = document.getElementById("namaPenerimaInput");
const alamatPenerimaInput = document.getElementById("alamatPenerimaInput");
const kontakPenerimaInput = document.getElementById("kontakPenerimaInput");
const jumlahOrangInput = document.getElementById("jumlahOrangInput");
const captchaQuestionModal = document.getElementById("captchaQuestionModal");
const captchaAnswerInput = document.getElementById("captchaAnswerInput");
const btnCancelClaim = document.getElementById("btnCancelClaim");
const btnConfirmClaim = document.getElementById("btnConfirmClaim");

// Captcha State Modal
let modalNum1 = 0;
let modalNum2 = 0;
let modalCaptchaSolution = 0;

function generateModalCaptcha() {
  modalNum1 = Math.floor(Math.random() * 10) + 1; // 1-10
  modalNum2 = Math.floor(Math.random() * 10) + 1; // 1-10
  modalCaptchaSolution = modalNum1 + modalNum2;
  if (captchaQuestionModal) {
    captchaQuestionModal.textContent = `${modalNum1} + ${modalNum2} = ?`;
  }
  if (captchaAnswerInput) {
    captchaAnswerInput.value = "";
  }
}

// Variable State
let currentClaimDocId = null; // Menyimpan ID dokumen yang sedang diklaim
let allAvailableData = [];   // Menyimpan data lokal dari snapshot Firestore

// ==============================================================================
// SESSION MITRA: TAMPILKAN SESSION BAR & AUTOFILL MODAL KLAIM JIKA SUDAH LOGIN
// ==============================================================================
const currentSession = getSession();

// WAJIB LOGIN: kalau belum ada session, redirect ke halaman login
if (!currentSession || currentSession.jenis !== "penerima") {
  window.location.href = "login.html";
}

const sessionBarContainer = document.getElementById("sessionBarContainer");

function renderSessionBar() {
  if (!sessionBarContainer) return;

  if (currentSession && currentSession.jenis === "penerima") {
    const badge = currentSession.terverifikasi
      ? `<span class="badge-verified">✓ Terverifikasi</span>`
      : `<span class="badge-unverified">Belum diverifikasi</span>`;

    sessionBarContainer.innerHTML = `
      <div class="session-bar">
        <div>Login sebagai: <strong>${escapeHtml(currentSession.nama)}</strong> (WA: ${escapeHtml(currentSession.kontakWA)}) ${badge}</div>
        <div class="session-bar-actions">
          <button type="button" id="btnLogoutMitra">Ganti Akun</button>
        </div>
      </div>
    `;

    document.getElementById("btnLogoutMitra")?.addEventListener("click", () => {
      clearSession();
      window.location.reload();
    });

  } else if (currentSession && currentSession.jenis !== "penerima") {
    sessionBarContainer.innerHTML = `
      <div class="guest-prompt">
        Kamu login sebagai akun Restoran/Toko. Halaman ini khusus Penerima/Panti — kamu tetap bisa klaim di sini sebagai tamu, atau <a href="restoran.html">buka halaman Restoran</a>.
      </div>
    `;
  } else {
    sessionBarContainer.innerHTML = `
      <div class="guest-prompt">
        Kamu memakai halaman ini sebagai tamu. <a href="registrasi.html">Daftar sebagai mitra</a> atau <a href="login.html">login</a> supaya data kamu tersimpan & form klaim otomatis terisi.
      </div>
    `;
  }
}
renderSessionBar();

// ==============================================================================
// LOKASI PENERIMA UNTUK FITUR SORT "TERDEKAT" (DIAMBIL SEKALI SAAT DIBUTUHKAN)
// ==============================================================================
let userLat = (currentSession && currentSession.jenis === "penerima") ? currentSession.lat : null;
let userLng = (currentSession && currentSession.jenis === "penerima") ? currentSession.lng : null;

function hitungJarakKm(lat1, lng1, lat2, lng2) {
  const R = 6371; // radius bumi dalam km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function mintaLokasiUserJikaBelumAda() {
  return new Promise((resolve) => {
    if (userLat !== null && userLng !== null) {
      resolve(true);
      return;
    }
    if (!navigator.geolocation) {
      resolve(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userLat = pos.coords.latitude;
        userLng = pos.coords.longitude;
        resolve(true);
      },
      () => resolve(false)
    );
  });
}

// ==============================================================================
// FITUR 1: MENDENGARKAN DATA MAKANAN TERSEDIA SECARA REAL-TIME
// ==============================================================================
const availableQuery = query(
  collection(db, "food_listings"),
  where("status", "==", "tersedia")
);

onSnapshot(availableQuery, (snapshot) => {
  allAvailableData = [];

  snapshot.docs.forEach((docSnap) => {
    allAvailableData.push({
      id: docSnap.id,
      ...docSnap.data()
    });
  });

  // Render ulang UI sesuai urutan sort yang dipilih pengguna
  renderListings();
}, (error) => {
  console.error("Gagal mendengarkan data realtime penerima:", error);
  if (availableListings) {
    availableListings.innerHTML = `
      <div class="empty-state" style="color: #ef4444;">
        ⚠️ Gagal memuat data dari Firestore. Mohon pastikan Firestore aktif dalam Test Mode.
      </div>
    `;
  }
});

// Listener Perubahan Dropdown Filter / Sort
if (sortFilter) {
  sortFilter.addEventListener("change", async () => {
    if (sortFilter.value === "distance") {
      const berhasil = await mintaLokasiUserJikaBelumAda();
      if (!berhasil) {
        showToast("⚠️ Tidak bisa mengambil lokasi kamu. Izinkan akses lokasi di browser untuk memakai sort ini.", "error", 4000);
      }
    }
    renderListings();
  });
}

// ==============================================================================
// FUNGSI RENDER CARDS MAKANAN TERSEDIA
// ==============================================================================
function renderListings() {
  if (!availableListings) return;

  availableListings.innerHTML = "";

  if (allAvailableData.length === 0) {
    availableListings.innerHTML = `
      <div class="empty-state">
        <h3>🌱 Belum ada yang bisa dibagikan nih</h3>
        <p>Silakan cek lagi beberapa saat ya, daftar ini akan ter-update otomatis secara realtime jika mitra restoran menginput makanan sisa baru.</p>
      </div>
    `;
    return;
  }

  // Proses Sorting Client-side
  const currentSort = sortFilter ? sortFilter.value : "urgency";
  const sortedData = [...allAvailableData].sort((a, b) => {
    if (currentSort === "distance" && userLat !== null && userLng !== null) {
      const adaLokasiA = typeof a.lokasiLat === "number" && typeof a.lokasiLng === "number";
      const adaLokasiB = typeof b.lokasiLat === "number" && typeof b.lokasiLng === "number";
      if (adaLokasiA && !adaLokasiB) return -1;
      if (!adaLokasiA && adaLokasiB) return 1;
      if (!adaLokasiA && !adaLokasiB) return 0;
      const jarakA = hitungJarakKm(userLat, userLng, a.lokasiLat, a.lokasiLng);
      const jarakB = hitungJarakKm(userLat, userLng, b.lokasiLat, b.lokasiLng);
      return jarakA - jarakB;
    } else if (currentSort === "urgency") {
      if (b.skorUrgensi !== a.skorUrgensi) {
        return b.skorUrgensi - a.skorUrgensi;
      }
      return new Date(a.waktuBatas) - new Date(b.waktuBatas);
    } else {
      const timeA = a.timestamp ? a.timestamp.toMillis() : 0;
      const timeB = b.timestamp ? b.timestamp.toMillis() : 0;
      return timeB - timeA;
    }
  });

  // SVG Icons Outline
  const svgStore = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/></svg>`;
  const svgBox = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`;
  const svgClock = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
  const svgNote = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`;
  const svgHandshake = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`;
  const svgWA = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;

  // Render Setiap Dokumen
  sortedData.forEach((item) => {
    const cardEl = document.createElement("div");
    cardEl.className = "card-item";

    const labelUrgensi = getUrgencyLabel(item.skorUrgensi);

    let distanceBadgeHtml = "";
    if (userLat !== null && userLng !== null && typeof item.lokasiLat === "number" && typeof item.lokasiLng === "number") {
      const jarak = hitungJarakKm(userLat, userLng, item.lokasiLat, item.lokasiLng);
      distanceBadgeHtml = `<span class="distance-badge">📍 ~${jarak.toFixed(1)} km</span>`;
    }

    // Tombol WA Share untuk seluruh listing makanan
    const waShareBtnHtml = `
      <a href="${createWhatsAppShareUrl(item.namaMakanan, item.jumlahPorsi, item.namaRestoran, item.waktuBatas, item.skorUrgensi)}" 
         target="_blank" rel="noopener noreferrer" class="btn-wa-share" title="Bagikan Makanan ini ke WhatsApp">
        ${svgWA} Bagikan ke WA
      </a>
    `;

    cardEl.innerHTML = `
      <div>
        <div class="card-header">
          <span class="restaurant-name">${svgStore} ${escapeHtml(item.namaRestoran)}</span>
          <div style="display:flex; align-items:center; flex-wrap:wrap; gap:4px; justify-content:flex-end;">
            ${distanceBadgeHtml}
            <span class="urgency-badge urgency-${item.skorUrgensi}">
              ${labelUrgensi}
            </span>
            ${waShareBtnHtml}
          </div>
        </div>

        <h3 class="food-title">${escapeHtml(item.namaMakanan)}</h3>

        <div class="card-info">
          <div class="info-row">
            <span>${svgBox} Jumlah Porsi:</span> ${item.jumlahPorsi} Porsi
          </div>
          <div class="info-row">
            <span>${svgClock} Batas Ambil:</span> ${formatDateTime(item.waktuBatas)}
          </div>
          ${item.catatan ? `
            <div class="note-box">
              <strong>${svgNote} Catatan:</strong> ${escapeHtml(item.catatan)}
            </div>
          ` : ''}
        </div>
      </div>

      <button class="btn-claim" data-id="${item.id}" data-name="${escapeHtml(item.namaMakanan)}" data-resto="${escapeHtml(item.namaRestoran)}">
        ${svgHandshake} Klaim Makanan Ini
      </button>
    `;

    availableListings.appendChild(cardEl);
  });

  // Pasang Listener Klik pada Tombol Klaim
  document.querySelectorAll(".btn-claim").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const button = e.currentTarget;
      const id = button.getAttribute("data-id");
      const name = button.getAttribute("data-name");
      const resto = button.getAttribute("data-resto");
      openClaimModal(id, name, resto);
    });
  });
}

// ==============================================================================
// FITUR 2: LOGIKA MODAL POPUP & FIRESTORE TRANSACTION (PENCEGAHAN RACE CONDITION)
// ==============================================================================
function openClaimModal(docId, foodName, restoName) {
  currentClaimDocId = docId;
  if (modalFoodInfo) {
    modalFoodInfo.innerHTML = `
      <strong>${foodName}</strong> dari <em>${restoName}</em>
    `;
  }
  if (claimForm) claimForm.reset();
  generateModalCaptcha();

  if (currentSession && currentSession.jenis === "penerima") {
    if (namaPenerimaInput) { namaPenerimaInput.value = currentSession.nama; namaPenerimaInput.readOnly = true; }
    if (alamatPenerimaInput) { alamatPenerimaInput.value = currentSession.alamat || ""; alamatPenerimaInput.readOnly = true; }
    if (kontakPenerimaInput) { kontakPenerimaInput.value = currentSession.kontakWA; kontakPenerimaInput.readOnly = true; }
  } else {
    if (namaPenerimaInput) namaPenerimaInput.readOnly = false;
    if (alamatPenerimaInput) alamatPenerimaInput.readOnly = false;
    if (kontakPenerimaInput) kontakPenerimaInput.readOnly = false;
  }

  if (claimModal) claimModal.classList.add("active");
  if (namaPenerimaInput) namaPenerimaInput.focus();
}

if (btnCancelClaim) {
  btnCancelClaim.addEventListener("click", () => {
    if (claimModal) claimModal.classList.remove("active");
    currentClaimDocId = null;
  });
}

// Klik di luar area modal untuk menutup
if (claimModal) {
  claimModal.addEventListener("click", (e) => {
    if (e.target === claimModal) {
      claimModal.classList.remove("active");
      currentClaimDocId = null;
    }
  });
}

// Handle Form Submit Klaim
if (claimForm) {
  claimForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Validasi Captcha Modal
    const userCaptchaAnswer = parseInt(captchaAnswerInput.value, 10);
    if (isNaN(userCaptchaAnswer) || userCaptchaAnswer !== modalCaptchaSolution) {
      showToast("❌ Jawaban CAPTCHA Anda salah! Silakan coba lagi.", "error", 3500);
      generateModalCaptcha();
      return;
    }

    const namaPenerima = namaPenerimaInput ? namaPenerimaInput.value.trim() : "";
    const alamatPenerima = alamatPenerimaInput ? alamatPenerimaInput.value.trim() : "";
    const kontakPenerima = kontakPenerimaInput ? kontakPenerimaInput.value.trim() : "";
    const jumlahOrangRaw = jumlahOrangInput ? jumlahOrangInput.value.trim() : "";
    const jumlahOrangPenerima = jumlahOrangRaw ? parseInt(jumlahOrangRaw, 10) : null;

    if (!namaPenerima || !alamatPenerima || !kontakPenerima || !currentClaimDocId) {
      showToast("Mohon lengkapi seluruh field wajib pada formulir.", "error");
      generateModalCaptcha();
      return;
    }

    if (btnConfirmClaim) {
      btnConfirmClaim.disabled = true;
      btnConfirmClaim.textContent = "Memproses Klaim...";
    }

    const foodDocRef = doc(db, "food_listings", currentClaimDocId);

    try {
      // MENJALANKAN TRANSAKSI ATOMIK FIRESTORE
      await runTransaction(db, async (transaction) => {
        // 1. BACA ULANG DOKUMEN SECARA ATOMIK DI DALAM TRANSAKSI
        const foodDoc = await transaction.get(foodDocRef);

        if (!foodDoc.exists()) {
          throw new Error("NOT_FOUND");
        }

        const foodData = foodDoc.data();

        // 2. VALIDASI RACE CONDITION (JIKA SUDAH DIKLAIM PENERIMA LAIN)
        if (foodData.status !== "tersedia") {
          throw new Error("ALREADY_CLAIMED");
        }

        // 3. JIKA MASIH TERSEDIA, LAKUKAN UPDATE DATA LENGKAP DENGAN STATUS "menunggu konfirmasi"
        transaction.update(foodDocRef, {
          status: "menunggu konfirmasi",
          penerima: namaPenerima,
          alamatPenerima: alamatPenerima,
          kontakPenerima: kontakPenerima,
          jumlahOrangPenerima: jumlahOrangPenerima,
          penerimaMitraId: (currentSession && currentSession.jenis === "penerima") ? currentSession.id : null,
          waktuDiklaim: serverTimestamp()
        });
      });

      // Tutup Modal & Reset Form setelah sukses
      if (claimModal) claimModal.classList.remove("active");
      claimForm.reset();
      currentClaimDocId = null;
      showToast("🎉 Berhasil mengajukan klaim! Menunggu konfirmasi dari pihak restoran.", "success", 4000);

    } catch (error) {
      console.error("Proses transaksi klaim gagal:", error);

      if (error.message === "ALREADY_CLAIMED") {
        showToast("Maaf, makanan ini baru saja diklaim oleh pihak lain.", "error", 3500);
      } else if (error.message === "NOT_FOUND") {
        showToast("Makanan ini sudah tidak tersedia atau telah dihapus oleh restoran.", "error", 3500);
      } else {
        showToast("Terjadi kesalahan saat mengklaim makanan. Silakan coba lagi.", "error", 3500);
      }

      generateModalCaptcha();
      if (claimModal) claimModal.classList.remove("active");
      currentClaimDocId = null;
    } finally {
      if (btnConfirmClaim) {
        btnConfirmClaim.disabled = false;
        btnConfirmClaim.textContent = "Ya, Konfirmasi Klaim";
      }
    }
  });
}

// ==============================================================================
// FITUR 3: FLOATING TOAST NOTIFICATION
// ==============================================================================
function showToast(message, type = "error", duration = 3000) {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const icon = type === "error" ? "⚠️" : "🎉";
  toast.innerHTML = `<span>${icon}</span> <div>${escapeHtml(message)}</div>`;

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("show");
  });

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, duration);
}

// ==============================================================================
// HELPER FUNCTIONS
// ==============================================================================
function getUrgencyLabel(score) {
  const svgFlame = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3.5Z"/></svg>`;
  switch (Number(score)) {
    case 5: return `${svgFlame} Sangat Urgent (5/5)`;
    case 4: return `${svgFlame} Urgent (4/5)`;
    case 3: return `${svgFlame} Sedang (3/5)`;
    case 2: return `${svgFlame} Normal (2/5)`;
    default: return `${svgFlame} Santai (1/5)`;
  }
}

function formatDateTime(dateTimeStr) {
  if (!dateTimeStr) return "-";
  const date = new Date(dateTimeStr);
  return date.toLocaleString("id-ID", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
  });
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

/* ==============================================================================
 * HELPER FUNCTION: PEMBUAT URL BAGIKAN KE WHATSAPP (wa.me / api.whatsapp.com)
 * ==============================================================================
 * Fungsi ini menyusun pesan teks otomatis dan meng-encode-nya dengan `encodeURIComponent`
 * agar aman dijadikan URL parameter tanpa merusak format link WhatsApp Web/App.
 * Judul pesan akan otomatis menyesuaikan tingkat urgensi (Urgent vs Santai).
 * ==============================================================================
 */
function createWhatsAppShareUrl(namaMakanan, jumlahPorsi, namaRestoran, waktuBatas, skorUrgensi) {
  const currentUrl = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '/penerima.html');
  const formattedTime = formatDateTime(waktuBatas);

  const isUrgent = Number(skorUrgensi) >= 4;
  const titleText = isUrgent
    ? `🚨 *MAKANAN URGENT TERSEDIA!*`
    : `🍽️ *Makanan Sisa Tersedia untuk Dibagikan*`;

  const messageText = `${titleText}\n\n` +
    `🍱 *${namaMakanan}* (${jumlahPorsi} porsi)\n` +
    `🏪 dari *${namaRestoran}*\n` +
    `⏰ Ambil sebelum: ${formattedTime}\n\n` +
    `Yuk bantu sebar atau klaim segera di SisaBerbagi:\n${currentUrl}`;

  return `https://api.whatsapp.com/send?text=${encodeURIComponent(messageText)}`;
}
