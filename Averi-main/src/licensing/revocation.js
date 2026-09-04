/* ==========================================================
   AVERI LICENSING — Révocation
   ----------------------------------------------------------
   HONNÊTETÉ TECHNIQUE : sans serveur, une révocation à distance
   instantanée est IMPOSSIBLE. Ce module ne prétend pas la
   fournir. Il fournit :

   - une liste de révocation locale, signée par la même autorité
     que les licences (donc infalsifiable, mais dont la
     distribution reste manuelle : elle voyage avec une mise à
     jour de l'application ou est collée par le support) ;
   - un point d'entrée unique par lequel un futur validateur
     distant pourra rafraîchir cette liste.
   ========================================================== */

import { decodeToken } from './license-format.js';

/**
 * Liste de révocation embarquée avec l'application.
 * Format : { ids: ["AVR-XXXX"], until: epochSeconds, reason: {...} }
 * Renseignée à la publication d'une nouvelle version du client.
 */
export const EMBEDDED_REVOCATIONS = {
  ids: [],
  reasons: {}
};

export class RevocationRegistry {
  constructor(opts) {
    opts = opts || {};
    this.storage = opts.storage || null;
    this.embedded = opts.embedded || EMBEDDED_REVOCATIONS;
    this._local = null;
  }

  _loadLocal() {
    if (this._local) return this._local;
    let data = { ids: [], reasons: {}, updatedAt: 0 };
    if (this.storage) {
      const rec = this.storage.loadRevocationList();
      // Une liste descellée est ignorée : elle pourrait avoir été
      // ajoutée par un tiers pour bloquer une licence légitime.
      if (rec && rec.sealed && rec.data && Array.isArray(rec.data.ids)) {
        data = {
          ids: rec.data.ids.filter(x => typeof x === 'string'),
          reasons: (rec.data.reasons && typeof rec.data.reasons === 'object') ? rec.data.reasons : {},
          updatedAt: Number(rec.data.updatedAt) || 0
        };
      }
    }
    this._local = data;
    return data;
  }

  /** @returns {{revoked:boolean, reason:string|null, source:string|null}} */
  check(licenseId) {
    const id = String(licenseId || '');
    if (this.embedded.ids.indexOf(id) !== -1) {
      return { revoked: true, reason: this.embedded.reasons[id] || null, source: 'embedded' };
    }
    const local = this._loadLocal();
    if (local.ids.indexOf(id) !== -1) {
      return { revoked: true, reason: local.reasons[id] || null, source: 'local' };
    }
    return { revoked: false, reason: null, source: null };
  }

  /** Ajoute des identifiants à la liste locale (console privée / futur backend). */
  add(ids, reason) {
    const local = this._loadLocal();
    const set = new Set(local.ids);
    for (const id of [].concat(ids)) {
      if (typeof id === 'string' && id) {
        set.add(id);
        if (reason) local.reasons[id] = String(reason);
      }
    }
    local.ids = Array.from(set);
    local.updatedAt = Date.now();
    if (this.storage) this.storage.saveRevocationList(local);
    return local;
  }

  remove(id) {
    const local = this._loadLocal();
    local.ids = local.ids.filter(x => x !== id);
    delete local.reasons[id];
    local.updatedAt = Date.now();
    if (this.storage) this.storage.saveRevocationList(local);
    return local;
  }

  list() {
    const local = this._loadLocal();
    return {
      embedded: this.embedded.ids.slice(),
      local: local.ids.slice(),
      reasons: Object.assign({}, this.embedded.reasons, local.reasons),
      updatedAt: local.updatedAt
    };
  }

  /**
   * Point d'entrée d'un futur rafraîchissement distant.
   * Aujourd'hui : accepte une liste déjà vérifiée. Demain : sera
   * appelé par RemoteLicenseValidator après contrôle de signature.
   */
  merge(list) {
    if (!list || !Array.isArray(list.ids)) return this.list();
    this.add(list.ids, null);
    if (list.reasons) {
      const local = this._loadLocal();
      Object.assign(local.reasons, list.reasons);
      if (this.storage) this.storage.saveRevocationList(local);
    }
    return this.list();
  }
}

/** Utilitaire : extrait l'identifiant d'un jeton sans le vérifier. */
export function licenseIdOf(token) {
  try { return decodeToken(token).payload.id; } catch (_) { return null; }
}
