#!/usr/bin/env node
/* ==========================================================
   AVERI LICENSE GENERATOR — Interface en ligne de commande
   ----------------------------------------------------------
   Cet outil vit HORS de l'application. Il est le seul à
   manipuler la clé privée de signature.

     node tools/license-generator/cli.mjs keygen
     node tools/license-generator/cli.mjs generate \
         --type public --plan plan_1000 --duration 30d
     node tools/license-generator/cli.mjs interactive
     node tools/license-generator/cli.mjs inspect <jeton>
     node tools/license-generator/cli.mjs revoke AVR-XXXX
   ========================================================== */

import { createInterface } from 'node:readline/promises';
import { stdin, stdout, argv, exit, env } from 'node:process';
import { writeFileSync, appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  PLANS, PUBLIC_PLAN_IDS, PRIVATE_PLAN_ID, PRIVATE_PLAN, ALL_PERMISSIONS,
  ALL_FEATURES, ACTIVE_KEY_ID, CURRENCY_LABEL, getPlan, TRUSTED_KEYS
} from '../../src/licensing/config.js';
import { LicenseEngine } from '../../src/licensing/license-engine.js';
import { formatEpoch } from '../../src/licensing/clock.js';
import { buildPayload, parseDuration } from './builder.mjs';
import { signPayload } from './signer.mjs';
import { generateKeyPair, installPublicKey, loadPublicKeyB64u, keysDir, REPO_ROOT } from './keys.mjs';

/* ---------------------------------------------------------- */
/* Présentation                                               */
/* ---------------------------------------------------------- */

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m'
};
const say = (s) => stdout.write(s + '\n');
const title = (s) => say('\n' + C.bold + C.magenta + s + C.reset);
const ok = (s) => say(C.green + '✔ ' + C.reset + s);
const warn = (s) => say(C.yellow + '⚠ ' + C.reset + s);
const err = (s) => say(C.red + '✘ ' + C.reset + s);
const kv = (k, v) => say('  ' + C.dim + k.padEnd(20) + C.reset + v);

/* ---------------------------------------------------------- */
/* Arguments                                                  */
/* ---------------------------------------------------------- */

function parseArgs(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) out[a.slice(2, eq)] = a.slice(eq + 1);
      else if (i + 1 < args.length && !args[i + 1].startsWith('--')) out[a.slice(2)] = args[++i];
      else out[a.slice(2)] = true;
    } else out._.push(a);
  }
  return out;
}

const listArg = (v) => (typeof v === 'string' && v.trim())
  ? v.split(',').map(s => s.trim()).filter(Boolean) : null;

/* ---------------------------------------------------------- */
/* Registre d'émission                                        */
/* ---------------------------------------------------------- */

/**
 * Journal d'émission : sans backend, c'est la seule trace de ce
 * qui a été vendu à qui. Il reste sur le poste d'administration.
 */
function recordIssuance(entry) {
  const dir = keysDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, 'issued-licenses.jsonl');
  appendFileSync(file, JSON.stringify(entry) + '\n', { mode: 0o600 });
  return file;
}

/* ---------------------------------------------------------- */
/* Commandes                                                  */
/* ---------------------------------------------------------- */

function cmdKeygen(args) {
  const kid = args.kid || ACTIVE_KEY_ID;
  title('Génération d’une paire de clés Ed25519');

  const res = generateKeyPair(kid, { force: !!args.force });
  ok(`Paire « ${kid} » créée.`);
  kv('Clé privée', res.privatePath + C.red + '  ← NE JAMAIS PARTAGER' + C.reset);
  kv('Clé publique', res.publicPath);
  kv('Publique (b64url)', res.publicKeyB64u);

  if (args['no-install']) {
    warn('Clé publique NON installée dans config.js (--no-install).');
  } else {
    const p = installPublicKey(kid, res.publicKeyB64u);
    ok('Clé publique installée dans ' + p.replace(REPO_ROOT + '/', ''));
    say(C.dim + '  Relancez le build pour la propager :  node tools/build.mjs' + C.reset);
  }

  say('');
  warn('Sauvegardez la clé privée hors ligne. Sa perte rend impossible');
  say('  l’émission de nouvelles licences ; sa fuite permet à un tiers');
  say('  d’en fabriquer. Les deux imposent une rotation de clé.');
}

