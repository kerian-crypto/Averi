/* ==========================================================
   AVERI LICENSING — base64url
   Sans dépendance : fonctionne sous Node comme dans le
   navigateur, y compris en file://.
   ========================================================== */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const LOOKUP = (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) t[ALPHABET.charCodeAt(i)] = i;
  // Tolérance : accepter aussi l'alphabet base64 standard en entrée.
  t['+'.charCodeAt(0)] = 62;
  t['/'.charCodeAt(0)] = 63;
  return t;
})();

/** Uint8Array -> chaîne base64url sans padding. */
export function b64uEncode(bytes) {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += ALPHABET[(n >>> 18) & 63] + ALPHABET[(n >>> 12) & 63] +
           ALPHABET[(n >>> 6) & 63] + ALPHABET[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += ALPHABET[(n >>> 18) & 63] + ALPHABET[(n >>> 12) & 63];
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += ALPHABET[(n >>> 18) & 63] + ALPHABET[(n >>> 12) & 63] + ALPHABET[(n >>> 6) & 63];
  }
  return out;
}

/**
 * Chaîne base64url -> Uint8Array.
 * Lève une erreur sur tout caractère invalide : un décodage permissif
 * ouvrirait la porte à des variantes d'un même jeton.
 */
export function b64uDecode(str) {
  const s = String(str).replace(/=+$/, '');
  const n = s.length;
  if (n % 4 === 1) throw new Error('base64url: longueur invalide');
  const outLen = Math.floor((n * 3) / 4);
  const out = new Uint8Array(outLen);
  let acc = 0, bits = 0, o = 0;
  for (let i = 0; i < n; i++) {
    const c = s.charCodeAt(i);
    const v = c < 128 ? LOOKUP[c] : -1;
    if (v < 0) throw new Error('base64url: caractère invalide');
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >>> bits) & 0xff;
    }
  }
  return out;
}

const TE = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const TD = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;

/** Chaîne UTF-8 -> Uint8Array. */
export function utf8Encode(str) {
  if (TE) return TE.encode(str);
  const out = [];
  for (const ch of String(str)) {
    let cp = ch.codePointAt(0);
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return new Uint8Array(out);
}

/** Uint8Array -> chaîne UTF-8. */
export function utf8Decode(bytes) {
  if (TD) return TD.decode(bytes);
  let s = '';
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i++];
    let cp;
    if (b < 0x80) cp = b;
    else if (b < 0xe0) cp = ((b & 31) << 6) | (bytes[i++] & 63);
    else if (b < 0xf0) cp = ((b & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
    else cp = ((b & 7) << 18) | ((bytes[i++] & 63) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
    s += String.fromCodePoint(cp);
  }
  return s;
}

/** Uint8Array -> hexadécimal minuscule. */
export function toHex(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}

/** Concaténation de plusieurs Uint8Array. */
export function concatBytes(...arrays) {
  let total = 0;
  for (const a of arrays) total += a.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const a of arrays) { out.set(a, o); o += a.length; }
  return out;
}

/**
 * Comparaison à temps constant. Utilisée pour les empreintes et les
 * signatures : une comparaison naïve fuit de l'information par timing.
 */
export function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
