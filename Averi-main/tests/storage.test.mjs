import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SecureLicenseStorage, MemoryBackend } from '../src/licensing/storage.js';
import { buildIdentity, fingerprintOf, formatDeviceCode, parseDeviceCode } from '../src/licensing/device.js';
import { Journal } from '../src/licensing/journal.js';

function make(installId = 'i1') {
  const a = new MemoryBackend('a'), b = new MemoryBackend('b');
  const s = new SecureLicenseStorage({ backends: [a, b], mirror: null });
  s.setSealSecret(installId);
  return { s, a, b };
}

test('un enregistrement écrit se relit scellé dans tous les dépôts', () => {
  const { s, a, b } = make();
  s.saveLicense('AVR1.x.y', { licenseId: 'AVR-1' });
  const r = s.loadLicense();
  assert.equal(r.data.token, 'AVR1.x.y');
  assert.equal(r.sealed, true);
  assert.deepEqual(r.foundIn.sort(), ['a', 'b']);
  assert.ok(a.get('averi.lic.v1.license'));
  assert.ok(b.get('averi.lic.v1.license'));
});

test('la suppression dans un dépôt est réparée depuis l’autre', () => {
  const { s, a } = make();
  s.saveDemoState({ startedAtWall: 1 });
  a.remove('averi.lic.v1.demo');
  const r = s.loadDemoState();
  assert.equal(r.data.startedAtWall, 1);
  assert.deepEqual(r.missingIn, ['a']);
  assert.ok(a.get('averi.lic.v1.demo'), 'réinstallé');
  assert.ok(s.integrityEvents.some(e => e.kind === 'record_missing'));
});

test('la suppression dans tous les dépôts rend null', () => {
  const { s, a, b } = make();
  s.saveDemoState({ startedAtWall: 1 });
  a.remove('averi.lic.v1.demo');
  b.remove('averi.lic.v1.demo');
  assert.equal(s.loadDemoState(), null);
});

test('un enregistrement édité à la main est signalé descellé', () => {
  const { s, a, b } = make();
  s.saveDemoState({ startedAtWall: 1000 });
  const forged = JSON.stringify({
    b: JSON.stringify({ v: 1, k: 'demo', t: Date.now(), d: { startedAtWall: 0 } }),
    h: 'ff'.repeat(16)
  });
  a.set('averi.lic.v1.demo', forged);
  b.set('averi.lic.v1.demo', forged);
  const r = s.loadDemoState();
  assert.equal(r.sealed, false);
  assert.ok(s.integrityEvents.some(e => e.kind === 'seal_mismatch'));
});

test('un enregistrement correctement scellé l’emporte sur un enregistrement falsifié', () => {
  const { s, a } = make();
  s.saveDemoState({ startedAtWall: 1000 });
  a.set('averi.lic.v1.demo', JSON.stringify({
    b: JSON.stringify({ v: 1, k: 'demo', t: Date.now() + 10000, d: { startedAtWall: 0 } }),
    h: 'ff'.repeat(16)
  }));
  const r = s.loadDemoState();
  assert.equal(r.sealed, true);
  assert.equal(r.data.startedAtWall, 1000);
});

test('changer d’identifiant d’installation invalide les anciens sceaux', () => {
  const { s } = make('i1');
  s.saveDemoState({ startedAtWall: 1000 });
  s.setSealSecret('i2');
  assert.equal(s.loadDemoState().sealed, false);
});

test('une clé d’un autre enregistrement ne peut pas être détournée', () => {
  const { s, a, b } = make();
  s.saveDemoState({ startedAtWall: 1000 });
  const demoRaw = a.get('averi.lic.v1.demo');
  a.set('averi.lic.v1.activation', demoRaw);
  b.set('averi.lic.v1.activation', demoRaw);
  assert.equal(s.loadActivation(), null, 'la clé fait partie du sceau');
});

