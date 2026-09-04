import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { installDom } from './dom-stub.mjs';
import { memoryStorage, fakeClock, testKeyPair, issueTestLicense } from './helpers.mjs';

const KP = testKeyPair();
let dom, ConsoleApp, LicenseFacade, PRIVATE_PLAN_ID;

beforeEach(async () => {
  dom = installDom();
  ({ ConsoleApp } = await import('../src/ui/console-app.js'));
  ({ LicenseFacade } = await import('../src/licensing/facade.js'));
  ({ PRIVATE_PLAN_ID } = await import('../src/licensing/config.js'));
});
afterEach(() => dom.cleanup());

function make() {
  const clock = fakeClock();
  const facade = new LicenseFacade({
    storage: memoryStorage('console-install'), clock: clock.guard, trustedKeys: KP.trustedKeys
  });
  const root = dom.document.createElement('div');
  root.id = 'console-root';
  dom.document.body.appendChild(root);
  const app = new ConsoleApp({ facade, root });
  return { facade, app, root, clock };
}

const navButtons = (root) =>
  root.findAll(n => n.tagName === 'BUTTON' && n.parentNode && n.parentNode.className === 'cs-nav');
const tabNamed = (root, label) => navButtons(root).find(b => b.textContent === label);

test('sans licence : la console reste verrouillée', () => {
  const { app, root } = make();
  app.render();
  assert.match(root.textContent, /Accès réservé/);
  assert.equal(navButtons(root).length, 0);
});

test('licence publique active : la console reste verrouillée et le dit', () => {
  const { app, root, facade } = make();
  facade.activateLicense(issueTestLicense(KP, { plan: 'plan_2000' }).token);
  app.render();
  assert.match(root.textContent, /Accès réservé/);
  assert.match(root.textContent, /licence publique est active/);
});

test('démonstration en cours : la console reste verrouillée', () => {
  const { app, root, facade } = make();
  facade.startDemo();
  app.render();
  assert.match(root.textContent, /Accès réservé/);
});

test('le verrou affiche l’empreinte de l’appareil pour le support', () => {
  const { app, root, facade } = make();
  app.render();
  assert.ok(root.textContent.includes(facade.identity.fingerprint));
  assert.ok(root.textContent.includes(facade.identity.deviceCode));
});

test('un jeton refusé affiche son motif et conserve la saisie', () => {
  // Régression : `activateLicense` émet un changement d'état auquel la
  // console est abonnée, donc l'écran est reconstruit pendant le clic.
  // Le message doit survivre à ce re-rendu, et la saisie avec lui.
  const { app, root } = make();
  app.render();
  const ta = root.find(n => n.tagName === 'TEXTAREA');
  ta.value = 'AVR1.pasunelicence.dutout';
  root.find(n => n.tagName === 'BUTTON' && n.textContent === 'Ouvrir la console').click();

  assert.match(root.textContent, /LICENSE_/, 'motif du refus affiché');
  assert.match(root.textContent, /Accès réservé/, 'le verrou reste en place');
  const apres = root.find(n => n.tagName === 'TEXTAREA');
  assert.equal(apres.value, 'AVR1.pasunelicence.dutout', 'saisie conservée');
});

test('un champ vide est signalé sans appeler le moteur', () => {
  const { app, root } = make();
  app.render();
  root.find(n => n.tagName === 'BUTTON' && n.textContent === 'Ouvrir la console').click();
  assert.match(root.textContent, /Collez une licence privée/);
});

test('une licence privée sans permission de console est expliquée', () => {
  const { app, root } = make();
  app.render();
  root.find(n => n.tagName === 'TEXTAREA').value = issueTestLicense(KP, {
    type: 'private', plan: PRIVATE_PLAN_ID, permissions: ['testing']
  }).token;
  root.find(n => n.tagName === 'BUTTON' && n.textContent === 'Ouvrir la console').click();

  assert.match(root.textContent, /sans permission de console/);
  assert.match(root.textContent, /admin/, 'les permissions requises sont nommées');
});

test('le verrou indique la commande d’émission d’une licence privée', () => {
  const { app, root } = make();
  app.render();
  assert.match(root.textContent, /cli\.mjs generate/);
  assert.match(root.textContent, /--type private/);
});

test('coller une licence privée depuis le verrou ouvre la console', () => {
  const { app, root, facade } = make();
  app.render();
  const ta = root.find(n => n.tagName === 'TEXTAREA');
  ta.value = issueTestLicense(KP, {
    type: 'private', plan: PRIVATE_PLAN_ID, permissions: ['admin', 'diagnostics']
  }).token;
  root.find(n => n.tagName === 'BUTTON' && n.textContent === 'Ouvrir la console').click();

  assert.equal(facade.canOpenConsole(), true);
  assert.match(root.textContent, /Averi License Console/);
  assert.ok(tabNamed(root, 'Vue d’ensemble'));
});

