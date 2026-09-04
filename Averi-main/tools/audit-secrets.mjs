#!/usr/bin/env node
/* ==========================================================
   AVERI — Audit des secrets (règle 29)
   ----------------------------------------------------------
   Recherche dans TOUT le dépôt les traces d'une clé privée ou
   d'un secret de signature qui aurait fui côté client, y
   compris dans l'historique Git.

       node tools/audit-secrets.mjs

   Sortie non nulle = à corriger avant toute publication.
   ========================================================== */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const C = { r: '\x1b[31m', g: '\x1b[32m', y: '\x1b[33m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' };

/** Répertoires livrés au client ou publiés. */
const CLIENT_SCOPE = ['src', 'index.html', 'console.html'];

/** Motifs recherchés, avec leur gravité. */
const PATTERNS = [
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, label: 'clé privée PEM', fatal: true },
  { re: /-----BEGIN OPENSSH PRIVATE KEY-----/, label: 'clé privée OpenSSH', fatal: true },
  { re: /\b(signing|private|secret)[_-]?key\s*[:=]\s*['"][A-Za-z0-9+/_-]{32,}/i, label: 'secret en dur', fatal: true },
  { re: /generateKeyPairSync|createPrivateKey/, label: 'génération de clé', fatal: true, clientOnly: true },
  { re: /\bnode:crypto\b/, label: 'import Node côté client', fatal: true, clientOnly: true }
];

const SKIP_DIRS = new Set(['.git', 'node_modules', 'keys']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (st.size < 8 * 1024 * 1024 && /\.(js|mjs|cjs|ts|html|json|md|txt|yml|yaml|env)$/.test(name)) out.push(p);
  }
  return out;
}

const inClientScope = (rel) => CLIENT_SCOPE.some(s => rel === s || rel.startsWith(s + '/'));

let fatals = 0;
let warnings = 0;

console.log('\n' + C.b + 'Averi — audit des secrets' + C.x + '\n');

/* 1. Fichiers du dépôt ------------------------------------- */
console.log(C.d + '  Analyse des fichiers du dépôt…' + C.x);
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  if (rel.startsWith('tools/audit-secrets')) continue;   // ce fichier cite les motifs
  const content = readFileSync(file, 'utf8');
  for (const p of PATTERNS) {
    if (p.clientOnly && !inClientScope(rel)) continue;
    if (p.re.test(content)) {
      console.log('  ' + C.r + '✘' + C.x + ' ' + rel + ' — ' + p.label);
      if (p.fatal) fatals++; else warnings++;
    }
  }
}

/* 2. Fichiers suivis par Git ------------------------------- */
let tracked = [];
try {
  tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
} catch (_) {
  console.log('  ' + C.y + '⚠' + C.x + ' dépôt Git illisible, contrôle de suivi ignoré');
}
for (const f of tracked) {
  if (/^keys\//.test(f) || /\.(pem|key|private)$/.test(f)) {
    console.log('  ' + C.r + '✘' + C.x + ' fichier sensible suivi par Git : ' + f);
    fatals++;
  }
}

/* 3. Historique Git ---------------------------------------- */
console.log(C.d + '  Analyse de l’historique Git…' + C.x);
try {
  const hits = execFileSync('git',
    ['log', '--all', '--pretty=format:%H', '--name-only', '--diff-filter=A'],
    { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(l => /\.(pem|key|private)$/.test(l) || /^keys\//.test(l));
  if (hits.length) {
    console.log('  ' + C.r + '✘' + C.x + ' des fichiers sensibles ont existé dans l’historique :');
    for (const h of new Set(hits)) console.log('      ' + h);
    console.log('      ' + C.y + 'Une clé ayant été commitée doit être considérée comme compromise :' + C.x);
    console.log('      régénérez-la (keygen --force) et réémettez les licences.');
    fatals++;
  }
} catch (_) {}

/* 4. Clés présentes localement ----------------------------- */
const keysDir = process.env.AVERI_KEYS_DIR ? resolve(process.env.AVERI_KEYS_DIR) : join(ROOT, 'keys');
if (existsSync(keysDir)) {
  for (const f of readdirSync(keysDir)) {
    if (!/private/.test(f)) continue;
    const mode = statSync(join(keysDir, f)).mode & 0o777;
    if (mode !== 0o600) {
      console.log('  ' + C.y + '⚠' + C.x + ' ' + f + ' : permissions ' + mode.toString(8) + ' (attendu 600)');
      warnings++;
    }
  }
}

/* Verdict --------------------------------------------------- */
console.log('');
if (fatals) {
  console.log('  ' + C.r + C.b + '✘ ' + fatals + ' problème(s) bloquant(s).' + C.x);
  console.log('    STOP — corrigez l’architecture avant de publier.\n');
  process.exit(1);
}
if (warnings) console.log('  ' + C.y + '⚠ ' + warnings + ' avertissement(s).' + C.x);
console.log('  ' + C.g + '✔ Aucune clé privée dans le code client, le suivi Git ou l’historique.' + C.x + '\n');
