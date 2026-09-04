/* ==========================================================
   AVERI LICENSING — SecureLicenseStorage
   ----------------------------------------------------------
   Aucune partie de l'interface n'accède au stockage directement :
   tout passe par cette abstraction.

   Trois propriétés recherchées :

   1. REDONDANCE — chaque enregistrement est écrit dans plusieurs
      dépôts (localStorage, cookie, IndexedDB). Effacer l'un
      d'eux ne suffit pas : au chargement suivant, l'enregistrement
      survivant est réinstallé partout.

   2. SCELLEMENT — chaque enregistrement porte un HMAC calculé
      avec une clé dérivée de l'identifiant d'installation. Ce
      n'est PAS un secret : quiconque lit le code peut recalculer
      le sceau. Le but est de rendre l'édition manuelle du
      stockage détectable, pas impossible. Voir security.md.

   3. SYNCHRONICITÉ — l'API est synchrone pour que le moteur
      reste simple. IndexedDB, asynchrone par nature, sert de
      miroir : il est lu une fois au démarrage (`hydrate()`) et
      écrit sans attente.
   ========================================================== */

import { hmacSha512 } from './sha512.js';
import { utf8Encode, toHex } from './base64.js';
import { STORAGE_NAMESPACE } from './config.js';

export const RECORD_KEYS = {
  identity:   'identity',
  license:    'license',
  activation: 'activation',
  demo:       'demo',
  /**
   * Jeton d'essai — trace INDÉPENDANTE de l'état de démonstration.
   * Écrit une seule fois, à la première activation, et jamais réécrit
   * ensuite. Supprimer `demo` ne suffit donc pas à retrouver un essai :
   * il faut aussi trouver et supprimer celui-ci.
   */
  trial:      'trial',
  /**
   * Trousseau : inventaire des licences connues de cet appareil.
   *
   * La licence ACTIVE reste stockée à part, sous `license` — c'est elle
   * qui commande l'accès, elle doit rester courte et bénéficier à plein
   * de la redondance (un cookie plafonne autour de 4 Ko). Le trousseau
   * est un confort d'inventaire : sa perte ne retire aucun droit.
   */
  keyring:    'keyring',
  revocation: 'revocation',
  journal:    'journal'
};

/** Au-delà, le trousseau ne tiendrait plus dans les dépôts les plus étroits. */
export const KEYRING_MAX_ENTRIES = 8;

const RECORD_VERSION = 1;

/** Clé de scellement d'amorçage — voir _sealKeyFor(). */
const BOOTSTRAP_SEAL_KEY = utf8Encode('averi-seal-v1:bootstrap');

/* ---------------------------------------------------------- */
/* Dépôts                                                      */
/* ---------------------------------------------------------- */

class MemoryBackend {
  constructor(name) { this.name = name || 'memory'; this.available = true; this._m = new Map(); }
  get(k) { return this._m.has(k) ? this._m.get(k) : null; }
  set(k, v) { this._m.set(k, v); return true; }
  remove(k) { this._m.delete(k); }
  keys() { return Array.from(this._m.keys()); }
}

class WebStorageBackend {
  constructor(store, name) {
    this.name = name;
    this._s = store;
    this.available = false;
    try {
      const probe = STORAGE_NAMESPACE + '.probe';
      store.setItem(probe, '1');
      store.removeItem(probe);
      this.available = true;
    } catch (_) { /* mode privé, quota, stockage désactivé */ }
  }
  get(k) { try { return this._s.getItem(k); } catch (_) { return null; } }
  set(k, v) { try { this._s.setItem(k, v); return true; } catch (_) { return false; } }
  remove(k) { try { this._s.removeItem(k); } catch (_) {} }
  keys() {
    const out = [];
    try {
      for (let i = 0; i < this._s.length; i++) {
        const k = this._s.key(i);
        if (k && k.indexOf(STORAGE_NAMESPACE) === 0) out.push(k);
      }
    } catch (_) {}
    return out;
  }
}

