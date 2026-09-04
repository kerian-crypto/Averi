/* ==========================================================
   AVERI LICENSING — DemoEngine (1 heure)
   ----------------------------------------------------------
   Le temps consommé n'est pas « maintenant moins le départ ».
   C'est le MAXIMUM de deux mesures indépendantes :

     A. l'écoulement mesuré sur le plus haut instant jamais
        observé (`highWaterWall`), qui ne redescend jamais ;
     B. le temps monotone réellement passé dans l'application,
        cumulé d'une session à l'autre (`consumedMs`).

   Reculer l'horloge n'agit ni sur A (le sommet est conservé)
   ni sur B (performance.now() est indépendant de l'horloge).
   Figer l'horloge n'agit pas sur B. Effacer le stockage est
   traité par SecureLicenseStorage (redondance) et laisse une
   trace : un enregistrement descellé ou un identifiant
   d'installation neuf alors qu'une démo existait.

   Limite assumée : un utilisateur qui contrôle entièrement sa
   machine (navigation privée neuve, profil vierge, autre
   navigateur) peut relancer une démonstration. C'est
   irréductible sans serveur ; voir docs/licensing/security.md.
   ========================================================== */

import { DEMO_DURATION_MS, DEMO_WARNING_MS, DEMO_FEATURES } from './config.js';
import { STATUS } from './status.js';
import { ClockGuard } from './clock.js';

const STATE_VERSION = 1;

