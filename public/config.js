/*
  Datos de conexión a Firebase. NO son secretos (cualquier página web de Firebase los muestra);
  la seguridad la dan las reglas de firestore.rules.

  Dónde encontrarlos: consola de Firebase → ⚙ Configuración del proyecto → General →
  "Tus apps" → app web → "Configuración del SDK" → Config. Copiá los valores acá.
*/
window.RC_FIREBASE = {
  apiKey: "AIzaSyD8j3asmx7i0phAHjAY1QU4AfGrcwlkD6E",
  authDomain: "ramiro-cantu-entrenamiento.firebaseapp.com",
  projectId: "ramiro-cantu-entrenamiento",
  storageBucket: "ramiro-cantu-entrenamiento.firebasestorage.app",
  messagingSenderId: "57457425126",
  appId: "1:57457425126:web:f2b022cfb76475d9691927",
  // true solo para probar en la compu con los emuladores (npm run probar)
  emuladores: false
};
