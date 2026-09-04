#!/usr/bin/env node
/* ==========================================================
   AVERI — Préparation du dossier de déploiement
   ----------------------------------------------------------
   Reconstruit les livrables depuis les sources, puis les copie
   dans `public/` — le seul dossier publié.

   Pourquoi passer par un dossier dédié plutôt que servir la
   racine ? Deux raisons :

   1. Le déploiement repart TOUJOURS des sources. Il devient
      impossible de mettre en ligne un index.html périmé parce
      qu'on a oublié `npm run build` avant de committer.
   2. Seuls les fichiers destinés au public sont exposés. Les
      sources, les outils, les tests et la documentation
      restent dans le dépôt, hors du site.
   ========================================================== */

import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public');

/** Fichiers réellement publiés. La console en fait partie ou non selon la config. */
const PUBLIER_CONSOLE = process.env.AVERI_PUBLISH_CONSOLE !== 'false';

const C = { g: '\x1b[32m', y: '\x1b[33m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' };

console.log('\n' + C.b + 'Averi — préparation du déploiement' + C.x + '\n');

/* 1. Reconstruire depuis les sources ------------------------ */
execFileSync('node', [join(ROOT, 'tools', 'build.mjs')], { stdio: 'inherit', cwd: ROOT });

/* 2. Dossier propre ----------------------------------------- */
if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const fichiers = ['index.html'];
if (PUBLIER_CONSOLE) fichiers.push('console.html');

for (const f of fichiers) {
  copyFileSync(join(ROOT, f), join(OUT, f));
  const ko = (readFileSync(join(OUT, f)).length / 1024).toFixed(0);
  console.log('  ✔ public/' + f + '  (' + ko + ' Ko)');
}

if (!PUBLIER_CONSOLE) {
  console.log('  ' + C.y + '·' + C.x + ' console.html non publiée (AVERI_PUBLISH_CONSOLE=false)');
}

/* 3. Empêcher l'indexation de la console -------------------- */
writeFileSync(join(OUT, 'robots.txt'),
  'User-agent: *\n' +
  'Allow: /\n' +
  (PUBLIER_CONSOLE ? 'Disallow: /console.html\n' : ''));
console.log('  ✔ public/robots.txt');

/* 4. Dernier filet de sécurité ------------------------------ */
execFileSync('node', [join(ROOT, 'tools', 'audit-secrets.mjs')], { stdio: 'inherit', cwd: ROOT });

console.log(C.g + '  Prêt à déployer : ' + C.x + 'public/\n');