/** Rend chaque jeton d'essai unique, et repérable dans un stockage. */
function randomNonce() {
  const bytes = new Uint8Array(12);
  const c = (typeof globalThis !== 'undefined' && globalThis.crypto) ? globalThis.crypto : null;
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

/** Cadence de persistance du temps consommé pendant une session. */
export const HEARTBEAT_MS = 15 * 1000;

export class DemoEngine {
  /**
   * @param {{storage:object, identity:object, durationMs?:number, clock?:ClockGuard}} opts
   */
  constructor(opts) {
    this.storage = opts.storage;
    this.identity = opts.identity;
    this.durationMs = opts.durationMs != null ? opts.durationMs : DEMO_DURATION_MS;
    this.clock = opts.clock || new ClockGuard();
    this._state = null;
    this._lastPersistMono = -Infinity;
    this._loaded = false;
  }

  /* -- état persistant -- */

  _load() {
    if (this._loaded) return this._state;
    const rec = this.storage.loadDemoState();
    this._loaded = true;
    if (!rec || !rec.data || typeof rec.data !== 'object') {
      // L'état de démonstration a disparu. Le jeton d'essai, écrit sous
      // une autre clé, fait alors foi : un essai a bien été consommé sur
      // cette installation, et l'état est reconstruit à partir de lui.
      const trial = this._loadTrial();
      if (trial) {
        this._state = this._stateFromTrial(trial);
        this._persist(true);
        return this._state;
      }
      this._state = null;
      return null;
    }
    const d = rec.data;
    const state = {
      version: Number(d.version) || 1,
      installId: typeof d.installId === 'string' ? d.installId : null,
      startedAtWall: Number(d.startedAtWall) || 0,
      consumedMs: Math.max(0, Number(d.consumedMs) || 0),
      highWaterWall: Math.max(0, Number(d.highWaterWall) || 0),
      lastSeenWall: Math.max(0, Number(d.lastSeenWall) || 0),
      lastSessionMono: Number.isFinite(d.lastSessionMono) ? d.lastSessionMono : null,
      anomalies: Array.isArray(d.anomalies) ? d.anomalies.slice(-20) : [],
      sealed: rec.sealed !== false,
      exhausted: d.exhausted === true
    };

    // Enregistrement corrompu ou incohérent : on le traite comme une
    // démonstration déjà consommée plutôt que de repartir à zéro.
    if (!state.startedAtWall || state.startedAtWall < 0) {
      state.anomalies.push({ kind: 'corrupt_state', at: Date.now() });
      state.exhausted = true;
    }
    if (!state.sealed) {
      state.anomalies.push({ kind: 'seal_broken', at: Date.now() });
      state.exhausted = true;
    }
    if (state.installId && this.identity && state.installId !== this.identity.installId) {
      // Une démo d'une autre installation traîne dans ce profil.
      state.anomalies.push({ kind: 'install_mismatch', at: Date.now() });
      state.exhausted = true;
    }

    this._state = state;
    return state;
  }

  /**
   * Lit le jeton d'essai. Retourne null s'il est absent, illisible,
   * descellé ou incohérent — dans ce dernier cas on ne le jette pas :
   * `_stateFromTrial` marquera la démonstration comme consommée.
   * @returns {{installId:string|null, issuedAt:number, durationMs:number,
   *            nonce:string, tampered:boolean}|null}
   */
  _loadTrial() {
    const rec = this.storage.loadTrialToken();
    if (!rec || !rec.data || typeof rec.data !== 'object') return null;
    const d = rec.data;
    const issuedAt = Number(d.issuedAt);
    return {
      version: Number(d.version) || 1,
      installId: typeof d.installId === 'string' ? d.installId : null,
      fingerprint: typeof d.fingerprint === 'string' ? d.fingerprint : null,
      nonce: typeof d.nonce === 'string' ? d.nonce : '',
      issuedAt: Number.isFinite(issuedAt) && issuedAt > 0 ? issuedAt : 0,
      durationMs: Number(d.durationMs) > 0 ? Number(d.durationMs) : this.durationMs,
      // Un jeton descellé ou sans date d'émission a été fabriqué ou retouché.
      tampered: rec.sealed === false || !Number.isFinite(issuedAt) || issuedAt <= 0
    };
  }

  /**
   * Émet le jeton d'essai. Écrit UNE SEULE FOIS, à la première activation :
   * le réécrire à chaque session permettrait de le rajeunir.
   */
  _issueTrial(startedAtWall) {
    if (this._loadTrial()) return;
    this.storage.saveTrialToken({
      version: STATE_VERSION,
      installId: this.identity ? this.identity.installId : null,
      fingerprint: this.identity ? this.identity.fingerprint : null,
      nonce: randomNonce(),
      issuedAt: startedAtWall,
      durationMs: this.durationMs
    });
  }

  /**
   * Reconstruit un état de démonstration à partir du seul jeton d'essai.
   * Le temps déjà écoulé est recalculé honnêtement depuis la date
   * d'émission : effacer son stockage cinq minutes après le début ne
   * consomme pas l'heure entière, mais ne la rend pas non plus.
   */
  _stateFromTrial(trial) {
    const obs = this.clock.observe(null);
    const anomalies = [{ kind: 'state_restored_from_trial', at: obs.wall }];
    let exhausted = false;

    if (trial.tampered) {
      anomalies.push({ kind: 'trial_token_tampered', at: obs.wall });
      exhausted = true;
    }
    if (trial.installId && this.identity && trial.installId !== this.identity.installId) {
      // L'identité a été recréée après coup : l'essai reste consommé.
      anomalies.push({ kind: 'install_mismatch', at: obs.wall });
      exhausted = true;
    }
    if (trial.issuedAt > obs.wall + this.clock.skewTolerance) {
      // Jeton émis « dans le futur » : horloge reculée depuis l'essai.
      anomalies.push({ kind: 'clock_backwards', at: obs.wall, from: trial.issuedAt });
      exhausted = true;
    }

    return {
      version: STATE_VERSION,
      installId: trial.installId,
      startedAtWall: trial.issuedAt || obs.wall,
      consumedMs: 0,
      highWaterWall: Math.max(trial.issuedAt, obs.wall),
      lastSeenWall: obs.wall,
      lastSessionMono: obs.mono,
      anomalies,
      sealed: true,
      exhausted
    };
  }

  _persist(force) {
    if (!this._state) return;
    const mono = this.clock.monoNow();
    if (!force && mono - this._lastPersistMono < HEARTBEAT_MS) return;
    this._lastPersistMono = mono;
    const s = this._state;
    this.storage.saveDemoState({
      version: STATE_VERSION,
      installId: s.installId,
      startedAtWall: s.startedAtWall,
      consumedMs: Math.round(s.consumedMs),
      highWaterWall: s.highWaterWall,
      lastSeenWall: s.lastSeenWall,
      lastSessionMono: s.lastSessionMono,
      anomalies: s.anomalies.slice(-20),
      exhausted: s.exhausted
    });
  }

  /* -- API -- */

  /** Vrai si aucune démonstration n'a jamais été lancée sur cette installation. */
  isAvailable() {
    return this._load() === null;
  }

  /**
   * Démarre la démonstration. Idempotent : si elle a déjà été lancée,
   * retourne simplement son état courant.
   */
  start() {
    // `_load` consulte l'état ET le jeton d'essai : un essai déjà consommé
    // ne peut donc pas être relancé, même si l'état a été effacé.
    const existing = this._load();
    if (existing) return this.evaluate();

    const obs = this.clock.observe(null);
    this._state = {
      version: STATE_VERSION,
      installId: this.identity ? this.identity.installId : null,
      startedAtWall: obs.wall,
      consumedMs: 0,
      highWaterWall: obs.wall,
      lastSeenWall: obs.wall,
      lastSessionMono: obs.mono,
      anomalies: [],
      sealed: true,
      exhausted: false
    };
    this._issueTrial(obs.wall);
    this._persist(true);
    return this.evaluate();
  }

  /**
   * Réconcilie l'état avec le jeton d'essai après restauration du miroir
   * IndexedDB.
   *
   * `hydrate()` est asynchrone : entre le démarrage de l'application et la
   * fin de la restauration, un utilisateur rapide peut lancer un essai
   * alors que le jeton d'un essai antérieur n'a pas encore reparu. Quand
   * il reparaît, c'est SA date d'émission qui fait foi.
   */
  reconcile() {
    this._loaded = false;
    const state = this._load();
    if (!state) return null;

    const trial = this._loadTrial();
    if (!trial || !trial.issuedAt) return null;
    if (trial.issuedAt >= state.startedAtWall) return null;

    state.startedAtWall = trial.issuedAt;
    state.highWaterWall = Math.max(state.highWaterWall, trial.issuedAt);
    state.anomalies.push({ kind: 'trial_reconciled', at: this.clock.wallNow() });
    if (trial.installId && this.identity && trial.installId !== this.identity.installId) {
      state.anomalies.push({ kind: 'install_mismatch', at: this.clock.wallNow() });
      state.exhausted = true;
    }
    this._persist(true);
    return this.evaluate();
  }

  /** État du jeton d'essai, pour la console privée. */
  trialToken() {
    const t = this._loadTrial();
    if (!t) return null;
    return {
      installId: t.installId,
      issuedAt: t.issuedAt,
      durationMs: t.durationMs,
      nonce: t.nonce,
      tampered: t.tampered,
      matchesInstall: !!(this.identity && t.installId === this.identity.installId)
    };
  }

  /**
   * Met l'état à jour et calcule le résultat courant.
   * Appelée au démarrage, à chaque seconde par l'UI, et avant toute
   * décision d'accès.
   *
   * @returns {{status:string, remainingMs:number, elapsedMs:number,
   *            durationMs:number, warning:boolean, startedAt:number,
   *            expiresAt:number, anomalies:Array, clockTampered:boolean,
   *            features:string[]}}
   */
  evaluate() {
    const s = this._load();
    if (!s) {
      return {
        status: STATUS.DEMO_AVAILABLE,
        remainingMs: this.durationMs,
        elapsedMs: 0,
        durationMs: this.durationMs,
        warning: false,
        startedAt: 0,
        expiresAt: 0,
        anomalies: [],
        clockTampered: false,
        features: []
      };
    }

    const obs = this.clock.observe(s);
    let changed = false;

    if (obs.backwards) {
      s.anomalies.push({ kind: 'clock_backwards', at: obs.wall, from: s.highWaterWall });
      changed = true;
    }
    if (obs.forwardJump) {
      s.anomalies.push({ kind: 'clock_forward_jump', at: obs.wall, driftMs: Math.round(obs.driftMs) });
      changed = true;
    }

    // B — temps monotone réellement passé dans l'application.
    if (s.lastSessionMono !== null && obs.mono >= s.lastSessionMono) {
      const delta = obs.mono - s.lastSessionMono;
      // Un delta absurde (onglet suspendu très longtemps) reste borné
      // par la durée de la démo : on n'invente pas de temps.
      s.consumedMs += Math.min(delta, this.durationMs);
    }
    s.lastSessionMono = obs.mono;
    s.highWaterWall = obs.highWaterWall;
    s.lastSeenWall = obs.wall;

    // A — écoulement mural, mesuré sur le sommet observé.
    const wallElapsed = Math.max(0, s.highWaterWall - s.startedAtWall);
    const elapsedMs = Math.max(wallElapsed, s.consumedMs);
    const remainingMs = Math.max(0, this.durationMs - elapsedMs);

    if (remainingMs === 0 && !s.exhausted) {
      s.exhausted = true;
      changed = true;
    }

    this._persist(changed);

    const status = (s.exhausted || remainingMs <= 0) ? STATUS.DEMO_EXPIRED : STATUS.DEMO_ACTIVE;

    return {
      status,
      remainingMs: status === STATUS.DEMO_EXPIRED ? 0 : remainingMs,
      elapsedMs,
      durationMs: this.durationMs,
      warning: status === STATUS.DEMO_ACTIVE && remainingMs <= DEMO_WARNING_MS,
      startedAt: s.startedAtWall,
      expiresAt: s.startedAtWall + this.durationMs,
      anomalies: s.anomalies.slice(),
      clockTampered: s.anomalies.some(a => a.kind === 'clock_backwards'),
      features: status === STATUS.DEMO_ACTIVE ? DEMO_FEATURES.slice() : []
    };
  }

  /**
   * Fige l'état courant sur disque (avant fermeture de l'onglet).
   * Réévalue d'abord : sans cela, une session ouverte puis fermée sans
   * qu'aucun rafraîchissement n'ait eu lieu ne consommerait aucun temps.
   */
  flush() {
    if (this._load()) this.evaluate();
    this._persist(true);
  }

  /**
   * Jeton d'autorisation de réinitialisation.
   *
   * Il ne s'agit PAS d'un secret : quiconque lit ce code le trouve.
   * Son rôle est de garantir qu'il n'existe qu'UN SEUL chemin vers la
   * remise à zéro — `LicenseFacade.resetDemo()`, qui exige une licence
   * privée portant la permission `testing`. Sans lui, un simple
   * `facade.demo.reset()` depuis la console du navigateur suffirait.
   * Contre un utilisateur qui efface son stockage, cela ne change rien ;
   * voir docs/licensing/security.md.
   */
  static get RESET_AUTHORIZATION() { return DemoEngine._resetToken; }

  /**
   * Réinitialisation, réservée aux licences privées portant la
   * permission `testing`. N'est jamais atteignable depuis l'UI publique.
   * @param {string} reason
   * @param {symbol} authorization jeton obtenu de la façade
   */
  reset(reason, authorization) {
    if (authorization !== DemoEngine._resetToken) {
      throw new Error('DemoEngine.reset : autorisation requise (voir LicenseFacade.resetDemo).');
    }
    return this._doReset(reason);
  }

  _doReset(reason) {
    this.storage.saveDemoState({
      version: STATE_VERSION,
      installId: this.identity ? this.identity.installId : null,
      startedAtWall: 0, consumedMs: 0, highWaterWall: 0, lastSeenWall: 0,
      lastSessionMono: null, anomalies: [{ kind: 'reset', at: Date.now(), reason: reason || 'manuel' }],
      exhausted: false
    });
    this.storage.erase('demo');
    this.storage.eraseTrialToken();
    this._state = null;
    this._loaded = false;
  }
}

/** Jeton interne, non exporté hors du module. */
DemoEngine._resetToken = Symbol('averi.demo.reset');
