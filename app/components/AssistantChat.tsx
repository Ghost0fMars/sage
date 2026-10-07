"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase-client";
import { readUserData } from "../lib/user-storage";

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: { titre: string; page: number; lien: string }[];
};

type Eleve = {
  id: string;
  nom: string;
  prenom: string;
  groupe: string;
  genre: string;
  ppre?: boolean;
  pap?: boolean;
  pai?: boolean;
  pps?: boolean;
  aide?: boolean;
  aidePsy?: boolean;
  differenciation?: boolean;
  stageRemiseNiveau?: boolean;
  accompagnement?: boolean;
  suiviExterieur?: boolean;
};

type Evaluation = {
  id: string;
  titre: string;
  date: string;
  domaine: string;
  competence: string;
  objectif: string;
  resultats: { eleveId: string; niveau: string; commentaire: string }[];
};

type NoteEleve = {
  id: string;
  eleveId: string;
  date: string;
  texte: string;
};

type ReglementInterieur = {
  texte: string;
};

function buildContext(
  eleves: Eleve[],
  evaluations: Evaluation[],
  notes: NoteEleve[],
  reglement: ReglementInterieur | null
) {
  const contexteClasse =
    eleves.length === 0
      ? "Aucun élève enregistré dans la classe."
      : buildContexteClasse(eleves, evaluations, notes);

  if (!reglement?.texte) {
    return contexteClasse;
  }

  return `${contexteClasse}\n\n## Règlement intérieur de l'établissement\n${reglement.texte}`;
}

function buildContexteClasse(eleves: Eleve[], evaluations: Evaluation[], notes: NoteEleve[]) {
  const elevesMap = new Map(eleves.map((eleve) => [eleve.id, eleve]));
  const elevesList = eleves
    .map((eleve) => {
      const dispositifs = [
        eleve.ppre && "PPRE",
        eleve.pap && "PAP",
        eleve.pai && "PAI",
        eleve.pps && "PPS",
        eleve.aide && "aide personnalisée",
        eleve.aidePsy && "suivi psy",
        eleve.differenciation && "différenciation",
        eleve.stageRemiseNiveau && "stage remise à niveau",
        eleve.accompagnement && "accompagnement",
        eleve.suiviExterieur && "suivi extérieur"
      ].filter(Boolean);
      const flags = dispositifs.length > 0 ? ` [${dispositifs.join(", ")}]` : "";
      return `- ${eleve.prenom} ${eleve.nom} (groupe ${eleve.groupe || "?"}, ${eleve.genre || "?"})${flags}`;
    })
    .join("\n");

  let context = `## Élèves (${eleves.length})\n${elevesList}\n`;

  if (evaluations.length > 0) {
    context += `\n## Évaluations (${evaluations.length})\n`;
    for (const evaluation of evaluations) {
      context += `\n### ${evaluation.titre} - ${evaluation.date}\nDomaine : ${evaluation.domaine} | Compétence : ${evaluation.competence}\nObjectif : ${evaluation.objectif}\nRésultats :\n`;
      for (const resultat of evaluation.resultats) {
        const eleve = elevesMap.get(resultat.eleveId);
        if (!eleve) {
          continue;
        }
        context += `- ${eleve.prenom} ${eleve.nom} : ${resultat.niveau}`;
        if (resultat.commentaire) {
          context += ` (${resultat.commentaire})`;
        }
        context += "\n";
      }
    }
  }

  if (notes.length > 0) {
    const notesByEleve = new Map<string, NoteEleve[]>();
    for (const note of notes) {
      if (!notesByEleve.has(note.eleveId)) {
        notesByEleve.set(note.eleveId, []);
      }
      notesByEleve.get(note.eleveId)!.push(note);
    }

    context += "\n## Notes de suivi\n";
    for (const [eleveId, eleveNotes] of notesByEleve) {
      const eleve = elevesMap.get(eleveId);
      if (!eleve) {
        continue;
      }
      context += `\n${eleve.prenom} ${eleve.nom} :\n`;
      for (const note of [...eleveNotes].sort((a, b) => a.date.localeCompare(b.date))) {
        context += `- [${note.date}] ${note.texte}\n`;
      }
    }
  }

  return context;
}

const SUGGESTIONS = [
  "Rédige une appréciation pour [prénom nom]",
  "Quels élèves sont en difficulté en Numération ?",
  "Génère les appréciations de tous les élèves",
  "Comment a évolué [prénom] depuis le début de l'année ?"
];

