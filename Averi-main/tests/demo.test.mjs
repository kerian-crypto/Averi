import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DemoEngine } from '../src/licensing/demo-engine.js';
import { STATUS } from '../src/licensing/status.js';
import { DEMO_DURATION_MS } from '../src/licensing/config.js';
import { memoryStorage, fakeClock, HOUR, MINUTE } from './helpers.mjs';

const IDENTITY = { installId: 'install-de-test' };

function makeDemo(overrides = {}) {
  const storage = overrides.storage || memoryStorage();
  const clock = overrides.clock || fakeClock();
  const demo = new DemoEngine({ storage, identity: IDENTITY, clock: clock.guard });
  return { demo, storage, clock };
}

/** Reconstruit un moteur sur le même stockage : simule une réouverture de l'onglet. */
function reopen(storage, clock) {
  clock.restartSession();
  return new DemoEngine({ storage, identity: IDENTITY, clock: clock.guard });
}

test('la durée de démonstration est bien d’une heure', () => {
  assert.equal(DEMO_DURATION_MS, HOUR);
});

test('avant toute activation -> DEMO_AVAILABLE', () => {
  const { demo } = makeDemo();
  assert.equal(demo.isAvailable(), true);
  const r = demo.evaluate();
  assert.equal(r.status, STATUS.DEMO_AVAILABLE);
  assert.equal(r.remainingMs, HOUR);
  assert.deepEqual(r.features, []);
});

test('première activation -> DEMO_ACTIVE avec une heure pleine', () => {
  const { demo } = makeDemo();
  const r = demo.start();
  assert.equal(r.status, STATUS.DEMO_ACTIVE);
  assert.ok(r.remainingMs > 59 * MINUTE);
  assert.ok(r.features.length > 0);
});

test('démarrer deux fois ne remet pas le compteur à zéro', () => {
  const { demo, clock } = makeDemo();
  demo.start();
  clock.advance(30 * MINUTE);
  const r = demo.start();
  assert.ok(r.remainingMs <= 30 * MINUTE, 'reste ' + r.remainingMs);
});

test('compte à rebours : 42 minutes restantes après 18 minutes', () => {
  const { demo, clock } = makeDemo();
  demo.start();
  clock.advance(18 * MINUTE);
  const r = demo.evaluate();
  assert.equal(Math.round(r.remainingMs / MINUTE), 42);
  assert.equal(r.warning, false);
});

test('avertissement sous les 10 minutes', () => {
  const { demo, clock } = makeDemo();
  demo.start();
  clock.advance(52 * MINUTE);
  const r = demo.evaluate();
  assert.equal(r.status, STATUS.DEMO_ACTIVE);
  assert.equal(r.warning, true);
  assert.equal(Math.round(r.remainingMs / MINUTE), 8);
});

test('à exactement une heure -> DEMO_EXPIRED', () => {
  const { demo, clock } = makeDemo();
  demo.start();
  clock.advance(HOUR);
  const r = demo.evaluate();
  assert.equal(r.status, STATUS.DEMO_EXPIRED);
  assert.equal(r.remainingMs, 0);
  assert.deepEqual(r.features, []);
});

test('une seconde avant l’heure -> encore active', () => {
  const { demo, clock } = makeDemo();
  demo.start();
  clock.advance(HOUR - 1000);
  assert.equal(demo.evaluate().status, STATUS.DEMO_ACTIVE);
});

test('au-delà d’une heure -> DEMO_EXPIRED', () => {
  const { demo, clock } = makeDemo();
  demo.start();
  clock.advance(3 * HOUR);
  assert.equal(demo.evaluate().status, STATUS.DEMO_EXPIRED);
});

test('fermeture puis réouverture : le temps écoulé est conservé', () => {
  const { demo, storage, clock } = makeDemo();
  demo.start();
  clock.advance(20 * MINUTE);
  demo.flush();

  const demo2 = reopen(storage, clock);
  clock.advance(15 * MINUTE);
  const r = demo2.evaluate();
  assert.equal(r.status, STATUS.DEMO_ACTIVE);
  assert.equal(Math.round(r.remainingMs / MINUTE), 25);
});

