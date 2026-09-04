import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LicenseFacade } from '../src/licensing/facade.js';
import { STATUS } from '../src/licensing/status.js';
import { PLANS, PRIVATE_PLAN_ID, SUPPORT } from '../src/licensing/config.js';
import { testKeyPair, issueTestLicense, memoryStorage, freshStorage, reopenStorage,
         fakeClock, HOUR, MINUTE } from './helpers.mjs';

const KP = testKeyPair();

function makeFacade(opts = {}) {
  const storage = opts.storage || memoryStorage('facade-install');
  const clock = opts.clock || fakeClock();
  const facade = new LicenseFacade({
    storage,
    clock: clock.guard,
    trustedKeys: KP.trustedKeys
  });
  return { facade, storage, clock };
}

test('sans licence ni démonstration : tout est verrouillé, la démo est proposée', () => {
  const { facade } = makeFacade();
  const s = facade.getStatus();
  assert.equal(s.state, STATUS.DEMO_AVAILABLE);
  assert.equal(s.unlocked, false);
  assert.equal(s.canStartDemo, true);
  assert.equal(s.entitlements.unlocked, false);
  assert.equal(facade.canPlay('truth'), false);
  assert.equal(facade.can('chat.text'), false);
  assert.match(s.deviceCode, /^AVR-DEV-/);
});

test('démonstration lancée : toutes les manches sont ouvertes', () => {
  const { facade } = makeFacade();
  facade.startDemo();
  const s = facade.getStatus();
  assert.equal(s.state, STATUS.DEMO_ACTIVE);
  assert.equal(s.unlocked, true);
  for (const g of ['truth', 'never', 'likely', 'compat', 'c4', 'memory']) {
    assert.equal(facade.canPlay(g), true, g);
  }
  assert.match(s.remainingLabel, /min|h/);
});

test('démonstration expirée : tout se referme', () => {
  const { facade, clock } = makeFacade();
  facade.startDemo();
  clock.advance(HOUR + MINUTE);
  const s = facade.getStatus();
  assert.equal(s.state, STATUS.DEMO_EXPIRED);
  assert.equal(s.unlocked, false);
  assert.equal(facade.canPlay('truth'), false);
  assert.equal(s.message.title, 'Votre période de démonstration est terminée');
});

test('licence plan_1000 : Puissance 4 et Memory restent fermés', () => {
  const { facade } = makeFacade();
  const { token } = issueTestLicense(KP, { plan: 'plan_1000' });
  assert.equal(facade.activateLicense(token).ok, true);

  const s = facade.getStatus();
  assert.equal(s.state, STATUS.LICENSE_ACTIVE);
  assert.equal(s.plan.id, 'plan_1000');
  assert.equal(facade.canPlay('truth'), true);
  assert.equal(facade.canPlay('compat'), true);
  assert.equal(facade.canPlay('c4'), false);
  assert.equal(facade.canPlay('memory'), false);
  assert.equal(facade.can('cards.premium'), false);
});

test('licence plan_2000 : tout est ouvert', () => {
  const { facade } = makeFacade();
  facade.activateLicense(issueTestLicense(KP, { plan: 'plan_2000' }).token);
  for (const g of ['truth', 'never', 'likely', 'compat', 'c4', 'memory']) {
    assert.equal(facade.canPlay(g), true, g);
  }
  assert.equal(facade.can('cards.premium'), true);
});

test('la licence prime sur la démonstration en cours', () => {
  const { facade, clock } = makeFacade();
  facade.startDemo();
  clock.advance(30 * MINUTE);
  facade.activateLicense(issueTestLicense(KP, { plan: 'plan_2000' }).token);
  assert.equal(facade.getStatus().state, STATUS.LICENSE_ACTIVE);
});

test('licence expirée alors que la démonstration court encore : la démo prend le relais', () => {
  const { facade, clock } = makeFacade();
  facade.startDemo();
  const past = Math.floor(clock.wall / 1000) - 400 * 86400;
  const { token } = issueTestLicense(KP, { issuedAt: past, notBefore: past, expiresAt: past + 86400 });
  facade.activation.storage.saveLicense(token, {});
  const s = facade.getStatus();
  assert.equal(s.state, STATUS.DEMO_ACTIVE);
  assert.equal(s.licenseIssue, STATUS.LICENSE_EXPIRED);
});