class CookieBackend {
  constructor() {
    this.name = 'cookie';
    this.available = false;
    try {
      this.available = typeof document !== 'undefined' &&
        typeof document.cookie === 'string' &&
        typeof location !== 'undefined' && location.protocol !== 'file:';
    } catch (_) {}
  }
  get(k) {
    if (!this.available) return null;
    try {
      const name = encodeURIComponent(k) + '=';
      for (const part of document.cookie.split(';')) {
        const c = part.trim();
        if (c.indexOf(name) === 0) return decodeURIComponent(c.slice(name.length));
      }
    } catch (_) {}
    return null;
  }
  set(k, v) {
    if (!this.available) return false;
    try {
      // Les cookies plafonnent autour de 4 Ko : on n'y met que les
      // enregistrements courts (démo, identité), pas la licence.
      if (v.length > 3500) return false;
      const exp = new Date(Date.now() + 400 * 24 * 3600 * 1000).toUTCString();
      document.cookie = encodeURIComponent(k) + '=' + encodeURIComponent(v) +
        ';expires=' + exp + ';path=/;SameSite=Lax';
      return true;
    } catch (_) { return false; }
  }
  remove(k) {
    if (!this.available) return;
    try { document.cookie = encodeURIComponent(k) + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/'; } catch (_) {}
  }
  keys() {
    if (!this.available) return [];
    try {
      return document.cookie.split(';')
        .map(c => decodeURIComponent(c.trim().split('=')[0] || ''))
        .filter(k => k.indexOf(STORAGE_NAMESPACE) === 0);
    } catch (_) { return []; }
  }
}

/** Miroir IndexedDB : lecture unique au démarrage, écritures sans attente. */
class IndexedDbMirror {
  constructor() {
    this.name = 'indexeddb';
    this.available = typeof indexedDB !== 'undefined';
    this._db = null;
  }
  _open() {
    if (!this.available) return Promise.resolve(null);
    if (this._db) return Promise.resolve(this._db);
    return new Promise((resolve) => {
      let req;
      try { req = indexedDB.open(STORAGE_NAMESPACE, 1); } catch (_) { return resolve(null); }
      req.onupgradeneeded = () => {
        try { req.result.createObjectStore('records'); } catch (_) {}
      };
      req.onsuccess = () => { this._db = req.result; resolve(this._db); };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    });
  }
  async readAll() {
    const db = await this._open();
    if (!db) return {};
    return new Promise((resolve) => {
      const out = {};
      try {
        const tx = db.transaction('records', 'readonly');
        const store = tx.objectStore('records');
        const cur = store.openCursor();
        cur.onsuccess = (e) => {
          const c = e.target.result;
          if (!c) return resolve(out);
          out[c.key] = c.value;
          c.continue();
        };
        cur.onerror = () => resolve(out);
      } catch (_) { resolve(out); }
    });
  }
  write(key, value) {
    this._open().then((db) => {
      if (!db) return;
      try {
        const tx = db.transaction('records', 'readwrite');
        tx.objectStore('records').put(value, key);
      } catch (_) {}
    });
  }
  erase(key) {
    this._open().then((db) => {
      if (!db) return;
      try {
        const tx = db.transaction('records', 'readwrite');
        tx.objectStore('records').delete(key);
      } catch (_) {}
    });
  }
}

/** Construit les dépôts disponibles dans l'environnement courant. */
export function defaultBackends() {
  const list = [];
  try {
    if (typeof localStorage !== 'undefined') {
      const b = new WebStorageBackend(localStorage, 'localStorage');
      if (b.available) list.push(b);
    }
  } catch (_) {}
  const cookie = new CookieBackend();
  if (cookie.available) list.push(cookie);
  if (!list.length) list.push(new MemoryBackend('memory-fallback'));
  return list;
}

/* ---------------------------------------------------------- */
/* SecureLicenseStorage                                        */
/* ---------------------------------------------------------- */

export class SecureLicenseStorage {
  /**
   * @param {{backends?:Array, mirror?:object, namespace?:string}} opts
   */
  constructor(opts) {
    opts = opts || {};
    this.namespace = opts.namespace || STORAGE_NAMESPACE;
    this.backends = opts.backends || defaultBackends();
    this.mirror = opts.mirror !== undefined
      ? opts.mirror
      : (typeof indexedDB !== 'undefined' ? new IndexedDbMirror() : null);
    this._sealKey = null;
    /** Anomalies constatées à la lecture : sceau invalide, dépôt manquant… */
    this.integrityEvents = [];
  }

