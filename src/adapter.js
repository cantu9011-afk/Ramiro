/*
  Conector de la app con Firebase.

  La app original usaba claude.use("db") y claude.use("user"). Este archivo da exactamente
  esa misma forma de uso, pero sobre Firebase (Authentication + Cloud Firestore), para que
  el resto del código de la app no cambie.

  db.doc("col/id")            → .get() .set(obj) .update(obj) .delete() .onSnapshot(cb, errCb)
  db.collection("col")        → .doc(id) .onSnapshot(cb, errCb)
  snapshots                   → .exists .id .data()   /   .docs
  user.isOwner()              → true si entra Ramiro (email guardado en config/owner)
  user.id()                   → id estable del usuario (uid de Firebase)
  user.profiles([ids])        → {id: {name}} leído de perfiles/<uid>

  Se compila con `npm run build` a public/js/firebase-adapter.js.
*/
import { initializeApp } from "firebase/app";
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail,
  updateProfile, signOut, connectAuthEmulator,
} from "firebase/auth";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator,
  doc, collection, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot,
} from "firebase/firestore";

const cfg = window.RC_FIREBASE || {};
const configurado = !!(cfg.apiKey && cfg.projectId && !/PEGAR/i.test(cfg.apiKey + cfg.projectId));

/* ---------- arrays dentro de arrays ----------
   Firestore no guarda listas dentro de listas (las respuestas de la encuesta son [[pregunta, respuesta], …]).
   Se guardan como {__arr:[…]} y se devuelven tal cual eran. */
function enc(v) {
  if (Array.isArray(v)) return v.map(x => (Array.isArray(x) ? { __arr: enc(x) } : enc(x)));
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
    const o = {};
    for (const k of Object.keys(v)) o[k] = enc(v[k]);
    return o;
  }
  return v;
}
function dec(v) {
  if (Array.isArray(v)) return v.map(dec);
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
    const ks = Object.keys(v);
    if (ks.length === 1 && ks[0] === "__arr" && Array.isArray(v.__arr)) return dec(v.__arr);
    const o = {};
    for (const k of ks) o[k] = dec(v[k]);
    return o;
  }
  return v;
}

/* los mensajes de la app esperan "invalid_argument" cuando falta permiso */
function err(e) {
  if (e && e.code === "permission-denied") {
    const x = new Error(e.message);
    x.code = "invalid_argument";
    x.original = e;
    return x;
  }
  return e;
}

function docSnap(s) {
  return { id: s.id, exists: s.exists(), data: () => (s.exists() ? dec(s.data()) : undefined) };
}

let fs = null, auth = null;

function makeDoc(ref) {
  return {
    id: ref.id,
    get: () => getDoc(ref).then(docSnap, e => { throw err(e); }),
    set: obj => setDoc(ref, enc(obj)).catch(e => { throw err(e); }),
    update: obj => updateDoc(ref, enc(obj)).catch(e => { throw err(e); }),
    delete: () => deleteDoc(ref).catch(e => { throw err(e); }),
    onSnapshot: (cb, errCb) => onSnapshot(ref, s => cb(docSnap(s)), e => errCb && errCb(err(e))),
  };
}
function makeCol(path) {
  const ref = collection(fs, path);
  return {
    id: ref.id,
    doc: id => makeDoc(doc(ref, id)),
    onSnapshot: (cb, errCb) => onSnapshot(ref, s => cb({ docs: s.docs.map(docSnap), size: s.size, empty: s.empty }), e => errCb && errCb(err(e))),
  };
}
const dbApi = {
  doc: path => makeDoc(doc(fs, path)),
  collection: path => makeCol(path),
};

