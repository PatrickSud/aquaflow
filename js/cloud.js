/* cloud.js — conta (e-mail/senha) e sincronização com o Firebase.
 *
 * PRINCÍPIO: o aparelho continua sendo a fonte da verdade. O app funciona
 * exatamente como antes sem conta e sem internet; a nuvem é um espelho.
 *
 * MODELO NO FIRESTORE (um documento por registro, não um documento gigante):
 *   /users/{uid}/aquariums/{aqId}                    → só os dados fixos do aquário
 *   /users/{uid}/aquariums/{aqId}/tests/{id}         → uma medição por documento
 *   /users/{uid}/aquariums/{aqId}/dosings/{id}       → idem
 *   ... e assim para tpas, feedings, livestock, plants, tasks, notes
 *   /users/{uid}/photos/{photoId}                    → foto em base64 (opcional)
 *
 * Por que um documento por registro: o Firestore indexa automaticamente cada
 * campo, inclusive dentro de mapas e listas, e há um teto de 40.000 entradas de
 * índice POR DOCUMENTO. Guardar todo o histórico num único documento estouraria
 * esse teto depois de alguns anos de uso — e falharia justamente quando o
 * histórico já fosse valioso.
 */

import { state, save, active, uid, getPhoto, putPhoto, blobToDataURL, dataURLToBlob } from './store.js';

const SDK = 'https://www.gstatic.com/firebasejs/12.18.0';

/** Coleções espelhadas na nuvem. `chat` e `taskLog` ficam só no aparelho:
 *  conversa do Consultor é longa e local; marcação de tarefa do dia é efêmera.
 *  `dismissedAlerts` também é local: é só uma preferência de "já vi este aviso". */
export const SYNC_COLLS = ['tests', 'dosings', 'tpas', 'feedings', 'livestock', 'plants', 'tasks', 'notes'];
const LOCAL_ONLY = new Set([...SYNC_COLLS, 'chat', 'taskLog', 'dismissedAlerts', 'events', 'tombstones', 'id']);

const MAX_PHOTO_B64 = 900000;   // limite de campo do Firestore é 1.048.487 bytes

let fb = null;            // módulos do SDK carregados sob demanda
let app = null, auth = null, db = null;
let configCache;
let unsubAuth = null;
const listeners = new Set();

export const status = {
  configured: false,
  user: null,
  syncing: false,
  lastSync: null,
  lastError: null,
  pending: 0
};

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach((f) => { try { f(status); } catch (e) { console.error(e); } }); }

/* ---------------- configuração ---------------- */

/** Config vem do arquivo js/firebase-config.js; se faltar, aceita uma colada nos Ajustes. */
export async function getConfig() {
  if (configCache !== undefined) return configCache;
  let c = null;
  try {
    const m = await import('./firebase-config.js');
    c = m.firebaseConfig || null;
  } catch {
    c = null;   // arquivo ausente não pode derrubar o app
  }
  if (!c && state.settings.fbConfig) c = state.settings.fbConfig;
  configCache = c && c.apiKey && c.projectId ? c : null;
  status.configured = !!configCache;
  return configCache;
}

export function setLocalConfig(cfg) {
  state.settings.fbConfig = cfg || null;
  configCache = undefined;
  save({ immediate: true });
}

export function isConfigured() { return status.configured; }

/* ---------------- inicialização ---------------- */

