const ALBERT_BASE_URL = "https://albert.api.etalab.gouv.fr/v1";
const ALBERT_CHAT_MODEL = process.env.ALBERT_MODEL || "deepseek-v4-flash";
const ALBERT_EMBEDDING_MODEL = "bge-m3";

function getAlbertApiKey(): string {
  const apiKey = process.env.ALBERT_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Albert IA n'est pas configuré sur le serveur (ALBERT_API_KEY manquante)."
    );
  }
  return apiKey;
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
      model: ALBERT_CHAT_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt }
      ],
      max_tokens: maxTokens
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Erreur Albert IA (${response.status}) : ${details.slice(0, 300)}`);
  }

  const data = (await response.json()) as AlbertChatResponse;
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

type AlbertEmbeddingResponse = {
  data?: { embedding?: number[] }[];
};

export async function callAlbertEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.ALBERT_API_KEY;
  if (!apiKey) return null;

  const response = await fetch(`${ALBERT_BASE_URL}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ model: ALBERT_EMBEDDING_MODEL, input: text })
  });

  if (!response.ok) return null;

  const data = (await response.json()) as AlbertEmbeddingResponse;
  return data.data?.[0]?.embedding ?? null;
}
