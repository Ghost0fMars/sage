import { NextRequest, NextResponse } from "next/server";
import { callAlbert } from "../../lib/ai-provider";
import { citer, lienPdf, rechercher, type Passage } from "../../lib/corpus";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type ChatRequest = {
  messages: Message[];
  context: string;
};

async function rechercherDocumentation(question: string): Promise<Passage[]> {
  // corpus absent (non indexé) : l'assistant répond sans documentation
  return rechercher(question, { k: 4 }).catch(() => []);
}

function buildSystemPrompt(context: string, docContext: string) {
  return `Tu es l'assistant pédagogique intégré à Sage, un outil pour les enseignants du primaire. Tu aides l'enseignant à :
- Rédiger des appréciations pour le livret scolaire (2-4 phrases, ton positif et constructif)
- Identifier les élèves en difficulté ou en réussite selon les évaluations
- Analyser les progressions par domaine ou par compétence
- Formuler des bilans personnalisés à partir des notes de suivi
- Répondre à toute question d'ordre pédagogique ou de gestion de classe
- Répondre aux questions sur le règlement intérieur de l'établissement quand il est fourni ci-dessous

[DONNÉES DE LA CLASSE]
${context}
${
    docContext
      ? `\n[DOCUMENTATION INSTITUTIONNELLE PERTINENTE]\n${docContext}\n\nAppuie-toi sur cette documentation pour enrichir tes réponses. Quand tu t'y réfères, cite la source sous la forme [Titre, p. N]. Ignore les extraits sans rapport avec la question.`
      : ""
  }

Consignes :
- Réponds toujours en français.
- Pour les questions sur des élèves spécifiques, appuie-toi sur les données de la classe.
- Pour les questions pédagogiques générales (gestion de classe, différenciation, comportement, relations avec les familles...), réponds avec ton expertise professionnelle et les recommandations institutionnelles disponibles.
- Si l'enseignant pose une question sur le règlement intérieur de l'établissement et qu'une section "Règlement intérieur de l'établissement" est présente dans les données de la classe, appuie-toi dessus et cite le passage concerné. Si cette section est absente ou ne couvre pas la question, dis-le clairement plutôt que d'inventer une règle.
- Pour les appréciations destinées au livret scolaire, utilise un registre formel, bienveillant et précis, 2 à 4 phrases par élève.
- Ne mentionne jamais "Non évalué" dans une appréciation publique.
- Pour les analyses, cite les données précises : niveaux d'acquisition, domaines, dates d'évaluation.
- Si on te demande des appréciations pour plusieurs élèves, génère-les toutes dans un seul message en les séparant clairement.`;
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as ChatRequest;
  const { messages, context } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Le message est obligatoire." }, { status: 400 });
  }

  const dernierMessage = messages[messages.length - 1]?.content?.trim() ?? "";

  if (!dernierMessage) {
    return NextResponse.json({ error: "Le message est vide." }, { status: 400 });
  }

  const historique = messages
    .slice(0, -1)
    .map((message) => `${message.role === "user" ? "Enseignant" : "Assistant"} : ${message.content}`)
    .join("\n\n");

  const userPrompt = historique
    ? `[Historique de la conversation]\n${historique}\n\n[Nouveau message]\nEnseignant : ${dernierMessage}`
    : dernierMessage;

  const passages = await rechercherDocumentation(dernierMessage);
  const docContext = passages.map((p) => citer(p, 1200)).join("\n\n---\n\n");
  const instructions = buildSystemPrompt(context, docContext);

  try {
    const content = await callAlbert(instructions, userPrompt, 2500);

    if (!content) {
      return NextResponse.json(
        { error: "L'IA n'a pas renvoyé de texte exploitable." },
        { status: 502 }
      );
    }

    // Seulement les sources que la réponse cite : les autres extraits étaient hors sujet.
    const sources = passages
      .filter((p) => content.includes(p.titre))
      .map((p) => ({ titre: p.titre, page: p.page, lien: lienPdf(p) }));
    return NextResponse.json({ content, sources });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur lors de l'appel à l'IA." },
      { status: 500 }
    );
  }
}
