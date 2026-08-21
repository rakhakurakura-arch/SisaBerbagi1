/* ==============================================================================
 * SESSION.JS - HELPER SESSION LOGIN MITRA (BERBASIS LOCALSTORAGE)
 * ==============================================================================
 * CATATAN KEAMANAN: Ini adalah sistem login ringan untuk kebutuhan MVP/demo
 * lomba. PIN disimpan sebagai teks biasa di Firestore, bukan di-hash. Untuk
 * versi produksi, sebaiknya migrasi ke Firebase Authentication yang sesungguhnya.
 * ==============================================================================
 */

const SESSION_KEY = "sisaberbagiMitraSession";

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function setSession(data) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
