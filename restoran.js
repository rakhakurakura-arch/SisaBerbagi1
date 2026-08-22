// 1. IMPORT FIREBASE INSTANCE & HELPERS DARI FILE TERPISAH (firebase-config.js)
import {
  db,
  collection,
  addDoc,
  deleteDoc,
  updateDoc,
  deleteField,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from "./firebase-config.js";
import { getSession, setSession, clearSession } from "./session.js";

// DOM Elements
const foodForm = document.getElementById("foodForm");
const submitBtn = document.getElementById("submitBtn");
const restoranListings = document.getElementById("restoranListings");
const captchaQuestionEl = document.getElementById("captchaQuestion");
const captchaAnswerInput = document.getElementById("captchaAnswer");

// Captcha State
let num1 = 0;
let num2 = 0;
let captchaSolution = 0;

function generateCaptcha() {
  num1 = Math.floor(Math.random() * 10) + 1; // 1-10
  num2 = Math.floor(Math.random() * 10) + 1; // 1-10
  captchaSolution = num1 + num2;
  if (captchaQuestionEl) {
    captchaQuestionEl.textContent = `${num1} + ${num2} = ?`;
  }
  if (captchaAnswerInput) {
    captchaAnswerInput.value = "";
  }
}

// Inisialisasi Captcha saat pertama kali dimuat
generateCaptcha();

// ==============================================================================
// SESSION MITRA: TAMPILKAN SESSION BAR & AUTOFILL FIELD JIKA SUDAH LOGIN
// ==============================================================================
const currentSession = getSession();

// WAJIB LOGIN: kalau belum ada session, redirect ke halaman login
if (!currentSession || currentSession.jenis !== "restoran") {
  window.location.href = "login.html";
}

const sessionBarContainer = document.getElementById("sessionBarContainer");

function renderSessionBar() {
  if (!sessionBarContainer) return;

  if (currentSession && currentSession.jenis === "restoran") {
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

    const namaRestoranInput = document.getElementById("namaRestoran");
    const kontakRestoranInput = document.getElementById("kontakRestoran");
    if (namaRestoranInput) {
      namaRestoranInput.value = currentSession.nama;
      namaRestoranInput.readOnly = true;
    }
    if (kontakRestoranInput) {
      kontakRestoranInput.value = currentSession.kontakWA;
      kontakRestoranInput.readOnly = true;
    }

    document.getElementById("btnLogoutMitra")?.addEventListener("click", () => {
      clearSession();
      window.location.reload();
    });

  } else if (currentSession && currentSession.jenis !== "restoran") {
    sessionBarContainer.innerHTML = `
      <div class="guest-prompt">
        Kamu login sebagai akun Penerima/Panti. Halaman ini khusus Restoran/Toko — kamu tetap bisa isi form ini sebagai tamu, atau <a href="penerima.html">buka halaman Penerima</a>.
      </div>
    `;
  } else {
    sessionBarContainer.innerHTML = `
      <div class="guest-prompt">
        Kamu mengisi form ini sebagai tamu. <a href="registrasi.html">Daftar sebagai mitra</a> atau <a href="login.html">login</a> supaya data restoran kamu tersimpan & tidak perlu diketik ulang tiap kali.
      </div>
    `;
  }
}
renderSessionBar();

function updateSubmitBtnState() {
  if (!submitBtn) return;
  if (currentSession && currentSession.jenis === "restoran" && !currentSession.terverifikasi) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `⏳ Menunggu Verifikasi Admin...`;
  } else {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `✨ Analisis Urgensi AI & Kirim Makanan`;
  }
}
updateSubmitBtnState();

if (currentSession && currentSession.jenis === "restoran" && currentSession.id) {
  onSnapshot(doc(db, "mitra_profiles", currentSession.id), (docSnap) => {
    if (docSnap.exists()) {
      const updatedData = docSnap.data();
      Object.assign(currentSession, updatedData);
      setSession(currentSession);
      renderSessionBar();
      updateSubmitBtnState();
    }
  });
}

