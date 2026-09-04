/* ==========================================================
   AVERI — Mini-bundler ESM -> IIFE
   ----------------------------------------------------------
   Averi se distribue en un fichier HTML autonome, ouvrable en
   file:// sans serveur ni installation. Les modules ESM ne s'y
   chargent pas (CORS), et ajouter un bundler du marché ferait
   entrer une chaîne d'outils npm dans un projet qui n'en a
   aucune.

   Ce bundler résout ce cas précis, et rien d'autre : imports
   nommés relatifs, exports nommés, `export *`, pas de cycle.
   Toute construction non gérée provoque une erreur explicite
   plutôt qu'un bundle silencieusement faux.
   ========================================================== */

import { readFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';

const IMPORT_RE = /^[ \t]*import\s*\{([\s\S]*?)\}\s*from\s*['"](\.[^'"]+)['"]\s*;?[ \t]*$/gm;
const EXPORT_STAR_RE = /^[ \t]*export\s*\*\s*from\s*['"](\.[^'"]+)['"]\s*;?[ \t]*$/gm;
const EXPORT_LIST_RE = /^[ \t]*export\s*\{([\s\S]*?)\}\s*;?[ \t]*$/gm;
const EXPORT_DECL_RE = /^[ \t]*export\s+(const|let|var|function|class|async function)\s+([A-Za-z_$][\w$]*)/gm;

/** « a as b, c » -> [{local:'a', exported:'b'}, {local:'c', exported:'c'}] */
function parseSpecifiers(raw) {
  return raw.split(',').map(s => s.trim()).filter(Boolean).map(s => {
    const m = /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(s);
    return m ? { local: m[1], exported: m[2] } : { local: s, exported: s };
  });
}

function moduleId(root, absPath) {
  return relative(root, absPath).replace(/\\/g, '/');
}

/**
 * @param {string} entryPath point d'entrée absolu
 * @param {string} root racine servant à nommer les modules
 * @returns {{code:string, modules:string[]}}
 */
export function bundle(entryPath, root) {
  const modules = new Map();   // id -> { id, source, deps:[], exports:[] }
  const order = [];

  function load(absPath, stack) {
    const id = moduleId(root, absPath);
    if (modules.has(id)) return id;
    if (stack.includes(id)) {
      throw new Error('Cycle de dépendances détecté : ' + stack.concat(id).join(' -> '));
    }

    let source;
    try {
      source = readFileSync(absPath, 'utf8');
    } catch (_) {
      throw new Error('Module introuvable : ' + absPath);
    }

    if (/^\s*export\s+default/m.test(source)) {
      throw new Error(id + ' : `export default` non géré par ce bundler.');
    }
    if (/^\s*import\s+[A-Za-z_$]/m.test(source) || /^\s*import\s+['"]/m.test(source)) {
      throw new Error(id + ' : seuls les imports nommés relatifs sont gérés.');
    }

    const deps = [];
    const exportsList = [];
    const here = dirname(absPath);

    let out = source;

    // import { a, b as c } from './x.js'
    out = out.replace(IMPORT_RE, (_, specs, spec) => {
      const depAbs = resolve(here, spec);
      const depId = load(depAbs, stack.concat(id));
      deps.push(depId);
      const bindings = parseSpecifiers(specs)
        .map(s => (s.local === s.exported ? s.local : s.local + ': ' + s.exported))
        .join(', ');
      return `const { ${bindings} } = __averiRequire(${JSON.stringify(depId)});`;
    });

    // export * from './x.js'
    const reExports = [];
    out = out.replace(EXPORT_STAR_RE, (_, spec) => {
      const depAbs = resolve(here, spec);
      const depId = load(depAbs, stack.concat(id));
      deps.push(depId);
      reExports.push(depId);
      return `Object.assign(__averiExports, __averiRequire(${JSON.stringify(depId)}));`;
    });

    // export const / function / class
    out = out.replace(EXPORT_DECL_RE, (_, kind, name) => {
      exportsList.push({ local: name, exported: name });
      return kind + ' ' + name;
    });

    // export { a, b as c }
    out = out.replace(EXPORT_LIST_RE, (_, specs) => {
      for (const s of parseSpecifiers(specs)) exportsList.push(s);
      return '';
    });

    if (/^\s*export\s/m.test(out)) {
      const line = out.split('\n').find(l => /^\s*export\s/.test(l));
      throw new Error(id + ' : forme d’export non gérée -> ' + line.trim());
    }

    const assignments = exportsList
      .map(e => `__averiExports[${JSON.stringify(e.exported)}] = ${e.local};`)
      .join('\n');

    modules.set(id, { id, code: out + '\n' + assignments, deps });
    order.push(id);
    return id;
  }

  const entryId = load(resolve(entryPath), root);

  const body = order.map(id => {
    const m = modules.get(id);
    return `__averiDefine(${JSON.stringify(id)}, function (__averiExports, __averiRequire) {\n` +
           m.code.split('\n').map(l => (l ? '  ' + l : l)).join('\n') +
           `\n});`;
  }).join('\n\n');

  const code =
`var __averiModules = {};
function __averiDefine(id, factory) { __averiModules[id] = { factory: factory, exports: null }; }
function __averiRequire(id) {
  var m = __averiModules[id];
  if (!m) throw new Error('Module absent du bundle : ' + id);
  if (!m.exports) { m.exports = {}; m.factory(m.exports, __averiRequire); }
  return m.exports;
}

${body}

return __averiRequire(${JSON.stringify(entryId)});`;

  return { code, modules: order };
}
