/* ==========================================================
   AVERI LICENSING — Identité d'installation
   ----------------------------------------------------------
   DÉCISION : l'empreinte d'appareil est dérivée d'un identifiant
   d'installation ALÉATOIRE, pas des caractéristiques matérielles.

   Pourquoi ? Une empreinte matérielle (canvas, polices, écran…)
   est à la fois intrusive — c'est du pistage — et instable :
   changer de résolution ou mettre à jour son navigateur casserait
   la licence d'un client légitime. Un identifiant aléatoire
   persistant est stable, ne révèle rien de l'utilisateur, et
   suffit à lier une licence à une installation.

   Les traits matériels sont malgré tout collectés, mais
   uniquement à titre de DIAGNOSTIC (console privée) et de signal
   faible « profil probablement copié ». Ils ne bloquent rien.
   ========================================================== */

import { sha512 } from './sha512.js';
import { utf8Encode, toHex } from './base64.js';

/** 32 octets aléatoires, cryptographiquement sûrs quand la plateforme le permet. */
function randomBytes(n) {
  const out = new Uint8Array(n);
  const c = (typeof globalThis !== 'undefined' && globalThis.crypto) ? globalThis.crypto : null;
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(out);
    return out;
  }
  // Repli : environnement sans WebCrypto. L'identifiant reste unique en
  // pratique, mais on le signale pour le diagnostic.
  for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  out.weakEntropy = true;
  return out;
}

export function newInstallId() {
  return toHex(randomBytes(32));
}

/**
 * Met l'empreinte en forme lisible : AVR-DEV-1CE1-BCCC-…-FBFF.
 *
 * Le code affiché contient l'empreinte ENTIÈRE, simplement groupée par
 * quatre. C'est indispensable : le client copie ce code et l'envoie au
 * support, qui doit pouvoir le passer tel quel à `--device`. Une forme
 * abrégée serait plus jolie mais non réversible — le support recevrait
 * un code dont il ne pourrait rien faire, et le parcours « licence liée
 * à l'appareil » deviendrait impraticable.
 */
export function formatDeviceCode(fingerprint) {
  const hex = String(fingerprint || '').toUpperCase();
  const groupes = [];
  for (let i = 0; i < hex.length; i += 4) groupes.push(hex.slice(i, i + 4));
  return 'AVR-DEV-' + groupes.join('-');
}

/**
 * Inverse de `formatDeviceCode`. Accepte le code complet, l'hexadécimal nu,
 * avec ou sans tirets, en toute casse. Retourne null si ce n'est pas une
 * empreinte valide.
 */
export function parseDeviceCode(input) {
  const nettoye = String(input || '')
    .trim()
    .replace(/^AVR[-_ ]?DEV[-_ ]?/i, '')
    .replace(/[\s-]/g, '')
    .toLowerCase();
  return /^[0-9a-f]{32}$/.test(nettoye) ? nettoye : null;
}

/**
 * Empreinte d'appareil : hachage de l'identifiant d'installation.
 * Le préfixe de domaine évite qu'elle puisse être confondue avec
 * un autre haché du système.
 */
export function fingerprintOf(installId) {
  return toHex(sha512(utf8Encode('averi-device-v1:' + installId))).slice(0, 32);
}

/** Traits d'environnement, à usage de diagnostic uniquement. */
export function environmentTraits() {
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const scr = typeof screen !== 'undefined' ? screen : {};
  let tz = '';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (_) {}
  return {
    platform: String(nav.platform || nav.userAgentData?.platform || ''),
    language: String(nav.language || ''),
    languages: Array.isArray(nav.languages) ? nav.languages.join(',') : '',
    timezone: tz,
    screen: (scr.width || 0) + 'x' + (scr.height || 0) + '@' + (scr.colorDepth || 0),
    cores: Number(nav.hardwareConcurrency || 0),
    memory: Number(nav.deviceMemory || 0),
    touch: Number(nav.maxTouchPoints || 0),
    ua: String(nav.userAgent || '').slice(0, 180)
  };
}

/** Hachage court des traits, pour repérer un profil déplacé d'une machine à l'autre. */
export function traitsDigest(traits) {
  const stable = [traits.platform, traits.language, traits.timezone, traits.screen,
                  traits.cores, traits.memory, traits.touch].join('|');
  return toHex(sha512(utf8Encode('averi-traits-v1:' + stable))).slice(0, 16);
}

/**
 * Identité complète de l'installation.
 * @param {{installId:string}} record identité déjà persistée, ou null
 */
export function buildIdentity(record) {
  const installId = (record && typeof record.installId === 'string' && record.installId.length >= 32)
    ? record.installId
    : newInstallId();
  const traits = environmentTraits();
  const fingerprint = fingerprintOf(installId);
  return {
    installId,
    fingerprint,
    deviceCode: formatDeviceCode(fingerprint),
    traits,
    traitsDigest: traitsDigest(traits),
    createdAt: (record && record.createdAt) || Date.now(),
    /** vrai si l'empreinte des traits a changé depuis la création */
    traitsChanged: !!(record && record.traitsDigest && record.traitsDigest !== traitsDigest(traits))
  };
}
