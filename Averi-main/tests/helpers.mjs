/* ==========================================================
   AVERI LICENSING — Utilitaires de test
   ----------------------------------------------------------
   Les tests signent avec une paire éphémère générée en mémoire :
   ils ne touchent jamais à la clé de production.
   ========================================================== */

import { generateKeyPairSync, sign as edSign, createPublicKey } from 'node:crypto';
import { signingInputFor, encodeToken } from '../src/licensing/license-format.js';
import { buildPayload } from '../tools/license-generator/builder.mjs';
import { SecureLicenseStorage, MemoryBackend } from '../src/licensing/storage.js';
import { ClockGuard } from '../src/licensing/clock.js';

export function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Paire de clés de test, avec la clé publique au format attendu par le moteur. */
export function testKeyPair(kid = 'test') {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const der = publicKey.export({ format: 'der', type: 'spki' });
  return {
    kid,
    privateKey,
    publicKeyB64u: b64url(der.subarray(der.length - 32)),
    trustedKeys: { [kid]: b64url(der.subarray(der.length - 32)) }
  };
}

/** Signe une charge utile arbitraire, y compris volontairement incohérente. */
export function signWith(keyPair, payload) {
  const { signingInput } = signingInputFor(payload);
  const sig = edSign(null, Buffer.from(signingInput), keyPair.privateKey);
  return encodeToken(payload, new Uint8Array(sig));
}

/** Émet une licence de test complète. */
export function issueTestLicense(keyPair, spec = {}) {
  const payload = buildPayload(Object.assign({
    type: 'public', plan: 'plan_1000', keyId: keyPair.kid
  }, spec));
  return { token: signWith(keyPair, payload), payload };
}

/** Stockage en mémoire, isolé, sans miroir asynchrone. */
export function memoryStorage(installId = 'install-de-test') {
  const s = new SecureLicenseStorage({
    backends: [new MemoryBackend('a'), new MemoryBackend('b')],
    mirror: null
  });
  s.setSealSecret(installId);
  return s;
}

/**
 * Simule un rechargement de page : un stockage NEUF, sans secret de sceau
 * préétabli, posé sur les mêmes dépôts. C'est la seule façon de vérifier
 * que l'identité d'installation se relit correctement au démarrage.
 */
export function reopenStorage(previous) {
  return new SecureLicenseStorage({ backends: previous.backends, mirror: null });
}

/** Dépôts partagés, sans secret de sceau : état d'un navigateur au premier lancement. */
export function freshStorage() {
  return new SecureLicenseStorage({
    backends: [new MemoryBackend('a'), new MemoryBackend('b')],
    mirror: null
  });
}

/** Horloge pilotable : `advance(ms)` avance simultanément mur et monotone. */
export function fakeClock(startWall = Date.parse('2026-09-04T12:00:00Z')) {
  let wall = startWall;
  let mono = 0;
  const guard = new ClockGuard({
    wallNow: () => wall,
    monoNow: () => mono
  });
  return {
    guard,
    /** Le temps passe normalement. */
    advance(ms) { wall += ms; mono += ms; },
    /** L'utilisateur recule son horloge : le monotone, lui, ne bouge pas. */
    setWall(ms) { wall = ms; },
    /** Nouvelle session : le compteur monotone repart de zéro. */
    restartSession() { mono = 0; guard._sessionStartMono = 0; },
    get wall() { return wall; },
    get mono() { return mono; }
  };
}

export const HOUR = 60 * 60 * 1000;
export const MINUTE = 60 * 1000;
