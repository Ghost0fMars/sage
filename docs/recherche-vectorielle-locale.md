# Recherche vectorielle locale (RAG sans Supabase)

Notes pour reprendre plus tard le remplacement de Supabase/pgvector par un index
local pour la « documentation institutionnelle » de l'assistant.

État au 6 octobre 2026 : **rien n'est implémenté**, ce document décrit le plan.

---

## 1. Objectif

Aujourd'hui, l'assistant de chat enrichit ses réponses avec des extraits de
documents officiels retrouvés par similarité vectorielle **dans Supabase**.
Sans Supabase (app de bureau), cette recherche est silencieusement désactivée.

But : faire la même recherche **en local**, pour que Supabase devienne
entièrement optionnel.

## 2. Fonctionnement actuel

| Élément | Rôle |
|---|---|
| `scripts/index-documents.ts` (`npm run index-docs -- ./dossier`) | Lit des PDF, découpe en blocs de ~500 mots (chevauchement 60), calcule les vecteurs via Albert, insère dans Supabase |
| `scripts/index-json-references.ts` (`npm run index-refs`) | Même chose pour les JSON de `references/` : 1 entrée = 1 bloc (tronqué à 24 000 caractères) |
| `supabase/migration-rag.sql` + `migration-albert-embeddings.sql` | Tables `documents` / `document_chunks`, colonne `vector(1024)`, fonction `match_document_chunks` |
| `app/api/chat/route.ts` → `rechercherDocumentation()` | Vecteur de la question via `callAlbertEmbedding()`, puis RPC `match_document_chunks` (6 résultats, seuil 0,45) |
| `app/lib/ai-provider.ts` → `callAlbertEmbedding()` | Appel `POST /v1/embeddings` d'Albert, modèle `bge-m3` (1024 dimensions) |

Si `NEXT_PUBLIC_SUPABASE_URL` ou `SUPABASE_SERVICE_ROLE_KEY` manque,
`rechercherDocumentation()` renvoie `""` : l'assistant répond sans documentation.

> ⚠️ Les deux scripts mentionnent `tsconfig.scripts.json` dans leur en-tête,
> mais ce fichier n'existe pas. Utiliser les scripts npm (`tsx`).

## 3. Principe retenu

Ce que fait pgvector se remplace par :

1. **un fichier d'index** produit une fois par les scripts d'indexation ;
2. **une recherche par force brute** (similarité cosinus) dans la route du chat.

Pas besoin de base vectorielle (HNSW, sqlite-vec, LanceDB) à cette échelle :

| Blocs | Taille Float32 | Taille Float16 | Temps par question (Node) |
|---|---|---|---|
| 10 000 | ~40 Mo | ~20 Mo | ~10–20 ms |
| 50 000 | ~200 Mo | ~100 Mo | ~50–100 ms |

Une base vectorielle locale ne devient utile qu'au-delà de plusieurs centaines
de milliers de blocs.

Le **vecteur de la question** reste calculé par Albert (connexion requise, comme
pour la réponse elle-même). Faire tourner `bge-m3` en local (`transformers.js` /
ONNX) est possible mais ajoute ~500 Mo à l'app, sans intérêt tant que la réponse
vient d'Albert.

## 4. Format de l'index proposé

Dossier `rag-index/` à la racine (à ajouter au `.gitignore` si volumineux) :

- `rag-index/vecteurs.bin` : tous les vecteurs bout à bout, Float32 little-endian,
  **normalisés** (norme 1) à l'indexation, pour que la similarité cosinus se
  réduise à un produit scalaire.
- `rag-index/blocs.json` :
  ```json
  {
    "modele": "bge-m3",
    "dimensions": 1024,
    "blocs": [
      { "source": "Guide-orange-CP.pdf", "titre": "Guide orange CP", "index": 0, "texte": "…" }
    ]
  }
  ```
  L'ordre de `blocs` = l'ordre des vecteurs dans `vecteurs.bin`.

Garder `modele` et `dimensions` : si le modèle d'Albert change, l'index doit être
entièrement régénéré (deux espaces vectoriels différents ne sont pas comparables,
cf. `migration-albert-embeddings.sql`).