test('du JSON illisible ne fait pas planter la lecture', () => {
  const { s, a, b } = make();
  a.set('averi.lic.v1.demo', 'pas du json');
  b.set('averi.lic.v1.demo', '{"b":');
  assert.equal(s.loadDemoState(), null);
  assert.ok(s.integrityEvents.some(e => e.kind === 'record_unreadable'));
});

test('deleteLicense retire aussi l’activation', () => {
  const { s } = make();
  s.saveLicense('AVR1.x.y', {});
  s.saveActivation({ licenseId: 'AVR-1' });
  s.deleteLicense();
  assert.equal(s.loadLicense(), null);
  assert.equal(s.loadActivation(), null);
});

test('l’identité est stable et le code d’appareil dérive de l’empreinte', () => {
  const id = buildIdentity(null);
  assert.equal(id.installId.length, 64);
  assert.equal(id.fingerprint, fingerprintOf(id.installId));
  assert.equal(id.deviceCode, formatDeviceCode(id.fingerprint));
  assert.match(id.deviceCode, /^AVR-DEV(-[0-9A-F]{4}){8}$/);
  // Le code affiché doit pouvoir être renvoyé tel quel au générateur.
  assert.equal(parseDeviceCode(id.deviceCode), id.fingerprint, 'code réversible');

  const again = buildIdentity({ installId: id.installId, createdAt: id.createdAt, traitsDigest: id.traitsDigest });
  assert.equal(again.installId, id.installId);
  assert.equal(again.fingerprint, id.fingerprint);
});

test('le code d’appareil accepte toutes les formes que le client peut envoyer', () => {
  const fp = fingerprintOf('installation-test');
  const code = formatDeviceCode(fp);
  for (const forme of [code, code.toLowerCase(), fp, fp.toUpperCase(),
                       ' ' + code + ' ', code.replace(/-/g, ''), 'avr_dev_' + fp]) {
    assert.equal(parseDeviceCode(forme), fp, 'forme refusée : ' + forme.slice(0, 24));
  }
  for (const mauvais of ['', 'AVR-DEV-TROP-COURT', 'zzzz', null, undefined, fp + 'ff']) {
    assert.equal(parseDeviceCode(mauvais), null, 'forme acceptée à tort : ' + mauvais);
  }
});

test('deux installations produisent des empreintes différentes', () => {
  assert.notEqual(buildIdentity(null).fingerprint, buildIdentity(null).fingerprint);
});

test('le journal est borné et lu du plus récent au plus ancien', () => {
  const { s } = make();
  const j = new Journal(s);
  for (let i = 0; i < 150; i++) j.append('événement', { i });
  const list = j.list();
  assert.equal(list.length, 120);
  assert.equal(list[0].detail.i, 149);
  j.clear();
  assert.equal(j.list().length, 0);
});

test('l’identité se relit avant que le sceau dérivé soit connu', () => {
  // Reproduit le démarrage réel : au premier lancement le sceau dérive de
  // l'identifiant d'installation, mais au lancement suivant l'identité doit
  // être lisible AVANT que cet identifiant soit connu.
  const { s: first, a, b } = make('install-A');
  first.saveIdentity({ installId: 'install-A', createdAt: 1000, traitsDigest: 'd1' });

  const second = new SecureLicenseStorage({ backends: [a, b], mirror: null });
  const rec = second.loadIdentity();
  assert.ok(rec, 'identité retrouvée');
  assert.equal(rec.sealed, true, 'sceau valide sans setSealSecret');
  assert.equal(rec.data.installId, 'install-A');
});

test('le sceau d’identité ne dépend pas du secret dérivé', () => {
  const { s, a, b } = make('install-A');
  s.saveIdentity({ installId: 'install-A', createdAt: 1, traitsDigest: 'd' });
  s.setSealSecret('un-tout-autre-identifiant');
  assert.equal(s.loadIdentity().sealed, true);
});

test('describe() rapporte l’état des dépôts', () => {
  const { s } = make();
  const d = s.describe();
  assert.equal(d.namespace, 'averi.lic.v1');
  assert.deepEqual(d.backends.map(b => b.name), ['a', 'b']);
});
