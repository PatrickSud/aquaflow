/* store.js — persistência local (IndexedDB) + estado + notificação de mudanças.
   Tudo fica no aparelho. Nada sai daqui, exceto o que você mandar ao Consultor IA. */

const DB_NAME = 'aquaflow';
const DB_VER = 1;
const S_DOC = 'doc';     // documento único de estado
const S_PHOTO = 'photo'; // blobs de fotos

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    const rq = indexedDB.open(DB_NAME, DB_VER);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      if (!db.objectStoreNames.contains(S_DOC)) db.createObjectStore(S_DOC);
      if (!db.objectStoreNames.contains(S_PHOTO)) db.createObjectStore(S_PHOTO);
    };
    rq.onsuccess = () => { _db = rq.result; res(_db); };
    rq.onerror = () => rej(rq.error);
  });
}

function tx(store, mode, fn) {
  return openDB().then((db) => new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    try { out = fn(s); } catch (e) { rej(e); return; }
    t.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  }));
}

/* ---------- fotos ---------- */
export async function putPhoto(id, blob) { await tx(S_PHOTO, 'readwrite', (s) => s.put(blob, id)); return id; }
export async function getPhoto(id) { if (!id) return null; return tx(S_PHOTO, 'readonly', (s) => s.get(id)); }
export async function delPhoto(id) { if (!id) return; await tx(S_PHOTO, 'readwrite', (s) => s.delete(id)); }

const _urls = new Map();
export async function photoURL(id) {
  if (!id) return null;
  if (_urls.has(id)) return _urls.get(id);
  const b = await getPhoto(id);
  if (!b) return null;
  const u = URL.createObjectURL(b);
  _urls.set(id, u);
  return u;
}
export function forgetPhotoURL(id) {
  const u = _urls.get(id);
  if (u) { URL.revokeObjectURL(u); _urls.delete(id); }
}

/* ---------- estado ---------- */
export const state = {
  v: 1,
  activeId: null,
  aquariums: [],
  settings: {
    ai: { provider: 'gemini', model: 'gemini-3.5-flash', key: '', endpoint: '', proxyUrl: '' },
    installDismissed: false,
    lastSeen: null,
    fbConfig: null,
    syncPhotos: false,
    autoSync: true,
    sync: {}
  }
};

const subs = new Set();
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
function emit() { subs.forEach((f) => { try { f(state); } catch (e) { console.error(e); } }); }

let saveT = null;
export function save({ immediate = false, silent = false } = {}) {
  if (!silent) emit();
  clearTimeout(saveT);
  const doIt = () => tx(S_DOC, 'readwrite', (s) => s.put(JSON.parse(JSON.stringify(state)), 'state')).catch((e) => console.error('save', e));
  if (immediate) return doIt();
  saveT = setTimeout(doIt, 220);
  return Promise.resolve();
}

export async function load() {
  try {
    const d = await tx(S_DOC, 'readonly', (s) => s.get('state'));
    if (d && typeof d === 'object') {
      Object.assign(state, d);
      state.settings = Object.assign({ ai: {}, installDismissed: false, lastSeen: null, fbConfig: null, syncPhotos: false, autoSync: true, sync: {} }, d.settings || {});
      state.settings.ai = Object.assign({ provider: 'gemini', model: 'gemini-3.5-flash', key: '', endpoint: '', proxyUrl: '' }, d.settings?.ai || {});
    }
  } catch (e) { console.error('load', e); }
  return state;
}

/* ---------- helpers ---------- */
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const nowISO = () => new Date().toISOString();

export function active() {
  if (!state.aquariums.length) return null;
  return state.aquariums.find((a) => a.id === state.activeId) || state.aquariums[0];
}

export function addAquarium(aq) {
  state.aquariums.push(aq);
  state.activeId = aq.id;
  save({ immediate: true });
  return aq;
}

