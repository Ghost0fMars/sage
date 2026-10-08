# SAGE

**Système d'Assistance et de Gestion Éducative**

Application d'aide à la préparation pédagogique pour les enseignants : du référentiel de compétences jusqu'à la séance prête à imprimer, avec génération assistée par IA, planning, bibliothèque persistante et suivi des élèves.

Développée avec Next.js, TypeScript et Tailwind CSS.

> 🧪 **Bêta ouverte.** SAGE est en cours de développement et partagé pour test. Des aspérités sont attendues — c'est le but. Tous les retours sont bienvenus.

---

## ⚠️ Données personnelles & RGPD — à lire avant de l'utiliser

**En application de bureau (recommandé, voir ci-dessous)**, SAGE fonctionne en local : les données des élèves restent sur la machine de l'enseignant (navigateur/stockage local de l'app), sans compte ni service cloud. Seul le texte envoyé à l'assistant IA transite par **Albert API** (DINUM/Etalab), hébergée par l'État français (SecNumCloud).

**En version web** (`npm run dev`/déploiement navigateur), les données restent de même dans le navigateur de l'enseignant (stockage local), sans compte. **Pendant la bêta, n'entrez pas de données réelles permettant d'identifier des élèves** (noms, prénoms, évaluations nominatives). Utilisez des données de test ou anonymisées (« Élève 1 », « Élève 2 »…).

Dans tous les modes : ne collez jamais de données personnelles non anonymisées dans l'assistant IA sans nécessité, la souveraineté de l'hébergement ne dispense pas de la minimisation des données.

---

## Fonctionnalités

