"use client";

import { useEffect, useState } from "react";
import GeneratingLabel from "./GeneratingLabel";

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

export type SeanceDetaillee = {
  titre: string;
  objectif: string;
  niveau: string;
  duree_minutes: number;
  materiel: string[];
  phases: PhaseSeanceDetaillee[];
  trace_ecrite: string;
  vigilance: string;
};

type Props = {
  open: boolean;
  lesson: SeanceDetaillee;
  onClose: () => void;
  onSave: (updated: SeanceDetaillee) => void;
  actions?: React.ReactNode;
  onGenerateStudentActivity?: (lesson: SeanceDetaillee) => void;
  studentActivityLoading?: boolean;
  onGenerateCourse?: (lesson: SeanceDetaillee) => void;
  courseLoading?: boolean;
};

export default function FicheSeanceModal({
  open,
  lesson,
  onClose,
  onSave,
  actions,
  onGenerateStudentActivity,
  studentActivityLoading = false,
  onGenerateCourse,
  courseLoading = false
}: Props) {
  const [local, setLocal] = useState<SeanceDetaillee>(lesson);

  useEffect(() => {
    if (open) setLocal(lesson);
  }, [open, lesson]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    if (open) window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function handleClose() {
    onSave(local);
    onClose();
  }

  function setLesson(update: Partial<SeanceDetaillee>) {
    setLocal((prev) => ({ ...prev, ...update }));
  }

  function setPhase(index: number, update: Partial<PhaseSeanceDetaillee>) {
    setLocal((prev) => ({
      ...prev,
      phases: prev.phases.map((p, i) => (i === index ? { ...p, ...update } : p))
    }));
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="relative flex w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl max-h-[90vh]">

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 rounded-t-2xl border-b border-slate-200 bg-white px-6 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
              Fiche de séance
            </p>
            <p className="mt-0.5 truncate text-lg font-bold text-slate-950">{local.titre}</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="shrink-0 grid h-9 w-9 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Fermer"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* Titre + méta */}
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-slate-700">Titre</span>
            <input
              value={local.titre}
              onChange={(e) => setLesson({ titre: e.target.value })}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xl font-bold text-slate-950 outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
            />
          </label>

          <label className="mt-4 grid gap-2">
            <span className="text-sm font-semibold text-slate-700">Objectif</span>
            <textarea
              value={local.objectif}
              onChange={(e) => setLesson({ objectif: e.target.value })}
              className="min-h-16 w-full rounded-md border border-slate-300 bg-white px-3 py-2 leading-7 text-slate-700 outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
            />
          </label>

          <div className="mt-4 flex flex-wrap gap-3">
            <label className="grid gap-1 rounded-md bg-slate-100 px-3 py-2">
              <span className="text-xs font-semibold text-slate-500">Niveau</span>
              <input
                value={local.niveau}
                onChange={(e) => setLesson({ niveau: e.target.value })}
                className="min-w-0 bg-transparent text-sm font-semibold text-slate-800 outline-none"
              />
            </label>
            <label className="grid gap-1 rounded-md bg-slate-100 px-3 py-2">
              <span className="text-xs font-semibold text-slate-500">Durée (min)</span>
              <input
                type="number"
                value={local.duree_minutes}
                onChange={(e) =>
                  setLesson({ duree_minutes: Number(e.target.value) || local.duree_minutes })
                }
                className="w-16 bg-transparent text-sm font-semibold text-slate-800 outline-none"
              />
            </label>
          </div>

          <label className="mt-4 grid gap-2">
            <span className="text-sm font-semibold text-slate-700">Matériel</span>
            <textarea
              value={local.materiel.join("\n")}
              onChange={(e) => setLesson({ materiel: e.target.value.split("\n").filter(Boolean) })}
              rows={2}
              placeholder="Un élément par ligne"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
            />
          </label>

          {/* Phases */}
          <div className="mt-6 grid gap-4">
            {local.phases.map((phase, index) => (
              <article
                key={`${index}-${phase.nom}`}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                    Phase {index + 1}
                  </span>
                  <input
                    type="number"
                    value={phase.duree_minutes}
                    onChange={(e) =>
                      setPhase(index, {
                        duree_minutes: Number(e.target.value) || phase.duree_minutes
                      })
                    }
                    className="w-16 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-600 outline-none focus:border-teal-600"
                  />
                  <input
                    value={phase.disposition_classe}
                    onChange={(e) => setPhase(index, { disposition_classe: e.target.value })}
                    className="flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-600 outline-none focus:border-teal-600"
                  />
                </div>

                <input
                  value={phase.nom}
                  onChange={(e) => setPhase(index, { nom: e.target.value })}
                  className="mt-3 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base font-semibold text-slate-950 outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
                />

                <dl className="mt-3 grid gap-3 text-sm">
                  <div>
                    <dt className="font-semibold text-slate-900">Rôle de l'enseignant</dt>
                    <dd>
                      <textarea
                        value={phase.role_enseignant}
                        onChange={(e) => setPhase(index, { role_enseignant: e.target.value })}
                        className="mt-1 min-h-16 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-700 outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
                      />
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-900">Consigne</dt>
                    <dd>
                      <textarea
                        value={phase.consigne}
                        onChange={(e) => setPhase(index, { consigne: e.target.value })}
                        className="mt-1 min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-700 outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
                      />
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-900">Activité des élèves</dt>
                    <dd>
                      <textarea
                        value={phase.role_eleves}
                        onChange={(e) => setPhase(index, { role_eleves: e.target.value })}
                        className="mt-1 min-h-16 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-700 outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
                      />
                    </dd>
                  </div>

                  {phase.hors_champ && (
                    <div className="rounded-lg bg-blue-50 px-3 py-2">
                      <dt className="font-semibold text-blue-900">Hors-champ</dt>
                      <dd className="mt-0.5 leading-6 text-blue-800">{phase.hors_champ}</dd>
                    </div>
                  )}

                  {phase.erreurs_anticipees && phase.erreurs_anticipees.length > 0 && (
                    <div className="rounded-lg bg-amber-50 px-3 py-2">
                      <dt className="font-semibold text-amber-900">Erreurs anticipées</dt>
                      <dd className="mt-1">
                        <ul className="space-y-0.5">
                          {phase.erreurs_anticipees.map((e, i) => (
                            <li key={i} className="text-amber-800">• {e}</li>
                          ))}
                        </ul>
                      </dd>
                    </div>
                  )}

                  {phase.relances && phase.relances.length > 0 && (
                    <div className="rounded-lg bg-slate-100 px-3 py-2">
                      <dt className="font-semibold text-slate-800">Relances</dt>
                      <dd className="mt-1">
                        <ul className="space-y-0.5">
                          {phase.relances.map((r, i) => (
                            <li key={i} className="text-slate-600">→ {r}</li>
                          ))}
                        </ul>
                      </dd>
                    </div>
                  )}

                  <div>
                    <dt className="font-semibold text-slate-900">Matériel</dt>
                    <dd>
                      <textarea
                        value={phase.materiel}
                        onChange={(e) => setPhase(index, { materiel: e.target.value })}
                        className="mt-1 min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-700 outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
                      />
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>

          {/* Trace écrite + Vigilance */}
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
              <label className="grid gap-2">
                <span className="font-semibold text-teal-900">Trace écrite</span>
                <textarea
                  value={local.trace_ecrite}
                  onChange={(e) => setLesson({ trace_ecrite: e.target.value })}
                  className="min-h-24 w-full rounded-md border border-teal-200 bg-white px-3 py-2 leading-7 text-teal-950 outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
                />
              </label>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <label className="grid gap-2">
                <span className="font-semibold text-amber-900">Vigilance</span>
                <textarea
                  value={local.vigilance}
                  onChange={(e) => setLesson({ vigilance: e.target.value })}
                  className="min-h-24 w-full rounded-md border border-amber-200 bg-white px-3 py-2 leading-7 text-amber-950 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-b-2xl border-t border-slate-200 bg-white px-6 py-4">
          <div className="flex flex-wrap gap-3">{actions}</div>
          <div className="ml-auto flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => onGenerateStudentActivity?.(local)}
              disabled={!onGenerateStudentActivity || studentActivityLoading}
              className="min-w-[190px] rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-center text-sm font-semibold text-teal-900 shadow-sm transition hover:bg-teal-100 focus:outline-none focus:ring-2 focus:ring-teal-200"
            >
              <GeneratingLabel
                active={studentActivityLoading}
                idleLabel="Fiche élève"
                messages={["Adaptation pour l'élève...", "Mise en forme de la fiche..."]}
              />
            </button>
            <button
              type="button"
              onClick={() => onGenerateCourse?.(local)}
              disabled={!onGenerateCourse || courseLoading}
              className="min-w-[170px] rounded-md border border-slate-300 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-focus"
            >
              <GeneratingLabel
                active={courseLoading}
                idleLabel="Cours"
                messages={["Rédaction du cours...", "Mise en page du support..."]}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