async function init() {
  if (db) return true;
  const cfg = await getConfig();
  if (!cfg) return false;

  let appMod, authMod, fsMod;
  try {
    [appMod, authMod, fsMod] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-auth.js`),
      import(`${SDK}/firebase-firestore.js`)
    ]);
  } catch (e) {
    // o SDK vem da internet: sem conexão, isto falha. O app segue funcionando
    // offline com os dados do aparelho — só a nuvem fica indisponível.
    console.warn('SDK do Firebase indisponível', e);
    const err = new Error('Não foi possível carregar a biblioteca do Firebase. Verifique a conexão — o app continua funcionando offline com os dados do aparelho.');
    err.code = 'sdk-unavailable';
    throw err;
  }

  fb = { ...authMod, ...fsMod };
  app = appMod.initializeApp(cfg);
  auth = authMod.getAuth(app);
  // persistência local já é o padrão na web — não precisa setPersistence
  db = fsMod.getFirestore(app);
  return true;
}

/** Liga o observador de sessão. Chamado uma vez na abertura do app. */
export async function start() {
  try {
    if (!(await init())) return;
  } catch (e) {
    status.lastError = errMsg(e);   // sem internet não é erro fatal, só nuvem indisponível
    emit();
    return;
  }
  if (unsubAuth) return;
  unsubAuth = fb.onAuthStateChanged(auth, (u) => {
    status.user = u ? { uid: u.uid, email: u.email, verified: u.emailVerified } : null;
    status.lastError = null;
    emit();
    if (u) syncNow({ quiet: true }).catch(() => {});
  });
}

export function currentUser() { return auth?.currentUser || null; }

/* ---------------- mensagens de erro em português ---------------- */

/* Atenção: com a proteção contra enumeração de e-mails (ligada por padrão em
   qualquer projeto criado depois de set/2023), senha errada e e-mail inexistente
   retornam O MESMO código `auth/invalid-credential`. Não há como distinguir no
   cliente — por isso a mensagem é genérica de propósito. Dizer "senha incorreta"
   estaria errado em metade dos casos. */
const ERR = {
  'sdk-unavailable': 'Não foi possível carregar a biblioteca do Firebase. Verifique a conexão — o app continua funcionando offline com os dados do aparelho.',
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/invalid-login-credentials': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'E-mail ou senha incorretos.',
  'auth/invalid-email': 'Esse e-mail não parece válido.',
  'auth/email-already-in-use': 'Já existe uma conta com esse e-mail. Tente entrar, ou use "Esqueci minha senha".',
  'auth/weak-password': 'A senha é muito fraca. Use pelo menos 6 caracteres.',
  'auth/missing-password': 'Digite a senha.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos antes de tentar de novo.',
  'auth/network-request-failed': 'Sem conexão com a internet. O app continua funcionando offline.',
  'auth/requires-recent-login': 'Por segurança, entre novamente antes de fazer essa alteração.',
  'auth/user-disabled': 'Esta conta foi desativada.',
  'auth/operation-not-allowed': 'O login por e-mail e senha não está habilitado no projeto Firebase. Ative em Authentication → Sign-in method.',
  'auth/unauthorized-domain': 'Este endereço não está autorizado no Firebase. Adicione o domínio em Authentication → Settings → Authorized domains.',
  'permission-denied': 'As regras do Firestore recusaram o acesso. A causa mais comum é o e-mail ainda não estar confirmado NO TOKEN: confirmar o e-mail não renova o token automaticamente. Toque em "Revalidar acesso" na tela da Conta. Se persistir, confira se o seu e-mail está na lista das regras, exatamente igual.',
  'unavailable': 'Firestore inacessível agora. Os dados seguem salvos no aparelho e sincronizam depois.',
  'failed-precondition': 'O Firestore ainda não foi criado neste projeto. Crie o banco no console do Firebase.'
};

export function errMsg(e) {
  const code = e?.code || '';
  if (ERR[code]) return ERR[code];
  if (/offline|network/i.test(e?.message || '')) return 'Sem conexão. Os dados continuam salvos no aparelho.';
  return e?.message ? `Erro: ${e.message}` : 'Não foi possível concluir a operação.';
}

/* ---------------- conta ---------------- */

export async function signUp(email, password) {
  if (!(await init())) throw new Error('Firebase não configurado.');
  const cred = await fb.createUserWithEmailAndPassword(auth, email.trim(), password);
  try { await fb.sendEmailVerification(cred.user); } catch {}
  return cred.user;
}

export async function signIn(email, password) {
  if (!(await init())) throw new Error('Firebase não configurado.');
  const cred = await fb.signInWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
}

export async function signOutNow() {
  if (!auth) return;
  await fb.signOut(auth);
  status.user = null; status.lastSync = null;
  emit();
}

export async function resetPassword(email) {
  if (!(await init())) throw new Error('Firebase não configurado.');
  await fb.sendPasswordResetEmail(auth, email.trim());
}

export async function resendVerification() {
  const u = currentUser();
  if (!u) throw new Error('Nenhuma conta conectada.');
  await fb.sendEmailVerification(u);
}

/* IMPORTANTE — os dois passos são necessários e fazem coisas diferentes:
   - reload(user)      atualiza o objeto do usuário aqui no app (user.emailVerified)
   - getIdToken(true)  renova o TOKEN, que é o que o Firestore lê nas regras
   Sem o segundo, o app mostra "e-mail confirmado" mas o Firestore continua
   recusando por até 1 hora, porque o token antigo ainda diz email_verified=false.
   É um comportamento conhecido do Firebase, não um erro de configuração. */
export async function refreshUser() {
  const u = currentUser();
  if (!u) return null;
  await fb.reload(u);
  try { await u.getIdToken(true); } catch (e) { console.warn('token', e); }
  status.user = { uid: u.uid, email: u.email, verified: u.emailVerified };
  emit();
  return status.user;
}

/** O que o token REALMENTE diz — é isso que as regras do Firestore avaliam. */
export async function tokenInfo({ force = false } = {}) {
  const u = currentUser();
  if (!u) return null;
  const r = await u.getIdTokenResult(force);
  return {
    uid: u.uid,
    email: r.claims.email || null,
    emailVerified: r.claims.email_verified === true,
    userObjectVerified: u.emailVerified === true,
    issuedAt: r.issuedAtTime,
    expiresAt: r.expirationTime
  };
}

export async function changePassword(currentPassword, newPassword) {
  const u = currentUser();
  if (!u) throw new Error('Nenhuma conta conectada.');
  const cred = fb.EmailAuthProvider.credential(u.email, currentPassword);
  await fb.reauthenticateWithCredential(u, cred);
  await fb.updatePassword(u, newPassword);
}

export async function deleteAccount(currentPassword) {
  const u = currentUser();
  if (!u) throw new Error('Nenhuma conta conectada.');
  const cred = fb.EmailAuthProvider.credential(u.email, currentPassword);
  await fb.reauthenticateWithCredential(u, cred);
  await fb.deleteUser(u);
  status.user = null;
  emit();
}

/* ---------------- utilidades de sincronização ---------------- */

function syncMeta() {
  state.settings.sync = state.settings.sync || {};
  return state.settings.sync;
}
function metaFor(uidKey, aqId) {
  const m = syncMeta();
  m[uidKey] = m[uidKey] || {};
  m[uidKey][aqId] = m[uidKey][aqId] || { push: null, cursor: {}, scalarCursor: 0, photos: [] };
  const e = m[uidKey][aqId];
  e.cursor = e.cursor || {};
  e.photos = e.photos || [];
  return e;
}

/* O carimbo de tempo na nuvem é do SERVIDOR, nunca do celular.
   Motivo: se o relógio do aparelho estiver adiantado, ele grava um horário no
   futuro, o marcador de leitura avança para lá, e um registro feito noutro
   aparelho com hora correta fica para trás do marcador — perdido para sempre,
   sem erro nenhum aparecendo. Relógio errado em celular é comum, e essa falha
   seria silenciosa. Com o horário do servidor, todos os aparelhos comparam a
   mesma régua. O horário local continua existindo, mas serve só para o próprio
   aparelho decidir o que ainda não enviou — comparação sempre entre relógios
   do mesmo aparelho, onde a diferença não existe. */
function srvMs(v) {
  if (!v) return 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Separa os campos fixos do aquário (vão para o documento) das coleções. */
function scalarsOf(aq) {
  const out = {};
  for (const [k, v] of Object.entries(aq)) {
    if (LOCAL_ONLY.has(k)) continue;
    if (k.startsWith('_')) continue;
    out[k] = v === undefined ? null : v;
  }
  out.updatedAt = aq.updatedAt || new Date().toISOString();
  return out;
}

function stamp(rec) {
  if (!rec.updatedAt) rec.updatedAt = rec.createdAt || new Date().toISOString();
  return rec;
}

/** Quantos registros ainda não foram enviados. Alimenta o indicador da tela. */
export function pendingCount() {
  const u = status.user;
  const aq = active();
  if (!u || !aq) return 0;
  const m = metaFor(u.uid, aq.id);
  if (!m.push) return countAll(aq);
  let n = 0;
  for (const c of SYNC_COLLS) for (const r of aq[c] || []) if ((r.updatedAt || r.createdAt || '') > m.push) n++;
  n += (aq.tombstones || []).filter((t) => t.at > m.push).length;
  return n;
}
function countAll(aq) {
  return SYNC_COLLS.reduce((s, c) => s + (aq[c] || []).length, 0) + 1;
}

/* ---------------- sincronização ---------------- */

export async function syncNow({ quiet = false, photos = null } = {}) {
  if (status.syncing) return { skipped: true };
  if (!(await init())) throw new Error('Firebase não configurado.');
  const u = currentUser();
  if (!u) throw new Error('Entre na sua conta para sincronizar.');

  const aq = active();
  if (!aq) return { skipped: true };

  status.syncing = true; status.lastError = null; emit();
  const wantPhotos = photos === null ? !!state.settings.syncPhotos : photos;
  const res = { pushed: 0, pulled: 0, photosUp: 0, photosDown: 0, conflicts: 0 };

  try {
    // Se o objeto do usuário já diz confirmado mas o token ainda não, renova o
    // token ANTES de falar com o Firestore. Sem isto, o primeiro acesso depois
    // de confirmar o e-mail é recusado pelas regras.
    try {
      const t = await u.getIdTokenResult(false);
      if (u.emailVerified && t.claims.email_verified !== true) await u.getIdToken(true);
    } catch (e) { console.warn('token', e); }

    const meta = metaFor(u.uid, aq.id);
    // ENVIAR ANTES DE BAIXAR: assim a nuvem já contém tudo que foi feito aqui,
    // e na descida "o remoto vence" passa a ser a regra correta em vez de sorteio.
    await push(u.uid, aq, meta, res);
    meta.push = new Date().toISOString();
    await pull(u.uid, aq, meta, res);
    if (wantPhotos) await syncPhotos(u.uid, aq, meta, res);

    status.lastSync = new Date().toISOString();
    status.pending = 0;
    await save({ immediate: true });
    return res;
  } catch (e) {
    status.lastError = errMsg(e);
    if (!quiet) throw e;
    console.warn('sync', e);
    return res;
  } finally {
    status.syncing = false;
    emit();
  }
}

/* --- descida: traz o que mudou na nuvem --- */
async function pull(uidKey, aq, meta, res) {
  const { doc, getDoc, collection, getDocs, query, where, Timestamp } = fb;
  const base = `users/${uidKey}/aquariums/${aq.id}`;

  // campos fixos do aquário: só sobrescreve se o remoto for mais novo (hora do servidor)
  const snap = await getDoc(doc(db, base));
  if (snap.exists()) {
    const r = snap.data();
    const remoteMs = srvMs(r.updatedAt);
    if (remoteMs > (meta.scalarCursor || 0)) {
      for (const [k, v] of Object.entries(r)) {
        if (LOCAL_ONLY.has(k) || k === 'updatedAt' || k === 'clientAt') continue;
        aq[k] = v;
      }
      meta.scalarCursor = remoteMs;
      res.conflicts++;
    }
  }

  for (const coll of SYNC_COLLS) {
    const cur = meta.cursor[coll] || 0;
    const ref = collection(db, `${base}/${coll}`);
    // filtro num único campo: o índice automático cobre, não precisa índice composto.
    // 2 s de folga para trás por segurança — reler o mesmo registro é inofensivo,
    // porque a junção é feita por identificador.
    const q = cur ? query(ref, where('updatedAt', '>', Timestamp.fromMillis(cur - 2000))) : ref;
    const docs = await getDocs(q);
    if (docs.empty) continue;

    aq[coll] = aq[coll] || [];
    let maxMs = cur;
    docs.forEach((d) => {
      const r = d.data();
      const ms = srvMs(r.updatedAt);
      if (ms > maxMs) maxMs = ms;

      const i = aq[coll].findIndex((x) => x.id === d.id);
      if (r.deleted) {
        if (i >= 0) { aq[coll].splice(i, 1); res.pulled++; }
        return;
      }
      const { updatedAt, clientAt, ...fields } = r;
      const rec = Object.assign({}, fields, { id: d.id, updatedAt: clientAt || new Date(ms).toISOString() });
      if (i < 0) { aq[coll].push(rec); res.pulled++; }
      else { aq[coll][i] = rec; res.pulled++; }   // o envio veio antes, então o remoto já inclui o local
    });
    meta.cursor[coll] = maxMs;
    if (aq[coll].some((r) => r.at)) aq[coll].sort((a, b) => new Date(b.at) - new Date(a.at));
  }
}

/* --- subida: manda o que mudou aqui --- */
async function push(uidKey, aq, meta, res) {
  const { doc, setDoc, writeBatch, serverTimestamp } = fb;
  const base = `users/${uidKey}/aquariums/${aq.id}`;
  const since = meta.push;

  await setDoc(doc(db, base), Object.assign(scalarsOf(aq), { updatedAt: serverTimestamp() }), { merge: true });

  let batch = writeBatch(db);
  let n = 0;
  const flush = async () => { if (n) { await batch.commit(); batch = writeBatch(db); n = 0; } };

  for (const coll of SYNC_COLLS) {
    for (const rec of aq[coll] || []) {
      stamp(rec);
      // comparação entre relógios DO MESMO aparelho — imune a relógio desencontrado
      if (since && rec.updatedAt <= since) continue;
      const { id, ...rest } = rec;
      rest.clientAt = rec.updatedAt;
      rest.updatedAt = serverTimestamp();
      batch.set(doc(db, `${base}/${coll}/${id}`), rest, { merge: true });
      res.pushed++;
      if (++n >= 400) await flush();
    }
  }

  // exclusões viajam como marcação, senão o registro ressuscita no outro aparelho
  for (const t of aq.tombstones || []) {
    if (since && t.at <= since) continue;
    if (!SYNC_COLLS.includes(t.coll)) continue;
    batch.set(doc(db, `${base}/${t.coll}/${t.id}`), { deleted: true, updatedAt: t.at });
    res.pushed++;
    if (++n >= 400) await flush();
  }

  await flush();
}

/* --- fotos (opcional) --- */
async function syncPhotos(uidKey, aq, meta, res) {
  const { doc, getDoc, setDoc } = fb;
  meta.photos = meta.photos || [];
  const ids = new Set();
  if (aq.photo) ids.add(aq.photo);
  (aq.plants || []).forEach((p) => p.photo && ids.add(p.photo));
  (aq.notes || []).forEach((n) => n.photo && ids.add(n.photo));

  for (const id of ids) {
    const local = await getPhoto(id);
    if (local) {
      if (meta.photos.includes(id)) continue;
      const b64 = await blobToDataURL(local);
      if (b64.length > MAX_PHOTO_B64) { console.warn('foto grande, não enviada', id); continue; }
      await setDoc(doc(db, `users/${uidKey}/photos/${id}`), { data: b64, updatedAt: new Date().toISOString() });
      meta.photos.push(id);
      res.photosUp++;
    } else {
      const snap = await getDoc(doc(db, `users/${uidKey}/photos/${id}`));
      if (snap.exists() && snap.data().data) {
        await putPhoto(id, await dataURLToBlob(snap.data().data));
        if (!meta.photos.includes(id)) meta.photos.push(id);
        res.photosDown++;
      }
    }
  }
}

/** Manda tudo de novo, ignorando as marcas de tempo. Usado no primeiro envio. */
export async function pushEverything() {
  const u = currentUser();
  const aq = active();
  if (!u || !aq) throw new Error('Nada para enviar.');
  const meta = metaFor(u.uid, aq.id);
  meta.push = null;
  return syncNow();
}

/** Traz tudo da nuvem, ignorando os marcadores. Usado ao entrar num aparelho novo. */
export async function pullEverything() {
  const u = currentUser();
  const aq = active();
  if (!u || !aq) throw new Error('Nada para baixar.');
  const meta = metaFor(u.uid, aq.id);
  meta.cursor = {};
  meta.scalarCursor = 0;
  return syncNow();
}

/** Lista os aquários que existem na conta (para escolher ao entrar num aparelho novo). */
export async function listRemoteAquariums() {
  if (!(await init())) return [];
  const u = currentUser();
  if (!u) return [];
  const { collection, getDocs } = fb;
  const snap = await getDocs(collection(db, `users/${u.uid}/aquariums`));
  return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
}

/** Baixa um aquário inteiro que só existe na nuvem. */
export async function importRemoteAquarium(aqId) {
  if (!(await init())) throw new Error('Firebase não configurado.');
  const u = currentUser();
  if (!u) throw new Error('Entre na sua conta.');
  const { doc, getDoc, collection, getDocs } = fb;
  const base = `users/${u.uid}/aquariums/${aqId}`;
  const snap = await getDoc(doc(db, base));
  if (!snap.exists()) throw new Error('Aquário não encontrado na conta.');

  const aq = Object.assign({ id: aqId }, snap.data());
  delete aq.updatedAt; delete aq.clientAt;
  const cursor = {};
  for (const coll of SYNC_COLLS) {
    const docs = await getDocs(collection(db, `${base}/${coll}`));
    let maxMs = 0;
    aq[coll] = docs.docs
      .filter((d) => !d.data().deleted)
      .map((d) => {
        const { updatedAt, clientAt, ...f } = d.data();
        const ms = srvMs(updatedAt);
        if (ms > maxMs) maxMs = ms;
        return Object.assign({ id: d.id }, f, { updatedAt: clientAt || new Date(ms || Date.now()).toISOString() });
      });
    cursor[coll] = maxMs;
    if (aq[coll].some((r) => r.at)) aq[coll].sort((a, b) => new Date(b.at) - new Date(a.at));
  }
  aq.chat = aq.chat || [];
  aq.taskLog = aq.taskLog || [];
  aq.tombstones = [];

  const i = state.aquariums.findIndex((x) => x.id === aqId);
  if (i >= 0) state.aquariums[i] = aq; else state.aquariums.push(aq);
  state.activeId = aqId;
  const meta = metaFor(u.uid, aqId);
  meta.cursor = cursor;
  meta.scalarCursor = srvMs(snap.data().updatedAt);
  meta.push = new Date().toISOString();
  await save({ immediate: true });
  return aq;
}