test('licence expirée et démonstration consommée : état LICENSE_EXPIRED', () => {
  const { facade, clock } = makeFacade();
  facade.startDemo();
  clock.advance(2 * HOUR);
  const past = Math.floor(clock.wall / 1000) - 400 * 86400;
  facade.activation.storage.saveLicense(
    issueTestLicense(KP, { issuedAt: past, notBefore: past, expiresAt: past + 86400 }).token, {});
  assert.equal(facade.getStatus().state, STATUS.LICENSE_EXPIRED);
});

test('licence privée : console accessible, permissions exposées', () => {
  const { facade } = makeFacade();
  const { token } = issueTestLicense(KP, {
    type: 'private', plan: PRIVATE_PLAN_ID, permissions: ['admin', 'diagnostics', 'testing']
  });
  assert.equal(facade.activateLicense(token).ok, true);
  const s = facade.getStatus();
  assert.equal(s.isPrivate, true);
  assert.equal(facade.canOpenConsole(), true);
  assert.equal(facade.hasPermission('admin'), true);
  assert.equal(facade.hasPermission('advanced_settings'), false);
});

test('licence publique : console inaccessible', () => {
  const { facade } = makeFacade();
  facade.activateLicense(issueTestLicense(KP, { plan: 'plan_2000' }).token);
  assert.equal(facade.canOpenConsole(), false);
  assert.equal(facade.hasPermission('admin'), false);
});

test('démonstration active : console inaccessible', () => {
  const { facade } = makeFacade();
  facade.startDemo();
  assert.equal(facade.canOpenConsole(), false);
});

test('retirer la licence ramène à l’état démonstration', () => {
  const { facade } = makeFacade();
  facade.activateLicense(issueTestLicense(KP).token);
  facade.removeLicense();
  assert.equal(facade.getStatus().state, STATUS.DEMO_AVAILABLE);
});

test('un jeton refusé produit un message sans jargon cryptographique', () => {
  const { facade } = makeFacade();
  const r = facade.activateLicense('AVR1.nimportequoi.nimportequoi');
  assert.equal(r.ok, false);
  assert.equal(/Ed25519|signature|hash|crypt/i.test(r.message.title + r.message.body), false,
    r.message.title + ' / ' + r.message.body);
});

test('les abonnés sont notifiés à chaque changement', () => {
  const { facade } = makeFacade();
  const vus = [];
  const off = facade.subscribe(s => vus.push(s.state));
  facade.startDemo();
  facade.activateLicense(issueTestLicense(KP).token);
  off();
  facade.removeLicense();
  assert.deepEqual(vus, [STATUS.DEMO_AVAILABLE, STATUS.DEMO_ACTIVE, STATUS.LICENSE_ACTIVE]);
});

test('les plans publics exposent les prix attendus', () => {
  const { facade } = makeFacade();
  const plans = facade.publicPlans();
  assert.equal(plans.length, 2);
  assert.equal(plans[0].price, 1000);
  assert.equal(plans[1].price, 2000);
  assert.match(plans[0].priceLabel, /1\s?000 FCFA/);
  assert.match(plans[1].priceLabel, /2\s?000 FCFA/);
  assert.equal(plans[0].price, PLANS.plan_1000.price);
});

test('le lien de support contient le numéro configuré et le code d’appareil', () => {
  const { facade } = makeFacade();
  const link = facade.supportLink('plan_2000');
  assert.ok(link.startsWith('https://wa.me/' + SUPPORT.whatsapp));
  assert.ok(decodeURIComponent(link).includes(facade.identity.deviceCode));
  assert.ok(decodeURIComponent(link).includes(PLANS.plan_2000.name));
});

test('l’intersection des droits reflète le plan le plus faible des deux joueurs', () => {
  const { facade } = makeFacade();
  facade.activateLicense(issueTestLicense(KP, { plan: 'plan_2000' }).token);
  const commun = facade.sharedFeatures(PLANS.plan_1000.features);
  assert.equal(commun.includes('game.c4'), false);
  assert.equal(commun.includes('game.truth'), true);
});

