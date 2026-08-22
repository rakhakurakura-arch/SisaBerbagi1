/* ==============================================================================
 * ADMIN.JS - LOGIKA HALAMAN ADMIN PANEL (VERIFIKASI & KELOLA MITRA)
 * ==============================================================================
 * CATATAN KEAMANAN: Ini gerbang password sederhana untuk kebutuhan MVP/demo lomba
 * (sama level keamanannya dengan sistem PIN mitra yang sudah ada). Password
 * dicek di sisi client, JANGAN pakai halaman ini untuk data sensitif produksi
 * sungguhan tanpa migrasi ke sistem auth yang lebih kuat (mis. Firebase Auth
 * + Firestore Security Rules berbasis role admin).
 * ==============================================================================
 */

import { db, collection, onSnapshot, doc, updateDoc, deleteDoc } from "./firebase-config.js";

// GANTI PASSWORD INI SESUAI KEINGINAN KAMU SEBELUM DEPLOY!
const ADMIN_PASSWORD = "sisaberbagi-admin-2026";
const ADMIN_SESSION_KEY = "sisaberbagiAdminUnlocked";

const adminGate = document.getElementById("adminGate");
const adminContent = document.getElementById("adminContent");
const gateForm = document.getElementById("gateForm");
const gateErrorBox = document.getElementById("gateErrorBox");
const mitraListEl = document.getElementById("mitraList");

let allMitraData = [];
let currentFilter = "semua";

// ==============================================================================
// GERBANG PASSWORD (Session Storage: berlaku selama tab browser terbuka)
// ==============================================================================
function unlockAdmin() {
  adminGate.style.display = "none";
  adminContent.style.display = "block";
  sessionStorage.setItem(ADMIN_SESSION_KEY, "true");
  loadMitraData();
}

if (sessionStorage.getItem(ADMIN_SESSION_KEY) === "true") {
  unlockAdmin();
}

if (gateForm) {
  gateForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const inputPassword = document.getElementById("adminPassword").value;

    if (inputPassword === ADMIN_PASSWORD) {
      gateErrorBox.style.display = "none";
      unlockAdmin();
    } else {
      gateErrorBox.textContent = "Password salah. Silakan coba lagi.";
      gateErrorBox.style.display = "block";
    }
  });
}

// ==============================================================================
// MEMUAT & MENAMPILKAN DAFTAR MITRA (REALTIME)
// ==============================================================================
function loadMitraData() {
  onSnapshot(collection(db, "mitra_profiles"), (snapshot) => {
    allMitraData = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
    renderMitraList();
  }, (error) => {
    console.error("Gagal memuat data mitra:", error);
    mitraListEl.innerHTML = `<p class="empty-state" style="color:#C84B31;">⚠️ Gagal memuat data mitra dari Firestore.</p>`;
  });
}

function renderMitraList() {
  if (!mitraListEl) return;

  let filtered = allMitraData;
  if (currentFilter === "belum") {
    filtered = allMitraData.filter((m) => !m.terverifikasi);
  } else if (currentFilter === "sudah") {
    filtered = allMitraData.filter((m) => m.terverifikasi);
  }

  if (filtered.length === 0) {
    mitraListEl.innerHTML = `<p class="empty-state">Tidak ada data mitra untuk filter ini.</p>`;
    return;
  }

  mitraListEl.innerHTML = "";

  filtered.forEach((mitra) => {
    const card = document.createElement("div");
    card.className = "admin-mitra-card";

    const jenisLabel = mitra.jenis === "restoran" ? "🍱 Restoran / Toko" : "🏠 Panti / Komunitas";
    const badge = mitra.terverifikasi
      ? `<span class="badge-verified">✓ Terverifikasi</span>`
      : `<span class="badge-unverified">Belum diverifikasi</span>`;
    const lokasiInfo = (typeof mitra.lat === "number" && typeof mitra.lng === "number")
      ? "📍 Lokasi tersimpan"
      : "📍 Belum ada titik lokasi";

    card.innerHTML = `
      <div class="admin-mitra-info">
        <div class="admin-mitra-nama">${escapeHtml(mitra.nama || "Tanpa nama")} ${badge}</div>
        <div class="admin-mitra-sub">
          ${jenisLabel} · WA: ${escapeHtml(mitra.kontakWA || "-")}<br>
          ${escapeHtml(mitra.alamat || "Alamat belum diisi")}<br>
          ${lokasiInfo}
        </div>
      </div>
      <div class="admin-mitra-actions">
        ${mitra.terverifikasi
          ? `<button class="btn-admin-unverify" data-id="${mitra.id}" data-action="unverify">Batalkan Verifikasi</button>`
          : `<button class="btn-admin-verify" data-id="${mitra.id}" data-action="verify">✓ Verifikasi</button>`
        }
        <button class="btn-admin-delete" data-id="${mitra.id}" data-action="delete">🗑️ Hapus</button>
      </div>
    `;

    mitraListEl.appendChild(card);
  });

  // Pasang listener tombol verifikasi / batalkan verifikasi
  mitraListEl.querySelectorAll('[data-action="verify"]').forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.currentTarget.getAttribute("data-id");
      e.currentTarget.disabled = true;
      try {
        await updateDoc(doc(db, "mitra_profiles", id), { terverifikasi: true });
      } catch (err) {
        console.error("Gagal memverifikasi mitra:", err);
        alert("Gagal memverifikasi mitra. Silakan coba lagi.");
        e.currentTarget.disabled = false;
      }
    });
  });

  mitraListEl.querySelectorAll('[data-action="unverify"]').forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.currentTarget.getAttribute("data-id");
      try {
        await updateDoc(doc(db, "mitra_profiles", id), { terverifikasi: false });
      } catch (err) {
        console.error("Gagal membatalkan verifikasi:", err);
        alert("Gagal membatalkan verifikasi. Silakan coba lagi.");
      }
    });
  });

  // Pasang listener tombol hapus
  mitraListEl.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.currentTarget.getAttribute("data-id");
      const mitra = allMitraData.find((m) => m.id === id);
      const namaKonfirmasi = mitra ? mitra.nama : "mitra ini";

      if (!confirm(`Hapus profil "${namaKonfirmasi}" secara permanen? Marker di Peta Mitra juga akan otomatis hilang. Tindakan ini tidak bisa dibatalkan.`)) {
        return;
      }

      try {
        await deleteDoc(doc(db, "mitra_profiles", id));
      } catch (err) {
        console.error("Gagal menghapus mitra:", err);
        alert("Gagal menghapus mitra. Silakan coba lagi.");
      }
    });
  });
}

// ==============================================================================
// FILTER TAB (Semua / Belum Diverifikasi / Sudah Diverifikasi)
// ==============================================================================
document.querySelectorAll(".admin-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".admin-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    currentFilter = tab.getAttribute("data-filter");
    renderMitraList();
  });
});

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
