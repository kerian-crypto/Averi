/* ==========================================================
   AVERI LICENSE CONSOLE — Interface PRIVÉE
   ----------------------------------------------------------
   Rien à voir avec l'interface publique : pas de vitre violette,
   pas de dégradés, pas de ton commercial. Une console dense,
   monospace, orientée données — destinée à l'administration et
   au support, pas au client.

   Elle ne débloque rien par elle-même : elle exige une licence
   privée valide et n'affiche que ce que les permissions de
   cette licence autorisent.

   ⚠ L'onglet « Generate » NE GÉNÈRE PAS de licence. Le client
   est structurellement incapable de signer (voir règle 16) :
   cet onglet prépare la commande à exécuter sur le poste
   d'émission, où vit la clé privée.
   ========================================================== */

import { STATUS, userMessage } from '../licensing/status.js';
import { formatEpoch, formatDuration, formatRelative } from '../licensing/clock.js';
import {
  PLANS, PUBLIC_PLAN_IDS, PRIVATE_PLAN_ID, PERMISSIONS, ALL_PERMISSIONS,
  FEATURES, DEMO_DURATION_MS, PRODUCT_ID, LICENSE_FORMAT_VERSION,
  SUPPORT, CURRENCY_LABEL, ACTIVE_KEY_ID, TRUSTED_KEYS, CONSOLE_PERMISSIONS
} from '../licensing/config.js';

const CSS = `
:root{
  --c-bg:#0d1117; --c-panel:#161b22; --c-panel2:#1c2129; --c-line:#2a323d;
  --c-ink:#d8e0ea; --c-dim:#7d8797; --c-accent:#4a9eff; --c-ok:#3fb950;
  --c-warn:#d29922; --c-err:#f85149; --c-mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
}
*{box-sizing:border-box}
body{margin:0;background:var(--c-bg);color:var(--c-ink);
  font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
code,.mono{font-family:var(--c-mono)}

.cs-shell{display:flex;min-height:100vh}
.cs-side{width:212px;flex:none;background:var(--c-panel);border-right:1px solid var(--c-line);
  display:flex;flex-direction:column;position:sticky;top:0;height:100vh}
.cs-brand{padding:16px 18px;border-bottom:1px solid var(--c-line)}
.cs-brand b{display:block;font-size:13px;letter-spacing:.02em}
.cs-brand span{display:block;font-size:11px;color:var(--c-dim);margin-top:2px}
.cs-nav{padding:8px 0;flex:1;overflow-y:auto}
.cs-nav button{display:block;width:100%;text-align:left;background:none;border:0;color:var(--c-dim);
  padding:8px 18px;font:inherit;cursor:pointer;border-left:2px solid transparent}
.cs-nav button:hover{color:var(--c-ink);background:rgba(255,255,255,.03)}
.cs-nav button.on{color:var(--c-ink);background:rgba(74,158,255,.08);border-left-color:var(--c-accent)}
.cs-nav button[disabled]{opacity:.35;cursor:not-allowed}
.cs-nav .grp{padding:12px 18px 4px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#5a6472}
.cs-foot{padding:12px 18px;border-top:1px solid var(--c-line);font-size:11px;color:var(--c-dim)}

.cs-main{flex:1;min-width:0;padding:22px 26px 60px}
.cs-head{display:flex;align-items:baseline;justify-content:space-between;gap:16px;
  padding-bottom:14px;border-bottom:1px solid var(--c-line);margin-bottom:20px;flex-wrap:wrap}
.cs-head h1{margin:0;font-size:17px;font-weight:600;letter-spacing:-.01em}
.cs-head p{margin:4px 0 0;color:var(--c-dim);font-size:12px}

.cs-cards{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));margin-bottom:22px}
.cs-card{background:var(--c-panel);border:1px solid var(--c-line);border-radius:6px;padding:14px 16px}
.cs-card .k{font-size:10px;letter-spacing:.13em;text-transform:uppercase;color:var(--c-dim)}
.cs-card .v{font-size:19px;font-weight:600;margin-top:6px;font-family:var(--c-mono)}
.cs-card .n{font-size:11px;color:var(--c-dim);margin-top:4px}

table.cs-tbl{width:100%;border-collapse:collapse;font-size:12px}
table.cs-tbl th{text-align:left;font-size:10px;letter-spacing:.12em;text-transform:uppercase;
  color:var(--c-dim);font-weight:600;padding:8px 10px;border-bottom:1px solid var(--c-line)}
table.cs-tbl td{padding:9px 10px;border-bottom:1px solid #1e242c;vertical-align:top}
table.cs-tbl tr:hover td{background:rgba(255,255,255,.02)}
table.cs-tbl td.mono{font-family:var(--c-mono);font-size:11.5px;word-break:break-all}

.cs-sec{background:var(--c-panel);border:1px solid var(--c-line);border-radius:6px;margin-bottom:18px}
.cs-sec>h2{margin:0;font-size:12px;font-weight:600;padding:12px 16px;border-bottom:1px solid var(--c-line);
  letter-spacing:.03em}
.cs-sec>.bd{padding:14px 16px}

.cs-badge{display:inline-block;padding:2px 8px;border-radius:3px;font-size:10.5px;font-weight:600;
  font-family:var(--c-mono);letter-spacing:.02em}
.cs-badge.ok{background:rgba(63,185,80,.15);color:var(--c-ok)}
.cs-badge.warn{background:rgba(210,153,34,.15);color:var(--c-warn)}
.cs-badge.err{background:rgba(248,81,73,.15);color:var(--c-err)}
.cs-badge.dim{background:rgba(125,135,151,.15);color:var(--c-dim)}

.cs-f{display:block;margin-bottom:12px}
.cs-f>span{display:block;font-size:10px;letter-spacing:.12em;text-transform:uppercase;
  color:var(--c-dim);margin-bottom:5px}
.cs-f input,.cs-f select,.cs-f textarea{width:100%;background:#0b0f14;border:1px solid var(--c-line);
  border-radius:4px;color:var(--c-ink);padding:8px 10px;font:12px var(--c-mono)}
.cs-f textarea{min-height:88px;resize:vertical;word-break:break-all}
.cs-f input:focus,.cs-f select:focus,.cs-f textarea:focus{outline:none;border-color:var(--c-accent)}
.cs-row{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}

.cs-btn{background:#21262d;border:1px solid var(--c-line);color:var(--c-ink);border-radius:4px;
  padding:7px 13px;font:12px inherit;cursor:pointer}
.cs-btn:hover{background:#2b323b;border-color:#3d4753}
.cs-btn.pri{background:var(--c-accent);border-color:var(--c-accent);color:#06121f;font-weight:600}
.cs-btn.pri:hover{filter:brightness(1.1)}
.cs-btn.dgr{border-color:rgba(248,81,73,.4);color:var(--c-err)}
.cs-btn.dgr:hover{background:rgba(248,81,73,.12)}
.cs-btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}

.cs-out{background:#0b0f14;border:1px solid var(--c-line);border-radius:4px;padding:12px;
  font:11.5px/1.65 var(--c-mono);white-space:pre-wrap;word-break:break-all;color:#9fb3c8;margin-top:12px}
.cs-note{border-left:2px solid var(--c-warn);background:rgba(210,153,34,.07);padding:10px 14px;
  font-size:12px;color:#e0c88a;margin:12px 0;line-height:1.6}
.cs-note.err{border-color:var(--c-err);background:rgba(248,81,73,.07);color:#f0a9a5}
.cs-note.ok{border-color:var(--c-ok);background:rgba(63,185,80,.07);color:#a8dcae}
.cs-empty{color:var(--c-dim);font-size:12px;padding:18px;text-align:center}

.cs-gate{max-width:440px;margin:14vh auto;background:var(--c-panel);border:1px solid var(--c-line);
  border-radius:8px;padding:26px}
.cs-gate h1{margin:0 0 6px;font-size:16px}
.cs-gate p{color:var(--c-dim);font-size:12.5px;margin:0 0 18px;line-height:1.6}

.cs-kv{display:grid;grid-template-columns:auto 1fr;gap:7px 18px;font-size:12px}
.cs-kv dt{color:var(--c-dim)}
.cs-kv dd{margin:0;font-family:var(--c-mono);font-size:11.5px;word-break:break-all}

/* Faits : libellé humain, valeur lisible, explication. */
.cs-facts{display:grid;gap:0}
.cs-fact{display:grid;grid-template-columns:190px 1fr;gap:4px 20px;padding:11px 0;
  border-bottom:1px solid #1e242c}
.cs-fact:last-child{border-bottom:0}
.cs-fact-k{color:var(--c-dim);font-size:12px;padding-top:1px}
.cs-fact-v{font-size:13px;display:flex;align-items:baseline;gap:9px;flex-wrap:wrap}
.cs-fact-n{grid-column:2;font-size:11.5px;line-height:1.55;color:#707d8d;margin-top:1px}
.cs-rel{color:var(--c-dim);font-size:11.5px}
@media(max-width:620px){.cs-fact{grid-template-columns:1fr}.cs-fact-n{grid-column:1}}

.cs-intro{color:#8b95a5;font-size:12.5px;line-height:1.65;margin:0 0 18px;max-width:70ch}
.cs-intro b{color:var(--c-ink);font-weight:600}

details.cs-raw{margin-top:14px;border-top:1px solid var(--c-line);padding-top:12px}
details.cs-raw>summary{cursor:pointer;color:var(--c-dim);font-size:11.5px;list-style:none;
  display:inline-flex;align-items:center;gap:6px;user-select:none}
details.cs-raw>summary::before{content:'▸';font-size:10px}
details.cs-raw[open]>summary::before{content:'▾'}
details.cs-raw>summary:hover{color:var(--c-ink)}
details.cs-raw>.bd{padding-top:12px}

.cs-actions{display:flex;gap:6px;flex-wrap:wrap}
.cs-tbl td .cs-actions{margin:-2px 0}
tr.on td{background:rgba(74,158,255,.06)}
`;

