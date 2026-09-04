# Décisions cryptographiques

## Algorithme : Ed25519

Signature asymétrique sur courbe edwards25519 (RFC 8032).

**Pourquoi asymétrique.** Un secret partagé — HMAC, hash « secret » embarqué — est
inutilisable ici : le client doit vérifier, donc il détiendrait le secret, donc il
pourrait émettre. La spécification l'interdit explicitement, et à raison : quiconque
lit le bundle fabriquerait ses licences. Avec Ed25519, le client ne détient que la
clé publique. Il peut vérifier, jamais signer.

**Pourquoi Ed25519 plutôt que RSA ou ECDSA.** Signatures de 64 octets (contre ~256
pour RSA-2048) — décisif pour un jeton transmis par WhatsApp. Déterministe : pas de
dépendance à un générateur aléatoire au moment de signer, donc pas de fuite de clé
par nonce répété comme avec ECDSA. Implémentation compacte et sans branche
dépendante du secret.

## Implémentation : pure JS, pas WebCrypto

`crypto.subtle` n'est disponible que dans un **contexte sécurisé** et son API est
**asynchrone**. Or Averi doit s'ouvrir en `file://`, et une vérification asynchrone
contaminerait tout le moteur : `getStatus()` deviendrait une promesse, appelée à
chaque seconde par le compte à rebours.

`src/licensing/ed25519.js` et `src/licensing/sha512.js` sont donc des
implémentations **pures, synchrones, sans dépendance**, en `BigInt`.

Coût mesuré : **~7 ms** par vérification, sur un message de 400 octets. La
vérification a lieu au chargement et à chaque activation — jamais dans une boucle.

Les deux implémentations sont validées contre `node:crypto` :

- SHA-512 : vecteurs classiques + **toutes les tailles de 111 à 129 octets**, qui
  couvrent les frontières de bloc et de padding ;
- Ed25519 : 10 paires aléatoires × (signature valide, signature altérée, message
  altéré, clé étrangère), plus le rejet d'un scalaire `s` non réduit.

## Contrôles de conformité

`verify()` refuse, en plus de la vérification d'équation :

- une signature dont la longueur n'est pas 64, une clé dont la longueur n'est pas 32 ;
- un scalaire `s ≥ L` — sans quoi `s + L` produirait une seconde signature valide
  pour le même message (**malléabilité**) ;
- un point dont la coordonnée `y` est ≥ p — encodage **non canonique** ;
- un point qui n'est pas sur la courbe.

Aucune exception ne remonte : toute anomalie retourne `false`.

## Scellement du stockage : HMAC-SHA-512

Les enregistrements locaux (démo, activation, licence, révocations) portent un HMAC
tronqué à 128 bits, calculé avec une clé dérivée de l'identifiant d'installation.

**Ce n'est pas un secret.** La clé est dérivable par quiconque lit le code. Le HMAC
ne rend pas l'édition impossible — il la rend **détectable**. Un enregistrement
descellé est traité comme hostile : la démonstration est considérée consommée, la
licence comme altérée, une liste de révocation injectée est ignorée.

La clé de sceau inclut la **clé de l'enregistrement** : un enregistrement `demo`
recopié sous la clé `activation` ne s'ouvre pas.

## Comparaisons à temps constant

`bytesEqual()` compare sans court-circuit. Utilisée pour les empreintes d'appareil
et les sceaux. L'exposition au timing est faible dans un navigateur, mais la
primitive correcte ne coûte rien.

## Gestion des clés

```
keys/                                   ← gitignoré, jamais publié
  averi-signing-k1.private.pem          ← 0600, poste d'émission uniquement
  averi-signing-k1.public.pem           ← 0644
  issued-licenses.jsonl                 ← registre des émissions
  revocations.json
```

Génération :

```bash
node tools/license-generator/cli.mjs keygen
```

La commande écrit la paire, applique `0600` à la clé privée, et **installe la clé
publique** (32 octets, base64url) dans `TRUSTED_KEYS` de `src/licensing/config.js`.
Seule la partie publique traverse cette frontière.

Pour garder les clés hors du dépôt :

```bash
export AVERI_KEYS_DIR="$HOME/.averi/keys"
```

## Rotation de clé

`kid` identifie la clé de signature dans chaque licence, et `TRUSTED_KEYS` en
accepte plusieurs simultanément. La rotation ne casse donc rien :

1. `keygen --kid k2` — la nouvelle clé publique s'ajoute à `TRUSTED_KEYS`.
2. Passer `ACTIVE_KEY_ID` à `k2` : les nouvelles licences sont signées avec `k2`.
3. Les licences `k1` restent valides jusqu'à leur expiration.
4. Une fois `k1` sans licence active en circulation, retirez-la de `TRUSTED_KEYS`.

**En cas de compromission**, l'étape 4 devient immédiate — et toutes les licences
`k1` doivent être réémises. Procédure complète dans [`security.md`](security.md).

## Ce qui n'est pas fait, et pourquoi

- **Pas de chiffrement de la licence.** Une licence n'est pas confidentielle : elle
  doit être signée, pas cachée. La chiffrer exigerait une clé de déchiffrement dans
  le client, donc extractible, pour aucun gain.
- **Pas d'obfuscation du bundle.** Elle ralentit un attaquant de quelques minutes,
  complique le débogage et donne une fausse impression de sécurité. Le modèle de
  menace est explicité dans [`security.md`](security.md) plutôt que masqué.
