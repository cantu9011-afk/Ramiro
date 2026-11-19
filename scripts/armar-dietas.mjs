/*
  Arma planes de alimentación "por opciones" acordes a cada momento del día,
  con las cantidades calculadas para las calorías y macros objetivo de cada alumno.

  Usa la misma base de alimentos que la página (SW_RAW en public/index.html).
  node scripts/armar-dietas.mjs <entrada.json> <salida.json> [cid ...]
    entrada.json: {cid: cliente}   salida.json: {cid: dieta nueva}
*/
import { readFileSync, writeFileSync } from "node:fs";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const raw = html.slice(html.indexOf("const SW_RAW = [") + 15, html.indexOf("];", html.indexOf("const SW_RAW = [")) + 1);
const SW_RAW = eval(raw);
const SW = {};
for (const [n, gr, s, pl, g, est, p, f, c, paso, tags] of SW_RAW) SW[n] = { n, grupo: gr, tags, paso, u: { s, pl, gr: g, estado: est, p, g: f, c, ...(gr === "lacteos" ? { un: "ml" } : {}) } };
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const permitido = (n, noCome) => !noCome.some(w => norm(n + " " + SW[n].tags).includes(w));
const paso = n => { const f = SW[n]; return f.paso === "g" ? 5 / f.u.gr : f.paso; };
const redondear = (n, q, min) => { const st = paso(n); return Math.max(min ?? st, Math.round(q / st) * st); };
const item = (n, q) => { const u = { ...SW[n].u }; const it = { alimento: n, cantidad: Math.round(q * 1000) / 1000, u };
  it.p = Math.round(u.p * q * 10) / 10; it.g = Math.round(u.g * q * 10) / 10; it.c = Math.round(u.c * q * 10) / 10; it.kcal = Math.round(4 * it.p + 9 * it.g + 4 * it.c); return it; };
const tot = items => items.reduce((a, i) => ({ p: a.p + i.p, g: a.g + i.g, c: a.c + i.c, kcal: a.kcal + i.kcal }), { p: 0, g: 0, c: 0, kcal: 0 });

/* primer alimento permitido de una lista de preferencias */
const elegir = (lista, noCome) => lista.find(n => SW[n] && permitido(n, noCome));

/* plantillas por momento del día: slots [grupo, macro que resuelve, preferencias] */
function plantilla(tipo, ctx, noCome) {
  const fruta = ctx.pre || ctx.post ? ["Banana", "Manzana", "Pera"] : ctx.i % 2 ? ["Manzana", "Frutillas", "Naranja", "Pera"] : ["Frutillas", "Naranja", "Manzana", "Pera"];
  if (tipo === "principal") return [
    ["carnes", "p", ctx.cena ? ["Vacuno magro (peceto, nalga o cuadrada)", "Pechuga de pollo sin piel", "Lomo de cerdo magro"] : ["Pechuga de pollo sin piel", "Merluza", "Vacuno magro (peceto, nalga o cuadrada)", "Pechuga de pavo"]],
    ["carbos", "c", ctx.cena ? ["Batata", "Papa", "Arroz blanco"] : ["Arroz blanco", "Fideos secos (cortos)", "Papa"]],
    ["verduras", "fijo", ["Verduras verdes (zapallito, brócoli, espinaca)", ctx.cena ? "Zapallo anco" : "Ensalada de tomate y zanahoria", "Ensalada de lechuga y tomate"]],
    ["grasas", "g", ["Aceite de oliva", "Aceite de girasol o canola"]]];
  if (tipo === "post") return [
    ["protdes", "p", ["Proteína whey", "Yogur griego descremado", "Yogur Ser Pro+ frutos rojos"]],
    ["carbdes", "c", ["Galletas de arroz", "Pan integral de molde", "Avena"]],
    ["frutas", "c2", fruta]];
  // desayuno / merienda / colación
  const prot = ctx.sinLacteoManiana ? ["Huevo entero"] : ctx.desayuno ? ["Huevo entero", "Yogur griego descremado"] : ["Yogur griego descremado", "Huevo entero", "Queso magro (port salut light)"];
  return [
    ["protdes", "p", prot],
    ["carbdes", "c", ctx.desayuno ? ["Pan integral de molde", "Galletas de arroz", "Avena"] : ["Avena", "Pan integral de molde", "Galletas de arroz"]],
    ["frutas", "c2", fruta],
    ["grasas", "g", ctx.desayuno ? ["Palta", "Almendras", "Nueces"] : ["Almendras", "Nueces", "Semillas de chía"]]];
}