const el = (t, c, x) => {
  const n = document.createElement(t);
  if (c) n.className = c;
  if (x != null) n.textContent = x;
  return n;
};

/**
 * Traduction des codes d'anomalie. Un administrateur doit comprendre ce qui
 * s'est passé et ce que le système en a conclu, sans lire le code source.
 */
const ANOMALY_HELP = {
  clock_backwards: {
    what: 'La date de l’appareil a reculé',
    effect: 'Aucun temps de démonstration n’a été rendu'
  },
  clock_forward_jump: {
    what: 'La date a bondi en avant',
    effect: 'Toléré — souvent un changement de fuseau horaire'
  },
  seal_broken: {
    what: 'L’état de démonstration a été modifié à la main',
    effect: 'Démonstration considérée comme consommée'
  },
  corrupt_state: {
    what: 'L’état de démonstration était illisible',
    effect: 'Démonstration considérée comme consommée'
  },
  install_mismatch: {
    what: 'L’état provient d’une autre installation',
    effect: 'Démonstration considérée comme consommée'
  },
  state_restored_from_trial: {
    what: 'L’état avait disparu, reconstruit depuis le jeton d’essai',
    effect: 'Le temps déjà écoulé a été recalculé'
  },
  trial_token_tampered: {
    what: 'Le jeton d’essai a été modifié',
    effect: 'Démonstration considérée comme consommée'
  },
  trial_reconciled: {
    what: 'Un jeton d’essai antérieur a refait surface',
    effect: 'Sa date d’émission a été appliquée'
  },
  reset: {
    what: 'Démonstration réinitialisée depuis la console',
    effect: 'Un nouvel essai a été ouvert'
  }
};

/** Traduction des événements du journal. */
const EVENT_HELP = {
  'démo_démarrée': 'Démonstration lancée',
  'démo_réinitialisée': 'Démonstration remise à zéro',
  'réinit_démo_refusée': 'Remise à zéro refusée (permission manquante)',
  'activation_réussie': 'Licence activée',
  'activation_refusée': 'Licence refusée',
  'désactivation': 'Licence retirée de l’appareil',
  'licence_oubliée': 'Licence retirée du trousseau',
  'licence_descellée': 'Licence modifiée hors de l’application',
  'activation_descellée': 'Activation modifiée hors de l’application',
  'verdict_distant': 'Réponse du serveur de licences'
};

const BADGE = {
  LICENSE_ACTIVE: 'ok', DEMO_ACTIVE: 'ok',
  DEMO_AVAILABLE: 'dim', LICENSE_UNKNOWN: 'dim',
  DEMO_EXPIRED: 'warn', LICENSE_EXPIRED: 'warn', LICENSE_NOT_YET_VALID: 'warn'
};
const badgeFor = (status) => {
  const b = el('span', 'cs-badge ' + (BADGE[status] || 'err'), status);
  return b;
};

/* ---------------------------------------------------------- */

export class ConsoleApp {
  /**
   * @param {{facade:object, root:HTMLElement}} opts
   */
  constructor(opts) {
    this.facade = opts.facade;
    this.root = opts.root;
    this.tab = 'overview';
    /**
     * Message et saisie du verrou, conservés dans l'état de l'application.
     *
     * `activateLicense()` émet un changement d'état, auquel la console est
     * abonnée : l'écran est donc entièrement reconstruit AVANT qu'un message
     * posé après coup n'atteigne l'arbre. Écrire l'erreur dans un nœud gardé
     * en variable locale revient à l'écrire dans un écran déjà jeté — c'est
     * ce qui donnait l'impression que le bouton ne faisait rien.
     */
    this._gateError = null;
    this._gateDraft = '';
    this._injectStyles();
  }

