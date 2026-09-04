#!/usr/bin/env node
/* ==========================================================
   AVERI — Construction des livrables
   ----------------------------------------------------------
   Injecte le code de licensing dans index.html et console.html,
   entre des marqueurs, de sorte que chaque livrable reste UN
   SEUL FICHIER autonome — la promesse du projet.

   Ce build est un outil de développement : l'utilisateur final
   n'a rien à installer et n'exécute jamais ce script.

   Vérifie enfin qu'aucune clé privée n'a fui dans les fichiers
   destinés au client (règle 29 de la spécification).
   ========================================================== */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from './bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SRC = join(ROOT, 'src');

const BEGIN = '/* AVERI:LICENSING:BEGIN — généré par tools/build.mjs, ne pas éditer à la main */';
const END = '/* AVERI:LICENSING:END */';

/** Motifs qui n'ont RIEN à faire dans un fichier livré au client. */
const FORBIDDEN_IN_CLIENT = [
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, why: 'clé privée PEM' },
  { re: /generateKeyPairSync|createPrivateKey/, why: 'primitive de génération de clé' },
  { re: /\bnode:crypto\b/, why: 'import Node côté client' },
  { re: /PRIVATE_KEY\s*=\s*['"][^'"]{16,}/, why: 'clé privée en dur' }
];

function buildTarget(htmlPath, entry, globalName) {
  if (!existsSync(htmlPath)) {
    console.log('  · ' + htmlPath.replace(ROOT + '/', '') + ' absent, ignoré');
    return null;
  }
  const html = readFileSync(htmlPath, 'utf8');
  const begin = html.indexOf(BEGIN);
  const end = html.indexOf(END);
  if (begin === -1 || end === -1) {
    throw new Error(htmlPath.replace(ROOT + '/', '') +
      ' : marqueurs AVERI:LICENSING:BEGIN/END introuvables.');
  }

  const { code, modules } = bundle(join(SRC, entry), SRC);
  const wrapped = BEGIN + '\n' +
    'window.' + globalName + ' = (function () {\n' +
    code.split('\n').map(l => (l ? '  ' + l : l)).join('\n') +
    '\n})();\n' + END;

  const out = html.slice(0, begin) + wrapped + html.slice(end + END.length);
  writeFileSync(htmlPath, out);

  return { file: htmlPath.replace(ROOT + '/', ''), modules: modules.length, bytes: wrapped.length };
}

function auditClientFiles(files) {
  const problems = [];
  for (const f of files) {
    if (!existsSync(f)) continue;
    const content = readFileSync(f, 'utf8');
    for (const rule of FORBIDDEN_IN_CLIENT) {
      if (rule.re.test(content)) {
        problems.push({ file: f.replace(ROOT + '/', ''), why: rule.why });
      }
    }
  }
  return problems;
}

console.log('\nAveri — construction des livrables\n');

const targets = [
  { html: join(ROOT, 'index.html'), entry: 'ui/public-entry.js', global: 'AveriLicense' },
  { html: join(ROOT, 'console.html'), entry: 'ui/console-entry.js', global: 'AveriConsole' }
];

const built = [];
for (const t of targets) {
  const r = buildTarget(t.html, t.entry, t.global);
  if (r) {
    built.push(r);
    console.log('  ✔ ' + r.file + '  (' + r.modules + ' modules, ' +
      (r.bytes / 1024).toFixed(1) + ' Ko injectés)');
  }
}

const problems = auditClientFiles(targets.map(t => t.html));
if (problems.length) {
  console.error('\n  ✘ SECRET DÉTECTÉ DANS UN FICHIER CLIENT :');
  for (const p of problems) console.error('     ' + p.file + ' — ' + p.why);
  console.error('\n  Build interrompu. Corrigez l’architecture avant de continuer.\n');
  process.exit(1);
}
console.log('\n  ✔ Aucun secret dans les fichiers livrés au client.\n');