test('les onglets suivent strictement les permissions de la licence', () => {
  const { app, root, facade } = make();
  facade.activateLicense(issueTestLicense(KP, {
    type: 'private', plan: PRIVATE_PLAN_ID, permissions: ['support']
  }).token);
  app.render();

  assert.equal(tabNamed(root, 'Licences').disabled, false);
  assert.equal(tabNamed(root, 'Activations').disabled, false);
  assert.equal(tabNamed(root, 'Préparer une licence').disabled, true, 'support ne prépare pas d’émission');
  assert.equal(tabNamed(root, 'Révocations').disabled, true);
  assert.equal(tabNamed(root, 'Configuration').disabled, true);
});

test('une licence admin ouvre tous les onglets attendus', () => {
  const { app, root, facade } = make();
  facade.activateLicense(issueTestLicense(KP, {
    type: 'private', plan: PRIVATE_PLAN_ID, permissions: ['admin']
  }).token);
  app.render();
  for (const label of ['Vue d’ensemble', 'Licences', 'Activations', 'Appareil',
                       'Préparer une licence', 'Révocations', 'Journal',
                       'Diagnostic', 'Configuration']) {
    const b = tabNamed(root, label);
    assert.ok(b, 'onglet ' + label + ' présent');
    assert.equal(b.disabled, false, 'onglet ' + label + ' actif');
  }
});

function openAdmin(perms = ['admin', 'diagnostics', 'testing', 'internal_tools']) {
  const ctx = make();
  ctx.facade.activateLicense(issueTestLicense(KP, {
    type: 'private', plan: PRIVATE_PLAN_ID, permissions: perms
  }).token);
  ctx.app.render();
  return ctx;
}

test('l’onglet Generate produit une commande CLI, jamais une licence', () => {
  const { app, root } = openAdmin();
  tabNamed(root, 'Préparer une licence').click();

  const out = root.find(n => n.className === 'cs-out');
  assert.match(out.textContent, /tools\/license-generator\/cli\.mjs generate/);
  assert.match(out.textContent, /--type public/);
  assert.match(out.textContent, /--plan plan_1000/);

  // Rien qui ressemble à un jeton signé ne doit sortir de la console.
  assert.equal(/AVR1\.[A-Za-z0-9_-]{40,}/.test(root.textContent), false);
  assert.match(root.textContent, /ne peut pas.{0,20}fabriquer de licence/s);
});

test('Generate sait pré-remplir l’empreinte de l’appareil courant', () => {
  const { app, root, facade } = openAdmin();
  tabNamed(root, 'Préparer une licence').click();
  root.find(n => n.tagName === 'BUTTON' && n.textContent === 'Lier à cet appareil').click();
  const out = root.find(n => n.className === 'cs-out');
  assert.ok(out.textContent.includes(facade.identity.fingerprint));
});

test('l’onglet Licenses décrit la licence en langage clair', () => {
  const { app, root } = openAdmin();
  tabNamed(root, 'Licences').click();
  const t = root.textContent;

  // Chaque donnée porte un libellé compréhensible…
  for (const libelle of ['Offre', 'Famille', 'Titulaire', 'Émise le',
                         'Utilisable à partir du', 'Échéance', 'Liée à cet appareil',
                         'Appareils déclarés']) {
    assert.ok(t.includes(libelle), 'libellé manquant : ' + libelle);
  }
  // …et son explication.
  assert.match(t, /Réservée à l’équipe/);
  assert.match(t, /Au-delà, l’accès se referme/);
});

test('les champs bruts restent accessibles, repliés', () => {
  const { app, root } = openAdmin();
  tabNamed(root, 'Licences').click();

  const details = root.findAll(n => n.tagName === 'DETAILS');
  assert.ok(details.length, 'au moins un bloc dépliable');
  const brut = details.map(d => d.textContent).join(' ');
  assert.match(brut, /license_id/);
  assert.match(brut, /nbf \(not_before\)/);
  assert.match(brut, /dev\.m \(device_mode\)/);
  assert.match(brut, /kid \(signing key\)/);
});

test('l’onglet Licenses vérifie un jeton sans l’installer', () => {
  const { app, root, facade } = openAdmin();
  const avant = facade.getStatus().license.id;
  tabNamed(root, 'Licences').click();

  const areas = root.findAll(n => n.tagName === 'TEXTAREA');
  areas[areas.length - 1].value = issueTestLicense(KP, { plan: 'plan_2000' }).token;
  root.find(n => n.tagName === 'BUTTON' && n.textContent === 'Vérifier').click();

  const outs = root.findAll(n => n.className === 'cs-out');
  const txt = outs[outs.length - 1].textContent;
  assert.match(txt, /status\s+LICENSE_ACTIVE/);
  assert.match(txt, /plan_id\s+plan_2000/);
  assert.equal(facade.getStatus().license.id, avant, 'rien n’a été installé');
});