function tipoDe(m) {
  const t = norm(m.nombre + " " + (m.hora || ""));
  if (/almuerzo|cena/.test(norm(m.nombre))) return "principal";
  if (/post/.test(t) && !/desayuno|merienda/.test(norm(m.nombre))) return "post";
  return "snack";
}

/* porciones máximas razonables por comida (en gramos o ml) */
const TOPE = { "Pan integral de molde": 90, "Galletas de arroz": 63, "Avena": 80, "Banana": 240, "Manzana": 260, "Pera": 255, "Naranja": 260, "Frutillas": 300,
  "Batata": 360, "Papa": 340, "Arroz blanco": 140, "Fideos secos (cortos)": 140, "Yogur griego descremado": 340, "Proteína whey": 45, "Huevo entero": 100,
  "Clara de huevo": 140, "Aceite de oliva": 30, "Aceite de girasol o canola": 30, "Pechuga de pollo sin piel": 250, "Vacuno magro (peceto, nalga o cuadrada)": 250,
  "Merluza": 300, "Lomo de cerdo magro": 250, "Almendras": 25, "Nueces": 25, "Palta": 75, "Miel": 21, "Queso magro (port salut light)": 60 };
const MIN = { "Banana": 60, "Manzana": 88, "Frutillas": 75, "Naranja": 65, "Pera": 85 };
let ESCALA = 1;
const topeQ = n => (TOPE[n] || 9999) * ESCALA / SW[n].u.gr, minQ = n => (MIN[n] || 0) / SW[n].u.gr;
const MAIN = { carnes: "p", protdes: "p", carbos: "c", carbdes: "c", frutas: "c", grasas: "g" };

