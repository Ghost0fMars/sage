import { NextRequest, NextResponse } from "next/server";
import { callAlbert } from "../../lib/ai-provider";
import { lireObjetJsonIa } from "../../lib/ai-json";
import { consigneMultiNiveaux } from "../../lib/multi-niveaux";
import { buildReferencesContext } from "../../lib/references";

type GenerateSequenceRequest = {
  niveauxClasse?: string[];
  typeSequence?: "introduction" | "consolidation" | "evaluation" | "projet";
  cycle?: string;
  niveau?: string;
  domaine?: string;
  sousDomaine?: string;
  item?: string;
  competence?: string;
  objectif?: string;
};

type Beat = {
  amorce: string;
  recherche: string;
  mise_en_commun: string;
  institutionnalisation: string | null;
  entrainement: string;
};

type Seance = {
  numero: number;
  type: string;
  titre: string;
  est_seance_cloture: boolean;
  duree_minutes: number;
  beat: Beat;
  tension_ouverte: string | null;
  materiel: string[];
  differenciation: {
    soutien: string;
    approfondissement: string;
  };
};

type Sequence = {
  titre: string;
  intention: string;
  regime: string;
  seances: Seance[];
};

function sequenceValide(sequence: Sequence): boolean {
  if (typeof sequence.titre !== "string") return false;
  if (!Array.isArray(sequence.seances) || sequence.seances.length < 3) return false;
  const toutesValides = sequence.seances.every(
    (s) =>
      typeof s.numero === "number" &&
      typeof s.titre === "string" &&
      s.beat &&
      typeof s.beat.amorce === "string" &&
      typeof s.beat.recherche === "string"
  );
  const uneSeanceCloture = sequence.seances.some((s) => s.est_seance_cloture === true);
  return toutesValides && uneSeanceCloture;
}

function determineRegime(
  typeSequence: string
): "cyclique" | "ouvert" | "maximal" {
  if (typeSequence === "projet") return "maximal";
  if (typeSequence === "introduction") return "ouvert";
  return "cyclique";
}

function buildSystemPrompt(
  regime: "cyclique" | "ouvert" | "maximal",
  cycle?: string,
  niveau?: string,
  domaine?: string
): string {
  const regimeDescriptions = {
    cyclique: {
      justification: "séquence de consolidation ou d'entraînement",
      description:
        "Tension qui se résout complètement. La dernière séance ferme tous les fils ouverts."
    },
    ouvert: {
      justification: "séquence de découverte ou d'introduction",
      description:
        "Tension croissante sans résolution complète. La dernière séance ouvre vers la suite plutôt que de tout fermer."
    },
    maximal: {
      justification: "séquence longue avec production finale",
      description:
        "Amplitude extrême — montée en intensité — crise cognitive — réconciliation par la production finale."
    }
  };

  const cycleGuidance: Record<string, string> = {
    "Cycle 1":
      "Privilégier le jeu, le langage oral, la manipulation, les ateliers en petits groupes. Pas de trace écrite formelle avant la grande section.",
    "Cycle 2":
      "Privilégier la démarche de recherche, le travail en groupe, l'articulation oral/écrit. Progresser du concret vers le symbolique.",
    "Cycle 3":
      "Privilégier le problème ouvert, le débat interprétatif, l'autonomie croissante. Accepter la complexité et la nuance dans les réponses."
  };

  const rd = regimeDescriptions[regime];
  const cg =
    (cycle ? cycleGuidance[cycle] : null) ??
    "Adapter le niveau de difficulté et les modalités au cycle concerné.";

  const referencesContext =
    cycle && niveau && domaine
      ? buildReferencesContext(cycle, niveau, domaine, "sequence")
      : "";

  return `<role>
Tu es SAGE, un assistant pédagogique expert en ingénierie de formation.
Tu génères des progressions de séquences pédagogiques selon une logique de tension cognitive.
</role>

<principes_dramaturgiques>
Chaque séquence suit une logique TENSION → RÉSOLUTION, pas une progression linéaire.
Chaque séance est un BEAT : une unité de changement de valeur cognitive.

Structure de chaque BEAT :
1. AMORCE — question ou énigme. Ne pas donner la réponse. Créer le manque cognitif.
2. RECHERCHE — activité principale où les élèves affrontent l'obstacle.
3. MISE EN COMMUN — confrontation des réponses. Maintenir une incertitude si ce n'est pas la séance de clôture.
4. INSTITUTIONNALISATION — le savoir prend sens. Uniquement quand est_seance_cloture est true. Null sinon.
5. ENTRAÎNEMENT — ancrage par la pratique.
</principes_dramaturgiques>

<regime_applique>
Régime : ${regime.toUpperCase()} (${rd.justification})
${rd.description}
</regime_applique>

<conformite_cycle>
${cg}
</conformite_cycle>

<exemple_beat>
Séance de découverte CE2, Mathématiques, décomposition de nombres :
{
  "numero": 1, "type": "découverte", "titre": "Combien de façons d'écrire 247 ?",
  "est_seance_cloture": false, "duree_minutes": 55,
  "beat": {
    "amorce": "Écrivez 247 d'une autre façon. Pas 247. Une autre.",
    "recherche": "Groupes : trouver le maximum de décompositions différentes avec cubes MAB",
    "mise_en_commun": "Affichage collectif. Débat : 200+40+7 et 247 c'est le même nombre ?",
    "institutionnalisation": null,
    "entrainement": "Chacun note 3 décompositions du nombre 315"
  },
  "tension_ouverte": "Y a-t-il une décomposition canonique ? Peut-on en trouver une infinité ?",
  "materiel": ["cubes, barres, plaques MAB", "ardoises"],
  "differenciation": { "soutien": "Décomposer 47 seulement", "approfondissement": "Trouver toutes les décompositions à exactement 3 termes" }
}
</exemple_beat>

<format_sortie>
Retourne UNIQUEMENT un JSON valide, sans Markdown :
{
  "titre": "string — titre évocateur, pas générique",
  "intention": "string — logique de progression en une phrase",
  "regime": "${regime}",
  "seances": [
    {
      "numero": number,
      "type": "découverte | entraînement | évaluation | bilan | projet",
      "titre": "string — titre évocateur",
      "est_seance_cloture": boolean,
      "duree_minutes": number,
      "beat": {
        "amorce": "string",
        "recherche": "string",
        "mise_en_commun": "string",
        "institutionnalisation": "string ou null selon est_seance_cloture",
        "entrainement": "string"
      },
      "tension_ouverte": "string ou null selon est_seance_cloture",
      "materiel": ["string"],
      "differenciation": { "soutien": "string", "approfondissement": "string" }
    }
  ]
}
</format_sortie>${referencesContext}`;
}

