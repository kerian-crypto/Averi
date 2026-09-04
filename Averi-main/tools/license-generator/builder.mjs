/* ==========================================================
   AVERI LICENSE GENERATOR — LicenseBuilder
   ----------------------------------------------------------
   Construit une charge utile conforme au schéma, en s'appuyant
   sur la MÊME configuration que l'application : impossible
   d'émettre une licence pour un plan que le client ignore.
   ========================================================== */

import { randomBytes } from 'node:crypto';
import {
  PRODUCT_ID, LICENSE_FORMAT_VERSION, LICENSE_ISSUER, ACTIVE_KEY_ID,
  PLANS, PRIVATE_PLAN, PRIVATE_PLAN_ID, ALL_FEATURES, ALL_PERMISSIONS, getPlan
} from '../../src/licensing/config.js';
import { validatePayloadShape } from '../../src/licensing/license-format.js';
import { parseDeviceCode } from '../../src/licensing/device.js';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function newLicenseId() {
  const b = randomBytes(8);
  let s = '';
  for (const byte of b) s += CROCKFORD[byte % 32];
  return 'AVR-' + s;
}

/** « 30d », « 12h », « 90 », « 1y » -> millisecondes. */
export function parseDuration(input) {
  const s = String(input).trim().toLowerCase();
  const m = /^(\d+)\s*(m|h|d|w|y)?$/.exec(s);
  if (!m) throw new Error(`Durée invalide : « ${input} » (attendu : 30d, 12h, 8w, 1y)`);
  const n = Number(m[1]);
  const unit = m[2] || 'd';
  const factor = { m: 60e3, h: 3600e3, d: 86400e3, w: 7 * 86400e3, y: 365 * 86400e3 }[unit];
  return n * factor;
}

/**
 * @param {{type:'public'|'private', plan?:string, durationMs?:number,
 *          notBefore?:number, expiresAt?:number, deviceFingerprint?:string|null,
 *          deviceLimit?:number, features?:string[]|null, permissions?:string[],
 *          metadata?:object, keyId?:string, issuedAt?:number, licenseId?:string}} spec
 */
export function buildPayload(spec) {
  const type = spec.type;
  if (type !== 'public' && type !== 'private') {
    throw new Error('type doit valoir « public » ou « private »');
  }

  const planId = type === 'private' ? (spec.plan || PRIVATE_PLAN_ID) : spec.plan;
  if (!planId) throw new Error('un plan est requis (--plan plan_1000 | plan_2000)');

  if (type === 'public' && planId === PRIVATE_PLAN_ID) {
    throw new Error('le plan interne est réservé aux licences privées');
  }
  if (type === 'private' && planId !== PRIVATE_PLAN_ID) {
    throw new Error(`une licence privée doit utiliser le plan « ${PRIVATE_PLAN_ID} »`);
  }

  const plan = getPlan(planId);
  if (!plan) {
    throw new Error(`Plan inconnu : « ${planId} ». Plans disponibles : ` +
      Object.keys(PLANS).concat(PRIVATE_PLAN_ID).join(', '));
  }

  const issuedAt = spec.issuedAt || Math.floor(Date.now() / 1000);
  const notBefore = spec.notBefore || issuedAt;
  const durationMs = spec.durationMs != null
    ? spec.durationMs
    : plan.default_duration_days * 86400e3;
  const expiresAt = spec.expiresAt !== undefined
    ? spec.expiresAt
    : notBefore + Math.floor(durationMs / 1000);

  // Les features émises ne peuvent pas dépasser celles du plan.
  const allowed = new Set(plan.features);
  let features;
  if (Array.isArray(spec.features) && spec.features.length) {
    const unknown = spec.features.filter(f => !ALL_FEATURES.includes(f));
    if (unknown.length) throw new Error('Features inconnues : ' + unknown.join(', '));
    const outside = spec.features.filter(f => !allowed.has(f));
    if (outside.length) {
      throw new Error(`Features hors du plan « ${planId} » : ` + outside.join(', '));
    }
    features = spec.features.slice();
  } else {
    features = plan.features.slice();
  }

  let permissions;
  if (type === 'private') {
    permissions = (spec.permissions && spec.permissions.length) ? spec.permissions.slice() : ['support', 'diagnostics'];
    const unknown = permissions.filter(p => !ALL_PERMISSIONS.includes(p));
    if (unknown.length) throw new Error('Permissions inconnues : ' + unknown.join(', '));
  } else if (spec.permissions && spec.permissions.length) {
    throw new Error('une licence publique ne peut pas porter de permissions');
  }

  // Le client transmet son code sous la forme « AVR-DEV-1CE1-… » ; on
  // accepte aussi l'hexadécimal nu, avec ou sans tirets, en toute casse.
  let dev = { m: 'none' };
  if (spec.deviceFingerprint) {
    const empreinte = parseDeviceCode(spec.deviceFingerprint);
    if (!empreinte) {
      throw new Error('Code d’appareil invalide : « ' + spec.deviceFingerprint + ' »\n' +
        'Attendu : le code que le client copie dans « Activer une licence »,\n' +
        'de la forme AVR-DEV-1CE1-BCCC-062C-D07C-3AC8-BDF2-6DA9-FBFF\n' +
        '(ou les 32 caractères hexadécimaux seuls).');
    }
    dev = { m: 'fp', v: empreinte };
  }

  const payload = {
    v: LICENSE_FORMAT_VERSION,
    id: spec.licenseId || newLicenseId(),
    typ: type,
    prd: PRODUCT_ID,
    pln: planId,
    iat: issuedAt,
    nbf: notBefore,
    exp: expiresAt,
    dev,
    dlm: spec.deviceLimit || 1,
    ftr: features,
    iss: LICENSE_ISSUER,
    kid: spec.keyId || ACTIVE_KEY_ID
  };

  if (permissions) payload.prm = permissions;
  if (spec.metadata && Object.keys(spec.metadata).length) payload.met = spec.metadata;

  validatePayloadShape(payload);
  return payload;
}
