# Sécurité — ce qui est protégé, ce qui ne l'est pas

Ce document dit ce qui tient et ce qui ne tient pas. Une application distribuée
sans serveur ne peut pas être « impossible à cracker », et l'affirmer serait
malhonnête.

## Modèle de menace

| Attaquant | Moyens | Résultat |
|---|---|---|
| **Curieux** | Vide son localStorage, recule son horloge, édite un champ | **Bloqué** |
| **Partageur** | Diffuse une licence achetée à des amis | **Bloqué si la licence est liée à un appareil** ; sinon non détectable hors ligne |
| **Bidouilleur** | Console du navigateur, appels aux API exposées | **Bloqué** — la façade n'est pas exposée, aucune primitive de signature n'existe |
| **Contourneur de démo** | Navigation privée, profil neuf, autre navigateur | **Non bloqué** — irréductible sans serveur |
| **Modificateur du bundle** | Édite le HTML, retire les vérifications | **Non bloqué** — il exécute son propre logiciel |

Les deux dernières lignes sont des limites **structurelles**, pas des défauts
d'implémentation. Aucun schéma de licence côté client ne les résout : le seul remède
est un serveur, prévu par [`future-backend.md`](future-backend.md).

## Ce qui est garanti

**Impossible de fabriquer une licence.** La signature est Ed25519 ; le client ne
détient que la clé publique. `src/licensing/ed25519.js` n'expose aucune routine de
signature, et un test échoue si l'une apparaît. Falsifier une licence exige la clé
privée.

**Impossible de modifier une licence.** La signature couvre les octets exacts du
jeton, entête de version comprise. Repousser une expiration, changer de plan, élever
`typ` en `private` ou ajouter des permissions casse la signature. Six tests couvrent
ces altérations une par une.

**Impossible d'obtenir plus que son plan.** Les features accordées sont
l'intersection de celles déclarées et de celles du plan. Une licence `plan_1000`
listant `game.c4` n'ouvre pas Puissance 4, même correctement signée.

**Édition du stockage détectable.** Chaque enregistrement porte un HMAC lié à
l'identifiant d'installation et à sa propre clé. Un enregistrement descellé est
traité comme hostile : démonstration consommée, licence altérée, liste de révocation
ignorée.

**Effacement partiel inopérant.** Écriture redondante dans localStorage et cookie,
miroir IndexedDB relu au démarrage. Le survivant est réinstallé partout.

**Essai non relançable par suppression d'une clé.** Un **jeton d'essai**
(`averi.lic.v1.trial`) est écrit à la première activation, sous une clé distincte de
l'état de démonstration, et consulté avant toute validation d'un nouvel essai.
Supprimer `averi.lic.v1.demo` ne rend rien : l'état est reconstruit depuis le jeton,
avec le temps réellement écoulé depuis son émission. Le jeton est scellé avec la clé
d'amorçage, si bien qu'effacer aussi l'identité ne le rend pas illisible — son
`installId` trahit alors l'essai précédent.

**Manipulations d'horloge inopérantes.** Voir [`demo-mode.md`](demo-mode.md) : le
temps consommé est le maximum entre le sommet d'horloge observé et le temps
monotone cumulé.

**Réinitialisation de la démo fermée.** `resetDemo()` exige une licence privée avec
la permission `testing` ; `DemoEngine.reset()` exige en plus un jeton d'autorisation
non exporté. `window.AveriLicense` n'expose ni la façade ni l'interface.

## Ce qui n'est pas garanti

**La démonstration peut être relancée** avec un profil de navigateur neuf, ou en
effaçant **simultanément** l'état de démonstration et le jeton d'essai dans tous les
dépôts — localStorage, cookies **et** IndexedDB. Un serveur qui indexerait la
démonstration sur un numéro de téléphone y répondrait ; localement, non.

