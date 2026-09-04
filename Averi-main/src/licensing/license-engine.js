/* ==========================================================
   AVERI LICENSING — LicenseEngine
   ----------------------------------------------------------
   Point unique où l'on décide si une licence vaut quelque chose.
   L'interface n'appelle jamais ces méthodes une par une : elle
   demande `getLicenseStatus()` et affiche le résultat.

   Ordre des contrôles, du moins coûteux au plus coûteux, et du
   plus structurel au plus contextuel :
     parse -> version -> signature -> produit -> plan
           -> révocation -> validité temporelle -> appareil
   ========================================================== */

import { decodeToken, LicenseFormatError } from './license-format.js';
import { verify as ed25519Verify } from './ed25519.js';
import { b64uDecode, bytesEqual, utf8Encode } from './base64.js';
import { STATUS } from './status.js';
import {
  PRODUCT_ID, SUPPORTED_FORMAT_VERSIONS, LICENSE_ISSUER, TRUSTED_KEYS,
  ALL_FEATURES, ALL_PERMISSIONS, getPlan, PRIVATE_PLAN_ID,
  LICENSE_CLOCK_GRACE_MS
} from './config.js';

/** Résultat structuré, toujours de la même forme. */
function result(status, extra) {
  return Object.assign({
    status,
    valid: status === STATUS.LICENSE_ACTIVE,
    license: null,
    plan: null,
    features: [],
    permissions: [],
    detail: null
  }, extra || {});
}

export class LicenseEngine {
  /**
   * @param {{trustedKeys?:object, productId?:string, revocations?:object,
   *          verifier?:Function, nowMs?:Function, graceMs?:number}} opts
   */
  constructor(opts) {
    opts = opts || {};
    this.trustedKeys = opts.trustedKeys || TRUSTED_KEYS;
    this.productId = opts.productId || PRODUCT_ID;
    this.revocations = opts.revocations || null;
    this.verifier = opts.verifier || ed25519Verify;
    this.nowMs = opts.nowMs || (() => Date.now());
    this.graceMs = opts.graceMs != null ? opts.graceMs : LICENSE_CLOCK_GRACE_MS;
  }

  /* ---- étapes élémentaires, testables séparément ---- */

  /** @throws {LicenseFormatError} */
  parseLicense(token) {
    return decodeToken(token);
  }

  verifyVersion(payload) {
    return SUPPORTED_FORMAT_VERSIONS.includes(payload.v);
  }

  /**
   * Vérifie la signature Ed25519 sur les octets exacts du jeton.
   * @returns {{ok:boolean, reason:string|null}}
   */
  verifySignature(parsed) {
    const kid = parsed.payload.kid;
    const keyB64 = this.trustedKeys[kid];
    if (!keyB64) return { ok: false, reason: 'clé de signature inconnue : ' + kid };
    let key;
    try {
      key = b64uDecode(keyB64);
    } catch (_) {
      return { ok: false, reason: 'clé publique illisible' };
    }
    if (key.length !== 32) return { ok: false, reason: 'clé publique de taille invalide' };
    const ok = this.verifier(parsed.signature, parsed.signingInput, key);
    return { ok: !!ok, reason: ok ? null : 'signature invalide' };
  }

  verifyProduct(payload) {
    return payload.prd === this.productId;
  }

  verifyIssuer(payload) {
    return payload.iss === LICENSE_ISSUER;
  }

  /** @returns {{ok:boolean, status:string|null}} */
  verifyExpiration(payload, nowMs) {
    const now = Math.floor((nowMs != null ? nowMs : this.nowMs()) / 1000);
    const grace = Math.floor(this.graceMs / 1000);
    if (payload.nbf > 0 && now + grace < payload.nbf) {
      return { ok: false, status: STATUS.LICENSE_NOT_YET_VALID };
    }
    if (payload.exp > 0 && now - grace > payload.exp) {
      return { ok: false, status: STATUS.LICENSE_EXPIRED };
    }
    return { ok: true, status: null };
  }

  /**
   * @param {object} payload
   * @param {{fingerprint:string}} identity
   * @returns {{ok:boolean, bound:boolean}}
   */
  verifyDeviceBinding(payload, identity) {
    const dev = payload.dev || { m: 'none' };
    if (dev.m === 'none') return { ok: true, bound: false };
    if (dev.m !== 'fp') return { ok: false, bound: true };
    if (!identity || !identity.fingerprint) return { ok: false, bound: true };
    const a = utf8Encode(String(dev.v));
    const b = utf8Encode(String(identity.fingerprint));
    return { ok: bytesEqual(a, b), bound: true };
  }

