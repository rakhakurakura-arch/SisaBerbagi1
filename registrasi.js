/* ==============================================================================
 * REGISTRASI.JS - LOGIKA PENDAFTARAN MITRA BARU (RESTORAN / PENERIMA)
 * ============================================================================== */

import { db, collection, addDoc, query, where, getDocs, serverTimestamp } from "./firebase-config.js";
import { setSession } from "./session.js";

const form = document.getElementById("registrasiForm");
const btnDaftar = document.getElementById("btnDaftar");
const errorBox = document.getElementById("regErrorBox");
const btnAmbilLokasi = document.getElementById("btnAmbilLokasi");
const lokasiStatus = document.getElementById("lokasiStatus");
const mitraLatInput = document.getElementById("mitraLat");
const mitraLngInput = document.getElementById("mitraLng");
const jiwaDilayaniWrapper = document.getElementById("jiwaDilayaniWrapper");
const jiwaDilayaniInput = document.getElementById("jiwaDilayani");
const jenisMitraRadios = document.querySelectorAll('input[name="jenisMitra"]');

// ==============================================================================
// TOGGLE VISIBILITY FIELD JUMLAH JIWA DILAYANI BERDASARKAN ROLE
// ==============================================================================
function toggleJiwaDilayani() {
  const selectedRole = document.querySelector('input[name="jenisMitra"]:checked')?.value;
  if (jiwaDilayaniWrapper) {
    if (selectedRole === "restoran") {
      jiwaDilayaniWrapper.style.display = "none";
      if (jiwaDilayaniInput) jiwaDilayaniInput.value = "";
    } else {
      jiwaDilayaniWrapper.style.display = "";
    }
  }
}

jenisMitraRadios.forEach((radio) => {
  radio.addEventListener("change", toggleJiwaDilayani);
});

// Jalankan sekali di awal saat halaman dimuat
toggleJiwaDilayani();

// ==============================================================================
// CAPTCHA MATEMATIKA SEDERHANA
// ==============================================================================
let captchaResult = 0;
function generateCaptcha() {
  const a = Math.floor(Math.random() * 10) + 1;
  const b = Math.floor(Math.random() * 10) + 1;
  captchaResult = a + b;
  document.getElementById("captchaQuestionReg").textContent = `${a} + ${b} = ?`;
}
generateCaptcha();

// ==============================================================================
// TOMBOL AMBIL LOKASI (BROWSER GEOLOCATION API)
// ==============================================================================
if (btnAmbilLokasi) {
  btnAmbilLokasi.addEventListener("click", () => {
    if (!navigator.geolocation) {
      lokasiStatus.textContent = "⚠️ Browser kamu tidak mendukung fitur lokasi.";
      lokasiStatus.classList.remove("success");
      return;
    }

    lokasiStatus.textContent = "📍 Mengambil lokasi...";
    lokasiStatus.classList.remove("success");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        mitraLatInput.value = pos.coords.latitude;
        mitraLngInput.value = pos.coords.longitude;
        lokasiStatus.textContent = `✅ Lokasi berhasil diambil (akurasi ~${Math.round(pos.coords.accuracy)}m)`;
        lokasiStatus.classList.add("success");
      },
      (err) => {
        lokasiStatus.textContent = "⚠️ Gagal mengambil lokasi. Izinkan akses lokasi di browser, atau lewati langkah ini (alamat teks tetap tersimpan).";
        lokasiStatus.classList.remove("success");
      }
    );
  });
}

// ==============================================================================
// SUBMIT FORM REGISTRASI
// ==============================================================================
function showError(msg) {
  errorBox.textContent = msg;
  errorBox.style.display = "block";
}

function hideError() {
  errorBox.style.display = "none";
}

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError();

    const jenisMitra = document.querySelector('input[name="jenisMitra"]:checked').value;
    const namaMitra = document.getElementById("namaMitra").value.trim();
    const kontakMitra = document.getElementById("kontakMitra").value.trim();
    const alamatMitra = document.getElementById("alamatMitra").value.trim();
    const jiwaRaw = document.getElementById("jiwaDilayani") ? document.getElementById("jiwaDilayani").value.trim() : "";
    const jumlahJiwaDilayani = jiwaRaw ? parseInt(jiwaRaw, 10) : null;
    const pinMitra = document.getElementById("pinMitra").value.trim();
    const pinKonfirmasi = document.getElementById("pinKonfirmasi").value.trim();
    const captchaAnswer = document.getElementById("captchaAnswerReg").value.trim();

    // Validasi CAPTCHA
    if (parseInt(captchaAnswer, 10) !== captchaResult) {
      showError("Jawaban CAPTCHA salah. Silakan coba lagi.");
      generateCaptcha();
      document.getElementById("captchaAnswerReg").value = "";
      return;
    }

    // Validasi PIN
    if (!/^[0-9]{4,6}$/.test(pinMitra)) {
      showError("PIN harus berupa 4-6 digit angka.");
      return;
    }
    if (pinMitra !== pinKonfirmasi) {
      showError("PIN dan konfirmasi PIN tidak cocok.");
      return;
    }

    btnDaftar.disabled = true;
    btnDaftar.textContent = "Memproses...";

    try {
      // Cek apakah nomor WA sudah pernah dipakai daftar
      const cekQuery = query(collection(db, "mitra_profiles"), where("kontakWA", "==", kontakMitra));
      const cekSnapshot = await getDocs(cekQuery);

      if (!cekSnapshot.empty) {
        showError("Nomor WhatsApp ini sudah terdaftar. Silakan login, atau gunakan nomor lain.");
        btnDaftar.disabled = false;
        btnDaftar.textContent = "Daftar & Masuk";
        return;
      }

      const docRef = await addDoc(collection(db, "mitra_profiles"), {
        jenis: jenisMitra,
        nama: namaMitra,
        kontakWA: kontakMitra,
        alamat: alamatMitra,
        jumlahJiwaDilayani: jumlahJiwaDilayani,
        pin: pinMitra,
        lat: mitraLatInput.value ? parseFloat(mitraLatInput.value) : null,
        lng: mitraLngInput.value ? parseFloat(mitraLngInput.value) : null,
        terverifikasi: false,
        createdAt: serverTimestamp()
      });

      // Auto-login setelah daftar
      setSession({
        id: docRef.id,
        jenis: jenisMitra,
        nama: namaMitra,
        kontakWA: kontakMitra,
        alamat: alamatMitra,
        jumlahJiwaDilayani: jumlahJiwaDilayani,
        lat: mitraLatInput.value ? parseFloat(mitraLatInput.value) : null,
        lng: mitraLngInput.value ? parseFloat(mitraLngInput.value) : null,
        terverifikasi: false
      });

      window.location.href = jenisMitra === "restoran" ? "restoran.html" : "penerima.html";

    } catch (error) {
      console.error("Gagal mendaftarkan mitra:", error);
      showError("Terjadi kendala saat mendaftar. Silakan coba lagi.");
      btnDaftar.disabled = false;
      btnDaftar.textContent = "Daftar & Masuk";
    }
  });
}
