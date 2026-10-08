"use client";

import { useEffect, useMemo, useState } from "react";
import referentielBrut from "../../Référentiel_de_compétences.json";
import { readUserData, writeUserData } from "../lib/user-storage";
import { Classe, NIVEAUX_SCOLAIRES, lireClasses, niveauxEnseignes } from "../lib/classes";
import FicheSeanceModal from "../components/FicheSeanceModal";
import GeneratingLabel from "../components/GeneratingLabel";
import { escapeHtml, ouvrirEtImprimer, printBaseStyles, printDocumentHeader } from "../lib/print-document";
import type { CoursPresentation, CoursSauvegarde } from "../lib/course-types";

type LigneReferentielBrute = {
  Cycle: string;
  Niveau: string;
  Domaine: string;
  "Sous-domaine": string;
  Item: string;
  "Compétence": string;
};

type LigneReferentiel = {
  cycle: string;
  niveau: string;
  domaine: string;
  sousDomaine: string;
  item: string;
  competence: string;
};

type EtapeSelection = {
  id: keyof Selection;
  label: string;
  options: string[];
  disabled?: boolean;
};

type Selection = {
  cycle: string;
  niveau: string;
  domaine: string;
  sousDomaine: string;
  item: string;
  competence: string;
};

type Beat = {
  amorce: string;
  recherche: string;
  mise_en_commun: string;
  institutionnalisation: string | null;
  entrainement: string;
};

type Seance = {
  numero: number;
  type: string;
  titre: string;
  est_seance_cloture: boolean;
  duree_minutes: number;
  beat: Beat;
  tension_ouverte: string | null;
  materiel: string[];
  differenciation: {
    soutien: string;
    approfondissement: string;
  };
};

type Sequence = {
  titre: string;
  intention: string;
  regime: string;
  seances: Seance[];
};

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

type SeanceDetaillee = {
  titre: string;
  objectif: string;
  niveau: string;
  duree_minutes: number;
  materiel: string[];
  phases: PhaseSeanceDetaillee[];
  trace_ecrite: string;
  vigilance: string;
};

type TuilePlanning = {
  id: string;
  classeId?: string;
  preparedLessonId?: string;
  titreSequence: string;
  seanceLabel: string;
  domaine: string;
  dureeMinutes: number;
  lesson: SeanceDetaillee;
  day?: string;
  startMinute?: number;
};

