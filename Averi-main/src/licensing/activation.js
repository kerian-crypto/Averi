/* ==========================================================
   AVERI LICENSING — Activation
   ----------------------------------------------------------
   Flux : jeton saisi -> validateur -> enregistrement local.

   L'enregistrement d'activation est distinct de la licence
   elle-même : il note QUAND et SUR QUELLE installation la
   licence a été activée. C'est ce qui permet, sans serveur, de
   distinguer « licence valide » de « licence valide mais
   activée ailleurs ».
   ========================================================== */

import { STATUS } from './status.js';
import { sha512 } from './sha512.js';
import { utf8Encode, toHex } from './base64.js';
import { KEYRING_MAX_ENTRIES } from './storage.js';
import { decodeToken } from './license-format.js';

const ACTIVATION_VERSION = 1;

export class ActivationService {
  /**
   * @param {{storage:object, validator:object, identity:object, journal?:object}} opts
   */
  constructor(opts) {
    this.storage = opts.storage;
    this.validator = opts.validator;
    this.identity = opts.identity;
    this.journal = opts.journal || null;
  }

  /** Empreinte du jeton : sert d'anti-rejeu sans stocker le jeton deux fois. */
  static tokenDigest(token) {
    return toHex(sha512(utf8Encode('averi-activation-v1:' + String(token)))).slice(0, 32);
  }

  /**
   * Active une licence.
   * @param {string} token
   * @returns {{ok:boolean, status:string, result:object, activation:object|null}}
   */
  activate(token) {
    const ctx = { identity: this.identity };
    const result = this.validator.validateSync(token, ctx);

    if (!result || result.status !== STATUS.LICENSE_ACTIVE) {
      this._log('activation_refusée', { status: result ? result.status : 'inconnu' });
      return { ok: false, status: result ? result.status : STATUS.LICENSE_UNKNOWN, result, activation: null };
    }

    const existing = this._loadActivation();
    const digest = ActivationService.tokenDigest(token);

    // Rejeu : la même licence déjà activée sur cette installation est
    // simplement confirmée, pas re-comptée.
    let activation;
    if (existing && existing.tokenDigest === digest && existing.installId === this.identity.installId) {
      activation = Object.assign({}, existing, { lastSeenAt: Date.now(), count: existing.count });
    } else {
      activation = {
        version: ACTIVATION_VERSION,
        licenseId: result.license.id,
        tokenDigest: digest,
        installId: this.identity.installId,
        deviceFingerprint: this.identity.fingerprint,
        activatedAt: Date.now(),
        lastSeenAt: Date.now(),
        count: (existing && existing.licenseId === result.license.id ? existing.count : 0) + 1,
        planId: result.license.planId,
        type: result.license.type
      };
    }

    this.storage.saveActivation(activation);
    this.storage.saveLicense(token, { licenseId: result.license.id, planId: result.license.planId });
    this._remember(token, result.license);
    this._log('activation_réussie', { licenseId: result.license.id, planId: result.license.planId });

    return { ok: true, status: STATUS.LICENSE_ACTIVE, result, activation };
  }

  /** Retire la licence active de cet appareil, et du trousseau. */
  deactivate() {
    const existing = this._loadActivation();
    this.storage.deleteLicense();
    if (existing && existing.licenseId) this.forget(existing.licenseId);
    else this._setActive(null);
    this._log('désactivation', { licenseId: existing ? existing.licenseId : null });
    return true;
  }

  /* ---------------------------------------------------------- */
  /* Trousseau                                                   */
  /* ---------------------------------------------------------- */