test('l’onglet Licenses ajoute une licence au trousseau', () => {
  const { app, root, facade } = openAdmin();
  tabNamed(root, 'Licences').click();
  const areas = root.findAll(n => n.tagName === 'TEXTAREA');
  areas[areas.length - 1].value = issueTestLicense(KP, { plan: 'plan_2000' }).token;
  root.find(n => n.tagName === 'BUTTON' && n.textContent === 'Ajouter et activer').click();

  assert.equal(facade.licenses().length, 2, 'la licence privée est conservée');
  assert.equal(facade.getStatus().plan.id, 'plan_2000');
});

test('le trousseau permet de revenir à la licence précédente', () => {
  const { app, root, facade } = openAdmin();
  const privee = facade.getStatus().license.id;

  // Bascule sur une licence publique : la console se verrouille aussitôt,
  // ce qui est le comportement attendu — une licence publique ne l'ouvre jamais.
  facade.activateLicense(issueTestLicense(KP, { plan: 'plan_2000' }).token);
  app.render();
  assert.equal(facade.canOpenConsole(), false);
  assert.match(root.textContent, /Accès réservé/);
  assert.equal(facade.licenses().length, 2, 'la licence privée reste mémorisée');

  // Retour à la licence privée : la console se rouvre, sans recoller de code.
  facade.switchLicense(privee);
  app.render();
  assert.equal(facade.canOpenConsole(), true);
  assert.ok(tabNamed(root, 'Licences'), 'les onglets sont revenus');

  tabNamed(root, 'Licences').click();
  const lignes = root.findAll(n => n.tagName === 'TR');
  assert.ok(lignes.length >= 3, 'les deux licences sont listées');
  assert.match(root.textContent, /Averi Duo Infini/, 'la publique figure au trousseau');
});

test('l’onglet Revocations dit la vérité sur la portée locale', () => {
  const { app, root, facade } = openAdmin();
  tabNamed(root, 'Révocations').click();
  assert.match(root.textContent, /une révocation ne voyage pas/);

  const inputs = root.findAll(n => n.tagName === 'INPUT');
  inputs[0].value = 'AVR-ABCDEFGH';
  inputs[1].value = 'remboursement';
  root.find(n => n.tagName === 'BUTTON' && n.textContent === 'Révoquer localement').click();
  assert.deepEqual(facade.revocations.list().local, ['AVR-ABCDEFGH']);
});

test('l’onglet Diagnostics expose stockage, horloge et clés de confiance', () => {
  const { app, root } = openAdmin();
  tabNamed(root, 'Diagnostic').click();
  assert.match(root.textContent, /Clés de confiance/);
  assert.match(root.textContent, /Durée accordée/);
  assert.match(root.textContent, /Ed25519/);
  assert.match(root.textContent, /Où les données sont conservées/);
  assert.match(root.textContent, /Jeton d’essai/);
});

test('la remise à zéro de la démo n’apparaît qu’avec la permission testing', () => {
  const avec = openAdmin(['admin', 'diagnostics', 'testing']);
  tabNamed(avec.root, 'Diagnostic').click();
  assert.ok(avec.root.find(n => n.tagName === 'BUTTON' && n.textContent === 'Rouvrir un essai d’une heure'));
  avec.cleanup && avec.cleanup();

  const sans = openAdmin(['admin', 'diagnostics']);
  tabNamed(sans.root, 'Diagnostic').click();
  assert.equal(sans.root.find(n => n.tagName === 'BUTTON' && n.textContent === 'Rouvrir un essai d’une heure'), null);
});

test('l’onglet Settings reflète les plans et prix configurés', () => {
  const { app, root } = openAdmin();
  tabNamed(root, 'Configuration').click();
  assert.match(root.textContent, /Averi Duo/);
  assert.match(root.textContent, /1\s?000 FCFA/);
  assert.match(root.textContent, /Averi Duo Infini/);
  assert.match(root.textContent, /2\s?000 FCFA/);
  assert.match(root.textContent, /Ce qui n’est pas inclus/);
  assert.match(root.textContent, /ne sont pas modifiables depuis la console/);
});

/* ---- Lisibilité : la console doit s'expliquer d'elle-même ---- */

