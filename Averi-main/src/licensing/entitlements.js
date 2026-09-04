/* ==========================================================
   AVERI LICENSING — Droits effectifs
   ----------------------------------------------------------
   Objet immuable qui répond à une seule question : « ai-je le
   droit d'utiliser cette fonctionnalité ? ». C'est le seul
   objet que le code de jeu manipule ; il n'a jamais à savoir
   s'il est en démonstration, sous licence publique ou privée.
   ========================================================== */

import { FEATURES, GAME_FEATURE_OF } from './config.js';
import { STATUS } from './status.js';

export class Entitlements {
  /**
   * @param {{source:string, status:string, features:string[],
   *          permissions?:string[], planId?:string|null,
   *          expiresAt?:number, remainingMs?:number}} data
   */
  constructor(data) {
    data = data || {};
    this.source = data.source || 'none';          // 'demo' | 'license' | 'none'
    this.status = data.status || STATUS.LICENSE_UNKNOWN;
    this._features = new Set(data.features || []);
    this._permissions = new Set(data.permissions || []);
    this.planId = data.planId || null;
    this.licenseType = data.licenseType || null;   // 'public' | 'private' | null
    this.expiresAt = data.expiresAt || 0;
    this.remainingMs = data.remainingMs != null ? data.remainingMs : null;
    Object.freeze(this);
  }

  static none(status) {
    return new Entitlements({ source: 'none', status: status || STATUS.LICENSE_UNKNOWN, features: [] });
  }

  /** L'accès aux fonctionnalités protégées est-il ouvert ? */
  get unlocked() {
    return this.source !== 'none' && this._features.size > 0;
  }

  has(feature) { return this._features.has(feature); }

  hasPermission(permission) { return this._permissions.has(permission); }

  /** Manche `truth`, `c4`… autorisée ? */
  allowsGame(gameId) {
    const f = GAME_FEATURE_OF[gameId];
    return !!f && this._features.has(f);
  }

  get features() { return Array.from(this._features); }
  get permissions() { return Array.from(this._permissions); }

  /** Liste lisible, pour l'UI publique. */
  describeFeatures() {
    return this.features
      .filter(f => FEATURES[f])
      .map(f => ({ id: f, label: FEATURES[f].label, group: FEATURES[f].group }));
  }

  /** Sérialisation légère, échangée entre les deux joueurs. */
  toWire() {
    return { s: this.source, f: this.features, t: this.licenseType, p: this.planId };
  }
}

/**
 * Intersection des droits de deux joueurs.
 *
 * Averi se joue à deux : proposer une manche que l'autre n'a pas
 * achetée n'aurait aucun sens. L'ensemble effectif est donc
 * l'intersection. Ce contrôle est un contrôle de COHÉRENCE, pas
 * de sécurité : le pair distant peut mentir sur ses droits, et
 * aucune vérification locale ne peut l'en empêcher sans serveur.
 * Voir docs/licensing/security.md.
 */
export function intersectFeatures(mine, theirs) {
  if (!Array.isArray(theirs)) return mine.features.slice();
  const other = new Set(theirs.filter(x => typeof x === 'string'));
  return mine.features.filter(f => other.has(f));
}
