import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ActivationService } from '../src/licensing/activation.js';
import { LicenseEngine } from '../src/licensing/license-engine.js';
import { LocalLicenseValidator } from '../src/licensing/validators.js';
import { STATUS } from '../src/licensing/status.js';
import { Journal } from '../src/licensing/journal.js';
import { fingerprintOf } from '../src/licensing/device.js';
import { testKeyPair, issueTestLicense, memoryStorage } from './helpers.mjs';

const KP = testKeyPair();
const INSTALL = 'install-activation';
const IDENTITY = { installId: INSTALL, fingerprint: fingerprintOf(INSTALL) };

function make(identity = IDENTITY) {
  const storage = memoryStorage(identity.installId);
  const engine = new LicenseEngine({ trustedKeys: KP.trustedKeys });
  const service = new ActivationService({
    storage,
    validator: new LocalLicenseValidator(engine),
    identity,
    journal: new Journal(storage)
  });
  return { storage, service };
}

test('activation d’une licence valide : jeton et activation persistés', () => {
  const { service, storage } = make();
  const { token, payload } = issueTestLicense(KP);
  const r = service.activate(token);
  assert.equal(r.ok, true);
  assert.equal(r.activation.licenseId, payload.id);
  assert.equal(r.activation.installId, INSTALL);
  assert.equal(r.activation.count, 1);
  assert.equal(storage.loadLicense().data.token, token);
  assert.equal(service.storedToken().token, token);
});

test('activation d’une licence altérée : rien n’est enregistré', () => {
  const { service, storage } = make();
  const { token } = issueTestLicense(KP);
  const parts = token.split('.');
  const r = service.activate(parts[0] + '.' + parts[1] + '.' + 'A'.repeat(86));
  assert.equal(r.ok, false);
  assert.equal(r.status, STATUS.LICENSE_TAMPERED);
  assert.equal(storage.loadLicense(), null);
});

test('activation d’une licence expirée refusée', () => {
  const { service } = make();
  const past = Math.floor(Date.now() / 1000) - 400 * 86400;
  const { token } = issueTestLicense(KP, { issuedAt: past, notBefore: past, expiresAt: past + 86400 });
  assert.equal(service.activate(token).status, STATUS.LICENSE_EXPIRED);
});

test('rejouer la même activation ne l’incrémente pas', () => {
  const { service } = make();
  const { token } = issueTestLicense(KP);
  assert.equal(service.activate(token).activation.count, 1);
  assert.equal(service.activate(token).activation.count, 1);
  assert.equal(service.activate(token).activation.count, 1);
});

test('activer une licence différente réinitialise le compteur', () => {
  const { service } = make();
  service.activate(issueTestLicense(KP).token);
  const second = issueTestLicense(KP, { plan: 'plan_2000' });
  const r = service.activate(second.token);
  assert.equal(r.activation.licenseId, second.payload.id);
  assert.equal(r.activation.count, 1);
});

test('une activation venue d’une autre installation est détectée', () => {
  const { service, storage } = make();
  service.activate(issueTestLicense(KP).token);

  // Le profil est recopié sur une autre machine : l'identité change.
  const other = { installId: 'autre-install', fingerprint: fingerprintOf('autre-install') };
  const engine = new LicenseEngine({ trustedKeys: KP.trustedKeys });
  const moved = new ActivationService({
    storage, validator: new LocalLicenseValidator(engine), identity: other
  });
  const check = moved.checkActivationBinding();
  assert.equal(check.ok, false);
  assert.match(check.reason, /autre installation/);
});

test('une activation descellée est ignorée', () => {
  const { service, storage } = make();
  service.activate(issueTestLicense(KP).token);
  for (const b of storage.backends) {
    b.set('averi.lic.v1.activation', JSON.stringify({
      b: JSON.stringify({ v: 1, k: 'activation', t: Date.now(), d: { licenseId: 'AVR-FAUX', installId: INSTALL } }),
      h: 'ff'.repeat(16)
    }));
  }
  assert.equal(service.currentActivation(), null);
});

test('la désactivation efface licence et activation', () => {
  const { service } = make();
  service.activate(issueTestLicense(KP).token);
  service.deactivate();
  assert.equal(service.storedToken(), null);
  assert.equal(service.currentActivation(), null);
});

test('licence liée à cet appareil : activation acceptée', () => {
  const { service } = make();
  const { token } = issueTestLicense(KP, { deviceFingerprint: IDENTITY.fingerprint });
  assert.equal(service.activate(token).ok, true);
});

test('licence liée à un autre appareil : activation refusée', () => {
  const { service } = make();
  const { token } = issueTestLicense(KP, { deviceFingerprint: fingerprintOf('quelqu-un-d-autre') });
  const r = service.activate(token);
  assert.equal(r.ok, false);
  assert.equal(r.status, STATUS.LICENSE_DEVICE_MISMATCH);
});

test('l’empreinte du jeton diffère d’un jeton à l’autre', () => {
  const a = issueTestLicense(KP).token;
  const b = issueTestLicense(KP).token;
  assert.notEqual(ActivationService.tokenDigest(a), ActivationService.tokenDigest(b));
  assert.equal(ActivationService.tokenDigest(a), ActivationService.tokenDigest(a));
});
