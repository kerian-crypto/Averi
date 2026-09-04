/* ==========================================================
   AVERI — Point d'entrée du licensing côté application
   ----------------------------------------------------------
   Expose `window.AveriLicense`, la seule surface visible par le
   code de jeu d'index.html. Rien d'autre du système de licences
   n'est accessible depuis la page.
   ========================================================== */

import { LicenseFacade } from '../licensing/facade.js';
import { PublicLicenseUI } from './public-gate.js';
import { STATUS, isGranting } from '../licensing/status.js';
import { GAME_FEATURE_OF, FEATURES, DEMO_DURATION_MS } from '../licensing/config.js';
import { formatDuration } from '../licensing/clock.js';

let facade = null;
let ui = null;
let booted = false;

/**
 * Démarre le système de licences.
 *
 * Ne retourne NI la façade NI l'objet d'interface : `window.AveriLicense`
 * n'expose que des lectures et des ouvertures d'écran. Un accès direct
 * à la façade depuis la console du navigateur donnerait un chemin trivial
 * vers des méthodes internes comme la remise à zéro de la démonstration.
 *
 * @param {{onChange?:Function}} opts
 * @returns {{status:object}} état courant
 */
export function boot(opts) {
  opts = opts || {};
  if (booted) return { status: facade.getStatus() };

  facade = new LicenseFacade({});
  ui = new PublicLicenseUI({ facade });

  facade.subscribe((s) => {
    ui.update(s);
    if (opts.onChange) {
      try { opts.onChange(s); } catch (e) { console.warn('licence: onChange', e); }
    }
  });

  // Le compte à rebours de la démonstration rafraîchit l'affichage et
  // ferme l'accès à la seconde où l'heure est écoulée.
  const timer = facade.startTicker(1000);
  // Sous Node (tests d'intégration sur le livrable), un intervalle actif
  // empêcherait le processus de se terminer. `unref` n'existe pas dans un
  // navigateur : l'appel y est simplement sans effet.
  if (timer && typeof timer.unref === 'function') timer.unref();

  // Restauration depuis le miroir IndexedDB, puis réévaluation.
  facade.init().catch(() => {});

  window.addEventListener('beforeunload', () => facade.flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') facade.flush();
  });

  booted = true;
  return { status: facade.getStatus() };
}

/* ---------------------------------------------------------- */
/* API consommée par le code de jeu                            */
/* ---------------------------------------------------------- */

/** Une manche est-elle jouable ici ? */
export function canPlay(gameId) {
  return facade ? facade.canPlay(gameId) : false;
}

/** Une fonctionnalité est-elle ouverte ? */
export function can(feature) {
  return facade ? facade.can(feature) : false;
}

/** État courant, complet. */
export function status() {
  return facade ? facade.getStatus() : null;
}

/** L'accès aux fonctionnalités protégées est-il ouvert ? */
export function unlocked() {
  const s = status();
  return !!s && isGranting(s.state);
}

/** Features à annoncer au partenaire de jeu. */
export function wireFeatures() {
  return facade ? facade.entitlements().features : [];
}

/** Features communes aux deux joueurs. */
export function sharedFeatures(peerFeatures) {
  return facade ? facade.sharedFeatures(peerFeatures) : [];
}

/**
 * Ouvre l'écran de licence adapté à l'état courant.
 * Appelé quand l'utilisateur touche une fonctionnalité verrouillée.
 */
export function promptFor(feature) {
  if (!ui) return;
  const s = facade.getStatus();
  if (s.state === STATUS.DEMO_AVAILABLE) ui.openPlans();
  else if (s.state === STATUS.DEMO_EXPIRED) ui.openPlans('demo-expired');
  else if (isGranting(s.state)) ui.openPlans();
  else ui.openBlocked(s.state);
}

/** Libellé d'une feature, pour les messages de verrouillage. */
export function featureLabel(feature) {
  return FEATURES[feature] ? FEATURES[feature].label : feature;
}

export function featureOfGame(gameId) {
  return GAME_FEATURE_OF[gameId] || null;
}

/** Pilule d'état à insérer dans le HUD. */
export function createPill() {
  return ui ? ui.createPill() : document.createElement('span');
}

/** Panneau d'accueil. */
export function createHomePanel() {
  return ui ? ui.createHomePanel() : document.createElement('div');
}

export function openPlans(reason) { if (ui) ui.openPlans(reason); }
export function openActivation() { if (ui) ui.openActivation(); }
export function contactSupport(planId) { if (ui) ui.contactSupport(planId); }

/** Console privée accessible ? (utilisé pour afficher le lien) */
export function canOpenConsole() {
  return facade ? facade.canOpenConsole() : false;
}

export { STATUS, DEMO_DURATION_MS, formatDuration };
