/* ==========================================================
   AVERI LICENSE GENERATOR — CryptoSigner
   ----------------------------------------------------------
   Signature Ed25519 par node:crypto. La clé privée est lue au
   moment de signer et n'est jamais retournée ni journalisée.
   ========================================================== */

import { sign as edSign, createPublicKey, verify as edVerify } from 'node:crypto';
import { signingInputFor, encodeToken } from '../../src/licensing/license-format.js';
import { loadPrivateKey, rawPublicKey, b64url } from './keys.mjs';

/**
 * Signe une charge utile et retourne le jeton complet.
 * @returns {{token:string, payload:object, publicKeyB64u:string}}
 */
export function signPayload(payload, kid) {
  const keyId = kid || payload.kid;
  const privateKey = loadPrivateKey(keyId);

  const { signingInput } = signingInputFor(payload);
  const signature = edSign(null, Buffer.from(signingInput), privateKey);

  // Contrôle immédiat : on ne livre jamais un jeton qu'on n'a pas
  // vérifié soi-même.
  const publicKey = createPublicKey(privateKey);
  if (!edVerify(null, Buffer.from(signingInput), publicKey, signature)) {
    throw new Error('Vérification post-signature échouée — clé ou charge utile corrompue.');
  }

  const token = encodeToken(payload, new Uint8Array(signature));
  return { token, payload, publicKeyB64u: b64url(rawPublicKey(publicKey)) };
}
