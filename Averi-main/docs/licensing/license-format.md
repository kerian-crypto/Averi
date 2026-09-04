# Format de licence

## Forme du jeton

```
AVR1.<payload_base64url>.<signature_base64url>
```

- `AVR1` — préfixe produit + **version du format**.
- `payload_base64url` — le JSON de la charge utile, encodé.
- `signature_base64url` — 64 octets de signature Ed25519.

La signature couvre les **octets ASCII de `AVR1.<payload_base64url>`** : l'entête de
version *et* la charge utile exactement telle qu'elle a été transmise.

Deux conséquences importantes :

1. **Aucune ambiguïté de canonicalisation.** On ne re-sérialise jamais le JSON avant
   de vérifier. L'ordre des clés, les espaces ou l'échappement Unicode ne peuvent ni
   invalider une licence légitime, ni en valider une falsifiée.
2. **Pas de downgrade de version.** Remplacer `AVR1` par `AVR0` change les octets
   signés et invalide la signature. Un test le vérifie.

Longueur typique : **~560 caractères**. Le jeton se transmet par copier-coller
(WhatsApp, SMS), jamais par saisie manuelle.

## Charge utile, version 1

```json
{
  "v":   1,
  "id":  "AVR-0F6X18VK",
  "typ": "public",
  "prd": "averi",
  "pln": "plan_1000",
  "iat": 1788523280,
  "nbf": 1788523280,
  "exp": 1791115280,
  "dev": { "m": "none" },
  "dlm": 1,
  "ftr": ["game.truth", "game.never", "chat.text"],
  "iss": "averi-license-authority",
  "kid": "k1",
  "met": { "holder": "…", "ref": "USSD-001" }
}
```

| Champ | Type | Rôle |
|---|---|---|
| `v` | entier | Version du format. Doit correspondre au préfixe. |
| `id` | `AVR-[A-Z0-9]{6,24}` | Identifiant unique, sert à la révocation. |
| `typ` | `public` \| `private` | Famille de licence. |
| `prd` | chaîne | Produit. Une licence d'un autre produit est rejetée. |
| `pln` | chaîne | Identifiant de plan. **Jamais un prix** : le moteur ne connaît que des identifiants. |
| `iat` | epoch s. UTC | Émission. |
| `nbf` | epoch s. UTC | Début de validité (licence différée possible). |
| `exp` | epoch s. UTC | Fin de validité. `0` = perpétuelle. |
| `dev` | objet | Liaison appareil : `{m:"none"}` ou `{m:"fp", v:"<32 hex>"}`. |
| `dlm` | entier ≥ 1 | Nombre d'appareils déclaré. |
| `ftr` | tableau | Features accordées. |
| `prm` | tableau | Permissions. **Interdit sur une licence publique.** |
| `iss` | chaîne | Émetteur attendu. |
| `kid` | chaîne | Clé de signature utilisée — permet la rotation. |
| `met` | objet | Métadonnées libres (titulaire, référence de paiement). |

Les clés sont courtes : chaque octet compte dans un jeton transmis par messagerie.

## Validation du schéma

`validatePayloadShape()` refuse strictement, sans jamais « interpréter au mieux » :

- champ requis absent ;
- type incorrect ;
- `id` hors motif ;
- `exp` antérieur ou égal à `nbf` (hors perpétuelle) ;
- `dev.m` inconnu, ou `dev.v` absent en mode `fp` ;
- permissions sur une licence publique ;
- `dlm < 1` ;
- désaccord entre l'entête de version et le champ `v`.

Une charge utile bien encodée mais hors schéma produit `LICENSE_TAMPERED`, pas
`LICENSE_INVALID` : elle a été *modifiée*, pas simplement mal recopiée.

## Défense en profondeur sur les features

Les features accordées sont l'**intersection** entre `ftr` et les features du plan
(`config.js`). Modifier `ftr` casse la signature — mais cette intersection ferme
aussi la porte à une émission administrative erronée. Une licence `plan_1000`
listant `game.c4` n'accorde pas `game.c4`.

Même principe pour les permissions : seules celles connues de `ALL_PERMISSIONS`
sont retenues.

## Versionnement et migration

- `LICENSE_FORMAT_VERSION` — la version émise aujourd'hui (1).
- `SUPPORTED_FORMAT_VERSIONS` — celles que ce client sait lire (`[1]`).

Une licence dont la version n'est pas supportée produit
`LICENSE_VERSION_UNSUPPORTED` — « Mettez Averi à jour » — et non un rejet
indifférencié.

**Ajouter un champ optionnel** (version 1 conservée) : ajoutez-le au schéma en
optionnel, émettez-le, les anciens clients l'ignorent. Rétrocompatible.

**Changer la sémantique d'un champ existant** : passez à `v: 2`, émettez `AVR2.…`,
et publiez d'abord un client qui accepte `[1, 2]`. Les licences v1 en circulation
continuent de fonctionner jusqu'à leur expiration naturelle.

**Ne jamais** retirer une version de `SUPPORTED_FORMAT_VERSIONS` tant que des
licences de cette version sont valides : cela invaliderait des achats.
