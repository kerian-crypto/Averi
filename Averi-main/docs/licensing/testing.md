# Tests

```bash
npm test                    # toute la suite
node --test tests/          # équivalent
node --test tests/demo.test.mjs
npm run check               # build + tests + audit des secrets
```

Aucune dépendance : `node:test` et `node:assert` uniquement.

## Organisation

| Fichier | Couvre |
|---|---|
| `crypto.test.mjs` | SHA-512, HMAC, base64url, Ed25519, malléabilité |
| `license-format.test.mjs` *(via engine)* | Structure, schéma, versionnement |
| `license-engine.test.mjs` | La matrice de vérification complète |
| `demo.test.mjs` | Démonstration, horloge, effacement, corruption |
| `storage.test.mjs` | Redondance, scellement, identité |
| `activation.test.mjs` | Activation, anti-rejeu, binding |
| `facade.test.mjs` | État consolidé, droits, transitions |
| `ui.test.mjs` | Interface publique, sur un DOM minimal |
| `console.test.mjs` | Console privée, permissions, verrou |
| `generator.test.mjs` | CLI, clés, garde-fous d'émission |
| `security.test.mjs` | Absence de secrets, contournements |
| `integration.test.mjs` | Le bundle **tel qu'injecté dans index.html** |

`tests/helpers.mjs` fournit une paire de clés **éphémère** (jamais celle de
production), un stockage mémoire et une horloge pilotable. `tests/dom-stub.mjs`
fournit un DOM minimal suffisant pour monter les deux interfaces.

## Matrice de tests

### Licence

| Cas | Résultat attendu | ✓ |
|---|---|---|
| Licence publique valide | `LICENSE_ACTIVE` | ✓ |
| Licence expirée | `LICENSE_EXPIRED` | ✓ |
| Licence pas encore valide | `LICENSE_NOT_YET_VALID` | ✓ |
| Signature modifiée | `LICENSE_TAMPERED` | ✓ |
| Charge utile modifiée | `LICENSE_TAMPERED` | ✓ |
| Expiration repoussée | `LICENSE_TAMPERED` | ✓ |
| Type élevé en `private` | `LICENSE_TAMPERED` | ✓ |
| Signée par une autre clé | `LICENSE_TAMPERED` | ✓ |
| `kid` inconnu | `LICENSE_TAMPERED` | ✓ |
| Entête de version rétrogradée | `LICENSE_TAMPERED` | ✓ |
| Mauvais produit | `LICENSE_PRODUCT_MISMATCH` | ✓ |
| Plan inconnu | `LICENSE_PLAN_UNKNOWN` | ✓ |
| Plan interne sur licence publique | `LICENSE_PLAN_UNKNOWN` | ✓ |
| Émetteur inattendu | `LICENSE_INVALID` | ✓ |
| Mauvais appareil | `LICENSE_DEVICE_MISMATCH` | ✓ |
| Bon appareil | `LICENSE_ACTIVE` | ✓ |
| Licence liée, identité absente | `LICENSE_DEVICE_MISMATCH` | ✓ |
| Licence révoquée | `LICENSE_REVOKED` | ✓ |
| Licence privée valide | `LICENSE_ACTIVE` + permissions | ✓ |
| Permissions inconnues | écartées | ✓ |
| Features hors plan | écartées | ✓ |
| Version de format non supportée | `LICENSE_VERSION_UNSUPPORTED` | ✓ |
| Jeton absent | `LICENSE_UNKNOWN` | ✓ |
| Jeton illisible | `LICENSE_INVALID` | ✓ |
| Contrefaçon **et** expirée | `LICENSE_TAMPERED` (pas `EXPIRED`) | ✓ |

### Démonstration

| Cas | Résultat attendu | ✓ |
|---|---|---|
| Jamais lancée | `DEMO_AVAILABLE`, 60 min | ✓ |
| Première activation | `DEMO_ACTIVE` | ✓ |
| Démarrée deux fois | pas de remise à zéro | ✓ |
| Après 18 min | 42 min restantes | ✓ |
| Après 52 min | 08 min + avertissement | ✓ |
| À 59 min 59 s | `DEMO_ACTIVE` | ✓ |
| À exactement 1 h | `DEMO_EXPIRED` | ✓ |
| Au-delà d'1 h | `DEMO_EXPIRED` | ✓ |
| Fermeture / réouverture | temps conservé | ✓ |
| Horloge reculée | aucun temps rendu + anomalie | ✓ |
| Horloge reculée en 2020 | aucun temps rendu | ✓ |
| Horloge figée | la démo s'écoule (monotone) | ✓ |
| Horloge avancée | `DEMO_EXPIRED` | ✓ |
| Un dépôt effacé | restauré, démo intacte | ✓ |
| État édité à la main | `DEMO_EXPIRED` + `seal_broken` | ✓ |
| État corrompu | `DEMO_EXPIRED` + `corrupt_state` | ✓ |
| Démo d'une autre installation | `DEMO_EXPIRED` + `install_mismatch` | ✓ |
| 10 redémarrages consécutifs | pas de temps fantôme | ✓ |
| Réinitialisation sans autorisation | exception, état inchangé | ✓ |
| Jeton d'essai écrit à la première activation | présent, scellé, nonce unique | ✓ |
| État de démo effacé, jeton conservé | essai **non** relancé, temps recalculé | ✓ |
| État effacé après 1 h | `DEMO_EXPIRED`, `start()` ne relance rien | ✓ |
| État **et** identité effacés | `DEMO_EXPIRED` + `install_mismatch` | ✓ |
| Jeton d'essai retouché | `DEMO_EXPIRED` + `trial_token_tampered` | ✓ |
| Jeton rajeuni au fil des sessions | impossible, date figée | ✓ |
| État effacé puis horloge reculée | `DEMO_EXPIRED` + `clock_backwards` | ✓ |
| Jeton antérieur restauré après un essai relancé | date du jeton appliquée | ✓ |
| Jeton antérieur de plus d'une heure | essai relancé refermé | ✓ |
| Réconciliation quand le jeton concorde | aucun ajustement | ✓ |
| État **et** jeton effacés simultanément | essai rouvert — **limite assumée** | ✓ |
| Remise à zéro autorisée | efface aussi le jeton | ✓ |

