# Mytho

**Chacun raconte une vraie anecdote… sauf le Mytho, qui invente la sienne. Trouvez la fausse, puis devinez qui a écrit quoi.**

👉 **Jouer : https://mytho.onrender.com** (la première ouverture peut prendre jusqu'à une minute, le temps que le serveur gratuit se réveille)

Jeu d'ambiance multijoueur, à jouer entre amis autour d'une table ou en vocal (Discord, visio), chacun avec son téléphone, sans compte ni installation. Une création maison d'Akhis Games.

## Règles en bref

- De 4 à 10 joueurs. À chaque manche, quelqu'un choisit la **question** parmi trois (« Ta pire honte au restaurant », « Un cadeau complètement raté »…). Ce rôle tourne autour de la table.
- L'appli tire alors au sort, en secret, le **Mytho** de la manche. On touche la serviette pliée pour découvrir son rôle, à l'abri des regards.
- Tout le monde écrit une **vraie anecdote** sur la question, en une ou deux phrases (220 signes au plus). Le Mytho **invente** la sienne, aussi crédible que possible.
- Les histoires sont mélangées et posées **sans nom**, sur des serviettes marquées A, B, C… Chacune est lue à voix haute par quelqu'un de la table, tiré au sort.
- On débat, on pose des questions, on a le droit de bluffer. Puis chacun touche la serviette qu'il croit **fausse** (jamais la sienne).
- La fausse est démasquée au marqueur rouge et les votes apparaissent. Chacun place alors un **nom sur chaque autre serviette** : qui a écrit quoi, et qui est le Mytho.
- Les auteurs signent leur serviette, le Mytho en dernier, et les points tombent. Après la dernière manche, l'addition : le plus de points l'emporte.

Les points :

- **+2** pour avoir trouvé la fausse histoire ;
- **+1** au Mytho par voix trompée ;
- **+1** à l'auteur d'une histoire vraie par voix qui l'accuse à tort (une histoire vraie qui sème le doute paie aussi) ;
- **+1** par auteur bien deviné, y compris le Mytho sur la fausse.

Quelques choix de ce jeu :

- **Le Mytho vote aussi** : sa voix tombe forcément sur une histoire vraie et rapporte un point à son auteur. Il devine ensuite les auteurs comme tout le monde. Les points ne descendent jamais.
- **Le tirage du Mytho est pondéré** : on peut l'être deux fois de suite, mais plus on l'a été, plus c'est rare.
- **Trois autres questions** : celui qui choisit peut demander un nouveau tirage, trois fois par manche.
- **Un nom posé sur une autre serviette quitte la première** : chaque nom ne sert qu'une fois, et on peut verrouiller puis rouvrir ses réponses tant que tout le monde n'a pas validé.
- **Un brouillon compte** : si le temps d'écriture finit, un texte d'au moins 10 signes est posé tel quel. Si le Mytho n'a rien écrit, ou s'il reste moins de 3 histoires, la manche ne compte pas.
- **Rien ne trahit le Mytho à une vraie table** : même carte de rôle, même son et même vibration pour tout le monde, mêmes conseils à l'écran.
- **Un mode écrit** pour jouer sans micro : les histoires s'affichent à l'écran et le débat se fait dans un fil de discussion.
- **Temps réglables** : écriture en 2, 3 ou 5 minutes ou sans limite, débat en 1, 2 ou 3 minutes ou jusqu'au dernier vote ; 3, 5 ou 7 manches.
- **Questions douces ou piquantes** : les piquantes ajoutent les soirées, les rencards et les bêtises.

Plus de 200 questions, dont plus de 50 piquantes, chacune avec quelques pistes pour lancer les souvenirs.

## Pas de bots

Mytho se joue avec de vraies histoires de vrais joueurs : un bot ne serait pas crédible. Il faut au moins 4 personnes. Pour apprendre, une manche d'essai guidée de 3 minutes fait jouer une manche en racontant du vrai, puis une comme Mytho, avec Léo, Inès et Sam.

## Fonctionnalités

- Tables privées avec code à 4 lettres, lien d'invitation, partage natif et QR code
- Manche d'essai et conseils pour débutants à chaque étape (désactivables)
- Le rôle caché sous une serviette pliée, à déplier en cachant son écran
- Lecture à voix haute guidée (qui lit, quelle serviette), vote d'un geste, « Qui a écrit quoi ? » avec un nom par serviette
- Dévoilement : cercle au marqueur rouge sur la fausse, signatures au stylo bille, détail des points de la manche
- L'addition finale en ticket de caisse, distinctions (nez fin, baratin d'or, trop beau pour être vrai, physionomiste), les histoires de la soirée, victoires, revanche en un clic
- Réactions, règles consultables en jeu, l'hôte peut presser une étape ou arrêter la partie
- Reprise automatique après une coupure, spectateurs
- Sons synthétisés et vibrations, animations réduites si le système le demande

## Développement

```bash
npm install
npm run dev:server   # serveur temps réel sur http://localhost:3330
npm run dev:client   # interface sur http://localhost:5212
npm test             # questions, tirages, points, manches complètes
npm run build && npm run e2e   # parties complètes avec de vrais clients connectés
```

`MY_FAST=1` raccourcit le choix de la question, la lecture et les minuteries (tests locaux uniquement).

## Architecture

- `shared/` : contrat client/serveur (`protocol.ts`), questions (`content.ts`), tirages et points (`rules.ts`)
- `server/` : Express + Socket.IO, moteur de manche (`game.ts`), table, réglages et minuteries (`room.ts`). Le serveur fait autorité : chacun ne reçoit que son rôle, les histoires restent anonymes jusqu'au dévoilement, et les brouillons, votes et noms posés ne sont envoyés qu'à leur auteur
- `client/` : React + Vite + Framer Motion. La table est dans `screens/Table.tsx`, l'addition dans `screens/Final.tsx`, la manche d'essai dans `components/Tutorial.tsx`, les serviettes, l'ardoise et le marqueur dans `components/Ui.tsx`
- Déploiement : un seul service Node (`npm ci && npm run build`, puis `npm start`)
