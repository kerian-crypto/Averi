/* ==========================================================
   AVERI LICENSING — Format de licence, versionné
   ----------------------------------------------------------
   Jeton :   AVR1.<payload_b64url>.<signature_b64url>

   La signature couvre les octets ASCII de « AVR1.<payload_b64url> »,
   c'est-à-dire l'entête de version ET la charge utile telle
   qu'elle a été transmise — jamais une re-sérialisation JSON.
   Deux conséquences :
     1. aucune ambiguïté de canonicalisation (ordre des clés,
        espaces, échappement Unicode) ne peut invalider ou, pire,
        valider à tort une licence ;
     2. rétrograder le préfixe de version invalide la signature,
        ce qui ferme la voie aux attaques de downgrade de format.
   ========================================================== */

import { b64uEncode, b64uDecode, utf8Encode, utf8Decode } from './base64.js';
import { SUPPORTED_FORMAT_VERSIONS } from './config.js';

export const TOKEN_PREFIX = 'AVR';

/** Erreur de parsing : porte un code exploitable par le moteur. */
export class LicenseFormatError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'LicenseFormatError';
    this.code = code;               // 'MALFORMED' | 'VERSION' | 'SCHEMA'
  }
}

/* ----------------------------------------------------------
   Schéma de la charge utile (version 1)
   Les clés sont courtes : une licence se transmet par WhatsApp,
   chaque octet compte.
   ----------------------------------------------------------
   v   : version du format          (entier)
   id  : identifiant licence        ("AVR-XXXXXXXX")
   typ : "public" | "private"
   prd : identifiant produit        ("averi")
   pln : identifiant de plan        ("plan_1000")
   iat : émission, epoch secondes UTC
   nbf : début de validité, epoch secondes UTC
   exp : fin de validité, epoch secondes UTC (0 = perpétuelle)
   dev : liaison appareil { m: "none"|"fp", v: "<empreinte>" }
   dlm : nombre d'appareils autorisés
   ftr : features accordées (tableau d'identifiants)
   prm : permissions (licences privées uniquement)
   iss : émetteur
   kid : identifiant de la clé de signature
   met : métadonnées libres (titulaire, note, référence paiement)
   ---------------------------------------------------------- */

const REQUIRED_KEYS = ['v', 'id', 'typ', 'prd', 'pln', 'iat', 'nbf', 'exp', 'dev', 'ftr', 'iss', 'kid'];
const LICENSE_TYPES = new Set(['public', 'private']);
const DEVICE_MODES = new Set(['none', 'fp']);

const isInt = (n) => typeof n === 'number' && Number.isInteger(n) && Number.isFinite(n);
const isStr = (s) => typeof s === 'string' && s.length > 0;

/**
 * Valide strictement la forme de la charge utile.
 * Tout écart est une erreur : un champ manquant, d'un mauvais type
 * ou hors bornes ne doit jamais être « interprété au mieux ».
 */
export function validatePayloadShape(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) {
    throw new LicenseFormatError('SCHEMA', 'charge utile absente');
  }
  for (const k of REQUIRED_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(p, k)) {
      throw new LicenseFormatError('SCHEMA', 'champ manquant : ' + k);
    }
  }
  if (!isInt(p.v) || p.v < 1) throw new LicenseFormatError('SCHEMA', 'version invalide');
  if (!isStr(p.id) || !/^AVR-[A-Z0-9]{6,24}$/.test(p.id)) throw new LicenseFormatError('SCHEMA', 'identifiant invalide');
  if (!LICENSE_TYPES.has(p.typ)) throw new LicenseFormatError('SCHEMA', 'type invalide');
  if (!isStr(p.prd)) throw new LicenseFormatError('SCHEMA', 'produit invalide');
  if (!isStr(p.pln)) throw new LicenseFormatError('SCHEMA', 'plan invalide');
  if (!isInt(p.iat) || p.iat < 0) throw new LicenseFormatError('SCHEMA', 'iat invalide');
  if (!isInt(p.nbf) || p.nbf < 0) throw new LicenseFormatError('SCHEMA', 'nbf invalide');
  if (!isInt(p.exp) || p.exp < 0) throw new LicenseFormatError('SCHEMA', 'exp invalide');
  if (p.exp !== 0 && p.exp <= p.nbf) throw new LicenseFormatError('SCHEMA', 'exp antérieur à nbf');
  if (!p.dev || typeof p.dev !== 'object' || !DEVICE_MODES.has(p.dev.m)) {
    throw new LicenseFormatError('SCHEMA', 'liaison appareil invalide');
  }
  if (p.dev.m === 'fp' && !isStr(p.dev.v)) throw new LicenseFormatError('SCHEMA', 'empreinte appareil absente');
  if (!Array.isArray(p.ftr) || p.ftr.some(f => !isStr(f))) throw new LicenseFormatError('SCHEMA', 'features invalides');
  if (p.prm !== undefined && (!Array.isArray(p.prm) || p.prm.some(x => !isStr(x)))) {
    throw new LicenseFormatError('SCHEMA', 'permissions invalides');
  }
  if (p.typ === 'public' && Array.isArray(p.prm) && p.prm.length > 0) {
    // Une licence publique ne porte jamais de permissions internes.
    throw new LicenseFormatError('SCHEMA', 'permissions interdites sur une licence publique');
  }
  if (p.dlm !== undefined && (!isInt(p.dlm) || p.dlm < 1)) throw new LicenseFormatError('SCHEMA', 'dlm invalide');
  if (!isStr(p.iss)) throw new LicenseFormatError('SCHEMA', 'émetteur invalide');
  if (!isStr(p.kid)) throw new LicenseFormatError('SCHEMA', 'kid invalide');
  if (p.met !== undefined && (typeof p.met !== 'object' || p.met === null || Array.isArray(p.met))) {
    throw new LicenseFormatError('SCHEMA', 'métadonnées invalides');
  }
  return p;
}

