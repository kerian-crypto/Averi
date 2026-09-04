# Mode démonstration — 1 heure

## Règle

`DEMO_DURATION = 1 heure` (`config.js`, `DEMO_DURATION_MS = 3 600 000`).
Toutes les features sont ouvertes pendant l'essai — l'utilisateur doit voir ce
qu'il achète.

Avertissement sous **10 minutes** restantes (`DEMO_WARNING_MS`).

## Ce qui est enregistré

À la première activation :

```js
{
  version: 1,
  installId,          // identifiant de l'installation
  startedAtWall,      // Date.now() au démarrage
  consumedMs,         // temps monotone réellement passé dans l'application
  highWaterWall,      // plus grande valeur d'horloge jamais observée
  lastSeenWall,
  lastSessionMono,
  anomalies: [],
  exhausted: false
}
```

Scellé par HMAC, écrit dans **tous** les dépôts, miroité dans IndexedDB.

## Le calcul du temps restant

C'est le cœur du dispositif anti-réinitialisation. Le temps consommé n'est **pas**
`maintenant − départ`. C'est le **maximum de deux mesures indépendantes** :

```
A = highWaterWall − startedAtWall     (le sommet d'horloge ne redescend jamais)
B = consumedMs                        (temps monotone cumulé, performance.now)

écoulé  = max(A, B)
restant = max(0, 3 600 000 − écoulé)
```

| Manipulation | Effet sur A | Effet sur B | Résultat |
|---|---|---|---|
| Reculer l'horloge | aucun (sommet conservé) | aucun | **aucun temps rendu** |
| Reculer très loin (2020) | aucun | aucun | **aucun temps rendu** |
| Figer l'horloge | aucun | continue d'avancer | **la démo s'écoule** |
| Avancer l'horloge | consomme plus vite | — | expire, au détriment du tricheur |
| Fermer et rouvrir | conservé | reprend au cumul | **temps conservé** |

Chaque ligne correspond à un test dans `tests/demo.test.mjs`.

## Détections

`ClockGuard.observe()` qualifie chaque écart :

- **recul** — `wall < highWater − 5 min` → anomalie `clock_backwards`, `clockTampered`
  passe à vrai, visible dans la console privée ;
- **saut avant** — écart entre l'avancée de l'horloge et l'avancée monotone
  supérieur à 6 h *au sein d'une même session* → anomalie `clock_forward_jump`.
  Toléré : c'est le plus souvent un changement de fuseau, et cela ne profite pas à
  l'utilisateur.

`performance.now()` repart de zéro à chaque chargement : la comparaison
inter-session ne repose donc que sur l'horloge murale, bornée par le sommet observé.

## Le jeton d'essai

Une **seconde trace, indépendante de l'état de démonstration**, écrite sous la clé
`averi.lic.v1.trial` :

```js
{
  version: 1,
  installId,        // installation d'origine
  fingerprint,
  nonce,            // 12 octets aléatoires
  issuedAt,         // date de démarrage de l'essai
  durationMs
}
```

Trois propriétés le distinguent de l'état de démonstration :

1. **Consulté avant toute validation d'essai.** `start()` passe par `_load()`, qui
   interroge l'état *puis* le jeton. Supprimer `averi.lic.v1.demo` ne suffit donc
   plus : sans le jeton, aucun essai n'est accordé.
2. **Écrit une seule fois**, à la première activation, jamais réécrit ensuite — un
   jeton réémis à chaque session pourrait être rajeuni.
3. **Scellé avec la clé d'amorçage**, pas avec la clé dérivée de l'installation.
   C'est délibéré : effacer l'identité pour s'en fabriquer une neuve ne doit pas
   rendre le jeton illisible, sinon le contournement le plus évident redeviendrait
   efficace. Le jeton reste lisible et son `installId` trahit l'essai précédent.

### Reconstruction

Quand l'état a disparu mais que le jeton subsiste, l'état est **reconstruit à partir
de lui** : `startedAtWall = issuedAt`. Le temps écoulé est donc recalculé
honnêtement — effacer son stockage cinq minutes après le début ne consomme pas
l'heure entière, mais ne la rend pas non plus. Une anomalie
`state_restored_from_trial` est consignée.

Le jeton est traité comme **essai consommé, sans temps restant** s'il est descellé
(`trial_token_tampered`), s'il porte un autre `installId` (`install_mismatch`), ou
s'il a été émis « dans le futur », signe d'une horloge reculée (`clock_backwards`).

### Réconciliation après hydratation

`hydrate()` — la restauration depuis le miroir IndexedDB — est asynchrone. Entre le
démarrage de l'application et sa fin, un utilisateur rapide pourrait lancer un essai
avant que le jeton d'un essai antérieur ne reparaisse. `DemoEngine.reconcile()`,
appelé à la fin de `init()`, fait alors primer la date du jeton restauré
(`trial_reconciled`).

## Résistance à l'effacement

Cinq couches, décrites en détail dans [`security.md`](security.md) :

1. **Redondance** — écriture dans localStorage *et* cookie ; effacer l'un ne suffit
   pas, le survivant est réinstallé partout à la lecture suivante.
2. **Miroir IndexedDB** — relu au démarrage (`hydrate()`), restaure les dépôts
   synchrones vidés. Vider les cookies d'un navigateur ne touche pas IndexedDB.
3. **Jeton d'essai** — trace séparée, sous une autre clé, consultée avant toute
   validation d'essai.
4. **Scellement** — un enregistrement édité à la main est descellé, donc traité
   comme une démonstration **consommée**.
5. **Cohérence d'installation** — une démo portant un autre `installId` est traitée
   comme consommée.

Un état corrompu ou illisible mène à `DEMO_EXPIRED`, jamais à `DEMO_AVAILABLE` : en
cas de doute, le système ne rend pas de temps.

## Limite assumée

Un utilisateur qui contrôle sa machine — navigation privée, profil neuf, autre
navigateur, autre appareil — **peut relancer une démonstration**. C'est irréductible
sans serveur, et le prétendre autrement serait malhonnête.

Concrètement, il lui faut désormais effacer **simultanément** l'état de
démonstration *et* le jeton d'essai, dans **chacun** des dépôts (localStorage,
cookies, IndexedDB). Effacer l'un puis recharger ne suffit pas : le survivant
réinstalle l'autre. C'est un cran au-dessus du « vider le localStorage » qui
suffisait auparavant, et cela reste très loin d'être infranchissable.

L'objectif tenu est d'empêcher les contournements **triviaux** : vider une clé,
reculer l'horloge, éditer un champ, recréer l'identité.

## Réinitialisation légitime

Un seul chemin : `LicenseFacade.resetDemo()`, qui exige une licence **privée** avec
la permission `testing`. `DemoEngine.reset()` exige en plus un jeton d'autorisation
non exporté, si bien qu'un `facade.demo.reset()` lancé depuis la console du
navigateur lève une exception.

## Persistance

Le temps consommé est écrit au plus toutes les 15 secondes (`HEARTBEAT_MS`), et de
force :

- avant `beforeunload` ;
- quand l'onglet passe en arrière-plan (`visibilitychange`) ;
- à chaque appel de `flush()`.

`flush()` **réévalue avant d'écrire** : sans cela, une session ouverte puis fermée
sans aucun rafraîchissement ne consommerait rien. Ce défaut a été trouvé par les
tests avant d'atteindre le produit.
