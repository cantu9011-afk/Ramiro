/*
  Marca una versión nueva antes de publicar: actualiza VERSION_APP en public/index.html
  y escribe public/version.json. La página compara las dos y se recarga sola cuando hay una nueva.
*/
import { readFileSync, writeFileSync } from "node:fs";
const p = new URL("../public/index.html", import.meta.url);
const ahora = new Date(), z = n => String(n).padStart(2, "0");
// hora de Mendoza (UTC-3)
const ar = new Date(ahora.getTime() - 3 * 3600e3);
const v = `${z(ar.getUTCDate())}/${z(ar.getUTCMonth() + 1)}/${ar.getUTCFullYear()} ${z(ar.getUTCHours())}:${z(ar.getUTCMinutes())}`;
let html = readFileSync(p, "utf8");
if (!/const VERSION_APP="[^"]*";/.test(html)) throw new Error("No encuentro VERSION_APP en index.html");
html = html.replace(/const VERSION_APP="[^"]*";/, `const VERSION_APP="${v}";`);
writeFileSync(p, html);
writeFileSync(new URL("../public/version.json", import.meta.url), JSON.stringify({ v }) + "\n");
console.log("Versión", v);
