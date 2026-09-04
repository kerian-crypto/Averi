import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { buildPayload, parseDuration, newLicenseId } from '../tools/license-generator/builder.mjs';
import { LicenseEngine } from '../src/licensing/license-engine.js';
import { STATUS } from '../src/licensing/status.js';
import { PLANS, PRIVATE_PLAN_ID, ACTIVE_KEY_ID } from '../src/licensing/config.js';
import { fingerprintOf, formatDeviceCode } from '../src/licensing/device.js';

let KEYS_DIR;

before(() => { KEYS_DIR = mkdtempSync(join(tmpdir(), 'averi-keys-')); });
after(() => { rmSync(KEYS_DIR, { recursive: true, force: true }); });

/** Lance le CLI dans un répertoire de clés isolé, jamais celui de production. */
function cli(...args) {
  return execFileSync('node', ['tools/license-generator/cli.mjs', ...args], {
    env: Object.assign({}, process.env, { AVERI_KEYS_DIR: KEYS_DIR }),
    encoding: 'utf8'
  }).replace(/\x1b\[[0-9;]*m/g, '');
}

test('parseDuration comprend les unités usuelles', () => {
  assert.equal(parseDuration('30d'), 30 * 86400e3);
  assert.equal(parseDuration('12h'), 12 * 3600e3);
  assert.equal(parseDuration('8w'), 8 * 7 * 86400e3);
  assert.equal(parseDuration('1y'), 365 * 86400e3);
  assert.equal(parseDuration('90'), 90 * 86400e3);
  assert.throws(() => parseDuration('bientôt'));
});

test('les identifiants de licence sont uniques et bien formés', () => {
  const vus = new Set();
  for (let i = 0; i < 200; i++) {
    const id = newLicenseId();
    assert.match(id, /^AVR-[0-9A-Z]{8}$/);
    vus.add(id);
  }
  assert.ok(vus.size > 195);
});

test('buildPayload refuse un plan inconnu', () => {
  assert.throws(() => buildPayload({ type: 'public', plan: 'plan_5000' }), /Plan inconnu/);
});

test('buildPayload refuse des features hors du plan', () => {
  assert.throws(() => buildPayload({ type: 'public', plan: 'plan_1000', features: ['game.c4'] }),
    /hors du plan/);
});

test('buildPayload refuse des permissions sur une licence publique', () => {
  assert.throws(() => buildPayload({ type: 'public', plan: 'plan_1000', permissions: ['admin'] }),
    /ne peut pas porter de permissions/);
});

test('buildPayload refuse le plan interne sur une licence publique', () => {
  assert.throws(() => buildPayload({ type: 'public', plan: PRIVATE_PLAN_ID }), /réservé aux licences privées/);
});

test('buildPayload impose le plan interne aux licences privées', () => {
  assert.throws(() => buildPayload({ type: 'private', plan: 'plan_1000' }), /doit utiliser le plan/);
});

test('buildPayload refuse un code d’appareil malformé', () => {
  assert.throws(() => buildPayload({ type: 'public', plan: 'plan_1000', deviceFingerprint: 'AVR-DEV-XXXX' }),
    /Code d’appareil invalide/);
});

test('buildPayload accepte le code d’appareil tel que le client le copie', () => {
  const fp = fingerprintOf('client-de-test');
  const code = formatDeviceCode(fp);
  const p = buildPayload({ type: 'public', plan: 'plan_1000', deviceFingerprint: code });
  assert.equal(p.dev.m, 'fp');
  assert.equal(p.dev.v, fp, 'l’empreinte est retrouvée depuis le code affiché');
});

test('buildPayload applique la durée par défaut du plan', () => {
  const p = buildPayload({ type: 'public', plan: 'plan_2000' });
  assert.equal(p.exp - p.nbf, PLANS.plan_2000.default_duration_days * 86400);
  assert.deepEqual(p.ftr, PLANS.plan_2000.features);
});

test('keygen crée une clé privée en 0600 et une clé publique lisible', () => {
  const out = cli('keygen', '--kid', 'test-cli', '--no-install');
  assert.match(out, /Paire « test-cli » créée/);
  const priv = join(KEYS_DIR, 'averi-signing-test-cli.private.pem');
  assert.ok(existsSync(priv));
  assert.equal(statSync(priv).mode & 0o777, 0o600);
  assert.match(readFileSync(priv, 'utf8'), /BEGIN PRIVATE KEY/);
  assert.match(out, /NON installée/);
});

test('keygen refuse d’écraser une clé sans --force', () => {
  assert.throws(() => cli('keygen', '--kid', 'test-cli', '--no-install'), /existe déjà|Command failed/);
});

test('le CLI émet une licence que le moteur du client accepte', () => {
  const out = cli('generate', '--type', 'public', '--plan', 'plan_1000',
    '--duration', '30d', '--kid', 'test-cli', '--holder', 'Client Test');
  const token = out.split('\n').find(l => l.startsWith('AVR1.'));
  assert.ok(token, 'jeton présent dans la sortie');

  const pubPem = readFileSync(join(KEYS_DIR, 'averi-signing-test-cli.public.pem'), 'utf8');
  const raw = Buffer.from(pubPem.replace(/-----[^-]+-----|\s/g, ''), 'base64').subarray(-32);
  const b64u = raw.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const engine = new LicenseEngine({ trustedKeys: { 'test-cli': b64u } });
  const r = engine.getLicenseStatus(token, {});
  assert.equal(r.status, STATUS.LICENSE_ACTIVE);
  assert.equal(r.license.metadata.holder, 'Client Test');
  assert.equal(r.license.planId, 'plan_1000');
});

test('le CLI émet une licence privée avec ses permissions', () => {
  const out = cli('generate', '--type', 'private', '--kid', 'test-cli',
    '--permissions', 'admin,diagnostics', '--duration', '1y');
  const token = out.split('\n').find(l => l.startsWith('AVR1.'));
  const pubPem = readFileSync(join(KEYS_DIR, 'averi-signing-test-cli.public.pem'), 'utf8');
  const raw = Buffer.from(pubPem.replace(/-----[^-]+-----|\s/g, ''), 'base64').subarray(-32);
  const b64u = raw.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const r = new LicenseEngine({ trustedKeys: { 'test-cli': b64u } }).getLicenseStatus(token, {});
  assert.equal(r.status, STATUS.LICENSE_ACTIVE);
  assert.equal(r.license.type, 'private');
  assert.deepEqual(r.permissions.sort(), ['admin', 'diagnostics']);
});

test('le CLI consigne chaque émission dans un registre', () => {
  cli('generate', '--type', 'public', '--plan', 'plan_2000', '--kid', 'test-cli', '--ref', 'PAY-42');
  const registre = readFileSync(join(KEYS_DIR, 'issued-licenses.jsonl'), 'utf8').trim().split('\n');
  const derniere = JSON.parse(registre[registre.length - 1]);
  assert.equal(derniere.plan, 'plan_2000');
  assert.equal(derniere.metadata.ref, 'PAY-42');
  assert.ok(derniere.license_id.startsWith('AVR-'));
});

test('inspect relit une licence émise et rapporte son statut', () => {
  const tokenFile = join(KEYS_DIR, 'licence.txt');
  cli('generate', '--type', 'public', '--plan', 'plan_1000', '--kid', 'test-cli', '--out', tokenFile);
  const token = readFileSync(tokenFile, 'utf8').trim();

  // La clé « test-cli » n'est pas dans TRUSTED_KEYS du client : le moteur
  // doit donc la refuser, ce qui prouve qu'inspect applique bien les
  // mêmes règles que l'application.
  const out = cli('inspect', token);
  assert.match(out, /Statut/);
  assert.match(out, /LICENSE_TAMPERED/);
  assert.match(out, /test-cli/);
});

test('le générateur refuse de signer sans clé privée', () => {
  assert.throws(
    () => cli('generate', '--type', 'public', '--plan', 'plan_1000', '--kid', 'clé-absente'),
    /Command failed/
  );
});

test('la commande plans reflète exactement la configuration', () => {
  const out = cli('plans');
  assert.match(out, /plan_1000/);
  assert.match(out, /1\s?000 FCFA/);
  assert.match(out, /plan_2000/);
  assert.match(out, /2\s?000 FCFA/);
  assert.equal(ACTIVE_KEY_ID, 'k1');
});
