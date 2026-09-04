/* ==========================================================
   AVERI — Interface PUBLIQUE de licence
   ----------------------------------------------------------
   Ton commercial et rassurant, aucun détail technique. Elle ne
   décide jamais rien : elle interroge la façade et affiche.

   Toute erreur est traduite en langage humain ; « signature
   Ed25519 invalide » n'apparaît nulle part.
   ========================================================== */

import { STATUS, userMessage } from '../licensing/status.js';
import { formatDuration, formatEpoch } from '../licensing/clock.js';
import { CURRENCY_LABEL, FEATURES, SUPPORT } from '../licensing/config.js';

const CSS = `
.lic-pill{display:inline-flex;align-items:center;gap:7px;padding:7px 14px;border-radius:999px;
  font-size:.78rem;font-weight:700;border:1px solid var(--line);background:rgba(255,255,255,.07);
  color:var(--ink);cursor:pointer;transition:transform .15s,background .15s}
.lic-pill:hover{transform:translateY(-1px);background:rgba(255,255,255,.12)}
.lic-pill .dot{width:8px;height:8px;border-radius:50%;background:var(--green);flex:none}
.lic-pill.demo .dot{background:var(--amber)}
.lic-pill.warn{border-color:rgba(255,180,87,.55);background:rgba(255,180,87,.14);color:#ffd9a8}
.lic-pill.warn .dot{background:var(--amber);animation:licPulse 1.2s infinite}
.lic-pill.locked{border-color:rgba(255,107,107,.5);background:rgba(255,107,107,.14);color:#ffc4c4}
.lic-pill.locked .dot{background:var(--red)}
@keyframes licPulse{0%,100%{opacity:1}50%{opacity:.3}}

.lic-panel{margin-top:14px;padding:16px}
.lic-panel .head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.lic-panel h3{margin:0;font-size:1rem}
.lic-panel .sub{color:var(--muted);font-size:.84rem;margin:6px 0 0}
.lic-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}

.lic-bar{height:6px;border-radius:99px;background:rgba(255,255,255,.09);overflow:hidden;margin-top:12px}
.lic-bar i{display:block;height:100%;border-radius:99px;background:var(--grad-hot);transition:width .6s ease}
.lic-bar.warn i{background:linear-gradient(135deg,#ff6b6b,#ffb457)}

.lic-modal{position:fixed;inset:0;z-index:120;display:flex;align-items:center;justify-content:center;
  padding:16px;background:rgba(6,3,16,.78);backdrop-filter:blur(8px);overflow-y:auto}
.lic-modal[hidden]{display:none}
.lic-sheet{width:100%;max-width:520px;border-radius:var(--r-lg);border:1px solid var(--line);
  background:linear-gradient(160deg,#1a1030,#120a24);box-shadow:var(--shadow);padding:22px;
  animation:licIn .3s cubic-bezier(.2,.9,.3,1)}
@keyframes licIn{from{opacity:0;transform:translateY(18px) scale(.97)}to{opacity:1;transform:none}}
.lic-sheet h2{margin:0 0 6px;font-size:1.35rem;letter-spacing:-.02em}
.lic-sheet .lead{color:var(--muted);font-size:.9rem;margin:0 0 18px;line-height:1.5}
.lic-close{position:absolute;top:14px;right:16px;background:none;border:0;color:var(--muted);
  font-size:1.4rem;cursor:pointer;line-height:1}
.lic-sheet{position:relative}

.lic-plans{display:grid;gap:12px;grid-template-columns:1fr}
@media(min-width:440px){.lic-plans{grid-template-columns:1fr 1fr}}
.lic-plan{text-align:left;border:1px solid var(--line);border-radius:var(--r-md);padding:16px;
  background:rgba(255,255,255,.045);cursor:pointer;transition:transform .18s,border-color .18s,background .18s}
.lic-plan:hover{transform:translateY(-3px);border-color:rgba(255,93,143,.55);background:rgba(255,93,143,.09)}
.lic-plan .nm{font-weight:800;font-size:.98rem;margin-bottom:2px}
.lic-plan .pr{font-size:1.5rem;font-weight:800;letter-spacing:-.03em;
  background:var(--grad-hot);-webkit-background-clip:text;background-clip:text;color:transparent}
.lic-plan .dur{color:var(--muted);font-size:.74rem;margin-top:2px}
.lic-plan ul{list-style:none;margin:12px 0 0;padding:0;font-size:.78rem;color:var(--muted);line-height:1.7}
.lic-plan li::before{content:'✓ ';color:var(--green);font-weight:700}
.lic-plan.best{border-color:rgba(255,180,87,.5)}
.lic-plan .tagbest{display:inline-block;font-size:.62rem;letter-spacing:.12em;text-transform:uppercase;
  font-weight:800;color:#1a0b1f;background:var(--amber);border-radius:99px;padding:2px 8px;margin-bottom:8px}

.lic-field{display:block;margin:14px 0 0}
.lic-field span{display:block;font-size:.74rem;color:var(--muted);margin-bottom:6px;
  text-transform:uppercase;letter-spacing:.12em;font-weight:700}
.lic-field textarea,.lic-field input{width:100%;border-radius:var(--r-sm);border:1px solid var(--line);
  background:rgba(0,0,0,.28);color:var(--ink);padding:12px;font-size:.86rem;font-family:inherit;resize:vertical}
.lic-field textarea{min-height:96px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.74rem;
  word-break:break-all;line-height:1.5}
.lic-field textarea:focus,.lic-field input:focus{outline:none;border-color:rgba(155,108,255,.7)}

.lic-device{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;
  margin-top:14px;padding:12px 14px;border-radius:var(--r-sm);border:1px dashed var(--line);
  background:rgba(95,225,255,.06)}
.lic-device code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.82rem;color:var(--cyan);
  letter-spacing:.06em}
.lic-device .lbl{font-size:.72rem;color:var(--muted)}

.lic-note{margin-top:14px;padding:11px 13px;border-radius:var(--r-sm);font-size:.8rem;line-height:1.5}
.lic-note.err{background:rgba(255,107,107,.14);border:1px solid rgba(255,107,107,.34);color:#ffc9c9}
.lic-note.ok{background:rgba(74,222,128,.13);border:1px solid rgba(74,222,128,.32);color:#c6f6d5}
.lic-note.info{background:rgba(255,255,255,.05);border:1px solid var(--line);color:var(--muted)}

.lic-summary{display:grid;gap:8px;margin-top:16px;font-size:.82rem}
.lic-summary div{display:flex;justify-content:space-between;gap:12px;
  padding-bottom:8px;border-bottom:1px solid var(--line)}
.lic-summary dt{color:var(--muted)}
.lic-summary b{font-weight:700;text-align:right}

.gtile.lic-off{opacity:.5;filter:saturate(.35)}
.gtile.lic-off::after{content:'🔒';position:absolute;top:10px;right:12px;font-size:1rem}
.gtile{position:relative}
`;

