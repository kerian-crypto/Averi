/* ==========================================================
   AVERI LICENSING — LicenseFacade
   ----------------------------------------------------------
   LA SEULE PORTE D'ENTRÉE POUR L'INTERFACE.

   Aucun composant d'UI ne doit importer LicenseEngine,
   DemoEngine, SecureLicenseStorage ni toucher au stockage.
   Toute la logique de décision vit ici et en dessous ; l'UI
   demande `getStatus()` et affiche.
   ========================================================== */

import {
  PRODUCT_ID, PLANS, PUBLIC_PLAN_IDS, PRIVATE_PLAN_ID, SUPPORT,
  DEMO_DURATION_MS, CONSOLE_PERMISSIONS, CURRENCY_LABEL, getPlan
} from './config.js';
import { STATUS, isGranting, userMessage } from './status.js';
import { SecureLicenseStorage } from './storage.js';
import { buildIdentity } from './device.js';
import { ClockGuard, formatDuration, formatEpoch } from './clock.js';
import { DemoEngine } from './demo-engine.js';
import { LicenseEngine } from './license-engine.js';
import { RevocationRegistry } from './revocation.js';
import { LocalLicenseValidator, RemoteLicenseValidator, HybridLicenseValidator } from './validators.js';
import { ActivationService } from './activation.js';
import { Journal } from './journal.js';
import { Entitlements, intersectFeatures } from './entitlements.js';
import { normalizeToken } from './license-format.js';

export class LicenseFacade {
  /**
   * @param {{storage?:object, clock?:object, trustedKeys?:object,
   *          remoteEndpoint?:string|null, demoDurationMs?:number}} opts
   */
  constructor(opts) {
    opts = opts || {};

    this.storage = opts.storage || new SecureLicenseStorage();
    this.clock = opts.clock || new ClockGuard();

    // L'identité doit être établie avant tout : elle scelle le stockage.
    // Son propre enregistrement est scellé avec une clé d'amorçage fixe,
    // sans quoi il serait illisible ici (voir SecureLicenseStorage._sealKeyFor).
    const identityRecord = this.storage.loadIdentity();
    const previous = identityRecord && identityRecord.sealed !== false ? identityRecord.data : null;
    this.identity = buildIdentity(previous);
    this.storage.setSealSecret(this.identity.installId);
    if (!previous || previous.installId !== this.identity.installId) {
      this.storage.saveIdentity(this.identity);
    }

    this.journal = new Journal(this.storage);
    this.revocations = new RevocationRegistry({ storage: this.storage });

    this.engine = new LicenseEngine({
      trustedKeys: opts.trustedKeys,
      productId: opts.productId || PRODUCT_ID,
      revocations: this.revocations
    });

    this.localValidator = new LocalLicenseValidator(this.engine);
    this.remoteValidator = new RemoteLicenseValidator({ endpoint: opts.remoteEndpoint || null });
    /**
     * Aujourd'hui : hybride avec un distant désactivé, ce qui équivaut
     * exactement au local. Le jour où `remoteEndpoint` est renseigné,
     * la validation distante s'active sans autre modification.
     */
    this.validator = new HybridLicenseValidator(this.localValidator, this.remoteValidator, {
      onRemoteVerdict: (v) => this.journal.append('verdict_distant', { status: v.status })
    });

    this.demo = new DemoEngine({
      storage: this.storage,
      identity: this.identity,
      clock: this.clock,
      durationMs: opts.demoDurationMs
    });

    this.activation = new ActivationService({
      storage: this.storage,
      validator: this.validator,
      identity: this.identity,
      journal: this.journal
    });

    this._listeners = new Set();
    this._lastStatus = null;
    this._timer = null;
  }

  /** Restaure les enregistrements depuis le miroir IndexedDB. À appeler au démarrage. */
  async init() {
    try { await this.storage.hydrate(); } catch (_) {}
    // Relit après restauration, et fait primer un jeton d'essai antérieur
    // sur un essai lancé pendant que l'hydratation était en cours.
    this.demo.reconcile();
    this._emit();
    return this.getStatus();
  }

  /* ---------------------------------------------------------- */
  /* Lecture d'état                                             */
  /* ---------------------------------------------------------- */

