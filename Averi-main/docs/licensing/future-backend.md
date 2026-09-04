# Ajouter un serveur de licences

L'architecture est prête. Le passage au mode hybride ne demande **aucune
réécriture** : une ligne de configuration et un serveur qui respecte le contrat.

## L'interface, déjà en place

```js
interface LicenseValidator {
  readonly name: string
  validate(token, ctx): Promise<LicenseStatusResult>
  validateSync(token, ctx): LicenseStatusResult | null
}
```

Trois implémentations existent dans `src/licensing/validators.js` :

- `LocalLicenseValidator` — enveloppe `LicenseEngine`. Actif aujourd'hui.
- `RemoteLicenseValidator` — squelette, non activé faute de serveur.
- `HybridLicenseValidator` — **déjà en place** dans la façade, avec un distant
  désactivé (donc strictement équivalent au local).

## Activation

```js
new LicenseFacade({ remoteEndpoint: 'https://licences.averi.app' });
```

`RemoteLicenseValidator.enabled` passe à vrai et l'hybride commence à consulter le
serveur. Rien d'autre ne change.

## Politique de l'hybride

**Le local fait autorité pour accorder ; le distant ne peut que retirer.**

| Local | Distant | Résultat |
|---|---|---|
| valide | valide | accès ouvert |
| valide | injoignable | **accès ouvert** — hors ligne, l'achat reste honoré |
| valide | révoquée / activée ailleurs | accès fermé |
| invalide | — | accès fermé |

Un serveur en panne ne prive jamais un client payant de son achat. C'est la
propriété qui rend le déploiement du backend sans risque.

## Contrat attendu du serveur

```http
POST /v1/validate
Content-Type: application/json

{
  "token": "AVR1.…",
  "device_fingerprint": "1ce1bccc…",
  "product": "averi"
}
```

```json
{
  "status": "LICENSE_ACTIVE",
  "revoked": false,
  "expires_at": 1791115280,
  "activations": 1,
  "server_time": 1788523280,
  "detail": null
}
```

`status` reprend les valeurs de `src/licensing/status.js`. Le client applique un
délai de 6 s (`timeoutMs`) et traite toute erreur comme « hors ligne ».

## Ce que le serveur apporterait

| Limite actuelle | Levée par le serveur |
|---|---|
| Révocation seulement à la mise à jour du client | Révocation immédiate |
| `device_limit` déclaratif sans binding | Décompte réel des activations |
| Démonstration relançable avec un profil neuf | Démo indexée sur un numéro de téléphone |
| Pair pouvant mentir sur ses droits | Droits attestés par le serveur |
| Registre d'émission sur un seul poste | Registre central |
| Paiement et licensing découplés | Émission automatique après paiement |

## Étapes de mise en œuvre

1. **Serveur d'émission** — expose l'actuel `LicenseBuilder` + `CryptoSigner`
   derrière une API authentifiée. La clé privée reste côté serveur : le modèle ne
   change pas, elle change simplement de machine.
2. **Endpoint `/v1/validate`** — répond au contrat ci-dessus.
3. **Liste de révocation signée** — servie sur `/v1/revocations`, vérifiée avec la
   même clé publique que les licences, puis passée à `RevocationRegistry.merge()`.
   Le point d'entrée existe déjà.
4. **Renseigner `remoteEndpoint`** — rien d'autre ne bouge côté client.
5. **Webhook de paiement** (mobile money) — déclenche l'émission automatique et
   remplace le parcours manuel décrit dans [`public-license.md`](public-license.md).

## À ne pas faire

- **Rendre la validation distante obligatoire.** Averi se joue en pair-à-pair, y
  compris sur des réseaux instables. Exiger le réseau pour ouvrir l'application
  détruirait la promesse du produit.
- **Déplacer la clé privée vers un service tiers** sans HSM ni journal d'audit.
- **Retirer le moteur local.** Il reste la référence hors ligne et le socle des
  tests ; le distant s'y ajoute, il ne le remplace pas.