export async function removeAquarium(id) {
  const i = state.aquariums.findIndex((a) => a.id === id);
  if (i < 0) return;
  const aq = state.aquariums[i];
  const ids = [aq.photo, ...(aq.plants || []).map((p) => p.photo), ...(aq.notes || []).map((n) => n.photo)].filter(Boolean);
  for (const p of ids) { forgetPhotoURL(p); await delPhoto(p); }
  state.aquariums.splice(i, 1);
  if (state.activeId === id) state.activeId = state.aquariums[0]?.id || null;
  await save({ immediate: true });
}

/** Insere em coleção do aquário ativo, mantendo ordem cronológica decrescente. */
export function push(coll, item) {
  const a = active();
  if (!a) return null;
  if (!Array.isArray(a[coll])) a[coll] = [];
  const now = nowISO();
  const rec = Object.assign({ id: uid(), createdAt: now, updatedAt: now }, item);
  a[coll].unshift(rec);
  if (rec.at) a[coll].sort((x, y) => new Date(y.at) - new Date(x.at));
  save();
  return rec;
}

export function update(coll, id, patch) {
  const a = active();
  if (!a || !Array.isArray(a[coll])) return null;
  const it = a[coll].find((x) => x.id === id);
  if (!it) return null;
  Object.assign(it, patch);
  it.updatedAt = nowISO();
  if (patch.at) a[coll].sort((x, y) => new Date(y.at) - new Date(x.at));
  save();
  return it;
}

/** Marca o registro como editado agora (para a sincronização notar a mudança). */
export function touch(rec) {
  if (rec) rec.updatedAt = nowISO();
  return rec;
}

export async function remove(coll, id) {
  const a = active();
  if (!a || !Array.isArray(a[coll])) return;
  const i = a[coll].findIndex((x) => x.id === id);
  if (i < 0) return;
  const ph = a[coll][i].photo;
  if (ph) { forgetPhotoURL(ph); await delPhoto(ph); }
  a[coll].splice(i, 1);
  // guarda a lápide: sem ela, o registro excluído aqui volta do outro aparelho
  a.tombstones = a.tombstones || [];
  a.tombstones.unshift({ coll, id, at: nowISO() });
  if (a.tombstones.length > 500) a.tombstones.length = 500;
  await save({ immediate: true });
}

/* ---------- backup ---------- */
export async function exportJSON() {
  const photos = {};
  const ids = new Set();
  state.aquariums.forEach((a) => {
    if (a.photo) ids.add(a.photo);
    (a.plants || []).forEach((p) => p.photo && ids.add(p.photo));
    (a.notes || []).forEach((n) => n.photo && ids.add(n.photo));
  });
  for (const id of ids) {
    const b = await getPhoto(id);
    if (b) photos[id] = await blobToDataURL(b);
  }
  const out = { app: 'AquaFlow', exportedAt: nowISO(), state: JSON.parse(JSON.stringify(state)), photos };
  return JSON.stringify(out, null, 2);
}

export async function importJSON(text) {
  const d = JSON.parse(text);
  if (!d || !d.state || !Array.isArray(d.state.aquariums)) throw new Error('Arquivo de backup inválido.');
  for (const [id, durl] of Object.entries(d.photos || {})) {
    try { await putPhoto(id, await dataURLToBlob(durl)); } catch {}
  }
  Object.assign(state, d.state);
  await save({ immediate: true });
}

export function blobToDataURL(b) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
}
export async function dataURLToBlob(u) { return (await fetch(u)).blob(); }

/** Reduz e comprime imagem antes de guardar (economiza espaço no aparelho). */
export async function compressImage(file, max = 1280, q = 0.78) {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const sc = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * sc), h = Math.round(bmp.height * sc);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return new Promise((res) => cv.toBlob((b) => res(b || file), 'image/jpeg', q));
}

export async function storageInfo() {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { used: e.usage || 0, quota: e.quota || 0 } : null;
  } catch { return null; }
}
