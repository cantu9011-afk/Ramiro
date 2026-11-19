# Sitio web de Ramiro Cantú Personalizados

Es la misma app de siempre (portada, alumnos, rutinas, dietas, cargas, cobros, encuestas, checklist de comidas y reloj de descansos), pero como **página web propia**, sin pasar por Claude. Cada persona entra con su cuenta de Google o con email y contraseña. Los datos quedan guardados en Firebase, el servicio de Google, que es gratis para este tamaño.

> Hasta que el sitio nuevo esté probado, seguí usando la app de siempre. No se rompe nada.

## Qué hay en la carpeta

| Carpeta / archivo | Qué es |
|---|---|
| `public/` | La página web tal cual se publica (`index.html`, fotos, video, íconos). |
| `public/config.js` | Los datos de conexión a tu proyecto de Firebase. Los completás vos (paso 3). |
| `src/adapter.js` | El "enchufe" que conecta la app con Firebase (inicio de sesión y base de datos). |
| `firestore.rules` | Quién puede ver qué: vos ves todo; cada alumno ve solo lo suyo. |
| `scripts/importar.mjs` | Pasa los datos de la app vieja (carpeta `datos/`) a Firebase. |
| `apps-script/` | Para que la encuesta de Google Forms siga llegando sola. |
| `original/app-original.html` | La app original, de referencia. |

La carpeta `datos/` (alumnos, pagos, medidas) **no está en git a propósito**. Guardala en tu compu y no la subas a ningún lado.

---

## Paso a paso para publicarla

### 1. Programas (una sola vez)

- **Node.js**: bajalo de https://nodejs.org (versión LTS) e instalalo.
- **Firebase CLI**: en la Terminal (Mac) o PowerShell (Windows):
  ```
  npm install -g firebase-tools
  firebase login
  ```
  Te abre el navegador para entrar con tu cuenta de Google.

### 2. Crear el proyecto en Firebase

1. Entrá a https://console.firebase.google.com → **Agregar proyecto** → ponele de nombre `ramiro-cantu`. Analytics no hace falta.
2. En el menú: **Compilación → Authentication → Comenzar**. Activá **Google** y **Correo electrónico/contraseña**.
3. **Compilación → Firestore Database → Crear base de datos**. Ubicación: `southamerica-east1 (São Paulo)`. Modo: producción.
4. **⚙ Configuración del proyecto → General → Tus apps →** ícono `</>` (web). Ponele un nombre cualquiera y tocá **Registrar**. Te muestra un bloque `firebaseConfig`: dejalo abierto para el paso siguiente.

### 3. Conectar la página con tu proyecto

- En `public/config.js`, reemplazá cada `PEGAR` por el valor que te mostró Firebase (`apiKey`, `authDomain`, `projectId`, etc.).
- En `.firebaserc`, reemplazá `pegar-id-del-proyecto` por el **ID del proyecto** (por ejemplo `ramiro-cantu-1a2b3`).

### 4. Pasar los datos de la app vieja

1. Copiá la carpeta `datos/` adentro de esta carpeta.
2. En Firebase: **⚙ Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada**. Se baja un `.json`: guardalo en esta carpeta con el nombre `clave-servicio.json`. **No lo mandes ni lo publiques nunca** (git ya lo ignora).
3. En la Terminal, parado en esta carpeta:
   ```
   npm install
   npm run importar -- --clave clave-servicio.json --email TU-EMAIL-DE-GOOGLE@gmail.com
   ```
   El email que pongas es el de la cuenta con la que vas a entrar vos: con esa cuenta la página te reconoce como **Entrenador**.

### 5. Publicar

```
npm run publicar
```

Al terminar te muestra la dirección del sitio, algo como `https://ramiro-cantu-1a2b3.web.app`. Ese es el link que les pasás a los alumnos.

Cada vez que cambies algo, volvés a correr `npm run publicar`.

---

## Volver a vincular a los alumnos que ya tenían cuenta

En la app vieja, los alumnos entraban con su cuenta de Claude. En el sitio nuevo entran con Google o con email, así que hay que vincularlos de nuevo. En los datos actuales eso le pasa a **Julia**. Sus cargas no se pierden: el importador las guarda en su ficha.

1. Pasale el link del sitio al alumno. Entra con **Ingresar** y ve el mensaje "Ramiro todavía no activó tu plan".
2. Vos entrás, abrís la ficha del alumno y desplegás **Acceso a la app**. Aparece su nombre: tocá **Vincular**.
3. Listo: el alumno recarga la página y ve su rutina, su dieta y sus cargas.

Con los alumnos nuevos es igual: les pasás el link, entran y los vinculás desde su ficha.

## Que la encuesta de Google Forms siga llegando sola

Las respuestas de la encuesta llegaban a "Encuestas recibidas" por una sincronización con la app vieja. Hay que mudarla al sitio nuevo:

1. Abrí la planilla de respuestas de la encuesta → **Extensiones → Apps Script**.
2. Pegá el contenido de `apps-script/encuesta-a-firestore.gs` y cambiá `PEGAR-ID-DEL-PROYECTO` por el ID de tu proyecto.
3. En **Configuración del proyecto** (el engranaje), tildá "Mostrar el archivo de manifiesto `appsscript.json`" y pegale el contenido de `apps-script/appsscript.json`.
4. Elegí la función **instalar** y tocá ▶ **Ejecutar**. Aceptá los permisos con la misma cuenta de Google del proyecto de Firebase.

Desde ese momento cada respuesta nueva aparece al instante en el sitio.

## Instalarla en el celular

Abrí el sitio en el celular:

- **iPhone (Safari)**: Compartir → **Agregar a inicio**.
- **Android (Chrome)**: menú ⋮ → **Instalar app** (o "Agregar a pantalla principal").

Queda con su ícono, como una app más.

## Dominio propio (opcional)

Si querés una dirección como `ramirocantu.com.ar`:

1. Comprala en https://nic.ar.
2. En Firebase: **Hosting → Agregar dominio personalizado**. Te indica dos registros para cargar en NIC.ar (en "Delegaciones", con un DNS como Cloudflare) y en unas horas queda andando.
3. Agregá el dominio en **Authentication → Configuración → Dominios autorizados**, así funciona el ingreso con Google.

## Probar en la compu sin tocar los datos reales

```
npm run probar
```

Levanta un Firebase de mentira en tu compu. Para usarlo, en `public/config.js` poné `emuladores: true`, `projectId: "demo-ramiro"` y cualquier valor en `apiKey`. Después importá los datos con:

```
npm run importar -- --emulador --email prueba@ejemplo.com
```

Abrí `http://localhost:5000`. **Antes de publicar, volvé a poner `emuladores: false` y los datos reales.**