/** Normalise un jeton collé depuis WhatsApp (espaces, retours ligne, casse du préfixe). */
export function normalizeToken(token) {
  return String(token == null ? '' : token).replace(/\s+/g, '').trim();
}

/**
 * Découpe un jeton sans rien vérifier cryptographiquement.
 * @returns {{version:number, signingInput:Uint8Array, payloadBytes:Uint8Array,
 *            payload:object, signature:Uint8Array, token:string}}
 */
export function decodeToken(token) {
  const t = normalizeToken(token);
  if (!t) throw new LicenseFormatError('MALFORMED', 'jeton vide');

  const parts = t.split('.');
  if (parts.length !== 3) throw new LicenseFormatError('MALFORMED', 'structure du jeton invalide');

  const [head, payloadB64, sigB64] = parts;
  const m = /^AVR(\d+)$/.exec(head);
  if (!m) throw new LicenseFormatError('MALFORMED', 'entête inconnue');

  const version = Number(m[1]);
  if (!SUPPORTED_FORMAT_VERSIONS.includes(version)) {
    throw new LicenseFormatError('VERSION', 'version de format non supportée : ' + version);
  }

  let payloadBytes, signature;
  try {
    payloadBytes = b64uDecode(payloadB64);
    signature = b64uDecode(sigB64);
  } catch (_) {
    throw new LicenseFormatError('MALFORMED', 'encodage invalide');
  }
  if (signature.length !== 64) throw new LicenseFormatError('MALFORMED', 'signature de taille invalide');

  let payload;
  try {
    payload = JSON.parse(utf8Decode(payloadBytes));
  } catch (_) {
    throw new LicenseFormatError('MALFORMED', 'charge utile illisible');
  }

  validatePayloadShape(payload);

  if (payload.v !== version) {
    // L'entête et la charge utile doivent s'accorder, sinon le champ
    // signé et le champ lu peuvent diverger.
    throw new LicenseFormatError('SCHEMA', 'version incohérente entre entête et charge utile');
  }

  return {
    version,
    signingInput: utf8Encode(head + '.' + payloadB64),
    payloadBytes,
    payload,
    signature,
    token: t
  };
}

/**
 * Assemble un jeton à partir d'une charge utile et d'une signature.
 * Utilisé par le générateur ; le client ne dispose d'aucune signature
 * à fournir, il ne peut donc rien émettre.
 */
export function encodeToken(payload, signature) {
  validatePayloadShape(payload);
  const payloadB64 = b64uEncode(utf8Encode(JSON.stringify(payload)));
  const head = TOKEN_PREFIX + payload.v;
  if (!(signature instanceof Uint8Array) || signature.length !== 64) {
    throw new LicenseFormatError('MALFORMED', 'signature invalide');
  }
  return head + '.' + payloadB64 + '.' + b64uEncode(signature);
}

/** Octets à signer pour une charge utile donnée (utilisé par le générateur). */
export function signingInputFor(payload) {
  validatePayloadShape(payload);
  const payloadB64 = b64uEncode(utf8Encode(JSON.stringify(payload)));
  return {
    signingInput: utf8Encode(TOKEN_PREFIX + payload.v + '.' + payloadB64),
    payloadB64
  };
}

/** Présentation lisible : « AVR1.eyJ2Ijox… » -> groupes de 5 pour la saisie manuelle. */
export function prettyToken(token) {
  return normalizeToken(token);
}
