// Corpus unique des textes officiels (PDF de public/carte/référentiels, indexés par
// npm run index-corpus dans public/carte/data) : carte, assistant et génération.
// Unité de recherche : le bloc (~1 200 caractères d'une page). Recherche en deux temps :
// mots-clés (TF-IDF) pour 20 candidats, puis reranker d'Albert pour garder les plus pertinents.
// Banc d'essai du 7 octobre 2026 (12 compétences CP–CM2, Albert juge) : mots-clés seuls 1,22/2,
// + reranker 1,47/2 ; vecteurs bge-m3 seuls 1,06, hybride + reranker 1,42 → pas de vecteurs.
import { readFileSync } from "fs";
import { join } from "path";
import { callAlbertRerank } from "./ai-provider";

export type DocCorpus = { id: string; titre: string; chemin: string; cat: string };
export type Passage = { id: string; titre: string; chemin: string; cat: string; page: number; texte: string };

export const CATEGORIES = {
  guides: "Guides",
  programmes: "Programmes",
  attendus: "Attendus de fin d'année",
  fiches: "Fiches thématiques",
  reperes: "Repères"
} as const;

const DATA = join(process.cwd(), "public", "carte", "data");
const STOP = new Set(
  "le la les un une des du de d l et ou en au aux a que qui quoi quel quelle quels quelles dans pour par sur est sont ce cet cette ces il elle ils on nous vous je tu se sa son ses leur leurs ne pas plus comment pourquoi quand faire".split(" ")
);

// « Cycle 2 » → « cycle2 » : les chiffres seuls sont ignorés, le numéro de cycle ne l'est pas.
export const mots = (t: string) =>
  (t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/cycle\s*(\d)/g, "cycle$1").match(/[a-z0-9]{2,}/g) || []).filter(
    (m) => !STOP.has(m)
  );

// ~1 200 caractères coupés en fin de ligne : un passage = une idée, citable à sa page.
function decouper(page: string): string[] {
  const blocs: string[] = [];
  let courant = "";
  for (const ligne of page.split("\n")) {
    courant += ligne + "\n";
    if (courant.length >= 1200) {
      blocs.push(courant);
      courant = "";
    }
  }
  if (courant.trim()) {
    if (blocs.length && courant.length < 300) blocs[blocs.length - 1] += courant;
    else blocs.push(courant);
  }
  return blocs.map((b) => b.replace(/\s+/g, " ").trim()).filter((b) => b.length > 30);
}

type Bloc = { doc: string; page: number; texte: string };
type Corpus = {
  docs: Record<string, DocCorpus>;
  blocs: Bloc[];
  inverse: Map<string, [bloc: number, occurrences: number][]>;
};
let corpus: Corpus | null = null;

// Index construit au premier appel (~6 000 blocs, moins d'une seconde), gardé en mémoire.
function charger(): Corpus {
  if (corpus) return corpus;
  const docs = JSON.parse(readFileSync(join(DATA, "index.json"), "utf8")) as Record<string, DocCorpus>;
  const blocs: Bloc[] = [];
  const inverse: Corpus["inverse"] = new Map();
  for (const d of Object.values(docs)) {
    const pages = JSON.parse(readFileSync(join(DATA, "texts", d.id + ".json"), "utf8")) as string[];
    const motsTitre = mots(d.titre); // le titre compte pour chaque bloc : « CE1 », « mathématiques »…
    pages.forEach((page, n) => {
      for (const texte of decouper(page)) {
        const i = blocs.push({ doc: d.id, page: n + 1, texte }) - 1;
        const tf = new Map<string, number>();
        for (const m of [...mots(texte), ...motsTitre]) tf.set(m, (tf.get(m) ?? 0) + 1);
        for (const [m, c] of tf) {
          let l = inverse.get(m);
          if (!l) inverse.set(m, (l = []));
          l.push([i, c]);
        }
      }
    });
  }
  return (corpus = { docs, blocs, inverse });
}

function classerParMots(c: Corpus, question: string, garde: (i: number) => boolean): number[] {
  const scores = new Map<number, number>();
  for (const w of new Set(mots(question))) {
    const l = c.inverse.get(w);
    if (!l) continue;
    const idf = Math.log(1 + c.blocs.length / l.length);
    for (const [i, tf] of l) if (garde(i)) scores.set(i, (scores.get(i) ?? 0) + (1 + Math.log(tf)) * idf);
  }
  return [...scores].sort((a, b) => b[1] - a[1]).map(([i]) => i);
}

export async function rechercher(
  question: string,
  { filtre, k = 6 }: { filtre?: (d: DocCorpus) => boolean; k?: number } = {}
): Promise<Passage[]> {
  const c = charger();
  const garde = (i: number) => !filtre || filtre(c.docs[c.blocs[i].doc]);
  const candidats = classerParMots(c, question, garde).slice(0, 20);

  // Reranker : relit chaque candidat (titre + texte) face à la question. Injoignable → ordre des mots-clés.
  const scores = await callAlbertRerank(
    question,
    candidats.map((i) => `${c.docs[c.blocs[i].doc].titre}\n${c.blocs[i].texte}`)
  ).catch(() => null);
  const ordre = scores
    ? candidats.map((i, j) => [i, scores[j]]).sort((a, b) => b[1] - a[1]).map(([i]) => i)
    : candidats;

  return ordre.slice(0, k).map((i) => {
    const b = c.blocs[i];
    const { id, titre, chemin, cat } = c.docs[b.doc];
    return { id, titre, chemin, cat, page: b.page, texte: b.texte };
  });
}

export const citer = (p: Passage, max: number) => `[${p.titre}, p. ${p.page}]\n${p.texte.slice(0, max)}`;

export const lienPdf = (p: { chemin: string; page: number }) =>
  "/carte/" + p.chemin.split("/").map(encodeURIComponent).join("/") + "#page=" + p.page;
