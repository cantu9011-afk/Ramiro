# Proyecto: sitio web de "Ramiro Cantú Personalizados"

Hablale a Ramiro en español rioplatense y sin tecnicismos innecesarios. Ramiro es entrenador personal en Mendoza y no es programador. Explicale cada paso que tenga que hacer él de forma corta y clara.

## Estado

La app original (`original/app-original.html`, que funcionaba como artifact de claude.ai) ya es un sitio estático sobre Firebase:

- `public/index.html`: la app, con el mismo HTML/CSS/JS. Las fotos y el video están en `public/media/`. Los únicos cambios son textos que nombraban a Claude, el botón Ingresar/Salir y la carga del conector.
- `src/adapter.js` → `npm run build` → `public/js/firebase-adapter.js`: expone `claude.use("db")` y `claude.use("user")` con la misma API que antes, sobre Firebase Auth y Firestore. El HTML trae un stub que encola las llamadas hasta que carga el bundle (que se carga con `defer`).
  - Las listas dentro de listas se guardan como `{__arr:[…]}` y se decodifican al leer. Pasa con `admisiones.respuestas`.
  - `permission-denied` se traduce a `code:"invalid_argument"`, que es lo que espera la app.
  - Entrenador = cuenta cuyo email verificado coincide con `config/owner.email` (lo escribe `scripts/importar.mjs`).
  - `user.profiles()` lee `perfiles/<uid>`, que se escribe al iniciar sesión.
- `firestore.rules`: equivalentes a los permisos de la app vieja.
- `scripts/importar.mjs`: importa `datos/` (no está en git). Quita los `uid` viejos de claude.ai y pasa `registros/<uid viejo>` a `cargas/<cid>`, así se re-vinculan con el botón Vincular de la ficha.
- `apps-script/`: sincroniza la encuesta de Google Forms con `admisiones/form-AAAAMMDDhhmmss`.

## Reglas

- **No cambiar el diseño ni el comportamiento** sin avisarle a Ramiro.
- Los nombres de ejercicios van en español (excepción: bíceps se dice "curl").
- En los mensajes de cobro no se muestra precio por clase, solo clases y total.
- `datos/` y la clave de servicio nunca van a git.
- Commits chicos con mensajes en español.

## Probar

`firebase emulators:start --only auth,firestore --project demo-ramiro` + `node scripts/importar.mjs --emulador --email ...` + servir `public/` con un `config.js` que tenga `emuladores:true` y `projectId:"demo-ramiro"`.
