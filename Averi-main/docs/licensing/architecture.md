# Architecture du licensing Averi

## Point de départ

Averi était une application **mono-fichier** : `index.html`, 1 665 lignes de HTML, CSS
et JavaScript vanilla, sans build, sans framework, sans npm, sans backend. Une seule
dépendance runtime (PeerJS par CDN) et une contrainte forte : le fichier doit rester
ouvrable directement, y compris en `file://`.

Aucun stockage, aucune cryptographie, aucune authentification et aucun paiement
n'existaient — `grep localStorage|sessionStorage|indexedDB|crypto\.` ne renvoyait rien.
Le licensing part donc de zéro, sans migration de données.

## Contrainte structurante

Deux exigences se contredisent en apparence :

- la spécification demande une architecture modulaire, testable et documentée ;
- le produit exige un livrable en **un seul fichier**, sans installation.

La résolution retenue : les sources vivent en **modules ESM** dans `src/`, testés sous
Node avec `node:test`. Un bundler maison (`tools/bundle.mjs`, ~150 lignes, aucune
dépendance) les concatène et les injecte dans les livrables entre des marqueurs. Le
build est un outil de **développement** : l'utilisateur final n'installe toujours rien.

```
src/licensing/*.js  ──►  tools/build.mjs  ──►  index.html   (bloc AVERI:LICENSING)
src/ui/*.js                                    console.html (bloc AVERI:LICENSING)
```

## Vue d'ensemble

```
                        AVERI (index.html)
                               │
                    window.AveriLicense          ← seule surface publique
                               │
                        LicenseFacade            ← seul point d'entrée du système
                               │
        ┌──────────────┬───────┴────────┬────────────────┐
        │              │                │                │
  LicenseEngine   DemoEngine   ActivationService   RevocationRegistry
        │              │                │                │
   LicenseValidator    │                │                │
   ├─ Local            │                │                │
   ├─ Remote (stub)    │                │                │
   └─ Hybrid ──────────┴────────────────┴────────────────┘
                               │
                     SecureLicenseStorage
                               │
        ┌──────────────┬───────┴────────┬────────────────┐
   localStorage      cookie        IndexedDB          mémoire
                                   (miroir)          (repli)
```

Et, **séparément**, hors de l'application :

```
        LICENSE GENERATOR (tools/license-generator/)
                     │
              LicenseBuilder      ← lit la MÊME config que le client
                     │
               CryptoSigner       ← node:crypto, Ed25519
                     │
                CLÉ PRIVÉE        ← keys/, gitignoré, 0600, jamais publiée
```

## Rôle de chaque module

| Module | Responsabilité |
|---|---|
| `config.js` | Source unique de vérité : produit, plans, prix, features, permissions, durée de démo, support, clés publiques. |
| `base64.js` | base64url, UTF-8, comparaison d'octets à temps constant. |
| `sha512.js` | SHA-512 et HMAC-SHA-512 purs, synchrones, sans dépendance. |
| `ed25519.js` | Vérification Ed25519 **uniquement**. Aucune primitive de signature. |
| `license-format.js` | Encodage, décodage, validation stricte du schéma, versionnement. |
| `status.js` | États explicites et messages utilisateur sans jargon. |
| `clock.js` | Trois sources de temps, détection des reculs et des sauts d'horloge. |
| `device.js` | Identifiant d'installation, empreinte, code d'appareil lisible. |
| `storage.js` | `SecureLicenseStorage` : redondance, scellement, auto-réparation, jeton d'essai. |
| `demo-engine.js` | Démonstration d'une heure, jeton d'essai, résistance aux réinitialisations naïves. |
| `license-engine.js` | Toutes les vérifications de licence, dans un ordre fixé. |
| `validators.js` | `Local` / `Remote` / `Hybrid` — l'interface du futur backend. |
| `activation.js` | Activation, anti-rejeu, liaison à l'installation, trousseau. |
| `revocation.js` | Liste embarquée + liste locale, portée honnêtement documentée. |
| `entitlements.js` | Objet immuable de droits, seul objet manipulé par le jeu. |
| `journal.js` | Journal local borné, pour le support et la console. |
| `facade.js` | `LicenseFacade` — assemble tout, expose `getStatus()`. |
| `ui/public-gate.js` | Interface publique : offres, activation, compte à rebours. |
| `ui/console-app.js` | Console privée : 9 onglets, dense, technique. |

## Règle d'or

**L'interface ne décide jamais rien.** Elle appelle `facade.getStatus()` et affiche
le résultat. Aucun composant d'UI n'importe `LicenseEngine`, ne lit une date
d'expiration ni ne touche au stockage. Un test automatisé
(`tests/security.test.mjs`) échoue si de la logique de licence réapparaît dans le
code de jeu.

## Intégration dans le jeu

L'application existante n'a pas été réécrite. Cinq points de contact, tous passant
par `window.AveriLicense` :

1. **Entrée en partie** — `start()` exige `session.unlimited`.
2. **Tuiles de manche** — verrouillage visuel et garde au clic.
3. **Autorité de l'hôte** — `applyAction('setMode')` refuse une manche non couverte,
   y compris demandée par l'invité.
4. **Chat et émoticônes** — derrière `chat.text` et `chat.emotes`.
5. **Poignée de main P2P** — chaque joueur annonce ses features ; l'ensemble
   effectif est l'**intersection** des deux.

## Fichiers créés

```
src/licensing/     17 modules
src/ui/             4 modules (public-gate, public-entry, console-app, console-entry)
tools/              bundle.mjs, build.mjs, audit-secrets.mjs
tools/license-generator/  cli.mjs, builder.mjs, signer.mjs, keys.mjs
tests/             11 fichiers, 221 tests
docs/licensing/     10 documents
console.html        console d'administration
package.json        scripts de build, test, keygen
```

## Fichiers modifiés

- `index.html` — marqueurs d'injection, panneau d'accueil, pilule d'état, gardes.
- `.gitignore` — durci : `keys/`, `*.pem`, `*.key`, `.env`.

## Risques identifiés

| Risque | Traitement |
|---|---|
| Perte de la clé privée | Sauvegarde hors ligne obligatoire ; rotation documentée dans `cryptography.md`. |
| Fuite de la clé privée | `audit-secrets.mjs` en pré-publication ; procédure d'urgence dans `security.md`. |
| Contournement de la démo par profil neuf | Irréductible sans serveur, assumé et documenté. |
| Pair mentant sur ses droits | Contrôle de cohérence, pas de sécurité — documenté. |
| Build oublié après édition d'un module | `npm run check` enchaîne build + tests + audit. |

## Voir aussi

- [`license-format.md`](license-format.md) — le format et sa migration
- [`cryptography.md`](cryptography.md) — les choix cryptographiques
- [`security.md`](security.md) — ce qui est protégé, ce qui ne l'est pas
- [`future-backend.md`](future-backend.md) — l'ajout d'un serveur
