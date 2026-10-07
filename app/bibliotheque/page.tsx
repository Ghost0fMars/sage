"use client";

import { useEffect, useMemo, useState } from "react";
import { getDisciplineColor } from "../lib/discipline-colors";
import { readUserData, writeUserData } from "../lib/user-storage";
import { Classe, appartientALaClasse, lireClasses } from "../lib/classes";
import FicheSeanceModal, { type SeanceDetaillee } from "../components/FicheSeanceModal";
import FicheEleveViewer from "../components/FicheEleveViewer";
import CoursViewer from "../components/CoursViewer";
import TreeDisclosure from "../components/TreeDisclosure";
import { escapeHtml, ouvrirEtImprimer, printBaseStyles, printDocumentHeader } from "../lib/print-document";
import {
  migrerCoursLegacy,
  type CoursPresentation,
  type CoursSauvegarde,
  type Slide
} from "../lib/course-types";
import { imprimerCours } from "../lib/print-cours";

type Beat = {
  amorce: string;
  recherche: string;
  mise_en_commun: string;
  institutionnalisation: string | null;
  entrainement: string;
};

type SeanceProgression = {
  numero: number;
  type: string;
  titre: string;
  est_seance_cloture?: boolean;
  duree_minutes?: number;
  beat?: Beat;
  tension_ouverte?: string | null;
  materiel?: string[];
  differenciation?: { soutien?: string; approfondissement?: string };
};

type Sequence = {
  titre: string;
  intention: string;
  regime?: string;
  seances: SeanceProgression[];
};

type SequencePreparee = {
  id: string;
  createdAt: string;
  cycle: string;
  niveau: string;
  domaine: string;
  sousDomaine: string;
  item: string;
  competence: string;
  objectif: string;
  sequence: Sequence;
};

type SeancePreparee = {
  id: string;
  createdAt: string;
  cycle: string;
  niveau: string;
  domaine: string;
  sousDomaine: string;
  item: string;
  competence: string;
  sequenceTitle: string;
  sequenceTotal: number;
  seanceNumero: number;
  seanceType: string;
  lesson: SeanceDetaillee;
};

type FicheActiviteEleve = {
  titre: string;
  niveau: string;
  objectif: string;
  consigne: string;
  support: string;
  activites: {
    titre: string;
    consigne: string;
    format_reponse: string;
    aides: string[];
  }[];
  differenciation: {
    soutien: string;
    approfondissement: string;
  };
  correction: string[];
};

type ActiviteEleveSauvegardee = {
  id: string;
  createdAt: string;
  preparedLessonId?: string;
  cycle: string;
  niveau: string;
  domaine: string;
  sousDomaine: string;
  item: string;
  competence: string;
  sequenceTitle: string;
  seanceNumero: number;
  activity: FicheActiviteEleve;
};

type TuilePlanning = {
  id: string;
  preparedLessonId?: string;
  titreSequence: string;
  seanceLabel: string;
  domaine: string;
  dureeMinutes: number;
  lesson: SeanceDetaillee;
  day?: string;
  startMinute?: number;
};

type DossierSequences = Record<
  string,
  Record<string, Record<string, Record<string, SequencePreparee[]>>>
>;

type DossierBibliotheque = "preparations" | "activites" | "cours";

const PREPARED_LESSONS_STORAGE_KEY = "sage-prepared-lessons";
const STUDENT_ACTIVITIES_STORAGE_KEY = "sage-student-activities";
const COURSE_PRESENTATIONS_STORAGE_KEY = "sage-course-presentations";
const PLANNING_STORAGE_KEY = "sage-planning-tiles";
const SEQUENCES_STORAGE_KEY = "sage-sequences";

function cleSeance(sequence: SequencePreparee, numero: number) {
  return [
    sequence.cycle,
    sequence.niveau,
    sequence.domaine,
    sequence.sousDomaine,
    sequence.sequence.titre,
    numero
  ].join("|||");
}

function trouverFiche(
  fiches: SeancePreparee[],
  sequence: SequencePreparee,
  seance: SeanceProgression
) {
  return fiches.find(
    (fiche) =>
      fiche.cycle === sequence.cycle &&
      fiche.niveau === sequence.niveau &&
      fiche.domaine === sequence.domaine &&
      fiche.sousDomaine === sequence.sousDomaine &&
      fiche.sequenceTitle === sequence.sequence.titre &&
      fiche.seanceNumero === seance.numero
  );
}

function ajouterAuPlanning(seance: SeancePreparee) {
  const tuilesExistantes = readUserData<TuilePlanning[]>(
    PLANNING_STORAGE_KEY,
    [],
    PLANNING_STORAGE_KEY
  );

  const tuile: TuilePlanning = {
    id: crypto.randomUUID(),
    preparedLessonId: seance.id,
    titreSequence: seance.sequenceTitle,
    seanceLabel: `${seance.seanceNumero}/${seance.sequenceTotal}`,
    domaine: seance.domaine,
    dureeMinutes: seance.lesson.duree_minutes,
    lesson: seance.lesson
  };

  writeUserData(PLANNING_STORAGE_KEY, [...tuilesExistantes, tuile]);
}

