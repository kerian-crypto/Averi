/* ==========================================================
   AVERI — Test du livrable réel
   ----------------------------------------------------------
   Ces tests n'importent pas les modules sources : ils
   exécutent le bundle TEL QU'IL EST INJECTÉ dans index.html.
   C'est le seul moyen de vérifier que le bundler produit du
   code correct et que ce que reçoit l'utilisateur fonctionne.
   ========================================================== */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

import { installDom } from './dom-stub.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function extractBundle(file) {
  const html = readFileSync(join(ROOT, file), 'utf8');
  const begin = html.indexOf('/* AVERI:LICENSING:BEGIN');
  const end = html.indexOf('/* AVERI:LICENSING:END */');
  assert.ok(begin !== -1 && end > begin, file + ' : bloc de licensing absent — lancez le build');
  return html.slice(begin, end);
}

/** Évalue le bundle dans un contexte isolé, avec le DOM minimal. */
function runBundle(file) {
  const dom = installDom();
  const sandbox = {
    window: globalThis.window,
    document: globalThis.document,
    navigator: globalThis.navigator,
    screen: globalThis.screen,
    location: globalThis.location,
    console,
    Date, Math, JSON, Object, Array, String, Number, Boolean, Symbol, Error,
    BigInt, Set, Map, Uint8Array, Int16Array, Promise, RegExp, Intl,
    TextEncoder, TextDecoder, crypto,
    setTimeout, clearTimeout, setInterval, clearInterval,
    performance, prompt: () => {}
  };
  sandbox.globalThis = sandbox;
  runInNewContext(extractBundle(file), sandbox);
  return { dom, api: sandbox.window.AveriLicense, sandbox };
}

let ctx = null;
beforeEach(() => { ctx = null; });
afterEach(() => { if (ctx && ctx.dom) ctx.dom.cleanup(); });

test('le bundle d’index.html s’évalue et expose l’API attendue', () => {
  ctx = runBundle('index.html');
  const api = ctx.api;
  assert.ok(api, 'window.AveriLicense défini');
  for (const fn of ['boot', 'canPlay', 'can', 'status', 'unlocked', 'wireFeatures',
                    'sharedFeatures', 'promptFor', 'featureOfGame', 'featureLabel',
                    'createPill', 'createHomePanel', 'openPlans', 'openActivation',
                    'contactSupport', 'canOpenConsole']) {
    assert.equal(typeof api[fn], 'function', fn);
  }
});

test('le bundle n’expose ni la façade ni les moteurs', () => {
  ctx = runBundle('index.html');
  assert.equal(ctx.api.facade, undefined);
  assert.equal(ctx.api.ui, undefined);
  assert.equal(ctx.sandbox.window.LicenseFacade, undefined);
  assert.equal(ctx.sandbox.window.LicenseEngine, undefined);
});

test('boot() démarre et l’application est verrouillée par défaut', () => {
  ctx = runBundle('index.html');
  const { status } = ctx.api.boot({});
  assert.equal(status.state, 'DEMO_AVAILABLE');
  assert.equal(ctx.api.unlocked(), false);
  for (const g of ['truth', 'never', 'likely', 'compat', 'c4', 'memory']) {
    assert.equal(ctx.api.canPlay(g), false, g);
  }
  assert.equal(ctx.api.can('session.unlimited'), false);
  assert.deepEqual(ctx.api.wireFeatures(), []);
});

test('le panneau d’accueil se monte et démarre la démonstration', () => {
  ctx = runBundle('index.html');
  ctx.api.boot({});
  const panel = ctx.api.createHomePanel();
  const pill = ctx.api.createPill();
  assert.match(panel.textContent, /Essayez Averi pendant une heure/);

  const go = panel.find(n => n.tagName === 'BUTTON' && /Démarrer/.test(n.textContent));
  go.click();

  assert.equal(ctx.api.status().state, 'DEMO_ACTIVE');
  assert.equal(ctx.api.unlocked(), true);
  assert.equal(ctx.api.canPlay('c4'), true);
  assert.match(pill.textContent, /Démo ·/);
  assert.ok(ctx.api.wireFeatures().length >= 6);
});