test('les diagnostics rassemblent identité, stockage, démo et validateurs', () => {
  const { facade } = makeFacade();
  facade.startDemo();
  const d = facade.diagnostics();
  assert.equal(d.product, 'averi');
  assert.equal(d.demo.durationMs, HOUR);
  assert.ok(d.identity.deviceCode);
  assert.equal(d.validators.active, 'hybrid');
  assert.equal(d.validators.remoteConfigured, false);
  assert.ok(Array.isArray(d.storage.backends));
});

test('un rechargement de page conserve l’installation, la démo et la licence', () => {
  const clock = fakeClock();
  const storage = freshStorage();

  const first = new LicenseFacade({ storage, clock: clock.guard, trustedKeys: KP.trustedKeys });
  const installId = first.identity.installId;
  const deviceCode = first.identity.deviceCode;
  first.startDemo();
  clock.advance(20 * MINUTE);
  first.flush();

  // Rechargement : nouvelle façade, nouveau stockage, mêmes dépôts.
  clock.restartSession();
  const second = new LicenseFacade({
    storage: reopenStorage(storage), clock: clock.guard, trustedKeys: KP.trustedKeys
  });

  assert.equal(second.identity.installId, installId, 'même installation');
  assert.equal(second.identity.deviceCode, deviceCode, 'même code d’appareil');
  const s = second.getStatus();
  assert.equal(s.state, STATUS.DEMO_ACTIVE);
  assert.equal(Math.round(s.demo.remainingMs / MINUTE), 40, 'temps consommé conservé');
});

test('une licence liée à l’appareil survit à un rechargement', () => {
  const clock = fakeClock();
  const storage = freshStorage();
  const first = new LicenseFacade({ storage, clock: clock.guard, trustedKeys: KP.trustedKeys });
  const { token } = issueTestLicense(KP, {
    plan: 'plan_2000', deviceFingerprint: first.identity.fingerprint
  });
  assert.equal(first.activateLicense(token).ok, true);

  clock.restartSession();
  const second = new LicenseFacade({
    storage: reopenStorage(storage), clock: clock.guard, trustedKeys: KP.trustedKeys
  });
  assert.equal(second.getStatus().state, STATUS.LICENSE_ACTIVE);
  assert.equal(second.canPlay('c4'), true);
});

/* ---- Trousseau : plusieurs licences sans interférence ---- */

test('plusieurs licences coexistent, une seule est active', () => {
  const { facade } = makeFacade();
  const a = issueTestLicense(KP, { plan: 'plan_1000', metadata: { holder: 'Awa' } });
  const b = issueTestLicense(KP, { plan: 'plan_2000', metadata: { holder: 'Bila' } });

  facade.activateLicense(a.token);
  facade.activateLicense(b.token);

  const list = facade.licenses();
  assert.equal(list.length, 2, 'la première licence n’est pas perdue');
  assert.equal(list.filter(l => l.active).length, 1, 'une seule active');
  assert.equal(list[0].id, b.payload.id);
  assert.equal(list[0].active, true);
  assert.equal(facade.getStatus().license.id, b.payload.id);
});

test('chaque licence du trousseau porte son propre verdict', () => {
  const { facade, clock } = makeFacade();
  const valide = issueTestLicense(KP, { plan: 'plan_2000' });
  const past = Math.floor(clock.wall / 1000) - 400 * 86400;
  const expiree = issueTestLicense(KP, { issuedAt: past, notBefore: past, expiresAt: past + 86400 });

  facade.activateLicense(valide.token);
  // La licence expirée est refusée à l'activation : elle n'entre pas au trousseau.
  assert.equal(facade.activateLicense(expiree.token).ok, false);

  const list = facade.licenses();
  assert.equal(list.length, 1);
  assert.equal(list[0].status, STATUS.LICENSE_ACTIVE);
  assert.equal(facade.getStatus().license.id, valide.payload.id, 'l’active n’a pas bougé');
});