function imprimerFiche(fiche: SeancePreparee) {
  const e = escapeHtml;

  const phasesHtml = (fiche.lesson.phases ?? [])
    .map(
      (phase, i) => `
      <section class="phase">
        <h2>Phase ${i + 1} — ${e(phase.nom)}</h2>
        <p class="meta">${[`${phase.duree_minutes} min`, phase.disposition_classe].filter(Boolean).map(e).join(" · ")}</p>
        ${phase.role_enseignant ? `<h3>Rôle enseignant</h3><p>${e(phase.role_enseignant)}</p>` : ""}
        ${phase.consigne ? `<h3>Consigne</h3><p>${e(phase.consigne)}</p>` : ""}
        ${phase.role_eleves ? `<h3>Activité élèves</h3><p>${e(phase.role_eleves)}</p>` : ""}
        ${phase.hors_champ ? `<h3>Hors-champ</h3><p>${e(phase.hors_champ)}</p>` : ""}
        ${phase.erreurs_anticipees?.length ? `<h3>Erreurs anticipées</h3><ul>${phase.erreurs_anticipees.map((err) => `<li>${e(err)}</li>`).join("")}</ul>` : ""}
        ${phase.relances?.length ? `<h3>Relances</h3><ul>${phase.relances.map((r) => `<li>${e(r)}</li>`).join("")}</ul>` : ""}
        ${phase.materiel ? `<h3>Matériel</h3><p>${e(phase.materiel)}</p>` : ""}
      </section>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${e(fiche.lesson.titre)}</title>
  <style>${printBaseStyles()}</style>
</head>
<body>
  ${printDocumentHeader()}
  <div class="intro">
    <p class="label">Fiche de séance</p>
    <h1>${e(fiche.lesson.titre)}</h1>
    <p class="subtitle">${[fiche.sequenceTitle, `Séance ${fiche.seanceNumero}`, fiche.seanceType, fiche.lesson.niveau, `${fiche.lesson.duree_minutes} min`].filter(Boolean).map(e).join(" · ")}</p>
    ${fiche.lesson.objectif ? `<h3>Objectif</h3><p>${e(fiche.lesson.objectif)}</p>` : ""}
    ${fiche.lesson.materiel?.length ? `<h3>Matériel</h3><p>${fiche.lesson.materiel.map(e).join(", ")}</p>` : ""}
  </div>
  ${phasesHtml}
  ${fiche.lesson.trace_ecrite ? `<div class="section"><h2>Trace écrite</h2><p>${e(fiche.lesson.trace_ecrite)}</p></div>` : ""}
  ${fiche.lesson.vigilance ? `<div class="section"><h2>Vigilance</h2><p>${e(fiche.lesson.vigilance)}</p></div>` : ""}
</body>
</html>`;

  ouvrirEtImprimer(html);
}

function apercuSlide(slide: Slide): string | undefined {
  const blocTexte = slide.blocks.find((b) => b.type === "text");
  return blocTexte && blocTexte.type === "text" ? blocTexte.lignes[0] : undefined;
}

export default function BibliothequePage() {
  const [sequences, setSequences] = useState<SequencePreparee[]>([]);
  const [fiches, setFiches] = useState<SeancePreparee[]>([]);
  const [activites, setActivites] = useState<ActiviteEleveSauvegardee[]>([]);
  const [cours, setCours] = useState<CoursSauvegarde[]>([]);
  const [tuilesPlanning, setTuilesPlanning] = useState<TuilePlanning[]>([]);
  const [dossierActif, setDossierActif] = useState<DossierBibliotheque>("preparations");
  const [ficheEnModal, setFicheEnModal] = useState<SeancePreparee | null>(null);
  const [activiteEnViewer, setActiviteEnViewer] = useState<ActiviteEleveSauvegardee | null>(null);
  const [coursEnViewer, setCoursEnViewer] = useState<CoursSauvegarde | null>(null);
  const [message, setMessage] = useState("");
  const [preparationEnCours, setPreparationEnCours] = useState("");
  const [activiteEnCours, setActiviteEnCours] = useState("");
  const [coursEnCours, setCoursEnCours] = useState("");
  const [classes, setClasses] = useState<Classe[]>([]);
  const [classeFiltreId, setClasseFiltreId] = useState("");

  useEffect(() => {
    function chargerDonnees() {
      setSequences(
        readUserData<SequencePreparee[]>(SEQUENCES_STORAGE_KEY, [], SEQUENCES_STORAGE_KEY)
      );
      setFiches(
        readUserData<SeancePreparee[]>(PREPARED_LESSONS_STORAGE_KEY, [], PREPARED_LESSONS_STORAGE_KEY)
      );
      setActivites(
        readUserData<ActiviteEleveSauvegardee[]>(
          STUDENT_ACTIVITIES_STORAGE_KEY,
          [],
          STUDENT_ACTIVITIES_STORAGE_KEY
        )
      );
      setCours(
        readUserData<CoursSauvegarde[]>(
          COURSE_PRESENTATIONS_STORAGE_KEY,
          [],
          COURSE_PRESENTATIONS_STORAGE_KEY
        ).map((c) => ({ ...c, course: migrerCoursLegacy(c.course) }))
      );
      setClasses(lireClasses());
      setTuilesPlanning(
        readUserData<TuilePlanning[]>(PLANNING_STORAGE_KEY, [], PLANNING_STORAGE_KEY)
      );
    }

    chargerDonnees();
    window.addEventListener("focus", chargerDonnees);
    document.addEventListener("visibilitychange", chargerDonnees);
    return () => {
      window.removeEventListener("focus", chargerDonnees);
      document.removeEventListener("visibilitychange", chargerDonnees);
    };
  }, []);

  const classeFiltree = classes.find((classe) => classe.id === classeFiltreId);
  function filtrerParClasse<T extends { classeId?: string; niveau: string }>(items: T[]) {
    return classeFiltree ? items.filter((item) => appartientALaClasse(item, classeFiltree)) : items;
  }
  const sequencesVisibles = filtrerParClasse(sequences);
  const activitesVisibles = filtrerParClasse(activites);
  const coursVisibles = filtrerParClasse(cours);

  const dossiers = useMemo(() => {
    return sequencesVisibles.reduce<DossierSequences>((acc, sequence) => {
      acc[sequence.cycle] ??= {};
      acc[sequence.cycle][sequence.niveau] ??= {};
      acc[sequence.cycle][sequence.niveau][sequence.domaine] ??= {};
      acc[sequence.cycle][sequence.niveau][sequence.domaine][sequence.sousDomaine] ??= [];
      acc[sequence.cycle][sequence.niveau][sequence.domaine][sequence.sousDomaine].push(sequence);
      return acc;
    }, {});
  }, [sequencesVisibles]);

  const dossiersActivites = useMemo(() => {
    return activitesVisibles.reduce<Record<string, Record<string, ActiviteEleveSauvegardee[]>>>((acc, a) => {
      const niveau = a.niveau || "Niveau non défini";
      const domaine = a.domaine || "Domaine non défini";
      acc[niveau] ??= {};
      acc[niveau][domaine] ??= [];
      acc[niveau][domaine].push(a);
      return acc;
    }, {});
  }, [activitesVisibles]);

  const dossiersCours = useMemo(() => {
    return coursVisibles.reduce<Record<string, Record<string, CoursSauvegarde[]>>>((acc, c) => {
      const niveau = c.niveau || "Niveau non défini";
      const domaine = c.domaine || "Domaine non défini";
      acc[niveau] ??= {};
      acc[niveau][domaine] ??= [];
      acc[niveau][domaine].push(c);
      return acc;
    }, {});
  }, [coursVisibles]);

  const dossiersBibliotheque: Array<{
    id: DossierBibliotheque;
    titre: string;
    description: string;
    compteur: number;
  }> = [
    {
      id: "preparations",
      titre: "Fiches de préparation",
      description: "Séances générées depuis Préparer, avec leurs progressions.",
      compteur: filtrerParClasse(fiches).length
    },
    {
      id: "activites",
      titre: "Activités",
      description: "Fiches élèves et supports d'activité à distribuer en classe.",
      compteur: activitesVisibles.length
    },
    {
      id: "cours",
      titre: "Cours",
      description: "Présentations enseignant à diffuser pendant la séance.",
      compteur: coursVisibles.length
    }
  ];

  async function preparerSeance(sequence: SequencePreparee, seance: SeanceProgression) {
    const idPreparation = cleSeance(sequence, seance.numero);
    setPreparationEnCours(idPreparation);
    setMessage("");

    try {
      const response = await fetch("/api/generate-lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cycle: sequence.cycle,
          niveau: sequence.niveau,
          domaine: sequence.domaine,
          sousDomaine: sequence.sousDomaine,
          item: sequence.item,
          competence: sequence.competence,
          objectifSequence: sequence.objectif,
          seance
        })
      });

      const data = (await response.json()) as { seance?: SeanceDetaillee; error?: string };

      if (!response.ok || !data.seance) {
        throw new Error(data.error ?? "Impossible de préparer la séance.");
      }

      const fiche: SeancePreparee = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        cycle: sequence.cycle,
        niveau: sequence.niveau,
        domaine: sequence.domaine,
        sousDomaine: sequence.sousDomaine,
        item: sequence.item,
        competence: sequence.competence,
        sequenceTitle: sequence.sequence.titre,
        sequenceTotal: sequence.sequence.seances.length,
        seanceNumero: seance.numero,
        seanceType: seance.type,
        lesson: data.seance
      };

      const nouvellesFiches = [...fiches, fiche];
      setFiches(nouvellesFiches);
      writeUserData(PREPARED_LESSONS_STORAGE_KEY, nouvellesFiches);
      setFicheEnModal(fiche);
      setMessage(`La fiche de séance ${seance.numero} a été préparée et enregistrée.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Une erreur inconnue est survenue.");
    } finally {
      setPreparationEnCours("");
    }
  }

  function renvoyerEnReserve(seance: SeancePreparee) {
    if (tuilesPlanning.some((tuile) => tuile.preparedLessonId === seance.id)) return;
    ajouterAuPlanning(seance);
    setTuilesPlanning(readUserData<TuilePlanning[]>(PLANNING_STORAGE_KEY, [], PLANNING_STORAGE_KEY));
    setMessage(
      `La séance ${seance.seanceNumero}/${seance.sequenceTotal} a été renvoyée dans la réserve du planning.`
    );
  }

  function modifierSequenceSauvegardee(
    sequenceOriginale: SequencePreparee,
    prochaineSequence: Sequence
  ) {
    const prochainesSequences = sequences.map((s) =>
      s.id === sequenceOriginale.id ? { ...s, sequence: prochaineSequence } : s
    );
    const prochainesFiches = fiches.map((fiche) =>
      fiche.cycle === sequenceOriginale.cycle &&
      fiche.niveau === sequenceOriginale.niveau &&
      fiche.domaine === sequenceOriginale.domaine &&
      fiche.sousDomaine === sequenceOriginale.sousDomaine &&
      fiche.sequenceTitle === sequenceOriginale.sequence.titre
        ? { ...fiche, sequenceTitle: prochaineSequence.titre }
        : fiche
    );
    const prochainesTuiles = tuilesPlanning.map((tuile) =>
      prochainesFiches.some(
        (fiche) =>
          fiche.id === tuile.preparedLessonId &&
          fiche.sequenceTitle === prochaineSequence.titre
      )
        ? { ...tuile, titreSequence: prochaineSequence.titre }
        : tuile
    );

    setSequences(prochainesSequences);
    setFiches(prochainesFiches);
    setTuilesPlanning(prochainesTuiles);
    writeUserData(SEQUENCES_STORAGE_KEY, prochainesSequences);
    writeUserData(PREPARED_LESSONS_STORAGE_KEY, prochainesFiches);
    writeUserData(PLANNING_STORAGE_KEY, prochainesTuiles);
  }

  function modifierSeanceProgressionSauvegardee(
    sequence: SequencePreparee,
    numero: number,
    miseAJour: Partial<SeanceProgression>
  ) {
    modifierSequenceSauvegardee(sequence, {
      ...sequence.sequence,
      seances: sequence.sequence.seances.map((seance) =>
        seance.numero === numero ? { ...seance, ...miseAJour } : seance
      )
    });
  }

  function modifierFicheSauvegardee(ficheId: string, prochaineFiche: SeancePreparee) {
    const prochainesFiches = fiches.map((fiche) =>
      fiche.id === ficheId ? prochaineFiche : fiche
    );
    const prochainesTuiles = tuilesPlanning.map((tuile) =>
      tuile.preparedLessonId === ficheId
        ? {
            ...tuile,
            titreSequence: prochaineFiche.sequenceTitle,
            domaine: prochaineFiche.domaine,
            dureeMinutes: prochaineFiche.lesson.duree_minutes,
            lesson: prochaineFiche.lesson
          }
        : tuile
    );

    setFiches(prochainesFiches);
    setTuilesPlanning(prochainesTuiles);
    writeUserData(PREPARED_LESSONS_STORAGE_KEY, prochainesFiches);
    writeUserData(PLANNING_STORAGE_KEY, prochainesTuiles);
  }

  function modifierLessonSauvegardee(fiche: SeancePreparee, lesson: SeanceDetaillee) {
    modifierFicheSauvegardee(fiche.id, { ...fiche, lesson });
  }

  async function genererActiviteEleve(fiche: SeancePreparee, lesson: SeanceDetaillee) {
    setActiviteEnCours(fiche.id);
    setMessage("");

    try {
      const response = await fetch("/api/generate-student-activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cycle: fiche.cycle,
          niveau: fiche.niveau || lesson.niveau,
          domaine: fiche.domaine,
          sousDomaine: fiche.sousDomaine,
          item: fiche.item,
          competence: fiche.competence,
          sequenceTitle: fiche.sequenceTitle,
          seanceNumero: fiche.seanceNumero,
          lesson
        })
      });

      const data = (await response.json()) as {
        activity?: FicheActiviteEleve;
        error?: string;
      };

      if (!response.ok || !data.activity) {
        throw new Error(data.error ?? "Impossible de générer la fiche élève.");
      }

      const prochaineActivite: ActiviteEleveSauvegardee = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        preparedLessonId: fiche.id,
        cycle: fiche.cycle,
        niveau: fiche.niveau || lesson.niveau,
        domaine: fiche.domaine,
        sousDomaine: fiche.sousDomaine,
        item: fiche.item,
        competence: fiche.competence,
        sequenceTitle: fiche.sequenceTitle,
        seanceNumero: fiche.seanceNumero,
        activity: data.activity
      };

      const prochainesActivites = [...activites, prochaineActivite];
      setActivites(prochainesActivites);
      writeUserData(STUDENT_ACTIVITIES_STORAGE_KEY, prochainesActivites);
      setDossierActif("activites");
      setFicheEnModal(null);
      setMessage(`La fiche élève "${data.activity.titre}" a été générée et rangée dans Activités.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Une erreur inconnue est survenue.");
    } finally {
      setActiviteEnCours("");
    }
  }

  async function genererCours(fiche: SeancePreparee, lesson: SeanceDetaillee) {
    setCoursEnCours(fiche.id);
    setMessage("");

    try {
      const response = await fetch("/api/generate-course", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cycle: fiche.cycle,
          niveau: fiche.niveau || lesson.niveau,
          domaine: fiche.domaine,
          sousDomaine: fiche.sousDomaine,
          item: fiche.item,
          competence: fiche.competence,
          sequenceTitle: fiche.sequenceTitle,
          seanceNumero: fiche.seanceNumero,
          lesson
        })
      });

      const data = (await response.json()) as {
        course?: CoursPresentation;
        error?: string;
      };

      if (!response.ok || !data.course) {
        throw new Error(data.error ?? "Impossible de générer le cours.");
      }

      const prochainCours: CoursSauvegarde = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        preparedLessonId: fiche.id,
        cycle: fiche.cycle,
        niveau: fiche.niveau || lesson.niveau,
        domaine: fiche.domaine,
        sousDomaine: fiche.sousDomaine,
        item: fiche.item,
        competence: fiche.competence,
        sequenceTitle: fiche.sequenceTitle,
        seanceNumero: fiche.seanceNumero,
        course: data.course
      };

      const prochainsCours = [...cours, prochainCours];
      setCours(prochainsCours);
      writeUserData(COURSE_PRESENTATIONS_STORAGE_KEY, prochainsCours);
      setDossierActif("cours");
      setFicheEnModal(null);
      setMessage(`Le cours "${data.course.titre}" a été généré et rangé dans Cours.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Une erreur inconnue est survenue.");
    } finally {
      setCoursEnCours("");
    }
  }

  function supprimerSequence(sequence: SequencePreparee) {
    const confirmation = window.confirm(
      `Supprimer la séquence "${sequence.sequence.titre}" et ses fiches de séances associées ?`
    );
    if (!confirmation) return;

    const prochainesSequences = sequences.filter((item) => item.id !== sequence.id);
    const prochainesFiches = fiches.filter(
      (fiche) =>
        !(
          fiche.cycle === sequence.cycle &&
          fiche.niveau === sequence.niveau &&
          fiche.domaine === sequence.domaine &&
          fiche.sousDomaine === sequence.sousDomaine &&
          fiche.sequenceTitle === sequence.sequence.titre
        )
    );

    setSequences(prochainesSequences);
    setFiches(prochainesFiches);
    writeUserData(SEQUENCES_STORAGE_KEY, prochainesSequences);
    writeUserData(PREPARED_LESSONS_STORAGE_KEY, prochainesFiches);
    setMessage(`La séquence "${sequence.sequence.titre}" a été supprimée.`);
  }

  function supprimerActivite(activite: ActiviteEleveSauvegardee) {
    const confirmation = window.confirm(
      `Supprimer la fiche élève "${activite.activity.titre}" ?`
    );
    if (!confirmation) return;

    const prochainesActivites = activites.filter((item) => item.id !== activite.id);
    setActivites(prochainesActivites);
    writeUserData(STUDENT_ACTIVITIES_STORAGE_KEY, prochainesActivites);
    setMessage(`La fiche "${activite.activity.titre}" a été supprimée.`);
  }

  function supprimerCours(item: CoursSauvegarde) {
    const confirmation = window.confirm(`Supprimer le cours "${item.course.titre}" ?`);
    if (!confirmation) return;

    const prochainsCours = cours.filter((c) => c.id !== item.id);
    setCours(prochainsCours);
    writeUserData(COURSE_PRESENTATIONS_STORAGE_KEY, prochainsCours);
    setMessage(`Le cours "${item.course.titre}" a été supprimé.`);
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
              Bibliothèque
            </p>
            <h1 className="mt-2 text-3xl font-bold text-slate-950">Explorateur pédagogique</h1>
            <p className="mt-2 max-w-3xl leading-7 text-slate-700">
              Retrouvez les séquences et séances selon l'arborescence Cycle / Niveau / Domaine /
              Sous-domaine / Séquence.
            </p>
            {classes.length > 0 && (
              <label className="mt-4 grid max-w-xs gap-2">
                <span className="text-sm font-semibold text-slate-800">Classe</span>
                <select
                  value={classeFiltreId}
                  onChange={(event) => setClasseFiltreId(event.target.value)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
                >
                  <option value="">Toutes mes classes</option>
                  {classes.map((classe) => (
                    <option key={classe.id} value={classe.id}>
                      {classe.nom}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <a href="/" className="rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100">
              Tableau de bord
            </a>
            <a href="/preparation" className="rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100">
              Préparer une séance
            </a>
            <a href="/planning" className="rounded-md bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800">
              Ouvrir le planning
            </a>
          </div>
        </div>

        {message && (
          <div className="mb-5 rounded-md border border-teal-200 bg-teal-50 p-4 text-teal-950">
            {message}
          </div>
        )}

        <div className="mb-6 grid gap-3 md:grid-cols-3">
          {dossiersBibliotheque.map((dossier) => {
            const actif = dossierActif === dossier.id;
            return (
              <button
                key={dossier.id}
                type="button"
                onClick={() => setDossierActif(dossier.id)}
                className={`rounded-lg border p-4 text-left shadow-sm transition ${
                  actif
                    ? "border-teal-300 bg-teal-50 ring-2 ring-teal-100"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="font-semibold text-slate-950">{dossier.titre}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      actif ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {dossier.compteur}
                  </span>
                </span>
                <span className="mt-2 block text-sm leading-6 text-slate-600">
                  {dossier.description}
                </span>
              </button>
            );
          })}
        </div>

        {dossierActif === "preparations" && sequencesVisibles.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-slate-700">
            <h2 className="text-lg font-semibold text-slate-950">Préparations</h2>
            <p className="mt-2 leading-7">
              Les séquences générées depuis la préparation apparaîtront ici.
            </p>
          </div>
        )}

        {dossierActif === "activites" && (
          <div className="grid gap-4">
            {activitesVisibles.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-slate-700">
                <h2 className="text-lg font-semibold text-slate-950">Activités</h2>
                <p className="mt-2 leading-7">
                  Les fiches élèves générées depuis une fiche de séance apparaîtront ici.
                </p>
              </div>
            ) : (
              Object.entries(dossiersActivites).map(([niveau, domaines]) => (
                <TreeDisclosure
                  key={niveau}
                  heading
                  defaultOpen
                  className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                  summary={niveau}
                >
                  {Object.entries(domaines).map(([domaine, listeActivites]) => {
                    const couleur = getDisciplineColor(domaine);
                    return (
                      <TreeDisclosure
                        key={domaine}
                        defaultOpen
                        summary={
                          <span
                            className="rounded-full px-2.5 py-1 text-sm font-semibold"
                            style={{ backgroundColor: couleur.softBackground, color: couleur.text }}
                          >
                            {domaine}
                          </span>
                        }
                        meta={<span className="text-sm text-slate-400">{listeActivites.length}</span>}
                      >
                        {listeActivites.map((activite) => (
                              <article
                                key={activite.id}
                                className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
                                      {activite.sequenceTitle} · Séance {activite.seanceNumero}
                                    </p>
                                    <h2 className="mt-1 text-xl font-bold text-slate-950">
                                      {activite.activity.titre}
                                    </h2>
                                    <p className="mt-1 text-sm text-slate-500">
                                      {activite.sousDomaine}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="rounded-full bg-teal-50 border border-teal-200 px-3 py-1 text-xs font-semibold text-teal-700">
                                      Fiche élève
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setActiviteEnViewer(activite)}
                                      className="flex items-center gap-1.5 rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800"
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <polyline points="6 9 6 2 18 2 18 9"/>
                                        <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
                                        <rect x="6" y="14" width="12" height="8"/>
                                      </svg>
                                      Ouvrir / Imprimer
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => supprimerActivite(activite)}
                                      className="rounded-md bg-red-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-800"
                                    >
                                      Supprimer
                                    </button>
                                  </div>
                                </div>

                                <div className="mt-4 grid gap-4 text-sm leading-6 text-slate-700">
                                  <section>
                                    <h3 className="font-semibold text-slate-950">Consigne</h3>
                                    <p className="mt-1">{activite.activity.consigne}</p>
                                  </section>
                                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                    {activite.activity.activites.map((item, index) => (
                                      <section key={`${activite.id}-${index}`} className="rounded-md bg-slate-50 p-3 border border-slate-100">
                                        <div className="flex items-center gap-2 mb-1">
                                          <span className="flex-shrink-0 grid h-5 w-5 place-items-center rounded-full bg-slate-200 text-xs font-black text-slate-600">
                                            {index + 1}
                                          </span>
                                          <h3 className="font-semibold text-slate-950 text-xs truncate">{item.titre}</h3>
                                        </div>
                                        <p className="mt-1 text-xs text-slate-600 line-clamp-2">{item.consigne}</p>
                                        <p className="mt-1.5 text-xs font-semibold text-slate-400">
                                          {item.format_reponse}
                                        </p>
                                      </section>
                                    ))}
                                  </div>
                                  {(activite.activity.differenciation.soutien || activite.activity.differenciation.approfondissement) && (
                                    <div className="flex flex-wrap gap-2">
                                      {activite.activity.differenciation.soutien && (
                                        <span className="rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs text-blue-700">
                                          Soutien disponible
                                        </span>
                                      )}
                                      {activite.activity.differenciation.approfondissement && (
                                        <span className="rounded-full bg-purple-50 border border-purple-200 px-3 py-1 text-xs text-purple-700">
                                          Approfondissement disponible
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </article>
                        ))}
                      </TreeDisclosure>
                    );
                  })}
                </TreeDisclosure>
              ))
            )}
          </div>
        )}

        {dossierActif === "cours" && (
          <div className="grid gap-4">
            {coursVisibles.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-slate-700">
                <h2 className="text-lg font-semibold text-slate-950">Cours</h2>
                <p className="mt-2 leading-7">
                  Les présentations enseignant générées depuis une fiche de séance apparaîtront ici.
                </p>
              </div>
            ) : (
              Object.entries(dossiersCours).map(([niveau, domaines]) => (
                <TreeDisclosure
                  key={niveau}
                  heading
                  defaultOpen
                  className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                  summary={niveau}
                >
                  {Object.entries(domaines).map(([domaine, listeCours]) => {
                    const couleur = getDisciplineColor(domaine);
                    return (
                      <TreeDisclosure
                        key={domaine}
                        defaultOpen
                        summary={
                          <span
                            className="rounded-full px-2.5 py-1 text-sm font-semibold"
                            style={{ backgroundColor: couleur.softBackground, color: couleur.text }}
                          >
                            {domaine}
                          </span>
                        }
                        meta={<span className="text-sm text-slate-400">{listeCours.length}</span>}
                      >
                        {listeCours.map((item) => (
                              <article
                                key={item.id}
                                className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
                                      {item.sequenceTitle} · Séance {item.seanceNumero}
                                    </p>
                                    <h2 className="mt-1 text-xl font-bold text-slate-950">
                                      {item.course.titre}
                                    </h2>
                                    <p className="mt-1 text-sm text-slate-500">
                                      {item.sousDomaine}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="rounded-full bg-slate-100 border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600">
                                      {item.course.slides.length} slides
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setCoursEnViewer(item)}
                                      className="flex items-center gap-1.5 rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800"
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <rect x="2" y="3" width="20" height="14" rx="2"/>
                                        <path d="M8 21h8M12 17v4"/>
                                      </svg>
                                      Projeter
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => supprimerCours(item)}
                                      className="rounded-md bg-red-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-800"
                                    >
                                      Supprimer
                                    </button>
                                  </div>
                                </div>

                                <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                                  {item.course.slides.map((slide, index) => (
                                    <button
                                      key={`${item.id}-${index}`}
                                      type="button"
                                      onClick={() => { setCoursEnViewer(item); }}
                                      className="flex-shrink-0 w-36 rounded-md bg-slate-900 p-3 text-left hover:bg-slate-800 transition"
                                    >
                                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
                                        {index + 1} · {slide.type}
                                      </p>
                                      <p className="text-xs font-bold text-white leading-snug line-clamp-2">{slide.titre}</p>
                                      {apercuSlide(slide) && (
                                        <p className="mt-1 text-xs text-slate-400 line-clamp-2 leading-snug">{apercuSlide(slide)}</p>
                                      )}
                                    </button>
                                  ))}
                                </div>

                                {item.course.deroule_projection && item.course.deroule_projection.length > 0 && (
                                  <div className="mt-3 rounded-md bg-slate-50 px-4 py-2 border border-slate-100">
                                    <p className="text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">Déroulé de projection</p>
                                    <ul className="space-y-0.5">
                                      {item.course.deroule_projection.map((etape, i) => (
                                        <li key={i} className="text-xs leading-5 text-slate-600">→ {etape}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </article>
                        ))}
                      </TreeDisclosure>
                    );
                  })}
                </TreeDisclosure>
              ))
            )}
          </div>
        )}

        {dossierActif === "preparations" && (
          <div className="grid gap-4">
          {Object.entries(dossiers).map(([cycle, niveaux]) => (
            <TreeDisclosure
              key={cycle}
              heading
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
              summary={cycle}
            >
              {Object.entries(niveaux).map(([niveau, domaines]) => (
                <TreeDisclosure key={niveau} summary={niveau}>
                  {Object.entries(domaines).map(([domaine, sousDomaines]) => {
                    const couleur = getDisciplineColor(domaine);
                    return (
                      <TreeDisclosure
                        key={domaine}
                        summary={
                          <span
                            className="rounded-full px-2.5 py-1 text-sm font-semibold"
                            style={{ backgroundColor: couleur.softBackground, color: couleur.text }}
                          >
                            {domaine}
                          </span>
                        }
                      >
                        {Object.entries(sousDomaines).map(([sousDomaine, listeSequences]) => (
                          <TreeDisclosure key={sousDomaine} summary={sousDomaine}>
                            {listeSequences.map((sequence) => (
                              <TreeDisclosure
                                key={sequence.id}
                                className="rounded-md border bg-white p-4"
                                style={{ borderColor: getDisciplineColor(sequence.domaine).border }}
                                contentClassName="mt-4 grid gap-3"
                                summary={
                                  <span>
                                    <span className="font-semibold text-slate-950">
                                      Séquence · {sequence.sequence.titre}
                                    </span>
                                    <span className="ml-2 text-sm text-slate-500">
                                      {sequence.sequence.seances.length} séance(s)
                                      {sequence.sequence.regime && (
                                        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                                          {sequence.sequence.regime}
                                        </span>
                                      )}
                                    </span>
                                  </span>
                                }
                                meta={
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      supprimerSequence(sequence);
                                    }}
                                    className="rounded-md bg-red-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-800"
                                  >
                                    Supprimer
                                  </button>
                                }
                              >
                                <label className="grid gap-2">
                                  <span className="text-sm font-semibold text-slate-700">
                                    Titre de la séquence
                                  </span>
                                  <input
                                    value={sequence.sequence.titre}
                                    onChange={(e) =>
                                      modifierSequenceSauvegardee(sequence, {
                                        ...sequence.sequence,
                                        titre: e.target.value
                                      })
                                    }
                                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-950 outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
                                  />
                                </label>
                                <label className="grid gap-2 text-sm leading-6 text-slate-700">
                                  <span className="font-semibold text-slate-950">
                                    Intention générale
                                  </span>
                                  <textarea
                                    value={sequence.sequence.intention}
                                    onChange={(e) =>
                                      modifierSequenceSauvegardee(sequence, {
                                        ...sequence.sequence,
                                        intention: e.target.value
                                      })
                                    }
                                    className="min-h-20 w-full rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
                                  />
                                </label>
                                <p className="mt-2 text-sm leading-6 text-slate-700">
                                  <span className="font-semibold text-slate-950">Objectif :</span>{" "}
                                  {sequence.objectif}
                                </p>

                                <details
                                  className="group mt-4 rounded-md border p-3"
                                  style={{
                                    backgroundColor: getDisciplineColor(sequence.domaine).softBackground,
                                    borderColor: getDisciplineColor(sequence.domaine).border,
                                    color: getDisciplineColor(sequence.domaine).text
                                  }}
                                  open
                                >
                                  <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-teal-700 [&::-webkit-details-marker]:hidden">
                                    <svg
                                      className="h-3.5 w-3.5 shrink-0 transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2.5"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      aria-hidden="true"
                                    >
                                      <polyline points="9 6 15 12 9 18" />
                                    </svg>
                                    Voir la progression
                                  </summary>

                                  <div className="mt-3 grid gap-3">
                                              {sequence.sequence.seances
                                                .sort((a, b) => a.numero - b.numero)
                                                .map((seance) => {
                                                  const fiche = trouverFiche(fiches, sequence, seance);
                                                  const idPreparation = cleSeance(sequence, seance.numero);
                                                  const estReservee =
                                                    !!fiche &&
                                                    tuilesPlanning.some(
                                                      (tuile) => tuile.preparedLessonId === fiche.id
                                                    );

                                                  return (
                                                    <article
                                                      key={`${sequence.id}-${seance.numero}`}
                                                      className="rounded-md border bg-white p-4"
                                                      style={{ borderColor: getDisciplineColor(sequence.domaine).border }}
                                                    >
                                                      <div className="flex flex-wrap items-start justify-between gap-3">
                                                        <div className="min-w-0 flex-1">
                                                          <label className="grid gap-1">
                                                            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                                              Séance {seance.numero}
                                                            </span>
                                                            <input
                                                              value={seance.titre}
                                                              onChange={(e) =>
                                                                modifierSeanceProgressionSauvegardee(
                                                                  sequence,
                                                                  seance.numero,
                                                                  { titre: e.target.value }
                                                                )
                                                              }
                                                              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-950 outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
                                                            />
                                                          </label>
                                                          <p className="mt-1 text-sm font-medium uppercase tracking-wide text-slate-500">
                                                            {seance.type}
                                                            {seance.duree_minutes ? ` · ${seance.duree_minutes} min` : ""}
                                                          </p>
                                                        </div>
                                                        {fiche ? (
                                                          <div className="flex flex-wrap gap-2">
                                                            <button
                                                              type="button"
                                                              onClick={() => setFicheEnModal(fiche)}
                                                              className="rounded-md border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-900 transition hover:bg-teal-100"
                                                            >
                                                              Voir la fiche
                                                            </button>
                                                            <button
                                                              type="button"
                                                              onClick={() => renvoyerEnReserve(fiche)}
                                                              disabled={estReservee}
                                                              className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
                                                            >
                                                              {estReservee ? "Réservée" : "Envoyer dans la réserve"}
                                                            </button>
                                                          </div>
                                                        ) : (
                                                          <button
                                                            type="button"
                                                            onClick={() => preparerSeance(sequence, seance)}
                                                            disabled={preparationEnCours === idPreparation}
                                                            className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-wait disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
                                                          >
                                                            {preparationEnCours === idPreparation
                                                              ? "Préparation..."
                                                              : "Préparer la séance"}
                                                          </button>
                                                        )}
                                                      </div>

                                                      {seance.beat && (
                                                        <dl className="mt-3 grid gap-2 text-sm text-slate-700">
                                                          <div>
                                                            <dt className="font-semibold text-slate-900">Amorce</dt>
                                                            <dd className="mt-0.5">{seance.beat.amorce}</dd>
                                                          </div>
                                                          <div>
                                                            <dt className="font-semibold text-slate-900">Recherche</dt>
                                                            <dd className="mt-0.5">{seance.beat.recherche}</dd>
                                                          </div>
                                                        </dl>
                                                      )}
                                                    </article>
                                                  );
                                                })}
                                  </div>
                                </details>
                              </TreeDisclosure>
                            ))}
                          </TreeDisclosure>
                        ))}
                      </TreeDisclosure>
                    );
                  })}
                </TreeDisclosure>
              ))}
            </TreeDisclosure>
          ))}
          </div>
        )}
      </section>

      {ficheEnModal && (
        <FicheSeanceModal
          open={!!ficheEnModal}
          lesson={ficheEnModal.lesson}
          onClose={() => setFicheEnModal(null)}
          onSave={(updated) => {
            modifierLessonSauvegardee(ficheEnModal, updated);
            setFicheEnModal({ ...ficheEnModal, lesson: updated });
          }}
          onGenerateStudentActivity={(lesson) => genererActiviteEleve(ficheEnModal, lesson)}
          studentActivityLoading={activiteEnCours === ficheEnModal.id}
          onGenerateCourse={(lesson) => genererCours(ficheEnModal, lesson)}
          courseLoading={coursEnCours === ficheEnModal.id}
          actions={
            <>
              <button
                type="button"
                onClick={() => imprimerFiche(ficheEnModal)}
                className="rounded-md bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-focus"
              >
                Imprimer
              </button>
              <button
                type="button"
                onClick={() => {
                  renvoyerEnReserve(ficheEnModal);
                  setFicheEnModal(null);
                }}
                disabled={tuilesPlanning.some((t) => t.preparedLessonId === ficheEnModal.id)}
                className="rounded-md bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-focus disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
              >
                {tuilesPlanning.some((t) => t.preparedLessonId === ficheEnModal.id)
                  ? "Réservée"
                  : "Envoyer dans la réserve"}
              </button>
            </>
          }
        />
      )}

      {activiteEnViewer && (
        <FicheEleveViewer
          open={!!activiteEnViewer}
          activite={activiteEnViewer}
          onClose={() => setActiviteEnViewer(null)}
        />
      )}

      {coursEnViewer && (
        <CoursViewer
          open={!!coursEnViewer}
          cours={coursEnViewer}
          onClose={() => setCoursEnViewer(null)}
          onSave={(updatedCourse) => {
            const updated = { ...coursEnViewer, course: updatedCourse };
            const prochainsCours = cours.map((c) => c.id === coursEnViewer.id ? updated : c);
            setCours(prochainsCours);
            writeUserData(COURSE_PRESENTATIONS_STORAGE_KEY, prochainsCours);
            setCoursEnViewer(updated);
          }}
          onPrint={() => imprimerCours(coursEnViewer.course)}
        />
      )}
    </main>
  );
}