test('chaque onglet annonce à quoi il sert', () => {
  const { app, root } = openAdmin();
  const attendus = {
    'Vue d’ensemble': /l’application est-elle débloquée/,
    'Licences': /Une seule est active à la fois/,
    'Activations': /posée sur cette installation/,
    'Appareil': /pas une empreinte matérielle|aléatoire/,
    'Préparer une licence': /ne peut pas.{0,20}fabriquer/s,
    'Révocations': /une révocation ne voyage pas/,
    'Journal': /aucune donnée personnelle/,
    'Diagnostic': /quand quelque chose ne se comporte pas comme prévu/,
    'Configuration': /un seul fichier|seul fichier/
  };
  for (const [onglet, motif] of Object.entries(attendus)) {
    tabNamed(root, onglet).click();
    const intro = root.find(n => n.className === 'cs-intro');
    assert.ok(intro, 'introduction absente sur ' + onglet);
    assert.match(intro.textContent, motif, 'introduction inadaptée sur ' + onglet);
  }
});

test('les champs techniques ne sont jamais affichés nus', () => {
  const { app, root } = openAdmin();
  // Ces noms de champs viennent du format de licence. Ils ont leur place
  // dans les blocs dépliables, jamais comme seule étiquette visible.
  const bruts = ['nbf', 'dlm', 'iat', 'kid', 'ftr', 'prm', 'dev.m', 'install_id', 'token_digest'];

  for (const onglet of ['Vue d’ensemble', 'Licences', 'Activations', 'Appareil', 'Diagnostic']) {
    tabNamed(root, onglet).click();
    const visible = root.findAll(n => n.className === 'cs-fact-k').map(n => n.textContent);
    for (const b of bruts) {
      assert.equal(visible.includes(b), false, onglet + ' affiche « ' + b + ' » comme libellé');
    }
    // Chaque fait porte une explication.
    const faits = root.findAll(n => n.className === 'cs-fact');
    for (const f of faits) {
      assert.ok(f.findAll(n => n.className === 'cs-fact-n').length,
        onglet + ' : un fait sans explication — ' +
        f.find(n => n.className === 'cs-fact-k').textContent);
    }
  }
});

test('les dates sont accompagnées de leur écart au présent', () => {
  const { app, root } = openAdmin();
  tabNamed(root, 'Licences').click();
  const rel = root.findAll(n => n.className === 'cs-rel').map(n => n.textContent);
  assert.ok(rel.some(t => /dans |il y a /.test(t)),
    'aucun écart relatif affiché : ' + rel.join(' | '));
});

test('les anomalies sont traduites, pas affichées en code', () => {
  const { app, root, facade } = openAdmin();
  facade.startDemo();
  facade.demo._state.anomalies.push({ kind: 'clock_backwards', at: Date.now() });
  facade.demo.flush();
  app.render();
  tabNamed(root, 'Diagnostic').click();

  assert.match(root.textContent, /La date de l’appareil a reculé/);
  assert.match(root.textContent, /Aucun temps de démonstration n’a été rendu/);
});

test('le journal traduit les événements', () => {
  const { app, root, facade } = openAdmin();
  facade.startDemo();
  app.render();
  tabNamed(root, 'Journal').click();
  assert.match(root.textContent, /Licence activée/);
  assert.match(root.textContent, /Démonstration lancée/);
});

test('le pied de la console nomme le titulaire et ses permissions en clair', () => {
  const ctx = make();
  ctx.facade.activateLicense(issueTestLicense(KP, {
    type: 'private', plan: PRIVATE_PLAN_ID, permissions: ['admin'],
    metadata: { holder: 'Kerian' }
  }).token);
  ctx.app.render();
  const foot = ctx.root.find(n => n.className === 'cs-foot');
  assert.match(foot.textContent, /Kerian/);
  assert.match(foot.textContent, /Administration/, 'permission en clair, pas « admin »');
});

test('la console n’expose aucune primitive de signature', () => {
  const { app } = openAdmin();
  const noms = [];
  let o = app;
  while (o && o !== Object.prototype) {
    noms.push(...Object.getOwnPropertyNames(o));
    o = Object.getPrototypeOf(o);
  }
  assert.equal(noms.some(n => /sign|issueLicense|mint|forge(?!t)/i.test(n)), false, noms.join(','));
});

test('l’interface privée n’emprunte rien à l’habillage public', () => {
  const { root } = openAdmin();
  // Aucune classe de l'UI publique (lic-*) ni du jeu (glass, btn) ici.
  const classes = Array.from(root.walk()).map(n => n.className).join(' ');
  assert.equal(/\blic-/.test(classes), false, classes.slice(0, 200));
  assert.equal(/\bglass\b/.test(classes), false);
  assert.ok(/\bcs-/.test(classes));
});