  /**
   * État consolidé. C'est l'unique méthode dont l'UI a besoin.
   *
   * @returns {{state:string, entitlements:Entitlements, message:{title,body},
   *            demo:object, license:object|null, plan:object|null,
   *            deviceCode:string, remainingLabel:string|null,
   *            warning:boolean, canStartDemo:boolean, isPrivate:boolean}}
   */
  getStatus() {
    const stored = this.activation.storedToken();

    if (stored) {
      // Un enregistrement de licence descellé est traité comme altéré.
      if (stored.sealed === false) {
        this.journal.append('licence_descellée', {});
        return this._compose(STATUS.LICENSE_TAMPERED, null, this.demo.evaluate());
      }
      const res = this.validator.validateSync(stored.token, { identity: this.identity });
      const binding = this.activation.checkActivationBinding();
      if (res.status === STATUS.LICENSE_ACTIVE && !binding.ok) {
        return this._compose(STATUS.LICENSE_DEVICE_MISMATCH, res, this.demo.evaluate());
      }
      if (res.status === STATUS.LICENSE_ACTIVE) {
        return this._compose(STATUS.LICENSE_ACTIVE, res, this.demo.evaluate());
      }
      // Licence présente mais inutilisable : la démonstration peut
      // encore courir, on la présente plutôt qu'un mur sec.
      const demoState = this.demo.evaluate();
      if (demoState.status === STATUS.DEMO_ACTIVE) {
        return this._compose(STATUS.DEMO_ACTIVE, res, demoState, res.status);
      }
      return this._compose(res.status, res, demoState);
    }

    const demoState = this.demo.evaluate();
    return this._compose(demoState.status, null, demoState);
  }

  _compose(state, licenseResult, demoState, licenseIssue) {
    let entitlements;

    if (state === STATUS.LICENSE_ACTIVE && licenseResult) {
      entitlements = new Entitlements({
        source: 'license',
        status: state,
        features: licenseResult.features,
        permissions: licenseResult.permissions,
        planId: licenseResult.license.planId,
        licenseType: licenseResult.license.type,
        expiresAt: licenseResult.license.expiresAt
      });
    } else if (state === STATUS.DEMO_ACTIVE) {
      entitlements = new Entitlements({
        source: 'demo',
        status: state,
        features: demoState.features,
        remainingMs: demoState.remainingMs
      });
    } else {
      entitlements = Entitlements.none(state);
    }

    const licenseInfo = licenseResult && licenseResult.license ? licenseResult.license : null;

    return {
      state,
      entitlements,
      message: userMessage(state),
      unlocked: isGranting(state),
      demo: {
        status: demoState.status,
        remainingMs: demoState.remainingMs,
        durationMs: demoState.durationMs,
        warning: demoState.warning,
        startedAt: demoState.startedAt,
        expiresAt: demoState.expiresAt,
        clockTampered: demoState.clockTampered,
        anomalies: demoState.anomalies
      },
      license: licenseInfo,
      licenseIssue: licenseIssue || null,
      plan: licenseResult && licenseResult.plan ? licenseResult.plan : null,
      deviceCode: this.identity.deviceCode,
      remainingLabel: state === STATUS.DEMO_ACTIVE ? formatDuration(demoState.remainingMs) : null,
      warning: state === STATUS.DEMO_ACTIVE && demoState.warning,
      canStartDemo: demoState.status === STATUS.DEMO_AVAILABLE,
      isPrivate: !!(licenseInfo && licenseInfo.type === 'private')
    };
  }

  /** Droits effectifs seuls — raccourci pour le code de jeu. */
  entitlements() { return this.getStatus().entitlements; }

  /** Une fonctionnalité est-elle ouverte ? */
  can(feature) { return this.entitlements().has(feature); }

  /** Une manche est-elle jouable ? */
  canPlay(gameId) { return this.entitlements().allowsGame(gameId); }

  /** Permission de licence privée. */
  hasPermission(permission) { return this.entitlements().hasPermission(permission); }

  /** La console privée est-elle accessible ? */
  canOpenConsole() {
    const e = this.entitlements();
    return e.licenseType === 'private' && CONSOLE_PERMISSIONS.some(p => e.hasPermission(p));
  }

  /* ---------------------------------------------------------- */
  /* Actions                                                    */
  /* ---------------------------------------------------------- */