### Sécurité

| Cas | Résultat attendu | ✓ |
|---|---|---|
| Aucune clé privée dans le client | aucun résultat | ✓ |
| Aucune primitive de signature côté client | aucun résultat | ✓ |
| Aucun fichier sensible suivi par Git | aucun résultat | ✓ |
| Aucune clé privée dans l'historique Git | aucun résultat | ✓ |
| Clé publique embarquée = 32 octets | vrai | ✓ |
| Licence forgée sans la clé privée | refusée | ✓ |
| Licence écrite directement dans le stockage | ne débloque rien | ✓ |
| Features gonflées dans le stockage | ne débloque rien | ✓ |
| Enregistrement descellé | licence inopérante | ✓ |
| Révocation injectée non scellée | ignorée | ✓ |
| `resetDemo` sans permission | refusé | ✓ |
| Licence publique demandant `testing` | refusée | ✓ |
| Façade exposée par `window` | non | ✓ |
| Logique de licence dupliquée dans le jeu | absente | ✓ |

### Trousseau — plusieurs licences sans interférence

| Cas | Résultat attendu | ✓ |
|---|---|---|
| Deux licences activées successivement | les deux mémorisées, une seule active | ✓ |
| Verdict de chaque licence | recalculé individuellement | ✓ |
| Bascule vers une autre licence | droits du nouveau plan appliqués | ✓ |
| Licence privée puis publique | permissions internes retirées, console refermée | ✓ |
| Bascule vers une licence révoquée entre-temps | refusée, pas ressuscitée | ✓ |
| Oubli de la licence active | accès refermé, les autres intactes | ✓ |
| Plus de 8 licences | trousseau borné, les récentes conservées | ✓ |
| Retrait de la licence courante | retirée aussi du trousseau | ✓ |

### Interfaces

| Cas | Résultat attendu | ✓ |
|---|---|---|
| Panneau avant essai | propose l'heure gratuite | ✓ |
| Compte à rebours 42 min / 08 min | affiché | ✓ |
| Pilule sous 10 min | passe en alerte | ✓ |
| Expiration | les deux offres, aux bons prix | ✓ |
| Code vide / code invalide | messages humains | ✓ |
| Code valide | licence active + récapitulatif | ✓ |
| Vocabulaire cryptographique | **absent de tous les écrans** | ✓ |
| Console sans licence privée | verrouillée | ✓ |
| Console avec licence publique | verrouillée + explication | ✓ |
| Onglets selon permissions | respectés | ✓ |
| `Generate` | commande CLI, jamais un jeton | ✓ |
| `resetDemo` sans `testing` | bouton absent | ✓ |
| Habillage public dans la console | absent | ✓ |
| Code d'appareil affiché | réversible, réutilisable tel quel | ✓ |
| Code d'appareil, toutes formes (casse, tirets, préfixe) | acceptées | ✓ |
| Code d'appareil tronqué | refusé avec un message explicite | ✓ |
| Chaque onglet annonce à quoi il sert | introduction présente et adaptée | ✓ |
| Champs bruts (`nbf`, `dlm`, `install_id`…) | jamais seule étiquette visible | ✓ |
| Chaque fait affiché | porte son explication | ✓ |
| Dates | accompagnées de l'écart au présent | ✓ |
| Anomalies et événements | traduits, pas affichés en code | ✓ |
| Pied de console | titulaire et permissions en clair | ✓ |
| Console : jeton refusé | motif affiché, saisie conservée | ✓ |
| Console : champ vide | signalé sans appeler le moteur | ✓ |
| Console : trousseau | listé, bascule et oubli fonctionnels | ✓ |

## Défauts trouvés par les tests

Deux défauts réels, corrigés avant intégration :

1. **`DemoEngine.flush()` persistait sans réévaluer.** Une session ouverte puis
   fermée sans aucun rafraîchissement ne consommait aucun temps — l'utilisateur
   aurait pu ouvrir et fermer l'application indéfiniment.
2. **`openBlocked()` ignorait l'état passé en argument.** Après un refus pour cause
   d'appareil non autorisé, l'utilisateur lisait « Essayez Averi pendant une heure »
   au lieu de la raison du refus.
3. **La console écrasait son propre message d'erreur.** `activateLicense()` émet un
   changement d'état auquel la console est abonnée : l'écran était reconstruit
   pendant le clic, et le message atterrissait dans un écran déjà jeté. Coller une
   licence refusée ne produisait donc **aucun retour visible**. Le message et la
   saisie vivent désormais dans l'état de l'application.
4. **Le code d'appareil affiché au client n'était pas réversible.** Il réduisait
   chaque octet modulo 32, si bien que le support recevait un code dont il ne
   pouvait rien faire : le parcours « licence liée à l'appareil » — la seule
   limitation réellement contraignante hors ligne — était impraticable. Découvert
   en rédigeant le mode d'emploi, pas par les tests.
5. **`SecureLicenseStorage` scellait l'identité avec une clé dérivée d'elle-même.**
   Elle était donc illisible au démarrage suivant : chaque rechargement de page
   créait une nouvelle installation, invalidant démonstration et licence. Trouvé par
   `integration.test.mjs`, invisible pour les tests unitaires dont le stockage
   préétablissait le sceau.