test('la démonstration survit à un rechargement de page', () => {
  ctx = runBundle('index.html');
  ctx.api.boot({});
  ctx.api.createHomePanel().find(n => n.tagName === 'BUTTON' && /Démarrer/.test(n.textContent)).click();
  const avant = ctx.api.status().demo.startedAt;
  assert.ok(avant > 0);

  // Rechargement : nouveau contexte, MÊME stockage (cookies du DOM stub).
  const dom = ctx.dom;
  const sandbox = {
    window: globalThis.window, document: globalThis.document,
    navigator: globalThis.navigator, screen: globalThis.screen,
    location: globalThis.location, console,
    Date, Math, JSON, Object, Array, String, Number, Boolean, Symbol, Error,
    BigInt, Set, Map, Uint8Array, Int16Array, Promise, RegExp, Intl,
    TextEncoder, TextDecoder, crypto,
    setTimeout, clearTimeout, setInterval, clearInterval, performance, prompt: () => {}
  };
  sandbox.globalThis = sandbox;
  runInNewContext(extractBundle('index.html'), sandbox);
  const rechargé = sandbox.window.AveriLicense;
  rechargé.boot({});

  assert.equal(rechargé.status().state, 'DEMO_ACTIVE');
  assert.equal(rechargé.status().demo.startedAt, avant, 'même démonstration reprise');
  ctx.dom = dom;
});

test('le stockage par cookie est réellement opérationnel', () => {
  ctx = runBundle('index.html');
  ctx.api.boot({});
  assert.match(globalThis.document.cookie, /averi\.lic\.v1\./,
    'au moins un enregistrement écrit dans le bocal à cookies');
});

test('le jeton d’essai est écrit dans le stockage du navigateur', () => {
  ctx = runBundle('index.html');
  ctx.api.boot({});
  assert.equal(/averi\.lic\.v1\.trial/.test(globalThis.document.cookie), false,
    'aucun jeton avant le démarrage de l’essai');

  ctx.api.createHomePanel()
    .find(n => n.tagName === 'BUTTON' && /Démarrer/.test(n.textContent)).click();

  assert.match(globalThis.document.cookie, /averi\.lic\.v1\.trial/,
    'jeton d’essai persisté');
  assert.equal(ctx.api.status().state, 'DEMO_ACTIVE');
});

test('l’essai n’est pas relançable après effacement de l’état de démonstration', () => {
  ctx = runBundle('index.html');
  ctx.api.boot({});
  ctx.api.createHomePanel()
    .find(n => n.tagName === 'BUTTON' && /Démarrer/.test(n.textContent)).click();
  assert.equal(ctx.api.status().state, 'DEMO_ACTIVE');

  // L'utilisateur repère et supprime l'enregistrement de démonstration.
  globalThis.document.cookie = 'averi.lic.v1.demo=;expires=Thu, 01 Jan 1970 00:00:00 GMT';
  assert.equal(/averi\.lic\.v1\.demo=/.test(globalThis.document.cookie), false);

  const sandbox = {
    window: globalThis.window, document: globalThis.document,
    navigator: globalThis.navigator, screen: globalThis.screen,
    location: globalThis.location, console,
    Date, Math, JSON, Object, Array, String, Number, Boolean, Symbol, Error,
    BigInt, Set, Map, Uint8Array, Int16Array, Promise, RegExp, Intl,
    TextEncoder, TextDecoder, crypto,
    setTimeout, clearTimeout, setInterval, clearInterval, performance, prompt: () => {}
  };
  sandbox.globalThis = sandbox;
  runInNewContext(extractBundle('index.html'), sandbox);
  const rechargé = sandbox.window.AveriLicense;
  const { status } = rechargé.boot({});

  // Le jeton d'essai subsiste : aucun nouvel essai n'est accordé.
  assert.notEqual(status.state, 'DEMO_AVAILABLE');
  assert.equal(status.canStartDemo, false);
});

test('l’intersection des droits avec le pair est appliquée', () => {
  ctx = runBundle('index.html');
  ctx.api.boot({});
  ctx.api.createHomePanel().find(n => n.tagName === 'BUTTON' && /Démarrer/.test(n.textContent)).click();

  const commun = ctx.api.sharedFeatures(['game.truth', 'chat.text']);
  assert.deepEqual(commun.sort(), ['chat.text', 'game.truth']);
  assert.equal(commun.includes('game.c4'), false);
});

