# ❤️ Averi — le jeu à deux, sans serveur

Un jeu de couple **à distance**, pour deux personnes, qui tient dans **un seul fichier HTML**.
Aucun compte, aucune base de données, aucun serveur de jeu : les deux navigateurs se parlent
directement en **pair-à-pair (WebRTC)** via [PeerJS](https://peerjs.com/), qui ne sert qu’à la
mise en relation initiale. Dès que la liaison est établie, tout — questions, coups, messages —
transite en direct entre vous deux et disparaît à la fermeture de l’onglet.

## Jouer

1. Ouvrez `index.html` (ou la page GitHub Pages) chacun de votre côté.
2. L’un choisit un prénom + un code de salle, puis **✨ Créer la salle**.
3. Il copie le **lien d’invitation** et l’envoie à l’autre, qui n’a plus qu’à mettre son prénom
   et cliquer **🔗 Rejoindre**.
4. Si le réseau est capricieux, le **mode manuel** permet de se connecter avec l’identifiant brut.

## Les six manches

| Manche | Principe |
|---|---|
| 🎲 **Action ou Vérité** | Une roue tire Vérité, Action ou Profond. Défi relevé : +3. Passé : −1. |
| 🙋 **Je n’ai jamais** | Vous répondez en secret, révélation simultanée. |
| 🗳️ **Le plus susceptible** | « Toi ou moi ? » — accord = points d’harmonie. |
| 💞 **Compatibilité** | QCM à quatre choix : même réponse = +2 pour chacun. |
| 🔴 **Puissance 4** | Alignez quatre cœurs. Vraie partie tour par tour, synchronisée. |
| 🃏 **Memory du duo** | 8 paires, tour par tour. Une paire = 1 point et vous rejouez. |

Le tout s’accompagne d’un **score**, d’une jauge d’**harmonie du duo**, d’une discussion
en direct, d’émoticônes qui traversent l’écran et de **320 cartes** de questions et de défis.

## Licences

Averi s'essaie **une heure gratuitement**, puis s'active avec une licence.

| Offre | Prix | Durée | Contenu |
|---|---|---|---|
| **Averi Duo** | 1 000 FCFA | 30 jours | 4 manches de conversation, discussion, émoticônes |
| **Averi Duo Infini** | 2 000 FCFA | 90 jours | Les 6 manches, cartes premium, tout inclus |

La vérification est **entièrement locale** : aucun compte, aucun serveur, aucune
connexion nécessaire. Les licences sont signées en **Ed25519** ; l'application ne
détient que la clé publique et ne peut donc que vérifier, jamais émettre.

Le paiement se fait par mobile money, la licence est transmise par WhatsApp après
confirmation. Le client peut lier sa licence à son appareil en communiquant son
**code d'appareil** (`AVR-DEV-…`), affiché dans l'écran d'activation.

Documentation complète : [`docs/licensing/`](docs/licensing/architecture.md).
Mode d'emploi de la console d'administration :
[`console-guide.md`](docs/licensing/console-guide.md).

## Développement

Le fichier livré reste **un seul HTML autonome**. Les sources du système de licences
vivent en modules dans `src/`, et un build les y injecte.

```bash
npm run build      # injecte le licensing dans index.html et console.html
npm test           # 223 tests, aucune dépendance
npm run check      # build + tests + audit des secrets
```

### Émettre une licence

```bash
node tools/license-generator/cli.mjs keygen          # une seule fois
node tools/license-generator/cli.mjs plans
node tools/license-generator/cli.mjs generate \
    --type public --plan plan_1000 --duration 30d \
    --device <empreinte du client> --holder "Nom"
node tools/license-generator/cli.mjs interactive     # émission guidée
```

> ⚠️ La clé privée vit dans `keys/` (ignoré par Git, permissions 600) et ne doit
> **jamais** quitter le poste d'administration. `node tools/audit-secrets.mjs` le
> vérifie, y compris dans l'historique Git.

### Console d'administration

`console.html` — interface technique réservée aux licences privées : inventaire,
activations, appareils, révocations, journal, diagnostics. Elle ne peut pas émettre
de licence : elle prépare la commande à exécuter sur le poste d'émission.

## Détails techniques

- **Un seul fichier** livré, aucune dépendance à installer côté joueur.
- Autorité côté **hôte** : il détient l’état de la partie, l’invité envoie des actions.
  Impossible de jouer hors de son tour ou de répondre deux fois.
- STUN Google + TURN de secours pour traverser les NAT.
- Illustrations **SVG** intégrées, effets Canvas, sons générés par WebAudio : zéro asset externe.
- Fonctionne aussi en ouvrant simplement le fichier en local (`file://`), licences comprises :
  la vérification Ed25519 est une implémentation pure JS, synchrone, sans WebCrypto.

## Héberger

Averi est un site **statique** : deux fichiers HTML autonomes, aucune base de
données, aucune fonction serveur.

### Vercel (recommandé)

```bash
npm run build:web     # reconstruit puis remplit public/
git add -A && git commit -m "Déploiement"
git push
```

Puis sur [vercel.com](https://vercel.com) : **Add New… → Project**, importez le
dépôt, **Deploy**. `vercel.json` fait le reste — Vercel reconstruit depuis les
sources à chaque déploiement, il est donc impossible de mettre en ligne un HTML
périmé.

Ou en une commande, sans passer par GitHub :

```bash
npx vercel --prod
```

| Fichier | Rôle |
|---|---|
| `vercel.json` | Commande de build, dossier publié, en-têtes de sécurité |
| `.vercelignore` | Empêche `keys/`, `tests/` et `docs/` de partir |
| `tools/dist.mjs` | Reconstruit, copie dans `public/`, audite les secrets |

**La console d'administration** (`console.html`) est déployée avec le site. Elle est
verrouillée par licence privée et exclue de l'indexation, mais son adresse reste
devinable. Pour ne pas la publier du tout, ajoutez dans Vercel la variable
d'environnement `AVERI_PUBLISH_CONSOLE=false` — vous continuerez à l'utiliser en
local via `python3 -m http.server 8000`.

### GitHub Pages

Activez Pages sur la branche `main` : `index.html` est servi tel quel. Pensez à
lancer `npm run build` **avant** de committer — GitHub Pages ne reconstruit rien.