  /** Démarre la démonstration d'une heure. */
  startDemo() {
    const before = this.demo.isAvailable();
    const res = this.demo.start();
    if (before) this.journal.append('démo_démarrée', { durationMs: this.demo.durationMs });
    this._emit();
    return res;
  }

  /**
   * Active une licence saisie par l'utilisateur.
   * @returns {{ok:boolean, status:string, message:{title,body}, license:object|null}}
   */
  activateLicense(token) {
    const normalized = normalizeToken(token);
    const res = this.activation.activate(normalized);
    this._emit();
    return {
      ok: res.ok,
      status: res.status,
      message: userMessage(res.status),
      license: res.result && res.result.license ? res.result.license : null,
      detail: res.result ? res.result.detail : null
    };
  }

  /** Inspecte une licence sans l'activer (console privée, support). */
  inspect(token) {
    return this.validator.validateSync(normalizeToken(token), { identity: this.identity });
  }

  removeLicense() {
    this.activation.deactivate();
    this._emit();
    return this.getStatus();
  }

  /* ---------------------------------------------------------- */
  /* Trousseau — plusieurs licences sur un même appareil        */
  /* ---------------------------------------------------------- */

  /**
   * Toutes les licences connues de cet appareil, chacune RÉÉVALUÉE.
   *
   * Une licence mémorisée n'est pas une licence valide : l'expiration,
   * la révocation et la liaison d'appareil sont recalculées à chaque
   * appel. Les entrées ne se contaminent pas — chacune porte son propre
   * jeton signé et son propre verdict.
   *
   * @returns {Array<{id, active, status, valid, planId, planName, type,
   *                  holder, expiresAt, deviceBound, addedAt, lastUsedAt,
   *                  features, permissions, message}>}
   */
  licenses() {
    const kr = this.activation.keyring();
    return kr.entries.map((entry) => {
      const res = this.validator.validateSync(entry.token, { identity: this.identity });
      const plan = res.plan || getPlan(entry.planId);
      const lic = res.license;
      return {
        id: entry.id,
        active: kr.activeId === entry.id,
        status: res.status,
        valid: res.status === STATUS.LICENSE_ACTIVE,
        message: userMessage(res.status),
        planId: lic ? lic.planId : entry.planId,
        planName: plan ? plan.name : (entry.planId || '—'),
        type: lic ? lic.type : entry.type,
        holder: (lic && lic.metadata && lic.metadata.holder) || entry.holder || null,
        issuedAt: lic ? lic.issuedAt : 0,
        expiresAt: lic ? lic.expiresAt : 0,
        deviceBound: lic ? lic.deviceMode === 'fp' : false,
        addedAt: entry.addedAt || 0,
        lastUsedAt: entry.lastUsedAt || 0,
        features: res.features,
        permissions: res.permissions,
        token: entry.token
      };
    }).sort((a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0) || b.lastUsedAt - a.lastUsedAt);
  }

  /** Bascule sur une licence du trousseau. Elle est revalidée au passage. */
  switchLicense(licenseId) {
    const res = this.activation.switchTo(licenseId);
    this._emit();
    return {
      ok: res.ok,
      status: res.status,
      message: userMessage(res.status),
      license: res.result && res.result.license ? res.result.license : null
    };
  }

  /** Retire une licence du trousseau. */
  forgetLicense(licenseId) {
    const removed = this.activation.forget(licenseId);
    this._emit();
    return removed;
  }

  /**
   * Remise à zéro de la démonstration.
   * Exige une licence privée valide portant la permission `testing` :
   * c'est l'unique chemin vers `DemoEngine.reset`.
   * @returns {{ok:boolean, reason:string|null}}
   */
  resetDemo(reason) {
    if (!this.hasPermission('testing')) {
      this.journal.append('réinit_démo_refusée', {});
      return { ok: false, reason: 'permission `testing` requise' };
    }
    this.demo.reset(reason || 'console privée', DemoEngine.RESET_AUTHORIZATION);
    this.journal.append('démo_réinitialisée', { reason: reason || 'console privée' });
    this._emit();
    return { ok: true, reason: null };
  }