test('l’horloge reculée ne rend pas de temps', () => {
  const { demo, storage, clock } = makeDemo();
  const started = clock.wall;
  demo.start();
  clock.advance(45 * MINUTE);
  demo.flush();

  // L'utilisateur remet l'horloge à l'instant du démarrage.
  const demo2 = reopen(storage, clock);
  clock.setWall(started);

  const r = demo2.evaluate();
  assert.equal(r.status, STATUS.DEMO_ACTIVE);
  assert.ok(r.remainingMs <= 15 * MINUTE, 'reste ' + Math.round(r.remainingMs / MINUTE) + ' min');
  assert.equal(r.clockTampered, true);
  assert.ok(r.anomalies.some(a => a.kind === 'clock_backwards'));
});

test('reculer l’horloge très loin dans le passé n’ouvre pas de nouvelle heure', () => {
  const { demo, storage, clock } = makeDemo();
  demo.start();
  clock.advance(59 * MINUTE);
  demo.flush();

  const demo2 = reopen(storage, clock);
  clock.setWall(Date.parse('2020-01-01T00:00:00Z'));
  const r = demo2.evaluate();
  assert.ok(r.remainingMs <= MINUTE, 'reste ' + r.remainingMs + ' ms');
  assert.equal(r.clockTampered, true);
});

test('figer l’horloge ne suspend pas la démonstration (temps monotone)', () => {
  const { demo, clock } = makeDemo();
  demo.start();
  // L'horloge murale n'avance pas, seul le compteur monotone progresse.
  for (let i = 0; i < 61; i++) {
    clock.setWall(clock.wall);      // horloge gelée
    clock.guard.monoNow = ((base) => () => base)(0);
    break;
  }
  // Simulation directe : on avance le monotone sans toucher au mur.
  let mono = 0;
  const guard = clock.guard;
  guard.monoNow = () => mono;
  mono = 61 * MINUTE;
  const r = demo.evaluate();
  assert.equal(r.status, STATUS.DEMO_EXPIRED);
});

test('avancer l’horloge consomme la démonstration (au détriment du tricheur)', () => {
  const { demo, clock } = makeDemo();
  demo.start();
  clock.setWall(clock.wall + 10 * HOUR);
  const r = demo.evaluate();
  assert.equal(r.status, STATUS.DEMO_EXPIRED);
});

test('effacement d’un seul dépôt : le stockage restaure et la démo tient', () => {
  const storage = memoryStorage();
  const clock = fakeClock();
  const demo = new DemoEngine({ storage, identity: IDENTITY, clock: clock.guard });
  demo.start();
  clock.advance(40 * MINUTE);
  demo.flush();

  storage.backends[0].remove('averi.lic.v1.demo');

  const demo2 = reopen(storage, clock);
  const r = demo2.evaluate();
  assert.equal(r.status, STATUS.DEMO_ACTIVE);
  assert.ok(r.remainingMs <= 20 * MINUTE);
  assert.ok(storage.backends[0].get('averi.lic.v1.demo') !== null, 'dépôt restauré');
});

test('état descellé (édité à la main) -> démonstration considérée consommée', () => {
  const storage = memoryStorage();
  const clock = fakeClock();
  const demo = new DemoEngine({ storage, identity: IDENTITY, clock: clock.guard });
  demo.start();
  clock.advance(5 * MINUTE);
  demo.flush();

  // L'utilisateur réécrit l'enregistrement pour se rendre du temps.
  const forged = JSON.stringify({
    b: JSON.stringify({ v: 1, k: 'demo', t: Date.now(), d: {
      version: 1, installId: IDENTITY.installId, startedAtWall: clock.wall,
      consumedMs: 0, highWaterWall: clock.wall, lastSeenWall: clock.wall,
      lastSessionMono: null, anomalies: [], exhausted: false
    } }),
    h: '00000000000000000000000000000000'
  });
  for (const b of storage.backends) b.set('averi.lic.v1.demo', forged);

  const demo2 = reopen(storage, clock);
  const r = demo2.evaluate();
  assert.equal(r.status, STATUS.DEMO_EXPIRED);
  assert.ok(r.anomalies.some(a => a.kind === 'seal_broken'));
});

