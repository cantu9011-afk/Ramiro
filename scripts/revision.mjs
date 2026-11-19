/*
  Revisión de la app (la corre Claude en la revisión diaria).
  Muestra: alumnos que entraron y esperan que los vincules, encuestas sin ficha,
  ciclos por terminar o terminados, y quién está vinculado.

  node scripts/revision.mjs [respuestas.json]
    respuestas.json (opcional): filas de la planilla de la encuesta ([[titulos...], [fila...], ...]),
    leídas con el conector de Google Sheets. Las que falten en la app se cargan en admisiones/form-AAAAMMDDhhmmss.
  Usa la sesión de gcloud (application-default) y el proyecto de .firebaserc.
*/
import { readFileSync, existsSync } from "node:fs";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const proyecto = JSON.parse(readFileSync(new URL("../.firebaserc", import.meta.url), "utf8")).projects.default;
initializeApp({ credential: applicationDefault(), projectId: proyecto });
const db = getFirestore();
const hoy = new Date(Date.now() - 3 * 3600e3); hoy.setUTCHours(0, 0, 0, 0);
const iso = d => d.toISOString().slice(0, 10);
const fecha = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || "")); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null; };
const dm = d => d.getUTCDate() + "/" + (d.getUTCMonth() + 1);

const [cl, sol, adm, per] = await Promise.all(["clientes", "solicitudes", "admisiones", "perfiles"].map(c => db.collection(c).get()));
const clientes = Object.fromEntries(cl.docs.map(d => [d.id, d.data()]));
const perfiles = Object.fromEntries(per.docs.map(d => [d.id, d.data()]));
const usados = new Set(Object.values(clientes).map(c => c.uid).filter(Boolean));
const out = [];

// 1) encuestas nuevas desde la planilla
const arg = process.argv[2];
if (arg && existsSync(arg)) {
  const filas = JSON.parse(readFileSync(arg, "utf8")); const tit = filas[0] || [];
  const ya = new Set(adm.docs.map(d => d.id)); let nuevas = 0;
  for (let i = 1; i < filas.length; i++) {
    const f = filas[i]; if (!f || !f[0]) continue;
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2})/.exec(f[0]); if (!m) continue;
    const z = n => String(n).padStart(2, "0");
    const id = `form-${m[3]}${z(m[2])}${z(m[1])}${z(m[4])}${m[5]}${m[6]}`;
    if (ya.has(id)) continue;
    const respuestas = tit.map((t, k) => ({ __arr: [String(t), String(f[k] ?? "")] })).filter(x => x.__arr[0]);
    await db.doc("admisiones/" + id).set({ fecha: `${m[3]}-${z(m[2])}-${z(m[1])}T${z(m[4])}:${m[5]}:${m[6]}-03:00`, fila: String(i + 1), origen: "google", respuestas });
    out.push(`🆕 Encuesta nueva cargada en la app: ${f[1] || "(sin nombre)"} (${f[0]})`); nuevas++;
  }
  if (!nuevas) out.push("Encuestas: no hay respuestas nuevas en la planilla.");
}

// 2) encuestas sin ficha
for (const d of adm.docs) { const a = d.data(); if (a.cid && clientes[a.cid]) continue;
  const nom = (Array.isArray(a.respuestas) ? (a.respuestas.find(x => /^nombre/i.test((x.__arr || x)[0])) || {}).__arr?.[1] : a.respuestas?.nombre) || "?";
  out.push(`📋 Encuesta sin ficha armada: ${String(nom).trim()} (${String(a.fecha || "").slice(0, 10)}) → armar rutina y dieta`); }

// 3) alumnos que entraron y esperan vinculación
for (const d of sol.docs) { if (usados.has(d.id)) continue; const p = perfiles[d.id] || {};
  out.push(`🙋 Entró a la app y espera que lo vincules: ${p.name || "(sin nombre)"}${p.email ? " <" + p.email + ">" : ""} desde ${String(d.data().fecha || "").slice(0, 10)}`); }

// 4) ciclos y estado de cada alumno
for (const [cid, c] of Object.entries(clientes)) {
  if (c.soloEntrenador) continue;
  const ini = fecha(c.fechaInicio), n = Number(c.semanas) || 8;
  const pausa = c.estado === "pausa" || c.estado === "En pausa";
  let txt = `${c.nombre}: ${pausa ? "EN PAUSA" : "activo"}${c.uid ? ", vinculado" : ", SIN VINCULAR"}`;
  if (ini && !pausa) { const sem = Math.floor((hoy - ini) / (7 * 864e5)) + 1, fin = new Date(ini.getTime() + n * 7 * 864e5);
    txt += `, semana ${sem} de ${n} (ciclo ${sem > n ? "TERMINADO el " + dm(fin) : "termina el " + dm(fin)})`;
    if (sem > n) out.push(`🔁 Ciclo terminado: ${c.nombre} → armar el ciclo nuevo (cambia el estímulo, no los ejercicios)`);
    else if (sem >= Math.min(6, n)) out.push(`⏰ ${c.nombre} está en la semana ${sem} de ${n}: revisar la rutina`); }
  out.push("   · " + txt);
}
console.log(`Revisión de la app · ${iso(hoy)}\n` + out.join("\n"));