  /* -- clé de scellement -- */

  /**
   * La clé de sceau dérive de l'identifiant d'installation : si
   * l'identité est effacée puis recréée, les anciens enregistrements
   * ne se rouvrent plus et sont signalés comme étrangers.
   */
  setSealSecret(installId) {
    this._sealKey = utf8Encode('averi-seal-v1:' + String(installId || 'anonymous'));
  }

  /**
   * L'enregistrement d'identité est le seul à être scellé avec une clé
   * FIXE : il porte l'identifiant d'installation dont dérivent toutes les
   * autres clés de sceau, il ne peut donc pas dépendre de lui-même. Le
   * sceller avec la clé dérivée le rendrait illisible au démarrage
   * suivant — et chaque rechargement de page créerait une installation
   * neuve, invalidant démonstration et licence.
   */
  _sealKeyFor(key) {
    // L'identité et le jeton d'essai emploient la clé d'amorçage.
    // Pour le jeton, c'est délibéré : effacer l'identité pour s'en
    // fabriquer une neuve ne doit PAS rendre le jeton illisible, sinon
    // le contournement le plus évident redeviendrait efficace.
    if (key === RECORD_KEYS.identity || key === RECORD_KEYS.trial) return BOOTSTRAP_SEAL_KEY;
    return this._sealKey || BOOTSTRAP_SEAL_KEY;
  }

  _seal(key, payloadJson) {
    const mac = hmacSha512(this._sealKeyFor(key), utf8Encode(key + '|' + payloadJson));
    return toHex(mac).slice(0, 32);
  }

  _fullKey(key) { return this.namespace + '.' + key; }

  /* -- primitives -- */

  /**
   * Écrit un enregistrement dans tous les dépôts.
   * @returns {boolean} vrai si au moins un dépôt a accepté l'écriture
   */
  write(key, data) {
    const body = JSON.stringify({ v: RECORD_VERSION, k: key, t: Date.now(), d: data });
    const envelope = JSON.stringify({ b: body, h: this._seal(key, body) });
    const fk = this._fullKey(key);
    let ok = false;
    for (const backend of this.backends) {
      if (backend.set(fk, envelope)) ok = true;
    }
    if (this.mirror) this.mirror.write(fk, envelope);
    return ok;
  }

  /**
   * Lit un enregistrement. En cas de divergence entre dépôts, le plus
   * récent scellé correctement l'emporte, puis il est réinstallé
   * partout (auto-réparation).
   *
   * @returns {{data:any, sealed:boolean, foundIn:string[], missingIn:string[]}|null}
   */
  read(key) {
    const fk = this._fullKey(key);
    const found = [];
    const missing = [];

    for (const backend of this.backends) {
      const raw = backend.get(fk);
      if (raw == null) { missing.push(backend.name); continue; }
      const parsed = this._parse(key, raw);
      if (!parsed) {
        this._note('record_unreadable', { key, backend: backend.name });
        missing.push(backend.name);
        continue;
      }
      found.push({ backend: backend.name, parsed, raw });
    }

    if (!found.length) return null;

    // Un enregistrement descellé signale une édition manuelle.
    const sealedOnes = found.filter(f => f.parsed.sealed);
    if (sealedOnes.length !== found.length) {
      this._note('seal_mismatch', { key, backends: found.filter(f => !f.parsed.sealed).map(f => f.backend) });
    }

    const pool = sealedOnes.length ? sealedOnes : found;
    pool.sort((a, b) => (b.parsed.t || 0) - (a.parsed.t || 0));
    const winner = pool[0];

    if (missing.length) {
      this._note('record_missing', { key, backends: missing });
      // Auto-réparation : on réinstalle l'enregistrement retenu partout.
      for (const backend of this.backends) {
        if (missing.indexOf(backend.name) !== -1) backend.set(fk, winner.raw);
      }
      if (this.mirror) this.mirror.write(fk, winner.raw);
    }

    return {
      data: winner.parsed.d,
      sealed: winner.parsed.sealed,
      savedAt: winner.parsed.t,
      foundIn: found.map(f => f.backend),
      missingIn: missing
    };
  }

