/* ==========================================================
   AVERI LICENSING — Ed25519, VÉRIFICATION UNIQUEMENT
   ----------------------------------------------------------
   RFC 8032, courbe edwards25519, coordonnées étendues.

   Ce module n'expose délibérément AUCUNE primitive de
   signature ni de dérivation de clé. Le client Averi doit être
   structurellement incapable de fabriquer une licence valide,
   même si un attaquant en réutilise le code (voir règle 16 de
   la spécification et docs/licensing/security.md).

   Implémentation pure BigInt, synchrone, sans dépendance :
   fonctionne en file://, hors contexte sécurisé et sur les
   navigateurs dépourvus de WebCrypto Ed25519.
   ========================================================== */

import { sha512 } from './sha512.js';

const P = (1n << 255n) - 19n;
const L = 2n ** 252n + 27742317777372353535851937790883648493n;
const D = 37095705934669439343138083508754565189542113879843219016388785533085940283555n;
const SQRT_M1 = 19681161376707505956807079304988542015446066515923890162744021073123829784752n;

const mod = (a) => { const r = a % P; return r >= 0n ? r : r + P; };

function powMod(base, exp) {
  let result = 1n, b = mod(base), e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % P;
    b = (b * b) % P;
    e >>= 1n;
  }
  return result;
}

const inv = (a) => powMod(a, P - 2n);

/* ---- Points en coordonnées étendues (X:Y:Z:T), x=X/Z, y=Y/Z ---- */

const ZERO = { X: 0n, Y: 1n, Z: 1n, T: 0n };

/**
 * Addition unifiée pour courbe d'Edwards tordue a = -1.
 * La formule est complète : elle vaut aussi pour le doublement,
 * ce qui évite une branche exploitable et simplifie l'échelle.
 */
function add(p1, p2) {
  const A = mod((p1.Y - p1.X) * (p2.Y - p2.X));
  const B = mod((p1.Y + p1.X) * (p2.Y + p2.X));
  const C = mod(p1.T * 2n * D * p2.T);
  const Dd = mod(p1.Z * 2n * p2.Z);
  const E = B - A, F = Dd - C, G = Dd + C, H = B + A;
  return { X: mod(E * F), Y: mod(G * H), T: mod(E * H), Z: mod(F * G) };
}

function scalarMult(point, scalar) {
  let q = ZERO;
  let p = point;
  let k = scalar;
  while (k > 0n) {
    if (k & 1n) q = add(q, p);
    p = add(p, p);
    k >>= 1n;
  }
  return q;
}

function equals(p1, p2) {
  return mod(p1.X * p2.Z) === mod(p2.X * p1.Z) &&
         mod(p1.Y * p2.Z) === mod(p2.Y * p1.Z);
}

/** Point de base B de edwards25519. */
const BASE = (() => {
  const y = mod(4n * inv(5n));
  const x = recoverX(y, 0n);
  return { X: x, Y: y, Z: 1n, T: mod(x * y) };
})();

/** Retrouve x à partir de y et du bit de signe, ou null si le point n'est pas sur la courbe. */
function recoverX(y, sign) {
  if (y >= P) return null;
  const y2 = mod(y * y);
  const u = mod(y2 - 1n);
  const v = mod(D * y2 + 1n);
  const v3 = mod(v * v * v);
  const v7 = mod(v3 * v3 * v);
  let x = mod(u * v3 * powMod(mod(u * v7), (P - 5n) / 8n));

  const vx2 = mod(v * x * x);
  if (vx2 !== mod(u)) {
    if (vx2 === mod(-u)) x = mod(x * SQRT_M1);
    else return null;
  }
  if (x === 0n && sign === 1n) return null;
  if ((x & 1n) !== sign) x = mod(-x);
  return x;
}

function bytesToNumberLE(bytes) {
  let n = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(bytes[i]);
  return n;
}

/** Décompresse un point encodé sur 32 octets, ou null si l'encodage est invalide. */
function decodePoint(bytes) {
  if (bytes.length !== 32) return null;
  const copy = Uint8Array.from(bytes);
  const sign = BigInt((copy[31] >> 7) & 1);
  copy[31] &= 0x7f;
  const y = bytesToNumberLE(copy);
  if (y >= P) return null;            // encodage non canonique : rejeté
  const x = recoverX(y, sign);
  if (x === null) return null;
  return { X: x, Y: y, Z: 1n, T: mod(x * y) };
}

/**
 * Vérifie une signature Ed25519.
 *
 * @param {Uint8Array} signature 64 octets
 * @param {Uint8Array} message
 * @param {Uint8Array} publicKey 32 octets
 * @returns {boolean} true si et seulement si la signature est valide
 */
export function verify(signature, message, publicKey) {
  try {
    if (!(signature instanceof Uint8Array) || signature.length !== 64) return false;
    if (!(publicKey instanceof Uint8Array) || publicKey.length !== 32) return false;
    if (!(message instanceof Uint8Array)) return false;

    const rBytes = signature.subarray(0, 32);
    const sBytes = signature.subarray(32, 64);

    const s = bytesToNumberLE(sBytes);
    // s doit être réduit : sinon la signature est malléable.
    if (s >= L) return false;

    const A = decodePoint(publicKey);
    if (!A) return false;
    const R = decodePoint(rBytes);
    if (!R) return false;

    const hInput = new Uint8Array(64 + message.length);
    hInput.set(rBytes, 0);
    hInput.set(publicKey, 32);
    hInput.set(message, 64);
    const k = bytesToNumberLE(sha512(hInput)) % L;

    const left = scalarMult(BASE, s);          // [s]B
    const right = add(R, scalarMult(A, k));    // R + [k]A
    return equals(left, right);
  } catch (_) {
    return false;
  }
}

/** Exposé pour les tests : indique que ce module ne sait pas signer. */
export const CAN_SIGN = false;
