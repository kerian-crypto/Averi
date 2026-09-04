# Activation

## Flux

```
Utilisateur colle son code
        │
        ▼
   normalizeToken()          espaces et retours ligne retirés
        │
        ▼
   decodeToken()             structure, entête, base64url, schéma
        │
        ▼
   verifySignature()         Ed25519 sur les octets exacts
        │
        ▼
   verifyProduct/Issuer      averi, averi-license-authority
        │
        ▼
   verifyFeatures()          plan connu, intersection avec le plan
        │
        ▼
   révocation                liste embarquée + liste locale scellée
        │
        ▼
   verifyExpiration()        nbf ≤ maintenant ≤ exp, ±24 h de tolérance
        │
        ▼
   verifyDeviceBinding()     empreinte, comparaison à temps constant
        │
        ▼
   enregistrement scellé     licence + activation
        │
        ▼
   LICENSE_ACTIVE
```

L'ordre importe : la signature est vérifiée **avant** l'expiration. Une contrefaçon
expirée est rapportée comme `LICENSE_TAMPERED`, jamais comme `LICENSE_EXPIRED` —
l'état retourné ne doit pas renseigner un attaquant sur ce qui a été accepté.

## Enregistrement d'activation

```js
{
  version: 1,
  licenseId, planId, type,
  tokenDigest,           // empreinte du jeton, anti-rejeu
  installId,
  deviceFingerprint,
  activatedAt, lastSeenAt,
  count                  // nombre d'activations distinctes
}
```

Scellé, redondant, distinct de la licence elle-même : il note **quand** et **sur
quelle installation** la licence a été activée. C'est ce qui permet, sans serveur,
de distinguer « licence valide » de « licence valide mais activée ailleurs ».

Un enregistrement descellé est **ignoré**, pas corrigé.

## Anti-rejeu

Réactiver la même licence sur la même installation confirme l'activation sans
incrémenter `count`. Activer une licence différente remet le compteur à 1.

## Liaison à l'appareil

Deux modes, et c'est une décision de conception importante.

### `device_binding: none` — licence libre

La licence fonctionne sur toute installation où on la colle. `device_limit` est
alors **purement déclaratif** : sans serveur, rien ne peut compter les activations
réparties sur plusieurs machines. Le générateur affiche un avertissement explicite
à chaque émission de ce type.

Usage : dépannage, licence de courtoisie, client qui change souvent d'appareil.

### `device_binding: fp` — licence liée (recommandé)

La licence ne vaut que sur l'installation dont l'empreinte a été inscrite à
l'émission. C'est le **seul binding réellement contraignant hors ligne**.

Parcours :

1. Le client ouvre « Activer une licence » et copie son **code d'appareil** :
   `AVR-DEV-DD19-DE69-51CF-B031-1C68-5460-B796-8B5F`.
2. Il l'envoie au support avec sa preuve de paiement — le message WhatsApp est
   pré-rempli avec ce code.
3. Le support le passe **tel quel** au générateur : `--device AVR-DEV-DD19-…`.
   Le préfixe, les tirets et la casse sont optionnels ; l'hexadécimal nu convient
   aussi.
4. La licence ne s'active que sur cet appareil.

Le code affiché contient l'empreinte **entière**, simplement groupée par quatre.
Une forme abrégée serait plus jolie mais non réversible : le support recevrait un
code dont il ne pourrait rien faire, et ce parcours deviendrait impraticable.

## Ce qu'est l'empreinte — et ce qu'elle n'est pas

L'empreinte dérive d'un **identifiant d'installation aléatoire** (32 octets tirés de
`crypto.getRandomValues`), pas des caractéristiques matérielles.

Une empreinte matérielle — canvas, polices, résolution — serait à la fois intrusive
(c'est du pistage) et **instable** : changer de résolution ou mettre à jour son
navigateur casserait la licence d'un client légitime. Un identifiant aléatoire
persistant est stable, ne révèle rien de l'utilisateur, et suffit à lier une licence
à une installation.

Les traits d'environnement sont malgré tout collectés, **uniquement** pour le
diagnostic et comme signal faible « profil probablement copié ». Ils ne bloquent
rien.

Conséquence assumée : effacer complètement son stockage crée une nouvelle
installation, donc une nouvelle empreinte. Une licence liée devient alors
inutilisable et doit être retransférée par le support. C'est le prix d'un binding
respectueux de la vie privée et stable.

## Transfert d'appareil

Le client fournit son nouveau code d'appareil ; le support émet une licence de
remplacement liée à la nouvelle empreinte, avec la même échéance, et révoque
l'ancienne. La procédure est manuelle par construction : sans serveur, le transfert
ne peut pas être automatisé.

## Plusieurs licences sur un même appareil

Averi tient un **trousseau** : plusieurs licences peuvent être mémorisées sur une
même installation, **une seule active à la fois**.

```
averi.lic.v1.license   ← la licence ACTIVE : elle seule commande l'accès
averi.lic.v1.keyring   ← l'inventaire : jusqu'à 8 licences mémorisées
```

Cette séparation est délibérée. La licence active reste courte et bénéficie à plein
de la redondance multi-dépôts (un cookie plafonne autour de 4 Ko) ; le trousseau
n'est qu'un confort d'inventaire, et sa perte ne retire aucun droit.

### Ce qui ne peut pas interférer

- **Chaque licence porte sa propre signature et son propre verdict.** `licenses()`
  réévalue l'expiration, la révocation et la liaison d'appareil à chaque appel :
  une licence mémorisée n'est pas une licence valide.
- **Les droits ne fuient pas d'une licence à l'autre.** Basculer d'une licence
  privée vers une licence publique retire immédiatement les permissions internes et
  referme la console.
- **Basculer revalide.** `switchLicense()` repasse par l'activation complète : une
  licence expirée ou révoquée depuis son ajout est refusée, pas ressuscitée.
- **Un plan ne déborde pas sur un autre.** Les features accordées sont recalculées
  depuis le plan de la licence active, jamais accumulées.

### Ce qui partage l'état

- **Les onglets d'un même navigateur** partagent le stockage. Activer une licence
  dans l'un est vu par les autres au rafraîchissement suivant (une seconde) : c'est
  bien un état unique par installation, pas un état par onglet.
- **La démonstration** est unique par installation, jamais par licence. Le trousseau
  n'y donne aucune prise : ajouter ou retirer des licences ne rouvre pas d'essai.

### Ce qui reste séparé par construction

Deux appareils, deux installations, deux identités : **aucune interférence
possible**. Il n'existe aucun état partagé entre eux — c'est la contrepartie de
l'absence de serveur, qui empêche aussi tout décompte multi-appareils.

## Retrait

`facade.removeLicense()` efface licence **et** activation. Accessible depuis
« Changer de licence » (public) et depuis l'onglet Licenses (console privée).
