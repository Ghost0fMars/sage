// Chat de la Carte des guides : passages du guide ouvert (ou de tout le corpus) puis Albert.
import { NextRequest, NextResponse } from "next/server";
import { callAlbert } from "../../lib/ai-provider";
import { citer, rechercher } from "../../lib/corpus";

type Message = { role: "user" | "assistant"; content: string };

export async function POST(request: NextRequest) {
  try {
    const { question, doc, historique = [] } = (await request.json()) as {
      question: string;
      doc?: string;
      historique?: Message[];
    };
    const extraits = await rechercher(question, { filtre: doc ? (d) => d.id === doc : undefined });
    const systeme =
      "Tu es un assistant pour des enseignants et cadres de l'Éducation nationale. Réponds en français, de façon concise, uniquement à partir des extraits de guides officiels fournis. Cite chaque source sous la forme [Titre du guide, p. N]. Si les extraits ne permettent pas de répondre, dis-le.\n\nEXTRAITS :\n" +
      extraits.map((e) => citer(e, 1800)).join("\n\n");
    const echanges = historique
      .slice(-6)
      .map((m) => `${m.role === "user" ? "Question" : "Réponse"} précédente : ${m.content}`)
      .join("\n\n");
    const reponse = await callAlbert(systeme, echanges ? `${echanges}\n\nQuestion : ${question}` : question, 700);
    return NextResponse.json({
      reponse,
      sources: extraits.map(({ id, titre, page, chemin }) => ({ id, titre, page, chemin }))
    });
  } catch (e) {
    return NextResponse.json({ erreur: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