test('état corrompu (champs absents) -> démonstration considérée consommée', () => {
  const storage = memoryStorage();
  const clock = fakeClock();
  storage.saveDemoState({ version: 1, bidule: 'truc' });
  const demo = new DemoEngine({ storage, identity: IDENTITY, clock: clock.guard });
  const r = demo.evaluate();
  assert.equal(r.status, STATUS.DEMO_EXPIRED);
  assert.ok(r.anomalies.some(a => a.kind === 'corrupt_state'));
});

test('démo appartenant à une autre installation -> considérée consommée', () => {
  const storage = memoryStorage();
  const clock = fakeClock();
  const d1 = new DemoEngine({ storage, identity: { installId: 'autre-install' }, clock: clock.guard });
  d1.start();
  d1.flush();

  const d2 = new DemoEngine({ storage, identity: IDENTITY, clock: clock.guard });
  const r = d2.evaluate();
  assert.equal(r.status, STATUS.DEMO_EXPIRED);
  assert.ok(r.anomalies.some(a => a.kind === 'install_mismatch'));
});

/* ---- Jeton d'essai : trace indépendante de l'état de démonstration ---- */

/** Efface un enregistrement de TOUS les dépôts, comme le ferait un utilisateur. */
function wipe(storage, key) {
  for (const b of storage.backends) b.remove('averi.lic.v1.' + key);
}

test('un jeton d’essai est écrit dès la première activation', () => {
  const { demo, storage } = makeDemo();
  assert.equal(storage.loadTrialToken(), null, 'aucun jeton avant l’essai');

  demo.start();

  const rec = storage.loadTrialToken();
  assert.ok(rec, 'jeton écrit');
  assert.equal(rec.sealed, true);
  assert.equal(rec.data.installId, IDENTITY.installId);
  assert.ok(rec.data.issuedAt > 0);
  assert.match(rec.data.nonce, /^[0-9a-f]{24}$/);
});

test('effacer l’état de démonstration ne rend pas l’essai : le jeton fait foi', () => {
  const storage = memoryStorage();
  const clock = fakeClock();
  const demo = new DemoEngine({ storage, identity: IDENTITY, clock: clock.guard });
  demo.start();
  clock.advance(25 * MINUTE);
  demo.flush();

  wipe(storage, 'demo');

  const demo2 = reopen(storage, clock);
  assert.equal(demo2.isAvailable(), false, 'aucun nouvel essai accordé');
  const r = demo2.evaluate();
  assert.equal(r.status, STATUS.DEMO_ACTIVE);
  // Le temps écoulé est recalculé depuis l'émission du jeton : ni l'heure
  // entière rendue, ni l'heure entière confisquée.
  assert.equal(Math.round(r.remainingMs / MINUTE), 35);
  assert.ok(r.anomalies.some(a => a.kind === 'state_restored_from_trial'));
});

test('effacer l’état après une heure laisse la démonstration expirée', () => {
  const storage = memoryStorage();
  const clock = fakeClock();
  const demo = new DemoEngine({ storage, identity: IDENTITY, clock: clock.guard });
  demo.start();
  clock.advance(HOUR + 5 * MINUTE);
  demo.flush();

  wipe(storage, 'demo');

  const demo2 = reopen(storage, clock);
  assert.equal(demo2.start().status, STATUS.DEMO_EXPIRED, 'start() ne relance rien');
});

test('effacer l’identité en plus de l’état ne rend pas l’essai', () => {
  const storage = memoryStorage();
  const clock = fakeClock();
  const demo = new DemoEngine({ storage, identity: IDENTITY, clock: clock.guard });
  demo.start();
  clock.advance(10 * MINUTE);
  demo.flush();

  wipe(storage, 'demo');
  wipe(storage, 'identity');

  // Nouvelle identité fabriquée pour l'occasion : le jeton est scellé avec
  // la clé d'amorçage, il reste donc lisible et trahit l'essai précédent.
  const demo2 = new DemoEngine({ storage, identity: { installId: 'installation-toute-neuve' }, clock: clock.guard });
  clock.restartSession();
  const r = demo2.evaluate();
  assert.equal(r.status, STATUS.DEMO_EXPIRED);
  assert.ok(r.anomalies.some(a => a.kind === 'install_mismatch'));
});