  _injectStyles() {
    if (document.getElementById('averi-console-css')) return;
    const s = el('style');
    s.id = 'averi-console-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /** Rendu complet. Appelée à chaque changement d'état. */
  render() {
    this.root.innerHTML = '';
    if (!this.facade.canOpenConsole()) return this._renderGate();
    this._renderShell();
  }

  /* ---------------------------------------------------------- */
  /* Verrou                                                     */
  /* ---------------------------------------------------------- */

  _renderGate() {
    const box = el('div', 'cs-gate');
    box.appendChild(el('h1', null, 'Averi License Console'));
    box.appendChild(el('p', null,
      'Accès réservé. Cette console requiert une licence privée valide portant ' +
      'au moins une permission d’administration, de support, de diagnostic ou d’outillage interne. ' +
      'Une licence publique ou une démonstration ne l’ouvrent jamais.'));

    // Sans cette indication, un administrateur qui vient de déployer se
    // retrouve devant un champ vide sans savoir quoi y mettre.
    box.appendChild(el('div', 'cs-note',
      'Aucune licence privée ? Émettez-en une sur le poste d’administration :'));
    box.appendChild(el('div', 'cs-out',
      'node tools/license-generator/cli.mjs keygen\n' +
      'node tools/license-generator/cli.mjs generate \\\n' +
      '    --type private \\\n' +
      '    --permissions admin,diagnostics,internal_tools,testing \\\n' +
      '    --duration 1y'));

    const s = this.facade.getStatus();
    if (s.state === STATUS.LICENSE_ACTIVE && !s.isPrivate) {
      const n = el('div', 'cs-note', 'Une licence publique est active sur cet appareil. ' +
        'Les licences publiques n’ouvrent jamais la console.');
      box.appendChild(n);
    }

    const f = el('label', 'cs-f');
    f.appendChild(el('span', null, 'Licence privée'));
    const ta = el('textarea');
    ta.placeholder = 'AVR1.…';
    ta.spellcheck = false;
    ta.value = this._gateDraft || '';       // la saisie survit au re-rendu
    ta.addEventListener('input', () => { this._gateDraft = ta.value; });
    f.appendChild(ta);
    box.appendChild(f);

    if (this._gateError) box.appendChild(el('div', 'cs-note err', this._gateError));

    const btns = el('div', 'cs-btns');
    const go = el('button', 'cs-btn pri', 'Ouvrir la console');
    go.onclick = () => {
      this._gateDraft = ta.value;
      const token = ta.value.trim();
      if (!token) {
        this._gateError = 'Collez une licence privée pour continuer.';
        this.render();
        return;
      }
      this._gateError = null;
      const r = this.facade.activateLicense(token);
      if (r.ok && this.facade.canOpenConsole()) {
        this._gateError = null;
        this._gateDraft = '';
        this.render();
        return;
      }
      this._gateError = r.ok
        ? 'Licence valide, mais sans permission de console. Permissions requises : ' +
          CONSOLE_PERMISSIONS.join(', ') + '.'
        : r.status + ' — ' + (r.detail || r.message.body);
      this.render();
    };
    btns.appendChild(go);
    box.appendChild(btns);

    box.appendChild(el('div', 'cs-out',
      'device_fingerprint  ' + this.facade.identity.fingerprint + '\n' +
      'device_code         ' + this.facade.identity.deviceCode + '\n' +
      'product             ' + PRODUCT_ID + '\n' +
      'format_version      ' + LICENSE_FORMAT_VERSION));

    this.root.appendChild(box);
  }

  /* ---------------------------------------------------------- */
  /* Coquille                                                   */
  /* ---------------------------------------------------------- */

  _tabs() {
    const perm = (p) => this.facade.hasPermission(p);
    return [
      { group: 'Consulter' },
      { id: 'overview', label: 'Vue d’ensemble', ok: true },
      { id: 'licenses', label: 'Licences', ok: perm('admin') || perm('support') },
      { id: 'activations', label: 'Activations', ok: perm('admin') || perm('support') },
      { id: 'devices', label: 'Appareil', ok: perm('admin') || perm('support') || perm('diagnostics') },
      { group: 'Administrer' },
      { id: 'generate', label: 'Préparer une licence', ok: perm('admin') || perm('internal_tools') },
      { id: 'revocations', label: 'Révocations', ok: perm('admin') },
      { group: 'Système' },
      { id: 'logs', label: 'Journal', ok: perm('admin') || perm('internal_tools') || perm('support') },
      { id: 'diagnostics', label: 'Diagnostic', ok: perm('diagnostics') || perm('admin') },
      { id: 'settings', label: 'Configuration', ok: perm('admin') || perm('advanced_settings') }
    ];
  }

  _renderShell() {
    const shell = el('div', 'cs-shell');

    /* -- barre latérale -- */
    const side = el('aside', 'cs-side');
    const brand = el('div', 'cs-brand');
    brand.appendChild(el('b', null, 'Averi License Console'));
    brand.appendChild(el('span', null, PRODUCT_ID + ' · format v' + LICENSE_FORMAT_VERSION));
    side.appendChild(brand);

    const nav = el('nav', 'cs-nav');
    const tabs = this._tabs();
    if (!tabs.some(t => t.id === this.tab && t.ok)) this.tab = 'overview';
    for (const t of tabs) {
      if (t.group) { nav.appendChild(el('div', 'grp', t.group)); continue; }
      const b = el('button', this.tab === t.id ? 'on' : '', t.label);
      b.type = 'button';
      if (!t.ok) b.disabled = true;
      else b.onclick = () => { this.tab = t.id; this.render(); };
      nav.appendChild(b);
    }
    side.appendChild(nav);

    const s = this.facade.getStatus();
    const foot = el('div', 'cs-foot');
    foot.appendChild(el('div', null, 'Connecté avec'));
    foot.appendChild(el('div', null,
      (s.license && s.license.metadata && s.license.metadata.holder) ||
      (s.license ? s.license.id : '—')));
    foot.appendChild(el('div', null,
      this.facade.entitlements().permissions
        .map(p => (PERMISSIONS[p] ? PERMISSIONS[p].label : p)).join(' · ') || '—'));
    side.appendChild(foot);
    shell.appendChild(side);

    /* -- contenu -- */
    const main = el('main', 'cs-main');
    const views = {
      overview: () => this._viewOverview(main),
      licenses: () => this._viewLicenses(main),
      activations: () => this._viewActivations(main),
      devices: () => this._viewDevices(main),
      generate: () => this._viewGenerate(main),
      revocations: () => this._viewRevocations(main),
      logs: () => this._viewLogs(main),
      diagnostics: () => this._viewDiagnostics(main),
      settings: () => this._viewSettings(main)
    };
    (views[this.tab] || views.overview)();
    shell.appendChild(main);

    this.root.appendChild(shell);
  }

  /**
   * Fait lisible : libellé en clair, valeur formatée, explication.
   *
   * La console reste technique — elle affiche les identifiants bruts — mais
   * un champ nommé `nbf` ou `dlm` ne dit rien à qui n'a pas lu la
   * spécification. Chaque donnée porte donc son sens à côté d'elle, et les
   * formes brutes sont regroupées dans un bloc dépliable.
   *
   * @param {HTMLElement} parent
   * @param {Array<{k:string, v:any, note?:string, rel?:number, badge?:string}>} rows
   */
  _facts(parent, rows) {
    const wrap = el('div', 'cs-facts');
    for (const row of rows) {
      if (!row) continue;
      const f = el('div', 'cs-fact');
      f.appendChild(el('div', 'cs-fact-k', row.k));
      const v = el('div', 'cs-fact-v');
      if (row.badge) v.appendChild(el('span', 'cs-badge ' + row.badge, String(row.v)));
      else v.appendChild(el('span', null, row.v == null || row.v === '' ? '—' : String(row.v)));
      if (row.rel) {
        const r = formatRelative(row.rel);
        if (r) v.appendChild(el('span', 'cs-rel', r));
      }
      f.appendChild(v);
      if (row.note) f.appendChild(el('div', 'cs-fact-n', row.note));
      wrap.appendChild(f);
    }
    parent.appendChild(wrap);
    return wrap;
  }

  /** Bloc dépliable pour les formes brutes, repliées par défaut. */
  _raw(parent, label, pairs) {
    const d = el('details', 'cs-raw');
    d.appendChild(el('summary', null, label || 'Données brutes'));
    const bd = el('div', 'bd');
    d.appendChild(bd);
    if (Array.isArray(pairs)) this._kv(bd, pairs);
    parent.appendChild(d);
    return bd;
  }

  /**
   * Phrase d'introduction : à quoi sert cet onglet, et qu'en faire.
   * `**texte**` met en gras — composé en nœuds, jamais via innerHTML.
   */
  _intro(parent, text) {
    const p = el('p', 'cs-intro');
    for (const [i, part] of String(text).split('**').entries()) {
      if (!part) continue;
      p.appendChild(i % 2 ? el('b', null, part) : document.createTextNode(part));
    }
    parent.appendChild(p);
    return p;
  }

  /** Détail d'un événement, en clair plutôt qu'en JSON. */
  _describeDetail(detail) {
    if (!detail || typeof detail !== 'object') return '—';
    const parts = [];
    if (detail.licenseId) parts.push('licence ' + detail.licenseId);
    if (detail.planId) parts.push('offre ' + detail.planId);
    if (detail.status) parts.push('motif : ' + (userMessage(detail.status).title || detail.status));
    if (detail.durationMs) parts.push('durée ' + formatDuration(detail.durationMs));
    if (detail.reason) parts.push(String(detail.reason));
    return parts.length ? parts.join(' · ') : '—';
  }

  /** Date absolue + écart relatif, ou '—'. */
  _when(epochSec) {
    return epochSec ? formatEpoch(epochSec) : '—';
  }

  _head(parent, title, sub) {
    const h = el('div', 'cs-head');
    const left = el('div');
    left.appendChild(el('h1', null, title));
    if (sub) left.appendChild(el('p', null, sub));
    h.appendChild(left);
    parent.appendChild(h);
    return h;
  }

  _section(parent, title) {
    const s = el('section', 'cs-sec');
    s.appendChild(el('h2', null, title));
    const bd = el('div', 'bd');
    s.appendChild(bd);
    parent.appendChild(s);
    return bd;
  }

  _table(parent, columns, rows) {
    if (!rows.length) {
      parent.appendChild(el('div', 'cs-empty', 'Aucune donnée.'));
      return;
    }
    const t = el('table', 'cs-tbl');
    const thead = el('thead');
    const tr = el('tr');
    for (const c of columns) tr.appendChild(el('th', null, c));
    thead.appendChild(tr);
    t.appendChild(thead);
    const tb = el('tbody');
    for (const r of rows) {
      const line = el('tr');
      for (const cell of r) {
        const isNode = !!(cell && typeof cell === 'object' && typeof cell.tagName === 'string');
        const long = typeof cell === 'string' && /^[0-9a-fA-F-]{16,}$/.test(cell);
        const td = el('td', long ? 'mono' : null);
        if (isNode) td.appendChild(cell);
        else td.textContent = cell == null ? '—' : String(cell);
        line.appendChild(td);
      }
      tb.appendChild(line);
    }
    t.appendChild(tb);
    parent.appendChild(t);
  }

  _kv(parent, pairs) {
    const dl = el('dl', 'cs-kv');
    for (const [k, v] of pairs) {
      dl.appendChild(el('dt', null, k));
      dl.appendChild(el('dd', null, v == null ? '—' : String(v)));
    }
    parent.appendChild(dl);
  }

  /* ---------------------------------------------------------- */
  /* Vues                                                       */
  /* ---------------------------------------------------------- */

  _viewOverview(main) {
    const st = this.facade.getStatus();
    const d = this.facade.diagnostics();
    this._head(main, 'Vue d’ensemble', 'Ce que cet appareil est autorisé à faire, et pourquoi.');

    this._intro(main,
      'Cet écran répond à une seule question : ' +
      'l’application est-elle débloquée sur cet appareil, et par quoi — ' +
      'une licence ou la démonstration d’une heure ?');

    const cards = el('div', 'cs-cards');
    const card = (k, v, n) => {
      const c = el('div', 'cs-card');
      c.appendChild(el('div', 'k', k));
      c.appendChild(el('div', 'v', v));
      if (n) c.appendChild(el('div', 'n', n));
      cards.appendChild(c);
    };
    card('Accès', st.unlocked ? 'Ouvert' : 'Fermé',
      st.unlocked ? 'les fonctionnalités protégées répondent' : 'les fonctionnalités protégées sont bloquées');
    card('Ouvert par', st.state === STATUS.LICENSE_ACTIVE ? 'Une licence'
      : (st.state === STATUS.DEMO_ACTIVE ? 'La démonstration' : 'Rien'),
      st.plan ? st.plan.name : (st.state === STATUS.DEMO_ACTIVE ? 'essai gratuit' : '—'));
    card('Manches ouvertes',
      ['truth', 'never', 'likely', 'compat', 'c4', 'memory'].filter(g => this.facade.canPlay(g)).length + ' / 6',
      'sur les six manches du jeu');
    card('Licences mémorisées', String(this.facade.licenses().length),
      'sur cet appareil, toutes offres confondues');
    main.appendChild(cards);

    /* -- l'essentiel, en clair -- */
    const bd = this._section(main, 'Situation');
    const facts = [
      { k: 'État', v: st.message.title,
        badge: BADGE[st.state] || 'err',
        note: st.message.body }
    ];

    if (st.state === STATUS.DEMO_ACTIVE) {
      facts.push({
        k: 'Temps d’essai restant', v: formatDuration(st.demo.remainingMs),
        rel: st.demo.expiresAt,
        note: 'Sur une heure au total. À l’échéance, les manches se referment ' +
              'et l’écran des offres s’affiche.'
      });
    }
    if (st.license) {
      facts.push(
        { k: 'Offre active', v: (st.plan ? st.plan.name : st.license.planId),
          note: 'Détermine les manches et les options accessibles.' },
        { k: 'Échéance', v: this._when(st.license.expiresAt), rel: st.license.expiresAt * 1000,
          note: st.license.expiresAt
            ? 'Passé cette date, l’accès se referme jusqu’au renouvellement.'
            : 'Licence sans limite de durée.' },
        { k: 'Titulaire', v: (st.license.metadata && st.license.metadata.holder) || 'non renseigné',
          note: 'Inscrit à l’émission ; sert au support à retrouver le client.' }
      );
    }
    if (st.licenseIssue) {
      facts.push({ k: 'Licence installée', v: userMessage(st.licenseIssue).title, badge: 'warn',
        note: 'Une licence est présente mais inutilisable ; c’est la démonstration qui ouvre l’accès.' });
    }
    this._facts(bd, facts);

    /* -- ce qui est ouvert -- */
    const bd2 = this._section(main, 'Ce qui est débloqué');
    const feats = this.facade.entitlements().describeFeatures();
    if (!feats.length) {
      bd2.appendChild(el('div', 'cs-empty',
        'Rien n’est débloqué : ni licence valide, ni démonstration en cours.'));
    } else {
      const groupes = {};
      for (const f of feats) (groupes[f.group] = groupes[f.group] || []).push(f.label);
      this._facts(bd2, Object.keys(groupes).map(g => ({
        k: g, v: groupes[g].join(', '),
        note: groupes[g].length + ' élément(s) sur ce groupe'
      })));
      this._raw(bd2, 'Identifiants de features',
        feats.map(f => [f.id, f.label]));
    }

    /* -- signaux -- */
    const anomalies = st.demo.anomalies || [];
    if (anomalies.length) {
      const bd3 = this._section(main, 'Signaux relevés');
      bd3.appendChild(el('div', 'cs-note',
        'Ces événements sont enregistrés automatiquement. Ils n’accusent personne : ' +
        'un changement de fuseau horaire ou un nettoyage de navigateur les déclenche aussi.'));
      this._table(bd3, ['Quand', 'Ce qui a été constaté', 'Conséquence'],
        anomalies.slice().reverse().map(a => [
          formatEpoch(Math.floor(a.at / 1000)),
          ANOMALY_HELP[a.kind] ? ANOMALY_HELP[a.kind].what : a.kind,
          ANOMALY_HELP[a.kind] ? ANOMALY_HELP[a.kind].effect : '—'
        ]));
      this._raw(bd3, 'Codes bruts', anomalies.map(a => [a.kind, formatEpoch(Math.floor(a.at / 1000))]));
    }

    this._raw(main, 'Identifiants techniques', [
      ['state', st.state],
      ['product', d.product],
      ['plan_id', st.plan ? st.plan.id : '—'],
      ['license_id', st.license ? st.license.id : '—'],
      ['device_fingerprint', d.identity.fingerprint],
      ['validator', d.validators.active]
    ]);
  }

  _viewLicenses(main) {
    this._head(main, 'Licences', 'Les licences connues de cet appareil.');
    this._intro(main,
      'Plusieurs licences peuvent cohabiter ici — par exemple une licence client ' +
      'et une licence interne. **Une seule est active à la fois** et commande ' +
      'l’accès ; les autres sont simplement mémorisées pour pouvoir y revenir ' +
      'sans recoller le code. Elles ne se mélangent jamais : chacune porte sa ' +
      'propre signature et son propre verdict, recalculé à chaque affichage.');

    const licences = this.facade.licenses();
    const bd = this._section(main, 'Trousseau — ' + licences.length + ' licence(s)');

    if (!licences.length) {
      bd.appendChild(el('div', 'cs-empty',
        'Aucune licence sur cet appareil. Collez un code plus bas pour en ajouter une.'));
    } else {
      const t = el('table', 'cs-tbl');
      const thead = el('thead');
      const htr = el('tr');
      for (const c of ['', 'Offre', 'Titulaire', 'Échéance', 'Appareil', 'État', 'Action']) {
        htr.appendChild(el('th', null, c));
      }
      thead.appendChild(htr);
      t.appendChild(thead);

      const tb = el('tbody');
      for (const l of licences) {
        const tr = el('tr', l.active ? 'on' : '');

        tr.appendChild(el('td', null, l.active ? '●' : ''));

        const offre = el('td');
        offre.appendChild(el('div', null, l.planName));
        offre.appendChild(el('div', 'cs-rel', l.type === 'private' ? 'licence interne' : 'licence client'));
        tr.appendChild(offre);

        tr.appendChild(el('td', null, l.holder || '—'));

        const ech = el('td');
        ech.appendChild(el('div', null, l.expiresAt ? formatEpoch(l.expiresAt) : 'sans limite'));
        if (l.expiresAt) ech.appendChild(el('div', 'cs-rel', formatRelative(l.expiresAt * 1000)));
        tr.appendChild(ech);

        tr.appendChild(el('td', null, l.deviceBound ? 'liée à celui-ci' : 'non liée'));

        const etat = el('td');
        etat.appendChild(badgeFor(l.status));
        if (!l.valid) etat.appendChild(el('div', 'cs-rel', l.message.title));
        tr.appendChild(etat);

        const act = el('td');
        const box = el('div', 'cs-actions');
        if (!l.active && l.valid) {
          const b = el('button', 'cs-btn pri', 'Activer');
          b.onclick = () => { this.facade.switchLicense(l.id); this.render(); };
          box.appendChild(b);
        }
        const f = el('button', 'cs-btn dgr', 'Oublier');
        f.onclick = () => { this.facade.forgetLicense(l.id); this.render(); };
        box.appendChild(f);
        act.appendChild(box);
        tr.appendChild(act);

        tb.appendChild(tr);
      }
      t.appendChild(tb);
      bd.appendChild(t);

      bd.appendChild(el('div', 'cs-note',
        '« Activer » bascule l’accès sur cette licence — elle est revalidée au passage, ' +
        'donc une licence expirée ou révoquée depuis son ajout sera refusée. ' +
        '« Oublier » la retire de cet appareil ; le code reste utilisable ailleurs.'));

      this._raw(bd, 'Identifiants des licences',
        licences.map(l => [l.id, l.planId + ' · ' + l.status]));
    }

    /* -- détail de la licence active -- */
    const st = this.facade.getStatus();
    if (st.license) {
      const l = st.license;
      const bd2 = this._section(main, 'Licence active — détail');
      this._facts(bd2, [
        { k: 'Offre', v: st.plan ? st.plan.name : l.planId,
          note: 'Détermine les manches et options ouvertes.' },
        { k: 'Famille', v: l.type === 'private' ? 'Interne' : 'Client',
          note: l.type === 'private'
            ? 'Réservée à l’équipe. Ouvre cette console selon ses permissions.'
            : 'Vendue aux joueurs. N’ouvre jamais cette console.' },
        { k: 'Titulaire', v: (l.metadata && l.metadata.holder) || 'non renseigné',
          note: 'Renseigné à l’émission, sert à retrouver le client.' },
        { k: 'Référence de paiement', v: (l.metadata && l.metadata.ref) || 'non renseignée',
          note: 'À rapprocher du relevé mobile money.' },
        { k: 'Émise le', v: this._when(l.issuedAt), rel: l.issuedAt * 1000,
          note: 'Date de fabrication de la licence sur le poste d’administration.' },
        { k: 'Utilisable à partir du', v: this._when(l.notBefore), rel: l.notBefore * 1000,
          note: 'Une licence peut être préparée à l’avance et ne s’ouvrir que plus tard.' },
        { k: 'Échéance', v: l.expiresAt ? this._when(l.expiresAt) : 'sans limite',
          rel: l.expiresAt ? l.expiresAt * 1000 : 0,
          note: 'Au-delà, l’accès se referme jusqu’au renouvellement.' },
        { k: 'Liée à cet appareil', v: l.deviceMode === 'fp' ? 'Oui' : 'Non',
          badge: l.deviceMode === 'fp' ? 'ok' : 'dim',
          note: l.deviceMode === 'fp'
            ? 'Elle ne fonctionne que sur cette installation. C’est la seule limitation réellement contraignante hors ligne.'
            : 'Elle fonctionne partout où on la colle. Pour restreindre, réémettez-la avec l’empreinte de l’appareil.' },
        { k: 'Appareils déclarés', v: String(l.deviceLimit),
          note: l.deviceMode === 'fp'
            ? 'Appliqué par la liaison d’appareil.'
            : 'Indicatif seulement : sans liaison ni serveur, rien ne compte les activations.' },
        { k: 'Manches ouvertes', v: this.facade.entitlements().describeFeatures()
            .filter(f => f.group === 'Manches').map(f => f.label).join(', ') || '—',
          note: 'Ce que cette licence débloque dans le jeu.' },
        l.declaredPermissions.length ? {
          k: 'Permissions', v: l.declaredPermissions.map(p => (PERMISSIONS[p] ? PERMISSIONS[p].label : p)).join(', '),
          note: 'Ce que cette licence ouvre dans cette console.'
        } : null
      ].filter(Boolean));

      this._raw(bd2, 'Champs bruts de la licence', [
        ['license_id', l.id],
        ['license_type', l.type],
        ['plan_id', l.planId],
        ['product', l.product],
        ['format_version', l.formatVersion],
        ['iat (issued_at)', l.issuedAt],
        ['nbf (not_before)', l.notBefore],
        ['exp (expires_at)', l.expiresAt],
        ['dev.m (device_mode)', l.deviceMode],
        ['dev.v (fingerprint)', l.deviceFingerprint || '—'],
        ['dlm (device_limit)', l.deviceLimit],
        ['ftr (features)', l.declaredFeatures.join(', ')],
        ['prm (permissions)', l.declaredPermissions.join(', ') || '—'],
        ['iss (issuer)', l.issuer],
        ['kid (signing key)', l.keyId],
        ['met (metadata)', JSON.stringify(l.metadata)]
      ]);

      const btns = el('div', 'cs-btns');
      const copy = el('button', 'cs-btn', 'Copier le code de cette licence');
      copy.onclick = () => this._copy(l.token);
      btns.appendChild(copy);
      bd2.appendChild(btns);
    }

    /* -- ajout / inspection -- */
    const bd3 = this._section(main, 'Ajouter ou vérifier un code');
    bd3.appendChild(el('div', 'cs-note',
      '« Vérifier » lit le code sans rien changer — utile au support pour ' +
      'répondre à un client. « Ajouter et activer » l’installe sur cet appareil.'));

    const f = el('label', 'cs-f');
    f.appendChild(el('span', null, 'Code de licence'));
    const ta = el('textarea');
    ta.placeholder = 'AVR1.…';
    ta.spellcheck = false;
    f.appendChild(ta);
    bd3.appendChild(f);

    const out = el('div', 'cs-out', 'En attente d’un code.');
    const btns = el('div', 'cs-btns');

    const check = el('button', 'cs-btn', 'Vérifier');
    check.onclick = () => {
      const r = this.facade.inspect(ta.value.trim());
      out.textContent = this._formatInspection(r);
    };
    btns.appendChild(check);

    const add = el('button', 'cs-btn pri', 'Ajouter et activer');
    add.onclick = () => {
      const r = this.facade.activateLicense(ta.value.trim());
      if (r.ok) { this.render(); return; }
      out.textContent = r.message.title + '\n' + r.message.body +
        '\n\ncode interne : ' + r.status + (r.detail ? '\ndétail      : ' + r.detail : '');
    };
    btns.appendChild(add);
    bd3.appendChild(btns);
    bd3.appendChild(out);
  }

  _formatInspection(r) {
    const lines = ['status            ' + r.status];
    if (r.detail) lines.push('detail            ' + r.detail);
    if (r.license) {
      const l = r.license;
      lines.push(
        'license_id        ' + l.id,
        'type              ' + l.type,
        'plan_id           ' + l.planId,
        'issued_at         ' + formatEpoch(l.issuedAt),
        'not_before        ' + formatEpoch(l.notBefore),
        'expires_at        ' + (l.expiresAt ? formatEpoch(l.expiresAt) : 'perpétuelle'),
        'device_binding    ' + (l.deviceMode === 'fp' ? l.deviceFingerprint : 'none'),
        'device_limit      ' + l.deviceLimit,
        'key_id            ' + l.keyId,
        'declared_features ' + l.declaredFeatures.join(', '),
        'granted_features  ' + r.features.join(', '),
        'permissions       ' + (r.permissions.join(', ') || '—'),
        'metadata          ' + JSON.stringify(l.metadata)
      );
    }
    return lines.join('\n');
  }

  _viewActivations(main) {
    this._head(main, 'Activations', 'Quand et où la licence a été mise en service.');
    this._intro(main,
      'Une activation dit qu’une licence a été **posée sur cette installation**, ' +
      'et quand. Sans serveur, cette trace est locale : elle ne sait rien des ' +
      'autres appareils du même client.');

    const a = this.facade.activation.currentActivation();
    const bd = this._section(main, 'Activation courante');

    if (!a) {
      bd.appendChild(el('div', 'cs-empty',
        'Aucune licence n’a été activée sur cet appareil.'));
    } else {
      const check = this.facade.activation.checkActivationBinding();
      this._facts(bd, [
        { k: 'Licence', v: a.licenseId, note: 'Référence à citer au support.' },
        { k: 'Offre', v: a.planId, note: a.type === 'private' ? 'Licence interne.' : 'Licence client.' },
        { k: 'Activée le', v: this._when(Math.floor(a.activatedAt / 1000)), rel: a.activatedAt,
          note: 'Première mise en service sur cet appareil.' },
        { k: 'Vue pour la dernière fois', v: this._when(Math.floor(a.lastSeenAt / 1000)), rel: a.lastSeenAt,
          note: 'Dernière fois que cette licence a été confirmée ici.' },
        { k: 'Nombre d’activations', v: String(a.count),
          note: 'Recoller le même code ne l’incrémente pas ; changer de licence remet à 1.' },
        { k: 'Cohérence', v: check.ok ? 'Conforme' : 'Incohérente',
          badge: check.ok ? 'ok' : 'err',
          note: check.ok
            ? 'L’activation correspond bien à cette installation.'
            : check.reason + ' — le profil a probablement été copié d’une autre machine.' }
      ]);

      this._raw(bd, 'Champs bruts de l’activation', [
        ['license_id', a.licenseId],
        ['plan_id', a.planId],
        ['type', a.type],
        ['install_id', a.installId],
        ['device_fingerprint', a.deviceFingerprint],
        ['token_digest', a.tokenDigest],
        ['activated_at', a.activatedAt],
        ['last_seen_at', a.lastSeenAt],
        ['count', a.count]
      ]);
    }

    const bd2 = this._section(main, 'Ce que ce décompte ne dit pas');
    bd2.appendChild(el('div', 'cs-note',
      'Le champ « appareils déclarés » d’une licence n’est contraignant que si ' +
      'la licence a été émise liée à une empreinte. Sans cela, et sans serveur, ' +
      'rien ne peut compter les activations réparties sur plusieurs machines. ' +
      'Un décompte réel exige le validateur distant.'));
  }

  _viewDevices(main) {
    this._head(main, 'Appareil', 'L’identité de cette installation.');
    this._intro(main,
      'Chaque installation reçoit un identifiant **aléatoire**, pas une empreinte ' +
      'matérielle. C’est délibéré : une empreinte matérielle serait intrusive et ' +
      'instable — changer de résolution ou mettre à jour son navigateur casserait ' +
      'la licence d’un client légitime.');

    const d = this.facade.diagnostics();
    const bd = this._section(main, 'Identité');
    this._facts(bd, [
      { k: 'Code d’appareil', v: d.identity.deviceCode,
        note: 'C’est ce code que le client communique au support pour obtenir une licence liée à son téléphone.' },
      { k: 'Créée le', v: this._when(Math.floor(d.identity.createdAt / 1000)), rel: d.identity.createdAt,
        note: 'Date de première ouverture d’Averi sur cet appareil.' },
      { k: 'Matériel modifié', v: d.identity.traitsChanged ? 'Oui' : 'Non',
        badge: d.identity.traitsChanged ? 'warn' : 'ok',
        note: d.identity.traitsChanged
          ? 'L’environnement a changé depuis la création. Signal faible d’un profil déplacé — sans effet sur les droits.'
          : 'L’environnement est resté stable.' }
    ]);

    const btns = el('div', 'cs-btns');
    const c1 = el('button', 'cs-btn pri', 'Copier le code d’appareil');
    c1.onclick = () => this._copy(d.identity.deviceCode);
    btns.appendChild(c1);
    const c2 = el('button', 'cs-btn', 'Copier l’empreinte complète');
    c2.onclick = () => this._copy(d.identity.fingerprint);
    btns.appendChild(c2);
    bd.appendChild(btns);
    bd.appendChild(el('div', 'cs-note',
      'L’empreinte complète est ce qui se passe à `--device` lors de l’émission ' +
      'd’une licence liée. Le code d’appareil en est la forme courte, dictable au téléphone.'));

    this._raw(bd, 'Identifiants bruts', [
      ['install_id', d.identity.installId],
      ['device_fingerprint', d.identity.fingerprint],
      ['device_code', d.identity.deviceCode],
      ['traits_digest', d.identity.traitsDigest]
    ]);

    const bd2 = this._section(main, 'Environnement — diagnostic seulement');
    bd2.appendChild(el('div', 'cs-note',
      'Ces informations ne participent pas à l’empreinte et ne bloquent rien. ' +
      'Elles aident seulement le support à comprendre un cas particulier.'));
    const LIB = {
      platform: 'Système', language: 'Langue', languages: 'Langues acceptées',
      timezone: 'Fuseau horaire', screen: 'Écran', cores: 'Cœurs processeur',
      memory: 'Mémoire (Go)', touch: 'Points tactiles', ua: 'Navigateur'
    };
    this._table(bd2, ['Caractéristique', 'Valeur'],
      Object.keys(d.identity.traits).map(k => [LIB[k] || k, String(d.identity.traits[k] || '—')]));
  }

  _viewGenerate(main) {
    this._head(main, 'Préparer une licence',
      'Compose la commande d’émission. Aucune licence n’est signée ici.');

    this._intro(main,
      'Cette console **ne peut pas** fabriquer de licence, et c’est voulu : ' +
      'l’application ne détient que la clé publique de vérification. Si elle ' +
      'savait signer, n’importe qui pourrait s’émettre une licence en lisant ' +
      'son code. Renseignez les champs, copiez la commande, exécutez-la sur le ' +
      'poste d’administration — le seul endroit où vit la clé privée.');

    const bd = this._section(main, 'Paramètres de la licence à émettre');
    const row1 = el('div', 'cs-row');

    const mk = (label, node) => {
      const f = el('label', 'cs-f');
      f.appendChild(el('span', null, label));
      f.appendChild(node);
      return f;
    };

    const type = el('select');
    for (const t of ['public', 'private']) {
      const o = el('option', null, t);
      o.value = t;
      type.appendChild(o);
    }
    row1.appendChild(mk('Famille (public = client, private = interne)', type));

    const plan = el('select');
    const fillPlans = () => {
      plan.innerHTML = '';
      const ids = type.value === 'private' ? [PRIVATE_PLAN_ID] : PUBLIC_PLAN_IDS;
      for (const id of ids) {
        const o = el('option', null, id);
        o.value = id;
        plan.appendChild(o);
      }
    };
    fillPlans();
    row1.appendChild(mk('Offre', plan));

    const duration = el('input');
    duration.value = '30d';
    row1.appendChild(mk('Durée (30d, 12h, 8w, 1y)', duration));
    bd.appendChild(row1);

    const row2 = el('div', 'cs-row');
    const device = el('input');
    device.placeholder = 'empreinte de l’appareil — vide = licence non liée';
    row2.appendChild(mk('Appareil du client', device));
    const holder = el('input');
    holder.placeholder = 'nom ou numéro de téléphone';
    row2.appendChild(mk('Titulaire', holder));
    const ref = el('input');
    ref.placeholder = 'référence du paiement mobile money';
    row2.appendChild(mk('Référence de paiement', ref));
    bd.appendChild(row2);

    const perms = el('input');
    perms.placeholder = ALL_PERMISSIONS.join(',');
    const permField = mk('Permissions (licences internes uniquement)', perms);
    bd.appendChild(permField);

    const out = el('div', 'cs-out', '');
    const build = () => {
      const parts = ['node tools/license-generator/cli.mjs generate',
        '--type ' + type.value, '--plan ' + plan.value];
      if (duration.value.trim()) parts.push('--duration ' + duration.value.trim());
      if (device.value.trim()) parts.push('--device ' + device.value.trim());
      if (holder.value.trim()) parts.push('--holder ' + JSON.stringify(holder.value.trim()));
      if (ref.value.trim()) parts.push('--ref ' + JSON.stringify(ref.value.trim()));
      if (type.value === 'private' && perms.value.trim()) parts.push('--permissions ' + perms.value.trim());
      out.textContent = parts.join(' \\\n    ');
    };
    type.addEventListener('change', () => { fillPlans(); build(); });
    for (const n of [plan, duration, device, holder, ref, perms]) {
      n.addEventListener('input', build);
      n.addEventListener('change', build);
    }
    build();

    const btns = el('div', 'cs-btns');
    const copy = el('button', 'cs-btn pri', 'Copier la commande');
    copy.onclick = () => this._copy(out.textContent);
    btns.appendChild(copy);
    const useThis = el('button', 'cs-btn', 'Lier à cet appareil');
    useThis.onclick = () => { device.value = this.facade.identity.fingerprint; build(); };
    btns.appendChild(useThis);
    bd.appendChild(btns);
    bd.appendChild(out);

    bd.appendChild(el('div', 'cs-note',
      'Laisser « Appareil du client » vide produit une licence qui fonctionne ' +
      'partout où on la colle. Pour qu’elle ne serve qu’à un seul téléphone, ' +
      'demandez au client son code d’appareil et renseignez-le ici.'));

    const bd2 = this._section(main, 'Catalogue des offres');
    this._table(bd2, ['Offre', 'Nom commercial', 'Prix', 'Durée par défaut', 'Contenu'],
      PUBLIC_PLAN_IDS.map(id => [
        id, PLANS[id].name,
        PLANS[id].price.toLocaleString('fr-FR') + ' ' + CURRENCY_LABEL,
        PLANS[id].default_duration_days + ' jours',
        PLANS[id].features.length + ' options sur ' + Object.keys(FEATURES).length
      ]));

    const bd3 = this._section(main, 'Permissions des licences internes');
    this._table(bd3, ['Permission', 'Ce qu’elle ouvre'],
      ALL_PERMISSIONS.map(p => [PERMISSIONS[p].label, PERMISSIONS[p].desc]));
    this._raw(bd3, 'Identifiants à passer à --permissions',
      ALL_PERMISSIONS.map(p => [p, PERMISSIONS[p].label]));
  }

  _viewRevocations(main) {
    this._head(main, 'Révocations', 'Les licences refusées sur cet appareil.');

    this._intro(main,
      'Révoquer une licence, c’est la refuser même si elle est valide et non ' +
      'expirée — par exemple après un remboursement ou une diffusion publique. ' +
      '**Sans serveur, une révocation ne voyage pas** : celle que vous ajoutez ' +
      'ici ne vaut que pour cette installation.');

    main.appendChild(el('div', 'cs-note',
      'Pour révoquer une licence chez tous vos clients, il faut l’inscrire dans ' +
      'EMBEDDED_REVOCATIONS (src/licensing/revocation.js), reconstruire et ' +
      'republier l’application : les clients l’appliqueront à la mise à jour. ' +
      'La commande `cli.mjs revoke <id>` prépare cette liste.'));

    const list = this.facade.revocations.list();
    const bd = this._section(main, 'Livrées avec l’application — actives chez tous les clients');
    this._table(bd, ['Licence', 'Motif'],
      list.embedded.map(id => [id, list.reasons[id] || '—']));

    const bd2 = this._section(main, 'Ajoutées sur cet appareil seulement');
    this._table(bd2, ['Licence', 'Motif', ''],
      list.local.map(id => {
        const b = el('button', 'cs-btn dgr', 'Retirer');
        b.onclick = () => { this.facade.revocations.remove(id); this.render(); };
        return [id, list.reasons[id] || '—', b];
      }));

    const f = el('label', 'cs-f');
    f.appendChild(el('span', null, 'Identifiant de la licence à refuser'));
    const input = el('input');
    input.placeholder = 'AVR-XXXXXXXX';
    f.appendChild(input);
    bd2.appendChild(f);
    const f2 = el('label', 'cs-f');
    f2.appendChild(el('span', null, 'Motif (remboursement, diffusion…)'));
    const reason = el('input');
    f2.appendChild(reason);
    bd2.appendChild(f2);
    const btns = el('div', 'cs-btns');
    const add = el('button', 'cs-btn pri', 'Révoquer localement');
    add.onclick = () => {
      const id = input.value.trim();
      if (!id) return;
      this.facade.revocations.add(id, reason.value.trim() || null);
      this.render();
    };
    btns.appendChild(add);
    bd2.appendChild(btns);
  }

  _viewLogs(main) {
    this._head(main, 'Journal', 'Ce qui s’est passé sur cet appareil.');
    this._intro(main,
      'Historique local des événements de licence, du plus récent au plus ancien. ' +
      'Il ne contient **aucune donnée personnelle** et reste sur l’appareil. ' +
      'Il aide le support à comprendre ce qu’un client a réellement fait.');

    const entries = this.facade.journal.list();
    const bd = this._section(main, entries.length + ' événement(s) enregistré(s)');
    this._table(bd, ['Quand', 'Événement', 'Précisions'],
      entries.map(e => [
        formatEpoch(Math.floor(e.at / 1000)),
        EVENT_HELP[e.event] || e.event,
        this._describeDetail(e.detail)
      ]));
    this._raw(bd, 'Codes bruts des événements',
      entries.slice(0, 40).map(e => [e.event, JSON.stringify(e.detail)]));
    if (this.facade.hasPermission('admin') || this.facade.hasPermission('internal_tools')) {
      const btns = el('div', 'cs-btns');
      const exp = el('button', 'cs-btn', 'Copier en JSON');
      exp.onclick = () => this._copy(JSON.stringify(entries, null, 2));
      btns.appendChild(exp);
      const clr = el('button', 'cs-btn dgr', 'Vider le journal');
      clr.onclick = () => { this.facade.journal.clear(); this.render(); };
      btns.appendChild(clr);
      bd.appendChild(btns);
    }
  }

  _viewDiagnostics(main) {
    this._head(main, 'Diagnostic', 'L’état technique de cette installation.');
    this._intro(main,
      'À consulter quand quelque chose ne se comporte pas comme prévu. ' +
      'Chaque ligne indique ce qui est mesuré et ce qu’il faut en conclure.');

    const d = this.facade.diagnostics();

    /* -- où sont écrites les données -- */
    const bd = this._section(main, 'Où les données sont conservées');
    const depots = d.storage.backends.concat(d.storage.mirror ? [d.storage.mirror] : []);
    const NOM = {
      localStorage: 'Stockage du navigateur',
      cookie: 'Cookie',
      indexeddb: 'Base locale (IndexedDB)',
      'memory-fallback': 'Mémoire vive (temporaire)',
      memory: 'Mémoire vive (temporaire)'
    };
    this._table(bd, ['Emplacement', 'Disponible', 'Rôle'],
      depots.map(b => [
        NOM[b.name] || b.name,
        b.available ? 'oui' : 'non',
        b.name === 'indexeddb'
          ? 'Copie de secours, relue au démarrage'
          : (b.name.indexOf('memory') === 0
              ? 'Dernier recours : tout est perdu à la fermeture'
              : 'Dépôt principal, écrit en double')
      ]));
    bd.appendChild(el('div', 'cs-note',
      'Les données sont écrites dans plusieurs emplacements à la fois. ' +
      'Si l’un est vidé, le suivant le réapprovisionne au chargement suivant. ' +
      'Si seule la mémoire vive est disponible — navigation privée très ' +
      'restrictive — rien ne survivra à la fermeture de l’onglet.'));

    /* -- intégrité -- */
    const evs = d.storage.integrityEvents;
    const bd2 = this._section(main, 'Intégrité des données locales');
    if (!evs.length) {
      bd2.appendChild(el('div', 'cs-empty', 'Rien à signaler : aucune donnée manquante ni modifiée.'));
    } else {
      const KIND = {
        record_missing: 'Donnée absente d’un emplacement — réinstallée depuis un autre',
        record_unreadable: 'Donnée illisible dans un emplacement',
        seal_mismatch: 'Donnée modifiée hors de l’application',
        mirror_restored: 'Données restaurées depuis la copie de secours'
      };
      this._table(bd2, ['Quand', 'Constat', 'Emplacement'],
        evs.slice().reverse().map(e => [
          formatEpoch(Math.floor(e.at / 1000)),
          KIND[e.kind] || e.kind,
          (e.backends || (e.backend ? [e.backend] : [])).join(', ') || (e.count ? e.count + ' entrée(s)' : '—')
        ]));
    }

    /* -- démonstration -- */
    const t = d.demo.trialToken;
    const bd3 = this._section(main, 'Démonstration');
    this._facts(bd3, [
      { k: 'Durée accordée', v: formatDuration(d.demo.durationMs),
        note: 'Identique pour tous les appareils.' },
      { k: 'État', v: d.demo.status, badge: BADGE[d.demo.status] || 'err',
        note: 'DEMO_AVAILABLE = jamais lancée · DEMO_ACTIVE = en cours · DEMO_EXPIRED = consommée.' },
      { k: 'Démarrée le', v: d.demo.startedAt,
        note: 'Instant du tout premier lancement de l’essai.' },
      { k: 'Temps restant', v: d.demo.remaining,
        note: 'Calculé sur le plus défavorable de deux mesures : l’horloge et le temps réellement passé dans l’application.' },
      { k: 'Jeton d’essai', v: t ? 'présent' : 'absent',
        badge: t ? 'ok' : 'dim',
        note: t
          ? 'Trace indépendante conservée à part : effacer l’état de démonstration ne rend pas un nouvel essai.'
          : 'Aucun essai n’a encore été lancé sur cette installation.' },
      t ? { k: 'Essai ouvert le', v: this._when(Math.floor(t.issuedAt / 1000)), rel: t.issuedAt,
            note: 'Date figée à la première activation, jamais rafraîchie.' } : null,
      t ? { k: 'Jeton cohérent', v: (!t.tampered && t.matchesInstall) ? 'Oui' : 'Non',
            badge: (!t.tampered && t.matchesInstall) ? 'ok' : 'err',
            note: (!t.tampered && t.matchesInstall)
              ? 'Le jeton correspond bien à cette installation.'
              : 'Jeton modifié ou venant d’une autre installation : la démonstration est traitée comme consommée.' } : null
    ].filter(Boolean));

    if (d.demo.anomalies && d.demo.anomalies.length) {
      this._table(bd3, ['Quand', 'Constat', 'Conséquence'],
        d.demo.anomalies.slice().reverse().map(a => [
          formatEpoch(Math.floor(a.at / 1000)),
          ANOMALY_HELP[a.kind] ? ANOMALY_HELP[a.kind].what : a.kind,
          ANOMALY_HELP[a.kind] ? ANOMALY_HELP[a.kind].effect : '—'
        ]));
    }

    /* -- vérification -- */
    const bd4 = this._section(main, 'Vérification des licences');
    this._facts(bd4, [
      { k: 'Signature', v: 'Ed25519',
        note: 'Chaque licence est signée sur le poste d’administration. L’application ne détient que la clé publique : elle vérifie, elle ne peut pas émettre.' },
      { k: 'Mode', v: d.validators.active === 'hybrid' ? 'Local (serveur non configuré)' : d.validators.active,
        note: 'Tout est vérifié sur l’appareil. Aucune connexion n’est nécessaire pour jouer.' },
      { k: 'Serveur de licences', v: d.validators.remoteConfigured ? 'configuré' : 'aucun',
        badge: d.validators.remoteConfigured ? 'ok' : 'dim',
        note: d.validators.remoteConfigured
          ? 'Le serveur peut retirer un accès (révocation), jamais en accorder un que le local refuse.'
          : 'Tant qu’il n’y en a pas : pas de révocation immédiate, pas de décompte multi-appareils.' },
      { k: 'Clés de confiance', v: Object.keys(TRUSTED_KEYS).join(', ') || 'aucune',
        note: 'Clés publiques acceptées. Plusieurs peuvent coexister le temps d’une rotation.' },
      { k: 'Clé d’émission courante', v: ACTIVE_KEY_ID,
        note: 'Les licences émises aujourd’hui portent cet identifiant.' }
    ]);

    /* -- outils de test -- */
    if (this.facade.hasPermission('testing')) {
      const bd5 = this._section(main, 'Outils de test');
      bd5.appendChild(el('div', 'cs-note',
        'Réservé à la permission « Tests ». Rouvre un essai d’une heure sur cet ' +
        'appareil en effaçant l’état ET le jeton d’essai. N’existe dans aucun ' +
        'parcours client.'));
      const btns = el('div', 'cs-btns');
      const reset = el('button', 'cs-btn dgr', 'Rouvrir un essai d’une heure');
      reset.onclick = () => { this.facade.resetDemo('console privée'); this.render(); };
      btns.appendChild(reset);
      bd5.appendChild(btns);
    }

    /* -- export -- */
    const bd6 = this._section(main, 'Rapport complet');
    bd6.appendChild(el('div', 'cs-note',
      'À joindre à une demande d’assistance. Ne contient ni licence complète ni donnée personnelle.'));
    const btns = el('div', 'cs-btns');
    const copy = el('button', 'cs-btn pri', 'Copier le rapport');
    copy.onclick = () => this._copy(JSON.stringify(d, null, 2));
    btns.appendChild(copy);
    bd6.appendChild(btns);
    this._raw(bd6, 'Voir le rapport brut').appendChild(
      el('div', 'cs-out', JSON.stringify(d, null, 2)));
  }

  _viewSettings(main) {
    this._head(main, 'Configuration', 'Les valeurs qui régissent le produit.');
    this._intro(main,
      'Tout ce qui suit vient d’un **seul fichier**, `src/licensing/config.js`. ' +
      'Ces valeurs ne sont pas modifiables depuis la console, et c’est ' +
      'volontaire : les changer ici n’aurait aucun effet sur les licences déjà ' +
      'signées, qui portent leurs propres droits. Pour modifier une offre, ' +
      'éditez le fichier puis relancez `npm run build`.');

    const bd = this._section(main, 'Produit');
    this._facts(bd, [
      { k: 'Identifiant produit', v: PRODUCT_ID,
        note: 'Une licence émise pour un autre produit est refusée.' },
      { k: 'Version du format', v: String(LICENSE_FORMAT_VERSION),
        note: 'Les licences émises aujourd’hui commencent par AVR' + LICENSE_FORMAT_VERSION + '.' },
      { k: 'Durée de l’essai gratuit', v: formatDuration(DEMO_DURATION_MS),
        note: 'Identique pour toutes les offres, sur chaque installation.' },
      { k: 'Clé de signature courante', v: ACTIVE_KEY_ID,
        note: 'Change lors d’une rotation de clé ; les anciennes licences restent valides.' }
    ]);

    const bd2 = this._section(main, 'Offres commercialisées');
    for (const id of PUBLIC_PLAN_IDS) {
      const p = PLANS[id];
      const box = el('div');
      this._facts(box, [
        { k: p.name, v: p.price.toLocaleString('fr-FR') + ' ' + CURRENCY_LABEL,
          note: p.tagline },
        { k: 'Durée par défaut', v: p.default_duration_days + ' jours',
          note: 'Surchargeable à l’émission avec --duration.' },
        { k: 'Ce qui est inclus', v: p.features.map(f => (FEATURES[f] ? FEATURES[f].label : f)).join(', '),
          note: p.features.length + ' options sur ' + Object.keys(FEATURES).length },
        { k: 'Ce qui n’est pas inclus',
          v: Object.keys(FEATURES).filter(f => p.features.indexOf(f) === -1)
               .map(f => FEATURES[f].label).join(', ') || 'rien, l’offre est complète',
          note: 'Ces options ouvrent l’écran des offres si le joueur y touche.' }
      ]);
      bd2.appendChild(box);
      this._raw(box, 'Identifiants — ' + id,
        p.features.map(f => [f, FEATURES[f] ? FEATURES[f].label : f]));
    }

    const bd3 = this._section(main, 'Licences internes');
    this._facts(bd3, [
      { k: 'Offre réservée', v: PRIVATE_PLAN_ID,
        note: 'Jamais vendue. Une licence client ne peut pas la porter, et inversement.' },
      { k: 'Ouvre cette console', v: CONSOLE_PERMISSIONS.map(p => PERMISSIONS[p].label).join(', '),
        note: 'Il suffit d’une de ces permissions pour entrer ; chaque onglet applique ensuite sa propre règle.' }
    ]);
    this._table(bd3, ['Permission', 'Ce qu’elle ouvre'],
      ALL_PERMISSIONS.map(p => [PERMISSIONS[p].label, PERMISSIONS[p].desc]));

    const bd4 = this._section(main, 'Support client');
    this._facts(bd4, [
      { k: 'WhatsApp', v: SUPPORT.display,
        note: 'Le bouton « Contacter le support » de l’application ouvre ce numéro, message pré-rempli.' },
      { k: 'Courriel', v: SUPPORT.email, note: 'Affiché en second recours.' }
    ]);
    if (SUPPORT.whatsapp === '237600000000') {
      bd4.appendChild(el('div', 'cs-note',
        'Ce numéro est un espace réservé. Remplacez-le dans src/licensing/config.js ' +
        'avant la mise en production, puis relancez le build.'));
    }
  }

  /* ---------------------------------------------------------- */

  _copy(text) {
    try {
      if (navigator.clipboard && location.protocol !== 'file:') {
        navigator.clipboard.writeText(text).catch(() => prompt('Copier :', text));
        return;
      }
    } catch (_) {}
    prompt('Copier :', text);
  }
}
