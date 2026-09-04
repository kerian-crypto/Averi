/* ==========================================================
   AVERI LICENSING — Revue de sécurité automatisée
   ----------------------------------------------------------
   Ces tests échouent si une régression rouvre une porte que
   l'architecture est censée avoir fermée. Ils sont volontairement
   défiants : ils lisent les fichiers livrés au client, pas
   seulement les modules sources.
   ========================================================== */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { LicenseFacade } from '../src/licensing/facade.js';
import { DemoEngine } from '../src/licensing/demo-engine.js';
import { STATUS } from '../src/licensing/status.js';
import { PLANS } from '../src/licensing/config.js';
import { testKeyPair, issueTestLicense, signWith, memoryStorage, fakeClock, HOUR } from './helpers.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT_FILES = ['index.html', 'console.html'];
const KP = testKeyPair();

/** Fichiers embarqués dans l'application, hors outillage d'administration. */
function clientSources() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(js|mjs|html)$/.test(name)) out.push(p);
    }
  };
  walk(join(ROOT, 'src'));
  for (const f of CLIENT_FILES) if (existsSync(join(ROOT, f))) out.push(join(ROOT, f));
  return out;
}

/* ---------------------------------------------------------- */
/* Clé privée                                                  */
/* ---------------------------------------------------------- */

test('aucune clé privée PEM dans un fichier livré au client', () => {
  for (const f of clientSources()) {
    const c = readFileSync(f, 'utf8');
    assert.equal(/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(c), false, f);
  }
});

test('aucune primitive de génération ou de signature côté client', () => {
  const interdits = [
    /generateKeyPairSync/, /createPrivateKey/, /\bnode:crypto\b/,
    /\bcrypto\.sign\b/, /privateKey/
  ];
  for (const f of clientSources()) {
    const c = readFileSync(f, 'utf8');
    for (const re of interdits) {
      assert.equal(re.test(c), false, f + ' contient ' + re);
    }
  }
});

test('le module Ed25519 embarqué ne comporte aucune routine de signature', () => {
  const c = readFileSync(join(ROOT, 'src/licensing/ed25519.js'), 'utf8');
  assert.equal(/export\s+function\s+sign/.test(c), false);
  assert.equal(/function\s+sign\s*\(/.test(c), false);
  assert.match(c, /CAN_SIGN = false/);
});

test('le répertoire des clés est ignoré par Git', () => {
  const ignore = readFileSync(join(ROOT, '.gitignore'), 'utf8');
  assert.match(ignore, /^keys\/$/m);
  assert.match(ignore, /\*\.pem/m);
});

test('aucune clé ni secret n’est suivi par Git', () => {
  const suivis = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean);
  for (const f of suivis) {
    assert.equal(/\.(pem|key|private)$/.test(f), false, 'fichier sensible suivi : ' + f);
    assert.equal(/^keys\//.test(f), false, 'répertoire de clés suivi : ' + f);
  }
});

test('les fichiers suivis par Git ne contiennent aucune clé privée', () => {
  const suivis = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean);
  for (const f of suivis) {
    const p = join(ROOT, f);
    if (!existsSync(p) || statSync(p).size > 4 * 1024 * 1024) continue;
    const c = readFileSync(p, 'utf8');
    assert.equal(/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(c), false, f);
  }
});

