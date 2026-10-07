import { NextResponse } from "next/server";
import { lireObjetJsonIa } from "../../lib/ai-json";
import { consigneMultiNiveaux } from "../../lib/multi-niveaux";
import { callAlbert } from "../../lib/ai-provider";
import { buildReferencesContext } from "../../lib/references";

type PhaseSeanceDetaillee = {
  nom: string;
  duree_minutes: number;
  disposition_classe: string;
  role_enseignant: string;
  consigne: string;
  role_eleves: string;
  hors_champ: string | null;
  erreurs_anticipees: string[];
  relances: string[];
  materiel: string;
};

type SeanceDetaillee = {
  titre: string;
  objectif: string;
  niveau: string;
  duree_minutes: number;
  materiel: string[];
  phases: PhaseSeanceDetaillee[];
  trace_ecrite: string;
  vigilance: string;
};

type FicheActivite = {
  titre: string;
  niveau: string;
  objectif: string;
  consigne: string;
  support: string;
  activites: {
    titre: string;
    consigne: string;
    format_reponse: string;
    aides: string[];
  }[];
  differenciation: {
    soutien: string;
    approfondissement: string;
  };
  correction: string[];
};

type GenerateStudentActivityRequest = {
  niveauxClasse?: string[];
  cycle?: string;
  niveau?: string;
  domaine?: string;
  sousDomaine?: string;
  item?: string;
  competence?: string;
  sequenceTitle?: string;
  seanceNumero?: number;
  lesson?: SeanceDetaillee;
};

function ficheValide(fiche: FicheActivite) {
  return (
    typeof fiche.titre === "string" &&
    typeof fiche.consigne === "string" &&
    Array.isArray(fiche.activites) &&
    fiche.activites.length > 0
  );
}

const SYSTEM_PROMPT = `<role>
Tu es SAGE, un assistant pédagogique expert en conception de documents élèves.
Tu transformes une fiche de séance enseignant en fiche d'activité élève prête à distribuer.
</role>

<principes>
- La fiche est directement utilisable par des élèves du niveau indiqué.
- Elle sert de document d'appui à la séance : support, consigne, tâches, espace mental de réponse.
- Elle ne révèle pas toute l'institutionnalisation si la séance prévoit une découverte.
- Les consignes sont courtes, actionnables, et formulées pour les élèves.
- Le contenu respecte l'objectif, le niveau et les gestes prévus dans la fiche séance.
</principes>

<format_sortie>
Retourne UNIQUEMENT un JSON valide, sans Markdown :
{
  "titre": "string",
  "niveau": "string",
  "objectif": "string",
  "consigne": "string",
  "support": "string — texte, situation, données, corpus ou problème donné aux élèves",
  "activites": [
    {
      "titre": "string",
      "consigne": "string",
      "format_reponse": "string — lignes, tableau, schéma, phrase réponse, calculs...",
      "aides": ["string"]
    }
  ],
  "differenciation": {
    "soutien": "string",
    "approfondissement": "string"
  },
  "correction": ["string — repères pour l'enseignant, pas à afficher aux élèves si imprimé"]
}
</format_sortie>`;

function buildPrompt(contexte: GenerateStudentActivityRequest) {
  const lesson = contexte.lesson!;
  const phases = lesson.phases
    .map(
      (phase, index) => `${index + 1}. ${phase.nom}
Consigne : ${phase.consigne}
Activité élèves : ${phase.role_eleves}
Hors-champ : ${phase.hors_champ ?? ""}`
    )
    .join("\n\n");

  return `Crée une fiche d'activité élève liée à cette fiche séance.

Contexte :
- Cycle : ${contexte.cycle}
- Niveau : ${contexte.niveau || lesson.niveau}
- Domaine : ${contexte.domaine}
- Sous-domaine : ${contexte.sousDomaine}
- Item : ${contexte.item}
- Compétence : ${contexte.competence}
- Séquence : ${contexte.sequenceTitle ?? ""}
- Séance : ${contexte.seanceNumero ?? ""}

Fiche séance :
- Titre : ${lesson.titre}
- Objectif : ${lesson.objectif}
- Durée : ${lesson.duree_minutes} min
- Matériel : ${lesson.materiel.join(", ")}
- Trace écrite prévue : ${lesson.trace_ecrite}
- Vigilance : ${lesson.vigilance}

Phases :
${phases}`;
}

export async function POST(request: Request) {
  const body = (await request.json()) as GenerateStudentActivityRequest;
  const contexte = body;

  if (!contexte.niveau || !contexte.domaine || !contexte.lesson?.titre) {
    return NextResponse.json(
      { error: "Le niveau, le domaine et la fiche séance sont obligatoires." },
      { status: 400 }
    );
  }

  const referencesContext = await buildReferencesContext(
    contexte.cycle ?? "",
    contexte.niveau,
    contexte.domaine,
    "lesson",
    contexte.competence
  );
  const systemPrompt = SYSTEM_PROMPT + referencesContext;
  const prompt = buildPrompt(contexte) + consigneMultiNiveaux(body.niveauxClasse);

  function parseFiche(texte: string) {
    const fiche = lireObjetJsonIa<FicheActivite>(texte);
    if (!ficheValide(fiche)) {
      throw new Error("La fiche élève générée est incomplète.");
    }
    return fiche;
  }

  let texte: string;
  try {
    texte = await callAlbert(systemPrompt, prompt, 2200);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur lors de l'appel à l'IA." },
      { status: 500 }
    );
  }

  try {
    return NextResponse.json({ activity: parseFiche(texte) });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Impossible de lire la fiche élève générée.",
        details: texte
      },
      { status: 502 }
    );
  }
}