export function armar(c, comidas, opt = {}) {
  const obj = c.dieta.objetivo, noCome = String(c.dieta.noCome || "").split(/[,;]/).map(norm).map(x => x.trim()).filter(Boolean);
  ESCALA = Math.min(1.45, Math.max(1, obj.kcal / 2400)); /* los que comen mucho admiten porciones más grandes */
  const metas = comidas.map((m, i) => {
    const t = norm(m.nombre + " " + (m.hora || "")), tipo = tipoDe(m);
    const ctx = { i, pre: /antes del entren|antes de entren|antes del gim|antes de correr/.test(t), post: /despues del entren|post|al terminar|despues de correr/.test(t),
      cena: /cena/.test(norm(m.nombre)), desayuno: /desayuno/.test(norm(m.nombre)), sinLacteoManiana: !!opt.sinLacteoDesayuno && /desayuno/.test(norm(m.nombre)) };
    const wP = tipo === "principal" ? 1.35 : 1, wC = (tipo === "principal" ? 1.15 : 0.9) + (ctx.pre || ctx.post ? 0.35 : 0), wG = tipo === "principal" ? 1.6 : tipo === "post" ? 0.15 : 0.7;
    return { m, tipo, ctx, wP, wC, wG };
  });
  const sum = k => metas.reduce((a, x) => a + x[k], 0);
  const out = [];
  for (const x of metas) {
    const meta = { p: obj.p * x.wP / sum("wP"), c: obj.c * x.wC / sum("wC"), g: obj.g * x.wG / sum("wG") };
    const slots = plantilla(x.tipo, x.ctx, noCome).map(([gr, mac, prefs]) => ({ gr, mac, n: elegir(prefs, noCome) })).filter(s => s.n);
    if (x.ctx.pre && x.tipo !== "principal") slots.push({ gr: "carbdes", mac: "extra", n: "Miel" });
    const q = slots.map(s => s.mac === "fijo" ? 1 : 0);
    for (let it = 0; it < 40; it++) for (let k = 0; k < slots.length; k++) {
      const s = slots[k]; if (s.mac === "fijo" || s.mac === "extra") continue;
      const M = s.mac === "c2" ? "c" : s.mac, u = SW[s.n].u;
      let objetivo = meta[M];
      if (M === "c") { const frC = Math.min(meta.c * 0.35, x.ctx.pre || x.ctx.post ? 30 : 16); objetivo = s.mac === "c2" ? frC : meta.c - frC; }
      const otros = slots.reduce((a, s2, j) => j === k || (M === "c" && (s2.mac === "c" || s2.mac === "c2")) ? a : a + SW[s2.n].u[M] * q[j], 0);
      q[k] = Math.min(topeQ(s.n), Math.max(s.mac === "c2" ? minQ(s.n) : 0, (objetivo - otros) / u[M]));
    }
    const items = slots.map((s, k) => s.mac === "fijo" ? item(s.n, 1) : item(s.n, redondear(s.n, q[k], 0)));
    out.push({ ...x.m, items, _tipo: x.tipo });
  }
  /* balance fino: paso a paso, sube o baja el alimento con más margen hasta quedar dentro del objetivo */
  const todos = () => out.flatMap(m => m.items), T = () => tot(todos());
  const TOL = { p: 4, c: 8, g: 3 };
  for (let n = 0; n < 800; n++) {
    const t = T(), err = ["p", "c", "g"].map(k => ({ k, d: obj[k] - t[k], r: Math.abs(obj[k] - t[k]) / TOL[k] })).sort((a, b) => b.r - a.r)[0];
    if (err.r <= 1) break;
    const sube = err.d > 0;
    const cand = out.flatMap((m, mi) => m.items.map(i => ({ i, m }))).filter(({ i }) => MAIN[SW[i.alimento].grupo] === err.k && i.alimento !== "Huevo entero" && !(i.alimento === "Miel" && !sube && i.cantidad === 0))
      .map(o => ({ ...o, margen: sube ? topeQ(o.i.alimento) - o.i.cantidad : o.i.cantidad - Math.max(minQ(o.i.alimento), SW[o.i.alimento].grupo === "frutas" ? minQ(o.i.alimento) : 0) }))
      .filter(o => o.margen >= paso(o.i.alimento) - 1e-9)
      .sort((a, b) => (b.margen * b.i.u[err.k]) - (a.margen * a.i.u[err.k]));
    if (!cand.length) break;
    const o = cand[0], st = paso(o.i.alimento);
    Object.assign(o.i, item(o.i.alimento, Math.max(0, o.i.cantidad + (sube ? st : -st))));
  }
  // proteína de desayuno con huevos: hasta 2 huevos y el resto con claras (como "2 huevos + 3 claras")
  for (const m of out) { const k = m.items.findIndex(i => i.alimento === "Huevo entero");
    if (k >= 0 && m.items[k].cantidad > 2) { const pr = (m.items[k].cantidad - 2) * SW["Huevo entero"].u.p; m.items[k] = item("Huevo entero", 2);
      m.items.splice(k + 1, 0, item("Clara de huevo", Math.max(1, Math.round(pr / SW["Clara de huevo"].u.p)))); } }
  for (const m of out) m.items = m.items.filter(i => i.cantidad > 0 && !(i.alimento === "Miel" && i.u.gr * i.cantidad < 7));
  const T2 = T();
  return { comidas: out.map(({ _tipo, ...m }) => m), total: Object.fromEntries(Object.entries(T2).map(([k, v]) => [k, Math.round(v)])) };
}

if (process.argv[2]) {
  const all = JSON.parse(readFileSync(process.argv[2], "utf8")), res = {};
  const ids = process.argv.slice(4).length ? process.argv.slice(4) : Object.keys(all);
  const CFG = JSON.parse(readFileSync(new URL("./dietas-config.json", import.meta.url), "utf8"));
  for (const cid of ids) {
    const c = all[cid], cfg = CFG[cid] || {};
    const comidas = cfg.comidas || c.dieta.comidas.map(m => ({ nombre: m.nombre, hora: m.hora || "" }));
    const r = armar(c, comidas, cfg);
    res[cid] = r;
    console.log(`\n=== ${c.nombre}: objetivo ${JSON.stringify(c.dieta.objetivo)} → plan ${JSON.stringify(r.total)}`);
    for (const m of r.comidas) console.log(`  [${m.nombre}${m.hora ? " · " + m.hora : ""}] ` + m.items.map(i => `${i.alimento} ${Math.round(i.u.gr * i.cantidad)}${i.u.un || "g"}`).join(" | ") + `  (${tot(m.items).kcal} kcal)`);
  }
  writeFileSync(process.argv[3], JSON.stringify(res, null, 1));
}
