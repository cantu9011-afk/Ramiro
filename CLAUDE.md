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

## Cómo quiere trabajar Ramiro (reglas fijas)

1. Sos su socio de trabajo, no una herramienta genérica. No le des la razón en todo: si algo no es óptimo, refutalo.
2. **Pendientes primero**: al empezar cada conversación, lo primero de la respuesta son sus pendientes (están en el contexto privado, ver abajo).
3. **Nunca cambies algo sin acomodar lo que depende**: si cambia un alimento, reajustá las cantidades a los macros objetivo, con totales que salgan de la suma real. Si cambia un ejercicio, corregí la técnica, el video, etc.
4. Al arreglar algo, no rompas ni saques lo que ya funcionaba.
5. **Verificá visualmente** todo entregable antes de mandarlo (capturas, no solo "no hay errores").
6. Nombres de ejercicios en español (excepciones: "curl" para bíceps, "peck deck" y "peck deck invertido").
7. Cuando avisa que cambió algo, actualizá solo todo lo que depende.
8. Antes de dar un trabajo por terminado, contale qué aprendiste del trabajo (criterios compartidos, no solo reglas).
9. Mensajes de cobro: solo las clases y el total, nunca el precio por clase.
10. **No cambiar el diseño ni el comportamiento de la app** sin avisarle.

Criterios de entrenamiento (incluye a sus referentes Ariel Couceiro y Horacio Anselmi): `docs/criterios-de-entrenamiento.md`.
Marca: "RAMIRO CANTÚ: Entrenamientos personalizados", rojo, negro y blanco (nada de azul). Pilares: Disciplina, Ciencia y Perseverancia.

## Privacidad (el repositorio es PÚBLICO)

- Nunca subir a git datos de alumnos (salud, medidas, cobros, horarios), `datos/` ni la clave de servicio.
- El **contexto privado completo** (alumnos, cobros, pendientes, recordatorios) está en Firestore `privado/contexto` (campo `claudeMd`), solo accesible con credenciales de administrador del proyecto. Ramiro también tiene una copia en su compu.
- Commits chicos con mensajes en español.

## Ciclos nuevos

Al empezar un ciclo nuevo (cambia `fechaInicio`), cargá antes `fechaAlta` si el alumno no la tiene: los vencimientos de las cuotas usan `fechaAlta` y, si falta, `fechaInicio`, así que sin ella el día de cobro se corre. El ciclo anterior va a `ciclos` y `semLabels` arranca el lunes del ciclo.

## Publicar

`npm run publicar`: arma el conector, marca la versión (fecha y hora en `VERSION_APP` y `public/version.json`) y sube el sitio. La página compara su versión con `version.json` al volver a abrirse y se recarga sola (nunca en medio de un entreno ni con el editor abierto). Ver la versión al pie de la portada.

## Calendario y revisión diaria

- Calendario "Entrenamientos" (suscripción del iPhone): `scripts/calendario.mjs` lo genera desde Firestore `privado/agenda` (bloques por alumno, ausencias, fecha de fin, token del link) y el estado de cada alumno en la app (en pausa no aparece; con `onlineDesde`, lo presencial termina el día anterior). Escribe `public/cal/<token>.ics`, que **no va a git** y se sube con `npm run publicar`. El link sale con `node scripts/calendario.mjs --link`.
- Toda alta, baja, cambio de horario, pausa o vacaciones se hace en la app **y** en `privado/agenda`, y después `npm run publicar`.
- Revisión automática (6:41 y 14:41, hora de Mendoza): `scripts/revision.mjs` con las filas de la planilla de la encuesta leídas por el conector de Google Sheets.

## Probar

`firebase emulators:start --only auth,firestore --project demo-ramiro` + `node scripts/importar.mjs --emulador --email ...` + servir `public/` con un `config.js` que tenga `emuladores:true` y `projectId:"demo-ramiro"`.
