import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { callAlbert, callAlbertEmbedding } from "../../lib/ai-provider";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type ChatRequest = {
  messages: Message[];
  context: string;
};

type DocumentChunk = {
  content: string;
  similarity: number;
};

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  return authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : null;
}

async function verifierUtilisateur(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const token = getBearerToken(request);

  if (!supabaseUrl || !supabaseAnonKey) {
    // Application locale (Electron) sans Supabase configuré : pas de compte à
    // vérifier, l'accès à l'assistant est ouvert (comme le reste de l'app).
    return { user: null } as const;
  }

  if (!token) {
    return { error: "Connexion requise pour utiliser l'assistant.", status: 401 } as const;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: `Bearer ${token}` }
    }
  });
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return { error: "Session invalide. Reconnectez-vous.", status: 401 } as const;
  }

  const { data: access } = await supabase
    .from("user_access")
    .select("status")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (access?.status !== "approved") {
    return { error: "Votre compte doit être validé pour utiliser l'assistant.", status: 403 } as const;
  }

  return { user: data.user } as const;
}

async function rechercherDocumentation(question: string): Promise<string> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return "";
  }

  const embedding = await callAlbertEmbedding(question);

  if (!embedding) {
    return "";
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data: chunks, error } = await supabase.rpc("match_document_chunks", {
    query_embedding: embedding,
    match_count: 6,
    match_threshold: 0.45
  });

  if (error || !chunks || (chunks as DocumentChunk[]).length === 0) {
    return "";
  }

  return (chunks as DocumentChunk[]).map((chunk) => chunk.content).join("\n\n---\n\n");
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
      ? `\n[DOCUMENTATION INSTITUTIONNELLE PERTINENTE]\n${docContext}\n\nAppuie-toi sur cette documentation pour enrichir tes réponses. Cite les sources ou indique qu'il s'agit de recommandations institutionnelles quand tu t'y réfères.`
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

  const auth = await verifierUtilisateur(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const docContext = await rechercherDocumentation(dernierMessage).catch(() => "");
  const instructions = buildSystemPrompt(context, docContext);

  try {
    const content = await callAlbert(instructions, userPrompt, 2500);

    if (!content) {
      return NextResponse.json(
        { error: "L'IA n'a pas renvoyé de texte exploitable." },
        { status: 502 }
      );
    }

    return NextResponse.json({ content });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur lors de l'appel à l'IA." },
      { status: 500 }
    );
  }
}
