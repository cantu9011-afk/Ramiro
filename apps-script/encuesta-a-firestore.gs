/**
 * Encuesta de admisión (Google Forms) → sitio web (Firestore, colección "admisiones").
 *
 * Cómo instalarlo (una sola vez):
 *  1. Abrí la planilla de respuestas de la encuesta → Extensiones → Apps Script.
 *  2. Borrá lo que haya y pegá todo este archivo. Cambiá PROYECTO por el id de tu proyecto de Firebase.
 *  3. En el engranaje "Configuración del proyecto" tildá "Mostrar el archivo de manifiesto appsscript.json"
 *     y reemplazá su contenido por el de apps-script/appsscript.json.
 *  4. Elegí la función "instalar" y tocá ▶ Ejecutar. Aceptá los permisos (con la misma cuenta de Google
 *     que es dueña del proyecto de Firebase).
 *  5. Listo: cada respuesta nueva llega sola a "Encuestas recibidas". Para mandar las que ya estaban,
 *     ejecutá "sincronizarTodo" (no duplica: las que ya existen se saltean).
 */
const PROYECTO = "ramiro-cantu-entrenamiento";
const ZONA = "America/Argentina/Mendoza";

function instalar() {
  const ss = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === "alResponder") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("alResponder").forSpreadsheet(ss).onFormSubmit().create();
  Logger.log("Listo: las respuestas nuevas se van a mandar solas al sitio.");
}

function alResponder(e) {
  const hoja = e.range.getSheet();
  enviarFila_(hoja, e.range.getRow());
}

function sincronizarTodo() {
  const hoja = hojaRespuestas_();
  const ult = hoja.getLastRow();
  let n = 0;
  for (let f = 2; f <= ult; f++) if (enviarFila_(hoja, f)) n++;
  Logger.log(n + " encuestas nuevas enviadas.");
}

function hojaRespuestas_() {
  const ss = SpreadsheetApp.getActive();
  return ss.getSheets().find(s => s.getFormUrl && s.getFormUrl()) || ss.getSheets()[0];
}

function enviarFila_(hoja, fila) {
  const nCol = hoja.getLastColumn();
  const titulos = hoja.getRange(1, 1, 1, nCol).getDisplayValues()[0];
  const valores = hoja.getRange(fila, 1, 1, nCol).getDisplayValues()[0];
  const marca = hoja.getRange(fila, 1).getValue();
  if (!(marca instanceof Date)) return false;
  const id = "form-" + Utilities.formatDate(marca, ZONA, "yyyyMMddHHmmss");
  const fecha = Utilities.formatDate(marca, ZONA, "yyyy-MM-dd'T'HH:mm:ssXXX");
  const pares = titulos.map((t, i) => [String(t), String(valores[i] || "")]).filter(p => p[0]);
  const doc = {
    fields: {
      fecha: { stringValue: fecha },
      fila: { stringValue: String(fila) },
      origen: { stringValue: "google" },
      // Firestore no admite listas dentro de listas: cada [pregunta, respuesta] va como {__arr:[…]}
      respuestas: { arrayValue: { values: pares.map(p => ({ mapValue: { fields: { __arr: { arrayValue: { values: [{ stringValue: p[0] }, { stringValue: p[1] }] } } } } })) } },
    },
  };
  const url = "https://firestore.googleapis.com/v1/projects/" + PROYECTO + "/databases/(default)/documents/admisiones?documentId=" + encodeURIComponent(id);
  const r = UrlFetchApp.fetch(url, {
    method: "post", contentType: "application/json", payload: JSON.stringify(doc), muteHttpExceptions: true,
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
  });
  const c = r.getResponseCode();
  if (c === 200) return true;
  if (c === 409) return false; // ya estaba
  throw new Error("No se pudo enviar la fila " + fila + " (" + c + "): " + r.getContentText());
}
