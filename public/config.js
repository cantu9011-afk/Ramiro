/*
  Datos de conexión a Firebase. NO son secretos (cualquier página web de Firebase los muestra);
  la seguridad la dan las reglas de firestore.rules.

  Dónde encontrarlos: consola de Firebase → ⚙ Configuración del proyecto → General →
  "Tus apps" → app web → "Configuración del SDK" → Config. Copiá los valores acá.
*/
window.RC_FIREBASE = {
  apiKey: "PEGAR",
  authDomain: "PEGAR.firebaseapp.com",
  projectId: "PEGAR",
  storageBucket: "PEGAR.firebasestorage.app",
  messagingSenderId: "PEGAR",
  appId: "PEGAR",
  // true solo para probar en la compu con los emuladores (npm run probar)
  emuladores: false
};
