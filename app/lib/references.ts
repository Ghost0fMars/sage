// Contexte officiel injecté dans les prompts de génération, tiré du corpus unique (corpus.ts).
import { CATEGORIES, citer, mots, rechercher, type DocCorpus } from "./corpus";

export type ReferenceMode = "objective" | "sequence" | "lesson";

// Par mode : quelles familles de textes, combien de pages, sous quelle balise.
const SOURCES: Record<ReferenceMode, { cat: string; balise: string; n: number }[]> = {
  objective: [
    { cat: CATEGORIES.attendus, balise: "attendus_officiels", n: 2 },
    { cat: CATEGORIES.programmes, balise: "programmes_officiels", n: 1 }
  ],
  sequence: [
    { cat: CATEGORIES.attendus, balise: "attendus_officiels", n: 2 },
    { cat: CATEGORIES.programmes, balise: "programmes_officiels", n: 1 },
    { cat: CATEGORIES.guides, balise: "ressources_pedagogiques_officielles", n: 2 }
  ],
  lesson: [
    { cat: CATEGORIES.attendus, balise: "attendus_officiels", n: 1 },
    { cat: CATEGORIES.guides, balise: "ressources_pedagogiques_officielles", n: 2 },
    { cat: CATEGORIES.fiches, balise: "exemples_activites_pedagogiques", n: 2 }
  ]
};

const NIVEAUX = ["ps", "ms", "gs", "cp", "ce1", "ce2", "cm1", "cm2", "sixieme", "6eme", "5eme", "4eme", "3eme"];

// Écarte les textes dont le titre vise un autre cycle ou un autre niveau (« attendus de fin de CM1 » pour du CE1).
export function memeClasse(d: DocCorpus, cycle: string, niveau: string): boolean {
  const titre = mots(d.titre);
  const cycles = titre.filter((m) => /^cycle\d$/.test(m));
  const voulu = mots(cycle).find((m) => /^cycle\d$/.test(m));
  if (voulu && cycles.length && !cycles.includes(voulu)) return false;
  const niveaux = titre.filter((m) => NIVEAUX.includes(m));
  const n = mots(niveau).filter((m) => NIVEAUX.includes(m));
  return !n.length || !niveaux.length || niveaux.some((m) => n.includes(m));
}

export async function buildReferencesContext(
  cycle: string,
  niveau: string,
  domaine: string,
  mode: ReferenceMode,
  competence = ""
): Promise<string> {
  const question = `${competence} ${domaine}`; // le niveau et le cycle filtrent (memeClasse), ils ne classent pas
  let sections: string[];
  try {
    const resultats = await Promise.all(
      SOURCES[mode].map(async ({ cat, balise, n }) => {
        const passages = await rechercher(question, { filtre: (d) => d.cat === cat && memeClasse(d, cycle, niveau), k: n });
        return passages.length ? `<${balise}>\n${passages.map((p) => citer(p, 1200)).join("\n\n")}\n</${balise}>` : "";
      })
    );
    sections = resultats.filter(Boolean);
  } catch {
    return ""; // corpus absent (non indexé) : génération sans base de connaissance
  }

  if (sections.length === 0) return "";

  return (
    `\n<base_de_connaissance>\n` +
    `Extraits des textes officiels pour ${domaine} — ${niveau}, avec leur source [Titre, p. N]. ` +
    `Appuie-toi sur eux pour ancrer ta réponse dans les attendus réels.\n\n` +
    sections.join("\n\n") +
    `\n</base_de_connaissance>`
  );
}