function cmdPlans() {
  title('Plans disponibles');
  for (const id of PUBLIC_PLAN_IDS) {
    const p = PLANS[id];
    say('\n' + C.bold + p.id + C.reset + '  ' + C.cyan + p.price.toLocaleString('fr-FR') + ' ' + CURRENCY_LABEL + C.reset);
    kv('Nom', p.name);
    kv('Durée par défaut', p.default_duration_days + ' jours');
    kv('Features', p.features.join(', '));
  }
  say('\n' + C.bold + PRIVATE_PLAN.id + C.reset + '  ' + C.dim + '(licences privées uniquement)' + C.reset);
  kv('Nom', PRIVATE_PLAN.name);
  kv('Features', PRIVATE_PLAN.features.join(', '));
  title('Permissions (licences privées)');
  for (const p of ALL_PERMISSIONS) kv(p, '');
}

function issue(spec, args) {
  const payload = buildPayload(spec);
  const { token } = signPayload(payload, payload.kid);

  // Auto-contrôle : on relit la licence avec le moteur du client.
  const engine = new LicenseEngine({
    trustedKeys: Object.assign({}, TRUSTED_KEYS, { [payload.kid]: loadPublicKeyB64u(payload.kid) })
  });
  const check = engine.getLicenseStatus(token, {
    identity: payload.dev.m === 'fp' ? { fingerprint: payload.dev.v } : null
  });

  title('Licence émise');
  kv('Identifiant', payload.id);
  kv('Type', payload.typ);
  kv('Plan', payload.pln + (getPlan(payload.pln) ? '  (' + getPlan(payload.pln).name + ')' : ''));
  kv('Émise le', formatEpoch(payload.iat));
  kv('Valide à partir du', formatEpoch(payload.nbf));
  kv('Expire le', payload.exp ? formatEpoch(payload.exp) : 'jamais');
  kv('Appareil', payload.dev.m === 'fp' ? payload.dev.v : 'non liée (toute installation)');
  kv('Limite appareils', String(payload.dlm));
  kv('Features', payload.ftr.join(', '));
  if (payload.prm) kv('Permissions', payload.prm.join(', '));
  if (payload.met) kv('Métadonnées', JSON.stringify(payload.met));
  kv('Contrôle', check.status === 'LICENSE_ACTIVE'
    ? C.green + 'valide' + C.reset
    : C.red + check.status + ' — ' + (check.detail || '') + C.reset);

  if (payload.dev.m === 'none') {
    warn('Licence non liée à un appareil : elle fonctionnera sur toute');
    say('  installation où elle est collée. Pour une vraie limitation');
    say('  hors ligne, demandez le code d’appareil au client et passez');
    say('  --device <empreinte>.');
  }

  title('Jeton à transmettre au client');
  say(C.cyan + token + C.reset);
  say('');
  kv('Longueur', token.length + ' caractères');

  const file = recordIssuance({
    issued_at: new Date().toISOString(),
    license_id: payload.id,
    type: payload.typ,
    plan: payload.pln,
    expires_at: payload.exp,
    device: payload.dev,
    metadata: payload.met || {},
    operator: env.USER || env.USERNAME || 'inconnu'
  });
  say(C.dim + '  Consigné dans ' + file + C.reset);

  if (args && args.out) {
    writeFileSync(args.out, token + '\n');
    ok('Jeton écrit dans ' + args.out);
  }
  return token;
}

