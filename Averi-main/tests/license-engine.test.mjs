import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LicenseEngine } from '../src/licensing/license-engine.js';
import { STATUS } from '../src/licensing/status.js';
import { RevocationRegistry } from '../src/licensing/revocation.js';
import { decodeToken } from '../src/licensing/license-format.js';
import { b64uEncode, utf8Encode } from '../src/licensing/base64.js';
import { PLANS, PRIVATE_PLAN_ID } from '../src/licensing/config.js';
import { testKeyPair, issueTestLicense, signWith } from './helpers.mjs';

const KP = testKeyPair();
const engineWith = (opts = {}) => new LicenseEngine(Object.assign({ trustedKeys: KP.trustedKeys }, opts));
const IDENTITY = { fingerprint: 'a'.repeat(32) };
const DAY = 86400;

/* ---- MATRICE DE TESTS (docs/licensing/testing.md) ---- */

test('licence publique valide -> LICENSE_ACTIVE', () => {
  const { token, payload } = issueTestLicense(KP, { plan: 'plan_1000', durationMs: 30 * DAY * 1000 });
  const r = engineWith().getLicenseStatus(token, { identity: IDENTITY });
  assert.equal(r.status, STATUS.LICENSE_ACTIVE);
  assert.equal(r.valid, true);
  assert.equal(r.license.planId, 'plan_1000');
  assert.deepEqual(r.features.sort(), PLANS.plan_1000.features.slice().sort());
  assert.deepEqual(r.permissions, []);
  assert.equal(r.license.id, payload.id);
});

test('licence expirée -> LICENSE_EXPIRED', () => {
  const past = Math.floor(Date.now() / 1000) - 400 * DAY;
  const { token } = issueTestLicense(KP, { issuedAt: past, notBefore: past, expiresAt: past + DAY });
  assert.equal(engineWith().getLicenseStatus(token, {}).status, STATUS.LICENSE_EXPIRED);
});

test('licence pas encore valide -> LICENSE_NOT_YET_VALID', () => {
  const future = Math.floor(Date.now() / 1000) + 90 * DAY;
  const { token } = issueTestLicense(KP, { notBefore: future, expiresAt: future + 30 * DAY });
  assert.equal(engineWith().getLicenseStatus(token, {}).status, STATUS.LICENSE_NOT_YET_VALID);
});

