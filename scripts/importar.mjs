/*
  Importa la copia de datos de la app vieja (carpeta datos/) a Cloud Firestore.

  Uso:
    node scripts/importar.mjs --clave clave-servicio.json --email tu-email@gmail.com
    node scripts/importar.mjs --emulador --email entrenador@ejemplo.com     (prueba local)

  Opciones:
    --clave <archivo>   clave de servicio descargada de Firebase (nunca subirla a git)
    --email <email>     email de la cuenta de Google con la que entra Ramiro (queda como entrenador)
    --datos <carpeta>   carpeta con la copia (por defecto ./datos)
    --forzar            importar aunque Firestore ya tenga alumnos (pisa lo que haya)
    --emulador          usar el emulador local (127.0.0.1:8080) en vez de la base real

  Qué hace con los alumnos que estaban vinculados en la app vieja:
    sus ids de usuario eran de claude.ai y en el sitio nuevo cambian. Por eso se les quita el
    vínculo (campo uid) y sus cargas (registros/<id viejo>) pasan a cargas/<alumno>. Cuando el
    alumno entra al sitio nuevo, Ramiro lo vincula de nuevo desde su ficha y las cargas lo siguen.
    Los avisos de ingreso y los planes copiados viejos no se importan (se regeneran solos).
*/
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf("--" + n); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : true) : null; };
const carpeta = resolve(opt("datos") || "datos");
const email = typeof opt("email") === "string" ? opt("email").trim().toLowerCase() : null;
const emulador = !!opt("emulador");

if (!email || !email.includes("@")) { console.error("Falta --email con el email de Ramiro."); process.exit(1); }
if (!existsSync(carpeta)) { console.error("No encuentro la carpeta de datos: " + carpeta); process.exit(1); }

if (emulador) {
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
  initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-ramiro" });
} else {
  const clave = opt("clave");
  if (typeof clave !== "string" || !existsSync(clave)) { console.error("Falta --clave con el archivo de clave de servicio (.json)."); process.exit(1); }
  const sa = JSON.parse(readFileSync(clave, "utf8"));
  initializeApp({ credential: cert(sa), projectId: sa.project_id });
}
const db = getFirestore();

/* Firestore no admite listas dentro de listas: se guardan como {__arr:[…]} (la página las vuelve a armar). */
function enc(v) {
  if (Array.isArray(v)) return v.map(x => (Array.isArray(x) ? { __arr: enc(x) } : enc(x)));
  if (v && typeof v === "object") { const o = {}; for (const k of Object.keys(v)) if (v[k] !== undefined) o[k] = enc(v[k]); return o; }
  return v;
}

function leer() {
  const out = {};
  for (const col of readdirSync(carpeta)) {
    const dir = join(carpeta, col);
    if (!statSync(dir).isDirectory()) continue;
    out[col] = {};
    for (const f of readdirSync(dir)) {
      if (f.startsWith(".") || !f.endsWith(".json")) continue;
      out[col][f.slice(0, -5)] = JSON.parse(readFileSync(join(dir, f), "utf8"));
    }
  }
  return out;
}

const datos = leer();
const C = n => datos[n] || {};

const ya = await db.collection("clientes").limit(1).get();
if (!ya.empty && !opt("forzar")) {
  console.error("Firestore ya tiene alumnos cargados. Para no pisar datos nuevos no importo nada.\nSi de verdad querés reemplazar todo, agregá --forzar.");
  process.exit(1);
}

const escrituras = [];
const poner = (path, data) => escrituras.push([path, enc(data)]);

// alumnos (sin el vínculo viejo) y sus cargas
const vinculados = new Set();
for (const [cid, c] of Object.entries(C("clientes"))) {
  const copia = { ...c };
  if (copia.uid) {
    const reg = C("registros")[copia.uid];
    if (reg) poner("cargas/" + cid, reg);
    else if (C("cargas")[cid]) poner("cargas/" + cid, C("cargas")[cid]);
    vinculados.add(copia.uid);
    console.log(`· ${c.nombre || cid}: estaba vinculado; queda para volver a vincular (sus cargas se mantienen).`);
    delete copia.uid;
  }
  poner("clientes/" + cid, copia);
}
for (const [cid, x] of Object.entries(C("cargas"))) {
  const c = C("clientes")[cid];
  if (c && c.uid && C("registros")[c.uid]) continue; // ya se usó la versión más nueva
  poner("cargas/" + cid, x);
}
for (const [id, x] of Object.entries(C("pagos"))) poner("pagos/" + id, x);
for (const [id, x] of Object.entries(C("admisiones"))) poner("admisiones/" + id, x);
// registros/checks de cuentas viejas: se guardan como respaldo (no molestan, nadie más los ve)
for (const [id, x] of Object.entries(C("registros"))) if (!vinculados.has(id)) poner("registros/" + id, x);
for (const [id, x] of Object.entries(C("checks"))) poner("checks/" + id, x);

poner("config/owner", { email });

let n = 0;
for (let i = 0; i < escrituras.length; i += 400) {
  const lote = db.batch();
  for (const [path, data] of escrituras.slice(i, i + 400)) { lote.set(db.doc(path), data); n++; }
  await lote.commit();
}
const resumen = {};
for (const [p] of escrituras) { const k = p.split("/")[0]; resumen[k] = (resumen[k] || 0) + 1; }
console.log(`\nListo: ${n} documentos importados${emulador ? " (emulador)" : ""}.`);
for (const [k, v] of Object.entries(resumen)) console.log(`  ${k}: ${v}`);
console.log(`Entrenador: ${email}`);