test('basculer d’une licence à l’autre change les droits, sans perte', () => {
  const { facade } = makeFacade();
  const duo = issueTestLicense(KP, { plan: 'plan_1000' });
  const infini = issueTestLicense(KP, { plan: 'plan_2000' });

  facade.activateLicense(duo.token);
  facade.activateLicense(infini.token);
  assert.equal(facade.canPlay('c4'), true);

  const r = facade.switchLicense(duo.payload.id);
  assert.equal(r.ok, true);
  assert.equal(facade.getStatus().license.id, duo.payload.id);
  assert.equal(facade.canPlay('c4'), false, 'droits de plan_1000 appliqués');
  assert.equal(facade.licenses().length, 2, 'les deux restent mémorisées');

  facade.switchLicense(infini.payload.id);
  assert.equal(facade.canPlay('c4'), true, 'retour possible sans recoller le jeton');
});

test('une licence privée et une licence publique cohabitent sans se mélanger', () => {
  const { facade } = makeFacade();
  const pub = issueTestLicense(KP, { plan: 'plan_2000' });
  const priv = issueTestLicense(KP, {
    type: 'private', plan: PRIVATE_PLAN_ID, permissions: ['admin', 'diagnostics']
  });

  facade.activateLicense(pub.token);
  assert.equal(facade.canOpenConsole(), false);
  assert.equal(facade.hasPermission('admin'), false);

  facade.activateLicense(priv.token);
  assert.equal(facade.canOpenConsole(), true);
  assert.equal(facade.hasPermission('admin'), true);

  // Retour à la publique : les permissions privées ne fuient pas.
  facade.switchLicense(pub.payload.id);
  assert.equal(facade.canOpenConsole(), false);
  assert.equal(facade.hasPermission('admin'), false);
  assert.deepEqual(facade.entitlements().permissions, []);
});

test('basculer sur une licence devenue invalide la refuse au lieu de l’imposer', () => {
  const { facade } = makeFacade();
  const a = issueTestLicense(KP, { plan: 'plan_1000' });
  const b = issueTestLicense(KP, { plan: 'plan_2000' });
  facade.activateLicense(a.token);
  facade.activateLicense(b.token);

  // La licence A est révoquée entre-temps.
  facade.revocations.add(a.payload.id, 'remboursée');

  const r = facade.switchLicense(a.payload.id);
  assert.equal(r.ok, false);
  assert.equal(r.status, STATUS.LICENSE_REVOKED);
  assert.equal(facade.licenses().find(l => l.id === a.payload.id).status, STATUS.LICENSE_REVOKED);
});

test('oublier une licence active referme l’accès sans toucher aux autres', () => {
  const { facade } = makeFacade();
  const a = issueTestLicense(KP, { plan: 'plan_1000' });
  const b = issueTestLicense(KP, { plan: 'plan_2000' });
  facade.activateLicense(a.token);
  facade.activateLicense(b.token);

  facade.forgetLicense(b.payload.id);
  const list = facade.licenses();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, a.payload.id);
  assert.equal(list[0].active, false, 'aucune licence n’est active');
  assert.equal(facade.getStatus().state, STATUS.DEMO_AVAILABLE);
});

test('le trousseau est borné et garde les licences les plus récentes', () => {
  const { facade } = makeFacade();
  const ids = [];
  for (let i = 0; i < 11; i++) {
    const l = issueTestLicense(KP, { plan: 'plan_1000' });
    ids.push(l.payload.id);
    facade.activateLicense(l.token);
  }
  const list = facade.licenses();
  assert.ok(list.length <= 8, 'trousseau borné : ' + list.length);
  assert.ok(list.some(l => l.id === ids[ids.length - 1]), 'la dernière est conservée');
});

test('retirer la licence courante la retire aussi du trousseau', () => {
  const { facade } = makeFacade();
  facade.activateLicense(issueTestLicense(KP, { plan: 'plan_2000' }).token);
  facade.removeLicense();
  assert.deepEqual(facade.licenses(), []);
});

test('la façade n’expose aucun moyen de signer une licence', () => {
  const { facade } = makeFacade();
  const noms = [];
  let o = facade;
  while (o && o !== Object.prototype) {
    noms.push(...Object.getOwnPropertyNames(o));
    o = Object.getPrototypeOf(o);
  }
  // `forge(?!t)` : on cherche « forger une licence », pas `forgetLicense`.
  assert.equal(noms.some(n => /^(sign|issue|generate|mint|forge(?!t))/i.test(n)), false, noms.join(','));
});