  /**
   * Inventaire brut des licences connues de cet appareil.
   * Une seule est active à la fois ; les autres sont conservées pour
   * pouvoir y revenir sans avoir à recoller le jeton.
   * @returns {{version:number, activeId:string|null, entries:Array}}
   */
  keyring() {
    const rec = this.storage.loadKeyring();
    if (!rec || !rec.data || rec.sealed === false || !Array.isArray(rec.data.entries)) {
      return { version: 1, activeId: null, entries: [] };
    }
    const entries = rec.data.entries.filter(e =>
      e && typeof e.token === 'string' && typeof e.id === 'string');
    return {
      version: Number(rec.data.version) || 1,
      activeId: typeof rec.data.activeId === 'string' ? rec.data.activeId : null,
      entries
    };
  }

  _saveKeyring(kr) {
    kr.entries = kr.entries.slice(-KEYRING_MAX_ENTRIES);
    this.storage.saveKeyring(kr);
    return kr;
  }

  /** Ajoute ou rafraîchit une entrée, puis la désigne comme active. */
  _remember(token, license) {
    const kr = this.keyring();
    const now = Date.now();
    const existing = kr.entries.find(e => e.id === license.id);
    if (existing) {
      existing.token = token;
      existing.lastUsedAt = now;
      existing.planId = license.planId;
      existing.type = license.type;
    } else {
      kr.entries.push({
        id: license.id,
        token,
        planId: license.planId,
        type: license.type,
        holder: (license.metadata && license.metadata.holder) || null,
        addedAt: now,
        lastUsedAt: now
      });
    }
    kr.activeId = license.id;
    return this._saveKeyring(kr);
  }

  _setActive(id) {
    const kr = this.keyring();
    kr.activeId = id;
    return this._saveKeyring(kr);
  }

  /**
   * Rend active une licence déjà présente dans le trousseau.
   * La licence est REVALIDÉE : une licence expirée ou révoquée depuis
   * son ajout ne redevient pas utilisable parce qu'elle est mémorisée.
   */
  switchTo(licenseId) {
    const entry = this.keyring().entries.find(e => e.id === licenseId);
    if (!entry) return { ok: false, status: STATUS.LICENSE_UNKNOWN, result: null, activation: null };
    return this.activate(entry.token);
  }

  /** Retire une licence du trousseau. Si elle était active, l'accès se referme. */
  forget(licenseId) {
    const kr = this.keyring();
    const before = kr.entries.length;
    kr.entries = kr.entries.filter(e => e.id !== licenseId);
    if (kr.activeId === licenseId) {
      kr.activeId = null;
      this.storage.deleteLicense();
    }
    this._saveKeyring(kr);
    this._log('licence_oubliée', { licenseId });
    return before !== kr.entries.length;
  }

  /** Identifiant de licence d'un jeton, sans le valider. */
  static licenseIdOf(token) {
    try { return decodeToken(token).payload.id; } catch (_) { return null; }
  }

  /** Licence stockée, ou null. */
  storedToken() {
    const rec = this.storage.loadLicense();
    if (!rec || !rec.data || typeof rec.data.token !== 'string') return null;
    return { token: rec.data.token, sealed: rec.sealed, meta: rec.data.meta || {} };
  }

  currentActivation() { return this._loadActivation(); }

  /**
   * Contrôle de cohérence entre l'activation enregistrée et
   * l'installation courante.
   * @returns {{ok:boolean, reason:string|null}}
   */
  checkActivationBinding() {
    const a = this._loadActivation();
    if (!a) return { ok: true, reason: null };
    if (a.installId && a.installId !== this.identity.installId) {
      return { ok: false, reason: 'activation enregistrée pour une autre installation' };
    }
    if (a.deviceFingerprint && a.deviceFingerprint !== this.identity.fingerprint) {
      return { ok: false, reason: 'empreinte d’appareil différente' };
    }
    return { ok: true, reason: null };
  }

  _loadActivation() {
    const rec = this.storage.loadActivation();
    if (!rec || !rec.data) return null;
    if (!rec.sealed) {
      this._log('activation_descellée', {});
      return null;                 // enregistrement trafiqué : ignoré
    }
    return rec.data;
  }

  _log(event, detail) {
    if (this.journal) this.journal.append(event, detail);
  }
}
