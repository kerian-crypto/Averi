# Licences publiques

Destinées aux clients finaux. Elles n'ouvrent jamais la console d'administration et
ne peuvent porter aucune permission — le schéma le refuse et un test le vérifie.

## Plans

Définis dans `src/licensing/config.js`, **source unique de vérité**. Aucun prix,
aucune durée, aucune liste de features n'est dupliquée ailleurs : l'interface, le
moteur et le générateur lisent tous ce fichier.

| | `plan_1000` | `plan_2000` |
|---|---|---|
| Nom | Averi Duo | Averi Duo Infini |
| Prix | **1 000 FCFA** | **2 000 FCFA** |
| Durée par défaut | 30 jours | 90 jours |
| Action ou Vérité | ✓ | ✓ |
| Je n'ai jamais | ✓ | ✓ |
| Le plus susceptible | ✓ | ✓ |
| Compatibilité | ✓ | ✓ |
| Puissance 4 | — | ✓ |
| Memory du duo | — | ✓ |
| Discussion en direct | ✓ | ✓ |
| Émoticônes animées | ✓ | ✓ |
| Cartes premium | — | ✓ |
| Parties illimitées | ✓ | ✓ |

Le moteur ne dépend **que des identifiants de plan**, jamais des prix. Changer un
prix n'a aucun effet sur la validation des licences déjà émises.

Les durées sont surchargeables à l'émission : `--duration 7d`, `--duration 1y`,
`--perpetual`.

## Catalogue de features

Toute capacité verrouillable porte un identifiant stable. Le code de jeu ne teste
jamais un nom de plan, seulement une feature :

```js
if (!licAllows('c4')) { /* proposer les offres */ }
```

| Identifiant | Ce qu'il ouvre |
|---|---|
| `game.truth` `game.never` `game.likely` `game.compat` `game.c4` `game.memory` | Les six manches |
| `chat.text` | Discussion en direct |
| `chat.emotes` | Émoticônes animées |
| `cards.premium` | Cartes premium |
| `session.unlimited` | Créer ou rejoindre une salle |

Ajouter un plan ou déplacer une feature revient à éditer `PLANS` dans `config.js`.
Aucun autre fichier ne bouge.

## Parcours utilisateur

```
Accueil
  │
  ├─ « Essayez Averi pendant une heure »     → 1 heure, toutes les manches
  │
  ├─ Compte à rebours (42 min, 08 min…)      → avertissement sous 10 min
  │
  ├─ Fin de l'heure                          → « Votre période de démonstration
  │                                              est terminée » + les deux offres
  │
  ├─ Choix d'une offre                       → marche à suivre du paiement
  │                                              + code d'appareil à joindre
  │
  ├─ « J'ai déjà une licence »               → collage du code, activation locale
  │
  └─ Licence active                          → récapitulatif, échéance, support
```

## Interface

- **Panneau d'accueil** — mode courant, temps restant, barre de progression,
  actions contextuelles.
- **Pilule d'état** dans le bandeau de partie — « Démo · 42 min », passe en alerte
  clignotante sous 10 minutes, en rouge quand l'accès se ferme.
- **Modales** — offres, parcours d'achat, activation, récapitulatif, blocage.
- **Tuiles de manche** — grisées et cadenassées quand la licence ne les couvre pas ;
  un clic ouvre les offres plutôt qu'un message d'erreur.

Ton commercial, aucun détail technique. Un test automatisé parcourt tous les écrans
publics et échoue si `Ed25519`, `signature`, `SHA-512`, `HMAC`, `payload`, `token`
ou `hash` y apparaît.

Exemple de traduction :

| Interne | Affiché |
|---|---|
| `LICENSE_TAMPERED` | « Cette licence n'est pas valide. Le code semble incomplet ou modifié. Recopiez-le entièrement depuis le message reçu. » |
| `LICENSE_DEVICE_MISMATCH` | « Licence liée à un autre appareil. Le support peut la transférer. » |
| `LICENSE_EXPIRED` | « Votre licence a expiré. Renouvelez-la pour retrouver toutes vos manches. » |

## Support

Numéro WhatsApp, message pré-rempli et adresse e-mail vivent **uniquement** dans
`SUPPORT` (`config.js`). Le message est composé automatiquement avec le plan, le
prix et le code d'appareil du client.

> ⚠️ Le numéro livré est un **espace réservé** : `237600000000`. Remplacez-le avant
> toute mise en production.

## Jeu à deux

Chaque joueur a sa propre licence ou sa propre démonstration. À la connexion, les
deux pairs annoncent leurs features et l'ensemble effectif est leur **intersection** :
proposer une manche que l'autre n'a pas achetée n'aurait aucun sens.

C'est un contrôle de **cohérence**, pas de sécurité — un pair peut mentir sur ses
droits. Voir [`security.md`](security.md).