  erase(key) {
    const fk = this._fullKey(key);
    for (const backend of this.backends) backend.remove(fk);
    if (this.mirror) this.mirror.erase(fk);
  }

  _parse(key, raw) {
    let envelope;
    try { envelope = JSON.parse(raw); } catch (_) { return null; }
    if (!envelope || typeof envelope.b !== 'string') return null;
    let body;
    try { body = JSON.parse(envelope.b); } catch (_) { return null; }
    if (!body || body.k !== key) return null;
    const sealed = envelope.h === this._seal(key, envelope.b);
    return { d: body.d, t: body.t, v: body.v, sealed };
  }

  _note(kind, detail) {
    this.integrityEvents.push(Object.assign({ kind, at: Date.now() }, detail));
    if (this.integrityEvents.length > 50) this.integrityEvents.shift();
  }

  /**
   * Récupère les enregistrements du miroir IndexedDB et rétablit ceux
   * qui manquent aux dépôts synchrones. À appeler une fois au démarrage.
   */
  async hydrate() {
    if (!this.mirror) return { restored: [] };
    let all = {};
    try { all = await this.mirror.readAll(); } catch (_) { return { restored: [] }; }
    const restored = [];
    for (const fk of Object.keys(all)) {
      if (fk.indexOf(this.namespace + '.') !== 0) continue;
      const value = all[fk];
      for (const backend of this.backends) {
        if (backend.get(fk) == null) {
          backend.set(fk, value);
          restored.push({ key: fk, backend: backend.name });
        }
      }
    }
    if (restored.length) this._note('mirror_restored', { count: restored.length });
    return { restored };
  }

  /* -- API métier -- */

  saveIdentity(identity) {
    return this.write(RECORD_KEYS.identity, {
      installId: identity.installId,
      createdAt: identity.createdAt,
      traitsDigest: identity.traitsDigest
    });
  }
  loadIdentity() { return this.read(RECORD_KEYS.identity); }

  saveLicense(token, meta) {
    return this.write(RECORD_KEYS.license, { token, meta: meta || {} });
  }
  loadLicense() { return this.read(RECORD_KEYS.license); }
  deleteLicense() { this.erase(RECORD_KEYS.license); this.erase(RECORD_KEYS.activation); }

  saveActivation(activation) { return this.write(RECORD_KEYS.activation, activation); }
  loadActivation() { return this.read(RECORD_KEYS.activation); }

  saveDemoState(state) { return this.write(RECORD_KEYS.demo, state); }
  loadDemoState() { return this.read(RECORD_KEYS.demo); }

  saveTrialToken(token) { return this.write(RECORD_KEYS.trial, token); }
  loadTrialToken() { return this.read(RECORD_KEYS.trial); }
  eraseTrialToken() { this.erase(RECORD_KEYS.trial); }

  saveKeyring(keyring) { return this.write(RECORD_KEYS.keyring, keyring); }
  loadKeyring() { return this.read(RECORD_KEYS.keyring); }

  saveRevocationList(list) { return this.write(RECORD_KEYS.revocation, list); }
  loadRevocationList() { return this.read(RECORD_KEYS.revocation); }

  saveJournal(entries) { return this.write(RECORD_KEYS.journal, entries); }
  loadJournal() { return this.read(RECORD_KEYS.journal); }

  /** État des dépôts, pour l'onglet Diagnostics de la console privée. */
  describe() {
    return {
      namespace: this.namespace,
      backends: this.backends.map(b => ({ name: b.name, available: b.available !== false })),
      mirror: this.mirror ? { name: this.mirror.name, available: this.mirror.available } : null,
      integrityEvents: this.integrityEvents.slice()
    };
  }
}

export { MemoryBackend, WebStorageBackend, CookieBackend, IndexedDbMirror };
