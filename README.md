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

## Détails techniques

- **Un seul fichier**, aucune dépendance à installer, aucun build.
- Autorité côté **hôte** : il détient l’état de la partie, l’invité envoie des actions.
  Impossible de jouer hors de son tour ou de répondre deux fois.
- STUN Google + TURN de secours pour traverser les NAT.
- Illustrations **SVG** intégrées, effets Canvas, sons générés par WebAudio : zéro asset externe.
- Fonctionne aussi en ouvrant simplement le fichier en local (`file://`).

## Héberger

Activez GitHub Pages sur la branche `main` : la page est servie telle quelle.
