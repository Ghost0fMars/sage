import { headers } from "next/headers";

export const ALBERT_BASE_URL = "https://albert.api.etalab.gouv.fr/v1";
const ALBERT_DEFAULT_MODEL = process.env.ALBERT_MODEL || "deepseek-v4-flash";

// En-têtes envoyés par le navigateur (clé et modèle choisis dans les paramètres).
function enteteRequete(nom: string): string {
  try {
    return headers().get(nom)?.trim() ?? "";
  } catch {
    return "";
  }
}

function getAlbertApiKey(): string {
  const apiKey = enteteRequete("x-albert-key") || process.env.ALBERT_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Sage n'est pas configuré : saisissez votre clé API dans Paramètres › Assistant IA."
    );
  }
  return apiKey;
}

function getAlbertModel(): string {
  return enteteRequete("x-albert-model") || ALBERT_DEFAULT_MODEL;
}

type AlbertChatResponse = {
  choices?: { message?: { content?: string } }[];
};

export async function callAlbert(
  system: string,
  prompt: string,
  maxTokens: number
): Promise<string> {
  const apiKey = getAlbertApiKey();

  const response = await fetch(`${ALBERT_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: getAlbertModel(),
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt }
      ],
      max_tokens: maxTokens
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Erreur Sage (${response.status}) : ${details.slice(0, 300)}`);
  }

  const data = (await response.json()) as AlbertChatResponse;
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

async function postAlbert<T>(chemin: string, corps: object, delai = 15000): Promise<T> {
  const response = await fetch(`${ALBERT_BASE_URL}${chemin}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getAlbertApiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify(corps),
    signal: AbortSignal.timeout(delai)
  });
  if (!response.ok) throw new Error(`Erreur Sage (${response.status}) : ${(await response.text()).slice(0, 300)}`);
  return (await response.json()) as T;
}

// Scores de pertinence de chaque document pour la requête, dans l'ordre des documents.
export async function callAlbertRerank(query: string, documents: string[]): Promise<number[]> {
  const data = await postAlbert<{ results: { index: number; relevance_score: number }[] }>("/rerank", {
    model: "bge-reranker-v2-m3",
    query,
    documents
  });
  const scores = new Array<number>(documents.length).fill(0);
  for (const r of data.results) scores[r.index] = r.relevance_score;
  return scores;
}
