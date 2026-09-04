# Mode d'emploi de la console Averi

Guide complet, du premier démarrage aux gestes quotidiens.

**Pour qui** — la personne qui vend les licences, répond aux clients et diagnostique
les problèmes. Aucune connaissance en cryptographie n'est nécessaire.

**Ce qu'il faut** — le dépôt Averi sur un ordinateur, Node.js 20 ou plus récent, et
un terminal. La console elle-même s'ouvre dans un navigateur.

---

## Table des matières

1. [Comprendre en deux minutes](#1-comprendre-en-deux-minutes)
2. [Mise en place initiale](#2-mise-en-place-initiale-une-seule-fois)
3. [Ouvrir la console](#3-ouvrir-la-console)
4. [Les neuf onglets](#4-les-neuf-onglets)
5. [Les gestes du quotidien](#5-les-gestes-du-quotidien)
6. [Comprendre les états](#6-comprendre-les-états)
7. [Ce que la console ne peut pas faire](#7-ce-que-la-console-ne-peut-pas-faire)
8. [Règles de sécurité](#8-règles-de-sécurité)
9. [Quand la console elle-même pose problème](#9-quand-la-console-elle-même-pose-problème)

---

## 1. Comprendre en deux minutes

Averi n'a pas de serveur. Une licence est un **code signé** que vous fabriquez sur
votre ordinateur et que vous envoyez au client. Son téléphone vérifie la signature
tout seul, hors ligne.

Trois lieux, trois rôles :

| Lieu | Ce qui s'y passe |
|---|---|
| **Votre terminal** (`cli.mjs`) | Fabrique les licences. Détient la clé privée. |
| **La console** (`console.html`) | Consulte, diagnostique, prépare les commandes. **Ne fabrique rien.** |
| **Le téléphone du client** (`index.html`) | Vérifie et applique la licence. |

La console ne peut pas signer de licence, et c'est voulu : si l'application savait
signer, n'importe qui pourrait s'en fabriquer une en lisant son code.

Deux familles de licences :

- **Client** (publique) — vendue 1 000 ou 2 000 FCFA. N'ouvre jamais la console.
- **Interne** (privée) — pour vous et votre équipe. Ouvre la console selon ses
  permissions.

---

## 2. Mise en place initiale (une seule fois)

### 2.1 Créer votre clé de signature

```bash
cd /chemin/vers/Averi-main
node tools/license-generator/cli.mjs keygen
```

Cette commande crée deux fichiers dans `keys/` et installe automatiquement la partie
publique dans l'application.

> ⚠️ **`keys/averi-signing-k1.private.pem` est le fichier le plus important du
> projet.** Le perdre vous empêche d'émettre de nouvelles licences. Le laisser
> fuiter permet à un tiers d'en fabriquer. Copiez-le sur une clé USB rangée en
> lieu sûr, aujourd'hui. Il ne doit jamais être envoyé à un client, ni publié, ni
> commité — `.gitignore` l'empêche déjà.

Pour ranger vos clés hors du dépôt :

```bash
export AVERI_KEYS_DIR="$HOME/.averi/keys"
```

Ajoutez cette ligne à votre `~/.bashrc` pour ne plus y penser.

### 2.2 Vous émettre une licence interne

```bash
node tools/license-generator/cli.mjs generate \
    --type private \
    --permissions admin,support,diagnostics,internal_tools,testing \
    --duration 1y \
    --holder "Votre nom — poste d'administration"
```

La commande affiche un code commençant par `AVR1.`. **Copiez-le** : c'est votre clé
d'entrée dans la console. Il est aussi consigné dans `keys/issued-licenses.jsonl`.

### 2.3 Construire les fichiers

```bash
npm run build
```

À relancer après **toute** modification de `src/` ou de la configuration — sinon
`index.html` et `console.html` gardent l'ancienne version.

### 2.4 Servir les pages

```bash
python3 -m http.server 8000
```

Puis ouvrez `http://localhost:8000/console.html`.

> **Pourquoi pas un double-clic sur le fichier ?** En ouvrant un fichier
> directement (`file://`), certains navigateurs isolent le stockage de chaque
> page : `index.html` et `console.html` ne partageraient plus rien. Passez par
> `http://` dès que vous voulez un comportement fidèle à la production.

Si le site est déjà en ligne (Vercel, GitHub Pages), la console y est aussi :
`https://votre-domaine/console.html`. Elle reste verrouillée par licence privée.
Voir la section « Héberger » du README pour ne pas la publier du tout.

---

## 3. Ouvrir la console

Au premier chargement, la console affiche **« Accès réservé »**. C'est normal : ce
n'est pas une panne, c'est le verrou.

1. Collez votre licence interne dans le champ **Licence privée**.
2. Cliquez **Ouvrir la console**.

Si le code est refusé, le motif s'affiche sous le champ et votre saisie est
conservée. Les motifs les plus courants sont expliqués au §6.

Une fois entré, vous restez connecté : la licence est mémorisée sur cet appareil.
Le bas de la barre latérale rappelle en permanence **qui** est connecté et **avec
quelles permissions**.

### Ce que chaque permission ouvre

| Permission | Onglets accessibles |
|---|---|
| `admin` | Tous |
| `support` | Licences, Activations, Appareil, Journal |
| `diagnostics` | Appareil, Diagnostic |
| `internal_tools` | Préparer une licence, Journal |
| `advanced_settings` | Configuration |
| `testing` | Ajoute « Rouvrir un essai » dans Diagnostic |

Un onglet grisé signifie que votre licence ne porte pas la permission requise.
Donnez à chacun le minimum dont il a besoin : un agent de support n'a pas à
préparer des émissions.

---

## 4. Les neuf onglets

### Vue d'ensemble

**La question à laquelle il répond :** l'application est-elle débloquée sur cet
appareil, et par quoi ?

Quatre cartes en haut : l'accès (ouvert / fermé), ce qui l'ouvre (une licence ou la
démonstration), le nombre de manches accessibles, et le nombre de licences
mémorisées.

En dessous : la situation détaillée, la liste de ce qui est débloqué, et — s'il y en
a — les **signaux relevés**. Ces signaux ne sont pas des accusations : un changement
de fuseau horaire ou un nettoyage de navigateur les déclenche aussi.

### Licences

**Le cœur de votre travail quotidien.**

Le **trousseau** liste toutes les licences mémorisées sur cet appareil. Un point `●`
marque celle qui est active. Chaque ligne indique l'offre, le titulaire, l'échéance
(avec « dans 27 jours » à côté de la date), si la licence est liée à l'appareil, et
son état.

- **Activer** — bascule sur cette licence. Elle est **revalidée au passage** : une
  licence expirée ou révoquée depuis son ajout sera refusée, pas ressuscitée.
- **Oublier** — la retire de cet appareil. Le code reste utilisable ailleurs.

En dessous, le **détail de la licence active** : chaque champ porte son libellé en
clair et l'explication de ce qu'il faut en conclure. Les formes brutes (`nbf`,
`dev.m`, `kid`…) sont dans le bloc dépliable « Champs bruts de la licence ».

Tout en bas, **Ajouter ou vérifier un code** :

- **Vérifier** — lit le code **sans rien changer**. C'est le bouton à utiliser quand
  un client vous envoie son code et demande pourquoi il ne fonctionne pas.
- **Ajouter et activer** — installe la licence sur cet appareil.

### Activations

Quand et où la licence a été mise en service. Utile pour répondre à « depuis quand
suis-je client ? » ou pour repérer un profil copié d'une machine à l'autre — la
ligne **Cohérence** passe alors en rouge.

Le nombre d'activations ne monte pas quand on recolle le même code ; il repart à 1
quand on change de licence.

### Appareil

L'identité de cette installation.

Le **code d'appareil** (`AVR-DEV-DD19-DE69-…-8B5F`) est ce que le client vous
envoie ; il se passe tel quel à `--device`. Le bouton **Copier l'empreinte
complète** donne la même valeur sans mise en forme — les deux sont acceptées.

L'identifiant est **aléatoire**, pas une empreinte matérielle : il ne révèle rien du
client et reste stable quand son navigateur ou son écran change. La section
« Environnement » n'est là que pour le diagnostic et ne bloque jamais rien.

### Préparer une licence

**Cet onglet ne fabrique aucune licence.** Il compose la commande à exécuter dans
votre terminal.

Remplissez les champs, cliquez **Copier la commande**, collez-la dans un terminal,
exécutez. Le bouton **Lier à cet appareil** insère l'empreinte de l'installation
courante — pratique quand vous configurez directement le téléphone d'un client.

En dessous : le catalogue des offres et la liste des permissions internes.

### Révocations

Refuser une licence même valide et non expirée — après un remboursement ou une
diffusion publique.

Deux listes : celles **livrées avec l'application** (actives chez tous les clients)
et celles **ajoutées sur cet appareil seulement**.

> **Point essentiel :** une révocation ajoutée ici ne vaut que pour cette
> installation. Pour bloquer une licence chez tous vos clients, voir §5.6.

### Journal

L'historique local, du plus récent au plus ancien, en langage clair : « Licence
activée », « Démonstration lancée », « Licence refusée ». Aucune donnée personnelle,
rien ne sort de l'appareil.

Avec `admin` ou `internal_tools` : **Copier en JSON** et **Vider le journal**.

### Diagnostic

L'écran à ouvrir quand quelque chose ne se comporte pas comme prévu.

- **Où les données sont conservées** — les emplacements disponibles. Si seule la
  « mémoire vive » apparaît, le client est en navigation privée très restrictive et
  **rien ne survivra à la fermeture de l'onglet**.
- **Intégrité** — données manquantes ou modifiées hors de l'application.
- **Démonstration** — durée, état, temps restant, et l'état du **jeton d'essai**.
- **Vérification** — comment les licences sont contrôlées, quelles clés sont
  acceptées.
- **Outils de test** — avec la permission `testing` seulement : **Rouvrir un essai
  d'une heure**.
- **Rapport complet** — à joindre à une demande d'assistance.

### Configuration

Les valeurs qui régissent le produit : offres, prix, durées, contenu de chaque
offre, permissions, numéro de support.

**Lecture seule, et c'est volontaire.** Les modifier ici n'aurait aucun effet : une
licence déjà signée porte ses propres droits. Pour changer une offre, éditez
`src/licensing/config.js` puis relancez `npm run build`.

---

## 5. Les gestes du quotidien

### 5.1 Un client a payé — lui envoyer sa licence

**Licence simple, utilisable partout :**

```bash
node tools/license-generator/cli.mjs generate \
    --type public --plan plan_1000 --duration 30d \
    --holder "Awa N. — 6XX XX XX XX" --ref "MOMO-2291"
```

Copiez le code affiché et envoyez-le par WhatsApp. Le client le colle dans
« J'ai déjà une licence ».

`plan_1000` = Averi Duo, 1 000 FCFA, 30 jours. `plan_2000` = Averi Duo Infini,
2 000 FCFA, 90 jours. Vérifiez le catalogue avec :

```bash
node tools/license-generator/cli.mjs plans
```

**Renseignez toujours `--holder` et `--ref`.** Sans serveur,
`keys/issued-licenses.jsonl` est votre seule trace de qui a acheté quoi.

### 5.2 Émettre une licence liée à un seul téléphone

C'est la seule façon d'empêcher réellement qu'une licence circule.

1. **Le client vous envoie son code d'appareil.** Il le trouve dans « Activer une
   licence », sous le bouton **Copier** :

   ```
   AVR-DEV-DD19-DE69-51CF-B031-1C68-5460-B796-8B5F
   ```

   Le message WhatsApp pré-rempli le contient déjà — il n'a rien à recopier à la
   main.

2. **Collez ce code tel quel** dans la commande :

```bash
node tools/license-generator/cli.mjs generate \
    --type public --plan plan_2000 --duration 90d \
    --device AVR-DEV-DD19-DE69-51CF-B031-1C68-5460-B796-8B5F \
    --holder "Awa N." --ref "MOMO-2291"
```

Le générateur accepte le code avec ou sans le préfixe `AVR-DEV-`, avec ou sans
tirets, en majuscules comme en minuscules. Un code tronqué est refusé avec un
message explicite plutôt que d'émettre une licence inutilisable.

3. **Envoyez la licence au client.** Elle ne fonctionnera que sur ce téléphone.

Sans `--device`, le générateur vous avertit : la licence fonctionnera partout où on
la colle.

### 5.3 Un client dit « ma licence ne marche pas »

1. Demandez-lui de vous renvoyer **le code complet**.
2. Onglet **Licences** → collez-le → **Vérifier**.
3. Lisez la ligne `status` :

| Statut | Ce qui s'est passé | Que faire |
|---|---|---|
| `LICENSE_ACTIVE` | La licence est bonne | Le problème est ailleurs : faites-lui vider et recoller le code |
| `LICENSE_EXPIRED` | Échéance dépassée | Émettre un renouvellement |
| `LICENSE_TAMPERED` | Code incomplet ou modifié | Il a tronqué le copier-coller — renvoyez le code |
| `LICENSE_DEVICE_MISMATCH` | Licence liée à un autre appareil | Voir §5.4 |
| `LICENSE_NOT_YET_VALID` | Date de début pas atteinte | Attendre, ou réémettre |
| `LICENSE_REVOKED` | Vous l'avez révoquée | Émettre une nouvelle licence |
| `LICENSE_PRODUCT_MISMATCH` | Code d'un autre produit | Ce n'est pas une licence Averi |

### 5.4 Un client a changé de téléphone

Une licence liée ne suit pas l'appareil — c'est ce qui fait sa valeur.

1. Récupérez le **nouveau** code d'appareil.
2. Émettez une licence de remplacement avec la même échéance :
   `--expires 2026-10-04T13:01:00Z`
3. Révoquez l'ancienne (§5.6) si vous craignez qu'elle circule.

Même procédure quand un client a effacé toutes ses données : son installation a
changé d'identité, donc d'empreinte.

### 5.5 Renouveler une licence

Émettez simplement une nouvelle licence. Le client la colle par-dessus : elle
devient active, et l'ancienne reste dans son trousseau sans gêner.

### 5.6 Une licence a été diffusée en masse

```bash
node tools/license-generator/cli.mjs revoke AVR-0F6X18VK --reason "diffusion publique"
```

La commande affiche la liste à recopier dans `EMBEDDED_REVOCATIONS`
(`src/licensing/revocation.js`), puis :

```bash
npm run build
```

Publiez la nouvelle version. Les clients appliqueront la révocation en récupérant la
mise à jour — **pas avant**. Sans serveur, c'est le seul vecteur possible.

Émettez ensuite une licence de remplacement **liée à l'appareil** au client
légitime.

### 5.7 Donner un accès à un collègue

```bash
node tools/license-generator/cli.mjs generate \
    --type private --permissions support,diagnostics \
    --duration 90d --holder "Prénom Nom — support"
```

Accordez le minimum : `support,diagnostics` suffit pour répondre aux clients.
Réservez `admin` à vous-même, et `testing` aux postes de test.

Pour un prestataire, liez la licence à son appareil et donnez une durée courte.

### 5.8 Tester le parcours client

1. Onglet **Diagnostic** → **Rouvrir un essai d'une heure** (permission `testing`).
2. Ouvrez `index.html` : la démonstration est de nouveau disponible.

Ce bouton est le seul moyen prévu de rouvrir un essai. Il n'existe dans aucun
parcours client.

### 5.9 Consulter le registre de vos ventes

```bash
cat keys/issued-licenses.jsonl
```

Une ligne par licence émise : date, identifiant, offre, échéance, titulaire,
référence de paiement. **Sauvegardez ce fichier** avec vos clés.

---

## 6. Comprendre les états

| État | Signification |
|---|---|
| `DEMO_AVAILABLE` | Essai jamais lancé sur cet appareil |
| `DEMO_ACTIVE` | Essai en cours |
| `DEMO_EXPIRED` | Heure d'essai consommée |
| `LICENSE_ACTIVE` | Licence valide, accès ouvert |
| `LICENSE_EXPIRED` | Échéance dépassée |
| `LICENSE_NOT_YET_VALID` | Date de début pas encore atteinte |
| `LICENSE_TAMPERED` | Code modifié, tronqué, ou contrefait |
| `LICENSE_INVALID` | Code illisible ou émetteur inattendu |
| `LICENSE_REVOKED` | Licence inscrite dans une liste de révocation |
| `LICENSE_DEVICE_MISMATCH` | Licence émise pour un autre appareil |
| `LICENSE_PRODUCT_MISMATCH` | Licence d'un autre produit |
| `LICENSE_PLAN_UNKNOWN` | Offre inconnue de cette version |
| `LICENSE_VERSION_UNSUPPORTED` | Licence trop récente pour ce client |
| `LICENSE_UNKNOWN` | Aucune licence installée |

Le client ne voit jamais ces codes : son écran affiche « Cette licence n'est pas
valide. Vérifiez le code fourni par Averi. »

### Signaux du Diagnostic

| Constat | Conséquence |
|---|---|
| La date de l'appareil a reculé | Aucun temps d'essai n'a été rendu |
| La date a bondi en avant | Toléré — souvent un changement de fuseau |
| L'état de démonstration a été modifié à la main | Essai considéré comme consommé |
| L'état provient d'une autre installation | Essai considéré comme consommé |
| L'état avait disparu, reconstruit depuis le jeton | Le temps écoulé a été recalculé |

---

## 7. Ce que la console ne peut pas faire

Autant le savoir avant qu'un client ne pose la question.

- **Fabriquer une licence.** Par conception. L'onglet Préparer compose une commande,
  rien de plus.
- **Révoquer à distance.** Une licence révoquée aujourd'hui continue de fonctionner
  chez les clients jusqu'à ce qu'ils reçoivent une mise à jour.
- **Compter les appareils d'un client.** Sans serveur, chaque installation ignore
  les autres. Le champ « appareils déclarés » est indicatif ; seule une licence liée
  contraint réellement.
- **Empêcher un second essai gratuit.** Un client qui vide entièrement son stockage,
  ou passe en navigation privée, retrouvera une heure d'essai. Les contournements
  simples sont bloqués, pas les déterminés.
- **Voir les licences des autres appareils.** Le trousseau ne montre que celles
  posées sur *cette* installation.

Ces limites disparaissent avec un serveur de licences — l'architecture est prête,
voir [`future-backend.md`](future-backend.md).

---

## 8. Règles de sécurité

1. **La clé privée ne quitte jamais votre poste.** Ni WhatsApp, ni e-mail, ni Git,
   ni cloud partagé.
2. **Sauvegardez-la hors ligne**, ainsi que `issued-licenses.jsonl`.
3. **Vérifiez avant toute publication :**
   ```bash
   node tools/audit-secrets.mjs
   ```
   Il inspecte le dépôt, les fichiers suivis par Git et **l'historique**.
4. **Ne donnez `admin` qu'à vous-même.**
5. **Une clé commitée est une clé perdue.** Réécrire l'historique ne suffit pas :
   considérez-la comme publique et suivez la procédure d'urgence de
   [`security.md`](security.md).
6. **Ne partagez jamais votre licence interne** avec un client : elle ouvre la
   console.

---

## 9. Quand la console elle-même pose problème

**« Accès réservé » alors que j'ai collé ma licence**
Lisez le motif affiché sous le champ. Si c'est `LICENSE_TAMPERED`, votre
copier-coller est incomplet — le code fait environ 700 caractères. Si la licence est
valide mais sans permission, elle a été émise sans `admin`, `support`,
`diagnostics` ni `internal_tools`.

**« La console n'a pas pu démarrer »**
Le fichier n'a pas été construit :
```bash
npm run build
```

**Mes modifications de `config.js` n'apparaissent pas**
`index.html` et `console.html` contiennent une copie injectée. Relancez
`npm run build`.

**Ma licence a disparu après avoir vidé mon navigateur**
Normal : tout est stocké localement. Recollez votre code — vous l'avez dans
`keys/issued-licenses.jsonl`. Si vous aviez une licence *liée à l'appareil*, votre
installation a changé d'identité : réémettez-la avec la nouvelle empreinte.

**Les données diffèrent entre `index.html` et `console.html`**
Vous les ouvrez probablement en `file://`. Servez-les par HTTP (§2.4).

**Tout vérifier d'un coup**
```bash
npm run check
```
Enchaîne la construction, les 221 tests et l'audit des secrets.

---

## Pour aller plus loin

| Document | Contenu |
|---|---|
| [`architecture.md`](architecture.md) | Comment le système est organisé |
| [`public-license.md`](public-license.md) | Les offres et le parcours client |
| [`private-license.md`](private-license.md) | Licences internes et permissions |
| [`activation.md`](activation.md) | Activation, liaison d'appareil, trousseau |
| [`demo-mode.md`](demo-mode.md) | L'essai d'une heure et ses protections |
| [`security.md`](security.md) | Ce qui est protégé, ce qui ne l'est pas |
| [`cryptography.md`](cryptography.md) | Les choix cryptographiques |
| [`future-backend.md`](future-backend.md) | Ajouter un serveur plus tard |
