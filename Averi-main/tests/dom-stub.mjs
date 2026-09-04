/* ==========================================================
   AVERI — DOM minimal pour les tests d'interface
   ----------------------------------------------------------
   Juste assez pour que l'interface publique se construise et
   réagisse : pas un navigateur, mais suffisant pour vérifier
   que les écrans s'assemblent et que les actions déclenchent
   les bons appels à la façade.
   ========================================================== */

class ClassList {
  constructor(node) { this._n = node; this._s = new Set(); }
  add(...c) { for (const x of c) if (x) this._s.add(x); this._sync(); }
  remove(...c) { for (const x of c) this._s.delete(x); this._sync(); }
  toggle(c, force) {
    const on = force === undefined ? !this._s.has(c) : !!force;
    if (on) this._s.add(c); else this._s.delete(c);
    this._sync();
    return on;
  }
  contains(c) { return this._s.has(c); }
  _sync() { this._n._className = Array.from(this._s).join(' '); }
}

class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this._children = [];
    this.parentNode = null;
    this.style = {};
    this.attributes = {};
    this.listeners = {};
    this._textContent = '';
    this._className = '';
    this.classList = new ClassList(this);
    this.hidden = false;
    this.disabled = false;
    this.id = '';
    this.value = '';
    this.onclick = null;
  }
  get className() { return this._className; }
  set className(v) {
    this._className = String(v || '');
    this.classList._s = new Set(this._className.split(/\s+/).filter(Boolean));
  }
  /**
   * `children` est une HTMLCollection LIVE et EN LECTURE SEULE dans un
   * vrai DOM : `el.children.length = 0` n'y vide rien. La collection
   * retournée ici est donc figée, pour que ce genre de code échoue au
   * test au lieu d'échouer silencieusement dans le navigateur.
   */
  get children() {
    const arr = this._children;
    const col = {
      length: arr.length,
      item: (i) => arr[i] || null,
      [Symbol.iterator]: () => arr[Symbol.iterator](),
      map: (fn) => arr.map(fn),
      filter: (fn) => arr.filter(fn),
      forEach: (fn) => arr.forEach(fn)
    };
    for (let i = 0; i < arr.length; i++) col[i] = arr[i];
    return Object.freeze(col);
  }
  get textContent() {
    if (this._children.length) return this._children.map(c => c.textContent).join('');
    return this._textContent;
  }
  set textContent(v) { this._textContent = String(v == null ? '' : v); this._children = []; }
  get innerHTML() { return this._html || ''; }
  set innerHTML(v) { this._html = String(v); if (v === '') this._children = []; }
  get firstChild() { return this._children[0] || null; }
  appendChild(c) {
    c.parentNode = this;
    this._children.push(c);
    // Comportement réel d'un <select> : la première option devient la valeur.
    if (this.tagName === 'SELECT' && c.tagName === 'OPTION' && !this.value) this.value = c.value;
    return c;
  }
  removeChild(c) { this._children = this._children.filter(x => x !== c); return c; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'id') this.id = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  removeEventListener(t, fn) {
    if (this.listeners[t]) this.listeners[t] = this.listeners[t].filter(f => f !== fn);
  }
  dispatch(type, ev) { for (const fn of (this.listeners[type] || [])) fn(ev || { type }); }
  click() { if (this.onclick) this.onclick({ type: 'click', target: this }); }
  focus() { this._focused = true; }
  select() {}
  /** Parcours en profondeur — pratique pour retrouver un bouton par son texte. */
  *walk() {
    yield this;
    for (const c of this._children) yield* c.walk();
  }
  find(pred) { for (const n of this.walk()) if (pred(n)) return n; return null; }
  findAll(pred) { return Array.from(this.walk()).filter(pred); }
  findByText(txt) { return this.find(n => n !== this && n.textContent === txt); }
  querySelectorAll() { return []; }
}

/** Installe un DOM minimal dans les globales. Retourne la fonction de nettoyage. */
export function installDom() {
  const doc = new El('document');
  doc.head = doc.appendChild(new El('head'));
  doc.body = doc.appendChild(new El('body'));
  doc.visibilityState = 'visible';
  doc.createElement = (t) => new El(t);
  doc.createTextNode = (txt) => {
    const n = new El('#text');
    n.textContent = String(txt);
    return n;
  };
  doc.getElementById = (id) => doc.find(n => n.id === id);
  doc.querySelectorAll = () => [];

  // Bocal à cookies fidèle : chaque écriture ajoute ou remplace UNE paire,
  // et une date d'expiration passée la supprime. Sans cela, CookieBackend
  // serait testé contre une simple chaîne et son comportement resterait
  // inconnu.
  const jar = new Map();
  Object.defineProperty(doc, 'cookie', {
    configurable: true,
    get() { return Array.from(jar, ([k, v]) => k + '=' + v).join('; '); },
    set(raw) {
      const [pair, ...attrs] = String(raw).split(';');
      const eq = pair.indexOf('=');
      if (eq === -1) return;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1);
      const expires = attrs.map(a => a.trim()).find(a => /^expires=/i.test(a));
      if (expires && Date.parse(expires.slice(8)) < Date.now()) jar.delete(name);
      else jar.set(name, value);
    }
  });

  const win = new El('window');
  win.open = () => { win._opened = true; };

  // Certaines globales (navigator) sont exposées par Node en lecture
  // seule : on les remplace par une propriété configurable.
  const previous = {};
  const set = (k, v) => {
    previous[k] = Object.getOwnPropertyDescriptor(globalThis, k) || null;
    Object.defineProperty(globalThis, k, { value: v, writable: true, configurable: true });
  };

  set('document', doc);
  set('window', win);
  set('navigator', { userAgent: 'test', language: 'fr-FR', languages: ['fr-FR'], platform: 'test', hardwareConcurrency: 4 });
  set('screen', { width: 390, height: 844, colorDepth: 24 });
  set('location', { protocol: 'https:', href: 'https://averi.test/' });
  set('prompt', () => {});

  return {
    document: doc,
    window: win,
    cleanup() {
      for (const k of Object.keys(previous)) {
        if (previous[k]) Object.defineProperty(globalThis, k, previous[k]);
        else delete globalThis[k];
      }
    }
  };
}

export { El };
