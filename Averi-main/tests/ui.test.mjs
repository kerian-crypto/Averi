import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { installDom } from './dom-stub.mjs';
import { memoryStorage, fakeClock, testKeyPair, issueTestLicense, HOUR, MINUTE } from './helpers.mjs';

const KP = testKeyPair();
let dom, PublicLicenseUI, LicenseFacade, STATUS;

beforeEach(async () => {
  dom = installDom();
  ({ PublicLicenseUI } = await import('../src/ui/public-gate.js'));
  ({ LicenseFacade } = await import('../src/licensing/facade.js'));
  ({ STATUS } = await import('../src/licensing/status.js'));
});
afterEach(() => dom.cleanup());

function make() {
  const clock = fakeClock();
  const facade = new LicenseFacade({
    storage: memoryStorage('ui-install'), clock: clock.guard, trustedKeys: KP.trustedKeys
  });
  const ui = new PublicLicenseUI({ facade });
  facade.subscribe(s => ui.update(s));
  return { facade, ui, clock };
}

const btn = (root, label) => root.find(n => n.tagName === 'BUTTON' && n.textContent === label);

test('la feuille de style n’est injectée qu’une fois', () => {
  const { facade } = make();
  new PublicLicenseUI({ facade });
  const styles = dom.document.head.findAll(n => n.tagName === 'STYLE');
  assert.equal(styles.length, 1);
});

test('le panneau d’accueil propose l’essai avant toute activation', () => {
  const { ui } = make();
  const panel = ui.createHomePanel();
  assert.match(panel.textContent, /Essayez Averi pendant une heure/);
  assert.ok(btn(panel, '▶ Démarrer l’heure d’essai'));
});

test('démarrer l’essai depuis le panneau bascule l’affichage', () => {
  const { ui, facade } = make();
  const panel = ui.createHomePanel();
  btn(panel, '▶ Démarrer l’heure d’essai').click();
  assert.equal(facade.getStatus().state, STATUS.DEMO_ACTIVE);
  assert.match(panel.textContent, /Démonstration en cours/);
  assert.match(panel.textContent, /Temps restant/);
});

test('le panneau affiche le compte à rebours puis l’avertissement', () => {
  const { ui, facade, clock } = make();
  const panel = ui.createHomePanel();
  facade.startDemo();

  clock.advance(18 * MINUTE);
  ui.update(facade.getStatus());
  assert.match(panel.textContent, /42 min/);

  clock.advance(34 * MINUTE);
  ui.update(facade.getStatus());
  assert.match(panel.textContent, /08 min/);
  assert.match(panel.textContent, /Pensez à choisir une licence/);
});

test('à l’expiration le panneau présente les deux offres', () => {
  const { ui, facade, clock } = make();
  const panel = ui.createHomePanel();
  facade.startDemo();
  clock.advance(HOUR + MINUTE);
  ui.update(facade.getStatus());

  assert.match(panel.textContent, /Votre période de démonstration est terminée/);
  // toLocaleString('fr-FR') sépare les milliers par une espace insécable.
  assert.match(panel.textContent, /Averi Duo\s·\s1\s?000 FCFA/);
  assert.match(panel.textContent, /Averi Duo Infini\s·\s2\s?000 FCFA/);
});

test('la pilule reflète l’état et vire à l’alerte sous 10 minutes', () => {
  const { ui, facade, clock } = make();
  const pill = ui.createPill();
  assert.match(pill.textContent, /Essayer 1 heure/);

  facade.startDemo();
  assert.match(pill.textContent, /Démo ·/);
  assert.equal(pill.classList.contains('warn'), false);

  clock.advance(55 * MINUTE);
  ui.update(facade.getStatus());
  assert.equal(pill.classList.contains('warn'), true);

  clock.advance(10 * MINUTE);
  ui.update(facade.getStatus());
  assert.equal(pill.classList.contains('locked'), true);
});

test('la modale des offres liste les deux plans et leurs prix', () => {
  const { ui } = make();
  ui.openPlans();
  const body = ui._body;
  assert.match(body.textContent, /Averi Duo/);
  assert.match(body.textContent, /1\s?000 FCFA/);
  assert.match(body.textContent, /2\s?000 FCFA/);
  assert.equal(ui._modal.hidden, false);
});

test('l’écran d’activation refuse un code vide puis un code invalide', () => {
  const { ui } = make();
  ui.openActivation();
  const body = ui._body;
  const champ = body.find(n => n.tagName === 'TEXTAREA');
  const activer = btn(body, 'Activer');

  activer.click();
  assert.match(body.textContent, /Collez d’abord votre code/);

  champ.value = 'AVR1.nimportequoi.nimportequoi';
  activer.click();
  assert.match(body.textContent, /n’est pas valide|incomplet/);
  assert.equal(/Ed25519|signature|hash/i.test(body.textContent), false, body.textContent);
});

test('un code valide active la licence et affiche le récapitulatif', () => {
  const { ui, facade } = make();
  ui.openActivation();
  const champ = ui._body.find(n => n.tagName === 'TEXTAREA');
  champ.value = issueTestLicense(KP, { plan: 'plan_2000' }).token;
  btn(ui._body, 'Activer').click();

  assert.equal(facade.getStatus().state, STATUS.LICENSE_ACTIVE);
  assert.match(ui._body.textContent, /Licence active/);
  assert.match(ui._body.textContent, /Averi Duo Infini/);
});

test('le code d’appareil est affiché et copiable', () => {
  const { ui, facade } = make();
  ui.openActivation();
  assert.ok(ui._body.textContent.includes(facade.identity.deviceCode));
  assert.ok(btn(ui._body, '📋 Copier'));
});

test('le parcours d’achat détaille les étapes du paiement manuel', () => {
  const { ui, facade } = make();
  ui.openCheckout(facade.publicPlans()[0]);
  const t = ui._body.textContent;
  assert.match(t, /WhatsApp/);
  assert.match(t, /Recevez votre code de licence/);
  assert.ok(t.includes(facade.identity.deviceCode));
});

test('appareil non autorisé : message dédié et code d’appareil proposé', () => {
  const { ui } = make();
  ui.openBlocked(STATUS.LICENSE_DEVICE_MISMATCH);
  assert.match(ui._body.textContent, /autre appareil/);
  assert.ok(btn(ui._body, '💬 Support'));
});

test('le bouton support ouvre le lien WhatsApp configuré', () => {
  const { ui } = make();
  ui.contactSupport('plan_1000');
  assert.equal(dom.window._opened, true);
});

test('aucun écran public ne laisse fuir de vocabulaire cryptographique', () => {
  const { ui, facade, clock } = make();
  const vus = [];
  const capture = () => vus.push(ui._body.textContent);

  ui.openPlans(); capture();
  ui.openCheckout(facade.publicPlans()[1]); capture();
  ui.openActivation(); capture();
  ui.openBlocked(STATUS.LICENSE_TAMPERED); capture();
  facade.startDemo();
  clock.advance(HOUR + MINUTE);
  ui.update(facade.getStatus());
  ui.openPlans('demo-expired'); capture();

  const interdit = /Ed25519|signature|SHA-?512|HMAC|sceau|payload|token|hash/i;
  for (const t of vus) assert.equal(interdit.test(t), false, t.slice(0, 160));
});
