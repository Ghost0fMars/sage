import { NextResponse } from "next/server";
import { ALBERT_BASE_URL } from "../../lib/ai-provider";

type AlbertModel = { id: string; type?: string };

// Liste les modèles de génération de texte accessibles avec la clé saisie par l'enseignant.
export async function GET(request: Request) {
  const cle = request.headers.get("x-albert-key")?.trim() || process.env.ALBERT_API_KEY;

  if (!cle) {
    return NextResponse.json({ error: "Aucune clé API Albert saisie." }, { status: 400 });
  }

  try {
    const response = await fetch(`${ALBERT_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${cle}` },
      signal: AbortSignal.timeout(15000)
    });

    if (response.status === 401 || response.status === 403) {
      return NextResponse.json({ error: "Clé API refusée par Albert." }, { status: 401 });
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: `Albert a répondu avec l'erreur ${response.status}.` },
        { status: 502 }
      );
    }

    const data = (await response.json()) as { data?: AlbertModel[] };
    const modeles = (data.data ?? [])
      .filter((modele) => !modele.type || modele.type === "text-generation")
      .map((modele) => modele.id)
      .sort((a, b) => a.localeCompare(b));

    return NextResponse.json({ modeles });
  } catch {
    return NextResponse.json({ error: "Albert est injoignable pour le moment." }, { status: 502 });
  }
}