// Preset default datetime-local ke 6 jam dari sekarang (agar praktis saat diuji)
const waktuBatasInput = document.getElementById("waktuBatas");
if (waktuBatasInput) {
  const futureDate = new Date(Date.now() + 6 * 60 * 60 * 1000);
  futureDate.setMinutes(futureDate.getMinutes() - futureDate.getTimezoneOffset());
  waktuBatasInput.value = futureDate.toISOString().slice(0, 16);
}

// ==============================================================================
// FITUR 1: ANALISIS URGENSI GEMINI AI & TAMBAH DOKUMEN FIRESTORE
// ==============================================================================
foodForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!currentSession || currentSession.jenis !== "restoran" || !currentSession.terverifikasi) {
    alert("⚠️ Akun Anda belum diverifikasi oleh admin. Silakan tunggu verifikasi admin sebelum menambahkan makanan.");
    return;
  }

  // Validasi Captcha
  const userCaptchaAnswer = parseInt(captchaAnswerInput.value, 10);
  if (isNaN(userCaptchaAnswer) || userCaptchaAnswer !== captchaSolution) {
    alert("❌ Jawaban CAPTCHA Anda salah! Silakan coba lagi.");
    generateCaptcha();
    return;
  }

  const namaRestoran = document.getElementById("namaRestoran").value.trim();
  const kontakRestoran = document.getElementById("kontakRestoran").value.trim();
  const namaMakanan = document.getElementById("namaMakanan").value.trim();
  const jumlahPorsi = parseInt(document.getElementById("jumlahPorsi").value, 10);
  const waktuBatas = document.getElementById("waktuBatas").value;
  const catatan = document.getElementById("catatan").value.trim();

  // Ubah status tombol menjadi loading
  submitBtn.disabled = true;
  submitBtn.innerHTML = `🤖 Gemini AI Menilai Urgensi...`;

  let skorUrgensi = 3; // Default score

  try {
    skorUrgensi = await hitungUrgensiDenganGemini(namaMakanan, jumlahPorsi, waktuBatas, catatan);
  } catch (err) {
    console.error("Gagal memanggil Gemini API, menggunakan fallback:", err);
    skorUrgensi = hitungUrgensiFallback(jumlahPorsi, waktuBatas);
  }

  // Simpan data ke collection "food_listings" di Firestore
  try {
    await addDoc(collection(db, "food_listings"), {
      namaRestoran,
      kontakRestoran,
      namaMakanan,
      jumlahPorsi,
      waktuBatas,
      catatan,
      skorUrgensi,
      status: "tersedia",
      penerima: "",
      mitraId: (currentSession && currentSession.jenis === "restoran") ? currentSession.id : null,
      lokasiLat: (currentSession && currentSession.jenis === "restoran") ? currentSession.lat : null,
      lokasiLng: (currentSession && currentSession.jenis === "restoran") ? currentSession.lng : null,
      timestamp: serverTimestamp()
    });

    // Reset Form setelah sukses
    foodForm.reset();
    generateCaptcha();

    // Kembalikan preset waktu default
    const futureDate = new Date(Date.now() + 6 * 60 * 60 * 1000);
    futureDate.setMinutes(futureDate.getMinutes() - futureDate.getTimezoneOffset());
    waktuBatasInput.value = futureDate.toISOString().slice(0, 16);

  } catch (error) {
    console.error("Gagal menyimpan data makanan ke Firestore:", error);
    alert("Terjadi kesalahan saat menyimpan ke Firestore.");
    generateCaptcha();
  } finally {
    updateSubmitBtnState();
  }
});

// Listener saat form direset
foodForm.addEventListener("reset", () => {
  generateCaptcha();
});