export default function AssistantChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [context, setContext] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const eleves = readUserData<Eleve[]>("sage-students", []);
    const evaluations = readUserData<Evaluation[]>("sage-evaluations", []);
    const notes = readUserData<NoteEleve[]>("sage-student-notes", []);
    const reglement = readUserData<ReglementInterieur | null>("sage-reglement-interieur", null);
    setContext(buildContext(eleves, evaluations, notes, reglement));
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function resetHeight() {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  async function sendMessage(text?: string) {
    const content = (text ?? input).trim();
    if (!content || streaming) {
      return;
    }

    const newMessages: Message[] = [...messages, { role: "user", content }];
    setMessages([...newMessages, { role: "assistant", content: "" }]);
    setInput("");
    resetHeight();
    setStreaming(true);

    try {
      const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
      const token = data.session?.access_token;

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({
          messages: newMessages,
          context
        })
      });

      const result = (await response.json()) as { content?: string; error?: string; sources?: Message["sources"] };

      if (!response.ok || !result.content) {
        throw new Error(result.error ?? "Erreur de l'API");
      }

      setMessages((previous) => [
        ...previous.slice(0, -1),
        { role: "assistant", content: result.content!, sources: result.sources }
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Une erreur est survenue.";
      setMessages((previous) => [...previous.slice(0, -1), { role: "assistant", content: message }]);
    } finally {
      setStreaming(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  function handleInputChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(event.target.value);
    event.target.style.height = "auto";
    event.target.style.height = `${Math.min(event.target.scrollHeight, 128)}px`;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-teal-600 text-white shadow-lg transition hover:bg-teal-500 active:scale-95 sm:bottom-6 sm:right-6 ${open ? "hidden" : ""}`}
        title="Assistant pédagogique"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          <path d="M9 9h6M9 13h4" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] top-20 z-50 flex max-h-[calc(100dvh-6rem)] min-h-0 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[580px] sm:w-[420px] sm:max-h-[calc(100dvh-3rem)]">
          <div className="flex shrink-0 items-center justify-between bg-teal-600 px-4 py-3">
            <div className="flex items-center gap-2 text-white">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span className="text-sm font-semibold">Assistant pédagogique</span>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMessages([])}
                  className="rounded-lg p-1.5 text-white/70 transition hover:bg-white/15 hover:text-white"
                  title="Nouvelle conversation"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-white/70 transition hover:bg-white/15 hover:text-white"
                title="Fermer"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            {messages.length === 0 ? (
              <div className="flex min-h-full flex-col items-center justify-center text-center">
                <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-teal-50 text-teal-600">
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    <path d="M9 9h6M9 13h4" />
                  </svg>
                </div>
                <p className="mb-1 text-sm font-semibold text-slate-700">
                  Que puis-je faire pour vous ?
                </p>
                <p className="mb-3 max-w-full px-2 text-xs leading-5 text-slate-500">
                  Je m'appuie sur vos élèves, évaluations et notes de suivi pour répondre.
                </p>
                <p className="mb-4 max-w-full rounded-lg bg-slate-100 px-3 py-2 text-xs leading-5 text-slate-600">
                  Évitez d'ajouter des informations sensibles inutiles dans vos messages.
                </p>
                <div className="flex w-full flex-col gap-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => sendMessage(suggestion)}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-left text-xs leading-5 text-slate-600 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((message, index) => {
                  const isLoadingPlaceholder =
                    streaming &&
                    index === messages.length - 1 &&
                    message.role === "assistant" &&
                    message.content === "";

                  return (
                    <div
                      key={`${message.role}-${index}`}
                      className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-3 py-2.5 text-sm leading-relaxed ${
                          message.role === "user"
                            ? "rounded-br-sm bg-teal-600 text-white"
                            : "rounded-bl-sm bg-slate-100 text-slate-800"
                        }`}
                      >
                        {isLoadingPlaceholder ? (
                          <span className="flex items-center gap-1 py-0.5">
                            {[0, 150, 300].map((delay) => (
                              <span
                                key={delay}
                                className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"
                                style={{ animationDelay: `${delay}ms` }}
                              />
                            ))}
                          </span>
                        ) : (
                          <>
                            <span className="whitespace-pre-wrap">{message.content}</span>
                            {message.sources && message.sources.length > 0 && (
                              <span className="mt-2 flex flex-wrap gap-1.5">
                                {message.sources.map((s) => (
                                  <a
                                    key={s.lien}
                                    href={s.lien}
                                    target="_blank"
                                    rel="noreferrer"
                                    title={`${s.titre}, page ${s.page}`}
                                    className="rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-xs text-slate-600 hover:border-teal-600 hover:text-teal-700"
                                  >
                                    {s.titre.length > 28 ? s.titre.slice(0, 27) + "…" : s.titre} p. {s.page}
                                  </a>
                                ))}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-slate-100 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:pb-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Posez une question..."
                rows={1}
                disabled={streaming}
                className="flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-base text-slate-800 placeholder-slate-400 transition focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400 disabled:opacity-50"
                style={{ minHeight: "40px", maxHeight: "128px" }}
              />
              <button
                type="button"
                onClick={() => sendMessage()}
                disabled={!input.trim() || streaming}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
            <p className="mt-1.5 text-center text-xs leading-4 text-slate-400">
              Entrée pour envoyer · Maj+Entrée pour nouvelle ligne
            </p>
          </div>
        </div>
      )}
    </>
  );
}