test('un jeton d’essai retouché à la main vaut essai consommé', () => {
  const storage = memoryStorage();
  const clock = fakeClock();
  const demo = new DemoEngine({ storage, identity: IDENTITY, clock: clock.guard });
  demo.start();
  demo.flush();

  wipe(storage, 'demo');
  // On tente de rajeunir le jeton pour se rendre une heure.
  const forged = JSON.stringify({
    b: JSON.stringify({ v: 1, k: 'trial', t: Date.now(), d: {
      version: 1, installId: IDENTITY.installId, nonce: 'ff'.repeat(12),
      issuedAt: clock.wall, durationMs: HOUR
    } }),
    h: '00'.repeat(16)
  });
  for (const b of storage.backends) b.set('averi.lic.v1.trial', forged);

  const demo2 = reopen(storage, clock);
  const r = demo2.evaluate();
  assert.equal(r.status, STATUS.DEMO_EXPIRED);
  assert.ok(r.anomalies.some(a => a.kind === 'trial_token_tampered'));
});

test('le jeton n’est pas rajeuni au fil des sessions', () => {
  const storage = memoryStorage();
  const clock = fakeClock();
  let demo = new DemoEngine({ storage, identity: IDENTITY, clock: clock.guard });
  demo.start();
  const emisA = storage.loadTrialToken().data.issuedAt;

  for (let i = 0; i < 5; i++) {
    clock.advance(5 * MINUTE);
    demo.flush();
    demo = reopen(storage, clock);
    demo.evaluate();
  }
  assert.equal(storage.loadTrialToken().data.issuedAt, emisA, 'date d’émission figée');
});

test('effacer l’état puis reculer l’horloge ne rend pas de temps', () => {
  const storage = memoryStorage();
  const clock = fakeClock();
  const demo = new DemoEngine({ storage, identity: IDENTITY, clock: clock.guard });
  demo.start();
  clock.advance(30 * MINUTE);
  demo.flush();

  wipe(storage, 'demo');
  clock.setWall(clock.wall - 2 * HOUR);   // le jeton est désormais « dans le futur »

  const demo2 = reopen(storage, clock);
  const r = demo2.evaluate();
  assert.equal(r.status, STATUS.DEMO_EXPIRED);
  assert.ok(r.anomalies.some(a => a.kind === 'clock_backwards'));
});

test('un jeton antérieur restauré après coup fait primer sa date', () => {
  const storage = memoryStorage();
  const clock = fakeClock();

  // Essai lancé, puis état ET jeton retirés des dépôts synchrones —
  // comme si le miroir IndexedDB n'avait pas encore été relu.
  const first = new DemoEngine({ storage, identity: IDENTITY, clock: clock.guard });
  first.start();
  first.flush();
  const jetonSauvegardé = storage.backends[0].get('averi.lic.v1.trial');
  wipe(storage, 'demo');
  wipe(storage, 'trial');

  // L'utilisateur relance un essai pendant cette fenêtre.
  clock.advance(50 * MINUTE);
  clock.restartSession();
  const second = new DemoEngine({ storage, identity: IDENTITY, clock: clock.guard });
  assert.equal(second.start().status, STATUS.DEMO_ACTIVE);
  assert.ok(second.evaluate().remainingMs > 55 * MINUTE, 'essai neuf, à tort');

  // L'hydratation restaure le jeton d'origine : la réconciliation tranche.
  // 50 minutes se sont écoulées depuis son émission, il en reste donc 10 —
  // ni l'heure pleine du tricheur, ni une confiscation arbitraire.
  for (const b of storage.backends) b.set('averi.lic.v1.trial', jetonSauvegardé);
  const r = second.reconcile();
  assert.equal(r.status, STATUS.DEMO_ACTIVE);
  assert.equal(Math.round(r.remainingMs / MINUTE), 10);
  assert.ok(r.anomalies.some(a => a.kind === 'trial_reconciled'));
});