test('promptFor ouvre un écran sans lever d’exception', () => {
  ctx = runBundle('index.html');
  ctx.api.boot({});
  ctx.api.promptFor('game.c4');
  ctx.api.openPlans();
  ctx.api.openActivation();
  assert.equal(ctx.api.canOpenConsole(), false);
});

test('le bundle de console.html s’évalue et expose sa propre API', () => {
  ctx = runBundle('console.html');
  assert.equal(typeof ctx.sandbox.window.AveriConsole, 'object');
  assert.equal(typeof ctx.sandbox.window.AveriConsole.boot, 'function');
  assert.equal(ctx.sandbox.window.AveriLicense, undefined, 'surfaces distinctes');
});

test('la console démarre réellement et affiche son verrou', () => {
  ctx = runBundle('console.html');
  const root = globalThis.document.createElement('div');
  root.id = 'console-root';
  globalThis.document.body.appendChild(root);

  ctx.sandbox.window.AveriConsole.boot('console-root');

  assert.match(root.textContent, /Averi License Console/);
  assert.match(root.textContent, /Accès réservé/);
  // Un administrateur qui vient de déployer doit savoir quoi faire.
  assert.match(root.textContent, /cli\.mjs generate/);
  assert.ok(root.find(n => n.tagName === 'TEXTAREA'), 'champ de saisie présent');
  assert.ok(root.find(n => n.tagName === 'BUTTON' && n.textContent === 'Ouvrir la console'));
});

test('la console refuse un jeton invalide sans planter', () => {
  ctx = runBundle('console.html');
  const root = globalThis.document.createElement('div');
  root.id = 'console-root';
  globalThis.document.body.appendChild(root);
  ctx.sandbox.window.AveriConsole.boot('console-root');

  root.find(n => n.tagName === 'TEXTAREA').value = 'AVR1.pasunelicence.dutout';
  root.find(n => n.tagName === 'BUTTON' && n.textContent === 'Ouvrir la console').click();

  assert.match(root.textContent, /LICENSE_/);
  assert.match(root.textContent, /Accès réservé/, 'le verrou reste en place');
});

test('la console s’ouvre avec une licence privée signée par la clé du produit', () => {
  // La licence est signée avec la clé de PRODUCTION (keys/averi-signing-k1),
  // exactement comme celle qu'un administrateur collerait. Le test est ignoré
  // si la clé n'est pas présente sur ce poste.
  if (!existsSync(join(ROOT, 'keys', 'averi-signing-k1.private.pem'))) return;

  const token = execFileSync('node', [
    'tools/license-generator/cli.mjs', 'generate',
    '--type', 'private', '--permissions', 'admin,diagnostics,internal_tools',
    '--duration', '1d'
  ], { cwd: ROOT, encoding: 'utf8' })
    .replace(/\x1b\[[0-9;]*m/g, '')
    .split('\n').find(l => l.startsWith('AVR1.'));
  assert.ok(token, 'jeton émis');

  ctx = runBundle('console.html');
  const root = globalThis.document.createElement('div');
  root.id = 'console-root';
  globalThis.document.body.appendChild(root);
  ctx.sandbox.window.AveriConsole.boot('console-root');

  root.find(n => n.tagName === 'TEXTAREA').value = token;
  root.find(n => n.tagName === 'BUTTON' && n.textContent === 'Ouvrir la console').click();

  assert.equal(/Accès réservé/.test(root.textContent), false, 'verrou levé');
  assert.match(root.textContent, /Vue d’ensemble/);
  assert.match(root.textContent, /Diagnostic/);
});

test('les deux livrables portent la même clé publique de confiance', () => {
  const a = extractBundle('index.html');
  const b = extractBundle('console.html');
  const keyOf = (src) => {
    const m = /TRUSTED_KEYS = \{[\s\S]*?k1: '([A-Za-z0-9_-]+)'/.exec(src);
    return m ? m[1] : null;
  };
  assert.ok(keyOf(a), 'clé présente dans index.html');
  assert.equal(keyOf(a), keyOf(b));
});
