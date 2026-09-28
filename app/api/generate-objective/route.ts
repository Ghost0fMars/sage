import { NextResponse } from "next/server";
import { callAlbert } from "../../lib/ai-provider";
import { buildReferencesContext } from "../../lib/references";

type GenerateObjectiveRequest = {
  cycle?: string;
  niveau?: string;
  domaine?: string;
  competence?: string;
};

const SYSTEM_PROMPT = `<role>
Tu es SAGE, un assistant pédagogique expert du système éducatif français.
Tu formules des objectifs pédagogiques précis, conformes aux programmes de l'Éducation nationale.
</role>

<principes>
- L'objectif commence par un verbe d'action observable : identifier, comparer, produire, résoudre, distinguer, classer, construire, rédiger, expliquer…
- Il décrit ce que L'ÉLÈVE sera capable de faire — pas ce que l'enseignant va enseigner
- Il est réaliste pour une séquence de 4 à 6 séances
- Il est cohérent avec les programmes officiels en vigueur (BO 2024 cycles 2 et 3, BO 2021 cycle 1)
</principes>

<format_sortie>
Réponds uniquement avec l'objectif formulé : une phrase commençant par un verbe à l'infinitif, sans majuscule initiale, sans point final.
Exemple : "comparer des fractions ayant le même dénominateur en les plaçant sur une droite graduée"
</format_sortie>`;

export async function POST(request: Request) {
  const body = (await request.json()) as GenerateObjectiveRequest;
  const contexte = body;

  if (!contexte.niveau || !contexte.domaine || !contexte.competence) {
    return NextResponse.json(
      { error: "Le niveau, le domaine et la compétence sont obligatoires." },
      { status: 400 }
    );
  }

  const referencesContext = buildReferencesContext(
    contexte.cycle ?? "",
    contexte.niveau ?? "",
    contexte.domaine ?? "",
    "objective"
  );

  const systemPromptWithRefs = referencesContext
    ? SYSTEM_PROMPT + referencesContext
    : SYSTEM_PROMPT;

  const prompt = `Formule un objectif pédagogique pour des élèves de ${contexte.niveau} en ${contexte.domaine}.
Compétence visée : ${contexte.competence}`;

  try {
    const objectif = await callAlbert(systemPromptWithRefs, prompt, 150);

    if (!objectif) {
      return NextResponse.json(
        { error: "L'IA n'a pas renvoyé de texte exploitable." },
        { status: 502 }
      );
    }

    return NextResponse.json({ objectif });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur lors de l'appel à l'IA." },
      { status: 500 }
    );
  }
}
