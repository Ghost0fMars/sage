"use client";

import { useEffect, useMemo, useState } from "react";
import { readUserData, writeUserData } from "../lib/user-storage";
import { Classe, lireClasses } from "../lib/classes";

type Eleve = {
  id: string;
  nom: string;
  prenom: string;
  classeId?: string;
};

type SequencePreparee = {
  id: string;
  cycle: string;
  niveau: string;
  domaine: string;
  sousDomaine: string;
  competence: string;
  objectif: string;
  sequence: {
    titre: string;
  };
};

type NiveauAcquisition = "Non évalué" | "À renforcer" | "En cours" | "Acquis" | "Dépassé";

type EvaluationEleve = {
  eleveId: string;
  niveau: NiveauAcquisition;
  commentaire: string;
};

type Evaluation = {
  id: string;
  titre: string;
  date: string;
  domaine: string;
  competence: string;
  objectif: string;
  resultats: EvaluationEleve[];
};

const STUDENTS_STORAGE_KEY = "sage-students";
const SEQUENCES_STORAGE_KEY = "sage-sequences";
const EVALUATIONS_STORAGE_KEY = "sage-evaluations";

const niveaux: NiveauAcquisition[] = [
  "Non évalué",
  "À renforcer",
  "En cours",
  "Acquis",
  "Dépassé"
];

const couleursNiveaux: Record<NiveauAcquisition, string> = {
  "Non évalué": "bg-slate-100 text-slate-700",
  "À renforcer": "bg-red-100 text-red-900",
  "En cours": "bg-amber-100 text-amber-900",
  Acquis: "bg-teal-100 text-teal-900",
  Dépassé: "bg-blue-100 text-blue-900"
};

function creerResultatsVides(eleves: Eleve[]) {
  return eleves.map((eleve) => ({
    eleveId: eleve.id,
    niveau: "Non évalué" as NiveauAcquisition,
    commentaire: ""
  }));
}

function moyenneProgression(evaluation: Evaluation) {
  const valeurs: Record<NiveauAcquisition, number> = {
    "Non évalué": 0,
    "À renforcer": 25,
    "En cours": 50,
    Acquis: 75,
    Dépassé: 100
  };

  if (evaluation.resultats.length === 0) {
    return 0;
  }

  return Math.round(
    evaluation.resultats.reduce((total, resultat) => total + valeurs[resultat.niveau], 0) /
      evaluation.resultats.length
  );
}

