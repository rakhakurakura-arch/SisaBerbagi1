/* ==============================================================================
 * FIREBASE CONFIGURATION (MODULAR ES MODULES)
 * ==============================================================================
 * File ini menginisialisasi Firebase Firestore dan mengekspor variabel `db`
 * serta fungsi-fungsi Firestore agar bisa digunakan bersama oleh restoran.js
 * dan penerima.js tanpa duplikasi konfigurasi.
 * ==============================================================================
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  deleteField,
  doc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  runTransaction,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Konfigurasi Firebase dari project platform-food-waste Anda
const firebaseConfig = {
  apiKey: "AIzaSyCGwJwirzM3ijEkDdU51Tb4LBj1JG_kmWk",
  authDomain: "platform-food-waste.firebaseapp.com",
  projectId: "platform-food-waste",
  storageBucket: "platform-food-waste.firebasestorage.app",
  messagingSenderId: "125556305585",
  appId: "1:125556305585:web:437b4a978c9e94be28bc90",
  measurementId: "G-8M6H89D91L"
};

// Inisialisasi Firebase App & Firestore
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Ekspor fungsi-fungsi Firestore helper agar bisa dipakai di modul lain
export { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  deleteField,
  doc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  runTransaction,
  getDocs
};