  /**
   * Croise les features déclarées dans la licence et celles du plan.
   * Une licence ne peut pas accorder plus que son plan : modifier le
   * tableau `ftr` casse la signature, mais cette intersection ferme
   * aussi la porte à une émission administrative erronée.
   */
  verifyFeatures(payload) {
    const plan = getPlan(payload.pln);
    if (!plan) return { ok: false, features: [], plan: null };
    const allowedByPlan = new Set(plan.features);
    const known = new Set(ALL_FEATURES);
    const features = payload.ftr.filter(f => known.has(f) && allowedByPlan.has(f));
    return { ok: true, features, plan };
  }

  verifyPermissions(payload) {
    if (payload.typ !== 'private') return [];
    const known = new Set(ALL_PERMISSIONS);
    return (Array.isArray(payload.prm) ? payload.prm : []).filter(p => known.has(p));
  }

  /* ---- évaluation complète ---- */

  /**
   * @param {string} token
   * @param {{identity?:object, nowMs?:number}} ctx
   * @returns {{status:string, valid:boolean, license:object|null,
   *            plan:object|null, features:string[], permissions:string[],
   *            detail:string|null}}
   */
  getLicenseStatus(token, ctx) {
    ctx = ctx || {};

    if (!token) return result(STATUS.LICENSE_UNKNOWN);

    let parsed;
    try {
      parsed = this.parseLicense(token);
    } catch (err) {
      if (err instanceof LicenseFormatError) {
        if (err.code === 'VERSION') {
          return result(STATUS.LICENSE_VERSION_UNSUPPORTED, { detail: err.message });
        }
        // Une charge utile bien formée mais hors schéma est une
        // altération ; un jeton illisible est simplement invalide.
        const status = err.code === 'SCHEMA' ? STATUS.LICENSE_TAMPERED : STATUS.LICENSE_INVALID;
        return result(status, { detail: err.message });
      }
      return result(STATUS.LICENSE_INVALID, { detail: 'jeton illisible' });
    }

    const p = parsed.payload;

    if (!this.verifyVersion(p)) {
      return result(STATUS.LICENSE_VERSION_UNSUPPORTED, { detail: 'version ' + p.v });
    }

    const sig = this.verifySignature(parsed);
    if (!sig.ok) {
      // Signature invalide : soit la charge utile a été modifiée,
      // soit la licence est une contrefaçon. Les deux se disent
      // « ce code n'est pas valide » à l'utilisateur.
      return result(STATUS.LICENSE_TAMPERED, { detail: sig.reason });
    }

    if (!this.verifyProduct(p)) {
      return result(STATUS.LICENSE_PRODUCT_MISMATCH, { detail: 'produit ' + p.prd });
    }
    if (!this.verifyIssuer(p)) {
      return result(STATUS.LICENSE_INVALID, { detail: 'émetteur inattendu' });
    }

    const feat = this.verifyFeatures(p);
    if (!feat.ok) {
      return result(STATUS.LICENSE_PLAN_UNKNOWN, { detail: 'plan ' + p.pln });
    }
    if (p.typ === 'private' && p.pln !== PRIVATE_PLAN_ID) {
      return result(STATUS.LICENSE_PLAN_UNKNOWN, { detail: 'plan privé attendu' });
    }
    if (p.typ === 'public' && p.pln === PRIVATE_PLAN_ID) {
      return result(STATUS.LICENSE_PLAN_UNKNOWN, { detail: 'plan interne sur licence publique' });
    }

    if (this.revocations) {
      const rev = this.revocations.check(p.id);
      if (rev.revoked) {
        return result(STATUS.LICENSE_REVOKED, {
          license: this._describe(parsed), plan: feat.plan, detail: rev.reason
        });
      }
    }

    const exp = this.verifyExpiration(p, ctx.nowMs);
    if (!exp.ok) {
      return result(exp.status, { license: this._describe(parsed), plan: feat.plan });
    }

    const dev = this.verifyDeviceBinding(p, ctx.identity);
    if (!dev.ok) {
      return result(STATUS.LICENSE_DEVICE_MISMATCH, {
        license: this._describe(parsed), plan: feat.plan
      });
    }

    return result(STATUS.LICENSE_ACTIVE, {
      license: this._describe(parsed),
      plan: feat.plan,
      features: feat.features,
      permissions: this.verifyPermissions(p)
    });
  }

  /** Vue lisible d'une licence, sans exposer la signature brute. */
  _describe(parsed) {
    const p = parsed.payload;
    return {
      id: p.id,
      type: p.typ,
      product: p.prd,
      planId: p.pln,
      formatVersion: p.v,
      issuedAt: p.iat,
      notBefore: p.nbf,
      expiresAt: p.exp,
      deviceMode: p.dev.m,
      deviceFingerprint: p.dev.m === 'fp' ? p.dev.v : null,
      deviceLimit: p.dlm || 1,
      declaredFeatures: p.ftr.slice(),
      declaredPermissions: Array.isArray(p.prm) ? p.prm.slice() : [],
      issuer: p.iss,
      keyId: p.kid,
      metadata: p.met || {},
      token: parsed.token
    };
  }
}