Empiler une quatrième, puis une cinquième trace augmenterait linéairement l'effort
de contournement sans jamais changer la nature du problème : le rendement décroît
vite, et la complexité ajoutée finit par coûter plus cher qu'elle ne protège.

**`device_limit` seul ne limite rien.** Sans binding d'empreinte, une licence
fonctionne sur toute installation où on la colle. Le générateur avertit à chaque
émission non liée. La parade hors ligne existe : `--device`.

**Pas de révocation à distance.** Une licence révoquée aujourd'hui continue de
fonctionner sur les appareils déjà installés jusqu'à ce qu'ils reçoivent une mise à
jour du client contenant `EMBEDDED_REVOCATIONS`. La console privée le dit
explicitement plutôt que de laisser croire le contraire.

**Le pair distant peut mentir sur ses droits.** Les features annoncées lors de la
poignée de main P2P ne sont pas vérifiables : un client modifié peut prétendre
posséder `plan_2000`. C'est un contrôle de cohérence — éviter de proposer une manche
que l'autre n'a pas — et non un contrôle de sécurité.

**Le HMAC de scellement n'est pas un secret.** Sa clé est dérivable par quiconque lit
le code. Il rend l'édition détectable, pas impossible.

## Décisions de conception défensives

- **Version de format dans les octets signés** — ferme les attaques de downgrade.
- **Signature sur les octets transmis, jamais re-sérialisés** — supprime toute
  ambiguïté de canonicalisation.
- **Rejet des scalaires non réduits** — supprime la malléabilité des signatures.
- **Rejet des encodages de points non canoniques** — un même point ne peut pas avoir
  deux représentations acceptées.
- **Signature vérifiée avant l'expiration** — l'état retourné ne renseigne pas
  l'attaquant sur l'étape franchie.
- **Échec fermé partout** — état corrompu, illisible, descellé, ou d'une autre
  installation : la démonstration est considérée **consommée**, jamais disponible.
- **Empreinte non matérielle** — respect de la vie privée et stabilité pour le
  client légitime.
- **Comparaisons à temps constant** sur les empreintes et les sceaux.

## Règle absolue sur la clé privée

La clé privée ne doit jamais être : commitée, incluse dans un bundle, envoyée à un
client, stockée dans le frontend, ni placée dans les variables d'environnement d'un
client.

Contrôle automatisé avant toute publication :

```bash
node tools/audit-secrets.mjs
```

Il inspecte les fichiers du dépôt, les fichiers suivis par Git, **l'historique Git**
et les permissions des clés locales. `tools/build.mjs` refuse de produire un livrable
contenant une clé PEM, `node:crypto` ou une primitive de génération de clé.
`tests/security.test.mjs` rejoue ces contrôles à chaque exécution de la suite.

## Procédure d'urgence — clé privée compromise

1. **Ne pas publier** de nouvelle version avec l'ancienne clé.
2. Générer une clé de remplacement : `keygen --kid k2`.
3. Passer `ACTIVE_KEY_ID` à `k2` dans `config.js`.
4. **Retirer immédiatement** `k1` de `TRUSTED_KEYS` : toute licence signée par `k1`,
   légitime ou contrefaite, devient invalide.
5. Reconstruire, publier, et réémettre les licences actives depuis
   `keys/issued-licenses.jsonl` — le registre est la seule trace de qui possède quoi.
6. Si la clé a été **commitée**, la réécriture de l'historique ne suffit pas : elle
   doit être considérée comme définitivement publique.

## Procédure — licence diffusée en masse

1. `revoke AVR-XXXXXXXX --reason "diffusion publique"`.
2. Recopier la liste dans `EMBEDDED_REVOCATIONS` (`src/licensing/revocation.js`).
3. Reconstruire et publier : les clients bloquent la licence à la mise à jour.
4. Émettre une licence de remplacement **liée à l'appareil** au client légitime.

Sans backend, l'étape 3 est le seul vecteur de diffusion. Avec le validateur
distant, elle devient immédiate.