  /** Vérification distante ponctuelle, quand un serveur sera configuré. */
  async refreshRemote() {
    const stored = this.activation.storedToken();
    if (!stored) return null;
    return this.validator.validate(stored.token, { identity: this.identity });
  }

  /* ---------------------------------------------------------- */
  /* Observation                                                */
  /* ---------------------------------------------------------- */

  /** S'abonne aux changements d'état. Retourne la fonction de désabonnement. */
  subscribe(fn) {
    this._listeners.add(fn);
    try { fn(this.getStatus()); } catch (_) {}
    return () => this._listeners.delete(fn);
  }

  _emit() {
    const status = this.getStatus();
    this._lastStatus = status;
    for (const fn of this._listeners) {
      try { fn(status); } catch (err) { console.warn('licence: abonné en erreur', err); }
    }
  }

  /**
   * Démarre le rafraîchissement périodique (compte à rebours de la
   * démonstration, expiration en cours de partie).
   */
  startTicker(intervalMs) {
    this.stopTicker();
    const period = intervalMs || 1000;
    let lastState = null;
    let lastMinute = null;
    this._timer = setInterval(() => {
      const s = this.getStatus();
      const minute = s.demo ? Math.ceil(s.demo.remainingMs / 60000) : null;
      if (s.state !== lastState || minute !== lastMinute) {
        lastState = s.state;
        lastMinute = minute;
        for (const fn of this._listeners) {
          try { fn(s); } catch (_) {}
        }
      }
    }, period);
    return this._timer;
  }

  stopTicker() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  /** À appeler avant la fermeture de l'onglet. */
  flush() { this.demo.flush(); }

  /* ---------------------------------------------------------- */
  /* Données pour l'interface                                   */
  /* ---------------------------------------------------------- */

  /** Plans commercialisés, prêts à afficher. */
  publicPlans() {
    return PUBLIC_PLAN_IDS.map(id => {
      const p = PLANS[id];
      return {
        id: p.id,
        name: p.name,
        tagline: p.tagline,
        price: p.price,
        priceLabel: p.price.toLocaleString('fr-FR') + ' ' + CURRENCY_LABEL,
        durationDays: p.default_duration_days,
        features: p.features.slice()
      };
    });
  }

  /** Lien WhatsApp pré-rempli. Le numéro ne vit que dans config.js. */
  supportLink(planId) {
    const plan = getPlan(planId) || null;
    const text = SUPPORT.message
      .replace('{plan}', plan ? plan.name : 'Averi')
      .replace('{price}', plan ? plan.price.toLocaleString('fr-FR') + ' ' + CURRENCY_LABEL : '—')
      .replace('{device}', this.identity.deviceCode);
    return 'https://wa.me/' + SUPPORT.whatsapp + '?text=' + encodeURIComponent(text);
  }

  get support() { return SUPPORT; }

  /** Rapport de diagnostic (console privée, permission `diagnostics`). */
  diagnostics() {
    const status = this.getStatus();
    return {
      product: PRODUCT_ID,
      state: status.state,
      identity: {
        installId: this.identity.installId,
        fingerprint: this.identity.fingerprint,
        deviceCode: this.identity.deviceCode,
        createdAt: this.identity.createdAt,
        traits: this.identity.traits,
        traitsDigest: this.identity.traitsDigest,
        traitsChanged: this.identity.traitsChanged
      },
      storage: this.storage.describe(),
      demo: {
        durationMs: DEMO_DURATION_MS,
        status: status.demo.status,
        startedAt: status.demo.startedAt ? formatEpoch(Math.floor(status.demo.startedAt / 1000)) : '—',
        remaining: formatDuration(status.demo.remainingMs),
        anomalies: status.demo.anomalies,
        trialToken: this.demo.trialToken()
      },
      license: status.license,
      activation: this.activation.currentActivation(),
      revocations: this.revocations.list(),
      validators: {
        active: this.validator.name,
        remoteConfigured: this.remoteValidator.enabled
      },
      clock: {
        wall: Date.now(),
        sessionElapsedMs: this.clock.sessionElapsedMs()
      }
    };
  }

  /** Droits communs aux deux joueurs. */
  sharedFeatures(peerFeatures) {
    return intersectFeatures(this.entitlements(), peerFeatures);
  }
}

export { STATUS, Entitlements, PRIVATE_PLAN_ID };