test('signature modifiée -> LICENSE_TAMPERED', () => {
  const { token } = issueTestLicense(KP);
  const parts = token.split('.');
  const sig = Buffer.from(parts[2].replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  sig[10] ^= 0x01;
  const bad = parts[0] + '.' + parts[1] + '.' + b64uEncode(new Uint8Array(sig));
  assert.equal(engineWith().getLicenseStatus(bad, {}).status, STATUS.LICENSE_TAMPERED);
});

test('charge utile modifiée sans re-signature -> LICENSE_TAMPERED', () => {
  const { token } = issueTestLicense(KP, { plan: 'plan_1000' });
  const parsed = decodeToken(token);
  const forged = Object.assign({}, parsed.payload, { pln: 'plan_2000' });
  const parts = token.split('.');
  const bad = parts[0] + '.' + b64uEncode(utf8Encode(JSON.stringify(forged))) + '.' + parts[2];
  assert.equal(engineWith().getLicenseStatus(bad, {}).status, STATUS.LICENSE_TAMPERED);
});

test('expiration repoussée sans re-signature -> LICENSE_TAMPERED', () => {
  const { token } = issueTestLicense(KP);
  const parsed = decodeToken(token);
  const forged = Object.assign({}, parsed.payload, { exp: parsed.payload.exp + 10 * 365 * DAY });
  const parts = token.split('.');
  const bad = parts[0] + '.' + b64uEncode(utf8Encode(JSON.stringify(forged))) + '.' + parts[2];
  assert.equal(engineWith().getLicenseStatus(bad, {}).status, STATUS.LICENSE_TAMPERED);
});

test('type de licence élevé en « private » sans re-signature -> LICENSE_TAMPERED', () => {
  const { token } = issueTestLicense(KP);
  const parsed = decodeToken(token);
  const forged = Object.assign({}, parsed.payload, { typ: 'private', prm: ['admin'] });
  const parts = token.split('.');
  const bad = parts[0] + '.' + b64uEncode(utf8Encode(JSON.stringify(forged))) + '.' + parts[2];
  assert.equal(engineWith().getLicenseStatus(bad, {}).status, STATUS.LICENSE_TAMPERED);
});

test('licence signée par une autre clé -> LICENSE_TAMPERED', () => {
  const other = testKeyPair('test');
  const { token } = issueTestLicense(other);
  assert.equal(engineWith().getLicenseStatus(token, {}).status, STATUS.LICENSE_TAMPERED);
});

test('clé de signature inconnue -> LICENSE_TAMPERED avec le kid en détail', () => {
  const kp = testKeyPair('k99');
  const { token } = issueTestLicense(kp, { keyId: 'k99' });
  const r = engineWith().getLicenseStatus(token, {});
  assert.equal(r.status, STATUS.LICENSE_TAMPERED);
  assert.match(r.detail, /k99/);
});

test('mauvais produit -> LICENSE_PRODUCT_MISMATCH', () => {
  const { payload } = issueTestLicense(KP);
  const token = signWith(KP, Object.assign({}, payload, { prd: 'autre-produit' }));
  assert.equal(engineWith().getLicenseStatus(token, {}).status, STATUS.LICENSE_PRODUCT_MISMATCH);
});

test('plan inconnu -> LICENSE_PLAN_UNKNOWN', () => {
  const { payload } = issueTestLicense(KP);
  const token = signWith(KP, Object.assign({}, payload, { pln: 'plan_9999' }));
  assert.equal(engineWith().getLicenseStatus(token, {}).status, STATUS.LICENSE_PLAN_UNKNOWN);
});

test('licence publique portant le plan interne -> LICENSE_PLAN_UNKNOWN', () => {
  const { payload } = issueTestLicense(KP);
  const token = signWith(KP, Object.assign({}, payload, { pln: PRIVATE_PLAN_ID }));
  assert.equal(engineWith().getLicenseStatus(token, {}).status, STATUS.LICENSE_PLAN_UNKNOWN);
});

test('émetteur inattendu -> LICENSE_INVALID', () => {
  const { payload } = issueTestLicense(KP);
  const token = signWith(KP, Object.assign({}, payload, { iss: 'moi-meme' }));
  assert.equal(engineWith().getLicenseStatus(token, {}).status, STATUS.LICENSE_INVALID);
});

test('mauvais appareil -> LICENSE_DEVICE_MISMATCH', () => {
  const { token } = issueTestLicense(KP, { deviceFingerprint: 'b'.repeat(32) });
  assert.equal(engineWith().getLicenseStatus(token, { identity: IDENTITY }).status, STATUS.LICENSE_DEVICE_MISMATCH);
});

test('bon appareil -> LICENSE_ACTIVE', () => {
  const { token } = issueTestLicense(KP, { deviceFingerprint: IDENTITY.fingerprint });
  assert.equal(engineWith().getLicenseStatus(token, { identity: IDENTITY }).status, STATUS.LICENSE_ACTIVE);
});

test('licence liée à un appareil, identité absente -> LICENSE_DEVICE_MISMATCH', () => {
  const { token } = issueTestLicense(KP, { deviceFingerprint: IDENTITY.fingerprint });
  assert.equal(engineWith().getLicenseStatus(token, {}).status, STATUS.LICENSE_DEVICE_MISMATCH);
});

test('licence non liée -> acceptée sur toute installation', () => {
  const { token } = issueTestLicense(KP);
  assert.equal(engineWith().getLicenseStatus(token, { identity: { fingerprint: 'z'.repeat(32) } }).status,
    STATUS.LICENSE_ACTIVE);
});

test('licence privée valide -> active avec ses permissions', () => {
  const { token } = issueTestLicense(KP, {
    type: 'private', plan: PRIVATE_PLAN_ID, permissions: ['admin', 'diagnostics', 'testing']
  });
  const r = engineWith().getLicenseStatus(token, {});
  assert.equal(r.status, STATUS.LICENSE_ACTIVE);
  assert.equal(r.license.type, 'private');
  assert.deepEqual(r.permissions.sort(), ['admin', 'diagnostics', 'testing']);
});

test('permissions inconnues -> écartées silencieusement', () => {
  const { payload } = issueTestLicense(KP, { type: 'private', plan: PRIVATE_PLAN_ID, permissions: ['admin'] });
  const token = signWith(KP, Object.assign({}, payload, { prm: ['admin', 'root', 'sudo'] }));
  const r = engineWith().getLicenseStatus(token, {});
  assert.equal(r.status, STATUS.LICENSE_ACTIVE);
  assert.deepEqual(r.permissions, ['admin']);
});

test('features hors du plan -> écartées', () => {
  const { payload } = issueTestLicense(KP, { plan: 'plan_1000' });
  // plan_1000 n'accorde ni game.c4 ni game.memory
  const token = signWith(KP, Object.assign({}, payload, {
    ftr: payload.ftr.concat(['game.c4', 'game.memory', 'feature.inventée'])
  }));
  const r = engineWith().getLicenseStatus(token, {});
  assert.equal(r.status, STATUS.LICENSE_ACTIVE);
  assert.equal(r.features.includes('game.c4'), false);
  assert.equal(r.features.includes('game.memory'), false);
  assert.equal(r.features.includes('feature.inventée'), false);
});

test('licence révoquée -> LICENSE_REVOKED', () => {
  const { token, payload } = issueTestLicense(KP);
  const registry = new RevocationRegistry({ embedded: { ids: [payload.id], reasons: { [payload.id]: 'remboursée' } } });
  const r = engineWith({ revocations: registry }).getLicenseStatus(token, {});
  assert.equal(r.status, STATUS.LICENSE_REVOKED);
  assert.equal(r.detail, 'remboursée');
});

test('jeton absent -> LICENSE_UNKNOWN', () => {
  assert.equal(engineWith().getLicenseStatus(null, {}).status, STATUS.LICENSE_UNKNOWN);
  assert.equal(engineWith().getLicenseStatus('', {}).status, STATUS.LICENSE_UNKNOWN);
});

test('jeton illisible -> LICENSE_INVALID', () => {
  for (const bad of ['n’importe quoi', 'AVR1.abc', 'AVR1.abc.def.ghi', 'XXX1.aaa.bbb', 'AVR1..']) {
    const r = engineWith().getLicenseStatus(bad, {});
    assert.equal(r.status, STATUS.LICENSE_INVALID, bad);
  }
});

test('version de format non supportée -> LICENSE_VERSION_UNSUPPORTED', () => {
  const { token } = issueTestLicense(KP);
  const parts = token.split('.');
  assert.equal(engineWith().getLicenseStatus('AVR9.' + parts[1] + '.' + parts[2], {}).status,
    STATUS.LICENSE_VERSION_UNSUPPORTED);
});

test('l’entête de version fait partie des octets signés', () => {
  const { token } = issueTestLicense(KP);
  const parts = token.split('.');
  // AVR01 décode en version 1 mais ne produit pas les mêmes octets signés
  const r = engineWith().getLicenseStatus('AVR01.' + parts[1] + '.' + parts[2], {});
  assert.equal(r.status, STATUS.LICENSE_TAMPERED);
});

test('tolérance d’horloge : quelques heures de décalage n’invalident pas', () => {
  const now = Math.floor(Date.now() / 1000);
  const { token } = issueTestLicense(KP, { notBefore: now + 3600, expiresAt: now + 30 * DAY });
  assert.equal(engineWith().getLicenseStatus(token, {}).status, STATUS.LICENSE_ACTIVE);
});

test('l’ordre des contrôles ne fuit pas : une contrefaçon expirée reste TAMPERED', () => {
  const past = Math.floor(Date.now() / 1000) - 400 * DAY;
  const { token } = issueTestLicense(KP, { issuedAt: past, notBefore: past, expiresAt: past + DAY });
  const parts = token.split('.');
  const sig = Buffer.from(parts[2].replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  sig[3] ^= 0x01;
  const bad = parts[0] + '.' + parts[1] + '.' + b64uEncode(new Uint8Array(sig));
  assert.equal(engineWith().getLicenseStatus(bad, {}).status, STATUS.LICENSE_TAMPERED);
});