export default function ProgressionPage() {
  const [eleves, setEleves] = useState<Eleve[]>([]);
  const [sequences, setSequences] = useState<SequencePreparee[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [evaluationSelectionneeId, setEvaluationSelectionneeId] = useState("");
  const [classes, setClasses] = useState<Classe[]>([]);
  const [nouvelleEvaluation, setNouvelleEvaluation] = useState({
    titre: "",
    date: "",
    sequenceId: "",
    classeId: "",
    domaine: "",
    competence: "",
    objectif: ""
  });

  useEffect(() => {
    const elevesStockes = readUserData<Eleve[]>(STUDENTS_STORAGE_KEY, [], STUDENTS_STORAGE_KEY);
    const sequencesStockees = readUserData<SequencePreparee[]>(
      SEQUENCES_STORAGE_KEY,
      [],
      SEQUENCES_STORAGE_KEY
    );
    const evaluationsStockees = readUserData<Evaluation[]>(
      EVALUATIONS_STORAGE_KEY,
      [],
      EVALUATIONS_STORAGE_KEY
    );

    setEleves(elevesStockes);
    setClasses(lireClasses());
    setSequences(sequencesStockees);
    setEvaluations(evaluationsStockees);
    setEvaluationSelectionneeId(evaluationsStockees[0]?.id ?? "");
  }, []);

  const evaluationSelectionnee = evaluations.find(
    (evaluation) => evaluation.id === evaluationSelectionneeId
  );

  const statistiques = useMemo(() => {
    if (!evaluationSelectionnee) {
      return niveaux.map((niveau) => ({ niveau, total: 0 }));
    }

    return niveaux.map((niveau) => ({
      niveau,
      total: evaluationSelectionnee.resultats.filter((resultat) => resultat.niveau === niveau)
        .length
    }));
  }, [evaluationSelectionnee]);

  function enregistrerEvaluations(prochainesEvaluations: Evaluation[]) {
    setEvaluations(prochainesEvaluations);
    writeUserData(EVALUATIONS_STORAGE_KEY, prochainesEvaluations);
  }

  function choisirSequence(sequenceId: string) {
    const sequence = sequences.find((item) => item.id === sequenceId);

    setNouvelleEvaluation((actuelle) => ({
      ...actuelle,
      sequenceId,
      titre: sequence ? sequence.sequence.titre : actuelle.titre,
      domaine: sequence?.domaine ?? "",
      competence: sequence?.competence ?? "",
      objectif: sequence?.objectif ?? ""
    }));
  }

  function creerEvaluation() {
    if (!nouvelleEvaluation.titre.trim() || !nouvelleEvaluation.date) {
      return;
    }

    const evaluation: Evaluation = {
      id: crypto.randomUUID(),
      titre: nouvelleEvaluation.titre.trim(),
      date: nouvelleEvaluation.date,
      domaine: nouvelleEvaluation.domaine.trim(),
      competence: nouvelleEvaluation.competence.trim(),
      objectif: nouvelleEvaluation.objectif.trim(),
      resultats: creerResultatsVides(
        nouvelleEvaluation.classeId
          ? eleves.filter((eleve) => eleve.classeId === nouvelleEvaluation.classeId)
          : eleves
      )
    };

    const prochainesEvaluations = [evaluation, ...evaluations];
    enregistrerEvaluations(prochainesEvaluations);
    setEvaluationSelectionneeId(evaluation.id);
    setNouvelleEvaluation({
      titre: "",
      date: "",
      sequenceId: "",
      classeId: nouvelleEvaluation.classeId,
      domaine: "",
      competence: "",
      objectif: ""
    });
  }

  function mettreAJourResultat(
    eleveId: string,
    miseAJour: Partial<Pick<EvaluationEleve, "niveau" | "commentaire">>
  ) {
    if (!evaluationSelectionnee) {
      return;
    }

    enregistrerEvaluations(
      evaluations.map((evaluation) =>
        evaluation.id === evaluationSelectionnee.id
          ? {
              ...evaluation,
              resultats: evaluation.resultats.map((resultat) =>
                resultat.eleveId === eleveId ? { ...resultat, ...miseAJour } : resultat
              )
            }
          : evaluation
      )
    );
  }

  function supprimerEvaluation() {
    if (!evaluationSelectionnee) {
      return;
    }

    const prochainesEvaluations = evaluations.filter(
      (evaluation) => evaluation.id !== evaluationSelectionnee.id
    );
    enregistrerEvaluations(prochainesEvaluations);
    setEvaluationSelectionneeId(prochainesEvaluations[0]?.id ?? "");
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
              Progression
            </p>
            <h1 className="mt-2 text-3xl font-bold text-slate-950">Suivi des progrès</h1>
            <p className="mt-2 max-w-3xl leading-7 text-slate-700">
              Créez des évaluations, renseignez le niveau d'acquisition de chaque élève et suivez
              l'évolution de la classe.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href="/"
              className="rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100"
            >
              Tableau de bord
            </a>
            <a
              href="/eleves"
              className="rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100"
            >
              Élèves & suivi
            </a>
          </div>
        </div>

        <section className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="min-w-0 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-950">Nouvelle évaluation</h2>

            <div className="mt-5 grid gap-4">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-slate-800">Séquence liée</span>
                <select
                  value={nouvelleEvaluation.sequenceId}
                  onChange={(event) => choisirSequence(event.target.value)}
                  className="w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
                >
                  <option value="">Saisie libre</option>
                  {sequences.map((sequence) => (
                    <option key={sequence.id} value={sequence.id}>
                      {sequence.sequence.titre}
                    </option>
                  ))}
                </select>
              </label>

              {classes.length > 0 && (
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-slate-800">Classe évaluée</span>
                  <select
                    value={nouvelleEvaluation.classeId}
                    onChange={(event) =>
                      setNouvelleEvaluation((actuelle) => ({
                        ...actuelle,
                        classeId: event.target.value
                      }))
                    }
                    className="w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
                  >
                    <option value="">Tous les élèves</option>
                    {classes.map((classe) => (
                      <option key={classe.id} value={classe.id}>
                        {classe.nom}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-slate-800">Titre</span>
                <input
                  value={nouvelleEvaluation.titre}
                  onChange={(event) =>
                    setNouvelleEvaluation((actuelle) => ({
                      ...actuelle,
                      titre: event.target.value
                    }))
                  }
                  className="w-full min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-slate-800">Date</span>
                <input
                  type="date"
                  value={nouvelleEvaluation.date}
                  onChange={(event) =>
                    setNouvelleEvaluation((actuelle) => ({
                      ...actuelle,
                      date: event.target.value
                    }))
                  }
                  className="w-full min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-slate-800">Domaine</span>
                <input
                  value={nouvelleEvaluation.domaine}
                  onChange={(event) =>
                    setNouvelleEvaluation((actuelle) => ({
                      ...actuelle,
                      domaine: event.target.value
                    }))
                  }
                  className="w-full min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-slate-800">Compétence</span>
                <textarea
                  value={nouvelleEvaluation.competence}
                  onChange={(event) =>
                    setNouvelleEvaluation((actuelle) => ({
                      ...actuelle,
                      competence: event.target.value
                    }))
                  }
                  className="min-h-20 w-full min-w-0 resize-y rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
                />
              </label>

              <button
                type="button"
                onClick={creerEvaluation}
                disabled={eleves.length === 0}
                className="w-full rounded-md bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
              >
                Créer l'évaluation
              </button>

              {eleves.length === 0 && (
                <p className="rounded-md bg-amber-50 p-3 text-base leading-6 text-amber-950">
                  Ajoutez d'abord des élèves pour créer une évaluation.
                </p>
              )}
            </div>

            <h2 className="mt-8 text-xl font-bold text-slate-950">Évaluations</h2>
            <div className="mt-4 grid gap-2">
              {evaluations.length === 0 && (
                <p className="rounded-md bg-slate-100 p-3 text-base text-slate-700">
                  Aucune évaluation pour le moment.
                </p>
              )}
              {evaluations.map((evaluation) => (
                <button
                  key={evaluation.id}
                  type="button"
                  onClick={() => setEvaluationSelectionneeId(evaluation.id)}
                  className={`rounded-md border p-3 text-left text-sm transition ${
                    evaluationSelectionneeId === evaluation.id
                      ? "border-teal-700 bg-teal-50 text-teal-950"
                      : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                  }`}
                >
                  <span className="font-semibold">{evaluation.titre}</span>
                  <span className="mt-1 block text-xs text-slate-500">{evaluation.date}</span>
                </button>
              ))}
            </div>
          </aside>

          <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            {!evaluationSelectionnee && (
              <div className="rounded-md bg-slate-100 p-5 text-slate-700">
                Sélectionnez ou créez une évaluation pour suivre les progrès.
              </div>
            )}

            {evaluationSelectionnee && (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
                      Évaluation du {evaluationSelectionnee.date}
                    </p>
                    <h2 className="mt-2 text-2xl font-bold text-slate-950">
                      {evaluationSelectionnee.titre}
                    </h2>
                    {evaluationSelectionnee.domaine && (
                      <p className="mt-2 text-base text-slate-600">
                        {evaluationSelectionnee.domaine}
                      </p>
                    )}
                    {evaluationSelectionnee.competence && (
                      <p className="mt-2 max-w-3xl leading-7 text-slate-700">
                        {evaluationSelectionnee.competence}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={supprimerEvaluation}
                    className="rounded-md bg-red-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-red-800"
                  >
                    Supprimer
                  </button>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
                  <article className="rounded-md bg-slate-100 p-4">
                    <p className="text-sm font-semibold text-slate-500">Progression moyenne</p>
                    <p className="mt-3 text-4xl font-bold">{moyenneProgression(evaluationSelectionnee)}%</p>
                  </article>
                  {statistiques.map((stat) => (
                    <article key={stat.niveau} className={`rounded-md p-4 ${couleursNiveaux[stat.niveau]}`}>
                      <p className="text-sm font-semibold">{stat.niveau}</p>
                      <p className="mt-3 text-4xl font-bold">{stat.total}</p>
                    </article>
                  ))}
                </div>

                <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200">
                  <table className="min-w-[900px] w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-900 text-white">
                        <th className="px-4 py-3 text-left">Élève</th>
                        <th className="px-4 py-3 text-left">Niveau d'acquisition</th>
                        <th className="px-4 py-3 text-left">Commentaire</th>
                      </tr>
                    </thead>
                    <tbody>
                      {evaluationSelectionnee.resultats.map((resultat, index) => {
                        const eleve = eleves.find((item) => item.id === resultat.eleveId);

                        return (
                          <tr key={resultat.eleveId} className={index % 2 === 0 ? "bg-slate-50" : "bg-white"}>
                            <td className="border-t border-slate-200 px-4 py-3 font-semibold text-slate-950">
                              {eleve ? `${eleve.nom} ${eleve.prenom}` : "Élève supprimé"}
                            </td>
                            <td className="border-t border-slate-200 px-4 py-3">
                              <select
                                value={resultat.niveau}
                                onChange={(event) =>
                                  mettreAJourResultat(resultat.eleveId, {
                                    niveau: event.target.value as NiveauAcquisition
                                  })
                                }
                                className="rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
                              >
                                {niveaux.map((niveau) => (
                                  <option key={niveau} value={niveau}>
                                    {niveau}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="border-t border-slate-200 px-4 py-3">
                              <input
                                value={resultat.commentaire}
                                onChange={(event) =>
                                  mettreAJourResultat(resultat.eleveId, {
                                    commentaire: event.target.value
                                  })
                                }
                                placeholder="Observation courte"
                                className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </section>
      </section>
    </main>
  );
}
