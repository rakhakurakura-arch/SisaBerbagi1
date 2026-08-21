/* ==============================================================================
 * LOGIN.JS - LOGIKA LOGIN MITRA (NOMOR WA + PIN)
 * ============================================================================== */

import { db, collection, query, where, getDocs } from "./firebase-config.js";
import { setSession } from "./session.js";

const form = document.getElementById("loginForm");
const btnLogin = document.getElementById("btnLogin");
const errorBox = document.getElementById("loginErrorBox");

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

    const wa = document.getElementById("loginWA").value.trim();
    const pin = document.getElementById("loginPin").value.trim();

    btnLogin.disabled = true;
    btnLogin.textContent = "Memeriksa...";

    try {
      const q = query(collection(db, "mitra_profiles"), where("kontakWA", "==", wa));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        showError("Nomor WhatsApp tidak ditemukan. Silakan daftar dulu sebagai mitra baru.");
        btnLogin.disabled = false;
        btnLogin.textContent = "Masuk";
        return;
      }

      const docSnap = snapshot.docs[0];
      const data = docSnap.data();

      if (data.pin !== pin) {
        showError("PIN salah. Silakan coba lagi.");
        btnLogin.disabled = false;
        btnLogin.textContent = "Masuk";
        return;
      }

      setSession({
        id: docSnap.id,
        jenis: data.jenis,
        nama: data.nama,
        kontakWA: data.kontakWA,
        alamat: data.alamat,
        lat: data.lat || null,
        lng: data.lng || null,
        terverifikasi: data.terverifikasi || false
      });

      window.location.href = data.jenis === "restoran" ? "restoran.html" : "penerima.html";

    } catch (error) {
      console.error("Gagal login:", error);
      showError("Terjadi kendala saat login. Silakan coba lagi.");
      btnLogin.disabled = false;
      btnLogin.textContent = "Masuk";
    }
  });
}