function cmdGenerate(args) {
  const spec = {
    type: args.type || 'public',
    plan: args.plan,
    deviceFingerprint: args.device || null,
    deviceLimit: args['device-limit'] ? Number(args['device-limit']) : 1,
    features: listArg(args.features),
    permissions: listArg(args.permissions),
    keyId: args.kid || ACTIVE_KEY_ID,
    metadata: {}
  };

  if (args.duration) spec.durationMs = parseDuration(args.duration);
  if (args.expires) {
    const t = Date.parse(args.expires);
    if (Number.isNaN(t)) throw new Error('--expires : date invalide (attendu ISO 8601)');
    spec.expiresAt = Math.floor(t / 1000);
  }
  if (args['not-before']) {
    const t = Date.parse(args['not-before']);
    if (Number.isNaN(t)) throw new Error('--not-before : date invalide');
    spec.notBefore = Math.floor(t / 1000);
  }
  if (args.perpetual) spec.expiresAt = 0;
  if (args.holder) spec.metadata.holder = String(args.holder);
  if (args.note) spec.metadata.note = String(args.note);
  if (args.ref) spec.metadata.ref = String(args.ref);

  issue(spec, args);
}

async function cmdInteractive() {
  const rl = createInterface({ input: stdin, output: stdout });
  const ask = async (q, def) => {
    const a = (await rl.question(C.cyan + '? ' + C.reset + q + (def ? C.dim + ' [' + def + ']' : '') + C.reset + ' ')).trim();
    return a || def || '';
  };
  try {
    title('Émission d’une licence Averi');

    const type = (await ask('Type (public / private)', 'public')).toLowerCase();
    let plan;
    if (type === 'private') {
      plan = PRIVATE_PLAN_ID;
      say(C.dim + '  Plan interne imposé : ' + PRIVATE_PLAN_ID + C.reset);
    } else {
      say('');
      for (const id of PUBLIC_PLAN_IDS) {
        say('  ' + C.bold + id + C.reset + ' — ' + PLANS[id].name + ' — ' +
            PLANS[id].price.toLocaleString('fr-FR') + ' ' + CURRENCY_LABEL +
            ' — ' + PLANS[id].default_duration_days + ' jours');
      }
      plan = await ask('Plan', PUBLIC_PLAN_IDS[0]);
    }

    const planDef = getPlan(plan);
    if (!planDef) throw new Error('Plan inconnu : ' + plan);

    const duration = await ask('Durée (ex. 30d, 12h, 1y)', planDef.default_duration_days + 'd');
    const device = await ask('Code d’appareil du client (empreinte hex, vide = non liée)', '');
    const holder = await ask('Titulaire (nom ou numéro)', '');
    const ref = await ask('Référence de paiement', '');

    let permissions = null;
    if (type === 'private') {
      say(C.dim + '  Permissions disponibles : ' + ALL_PERMISSIONS.join(', ') + C.reset);
      permissions = listArg(await ask('Permissions (séparées par des virgules)', 'support,diagnostics'));
    }

    const metadata = {};
    if (holder) metadata.holder = holder;
    if (ref) metadata.ref = ref;

    issue({
      type, plan,
      durationMs: parseDuration(duration),
      deviceFingerprint: device || null,
      permissions,
      metadata,
      keyId: ACTIVE_KEY_ID
    }, {});
  } finally {
    rl.close();
  }
}

function cmdInspect(args) {
  const token = args._[1] || (args.file ? readFileSync(args.file, 'utf8').trim() : null);
  if (!token) throw new Error('Usage : inspect <jeton>  |  inspect --file licence.txt');

  const engine = new LicenseEngine({ trustedKeys: TRUSTED_KEYS });
  const res = engine.getLicenseStatus(token, args.device ? { identity: { fingerprint: args.device } } : {});

  title('Inspection');
  kv('Statut', res.status === 'LICENSE_ACTIVE' ? C.green + res.status + C.reset : C.yellow + res.status + C.reset);
  if (res.detail) kv('Détail', res.detail);
  if (res.license) {
    const l = res.license;
    kv('Identifiant', l.id);
    kv('Type', l.type);
    kv('Plan', l.planId);
    kv('Émise le', formatEpoch(l.issuedAt));
    kv('Valide dès', formatEpoch(l.notBefore));
    kv('Expire le', l.expiresAt ? formatEpoch(l.expiresAt) : 'jamais');
    kv('Appareil', l.deviceMode === 'fp' ? l.deviceFingerprint : 'non liée');
    kv('Features', l.declaredFeatures.join(', '));
    if (l.declaredPermissions.length) kv('Permissions', l.declaredPermissions.join(', '));
    if (Object.keys(l.metadata).length) kv('Métadonnées', JSON.stringify(l.metadata));
  }
  kv('Features accordées', res.features.join(', ') || '—');
}

