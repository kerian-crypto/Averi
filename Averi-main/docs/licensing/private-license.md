# Licences privées

Réservées à l'administration, au support, aux tests et aux partenaires autorisés.
Jamais commercialisées.

## Ce qui les distingue

| | Publique | Privée |
|---|---|---|
| `typ` | `public` | `private` |
| Plan | `plan_1000` \| `plan_2000` | `plan_internal` **imposé** |
| Permissions | **interdites** | requises |
| Console | inaccessible | accessible selon permissions |
| Interface | commerciale | console technique |
| Émission | après paiement | sur décision interne |

Le moteur refuse (`LICENSE_PLAN_UNKNOWN`) toute licence privée sur un plan public,
et toute licence publique sur `plan_internal`. Le schéma refuse (`LICENSE_TAMPERED`)
une licence publique portant des permissions.

## Permissions

Un **système de permissions**, jamais une succession de `if (private)`.

| Permission | Ce qu'elle ouvre |
|---|---|
| `admin` | Tous les onglets de la console. |
| `support` | Licenses, Activations, Devices, Logs. |
| `diagnostics` | Devices, Diagnostics. |
| `internal_tools` | Generate, Logs. |
| `testing` | Réinitialisation de la démonstration. |
| `advanced_settings` | Settings. |

Les permissions inconnues sont **écartées silencieusement** à la vérification : une
licence demandant `root` n'obtient rien.

La console est accessible dès qu'une des permissions de `CONSOLE_PERMISSIONS`
(`admin`, `support`, `diagnostics`, `internal_tools`) est présente. Chaque onglet
applique ensuite sa propre règle.

## La console — `console.html`

Page séparée, `noindex`. Aucun secret, aucun privilège propre : elle exige une
licence privée valide, vérifiée par le **même moteur** que l'application. Y accéder
sans licence privée ne donne accès à rien.

```
Averi License Console
├── Consulter
│   ├── Vue d'ensemble       accès ouvert ou fermé, et par quoi
│   ├── Licences             trousseau + détail de la licence active
│   ├── Activations          mise en service, cohérence, portée du décompte
│   └── Appareil             identité de l'installation, code d'appareil
├── Administrer
│   ├── Préparer une licence compose une COMMANDE, ne signe rien
│   └── Révocations          liste embarquée + liste locale
└── Système
    ├── Journal              historique des événements, traduits
    ├── Diagnostic           dépôts, intégrité, horloge, jeton d'essai, clés
    └── Configuration        valeurs effectives, lecture seule
```

### Lisibilité

La console reste technique — elle affiche les identifiants bruts — mais un champ
nommé `nbf` ou `dlm` ne dit rien à qui n'a pas lu la spécification. Chaque donnée
est donc présentée en trois temps :

```
Échéance                4 oct. 2026, 13:01   dans 30 jours
                        Au-delà, l'accès se referme jusqu'au renouvellement.
```

— un **libellé en clair**, une **valeur formatée** accompagnée de son écart au
présent, et une **explication** de ce qu'il faut en conclure. Les formes brutes
(`nbf`, `dev.m`, `install_id`, `token_digest`…) sont regroupées dans des blocs
« Données brutes » repliés par défaut.

Chaque onglet s'ouvre sur une phrase qui dit à quoi il sert. Les codes internes
sont traduits : `clock_backwards` devient « La date de l'appareil a reculé /
Aucun temps de démonstration n'a été rendu ». Des tests vérifient qu'aucun nom de
champ brut n'apparaît comme seule étiquette visible et que chaque fait porte son
explication.

### Trousseau

L'onglet **Licences** liste toutes les licences mémorisées sur l'appareil, chacune
avec son verdict recalculé, et permet de basculer de l'une à l'autre sans recoller
de code. Voir [`activation.md`](activation.md#plusieurs-licences-sur-un-même-appareil).

L'habillage est **radicalement différent** de l'interface publique : palette ardoise,
typographie monospace, tableaux denses, navigation latérale — pas un bouton de plus
sur l'interface du jeu. Un test vérifie qu'aucune classe `lic-*` ou `glass` du monde
public n'apparaît dans la console.

## L'onglet Generate ne génère rien

C'est le point le plus important. Le client ne détient que la clé publique : il est
**structurellement incapable** de signer (règle 16 de la spécification).

`Generate` compose donc la commande à exécuter sur le poste d'émission :

```
node tools/license-generator/cli.mjs generate \
    --type public \
    --plan plan_2000 \
    --duration 90d \
    --device 1ce1bccc062cd07c3ac8bdf26da9fbff \
    --holder "Awa N." \
    --ref "MOMO-2291"
```

Le bouton « Utiliser cet appareil » y insère l'empreinte de l'installation courante —
utile quand un agent de support configure directement le téléphone d'un client.

Un test vérifie qu'aucune chaîne ressemblant à un jeton signé (`AVR1.<80+ caractères>`)
ne sort jamais de la console.

## Émettre une licence privée

```bash
node tools/license-generator/cli.mjs generate \
    --type private \
    --permissions admin,diagnostics,testing \
    --duration 1y \
    --holder "Kerian — poste d'admin"
```

Le plan `plan_internal` est imposé automatiquement. Par défaut, sans `--permissions`,
la licence reçoit `support,diagnostics` — le minimum utile.

## Recommandations

- **Liez les licences privées à un appareil** (`--device`) : ce sont les plus
  sensibles, et elles n'ont pas à circuler.
- **Durées courtes** pour les partenaires et les prestataires ; `1y` au maximum
  pour un poste interne.
- **Renseignez `--holder`** : le registre `keys/issued-licenses.jsonl` est la seule
  trace de qui détient quoi, tant qu'il n'y a pas de backend.
- N'accordez `testing` qu'aux postes de test : c'est la seule permission qui
  réinitialise une démonstration.