/* ---------- usuario ---------- */
let current = null, creando = false;
const listo = new Promise(res => {
  if (!configurado) return res(null);
  const app = initializeApp(cfg);
  auth = getAuth(app);
  auth.languageCode = "es";
  const emu = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && cfg.emuladores;
  let cache;
  try { cache = persistentLocalCache({ tabManager: persistentMultipleTabManager() }); } catch (e) { cache = undefined; }
  fs = initializeFirestore(app, Object.assign({ ignoreUndefinedProperties: true }, cache && !emu ? { localCache: cache } : {}));
  if (emu) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(fs, "127.0.0.1", 8080);
  }
  let primera = true;
  onAuthStateChanged(auth, u => {
    if (primera) { primera = false; current = u; res(u); return; }
    // cambió la sesión (entró o salió): se recarga para arrancar limpio con los permisos nuevos
    if (creando) return;
    if ((u && u.uid) !== (current && current.uid)) location.reload();
  });
});

let ownerCache = null;
function userApi(u) {
  return {
    id: async () => u.uid,
    isOwner: async () => {
      if (ownerCache !== null) return ownerCache;
      try { const s = await getDoc(doc(fs, "config/owner")); ownerCache = s.exists(); }
      catch (e) { ownerCache = false; }
      return ownerCache;
    },
    profiles: async ids => {
      const out = {};
      await Promise.all(ids.map(async id => {
        try { const s = await getDoc(doc(fs, "perfiles/" + id)); out[id] = s.exists() ? { name: s.data().name || "" } : { name: "" }; }
        catch (e) { out[id] = { name: "" }; }
      }));
      return out;
    },
  };
}
async function guardarPerfil(u) {
  const name = u.displayName || u.email || "";
  try {
    const ref = doc(fs, "perfiles/" + u.uid);
    const s = await getDoc(ref);
    if (!s.exists() || s.data().name !== name || s.data().email !== (u.email || "")) await setDoc(ref, { name, email: u.email || "", actualizado: new Date().toISOString() });
  } catch (e) { /* no es grave */ }
}

/* ---------- pantalla de ingreso ---------- */
const CSS = `
.rc-auth{font:inherit;font-size:11px;letter-spacing:.1em;text-transform:uppercase;padding:4px 10px;border-radius:99px;border:1px solid var(--line);background:transparent;color:var(--muted);white-space:nowrap;cursor:pointer;min-height:28px}
.rc-auth.in{border-color:var(--red);color:#fff;background:var(--red)}
body.rc-anon #role{display:none}
#role:not(.trainer){display:none}
.rc-modal{position:fixed;inset:0;z-index:60;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.45);padding:16px;padding-bottom:max(16px,env(safe-area-inset-bottom,0px))}
@media (min-width:560px){.rc-modal{align-items:center}}
.rc-card{width:100%;max-width:400px;background:var(--surface);color:var(--ink);border-radius:14px;padding:20px;display:flex;flex-direction:column;gap:12px;box-shadow:0 18px 50px rgba(0,0,0,.35);max-height:calc(100dvh - 32px);overflow:auto}
.rc-card h2{margin:0;font-family:var(--display);font-weight:800;font-size:28px;text-transform:uppercase;letter-spacing:.02em;line-height:1}
.rc-card p{margin:0;color:var(--muted);font-size:14px}
.rc-card label{display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600}
.rc-card input{font:inherit;font-size:16px;padding:11px 12px;border:1px solid var(--line);border-radius:var(--r);background:var(--bg);color:var(--ink)}
.rc-card .rc-b{font:inherit;font-weight:600;font-size:15px;min-height:46px;border-radius:var(--r);border:1px solid var(--line);background:var(--surface);color:var(--ink);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px}
.rc-card .rc-b.pri{background:var(--red);border-color:var(--red);color:#fff}
.rc-card .rc-sep{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.1em}
.rc-card .rc-sep::before,.rc-card .rc-sep::after{content:"";flex:1;border-top:1px solid var(--line)}
.rc-card .rc-links{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}
.rc-card .rc-l{font:inherit;font-size:13px;background:none;border:0;padding:4px 0;color:var(--red);cursor:pointer;text-decoration:underline}
.rc-card .rc-msg{font-size:13px;min-height:1em;color:var(--warn)}
.rc-card .rc-msg.ok{color:var(--ok)}
.rc-card .rc-x{align-self:flex-end;margin:-8px -8px -4px 0;background:none;border:0;font-size:20px;color:var(--muted);cursor:pointer;min-width:40px;min-height:40px}
.rc-banner{position:fixed;left:0;right:0;bottom:0;z-index:70;background:#a15c00;color:#fff;padding:10px 16px;font-size:13px;text-align:center}
`;
function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "text") e.textContent = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}
const msgs = {
  "auth/invalid-credential": "El email o la contraseña no coinciden.",
  "auth/wrong-password": "La contraseña no es correcta.",
  "auth/user-not-found": "No hay una cuenta con ese email. Tocá «Crear cuenta».",
  "auth/email-already-in-use": "Ya hay una cuenta con ese email. Ingresá con tu contraseña (o con Google si la creaste así).",
  "auth/weak-password": "La contraseña tiene que tener al menos 6 caracteres.",
  "auth/invalid-email": "Revisá el email, parece que está mal escrito.",
  "auth/too-many-requests": "Demasiados intentos. Esperá unos minutos y probá de nuevo.",
  "auth/network-request-failed": "No hay conexión. Revisá internet y probá de nuevo.",
  "auth/account-exists-with-different-credential": "Ese email ya está registrado de otra forma. Probá con email y contraseña.",
};
const msgDe = e => msgs[e && e.code] || "No se pudo ingresar. Probá de nuevo.";
const gIcon = () => {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("width", "18"); s.setAttribute("height", "18"); s.setAttribute("viewBox", "0 0 48 48"); s.setAttribute("aria-hidden", "true");
  s.innerHTML = '<path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>';
  return s;
};

