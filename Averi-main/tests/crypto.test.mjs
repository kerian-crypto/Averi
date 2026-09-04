import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac, generateKeyPairSync, sign as edSign, randomBytes } from 'node:crypto';

import { sha512, hmacSha512 } from '../src/licensing/sha512.js';
import { verify, CAN_SIGN } from '../src/licensing/ed25519.js';
import { b64uEncode, b64uDecode, utf8Encode, utf8Decode, toHex, bytesEqual } from '../src/licensing/base64.js';
import { b64url } from './helpers.mjs';

test('SHA-512 concorde avec l’implémentation de référence', () => {
  for (const v of ['', 'abc', 'Averi — licence', 'x'.repeat(255), 'y'.repeat(1000)]) {
    assert.equal(toHex(sha512(utf8Encode(v))), createHash('sha512').update(v).digest('hex'), v.slice(0, 12));
  }
});

test('SHA-512 gère les frontières de bloc (111 à 129 octets)', () => {
  for (let n = 111; n <= 129; n++) {
    const buf = randomBytes(n);
    assert.equal(toHex(sha512(new Uint8Array(buf))), createHash('sha512').update(buf).digest('hex'), 'n=' + n);
  }
});

test('HMAC-SHA-512 concorde avec l’implémentation de référence', () => {
  const key = utf8Encode('clé-de-scellement');
  const msg = utf8Encode('état de la démonstration');
  assert.equal(toHex(hmacSha512(key, msg)),
    createHmac('sha512', 'clé-de-scellement').update('état de la démonstration').digest('hex'));
});

test('base64url fait un aller-retour exact sur des octets aléatoires', () => {
  for (let n = 0; n < 40; n++) {
    const b = new Uint8Array(randomBytes(n));
    assert.deepEqual(Array.from(b64uDecode(b64uEncode(b))), Array.from(b));
  }
});

test('base64url refuse les caractères invalides', () => {
  assert.throws(() => b64uDecode('abc!def'));
  assert.throws(() => b64uDecode('a'));
});

test('UTF-8 fait un aller-retour sur les accents et emoji', () => {
  const s = 'Démonstration — 1 heure 💜 œuf naïve';
  assert.equal(utf8Decode(utf8Encode(s)), s);
});

test('Ed25519 accepte les signatures valides et rejette tout le reste', () => {
  for (let i = 0; i < 10; i++) {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const der = publicKey.export({ format: 'der', type: 'spki' });
    const pub = new Uint8Array(der.subarray(der.length - 32));
    const msg = new Uint8Array(randomBytes(64 + i * 13));
    const sig = new Uint8Array(edSign(null, Buffer.from(msg), privateKey));

    assert.equal(verify(sig, msg, pub), true, 'signature valide');

    const badSig = Uint8Array.from(sig); badSig[i * 6 % 64] ^= 0x01;
    assert.equal(verify(badSig, msg, pub), false, 'signature altérée');

    const badMsg = Uint8Array.from(msg); badMsg[0] ^= 0x01;
    assert.equal(verify(sig, badMsg, pub), false, 'message altéré');

    const { publicKey: other } = generateKeyPairSync('ed25519');
    const otherDer = other.export({ format: 'der', type: 'spki' });
    assert.equal(verify(sig, msg, new Uint8Array(otherDer.subarray(otherDer.length - 32))), false, 'autre clé');
  }
});

test('Ed25519 rejette les entrées malformées sans lever d’exception', () => {
  const { publicKey } = generateKeyPairSync('ed25519');
  const der = publicKey.export({ format: 'der', type: 'spki' });
  const pub = new Uint8Array(der.subarray(der.length - 32));
  assert.equal(verify(new Uint8Array(63), new Uint8Array(4), pub), false);
  assert.equal(verify(new Uint8Array(64), new Uint8Array(4), new Uint8Array(31)), false);
  assert.equal(verify(null, new Uint8Array(4), pub), false);
  assert.equal(verify(new Uint8Array(64), 'pas des octets', pub), false);
});

test('Ed25519 rejette un scalaire s non réduit (malléabilité)', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const der = publicKey.export({ format: 'der', type: 'spki' });
  const pub = new Uint8Array(der.subarray(der.length - 32));
  const msg = new Uint8Array(utf8Encode('message'));
  const sig = new Uint8Array(edSign(null, Buffer.from(msg), privateKey));
  // s + L doit être refusé
  const L = 2n ** 252n + 27742317777372353535851937790883648493n;
  let s = 0n;
  for (let i = 63; i >= 32; i--) s = (s << 8n) | BigInt(sig[i]);
  let sPlusL = s + L;
  const forged = Uint8Array.from(sig);
  for (let i = 32; i < 64; i++) { forged[i] = Number(sPlusL & 0xffn); sPlusL >>= 8n; }
  assert.equal(verify(forged, msg, pub), false);
});

test('le module Ed25519 embarqué ne sait pas signer', () => {
  assert.equal(CAN_SIGN, false);
});

test('la comparaison d’octets est exacte', () => {
  assert.equal(bytesEqual(utf8Encode('abc'), utf8Encode('abc')), true);
  assert.equal(bytesEqual(utf8Encode('abc'), utf8Encode('abd')), false);
  assert.equal(bytesEqual(utf8Encode('abc'), utf8Encode('ab')), false);
});