function buildPrompt(contexte: GenerateSequenceRequest, regime: string) {
  return `Crée une progression de séquence pédagogique (régime ${regime}) :
- Cycle : ${contexte.cycle}
- Niveau : ${contexte.niveau}
- Domaine : ${contexte.domaine}
- Sous-domaine : ${contexte.sousDomaine}
- Item : ${contexte.item}
- Compétence : ${contexte.competence}
- Objectif pédagogique : ${contexte.objectif}

Détermine le nombre de séances nécessaire. Assure-toi qu'exactement une séance a est_seance_cloture: true (la dernière).`;
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as GenerateSequenceRequest;
  const { typeSequence, ...contexte } = body;

  if (
    !contexte.cycle ||
    !contexte.niveau ||
    !contexte.domaine ||
    !contexte.sousDomaine ||
    !contexte.item ||
    !contexte.competence ||
    !contexte.objectif
  ) {
    return NextResponse.json(
      { error: "Tous les éléments sélectionnés et l'objectif sont obligatoires." },
      { status: 400 }
    );
  }

  const regime = determineRegime(typeSequence ?? "introduction");
  const systemPrompt = buildSystemPrompt(regime, contexte.cycle, contexte.niveau, contexte.domaine);
  const prompt = buildPrompt(contexte, regime) + consigneMultiNiveaux(body.niveauxClasse);

  function parseSequence(texte: string) {
    const sequence = lireObjetJsonIa<Sequence>(texte);
    if (!sequenceValide(sequence)) {
      throw new Error(
        "La séquence générée est incomplète : vérifier la structure beat et la présence d'une séance de clôture."
      );
    }
    return sequence;
  }

  let texte: string;
  try {
    texte = await callAlbert(systemPrompt, prompt, 2800);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erreur lors de l'appel à l'IA.",
        details: ""
      },
      { status: 502 }
    );
  }

  try {
    const sequence = parseSequence(texte);
    return NextResponse.json({ sequence });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Impossible de lire la séquence générée.",
        details: texte
      },
      { status: 502 }
    );
  }
}