let modal = null;
function cerrar() { if (modal) { modal.remove(); modal = null; document.removeEventListener("keydown", esc); } }
function esc(ev) { if (ev.key === "Escape") cerrar(); }
function volverA(v) { try { if (v) sessionStorage.setItem("rc-volver", v); } catch (e) {} }

function ingresar(volver) {
  if (!configurado) { alert("Falta configurar Firebase (archivo config.js)."); return; }
  if (modal) return;
  volverA(volver);
  let modo = "entrar";
  const msg = el("div", { class: "rc-msg", role: "status" });
  const nombre = el("input", { type: "text", autocomplete: "name", placeholder: "Nombre y apellido" });
  const email = el("input", { type: "email", autocomplete: "email", inputmode: "email", placeholder: "tu@email.com", required: true });
  const pass = el("input", { type: "password", autocomplete: "current-password", placeholder: "Contraseña", minlength: "6", required: true });
  const lNombre = el("label", {}, "Nombre", nombre);
  const titulo = el("h2", { text: "Ingresar" });
  const enviar = el("button", { class: "rc-b pri", type: "submit" }, "Ingresar");
  const cambiar = el("button", { class: "rc-l", type: "button" }, "Crear cuenta");
  const olvido = el("button", { class: "rc-l", type: "button" }, "Olvidé mi contraseña");
  const pinta = () => {
    const nueva = modo === "crear";
    titulo.textContent = nueva ? "Crear cuenta" : "Ingresar";
    enviar.textContent = nueva ? "Crear cuenta" : "Ingresar";
    cambiar.textContent = nueva ? "Ya tengo cuenta" : "Crear cuenta";
    lNombre.hidden = !nueva; olvido.hidden = nueva;
    pass.setAttribute("autocomplete", nueva ? "new-password" : "current-password");
    msg.textContent = ""; msg.className = "rc-msg";
  };
  cambiar.addEventListener("click", () => { modo = modo === "crear" ? "entrar" : "crear"; pinta(); });
  olvido.addEventListener("click", async () => {
    if (!email.value.trim()) { msg.textContent = "Escribí tu email arriba y volvé a tocar «Olvidé mi contraseña»."; email.focus(); return; }
    try { await sendPasswordResetEmail(auth, email.value.trim()); msg.className = "rc-msg ok"; msg.textContent = "Te mandamos un email para elegir una contraseña nueva."; }
    catch (e) { msg.className = "rc-msg"; msg.textContent = msgDe(e); }
  });
  const google = el("button", { class: "rc-b", type: "button" }, gIcon(), "Seguir con Google");
  google.addEventListener("click", async () => {
    const p = new GoogleAuthProvider();
    p.setCustomParameters({ prompt: "select_account" });
    msg.textContent = "";
    try { await signInWithPopup(auth, p); msg.className = "rc-msg ok"; msg.textContent = "Entrando…"; }
    catch (e) {
      if (e && (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment")) return signInWithRedirect(auth, p);
      if (e && (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request")) return;
      msg.className = "rc-msg"; msg.textContent = msgDe(e);
    }
  });
  const form = el("form", { novalidate: true, style: "display:flex;flex-direction:column;gap:12px" },
    lNombre, el("label", {}, "Email", email), el("label", {}, "Contraseña", pass), enviar, msg,
    el("div", { class: "rc-links" }, cambiar, olvido));
  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    const em = email.value.trim(), pw = pass.value;
    if (!em || !pw) { msg.className = "rc-msg"; msg.textContent = "Completá tu email y tu contraseña."; return; }
    enviar.disabled = true; msg.className = "rc-msg"; msg.textContent = modo === "crear" ? "Creando tu cuenta…" : "Entrando…";
    try {
      if (modo === "crear") {
        const n = nombre.value.trim();
        if (!n) { msg.textContent = "Escribí tu nombre así Ramiro sabe quién sos."; nombre.focus(); enviar.disabled = false; return; }
        creando = true;
        const r = await createUserWithEmailAndPassword(auth, em, pw);
        await updateProfile(r.user, { displayName: n });
        await guardarPerfil(r.user);
        location.reload();
      } else {
        await signInWithEmailAndPassword(auth, em, pw);
      }
    } catch (e) { creando = false; msg.textContent = msgDe(e); enviar.disabled = false; }
  });
  modal = el("div", { class: "rc-modal", role: "dialog", "aria-modal": "true", "aria-label": "Ingresar" },
    el("div", { class: "rc-card" },
      el("button", { class: "rc-x", type: "button", "aria-label": "Cerrar", onclick: cerrar }, "✕"),
      titulo,
      el("p", { text: "Entrá para ver tu rutina, tu dieta y anotar tus cargas." }),
      google, el("div", { class: "rc-sep", text: "o con tu email" }), form));
  modal.addEventListener("click", ev => { if (ev.target === modal) cerrar(); });
  document.addEventListener("keydown", esc);
  document.body.append(modal);
  pinta();
}

async function salir() {
  if (!confirm("¿Cerrar sesión en este dispositivo?")) return;
  try { localStorage.removeItem("rc-sel"); } catch (e) {}
  await signOut(auth);
  location.reload();
}

function botonSesion(u) {
  const role = document.getElementById("role");
  if (!role || document.getElementById("rc-auth")) return;
  const b = el("button", { id: "rc-auth", class: "rc-auth" + (u ? "" : " in"), type: "button", text: u ? "Salir" : "Ingresar",
    title: u ? "Cerrar sesión" + (u.email ? " (" + u.email + ")" : "") : "Ingresar con tu cuenta",
    onclick: () => (u ? salir() : ingresar("picker")) });
  role.after(b);
  document.body.classList.toggle("rc-anon", !u);
}

/* ---------- arranque ---------- */
const style = document.createElement("style");
style.textContent = CSS;
document.head.append(style);
window.rcIngresar = ingresar;
window.rcSalir = salir;

if (!configurado) {
  document.body.append(el("div", { class: "rc-banner", text: "Falta configurar Firebase: completá public/config.js (ver LEEME)." }));
}

listo.then(u => {
  botonSesion(u);
  if (u) {
    guardarPerfil(u);
    let v = null;
    try { v = sessionStorage.getItem("rc-volver"); sessionStorage.removeItem("rc-volver"); } catch (e) {}
    if (v && window.__app && window.__app.view === "inicio") window.__app.view = v;
  }
});

window.__rcBoot({
  use: async name => {
    if (!configurado) return null;
    const u = await listo;
    if (name === "db") return dbApi;
    if (name === "user") return u ? userApi(u) : null;
    return null;
  },
});