test('la clé publique embarquée est bien une clé publique de 32 octets', () => {
  const c = readFileSync(join(ROOT, 'src/licensing/config.js'), 'utf8');
  const bloc = /export const TRUSTED_KEYS = \{([\s\S]*?)\n\};/.exec(c);
  assert.ok(bloc, 'bloc TRUSTED_KEYS présent');
  for (const m of bloc[1].matchAll(/'([A-Za-z0-9\-_]+)'/g)) {
    const raw = Buffer.from(m[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    assert.equal(raw.length, 32, 'clé ' + m[1]);
  }
});

/* ---------------------------------------------------------- */
/* Contournements                                              */
/* ---------------------------------------------------------- */

function facadeFor(opts = {}) {
  const clock = opts.clock || fakeClock();
  const facade = new LicenseFacade({
    storage: opts.storage || memoryStorage('sec-install'),
    clock: clock.guard,
    trustedKeys: KP.trustedKeys
  });
  return { facade, clock };
}

test('une licence forgée sans la clé privée est rejetée', () => {
  const { facade } = facadeFor();
  const autre = testKeyPair('test');       // même kid, autre clé
  const { token } = issueTestLicense(autre);
  const r = facade.activateLicense(token);
  assert.equal(r.ok, false);
  assert.equal(r.status, STATUS.LICENSE_TAMPERED);
  assert.equal(facade.getStatus().unlocked, false);
});

test('écrire directement une licence dans le stockage ne débloque rien', () => {
  const storage = memoryStorage('sec-install');
  const { facade } = facadeFor({ storage });
  const autre = testKeyPair('test');
  // Un attaquant colle un jeton contrefait à la place du vrai.
  storage.saveLicense(issueTestLicense(autre).token, {});
  assert.equal(facade.getStatus().unlocked, false);
});

test('gonfler les features d’une licence stockée ne débloque rien', () => {
  const storage = memoryStorage('sec-install');
  const { facade } = facadeFor({ storage });
  facade.activateLicense(issueTestLicense(KP, { plan: 'plan_1000' }).token);
  assert.equal(facade.canPlay('c4'), false);

  // Édition manuelle de l'enregistrement pour y injecter plan_2000.
  const rec = storage.loadLicense();
  const parts = rec.data.token.split('.');
  const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  payload.pln = 'plan_2000';
  payload.ftr = PLANS.plan_2000.features;
  const forged = parts[0] + '.' +
    Buffer.from(JSON.stringify(payload)).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') + '.' + parts[2];
  storage.saveLicense(forged, {});

  assert.equal(facade.canPlay('c4'), false);
  assert.equal(facade.getStatus().state, STATUS.LICENSE_TAMPERED);
});

test('desceller l’enregistrement de licence la rend inopérante', () => {
  const storage = memoryStorage('sec-install');
  const { facade } = facadeFor({ storage });
  const { token } = issueTestLicense(KP, { plan: 'plan_2000' });
  facade.activateLicense(token);
  assert.equal(facade.canPlay('c4'), true);

  for (const b of storage.backends) {
    b.set('averi.lic.v1.license', JSON.stringify({
      b: JSON.stringify({ v: 1, k: 'license', t: Date.now(), d: { token } }),
      h: '00'.repeat(16)
    }));
  }
  assert.equal(facade.getStatus().state, STATUS.LICENSE_TAMPERED);
  assert.equal(facade.canPlay('c4'), false);
});

test('la remise à zéro de la démonstration est fermée sans permission testing', () => {
  const { facade, clock } = facadeFor();
  facade.startDemo();
  clock.advance(HOUR + 1000);
  assert.equal(facade.getStatus().state, STATUS.DEMO_EXPIRED);

  const r = facade.resetDemo('tentative');
  assert.equal(r.ok, false);
  assert.equal(facade.getStatus().state, STATUS.DEMO_EXPIRED);

  // Le chemin direct est fermé lui aussi.
  assert.throws(() => facade.demo.reset('tentative'), /autorisation requise/);
  assert.equal(facade.getStatus().state, STATUS.DEMO_EXPIRED);
});

test('une licence publique ne peut pas s’offrir la permission testing', () => {
  const { facade, clock } = facadeFor();
  facade.startDemo();
  clock.advance(HOUR + 1000);
  facade.activateLicense(issueTestLicense(KP, { plan: 'plan_2000' }).token);
  assert.equal(facade.hasPermission('testing'), false);
  assert.equal(facade.resetDemo('tentative').ok, false);
});

test('le point d’entrée public n’expose ni la façade ni l’interface', () => {
  const c = readFileSync(join(ROOT, 'src/ui/public-entry.js'), 'utf8');
  assert.equal(/return \{ facade/.test(c), false);
  assert.equal(/^export (const|let|function) facade/m.test(c), false);
});

test('l’état de licence n’est jamais recalculé dans le code de jeu', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  // Le bloc injecté par le build contient légitimement le moteur : on
  // n'inspecte que le code de jeu, après le marqueur de fin.
  const jeu = html.slice(html.indexOf('/* AVERI:LICENSING:END */'));
  for (const re of [/expires_at/, /expiresAt\s*[<>]/, /DEMO_DURATION/, /Date\.now\(\)\s*[<>]\s*\w*[Ee]xpir/]) {
    assert.equal(re.test(jeu), false, 'logique de licence dupliquée : ' + re);
  }
  // Les décisions passent par l'API, pas par des conditions ad hoc.
  assert.match(jeu, /window\.AveriLicense\.canPlay/);
});

test('aucune manche n’est jouable sans droits', () => {
  const { facade } = facadeFor();
  for (const g of ['truth', 'never', 'likely', 'compat', 'c4', 'memory']) {
    assert.equal(facade.canPlay(g), false, g);
  }
  assert.equal(facade.can('chat.text'), false);
  assert.equal(facade.can('session.unlimited'), false);
});

test('une licence correctement signée pour un plan inconnu n’accorde rien', () => {
  const { facade } = facadeFor();
  const { payload } = issueTestLicense(KP);
  // Signée avec la bonne clé, mais son plan n'existe pas dans le catalogue.
  const token = signWith(KP, Object.assign({}, payload, { pln: 'plan_or_massif' }));
  const r = facade.activateLicense(token);
  assert.equal(r.ok, false);
  assert.equal(r.status, STATUS.LICENSE_PLAN_UNKNOWN);
  assert.equal(facade.getStatus().unlocked, false);
});

test('la révocation locale ne peut pas être injectée sans sceau', () => {
  const storage = memoryStorage('sec-install');
  const { facade } = facadeFor({ storage });
  const { token, payload } = issueTestLicense(KP, { plan: 'plan_2000' });
  facade.activateLicense(token);
  assert.equal(facade.getStatus().state, STATUS.LICENSE_ACTIVE);

  // Un tiers écrit une liste de révocation non scellée pour bloquer la licence.
  for (const b of storage.backends) {
    b.set('averi.lic.v1.revocation', JSON.stringify({
      b: JSON.stringify({ v: 1, k: 'revocation', t: Date.now(), d: { ids: [payload.id], reasons: {} } }),
      h: 'ff'.repeat(16)
    }));
  }
  facade.revocations._local = null;
  assert.equal(facade.getStatus().state, STATUS.LICENSE_ACTIVE, 'liste descellée ignorée');
});

test('le bundle livré expose une surface réduite', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const debut = html.indexOf('/* AVERI:LICENSING:BEGIN');
  const fin = html.indexOf('/* AVERI:LICENSING:END */');
  assert.ok(debut !== -1 && fin > debut, 'bloc de licensing présent');
  const bundle = html.slice(debut, fin);
  assert.match(bundle, /window\.AveriLicense = /);
  assert.equal(/window\.(LicenseFacade|LicenseEngine|SecureLicenseStorage)/.test(bundle), false);
});
