/*
  Calendario "Entrenamientos" para suscribirse desde el iPhone (webcal).
  Lee la agenda privada (Firestore privado/agenda) y el estado de cada alumno en la app,
  y escribe public/cal/<token>.ics. Esa carpeta NO va a git (repositorio público): se sube con el sitio.

  node scripts/calendario.mjs          → genera el archivo
  node scripts/calendario.mjs --link   → muestra el link para suscribirse

  privado/agenda = { token, alumnos: { <cid>: { bloques:[{dias:["MO","WE"], desde:"07:00", hasta:"08:00"}],
                                                ausencias:["2026-12-02"], hasta:"2026-11-30" } } }
  Reglas: un alumno en pausa no aparece; con onlineDesde, lo presencial termina el día anterior.
*/
import { mkdirSync, writeFileSync, readdirSync, unlinkSync, existsSync } from "node:fs";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";

const proyecto = JSON.parse(readFileSync(new URL("../.firebaserc", import.meta.url), "utf8")).projects.default;
initializeApp({ credential: applicationDefault(), projectId: proyecto });
const db = getFirestore();
const ag = (await db.doc("privado/agenda").get()).data();
if (!ag || !ag.token) throw new Error("Falta privado/agenda con su token");
const url = `ramiro-cantu-entrenamiento.web.app/cal/${ag.token}.ics`;
if (process.argv.includes("--link")) { console.log("webcal://" + url + "\nhttps://" + url); process.exit(0); }

const clientes = Object.fromEntries((await db.collection("clientes").get()).docs.map(d => [d.id, d.data()]));
const DIAS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const z = n => String(n).padStart(2, "0");
const ymd = d => `${d.getUTCFullYear()}${z(d.getUTCMonth() + 1)}${z(d.getUTCDate())}`;
const parse = s => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const hm = s => String(s).replace(":", "") + "00";
const ahora = new Date(), hoyAR = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()));
const desdeBase = new Date(hoyAR.getTime() - 28 * 864e5);   // muestra las últimas 4 semanas
const stamp = ahora.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
const esc = t => String(t).replace(/[\\;,]/g, m => "\\" + m).replace(/\n/g, "\\n");

const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ramiro Cantu//Entrenamientos//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
  "X-WR-CALNAME:Entrenamientos", "X-WR-TIMEZONE:America/Argentina/Mendoza", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
  "BEGIN:VTIMEZONE", "TZID:America/Argentina/Mendoza", "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZOFFSETFROM:-0300", "TZOFFSETTO:-0300", "TZNAME:-03", "END:STANDARD", "END:VTIMEZONE"];
const resumen = [];
for (const [cid, a] of Object.entries(ag.alumnos || {})) {
  const c = clientes[cid]; if (!c) { resumen.push(`⚠ ${cid}: está en la agenda pero no en la app`); continue; }
  if (c.estado === "pausa") { resumen.push(`${c.nombre}: en pausa, no aparece`); continue; }
  let hasta = a.hasta ? parse(a.hasta) : null;
  if (c.onlineDesde) { const od = new Date(parse(c.onlineDesde).getTime() - 864e5); if (!hasta || od < hasta) hasta = od; }
  if (hasta && hasta < desdeBase) { resumen.push(`${c.nombre}: sin turnos presenciales vigentes`); continue; }
  const ini = c.fechaInicio && parse(c.fechaInicio) > desdeBase ? parse(c.fechaInicio) : desdeBase;
  const nombre = String(c.nombre).split(" ")[0];
  (a.bloques || []).forEach((b, bi) => {
    let d = new Date(ini); while (!b.dias.includes(DIAS[d.getUTCDay()])) d = new Date(d.getTime() + 864e5);
    // UNTIL en UTC: fin del día "hasta" en Mendoza (UTC-3)
    const until = hasta ? `;UNTIL=${ymd(new Date(hasta.getTime() + 864e5))}T025959Z` : "";
    L.push("BEGIN:VEVENT", `UID:${cid}-${bi}@ramiro-cantu-entrenamiento`, `DTSTAMP:${stamp}`,
      `SUMMARY:${esc("Entrenamiento - " + nombre)}`,
      `DTSTART;TZID=America/Argentina/Mendoza:${ymd(d)}T${hm(b.desde)}`, `DTEND;TZID=America/Argentina/Mendoza:${ymd(d)}T${hm(b.hasta)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${b.dias.join(",")}${until}`);
    for (const x of a.ausencias || []) { const dx = parse(x); if (b.dias.includes(DIAS[dx.getUTCDay()])) L.push(`EXDATE;TZID=America/Argentina/Mendoza:${ymd(dx)}T${hm(b.desde)}`); }
    L.push("END:VEVENT");
  });
  resumen.push(`${c.nombre}: ${(a.bloques || []).map(b => b.dias.join("/") + " " + b.desde + "-" + b.hasta).join(" + ")}${hasta ? " hasta " + hasta.toISOString().slice(0, 10) : ""}${(a.ausencias || []).length ? " · no viene: " + a.ausencias.join(", ") : ""}`);
}
L.push("END:VCALENDAR");
const dir = new URL("../public/cal/", import.meta.url);
mkdirSync(dir, { recursive: true });
for (const f of existsSync(dir) ? readdirSync(dir) : []) if (f.endsWith(".ics") && f !== ag.token + ".ics") unlinkSync(new URL(f, dir));
writeFileSync(new URL(ag.token + ".ics", dir), L.join("\r\n") + "\r\n");
console.log("Calendario generado:\n  " + resumen.join("\n  "));