// ==============================================================================
// FUNGSI MEMANGGIL GEMINI API VIA ENDPOINT CLOUDFLARE PAGES FUNCTION (/api/urgency)
// ==============================================================================
async function hitungUrgensiDenganGemini(namaMakanan, jumlahPorsi, waktuBatas, catatan) {
  const response = await fetch("/api/urgency", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ namaMakanan, jumlahPorsi, waktuBatas, catatan })
  });

  if (!response.ok) {
    throw new Error(`HTTP Error status: ${response.status}`);
  }

  const data = await response.json();
  const score = parseInt(data.skor, 10);

  if (!isNaN(score) && score >= 1 && score <= 5) {
    return score;
  }
  return hitungUrgensiFallback(jumlahPorsi, waktuBatas);
}

// Fallback cerdas jika Gemini API tidak tersedia/error
function hitungUrgensiFallback(jumlahPorsi, waktuBatas) {
  const skrg = new Date();
  const batas = new Date(waktuBatas);
  const sisaJam = (batas - skrg) / (1000 * 60 * 60); // Sisa waktu dalam jam

  if (sisaJam <= 3 || jumlahPorsi >= 50) return 5;
  if (sisaJam <= 6 || jumlahPorsi >= 30) return 4;
  if (sisaJam <= 12 || jumlahPorsi >= 15) return 3;
  if (sisaJam <= 24) return 2;
  return 1;
}

// ==============================================================================
// FITUR 2: MENDENGARKAN DAFTAR LISTING SECARA REALTIME (READ REALTIME)
// ==============================================================================
const q = query(collection(db, "food_listings"), orderBy("timestamp", "desc"));