Option pour réduire la taille : Float16 (ou Int8 avec un facteur d'échelle), avec
une perte de précision négligeable pour du classement.

## 5. Étapes d'implémentation

### 5.1 Scripts d'indexation

Dans `scripts/index-documents.ts` et `scripts/index-json-references.ts` :

- garder découpage + `embedBatch()` tels quels ;
- remplacer les insertions Supabase par l'ajout dans l'index local
  (lire l'index existant, retirer les blocs de la même `source`, ajouter les
  nouveaux, réécrire les deux fichiers) ;
- normaliser chaque vecteur avant écriture ;
- n'exiger que `ALBERT_API_KEY` (plus de variables Supabase).

Mettre le code de lecture/écriture de l'index dans un petit module partagé
(ex. `app/lib/rag-local.ts`) utilisé par les scripts et par la route.

### 5.2 Recherche dans la route du chat

Dans `app/api/chat/route.ts`, `rechercherDocumentation()` :

1. chargement **paresseux** de l'index au premier appel, gardé en mémoire
   (variable de module) ;
2. vecteur de la question via `callAlbertEmbedding()`, puis normalisation ;
3. produit scalaire avec chaque vecteur, garder les 6 meilleurs au-dessus de
   **0,45** (mêmes valeurs que `match_document_chunks`) ;
4. renvoyer les textes joints par `\n\n---\n\n` (format actuel inchangé).

Choix de la source : index local s'il existe, sinon Supabase s'il est configuré,
sinon `""`. Ça permet une transition sans casser la version web.

Esquisse :

```ts
// produit scalaire = similarité cosinus (vecteurs normalisés)
function meilleursBlocs(question: Float32Array, index: Float32Array, dim: number, n = 6, seuil = 0.45) {
  const scores: { i: number; s: number }[] = [];
  for (let i = 0; i < index.length / dim; i++) {
    let s = 0;
    for (let d = 0; d < dim; d++) s += question[d] * index[i * dim + d];
    if (s > seuil) scores.push({ i, s });
  }
  return scores.sort((a, b) => b.s - a.s).slice(0, n);
}
```

### 5.3 Application de bureau (Electron)

- `next.config.mjs` active `output: 'standalone'` pour le build Electron. Un
  fichier lu avec `fs` via un chemin calculé **n'est pas copié automatiquement**
  dans `.next/standalone`.
- Dans `scripts/electron-prepare.mjs`, copier `rag-index/` dans le dossier
  standalone (comme c'est fait pour `albert.env`), et faire lire l'index depuis
  `process.cwd()` / un chemin passé par variable d'environnement dans
  `electron/server-runner.js`.
- Vérifier la taille finale de l'installeur.

### 5.4 Nettoyage (une fois validé)

- Retirer `rechercherDocumentation()` côté Supabase et `SUPABASE_SERVICE_ROLE_KEY`
  de `.env.example` si plus rien ne s'en sert.
- Mettre à jour le README (section RAG / prérequis Supabase).
- Les fichiers `supabase/migration-rag.sql` et `migration-albert-embeddings.sql`
  peuvent rester pour la version web, ou être supprimés si Supabase est abandonné.

## 6. Points d'attention (sécurité et droits)

1. **Le texte des documents est distribué avec l'app.** `blocs.json` contient le
   texte intégral des blocs : n'importe qui peut l'extraire du dossier
   d'installation. N'indexer que des documents **redistribuables** (programmes,
   BO, ressources Éduscol, en général sous Licence Ouverte). Pas de manuels
   d'éditeurs ni de documents internes.

2. **Clé Albert embarquée (problème déjà existant).**
   `scripts/electron-prepare.mjs` copie `.env.electron` en clair dans
   `resources/standalone/albert.env`. Toute personne qui installe l'app peut lire
   `ALBERT_API_KEY` et l'utiliser hors de Sage, sur le quota du propriétaire de la
   clé. La recherche vectorielle locale en dépend aussi (vecteur de la question).
   Pistes :
   - **clé par enseignant** saisie dans Paramètres et stockée seulement sur sa
     machine, plus aucune clé dans le build (le plus simple, reste 100 % local) ;
   - **serveur relais** qui garde la clé et contrôle l'accès (code
     d'établissement, comptes), mais l'app n'est alors plus entièrement locale.

   Dans tous les cas, **renouveler la clé** actuelle auprès d'Etalab au moment du
   changement, car elle doit être considérée comme exposée.

3. **Accès** : sans Supabase, rien ne limite qui utilise l'assistant ou la
   recherche documentaire. C'est voulu en local, mais une version web publique
   sans Supabase ouvrirait toutes les routes `/api/*` (et le quota Albert) à
   n'importe qui.

## 7. Vérifications avant de considérer la migration terminée

- [ ] Index régénéré à partir des PDF et des JSON de `references/` (rien à
      récupérer depuis Supabase).
- [ ] Même question posée avec l'ancienne recherche (Supabase) et la nouvelle :
      résultats proches (mêmes documents en tête).
- [ ] Temps de réponse de `rechercherDocumentation()` mesuré avec l'index complet.
- [ ] Build Electron : l'index est présent dans l'installeur et l'assistant cite
      bien la documentation, sans aucune variable Supabase.
- [ ] Choix fait pour la clé Albert (§ 6.2) et clé renouvelée.
- [ ] Liste des documents indexés vérifiée côté droits de diffusion (§ 6.1).