const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
};

/**
 * Passerelle publique.
 * Ne connaît que la façade ; ne touche jamais au stockage.
 */
export class PublicLicenseUI {
  /**
   * @param {{facade:object, mount?:HTMLElement, onChange?:Function}} opts
   */
  constructor(opts) {
    this.facade = opts.facade;
    this.onChange = opts.onChange || null;
    this._modal = null;
    this._status = null;
    this._injectStyles();
    this._buildModal();
  }

  _injectStyles() {
    if (document.getElementById('averi-license-css')) return;
    const style = el('style');
    style.id = 'averi-license-css';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  /* ---------------------------------------------------------- */
  /* Modale                                                     */
  /* ---------------------------------------------------------- */

  _buildModal() {
    const modal = el('div', 'lic-modal');
    modal.hidden = true;
    const sheet = el('div', 'lic-sheet');
    const close = el('button', 'lic-close', '✕');
    close.type = 'button';
    close.setAttribute('aria-label', 'Fermer');
    close.onclick = () => this.close();
    sheet.appendChild(close);
    const body = el('div', 'lic-body');
    sheet.appendChild(body);
    modal.appendChild(sheet);
    modal.addEventListener('click', (e) => { if (e.target === modal) this.close(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.hidden) this.close();
    });
    document.body.appendChild(modal);
    this._modal = modal;
    this._body = body;
  }

  close() {
    this._modal.hidden = true;
  }

  _open(render) {
    this._body.innerHTML = '';
    render(this._body);
    this._modal.hidden = false;
  }

  /* ---------------------------------------------------------- */
  /* Écrans                                                     */
  /* ---------------------------------------------------------- */

  /** Présentation des offres. `reason` adapte l'accroche. */
  openPlans(reason) {
    this._open((body) => {
      const s = this.facade.getStatus();
      const expired = reason === 'demo-expired' || s.state === STATUS.DEMO_EXPIRED;

      body.appendChild(el('h2', null, expired
        ? 'Votre période de démonstration est terminée'
        : 'Choisissez votre Averi'));
      body.appendChild(el('p', 'lead', expired
        ? 'Vous avez essayé toutes les manches pendant une heure. Choisissez une licence pour continuer à jouer à deux.'
        : 'Une licence, deux téléphones, autant de soirées que vous voulez.'));

      const grid = el('div', 'lic-plans');
      const plans = this.facade.publicPlans();
      plans.forEach((p, i) => {
        const card = el('button', 'lic-plan' + (i === plans.length - 1 ? ' best' : ''));
        card.type = 'button';
        if (i === plans.length - 1) card.appendChild(el('span', 'tagbest', 'Complet'));
        card.appendChild(el('div', 'nm', p.name));
        card.appendChild(el('div', 'pr', p.priceLabel));
        card.appendChild(el('div', 'dur', p.durationDays + ' jours · ' + p.tagline));
        const ul = el('ul');
        for (const f of p.features) {
          if (FEATURES[f]) ul.appendChild(el('li', null, FEATURES[f].label));
        }
        card.appendChild(ul);
        card.onclick = () => this.openCheckout(p);
        grid.appendChild(card);
      });
      body.appendChild(grid);

      const actions = el('div', 'lic-actions');
      actions.appendChild(this._btn('J’ai déjà une licence', 'ghost', () => this.openActivation()));
      actions.appendChild(this._btn('💬 Contacter le support', 'ghost', () => this.contactSupport(null)));
      body.appendChild(actions);
    });
  }

  /** Marche à suivre pour payer et recevoir sa licence. */
  openCheckout(plan) {
    this._open((body) => {
      body.appendChild(el('h2', null, plan.name));
      body.appendChild(el('p', 'lead',
        plan.priceLabel + ' pour ' + plan.durationDays + ' jours. ' +
        'Le paiement se fait par mobile money ; votre licence vous est envoyée juste après.'));

      const steps = el('div', 'lic-summary');
      const step = (n, t) => {
        const d = el('div');
        d.appendChild(el('dt', null, n));
        d.appendChild(el('b', null, t));
        return d;
      };
      steps.appendChild(step('1.', 'Envoyez votre demande par WhatsApp'));
      steps.appendChild(step('2.', 'Réglez ' + plan.priceLabel + ' comme indiqué'));
      steps.appendChild(step('3.', 'Recevez votre code de licence'));
      steps.appendChild(step('4.', 'Collez-le dans « J’ai une licence »'));
      body.appendChild(steps);

      body.appendChild(this._deviceRow(
        'Joignez ce code à votre message : votre licence sera liée à cet appareil.'));

      const actions = el('div', 'lic-actions');
      actions.appendChild(this._btn('💬 Écrire au support', '', () => this.contactSupport(plan.id)));
      actions.appendChild(this._btn('J’ai déjà mon code', 'ghost', () => this.openActivation()));
      actions.appendChild(this._btn('← Retour aux offres', 'ghost', () => this.openPlans()));
      body.appendChild(actions);
    });
  }

  /** Saisie et activation d'une licence. */
  openActivation() {
    this._open((body) => {
      body.appendChild(el('h2', null, 'Activer votre licence'));
      body.appendChild(el('p', 'lead',
        'Collez ici le code reçu d’Averi. Tout se passe sur votre appareil, sans connexion.'));

      const field = el('label', 'lic-field');
      field.appendChild(el('span', null, 'Votre code de licence'));
      const input = el('textarea');
      input.placeholder = 'AVR1.…';
      input.spellcheck = false;
      input.autocapitalize = 'off';
      input.autocomplete = 'off';
      field.appendChild(input);
      body.appendChild(field);

      const note = el('div', 'lic-note info',
        'Le code est long : utilisez le copier-coller depuis votre message.');
      body.appendChild(note);

      body.appendChild(this._deviceRow('Si votre licence a été liée à un appareil, c’est ce code qui a servi.'));

      const actions = el('div', 'lic-actions');
      const submit = this._btn('Activer', '', () => {
        const value = input.value.trim();
        if (!value) {
          note.className = 'lic-note err';
          note.textContent = 'Collez d’abord votre code de licence.';
          return;
        }
        const r = this.facade.activateLicense(value);
        if (r.ok) {
          this.openActive();
        } else {
          note.className = 'lic-note err';
          note.textContent = r.message.title + ' — ' + r.message.body;
          input.focus();
        }
      });
      actions.appendChild(submit);
      actions.appendChild(this._btn('Voir les offres', 'ghost', () => this.openPlans()));
      actions.appendChild(this._btn('💬 Support', 'ghost', () => this.contactSupport(null)));
      body.appendChild(actions);

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit.click();
      });
      setTimeout(() => input.focus(), 50);
    });
  }

  /** Récapitulatif d'une licence active. */
  openActive() {
    this._open((body) => {
      const s = this.facade.getStatus();
      const l = s.license;

      body.appendChild(el('h2', null, 'Licence active'));
      body.appendChild(el('p', 'lead', s.plan
        ? s.plan.name + ' — bon jeu à vous deux.'
        : 'Bon jeu à vous deux.'));

      const sum = el('div', 'lic-summary');
      const row = (k, v) => {
        const d = el('div');
        d.appendChild(el('dt', null, k));
        d.appendChild(el('b', null, v));
        return d;
      };
      if (l) {
        sum.appendChild(row('Offre', s.plan ? s.plan.name : l.planId));
        sum.appendChild(row('Valable jusqu’au', l.expiresAt ? formatEpoch(l.expiresAt) : 'sans limite'));
        sum.appendChild(row('Appareil', l.deviceMode === 'fp' ? 'lié à celui-ci' : 'non lié'));
        sum.appendChild(row('Référence', l.id));
      }
      body.appendChild(sum);

      const unlocked = s.entitlements.describeFeatures();
      if (unlocked.length) {
        const note = el('div', 'lic-note ok');
        note.textContent = 'Débloqué : ' + unlocked.map(f => f.label).join(', ') + '.';
        body.appendChild(note);
      }

      const actions = el('div', 'lic-actions');
      actions.appendChild(this._btn('Fermer', '', () => this.close()));
      actions.appendChild(this._btn('Changer de licence', 'ghost', () => this.openActivation()));
      actions.appendChild(this._btn('💬 Support', 'ghost', () => this.contactSupport(l ? l.planId : null)));
      body.appendChild(actions);
    });
  }

  /**
   * Message d'état bloquant (licence refusée, appareil différent…).
   * Le message suit l'état PASSÉ EN ARGUMENT : après un refus
   * d'activation, l'utilisateur doit lire la raison du refus, pas
   * l'état général de son installation.
   */
  openBlocked(status) {
    this._open((body) => {
      const msg = status ? userMessage(status) : this.facade.getStatus().message;
      body.appendChild(el('h2', null, msg.title));
      body.appendChild(el('p', 'lead', msg.body));

      if (status === STATUS.LICENSE_DEVICE_MISMATCH) {
        body.appendChild(this._deviceRow('Communiquez ce code au support pour transférer votre licence.'));
      }

      const actions = el('div', 'lic-actions');
      actions.appendChild(this._btn('Voir les offres', '', () => this.openPlans()));
      actions.appendChild(this._btn('Saisir une licence', 'ghost', () => this.openActivation()));
      actions.appendChild(this._btn('💬 Support', 'ghost', () => this.contactSupport(null)));
      body.appendChild(actions);
    });
  }

  /** Ouvre l'écran le plus pertinent pour l'état courant. */
  open() {
    const s = this.facade.getStatus();
    switch (s.state) {
      case STATUS.LICENSE_ACTIVE: return this.openActive();
      case STATUS.DEMO_AVAILABLE:
      case STATUS.DEMO_ACTIVE: return this.openPlans();
      case STATUS.DEMO_EXPIRED: return this.openPlans('demo-expired');
      default: return this.openBlocked(s.state);
    }
  }

  contactSupport(planId) {
    const url = this.facade.supportLink(planId);
    try {
      window.open(url, '_blank', 'noopener');
    } catch (_) {
      location.href = url;
    }
  }

  /* ---------------------------------------------------------- */
  /* Fragments                                                  */
  /* ---------------------------------------------------------- */

  _btn(label, variant, fn) {
    const b = el('button', 'btn' + (variant ? ' ' + variant : '') + ' sm', label);
    b.type = 'button';
    b.onclick = fn;
    return b;
  }

  _deviceRow(hint) {
    const wrap = el('div', 'lic-device');
    const left = el('div');
    left.appendChild(el('div', 'lbl', 'Code de cet appareil'));
    left.appendChild(el('code', null, this.facade.identity.deviceCode));
    wrap.appendChild(left);
    const copy = this._btn('📋 Copier', 'ghost', () => {
      const code = this.facade.identity.deviceCode;
      if (navigator.clipboard && location.protocol !== 'file:') {
        navigator.clipboard.writeText(code).catch(() => prompt('Copiez ce code :', code));
      } else {
        prompt('Copiez ce code :', code);
      }
    });
    wrap.appendChild(copy);
    if (hint) {
      const h = el('div', 'lbl', hint);
      h.style.flexBasis = '100%';
      wrap.appendChild(h);
    }
    return wrap;
  }

  /* ---------------------------------------------------------- */
  /* Éléments persistants                                       */
  /* ---------------------------------------------------------- */

  /** Pilule d'état, cliquable, à placer dans le HUD ou l'entête. */
  createPill() {
    const pill = el('button', 'lic-pill');
    pill.type = 'button';
    pill.appendChild(el('span', 'dot'));
    const label = el('span', 'txt', '…');
    pill.appendChild(label);
    pill.onclick = () => this.open();
    pill._label = label;
    this._pills = this._pills || [];
    this._pills.push(pill);
    if (this._status) this._paintPill(pill, this._status);
    return pill;
  }

  _paintPill(pill, s) {
    const label = pill._label;
    pill.classList.remove('demo', 'warn', 'locked');
    switch (s.state) {
      case STATUS.LICENSE_ACTIVE:
        label.textContent = s.plan ? s.plan.name : 'Licence active';
        break;
      case STATUS.DEMO_ACTIVE:
        pill.classList.add('demo');
        if (s.warning) pill.classList.add('warn');
        label.textContent = 'Démo · ' + formatDuration(s.demo.remainingMs);
        break;
      case STATUS.DEMO_AVAILABLE:
        pill.classList.add('demo');
        label.textContent = 'Essayer 1 heure';
        break;
      default:
        pill.classList.add('locked');
        label.textContent = s.message.title;
    }
  }

  /**
   * Panneau d'accueil : mode courant, temps restant, actions.
   * @param {HTMLElement} container
   */
  createHomePanel() {
    const panel = el('div', 'glass lic-panel');
    const head = el('div', 'head');
    const left = el('div');
    const title = el('h3', null, '…');
    const sub = el('p', 'sub', '');
    left.appendChild(title);
    left.appendChild(sub);
    head.appendChild(left);
    panel.appendChild(head);

    const bar = el('div', 'lic-bar');
    bar.appendChild(el('i'));
    panel.appendChild(bar);

    const actions = el('div', 'lic-actions');
    panel.appendChild(actions);

    panel._parts = { title, sub, bar, actions };
    this._panels = this._panels || [];
    this._panels.push(panel);
    if (this._status) this._paintPanel(panel, this._status);
    return panel;
  }

  _paintPanel(panel, s) {
    const { title, sub, bar, actions } = panel._parts;
    actions.innerHTML = '';
    bar.style.display = 'none';
    bar.classList.remove('warn');

    switch (s.state) {
      case STATUS.LICENSE_ACTIVE: {
        title.textContent = s.plan ? s.plan.name : 'Licence active';
        sub.textContent = s.license && s.license.expiresAt
          ? 'Valable jusqu’au ' + formatEpoch(s.license.expiresAt) + '.'
          : 'Licence sans limite de durée.';
        actions.appendChild(this._btn('Ma licence', 'ghost', () => this.openActive()));
        actions.appendChild(this._btn('💬 Support', 'ghost', () => this.contactSupport(s.license ? s.license.planId : null)));
        break;
      }
      case STATUS.DEMO_AVAILABLE: {
        title.textContent = 'Essayez Averi pendant une heure';
        sub.textContent = 'Toutes les manches, gratuitement, sans compte ni carte.';
        actions.appendChild(this._btn('▶ Démarrer l’heure d’essai', '', () => {
          this.facade.startDemo();
        }));
        actions.appendChild(this._btn('Voir les offres', 'ghost', () => this.openPlans()));
        break;
      }
      case STATUS.DEMO_ACTIVE: {
        title.textContent = 'Démonstration en cours';
        const remaining = formatDuration(s.demo.remainingMs);
        sub.textContent = s.warning
          ? 'Il vous reste ' + remaining + '. Pensez à choisir une licence pour ne pas être interrompus.'
          : 'Temps restant : ' + remaining + '.';
        bar.style.display = 'block';
        if (s.warning) bar.classList.add('warn');
        const pct = Math.max(0, Math.min(100, (s.demo.remainingMs / s.demo.durationMs) * 100));
        bar.firstChild.style.width = pct + '%';
        actions.appendChild(this._btn('Voir les offres', s.warning ? '' : 'ghost', () => this.openPlans()));
        actions.appendChild(this._btn('J’ai une licence', 'ghost', () => this.openActivation()));
        break;
      }
      case STATUS.DEMO_EXPIRED: {
        title.textContent = 'Votre période de démonstration est terminée';
        sub.textContent = 'Choisissez une licence pour continuer à jouer.';
        for (const p of this.facade.publicPlans()) {
          actions.appendChild(this._btn(p.name + ' · ' + p.priceLabel, '', () => this.openCheckout(p)));
        }
        actions.appendChild(this._btn('J’ai une licence', 'ghost', () => this.openActivation()));
        break;
      }
      default: {
        title.textContent = s.message.title;
        sub.textContent = s.message.body;
        actions.appendChild(this._btn('Voir les offres', '', () => this.openPlans()));
        actions.appendChild(this._btn('Saisir une licence', 'ghost', () => this.openActivation()));
        actions.appendChild(this._btn('💬 Support', 'ghost', () => this.contactSupport(null)));
      }
    }
  }

  /** Appelée à chaque changement d'état par la façade. */
  update(status) {
    this._status = status;
    for (const p of (this._pills || [])) this._paintPill(p, status);
    for (const p of (this._panels || [])) this._paintPanel(p, status);
    if (this.onChange) this.onChange(status);
  }
}

export { STATUS, CURRENCY_LABEL, SUPPORT };