function cmdRevoke(args) {
  const id = args._[1];
  if (!id) throw new Error('Usage : revoke <AVR-XXXX> [--reason "…"]');
  const dir = keysDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, 'revocations.json');
  let list = { ids: [], reasons: {} };
  if (existsSync(file)) {
    try { list = JSON.parse(readFileSync(file, 'utf8')); } catch (_) {}
  }
  if (list.ids.indexOf(id) === -1) list.ids.push(id);
  if (args.reason) list.reasons[id] = String(args.reason);
  writeFileSync(file, JSON.stringify(list, null, 2), { mode: 0o600 });

  title('Révocation enregistrée');
  kv('Licence', id);
  kv('Motif', args.reason || '—');
  kv('Fichier', file);
  say('');
  warn('Sans serveur, cette révocation n’atteint PAS les clients déjà');
  say('  installés. Elle ne prend effet qu’une fois recopiée dans');
  say('  EMBEDDED_REVOCATIONS (src/licensing/revocation.js) et l’application');
  say('  redéployée — ou, plus tard, distribuée par le serveur de licences.');
  say('');
  say(C.dim + '  À coller dans revocation.js :' + C.reset);
  say('  ids: ' + JSON.stringify(list.ids) + ',');
  say('  reasons: ' + JSON.stringify(list.reasons));
}

function cmdHelp() {
  say(C.bold + '\nAveri — générateur de licences' + C.reset);
  say(C.dim + 'La clé privée reste sur ce poste. Le client ne sait que vérifier.\n' + C.reset);
  say('  ' + C.bold + 'keygen' + C.reset + ' [--kid k1] [--force] [--no-install]');
  say('      Crée une paire Ed25519 et installe la clé publique dans le client.\n');
  say('  ' + C.bold + 'plans' + C.reset);
  say('      Liste les plans, prix, durées, features et permissions.\n');
  say('  ' + C.bold + 'generate' + C.reset + ' --type public|private --plan <id> [options]');
  say('      --duration 30d|12h|8w|1y     durée de validité');
  say('      --expires <ISO>              date de fin explicite');
  say('      --not-before <ISO>           date de début (licence différée)');
  say('      --perpetual                  sans expiration');
  say('      --device <empreinte hex>     lie la licence à un appareil');
  say('      --device-limit <n>           nombre d’appareils déclaré');
  say('      --features a,b,c             sous-ensemble des features du plan');
  say('      --permissions a,b            licences privées uniquement');
  say('      --holder / --ref / --note    métadonnées');
  say('      --out licence.txt            écrit le jeton dans un fichier\n');
  say('  ' + C.bold + 'interactive' + C.reset + '        Émission guidée, question par question.\n');
  say('  ' + C.bold + 'inspect' + C.reset + ' <jeton>   Vérifie une licence comme le ferait le client.\n');
  say('  ' + C.bold + 'revoke' + C.reset + ' <id>       Inscrit une licence dans la liste de révocation.\n');
  say(C.dim + '  Répertoire des clés : ' + keysDir() + C.reset);
  say(C.dim + '  (surchargeable par AVERI_KEYS_DIR)\n' + C.reset);
}

/* ---------------------------------------------------------- */

async function main() {
  const args = parseArgs(argv.slice(2));
  const cmd = args._[0] || 'help';
  try {
    switch (cmd) {
      case 'keygen': cmdKeygen(args); break;
      case 'plans': cmdPlans(); break;
      case 'generate': case 'gen': cmdGenerate(args); break;
      case 'interactive': case 'i': await cmdInteractive(); break;
      case 'inspect': cmdInspect(args); break;
      case 'revoke': cmdRevoke(args); break;
      case 'help': case '--help': case '-h': cmdHelp(); break;
      default:
        err('Commande inconnue : ' + cmd);
        cmdHelp();
        exit(1);
    }
  } catch (e) {
    err(e.message);
    exit(1);
  }
}

main();
