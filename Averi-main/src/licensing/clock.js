/* ==========================================================
   AVERI LICENSING — Horloge et détection de manipulation
   ----------------------------------------------------------
   Trois sources de temps, aucune n'est digne de confiance seule :

   1. `wall`  — Date.now(). L'utilisateur la contrôle entièrement.
   2. `mono`  — performance.now(). Monotone, mais repart de zéro
                à chaque chargement de page : utile uniquement
                à l'intérieur d'une session.
   3. `highWater` — la plus grande valeur d'horloge jamais
                observée, persistée. Ne redescend jamais.

   Règle : le temps consommé par la démonstration est le MAXIMUM
   entre l'écoulement mesuré sur `highWater` et le temps monotone
   réellement passé dans l'application. Reculer l'horloge ne rend
   donc jamais de temps.
   ========================================================== */

import { CLOCK_SKEW_TOLERANCE_MS } from './config.js';

/** Saut d'horloge vers l'avant au-delà duquel on soupçonne un changement de fuseau. */
const FORWARD_JUMP_TOLERANCE_MS = 6 * 60 * 60 * 1000;

export function wallNow() {
  return Date.now();
}

export function monoNow() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

/** Instant courant en secondes UTC (unité des champs iat/nbf/exp). */
export function nowSeconds() {
  return Math.floor(wallNow() / 1000);
}

/** Formatte un epoch (secondes UTC) en date lisible, ou '—'. */
export function formatEpoch(sec, opts) {
  if (!sec) return '—';
  try {
    return new Date(sec * 1000).toLocaleString('fr-FR', Object.assign({
      dateStyle: 'medium', timeStyle: 'short'
    }, opts || {}));
  } catch (_) {
    return new Date(sec * 1000).toISOString();
  }
}

/** Durée en millisecondes -> « 42 min », « 08 min », « 1 h 05 ». */
export function formatDuration(ms) {
  if (ms <= 0) return '0 min';
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return h + ' h ' + String(m).padStart(2, '0');
  if (totalMin < 1) return Math.max(1, Math.ceil(ms / 1000)) + ' s';
  return String(m).padStart(2, '0') + ' min';
}

/**
 * Écart à maintenant, en langage courant : « dans 27 jours », « il y a 2 h ».
 * Complète une date absolue plutôt que de la remplacer : un administrateur a
 * besoin des deux — la date pour agir, l'écart pour juger.
 * @param {number} epochMs instant visé, en millisecondes
 * @param {number} [nowMs]
 */
export function formatRelative(epochMs, nowMs) {
  if (!epochMs) return '';
  const now = nowMs != null ? nowMs : wallNow();
  const delta = epochMs - now;
  const futur = delta >= 0;
  const abs = Math.abs(delta);

  const min = Math.round(abs / 60000);
  if (min < 1) return futur ? 'dans un instant' : 'à l’instant';
  if (min < 60) return (futur ? 'dans ' : 'il y a ') + min + ' min';

  const h = Math.round(abs / 3600000);
  if (h < 24) return (futur ? 'dans ' : 'il y a ') + h + ' h';

  const j = Math.round(abs / 86400000);
  if (j < 31) return (futur ? 'dans ' : 'il y a ') + j + ' jour' + (j > 1 ? 's' : '');

  const mois = Math.round(j / 30);
  if (mois < 12) return (futur ? 'dans ' : 'il y a ') + mois + ' mois';

  const ans = Math.round(j / 365);
  return (futur ? 'dans ' : 'il y a ') + ans + ' an' + (ans > 1 ? 's' : '');
}

/**
 * Suit l'horloge entre deux observations et qualifie les écarts.
 * Sans état persistant propre : c'est l'appelant (DemoEngine) qui
 * détient et scelle l'état, afin qu'il n'existe qu'un seul
 * enregistrement à protéger.
 */
export class ClockGuard {
  constructor(opts) {
    opts = opts || {};
    this.wallNow = opts.wallNow || wallNow;
    this.monoNow = opts.monoNow || monoNow;
    this.skewTolerance = opts.skewTolerance != null ? opts.skewTolerance : CLOCK_SKEW_TOLERANCE_MS;
    this.forwardTolerance = opts.forwardTolerance != null ? opts.forwardTolerance : FORWARD_JUMP_TOLERANCE_MS;
    this._sessionStartMono = this.monoNow();
  }

  /** Temps écoulé depuis le chargement de l'application, non manipulable par l'horloge. */
  sessionElapsedMs() {
    return Math.max(0, this.monoNow() - this._sessionStartMono);
  }

  /**
   * Compare l'horloge courante à l'état persisté.
   *
   * @param {{highWaterWall:number, lastSeenWall:number, lastSessionMono:number}} prev
   * @returns {{wall:number, mono:number, highWaterWall:number,
   *            backwards:boolean, forwardJump:boolean, driftMs:number}}
   */
  observe(prev) {
    const wall = this.wallNow();
    const mono = this.monoNow();
    const previous = prev || {};
    const prevHigh = Number.isFinite(previous.highWaterWall) ? previous.highWaterWall : 0;
    const prevSeen = Number.isFinite(previous.lastSeenWall) ? previous.lastSeenWall : 0;
    const prevMono = Number.isFinite(previous.lastSessionMono) ? previous.lastSessionMono : null;

    const backwards = prevHigh > 0 && wall < prevHigh - this.skewTolerance;

    // Écart entre l'avancée de l'horloge et l'avancée monotone, au sein
    // d'une même session uniquement (mono repart de zéro sinon).
    let forwardJump = false;
    let driftMs = 0;
    if (prevSeen > 0 && prevMono !== null && mono >= prevMono) {
      const dWall = wall - prevSeen;
      const dMono = mono - prevMono;
      driftMs = dWall - dMono;
      if (driftMs > this.forwardTolerance) forwardJump = true;
    } else if (prevSeen > 0 && wall - prevSeen > this.forwardTolerance) {
      // Entre deux sessions : on ne dispose que de l'horloge murale.
      driftMs = wall - prevSeen;
    }

    return {
      wall,
      mono,
      highWaterWall: Math.max(prevHigh, wall),
      backwards,
      forwardJump,
      driftMs
    };
  }
}