test('un jeton antérieur de plus d’une heure ferme l’essai relancé', () => {
  const storage = memoryStorage();
  const clock = fakeClock();
  const first = new DemoEngine({ storage, identity: IDENTITY, clock: clock.guard });
  first.start();
  first.flush();
  const jeton = storage.backends[0].get('averi.lic.v1.trial');
  wipe(storage, 'demo');
  wipe(storage, 'trial');

  clock.advance(3 * HOUR);
  clock.restartSession();
  const second = new DemoEngine({ storage, identity: IDENTITY, clock: clock.guard });
  assert.equal(second.start().status, STATUS.DEMO_ACTIVE, 'essai neuf, à tort');

  for (const b of storage.backends) b.set('averi.lic.v1.trial', jeton);
  assert.equal(second.reconcile().status, STATUS.DEMO_EXPIRED);
});

test('la réconciliation ne touche à rien quand le jeton concorde', () => {
  const { demo, clock } = makeDemo();
  demo.start();
  clock.advance(20 * MINUTE);
  const avant = demo.evaluate().remainingMs;
  assert.equal(demo.reconcile(), null, 'aucun ajustement nécessaire');
  assert.equal(Math.round(demo.evaluate().remainingMs / MINUTE), Math.round(avant / MINUTE));
});

test('LIMITE ASSUMÉE : effacer état ET jeton rouvre un essai', () => {
  const storage = memoryStorage();
  const clock = fakeClock();
  const demo = new DemoEngine({ storage, identity: IDENTITY, clock: clock.guard });
  demo.start();
  clock.advance(40 * MINUTE);
  demo.flush();

  wipe(storage, 'demo');
  wipe(storage, 'trial');

  // Documenté dans docs/licensing/security.md : un utilisateur qui vide
  // entièrement son stockage retrouve un essai. Aucun dispositif local ne
  // peut l'en empêcher — seul un serveur le pourrait.
  const demo2 = reopen(storage, clock);
  assert.equal(demo2.isAvailable(), true);
});

test('la remise à zéro autorisée efface aussi le jeton d’essai', () => {
  const { demo, storage } = makeDemo();
  demo.start();
  assert.ok(storage.loadTrialToken());
  demo.reset('test', DemoEngine.RESET_AUTHORIZATION);
  assert.equal(storage.loadTrialToken(), null);
});

test('trialToken() décrit le jeton pour la console privée', () => {
  const { demo } = makeDemo();
  assert.equal(demo.trialToken(), null);
  demo.start();
  const t = demo.trialToken();
  assert.equal(t.installId, IDENTITY.installId);
  assert.equal(t.matchesInstall, true);
  assert.equal(t.tampered, false);
  assert.equal(t.durationMs, HOUR);
});

test('la remise à zéro exige une autorisation explicite', () => {
  const { demo, storage, clock } = makeDemo();
  demo.start();
  clock.advance(HOUR);
  assert.equal(demo.evaluate().status, STATUS.DEMO_EXPIRED);

  // Un appel nu — depuis la console du navigateur, par exemple — échoue.
  assert.throws(() => demo.reset('tentative'), /autorisation requise/);
  assert.equal(demo.evaluate().status, STATUS.DEMO_EXPIRED);

  demo.reset('test', DemoEngine.RESET_AUTHORIZATION);
  const demo2 = reopen(storage, clock);
  assert.equal(demo2.evaluate().status, STATUS.DEMO_AVAILABLE);
});

test('les redémarrages répétés n’accumulent pas de temps fantôme', () => {
  const storage = memoryStorage();
  const clock = fakeClock();
  let demo = new DemoEngine({ storage, identity: IDENTITY, clock: clock.guard });
  demo.start();
  for (let i = 0; i < 10; i++) {
    clock.advance(MINUTE);
    demo.flush();
    demo = reopen(storage, clock);
    demo.evaluate();
  }
  const r = demo.evaluate();
  assert.equal(r.status, STATUS.DEMO_ACTIVE);
  assert.equal(Math.round(r.remainingMs / MINUTE), 50);
});