- Chargement des données depuis `Référentiel_de_compétences.json`.
- Sélection en cascade : Cycle → Niveau → Domaine → Sous-domaine → Item → Compétence.
- Génération d'un **objectif pédagogique** à partir de la compétence choisie (IA).
- Génération d'une **progression de séquence** à partir des choix et de l'objectif (IA).
- Préparation d'une **séance détaillée** à partir d'une séance de la progression (IA).
- Export de la séance préparée en **PDF** (via l'impression du navigateur).
- Envoi d'une séance dans la **réserve du planning** (lundi → vendredi, 8h–17h).
- **Bibliothèque persistante** des séances préparées, organisée par cycle / niveau / domaine / sous-domaine / séquence.
- **Gestion des élèves** dans un tableau éditable.
- **Suivi des progrès** : évaluations et niveaux d'acquisition.
- **Cahier journal** avec affichage des évènements Google Agenda.
- Sauvegarde des données **par utilisateur local**.

---

## Stack technique

- **Next.js** (App Router) — framework React
- **TypeScript**
- **Tailwind CSS**
- **Albert API** (DINUM / Etalab) — génération de contenu pédagogique, IA souveraine hébergée par l'État
- **Electron** — empaquetage application de bureau (en cours)

---

## Prérequis

- **Node.js** 18 ou supérieur et **npm**
- Une **clé API Albert** (agents publics uniquement — voir [albert.api.etalab.gouv.fr](https://albert.api.etalab.gouv.fr)), saisie dans **Paramètres › Assistant IA**

---

## Installation

Clonez le dépôt, puis dans le dossier du projet :

```bash
npm install
```

---

## Configuration

Créez un fichier `.env.local` à la racine du projet. Ce fichier est ignoré par git (`.gitignore`) et ne doit **jamais** être commité.

Un modèle est fourni dans `.env.example`.

### Albert API

```env
ALBERT_API_KEY=votre_cle_api_albert
ALBERT_MODEL=mistral-small-3-2-24b-instruct-2506
```

Chaque enseignant saisit sa propre clé dans **Paramètres › Assistant IA**. Elle est stockée sur son appareil et transmise aux routes API (`app/api/.../route.ts`), qui la relaient à Albert. `ALBERT_API_KEY` n'est qu'une clé de repli facultative pour un déploiement maîtrisé.

---

## Démarrage

Lancez le serveur de développement :

```bash
npm run dev
```

Puis ouvrez [http://localhost:3000](http://localhost:3000).

---

## Application de bureau (Electron) — mode recommandé pour les enseignants

C'est le mode d'usage visé : un enseignant installe SAGE comme une application native, sans navigateur, sans compte à créer, sans connexion. Toutes les données (élèves, séances, planning...) restent sur sa machine ; seul le texte envoyé à l'assistant transite par Albert API.

### Télécharger

Les installateurs Windows (`.exe`) et Linux (AppImage) sont publiés dans les [Releases du projet sur la Forge](https://forge.apps.education.fr/elavallard/sage/-/releases). Au premier lancement, renseignez votre clé API Albert dans **Paramètres › Assistant IA**.

Les Releases sont construites par `.gitlab-ci.yml` à chaque tag `vX.Y.Z` (`git tag v0.1.0 && git push origin v0.1.0`). Ne définissez **pas** de variable CI `ALBERT_API_KEY` : elle serait embarquée dans l'installateur public.

### Construire l'installateur soi-même

1. Créer `.env.electron` à la racine (à partir de `.env.electron.example`) Laisser `ALBERT_API_KEY` vide pour une diffusion publique : chaque enseignant saisit sa clé dans l'app. Une clé renseignée ici est embarquée comme clé de repli, à réserver à une diffusion maîtrisée.
2. Les textes officiels (PDF dans `public/carte/référentiels/`) et leur index (`public/carte/data/`) sont versionnés : l'index alimente la Carte des guides, l'assistant et la génération. Après tout ajout ou modification de PDF, relancer `npm run index-corpus` (Python + `pip install pymupdf`).
3. Lancer la commande correspondant à la plateforme cible :

   ```bash
   npm run electron:dist:win     # Windows (.exe, NSIS)
   npm run electron:dist:mac     # macOS (.dmg)
   npm run electron:dist:linux   # Linux (AppImage)
   ```

   L'installateur est généré dans `dist-electron/`.

### Comment ça marche

- `scripts/electron-prepare.mjs` construit Next.js en mode `standalone`, puis copie `.env.electron` dans le dossier standalone (`albert.env`).
- Au lancement, `electron/main.js` démarre ce serveur Next.js en local (`127.0.0.1`, port interne) et ouvre une fenêtre native pointant dessus — `electron/server-runner.js` charge `albert.env` avant de démarrer le serveur.
- `npm run electron:dev` permet de tester ce comportement en développement (fenêtre Electron + `next dev`).

⚠️ Une clé Albert embarquée via `.env.electron` est extractible par quiconque décompile l'installateur. Ne jamais en embarquer une dans un build diffusé publiquement.

---

## Structure du projet

```
app/
  page.tsx                      Tableau de bord principal (vue globale de la classe)
  preparation/page.tsx          Préparation : filtres en cascade + appels IA
  planning/page.tsx             Planning hebdomadaire (lun→ven, 8h–17h)
  bibliotheque/page.tsx         Bibliothèque des séances préparées
  eleves/page.tsx               Tableau de suivi des élèves
  progression/page.tsx          Suivi des évaluations et niveaux d'acquisition
  parametres/page.tsx           Choix / création de l'utilisateur local actif
  api/generate-objective/       Route serveur — objectif pédagogique (Albert API)
  api/generate-sequence/        Route serveur — progression de séquence (Albert API)
  api/generate-lesson/          Route serveur — séance détaillée (Albert API)
  lib/user-storage.ts           Lecture / écriture locale par utilisateur
  layout.tsx                    Structure globale de l'application
  globals.css                   Styles globaux + Tailwind
  lib/corpus.ts                 Recherche dans les textes officiels (carte, assistant, génération)
public/carte/                   Carte des guides : page, PDF (référentiels/) et index (data/)
scripts/build_index.py          Indexation des PDF (npm run index-corpus)
electron/                       Empaquetage application de bureau
Référentiel_de_compétences.json Données du référentiel (issu de l'ancien Excel)
```

---

## Commandes utiles

```bash
npm run dev                   # serveur de développement (web)
npm run build                 # build de production (web)
npm run lint                  # vérification du code
npm run electron:dev          # app de bureau en développement
npm run electron:dist:win     # installateur Windows
npm run electron:dist:mac     # installateur macOS
npm run electron:dist:linux   # installateur Linux
```

---

## Feuille de route

- [x] **Build Electron** distribuable, sans dépendance à un service en ligne — voir [Application de bureau](#application-de-bureau-electron--mode-recommandé-pour-les-enseignants).
- [ ] **Passage en stockage structuré local** (SQLite via `better-sqlite3`) en remplacement du `localStorage` du navigateur embarqué — même philosophie (rien ne quitte la machine), mais plus robuste et interrogeable que le stockage clé-valeur actuel.

---

## Licence

Ce projet est distribué sous licence **GNU Affero General Public License v3.0 (AGPL-3.0)**. Voir le fichier [`LICENSE`](./LICENSE).

Copyright (C) 2026 Étienne — [àlaclé](https://alacle.org)

En résumé :

- Vous êtes libre d'utiliser, d'étudier, de modifier et de redistribuer SAGE.
- **Toute version modifiée et redistribuée doit elle-même rester ouverte sous AGPL-3.0** — y compris si elle est mise à disposition via un service en réseau (l'AGPL ferme le « trou SaaS » : héberger une version modifiée oblige à en publier le code source).
- Les mentions de copyright doivent être conservées et les modifications signalées.
- Le logiciel est fourni « tel quel », sans aucune garantie.

Ce choix de licence vise à garantir que SAGE **reste libre et ouvert pour toujours** : personne ne peut s'en saisir pour en faire une version fermée et propriétaire. Une version commerciale fermée de SAGE par un tiers est impossible sous cette licence.

> En tant que titulaire des droits, l'auteur conserve la liberté d'utiliser SAGE selon d'autres modalités. L'AGPL ne lie que les tiers.

---

## Auteur

Développé par Étienne dans le cadre de [àlaclé](https://alacle.org).

🌐 [alacle.org](https://alacle.org)