onSnapshot(q, (snapshot) => {
  restoranListings.innerHTML = "";

  if (snapshot.empty) {
    restoranListings.innerHTML = `<p class="empty-state">Belum ada makanan yang diinput hari ini. Yuk bagikan sisa makanan layak sekarang!</p>`;
    return;
  }

  snapshot.docs.forEach((docSnap) => {
    const data = docSnap.data();
    const docId = docSnap.id;

    const itemEl = document.createElement("div");
    itemEl.className = "food-item";

    let statusText = "";
    let actionBlockHtml = "";

    if (data.status === "tersedia") {
      statusText = `<span class="status-badge status-available">Tersedia</span>`;
    } else if (data.status === "menunggu konfirmasi") {
      statusText = `<span class="status-badge status-pending" style="background-color:#FEF3C7; color:#92400E;">⏳ Menunggu Konfirmasi</span>`;

      const porsiPenerima = data.jumlahOrangPenerima ? ` (${data.jumlahOrangPenerima} jiwa)` : "";

      actionBlockHtml = `
        <div class="claim-info-box" style="margin-top:12px; padding:12px; background-color:#FAF8F5; border:1px solid var(--border-color); border-radius:10px; font-size:0.88rem;">
          <div style="font-weight:700; color:var(--primary-dark); margin-bottom:6px;">📋 Informasi Klaim Penerima:</div>
          <div>👤 <strong>Nama:</strong> ${escapeHtml(data.penerima || '-')} ${porsiPenerima}</div>
          <div>📍 <strong>Alamat:</strong> ${escapeHtml(data.alamatPenerima || '-')}</div>
          <div>📞 <strong>Kontak:</strong> ${escapeHtml(data.kontakPenerima || '-')}</div>
          <p style="margin-top:8px; font-size:0.8rem; color:var(--text-muted); font-style:italic;">
            Silakan hubungi kontak di atas untuk verifikasi sebelum konfirmasi penyaluran final.
          </p>
          <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
            <button class="btn-confirm-final" data-id="${docId}" style="flex:1; padding:8px 12px; background-color:var(--primary); color:white; border:none; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer;">
              ✓ Konfirmasi Penyaluran Selesai
            </button>
            <button class="btn-reject-claim" data-id="${docId}" style="flex:1; padding:8px 12px; background-color:var(--urgency-high); color:white; border:none; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer;">
              ✕ Tolak / Data Tidak Valid
            </button>
          </div>
        </div>
      `;
    } else {
      statusText = `<span class="status-badge status-claimed">Sudah diklaim oleh: <strong>${escapeHtml(data.penerima || 'Penerima')}</strong> ${data.kontakPenerima ? `<small>(${escapeHtml(data.kontakPenerima)})</small>` : ''}</span>`;
    }

    const svgFlame = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3.5Z"/></svg>`;
    const svgBox = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`;
    const svgClock = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
    const svgNote = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`;
    const svgTrash = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
    const svgWA = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;

    // Tombol WA Share untuk seluruh listing makanan
    const waShareBtnHtml = `
      <a href="${createWhatsAppShareUrl(data.namaMakanan, data.jumlahPorsi, data.namaRestoran, data.waktuBatas, data.skorUrgensi)}" 
         target="_blank" rel="noopener noreferrer" class="btn-wa-share" title="Bagikan Makanan ini ke WhatsApp">
        ${svgWA} Bagikan ke WA
      </a>
    `;

    itemEl.innerHTML = `
      <div class="food-item-header">
        <div>
          <div class="food-name">${escapeHtml(data.namaMakanan)}</div>
          <small style="color: #68776C;">${escapeHtml(data.namaRestoran)}${data.kontakRestoran ? ` · WA: ${escapeHtml(data.kontakRestoran)}` : ''}</small>
        </div>
        <div style="display:flex; align-items:center; flex-wrap:wrap; gap:4px; justify-content:flex-end;">
          <span class="urgency-badge urgency-${data.skorUrgensi}">
            ${svgFlame} Urgensi ${data.skorUrgensi}/5
          </span>
          ${waShareBtnHtml}
        </div>
      </div>

      <div class="food-details">
        <div>${svgBox} <strong>Porsi:</strong> ${data.jumlahPorsi} Porsi</div>
        <div>${svgClock} <strong>Batas:</strong> ${formatDateTime(data.waktuBatas)}</div>
      </div>

      ${data.catatan ? `<div class="food-note">${svgNote} ${escapeHtml(data.catatan)}</div>` : ''}

      ${actionBlockHtml}

      <div class="food-footer" style="margin-top:10px;">
        ${statusText}
        <button class="btn-delete" data-id="${docId}">${svgTrash} Hapus</button>
      </div>
    `;

    restoranListings.appendChild(itemEl);
  });

  // Listener untuk tombol Konfirmasi Penyaluran Selesai
  document.querySelectorAll(".btn-confirm-final").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.currentTarget.getAttribute("data-id");
      if (confirm("Konfirmasi penyaluran makanan ini telah selesai & sampai ke penerima?")) {
        try {
          await updateDoc(doc(db, "food_listings", id), {
            status: "sudah diklaim"
          });
        } catch (err) {
          console.error("Gagal mengonfirmasi penyaluran:", err);
          alert("Gagal mengonfirmasi penyaluran.");
        }
      }
    });
  });

  // Listener untuk tombol Tolak / Data Tidak Valid
  document.querySelectorAll(".btn-reject-claim").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.currentTarget.getAttribute("data-id");
      if (confirm("Tolak klaim ini dan kembalikan makanan ke daftar tersedia?")) {
        try {
          await updateDoc(doc(db, "food_listings", id), {
            status: "tersedia",
            penerima: deleteField(),
            alamatPenerima: deleteField(),
            kontakPenerima: deleteField(),
            jumlahOrangPenerima: deleteField(),
            waktuDiklaim: deleteField()
          });
        } catch (err) {
          console.error("Gagal menolak klaim:", err);
          alert("Gagal menolak klaim.");
        }
      }
    });
  });

  // Listener untuk tombol Hapus pada tiap listing
  document.querySelectorAll(".btn-delete").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.currentTarget.getAttribute("data-id");
      if (confirm("Apakah Anda yakin ingin menghapus listing makanan ini?")) {
        try {
          await deleteDoc(doc(db, "food_listings", id));
        } catch (err) {
          console.error("Gagal menghapus listing:", err);
          alert("Gagal menghapus data.");
        }
      }
    });
  });

}, (error) => {
  console.error("Gagal memuat realtime listings:", error);
  restoranListings.innerHTML = `<p class="empty-state" style="color: red;">Gagal memuat data dari Firestore.</p>`;
});

// Helper formatting tanggal & waktu
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
