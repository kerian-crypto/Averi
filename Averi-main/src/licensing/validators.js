/* ==========================================================
   AVERI LICENSING — Validateurs
   ----------------------------------------------------------
   Une seule interface, trois implémentations. Aujourd'hui seul
   le validateur local est câblé ; le jour où un serveur existe,
   on remplace l'instance dans la façade — rien d'autre ne bouge.

     interface LicenseValidator {
       readonly name: string
       validate(token, ctx): Promise<LicenseStatusResult>
       validateSync(token, ctx): LicenseStatusResult | null
     }
   ========================================================== */

import { STATUS } from './status.js';

export class LocalLicenseValidator {
  constructor(engine) {
    this.name = 'local';
    this.engine = engine;
  }
  validateSync(token, ctx) {
    return this.engine.getLicenseStatus(token, ctx);
  }
  async validate(token, ctx) {
    return this.validateSync(token, ctx);
  }
}

/**
 * Validateur distant — SQUELETTE, non activé.
 *
 * Il n'existe aujourd'hui aucun serveur de licences Averi. Cette
 * classe fixe le contrat que ce serveur devra respecter afin que
 * son arrivée ne demande aucune réécriture :
 *
 *   POST {endpoint}/v1/validate
 *   { token, device_fingerprint, product, client_version }
 *   -> { status, revoked, expires_at, activations, server_time }
 *
 * Elle n'est jamais utilisée seule : hors ligne, elle ne peut rien
 * dire, et une licence valide localement ne doit pas être refusée
 * parce que le réseau est absent.
 */
export class RemoteLicenseValidator {
  constructor(opts) {
    opts = opts || {};
    this.name = 'remote';
    this.endpoint = opts.endpoint || null;
    this.timeoutMs = opts.timeoutMs || 6000;
    this.fetchImpl = opts.fetch || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
  }

  get enabled() { return !!(this.endpoint && this.fetchImpl); }

  validateSync() { return null; }

  async validate(token, ctx) {
    if (!this.enabled) {
      return { status: STATUS.LICENSE_UNKNOWN, valid: false, detail: 'validateur distant non configuré', offline: true };
    }
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), this.timeoutMs) : null;
    try {
      const res = await this.fetchImpl(this.endpoint.replace(/\/+$/, '') + '/v1/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token,
          device_fingerprint: ctx && ctx.identity ? ctx.identity.fingerprint : null,
          product: ctx && ctx.productId ? ctx.productId : 'averi'
        }),
        signal: controller ? controller.signal : undefined
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const body = await res.json();
      return {
        status: body.status || STATUS.LICENSE_UNKNOWN,
        valid: body.status === STATUS.LICENSE_ACTIVE,
        revoked: !!body.revoked,
        serverTime: body.server_time || null,
        detail: body.detail || null,
        offline: false
      };
    } catch (err) {
      return { status: STATUS.LICENSE_UNKNOWN, valid: false, detail: 'serveur injoignable', offline: true };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

/**
 * Validateur hybride — la cible une fois le backend en place.
 *
 * Politique retenue : le local FAIT AUTORITÉ pour accorder l'accès
 * (l'application doit rester utilisable hors ligne), le distant ne
 * peut que RETIRER un accès — révocation, activation sur un autre
 * appareil, licence remboursée. Un serveur injoignable ne prive
 * donc jamais un client payant de son achat.
 */
export class HybridLicenseValidator {
  constructor(local, remote, opts) {
    opts = opts || {};
    this.name = 'hybrid';
    this.local = local;
    this.remote = remote;
    this.onRemoteVerdict = opts.onRemoteVerdict || null;
  }

  validateSync(token, ctx) {
    return this.local.validateSync(token, ctx);
  }

  async validate(token, ctx) {
    const localResult = this.local.validateSync(token, ctx);
    if (!this.remote || !this.remote.enabled) return localResult;

    const remoteResult = await this.remote.validate(token, ctx);
    if (remoteResult.offline) return localResult;

    if (this.onRemoteVerdict) this.onRemoteVerdict(remoteResult);

    // Le distant ne peut que restreindre.
    if (localResult.valid && !remoteResult.valid) {
      return Object.assign({}, localResult, {
        status: remoteResult.status,
        valid: false,
        detail: remoteResult.detail || 'refusée par le serveur de licences'
      });
    }
    return localResult;
  }
}
