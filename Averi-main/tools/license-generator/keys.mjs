/* ==========================================================
   AVERI LICENSE GENERATOR — Gestion des clés
   ----------------------------------------------------------
   ⚠ CE FICHIER N'EST JAMAIS EMBARQUÉ DANS L'APPLICATION.
   La clé privée ne doit exister que sur le poste d'émission,
   dans un répertoire ignoré par Git, en permissions 0600.
   ========================================================== */

import { generateKeyPairSync, createPrivateKey, createPublicKey } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '..', '..');

/**
 * Répertoire des clés. Surchargeable par AVERI_KEYS_DIR pour
 * garder les clés hors du dépôt (recommandé : ~/.averi/keys).
 */
export function keysDir() {
  return process.env.AVERI_KEYS_DIR
    ? resolve(process.env.AVERI_KEYS_DIR)
    : join(REPO_ROOT, 'keys');
}

export function privateKeyPath(kid) {
  return join(keysDir(), `averi-signing-${kid}.private.pem`);
}

export function publicKeyPath(kid) {
  return join(keysDir(), `averi-signing-${kid}.public.pem`);
}

/** Extrait les 32 octets bruts d'une clé publique Ed25519. */
export function rawPublicKey(publicKeyObject) {
  const der = publicKeyObject.export({ format: 'der', type: 'spki' });
  return der.subarray(der.length - 32);
}

export function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Génère une paire Ed25519 et l'écrit sur disque.
 * @returns {{kid:string, publicKeyB64u:string, privatePath:string, publicPath:string}}
 */
export function generateKeyPair(kid, opts) {
  opts = opts || {};
  const dir = keysDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });

  const priv = privateKeyPath(kid);
  if (existsSync(priv) && !opts.force) {
    throw new Error(`Une clé « ${kid} » existe déjà : ${priv}\n` +
      'Utilisez --force pour l’écraser (toutes les licences émises avec l’ancienne clé deviendront invalides).');
  }

  const { publicKey, privateKey } = generateKeyPairSync('ed25519');

  writeFileSync(priv, privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 });
  chmodSync(priv, 0o600);
  writeFileSync(publicKeyPath(kid), publicKey.export({ format: 'pem', type: 'spki' }), { mode: 0o644 });

  return {
    kid,
    publicKeyB64u: b64url(rawPublicKey(publicKey)),
    privatePath: priv,
    publicPath: publicKeyPath(kid)
  };
}

/** Charge la clé privée d'émission. Échoue bruyamment si elle est absente. */
export function loadPrivateKey(kid) {
  const p = privateKeyPath(kid);
  if (!existsSync(p)) {
    throw new Error(
      `Clé privée introuvable pour « ${kid} » : ${p}\n` +
      'Générez-la avec :  node tools/license-generator/cli.mjs keygen\n' +
      'La clé privée ne doit jamais être commitée ni distribuée avec l’application.'
    );
  }
  return createPrivateKey(readFileSync(p));
}

export function loadPublicKeyB64u(kid) {
  const p = publicKeyPath(kid);
  if (existsSync(p)) return b64url(rawPublicKey(createPublicKey(readFileSync(p))));
  const priv = loadPrivateKey(kid);
  return b64url(rawPublicKey(createPublicKey(priv)));
}

/**
 * Injecte la clé PUBLIQUE dans src/licensing/config.js.
 * Seule la partie publique traverse cette frontière.
 */
export function installPublicKey(kid, publicKeyB64u) {
  const configPath = join(REPO_ROOT, 'src', 'licensing', 'config.js');
  const source = readFileSync(configPath, 'utf8');

  const block = /export const TRUSTED_KEYS = \{[\s\S]*?\n\};/;
  if (!block.test(source)) throw new Error('Bloc TRUSTED_KEYS introuvable dans config.js');

  const existing = {};
  const current = source.match(block)[0];
  for (const m of current.matchAll(/([A-Za-z0-9_]+)\s*:\s*'([A-Za-z0-9\-_]+)'/g)) {
    existing[m[1]] = m[2];
  }
  existing[kid] = publicKeyB64u;

  const entries = Object.keys(existing).sort()
    .map(k => `  ${k}: '${existing[k]}'`)
    .join(',\n');

  const replacement = `export const TRUSTED_KEYS = {\n` +
    `  // Clés PUBLIQUES Ed25519 (32 octets, base64url). Aucune clé privée ici.\n` +
    `${entries}\n};`;

  writeFileSync(configPath, source.replace(block, replacement));
  return configPath;
}