type SeancePreparee = {
  id: string;
  classeId?: string;
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
  classeId?: string;
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

type SequencePreparee = {
  id: string;
  classeId?: string;
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

const PLANNING_STORAGE_KEY = "sage-planning-tiles";
const PREPARED_LESSONS_STORAGE_KEY = "sage-prepared-lessons";
const STUDENT_ACTIVITIES_STORAGE_KEY = "sage-student-activities";
const COURSE_PRESENTATIONS_STORAGE_KEY = "sage-course-presentations";
const SEQUENCES_STORAGE_KEY = "sage-sequences";

const selectionVide: Selection = {
  cycle: "",
  niveau: "",
  domaine: "",
  sousDomaine: "",
  item: "",
  competence: ""
};

const libelles: Record<keyof Selection, string> = {
  cycle: "Référentiel",
  niveau: "Niveau",
  domaine: "Domaine",
  sousDomaine: "Sous-domaine",
  item: "Item",
  competence: "Compétence"
};

const ordreSelection: Array<keyof Selection> = [
  "cycle",
  "niveau",
  "domaine",
  "sousDomaine",
  "item",
  "competence"
];

function valeursUniques(lignes: LigneReferentiel[], champ: keyof LigneReferentiel) {
  return Array.from(new Set(lignes.map((ligne) => ligne[champ]).filter(Boolean))).sort(
    (a, b) => a.localeCompare(b, "fr")
  );
}

function filtrerReferentiel(
  lignes: LigneReferentiel[],
  selection: Selection,
  jusquA?: keyof Selection
) {
  const limite = jusquA ? ordreSelection.indexOf(jusquA) : ordreSelection.length;
  return lignes.filter((ligne) =>
    ordreSelection.slice(0, limite).every((champ) => {
      const valeurSelectionnee = selection[champ];
      return !valeurSelectionnee || ligne[champ] === valeurSelectionnee;
    })
  );
}

function reinitialiserApresChamp(selection: Selection, champModifie: keyof Selection) {
  const prochainEtat = { ...selection };
  const indexChampModifie = ordreSelection.indexOf(champModifie);
  ordreSelection.slice(indexChampModifie + 1).forEach((champ) => {
    prochainEtat[champ] = "";
  });
  return prochainEtat;
}

export default function PagePreparation() {
  const [modePrompt, setModePrompt] = useState(false);
  const [promptLibre, setPromptLibre] = useState("");
  const [generationPromptEnCours, setGenerationPromptEnCours] = useState(false);
  const [selection, setSelection] = useState<Selection>(selectionVide);
  const [objectif, setObjectif] = useState("");
  const [sequence, setSequence] = useState<Sequence | null>(null);
  const [sequenceSauvegardeeId, setSequenceSauvegardeeId] = useState("");
  const [seanceDetaillee, setSeanceDetaillee] = useState<SeanceDetaillee | null>(null);
  const [seanceSource, setSeanceSource] = useState<Seance | null>(null);
  const [seancePrepareeId, setSeancePrepareeId] = useState("");
  const [seanceEnReserve, setSeanceEnReserve] = useState(false);
  const [messagePlanning, setMessagePlanning] = useState("");
  const [modalOuvert, setModalOuvert] = useState(false);
  const [erreur, setErreur] = useState("");
  const [generationEnCours, setGenerationEnCours] = useState(false);
  const [sequenceEnCours, setSequenceEnCours] = useState(false);
  const [seanceEnCours, setSeanceEnCours] = useState<number | null>(null);
  const [activiteEleveEnCours, setActiviteEleveEnCours] = useState(false);
  const [coursEnCours, setCoursEnCours] = useState(false);
  const [classes, setClasses] = useState<Classe[]>([]);
  const [classeId, setClasseId] = useState("");

  useEffect(() => {
    setClasses(lireClasses());
  }, []);

  const classeChoisie = classes.find((classe) => classe.id === classeId);
  const mesNiveaux = useMemo(
    () => classeChoisie?.niveaux ?? niveauxEnseignes(classes),
    [classeChoisie, classes]
  );
  const contexteClasse = classeChoisie
    ? { classeId: classeChoisie.id, niveauxClasse: classeChoisie.niveaux }
    : {};

  const referentiel = useMemo<LigneReferentiel[]>(
    () =>
      (referentielBrut as LigneReferentielBrute[]).map((ligne) => ({
        cycle: ligne.Cycle.trim(),
        niveau: ligne.Niveau.trim(),
        domaine: ligne.Domaine.trim(),
        sousDomaine: ligne["Sous-domaine"].trim(),
        item: ligne.Item.trim(),
        competence: ligne["Compétence"].trim()
      })),
    []
  );

  // Masque les niveaux scolaires que l'enseignant n'a pas déclarés dans ses classes.
  const referentielEnseigne = useMemo(
    () =>
      mesNiveaux.length === 0
        ? referentiel
        : referentiel.filter(
            (ligne) => !NIVEAUX_SCOLAIRES.includes(ligne.niveau) || mesNiveaux.includes(ligne.niveau)
          ),
    [referentiel, mesNiveaux]
  );

  useEffect(() => {
    function verifierSiSeancePlanifiee() {
      if (!seancePrepareeId) return;
      const tuilesExistantes = readUserData<TuilePlanning[]>(
        PLANNING_STORAGE_KEY,
        [],
        PLANNING_STORAGE_KEY
      );
      setSeanceEnReserve(
        tuilesExistantes.some((tuile) => tuile.preparedLessonId === seancePrepareeId)
      );
    }

    verifierSiSeancePlanifiee();
    window.addEventListener("focus", verifierSiSeancePlanifiee);
    document.addEventListener("visibilitychange", verifierSiSeancePlanifiee);
    return () => {
      window.removeEventListener("focus", verifierSiSeancePlanifiee);
      document.removeEventListener("visibilitychange", verifierSiSeancePlanifiee);
    };
  }, [seancePrepareeId]);

  const etapes: EtapeSelection[] = [
    { id: "cycle", label: libelles.cycle, options: valeursUniques(referentielEnseigne, "cycle") },
    {
      id: "niveau",
      label: libelles.niveau,
      options: valeursUniques(filtrerReferentiel(referentielEnseigne, selection, "niveau"), "niveau"),
      disabled: !selection.cycle
    },
    {
      id: "domaine",
      label: libelles.domaine,
      options: valeursUniques(filtrerReferentiel(referentielEnseigne, selection, "domaine"), "domaine"),
      disabled: !selection.niveau
    },
    {
      id: "sousDomaine",
      label: libelles.sousDomaine,
      options: valeursUniques(
        filtrerReferentiel(referentielEnseigne, selection, "sousDomaine"),
        "sousDomaine"
      ),
      disabled: !selection.domaine
    },
    {
      id: "item",
      label: libelles.item,
      options: valeursUniques(filtrerReferentiel(referentielEnseigne, selection, "item"), "item"),
      disabled: !selection.sousDomaine
    },
    {
      id: "competence",
      label: libelles.competence,
      options: valeursUniques(
        filtrerReferentiel(referentielEnseigne, selection, "competence"),
        "competence"
      ),
      disabled: !selection.item
    }
  ];

  function changerSelection(champ: keyof Selection, valeur: string) {
    setSelection((sel) => ({ ...reinitialiserApresChamp(sel, champ), [champ]: valeur }));
    setObjectif("");
    setSequence(null);
    setSequenceSauvegardeeId("");
    setSeanceDetaillee(null);
    setSeanceSource(null);
    setSeancePrepareeId("");
    setSeanceEnReserve(false);
    setMessagePlanning("");
    setErreur("");
  }

  async function genererSequenceDepuisPrompt() {
    if (!promptLibre.trim()) {
      setErreur("Entrez une description de la séquence souhaitée.");
      return;
    }

    setGenerationPromptEnCours(true);
    setErreur("");
    setSequence(null);
    setSequenceSauvegardeeId("");
    setSeanceDetaillee(null);
    setSeanceSource(null);
    setSeancePrepareeId("");
    setSeanceEnReserve(false);
    setMessagePlanning("");
    setObjectif("");

    try {
      const response = await fetch("/api/generate-sequence-from-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...contexteClasse,
          promptLibre: promptLibre.trim()
        })
      });

      const data = (await response.json()) as {
        contexte?: {
          cycle: string;
          niveau: string;
          domaine: string;
          sousDomaine: string;
          item: string;
          competence: string;
          objectif: string;
        };
        sequence?: Sequence;
        error?: string;
      };

      if (!response.ok || !data.sequence) {
        throw new Error(data.error ?? "Impossible de générer la séquence.");
      }

      const ctx = data.contexte ?? {
        cycle: "",
        niveau: "",
        domaine: "",
        sousDomaine: "",
        item: "",
        competence: "",
        objectif: ""
      };

      setSelection({
        cycle: ctx.cycle,
        niveau: ctx.niveau,
        domaine: ctx.domaine,
        sousDomaine: ctx.sousDomaine,
        item: ctx.item,
        competence: ctx.competence
      });
      setObjectif(ctx.objectif);

      const sequenceId = crypto.randomUUID();
      setSequence(data.sequence);
      setSequenceSauvegardeeId(sequenceId);

      const sequencesExistantes = readUserData<SequencePreparee[]>(
        SEQUENCES_STORAGE_KEY,
        [],
        SEQUENCES_STORAGE_KEY
      );
      writeUserData(SEQUENCES_STORAGE_KEY, [
        ...sequencesExistantes,
        {
          id: sequenceId,
          createdAt: new Date().toISOString(),
          classeId: classeChoisie?.id,
          cycle: ctx.cycle,
          niveau: ctx.niveau,
          domaine: ctx.domaine,
          sousDomaine: ctx.sousDomaine,
          item: ctx.item,
          competence: ctx.competence,
          objectif: ctx.objectif,
          sequence: data.sequence
        }
      ]);
    } catch (error) {
      setErreur(error instanceof Error ? error.message : "Une erreur inconnue est survenue.");
    } finally {
      setGenerationPromptEnCours(false);
    }
  }

  async function genererObjectif() {
    if (!selection.competence) {
      setErreur("Sélectionnez d'abord une compétence complète.");
      return;
    }

    setGenerationEnCours(true);
    setErreur("");
    setObjectif("");

    try {
      const response = await fetch("/api/generate-objective", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niveau: selection.niveau,
          domaine: selection.domaine,
          competence: selection.competence
        })
      });

      const data = (await response.json()) as { objectif?: string; error?: string };

      if (!response.ok || !data.objectif) {
        throw new Error(data.error ?? "Impossible de générer l'objectif.");
      }

      setObjectif(data.objectif);
      setSequence(null);
      setSequenceSauvegardeeId("");
      setSeanceDetaillee(null);
      setSeanceSource(null);
      setSeancePrepareeId("");
      setSeanceEnReserve(false);
      setMessagePlanning("");
    } catch (error) {
      setErreur(error instanceof Error ? error.message : "Une erreur inconnue est survenue.");
    } finally {
      setGenerationEnCours(false);
    }
  }

  async function genererSequence() {
    if (!objectif) {
      setErreur("Générez d'abord un objectif pédagogique.");
      return;
    }

    setSequenceEnCours(true);
    setErreur("");
    setSequence(null);
    setSequenceSauvegardeeId("");
    setSeanceDetaillee(null);
    setSeanceSource(null);
    setSeancePrepareeId("");
    setSeanceEnReserve(false);
    setMessagePlanning("");

    try {
      const response = await fetch("/api/generate-sequence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...contexteClasse,
          cycle: selection.cycle,
          niveau: selection.niveau,
          domaine: selection.domaine,
          sousDomaine: selection.sousDomaine,
          item: selection.item,
          competence: selection.competence,
          objectif,
          typeSequence: "introduction"
        })
      });

      const data = (await response.json()) as { sequence?: Sequence; error?: string };

      if (!response.ok || !data.sequence) {
        throw new Error(data.error ?? "Impossible de générer la séquence.");
      }

      const sequenceId = crypto.randomUUID();
      setSequence(data.sequence);
      setSequenceSauvegardeeId(sequenceId);
      const sequencesExistantes = readUserData<SequencePreparee[]>(
        SEQUENCES_STORAGE_KEY,
        [],
        SEQUENCES_STORAGE_KEY
      );
      writeUserData(SEQUENCES_STORAGE_KEY, [
        ...sequencesExistantes,
        {
          id: sequenceId,
          createdAt: new Date().toISOString(),
          classeId: classeChoisie?.id,
          cycle: selection.cycle,
          niveau: selection.niveau,
          domaine: selection.domaine,
          sousDomaine: selection.sousDomaine,
          item: selection.item,
          competence: selection.competence,
          objectif,
          sequence: data.sequence
        }
      ]);
    } catch (error) {
      setErreur(error instanceof Error ? error.message : "Une erreur inconnue est survenue.");
    } finally {
      setSequenceEnCours(false);
    }
  }

  async function genererSeance(seance: Seance) {
    if (!objectif) {
      setErreur("Générez d'abord un objectif pédagogique.");
      return;
    }

    setSeanceEnCours(seance.numero);
    setErreur("");
    setSeanceDetaillee(null);
    setSeanceSource(null);
    setSeancePrepareeId("");
    setSeanceEnReserve(false);
    setMessagePlanning("");

    try {
      const response = await fetch("/api/generate-lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...contexteClasse,
          cycle: selection.cycle,
          niveau: selection.niveau,
          domaine: selection.domaine,
          sousDomaine: selection.sousDomaine,
          item: selection.item,
          competence: selection.competence,
          objectifSequence: objectif,
          seance
        })
      });

      const data = (await response.json()) as { seance?: SeanceDetaillee; error?: string };

      if (!response.ok || !data.seance) {
        throw new Error(data.error ?? "Impossible de générer la séance.");
      }

      setSeanceDetaillee(data.seance);
      setSeanceSource(seance);
      setModalOuvert(true);

      if (sequence) {
        const id = crypto.randomUUID();
        const seancePreparee: SeancePreparee = {
          id,
          createdAt: new Date().toISOString(),
          classeId: classeChoisie?.id,
          cycle: selection.cycle,
          niveau: selection.niveau,
          domaine: selection.domaine,
          sousDomaine: selection.sousDomaine,
          item: selection.item,
          competence: selection.competence,
          sequenceTitle: sequence.titre,
          sequenceTotal: sequence.seances.length,
          seanceNumero: seance.numero,
          seanceType: seance.type,
          lesson: data.seance
        };

        const seancesExistantes = readUserData<SeancePreparee[]>(
          PREPARED_LESSONS_STORAGE_KEY,
          [],
          PREPARED_LESSONS_STORAGE_KEY
        );
        writeUserData(PREPARED_LESSONS_STORAGE_KEY, [...seancesExistantes, seancePreparee]);
        setSeancePrepareeId(id);
      }
    } catch (error) {
      setErreur(error instanceof Error ? error.message : "Une erreur inconnue est survenue.");
    } finally {
      setSeanceEnCours(null);
    }
  }

  function modifierSequence(prochaineSequence: Sequence) {
    setSequence(prochaineSequence);
    if (!sequenceSauvegardeeId) return;

    const sequencesExistantes = readUserData<SequencePreparee[]>(
      SEQUENCES_STORAGE_KEY,
      [],
      SEQUENCES_STORAGE_KEY
    );
    writeUserData(
      SEQUENCES_STORAGE_KEY,
      sequencesExistantes.map((s) =>
        s.id === sequenceSauvegardeeId ? { ...s, sequence: prochaineSequence } : s
      )
    );
  }

  function modifierSeance(numero: number, miseAJour: Partial<Seance>) {
    if (!sequence) return;
    modifierSequence({
      ...sequence,
      seances: sequence.seances.map((s) =>
        s.numero === numero ? { ...s, ...miseAJour } : s
      )
    });
  }

  function modifierBeat(numero: number, miseAJour: Partial<Beat>) {
    if (!sequence) return;
    modifierSequence({
      ...sequence,
      seances: sequence.seances.map((s) =>
        s.numero === numero ? { ...s, beat: { ...s.beat, ...miseAJour } } : s
      )
    });
  }

  function modifierSeanceDetaillee(prochaineSeance: SeanceDetaillee) {
    setSeanceDetaillee(prochaineSeance);
    if (!seancePrepareeId) return;

    const seancesExistantes = readUserData<SeancePreparee[]>(
      PREPARED_LESSONS_STORAGE_KEY,
      [],
      PREPARED_LESSONS_STORAGE_KEY
    );
    const tuilesExistantes = readUserData<TuilePlanning[]>(
      PLANNING_STORAGE_KEY,
      [],
      PLANNING_STORAGE_KEY
    );

    writeUserData(
      PREPARED_LESSONS_STORAGE_KEY,
      seancesExistantes.map((sp) =>
        sp.id === seancePrepareeId ? { ...sp, lesson: prochaineSeance } : sp
      )
    );
    writeUserData(
      PLANNING_STORAGE_KEY,
      tuilesExistantes.map((tuile) =>
        tuile.preparedLessonId === seancePrepareeId
          ? {
              ...tuile,
              titreSequence: sequence?.titre ?? tuile.titreSequence,
              dureeMinutes: prochaineSeance.duree_minutes,
              lesson: prochaineSeance
            }
          : tuile
      )
    );
  }

  function imprimerSeance() {
    if (!seanceDetaillee) return;
    const e = escapeHtml;
    const phasesHtml = seanceDetaillee.phases
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
<html lang="fr"><head><meta charset="UTF-8"><title>${e(seanceDetaillee.titre)}</title>
<style>${printBaseStyles()}</style></head><body>
  ${printDocumentHeader()}
  <div class="intro">
    <p class="label">Fiche de séance</p>
    <h1>${e(seanceDetaillee.titre)}</h1>
    <p class="subtitle">${[seanceSource ? `Séance ${seanceSource.numero}` : "", seanceDetaillee.niveau, `${seanceDetaillee.duree_minutes} min`].filter(Boolean).map(e).join(" · ")}</p>
    ${seanceDetaillee.objectif ? `<h3>Objectif</h3><p>${e(seanceDetaillee.objectif)}</p>` : ""}
    ${seanceDetaillee.materiel?.length ? `<h3>Matériel</h3><p>${seanceDetaillee.materiel.map(e).join(", ")}</p>` : ""}
  </div>
  ${phasesHtml}
  ${seanceDetaillee.trace_ecrite ? `<div class="section"><h2>Trace écrite</h2><p>${e(seanceDetaillee.trace_ecrite)}</p></div>` : ""}
  ${seanceDetaillee.vigilance ? `<div class="section"><h2>Vigilance</h2><p>${e(seanceDetaillee.vigilance)}</p></div>` : ""}
</body></html>`;
    ouvrirEtImprimer(html);
  }

  function planifierSeance() {
    if (!seanceDetaillee || !sequence || !seanceSource) {
      setErreur("Préparez d'abord une séance.");
      return;
    }

    if (seanceEnReserve) return;

    const tuile: TuilePlanning = {
      id: crypto.randomUUID(),
      preparedLessonId: seancePrepareeId || undefined,
      titreSequence: sequence.titre,
      seanceLabel: `${seanceSource.numero}/${sequence.seances.length}`,
      domaine: selection.domaine,
      dureeMinutes: seanceDetaillee.duree_minutes,
      lesson: seanceDetaillee,
      classeId: classeChoisie?.id
    };

    const tuilesExistantes = readUserData<TuilePlanning[]>(
      PLANNING_STORAGE_KEY,
      [],
      PLANNING_STORAGE_KEY
    );
    writeUserData(PLANNING_STORAGE_KEY, [...tuilesExistantes, tuile]);
    setSeanceEnReserve(true);
    setMessagePlanning("La séance a été envoyée dans la réserve du planning.");
  }

  async function genererActiviteEleve(lesson: SeanceDetaillee) {
    if (!sequence || !seanceSource) {
      setErreur("Préparez d'abord une séance.");
      return;
    }

    setActiviteEleveEnCours(true);
    setErreur("");
    setMessagePlanning("");

    try {
      const response = await fetch("/api/generate-student-activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...contexteClasse,
          cycle: selection.cycle,
          niveau: selection.niveau || lesson.niveau,
          domaine: selection.domaine,
          sousDomaine: selection.sousDomaine,
          item: selection.item,
          competence: selection.competence,
          sequenceTitle: sequence.titre,
          seanceNumero: seanceSource.numero,
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

      const activitesExistantes = readUserData<ActiviteEleveSauvegardee[]>(
        STUDENT_ACTIVITIES_STORAGE_KEY,
        [],
        STUDENT_ACTIVITIES_STORAGE_KEY
      );

      const prochaineActivite: ActiviteEleveSauvegardee = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        preparedLessonId: seancePrepareeId || undefined,
        classeId: classeChoisie?.id,
        cycle: selection.cycle,
        niveau: selection.niveau || lesson.niveau,
        domaine: selection.domaine,
        sousDomaine: selection.sousDomaine,
        item: selection.item,
        competence: selection.competence,
        sequenceTitle: sequence.titre,
        seanceNumero: seanceSource.numero,
        activity: data.activity
      };

      writeUserData(STUDENT_ACTIVITIES_STORAGE_KEY, [...activitesExistantes, prochaineActivite]);
      setMessagePlanning(`La fiche élève "${data.activity.titre}" a été rangée dans Activités.`);
    } catch (error) {
      setErreur(error instanceof Error ? error.message : "Une erreur inconnue est survenue.");
    } finally {
      setActiviteEleveEnCours(false);
    }
  }

  async function genererCours(lesson: SeanceDetaillee) {
    if (!sequence || !seanceSource) {
      setErreur("Préparez d'abord une séance.");
      return;
    }

    setCoursEnCours(true);
    setErreur("");
    setMessagePlanning("");

    try {
      const response = await fetch("/api/generate-course", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...contexteClasse,
          cycle: selection.cycle,
          niveau: selection.niveau || lesson.niveau,
          domaine: selection.domaine,
          sousDomaine: selection.sousDomaine,
          item: selection.item,
          competence: selection.competence,
          sequenceTitle: sequence.titre,
          seanceNumero: seanceSource.numero,
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

      const coursExistants = readUserData<CoursSauvegarde[]>(
        COURSE_PRESENTATIONS_STORAGE_KEY,
        [],
        COURSE_PRESENTATIONS_STORAGE_KEY
      );

      const prochainCours: CoursSauvegarde = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        preparedLessonId: seancePrepareeId || undefined,
        classeId: classeChoisie?.id,
        cycle: selection.cycle,
        niveau: selection.niveau || lesson.niveau,
        domaine: selection.domaine,
        sousDomaine: selection.sousDomaine,
        item: selection.item,
        competence: selection.competence,
        sequenceTitle: sequence.titre,
        seanceNumero: seanceSource.numero,
        course: data.course
      };

      writeUserData(COURSE_PRESENTATIONS_STORAGE_KEY, [...coursExistants, prochainCours]);
      setMessagePlanning(`Le cours "${data.course.titre}" a été rangé dans Cours.`);
    } catch (error) {
      setErreur(error instanceof Error ? error.message : "Une erreur inconnue est survenue.");
    } finally {
      setCoursEnCours(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
              Préparer une séquence
            </p>
            <h1 className="mt-2 text-3xl font-bold text-slate-950">
              {modePrompt ? "Génération par prompt" : "Sélectionner une compétence"}
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-slate-700">
              {modePrompt
                ? "Décrivez librement la séquence souhaitée. L'IA se charge du reste."
                : "Choisissez progressivement un référentiel, un niveau, un domaine, puis une compétence issue des programmes de l'Éducation Nationale."}
            </p>
          </div>
          <a
            href="/"
            className="rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-focus"
          >
            Tableau de bord
          </a>
        </div>

        <div className="mb-5 flex gap-2">
          <button
            type="button"
            onClick={() => { setModePrompt(false); setErreur(""); }}
            className={`rounded-md px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-focus ${!modePrompt ? "bg-teal-700 text-white shadow-sm" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            Par référentiel
          </button>
          <button
            type="button"
            onClick={() => { setModePrompt(true); setErreur(""); }}
            className={`rounded-md px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-focus ${modePrompt ? "bg-teal-700 text-white shadow-sm" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            Par prompt libre
          </button>
          {classes.length > 0 && (
            <label className="ml-auto flex items-center gap-2 text-sm font-semibold text-slate-800">
              Classe
              <select
                value={classeId}
                onChange={(e) => {
                  setClasseId(e.target.value);
                  changerSelection("cycle", "");
                }}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-950 shadow-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
              >
                <option value="">Toutes mes classes</option>
                {classes.map((classe) => (
                  <option key={classe.id} value={classe.id}>
                    {classe.nom} ({classe.niveaux.join(", ") || "aucun niveau"})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {modePrompt ? (
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-800">
                Décrivez la séquence souhaitée
              </span>
              <textarea
                value={promptLibre}
                onChange={(e) => setPromptLibre(e.target.value)}
                placeholder="Ex. : Prépare une séquence sur l'alimentation et la santé pour une classe de CM2 en 5 séances."
                rows={4}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base leading-7 text-slate-950 shadow-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-focus"
              />
            </label>
            {erreur && (
              <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-medium text-red-900">Erreur</p>
                <p className="mt-2 leading-7 text-red-950">{erreur}</p>
              </div>
            )}
            <button
              type="button"
              onClick={genererSequenceDepuisPrompt}
              disabled={generationPromptEnCours || !promptLibre.trim()}
              className="mt-4 w-full rounded-md bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-focus disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
            >
              <GeneratingLabel
                active={generationPromptEnCours}
                idleLabel="Générer la séquence"
                messages={[
                  "Lecture de votre demande...",
                  "Consultation du référentiel...",
                  "Construction de la progression..."
                ]}
              />
            </button>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
            <form className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="grid gap-4">
                {etapes.map((etape) => (
                  <label key={etape.id} className="grid min-w-0 gap-2">
                    <span className="text-sm font-medium text-slate-800">{etape.label}</span>
                    <select
                      value={selection[etape.id]}
                      disabled={etape.disabled}
                      onChange={(e) => changerSelection(etape.id, e.target.value)}
                      className="min-h-11 w-full min-w-0 max-w-full truncate rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-950 shadow-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-focus disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                    >
                      <option value="">Sélectionner...</option>
                      {etape.options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </form>

            <aside className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-bold text-slate-950">Résultat</h2>

              <div className="mt-4 rounded-md bg-slate-100 p-4">
                <p className="text-sm font-medium text-slate-700">Compétence sélectionnée</p>
                <p className="mt-2 break-words text-base leading-7 text-slate-950">
                  {selection.competence || "Aucune compétence sélectionnée pour le moment."}
                </p>
              </div>

              <button
                type="button"
                onClick={genererObjectif}
                disabled={generationEnCours}
                className="mt-5 w-full rounded-md bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-focus disabled:cursor-wait disabled:bg-teal-900/60"
              >
                <GeneratingLabel
                  active={generationEnCours}
                  idleLabel="Générer objectif"
                  messages={["Analyse de la compétence...", "Rédaction de l'objectif..."]}
                />
              </button>

              {erreur && (
                <div className="mt-5 rounded-md border border-red-200 bg-red-50 p-4">
                  <p className="text-sm font-medium text-red-900">Erreur</p>
                  <p className="mt-2 leading-7 text-red-950">{erreur}</p>
                </div>
              )}

              {objectif && (
                <div className="mt-5 rounded-md border border-teal-200 bg-teal-50 p-4">
                  <p className="text-sm font-medium text-teal-900">Objectif généré</p>
                  <p className="mt-2 leading-7 text-teal-950">{objectif}</p>
                </div>
              )}

              <button
                type="button"
                onClick={genererSequence}
                disabled={!objectif || sequenceEnCours}
                className="mt-5 w-full rounded-md bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-focus disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
              >
                <GeneratingLabel
                  active={sequenceEnCours}
                  idleLabel="Créer la progression de séquence"
                  messages={["Répartition des séances...", "Structuration de la progression..."]}
                />
              </button>
            </aside>
          </div>
        )}

        {sequence && (
          <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="border-b border-slate-200 pb-4">
              <div className="flex items-center gap-3">
                <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
                  Progression de séquence
                </p>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {sequence.regime}
                </span>
              </div>
              <label className="mt-2 grid gap-2">
                <span className="text-sm font-semibold text-slate-700">Titre de la séquence</span>
                <input
                  value={sequence.titre}
                  onChange={(e) => modifierSequence({ ...sequence, titre: e.target.value })}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-2xl font-bold text-slate-950 outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
                />
              </label>
              <label className="mt-3 grid gap-2">
                <span className="text-sm font-semibold text-slate-700">Intention générale</span>
                <textarea
                  value={sequence.intention}
                  onChange={(e) => modifierSequence({ ...sequence, intention: e.target.value })}
                  className="min-h-20 w-full rounded-md border border-slate-300 bg-white px-3 py-2 leading-7 text-slate-700 outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
                />
              </label>
            </div>

            <div className="mt-5 grid gap-4">
              {sequence.seances.map((seance) => (
                <article
                  key={`${seance.numero}-${seance.titre}`}
                  className="rounded-md border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full bg-teal-700 px-3 py-1 text-sm font-semibold text-white">
                      Séance {seance.numero}
                    </span>
                    <span className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                      {seance.type}
                    </span>
                    <span className="text-sm text-slate-500">{seance.duree_minutes} min</span>
                    {seance.est_seance_cloture && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                        Clôture
                      </span>
                    )}
                  </div>

                  <label className="mt-3 grid gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Titre</span>
                    <input
                      value={seance.titre}
                      onChange={(e) => modifierSeance(seance.numero, { titre: e.target.value })}
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-lg font-semibold text-slate-950 outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
                    />
                  </label>

                  <dl className="mt-3 grid gap-3 text-sm leading-6 text-slate-800">
                    <div>
                      <dt className="font-semibold text-slate-950">Amorce</dt>
                      <dd>
                        <textarea
                          value={seance.beat.amorce}
                          onChange={(e) => modifierBeat(seance.numero, { amorce: e.target.value })}
                          className="mt-1 min-h-16 w-full rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
                        />
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-slate-950">Recherche</dt>
                      <dd>
                        <textarea
                          value={seance.beat.recherche}
                          onChange={(e) => modifierBeat(seance.numero, { recherche: e.target.value })}
                          className="mt-1 min-h-16 w-full rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
                        />
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-slate-950">Mise en commun</dt>
                      <dd>
                        <textarea
                          value={seance.beat.mise_en_commun}
                          onChange={(e) => modifierBeat(seance.numero, { mise_en_commun: e.target.value })}
                          className="mt-1 min-h-16 w-full rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
                        />
                      </dd>
                    </div>
                    {seance.est_seance_cloture && seance.beat.institutionnalisation !== null && (
                      <div>
                        <dt className="font-semibold text-slate-950">Institutionnalisation</dt>
                        <dd>
                          <textarea
                            value={seance.beat.institutionnalisation ?? ""}
                            onChange={(e) =>
                              modifierBeat(seance.numero, { institutionnalisation: e.target.value })
                            }
                            className="mt-1 min-h-16 w-full rounded-md border border-teal-200 bg-teal-50 px-3 py-2 outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
                          />
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt className="font-semibold text-slate-950">Entraînement</dt>
                      <dd>
                        <textarea
                          value={seance.beat.entrainement}
                          onChange={(e) => modifierBeat(seance.numero, { entrainement: e.target.value })}
                          className="mt-1 min-h-16 w-full rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
                        />
                      </dd>
                    </div>
                  </dl>

                  {!seance.est_seance_cloture && seance.tension_ouverte && (
                    <p className="mt-3 rounded-md bg-blue-50 px-3 py-2 text-base text-blue-900">
                      <span className="font-semibold">Tension ouverte : </span>
                      {seance.tension_ouverte}
                    </p>
                  )}

                  {(seance.differenciation.soutien || seance.differenciation.approfondissement) && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {seance.differenciation.soutien && (
                        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
                          <span className="font-semibold block">Soutien</span>
                          {seance.differenciation.soutien}
                        </p>
                      )}
                      {seance.differenciation.approfondissement && (
                        <p className="rounded-md bg-purple-50 px-3 py-2 text-xs text-purple-900">
                          <span className="font-semibold block">Approfondissement</span>
                          {seance.differenciation.approfondissement}
                        </p>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => genererSeance(seance)}
                    disabled={seanceEnCours !== null}
                    className="mt-4 min-w-[220px] rounded-md bg-teal-700 px-4 py-2 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-focus disabled:cursor-wait disabled:bg-teal-900/60"
                  >
                    <GeneratingLabel
                      active={seanceEnCours === seance.numero}
                      idleLabel="Préparer cette séance"
                      messages={["Structuration des phases...", "Vérification du matériel..."]}
                    />
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}

        {seanceDetaillee && (
          <FicheSeanceModal
            open={modalOuvert}
            lesson={seanceDetaillee}
            onClose={() => setModalOuvert(false)}
            onSave={modifierSeanceDetaillee}
            onGenerateStudentActivity={genererActiviteEleve}
            studentActivityLoading={activiteEleveEnCours}
            onGenerateCourse={genererCours}
            courseLoading={coursEnCours}
            actions={
              <>
                {messagePlanning && (
                  <p className="w-full text-base text-teal-700">{messagePlanning}</p>
                )}
                <button
                  type="button"
                  onClick={imprimerSeance}
                  className="rounded-md bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-focus"
                >
                  Exporter en PDF
                </button>
                <button
                  type="button"
                  onClick={planifierSeance}
                  disabled={seanceEnReserve}
                  className="rounded-md bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-focus disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
                >
                  {seanceEnReserve ? "Réservée" : "Planifier"}
                </button>
                <a
                  href="/planning"
                  className="rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-focus"
                >
                  Ouvrir le planning
                </a>
                <a
                  href="/bibliotheque"
                  className="rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-focus"
                >
                  Voir la bibliothèque
                </a>
              </>
            }
          />
        )}
      </section>
    </main>
  );
}
