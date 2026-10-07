"use client";

import { DragEvent, Fragment, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { readUserData, writeUserData } from "../lib/user-storage";
import { getDisciplineColor } from "../lib/discipline-colors";
import FicheSeanceModal, { type SeanceDetaillee } from "../components/FicheSeanceModal";
import { Classe, NIVEAUX_SCOLAIRES, appartientALaClasse, lireClasses, niveauxEnseignes } from "../lib/classes";

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
  date?: string;
  startMinute?: number;
};

type ZoneCognitive = {
  id: string;
  day: string;
  date: string;
  startMinute: number;
  dureeMinutes: number;
  domaine: string;
  titre: string;
  intention: string;
};

const STORAGE_KEY = "sage-planning-tiles";
const PREPARED_LESSONS_STORAGE_KEY = "sage-prepared-lessons";
const ZONES_STORAGE_KEY = "sage-planning-cognitive-zones";
const jours = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];
const debutJournee = 8 * 60;
const finJournee = 17 * 60;
const pasMinutes = 5;
const hauteurTranche = 12;
const nombreTranches = (finJournee - debutJournee) / pasMinutes;

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function lundiDeLaSemaine(date: Date) {
  const copie = new Date(date);
  const jour = copie.getDay();
  const decalage = jour === 0 ? -6 : 1 - jour;
  copie.setDate(copie.getDate() + decalage);
  copie.setHours(0, 0, 0, 0);
  return copie;
}

function datesDeLaSemaine(lundi: string) {
  const dateLundi = new Date(`${lundi}T00:00:00`);
  return jours.map((jour, index) => {
    const date = new Date(dateLundi);
    date.setDate(dateLundi.getDate() + index);
    return {
      jour,
      date: formatDateInput(date),
      label: date.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit"
      })
    };
  });
}

function lireTuiles() {
  return readUserData<TuilePlanning[]>(STORAGE_KEY, [], STORAGE_KEY);
}

function lireZonesCognitives() {
  return readUserData<ZoneCognitive[]>(ZONES_STORAGE_KEY, [], ZONES_STORAGE_KEY);
}

// Garde la séance entière dans la journée, calée sur la grille de 5 min.
function bornerDebut(minute: number, dureeMinutes: number) {
  const dernierDebut = finJournee - Math.min(dureeMinutes, finJournee - debutJournee);
  const cale = Math.round(minute / pasMinutes) * pasMinutes;
  return Math.max(debutJournee, Math.min(dernierDebut, cale));
}

function formatHeure(minutesDepuisMinuit: number) {
  const heures = Math.floor(minutesDepuisMinuit / 60);
  const minutes = minutesDepuisMinuit % 60;
  return `${heures.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

function libelleDuree(minutes: number) {
  return minutes + " min";
}

type ModeleJour = { day: string; zones: [number, number, string, string, string][] };

// Écoles : CP à CM2 (le cycle 2 voit ses créneaux plafonnés à 40 min, voir dureeMaxCycle2).
const modelesElementaire: ModeleJour[] = [
  { day: "Lundi", zones: [[525, 20, "Français", "Mise en route", "Rituels, oral, rappel"], [545, 45, "Français", "Lecture / écriture", "Pic attentionnel pour les fondamentaux"], [590, 45, "Mathématiques", "Résolution / calcul", "Deuxième temps cognitif fort"], [650, 40, "Français", "Étude de la langue", "Retour au cognitif après respiration"], [810, 60, "Arts plastiques", "Temps créatif", "Creux post-méridien : activité moins abstraite"], [900, 60, "Sciences et technologie", "Ateliers / manipulation", "Second plateau attentionnel"], [960, 45, "Enseignement moral et civique", "Synthèse / vie de classe", "Fin de journée plus légère"]] },
  { day: "Mardi", zones: [[525, 20, "Français", "Rituels de lecture", "Entrée progressive"], [545, 45, "Mathématiques", "Recherche / raisonnement", "Créneau cognitif fort"], [590, 45, "Français", "Production d'écrit", "Fondamental placé le matin"], [650, 40, "Éducation physique et sportive", "Respiration motrice", "Alternance effort / mouvement"], [810, 60, "Questionner le monde", "Projet / observation", "Après-midi concret"], [900, 60, "Arts plastiques", "Création", "Activité expressive"], [960, 45, "Langues vivantes", "Oral / jeux", "Fin de journée interactive"]] },
  { day: "Mercredi", zones: [[525, 25, "Français", "Réactivation", "Consolider sans surcharge"], [550, 45, "Mathématiques", "Entraînement", "Matinée courte de consolidation"], [595, 45, "Français", "Lecture compréhension", "Fondamental maintenu le matin"], [650, 40, "Enseignement moral et civique", "Bilan / coopération", "Clôture plus légère"]] },
  { day: "Jeudi", zones: [[525, 20, "Français", "Mise en route", "Rituels stabilisants"], [545, 45, "Français", "Lecture / écriture", "Troisième matinée forte"], [590, 45, "Mathématiques", "Problèmes", "Créneau de raisonnement"], [650, 40, "Éducation physique et sportive", "Respiration", "Bénéfice attentionnel"], [810, 60, "Éducation musicale", "Écoute / pratique", "Activité sensible après déjeuner"], [900, 60, "Histoire et géographie", "Document / récit", "Cognitif modéré"], [960, 45, "Sciences et technologie", "Manipulation courte", "Fin de journée concrète"]] },
  { day: "Vendredi", zones: [[525, 20, "Français", "Rituels", "Matinée intermédiaire"], [545, 45, "Mathématiques", "Réinvestissement", "Fondamental placé le matin"], [590, 45, "Français", "Bilan / écriture", "Consolidation"], [650, 40, "Langues vivantes", "Oral", "Transition plus légère"], [810, 60, "Arts plastiques", "Projet", "Après-midi créatif"], [900, 60, "Éducation physique et sportive", "Activité motrice", "Mobilisation sans surcharge"], [960, 45, "Enseignement moral et civique", "Bilan hebdomadaire", "Clôture de semaine"]] }
];

function modelesMaternelle(niveau: string): ModeleJour[] {
  const matin: ModeleJour["zones"] = [
    [510, 20, "Langage oral et écrit", "Accueil / rituels", "Séparation en douceur, entrée progressive"],
    [530, 20, "Langage oral et écrit", "Regroupement", "Attention collective courte (15-20 min)"],
    [555, 30, "Premiers outils mathématiques", "Ateliers dirigés", "Pic attentionnel du matin, petits groupes"],
    [630, 30, "Activités physiques", "Motricité", "Besoin de mouvement après la récréation"],
    [665, 20, "Langage oral et écrit", "Comptines / albums", "Retour au calme avant le repas"]
  ];
  const apresMidi: ModeleJour["zones"] =
    niveau === "PS"
      ? [
          [810, 90, "Repos", "Sieste", "Besoin de sommeil des plus petits"],
          [915, 30, "Découvrir le monde", "Ateliers de manipulation", "Réveil échelonné, activités courtes"],
          [960, 20, "Langage oral et écrit", "Regroupement de fin de journée", "Se rappeler la journée"]
        ]
      : [
          [810, niveau === "MS" ? 30 : 20, "Repos", "Temps calme", "Écoute, relaxation après le repas"],
          [850, 40, "Découvrir le monde", "Ateliers / manipulation", "Second temps d'apprentissage"],
          [915, 30, "Activités artistiques", "Création", "Activité sensible de l'après-midi"],
          [960, 25, "Langage oral et écrit", niveau === "GS" ? "Phonologie / graphisme" : "Langage", "Fin de journée courte et ritualisée"]
        ];
  return jours.map((day) => ({ day, zones: day === "Mercredi" ? matin : [...matin, ...apresMidi] }));
}

// Collège : heures de 55 min, vigilance adolescente plus tardive le matin.
function modelesCollege(): ModeleJour[] {
  const matin: ModeleJour["zones"] = [
    [480, 55, "Attention moyenne", "Démarrage", "Vigilance encore basse : réactivation, oral, rappels"],
    [540, 55, "Attention forte", "Montée de la vigilance", "Bon créneau pour une notion nouvelle"],
    [615, 55, "Attention forte", "Pic attentionnel", "Notions exigeantes, évaluations"],
    [675, 55, "Attention moyenne", "Entraînement", "Exercices, recherche guidée"]
  ];
  const apresMidi: ModeleJour["zones"] = [
    [810, 55, "Attention faible", "Creux post-prandial", "Pratique, oral, travail de groupe"],
    [870, 55, "Attention moyenne", "Reprise", "Activités variées, manipulation"],
    [945, 55, "Attention forte", "Second pic", "Approfondissement, tâches complexes"]
  ];
  return jours.map((day) => ({ day, zones: day === "Mercredi" ? matin : [...matin, ...apresMidi] }));
}

function modelesPourNiveau(niveau: string) {
  if (["PS", "MS", "GS"].includes(niveau)) return modelesMaternelle(niveau);
  if (["6ème", "5ème", "4ème", "3ème"].includes(niveau)) return modelesCollege();
  return modelesElementaire;
}

const dureeMaxCycle2 = 40;

// Classe multi-niveaux : on suit le rythme du plus jeune niveau.
function niveauDeReference(niveaux: string[]) {
  return NIVEAUX_SCOLAIRES.find((niveau) => niveaux.includes(niveau)) ?? "";
}

function genererZonesCognitives(joursSemaine: ReturnType<typeof datesDeLaSemaine>, niveau: string) {
  const modeles = modelesPourNiveau(niveau);
  const dureeMax = ["CP", "CE1", "CE2"].includes(niveau) ? dureeMaxCycle2 : Infinity;

  return modeles.flatMap((modele) => {
    const jour = joursSemaine.find((item) => item.jour === modele.day);
    if (!jour) {
      return [];
    }

    return modele.zones.map(([startMinute, dureeMinutes, domaine, titre, intention], index) => ({
      id: jour.date + "-" + modele.day + "-" + index,
      day: modele.day,
      date: jour.date,
      startMinute,
      dureeMinutes: Math.min(dureeMinutes, dureeMax),
      domaine,
      titre,
      intention
    }));
  });
}

export default function PlanningPage() {
  const [tuiles, setTuiles] = useState<TuilePlanning[]>([]);
  const [zonesCognitives, setZonesCognitives] = useState<ZoneCognitive[]>([]);
  const [afficherZones, setAfficherZones] = useState(true);
  const [tuileSelectionneeId, setTuileSelectionneeId] = useState("");
  const [classes, setClasses] = useState<Classe[]>([]);
  const [classeFiltreId, setClasseFiltreId] = useState("");
  const [niveauFiltre, setNiveauFiltre] = useState("");
  const [ficheOuverteId, setFicheOuverteId] = useState("");
  const [semaineDebut, setSemaineDebut] = useState(() => formatDateInput(lundiDeLaSemaine(new Date())));
  const joursAvecDates = useMemo(() => datesDeLaSemaine(semaineDebut), [semaineDebut]);

  const heures = useMemo(
    () =>
      Array.from({ length: 10 }, (_, index) => {
        const heure = 8 + index;
        return {
          label: `${heure.toString().padStart(2, "0")}:00`,
          top: (heure * 60 - debutJournee) / pasMinutes
        };
      }),
    []
  );

  useEffect(() => {
    const tuilesAvecDates = lireTuiles().map((tuile) => {
        if (!tuile.day || tuile.date) {
          return tuile;
        }

        const dateDuJour = joursAvecDates.find((jour) => jour.jour === tuile.day)?.date;
        return {
          ...tuile,
          date: dateDuJour
        };
      });

    setTuiles(tuilesAvecDates);
    setClasses(lireClasses());
    setZonesCognitives(lireZonesCognitives());
    writeUserData(STORAGE_KEY, tuilesAvecDates);
  }, [joursAvecDates]);

  // Flèches et molette déplacent par petits pas : on regroupe les sauvegardes.
  const sauvegardeEnAttente = useRef<{ timer: number; tuiles: TuilePlanning[] } | null>(null);

  function enregistrer(nouvellesTuiles: TuilePlanning[]) {
    // Une sauvegarde immédiate remplace une sauvegarde différée encore en attente (plus ancienne).
    if (sauvegardeEnAttente.current) window.clearTimeout(sauvegardeEnAttente.current.timer);
    sauvegardeEnAttente.current = null;
    setTuiles(nouvellesTuiles);
    writeUserData(STORAGE_KEY, nouvellesTuiles);
  }

  function enregistrerDiffere(nouvellesTuiles: TuilePlanning[]) {
    setTuiles(nouvellesTuiles);
    if (sauvegardeEnAttente.current) window.clearTimeout(sauvegardeEnAttente.current.timer);
    sauvegardeEnAttente.current = {
      tuiles: nouvellesTuiles,
      timer: window.setTimeout(() => {
        sauvegardeEnAttente.current = null;
        writeUserData(STORAGE_KEY, nouvellesTuiles);
      }, 400)
    };
  }

  useEffect(
    () => () => {
      const enAttente = sauvegardeEnAttente.current;
      if (enAttente) {
        window.clearTimeout(enAttente.timer);
        writeUserData(STORAGE_KEY, enAttente.tuiles);
      }
    },
    []
  );

  function deplacerTuile(id: string, deltaMinutes: number, deltaJours: number) {
    const tuile = tuiles.find((item) => item.id === id);
    if (!tuile?.day) return;
    const jour = joursAvecDates[jours.indexOf(tuile.day) + deltaJours];
    if (!jour) return;
    const startMinute = bornerDebut((tuile.startMinute ?? debutJournee) + deltaMinutes, tuile.dureeMinutes);

    enregistrerDiffere(
      tuiles.map((item) =>
        item.id === id ? { ...item, day: jour.jour, date: jour.date, startMinute } : item
      )
    );
    if (deltaJours !== 0) {
      // La carte change de colonne et perd le focus : on le lui rend.
      window.setTimeout(() => document.querySelector<HTMLElement>(`[data-tuile-id="${id}"]`)?.focus());
    }
  }

  function enregistrerFiche(tuile: TuilePlanning, lesson: SeanceDetaillee) {
    if (JSON.stringify(lesson) === JSON.stringify(tuile.lesson)) return;
    enregistrer(tuiles.map((item) => (item.id === tuile.id ? { ...item, lesson } : item)));

    if (tuile.preparedLessonId) {
      const fiches = readUserData<{ id: string; lesson: SeanceDetaillee }[]>(PREPARED_LESSONS_STORAGE_KEY, []);
      writeUserData(
        PREPARED_LESSONS_STORAGE_KEY,
        fiches.map((fiche) => (fiche.id === tuile.preparedLessonId ? { ...fiche, lesson } : fiche))
      );
    }
  }

  function gererClavierTuile(event: KeyboardEvent, tuile: TuilePlanning) {
    if (ficheOuverteId) return;
    const pas = event.shiftKey ? 15 : pasMinutes;
    const deplacements: Record<string, [number, number]> = {
      ArrowUp: [-pas, 0],
      ArrowDown: [pas, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1]
    };
    const deplacement = deplacements[event.key];

    if (deplacement) {
      event.preventDefault();
      deplacerTuile(tuile.id, ...deplacement);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      remettreEnReserve(tuile.id);
    } else if (event.key === "Enter") {
      event.preventDefault();
      setFicheOuverteId(tuile.id);
    }
  }

  function placerDepuisReserve(event: KeyboardEvent, tuile: TuilePlanning) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    const lundi = joursAvecDates[0];
    enregistrer(
      tuiles.map((item) =>
        item.id === tuile.id
          ? { ...item, day: lundi.jour, date: lundi.date, startMinute: bornerDebut(debutJournee + 30, item.dureeMinutes) }
          : item
      )
    );
    setTuileSelectionneeId(tuile.id);
    // La carte réapparaît dans la grille : on lui redonne le focus pour enchaîner aux flèches.
    window.setTimeout(() => document.querySelector<HTMLElement>(`[data-tuile-id="${tuile.id}"]`)?.focus());
  }

  // Molette sur une carte placée : ±5 min par cran. Écouteur non passif pour bloquer le défilement de la page.
  const grilleRef = useRef<HTMLDivElement>(null);
  const cumulMolette = useRef(0);
  const deplacerTuileRef = useRef(deplacerTuile);
  deplacerTuileRef.current = deplacerTuile;

  useEffect(() => {
    const grille = grilleRef.current;
    if (!grille) return;

    function surMolette(event: WheelEvent) {
      const carte = (event.target as HTMLElement).closest<HTMLElement>("[data-tuile-id]");
      if (!carte?.dataset.tuileId) return;
      event.preventDefault();
      // Souris : un événement par cran (delta variable selon l'OS/zoom) = un pas.
      // Pavé tactile : petits deltas continus qu'on cumule.
      let crans: number;
      if (event.deltaMode !== 0 || Math.abs(event.deltaY) >= 50) {
        crans = Math.sign(event.deltaY);
        cumulMolette.current = 0;
      } else {
        cumulMolette.current += event.deltaY;
        crans = Math.trunc(cumulMolette.current / 50);
        cumulMolette.current -= crans * 50;
      }
      if (crans === 0) return;
      deplacerTuileRef.current(carte.dataset.tuileId, crans * pasMinutes, 0);
    }

    grille.addEventListener("wheel", surMolette, { passive: false });
    return () => grille.removeEventListener("wheel", surMolette);
  }, []);

  // Décalage entre le haut de la carte et le point saisi, pour que la carte ne « saute » pas au dépôt.
  // Un clic ailleurs que sur une carte, son bouton « Voir la fiche » ou le panneau latéral désélectionne.
  useEffect(() => {
    function surClic(event: MouseEvent) {
      if (!(event.target as HTMLElement).closest("[data-tuile-id], [data-garde-selection]")) {
        setTuileSelectionneeId("");
      }
    }
    document.addEventListener("mousedown", surClic);
    return () => document.removeEventListener("mousedown", surClic);
  }, []);

  const decalageSaisie = useRef(0);

  function commencerGlisser(event: DragEvent<HTMLElement>, id: string, depuisGrille = false) {
    event.dataTransfer.setData("text/plain", id);
    event.dataTransfer.effectAllowed = "move";
    decalageSaisie.current = depuisGrille
      ? event.clientY - event.currentTarget.getBoundingClientRect().top
      : 0;
  }

  function deposerDansJour(event: DragEvent<HTMLDivElement>, jour: string, date: string) {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain");
    const rectangle = event.currentTarget.getBoundingClientRect();
    const positionY = event.clientY - rectangle.top - decalageSaisie.current;
    const minuteVisee = debutJournee + (positionY / hauteurTranche) * pasMinutes;

    enregistrer(
      tuiles.map((tuile) =>
        tuile.id === id
          ? {
              ...tuile,
              day: jour,
              date,
              startMinute: bornerDebut(minuteVisee, tuile.dureeMinutes)
            }
          : tuile
      )
    );
  }

  function remettreEnReserve(id: string) {
    enregistrer(
      tuiles.map((tuile) =>
        tuile.id === id
          ? {
              ...tuile,
              day: undefined,
              date: undefined,
              startMinute: undefined
            }
          : tuile
      )
    );
  }

  function supprimerTuile(id: string) {
    enregistrer(tuiles.filter((tuile) => tuile.id !== id));
    if (tuileSelectionneeId === id) {
      setTuileSelectionneeId("");
    }
  }

  function creerReperesCognitifs() {
    const nouvellesZones = genererZonesCognitives(joursAvecDates, niveauReperes);
    setZonesCognitives(nouvellesZones);
    writeUserData(ZONES_STORAGE_KEY, nouvellesZones);
    setAfficherZones(true);
  }

  function effacerReperesCognitifs() {
    setZonesCognitives([]);
    writeUserData(ZONES_STORAGE_KEY, []);
  }

  const classeFiltree = classes.find((classe) => classe.id === classeFiltreId);
  const niveauxDisponibles = classeFiltree?.niveaux ?? niveauxEnseignes(classes);
  const niveauReperes = niveauFiltre || niveauDeReference(niveauxDisponibles);
  const tuilesVisibles = tuiles.filter(
    (tuile) =>
      (!classeFiltree ||
        appartientALaClasse({ classeId: tuile.classeId, niveau: tuile.lesson.niveau }, classeFiltree)) &&
      (!niveauFiltre || tuile.lesson.niveau === niveauFiltre)
  );
  const tuilesReserve = tuilesVisibles.filter((tuile) => !tuile.day);
  const tuileSelectionnee = tuiles.find((tuile) => tuile.id === tuileSelectionneeId);
  const ficheOuverte = tuiles.find((tuile) => tuile.id === ficheOuverteId);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
              Planning
            </p>
            <h1 className="mt-2 text-3xl font-bold text-slate-950">Organiser la semaine</h1>
            <p className="mt-2 max-w-2xl leading-7 text-slate-700">
              Glissez les séances depuis la réserve vers le planning. Une tranche représente 5
              minutes. Pour ajuster une séance placée : molette de la souris sur la carte, ou
              sélectionnez-la et utilisez les flèches (↑↓ 5 min, Maj + ↑↓ 15 min, ←→ jour).
            </p>
            <label className="mt-4 grid max-w-xs gap-2">
              <span className="text-sm font-semibold text-slate-800">Semaine du lundi</span>
              <input
                type="date"
                value={semaineDebut}
                onChange={(event) => setSemaineDebut(formatDateInput(lundiDeLaSemaine(new Date(`${event.target.value}T00:00:00`))))}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
              />
            </label>
            {classes.length > 0 && (
              <label className="mt-4 grid max-w-xs gap-2">
                <span className="text-sm font-semibold text-slate-800">Classe</span>
                <select
                  value={classeFiltreId}
                  onChange={(event) => {
                    setClasseFiltreId(event.target.value);
                    setNiveauFiltre("");
                  }}
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
            {niveauxDisponibles.length > 1 && (
              <label className="mt-4 grid max-w-xs gap-2">
                <span className="text-sm font-semibold text-slate-800">Niveau</span>
                <select
                  value={niveauFiltre}
                  onChange={(event) => setNiveauFiltre(event.target.value)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
                >
                  <option value="">Tous les niveaux</option>
                  {niveauxDisponibles.map((niveau) => (
                    <option key={niveau} value={niveau}>
                      {niveau}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={creerReperesCognitifs} className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800">
                Générer les repères cognitifs{niveauReperes ? ` (${niveauReperes})` : ""}
              </button>
              <button type="button" onClick={() => setAfficherZones((value) => !value)} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100">
                {afficherZones ? "Masquer les repères" : "Afficher les repères"}
              </button>
              <button type="button" onClick={effacerReperesCognitifs} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100">
                Effacer
              </button>
            </div>
          </div>

        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div ref={grilleRef} className="grid w-full min-w-0 grid-cols-[56px_repeat(5,minmax(0,1fr))]">
              <div />
              {joursAvecDates.map(({ jour, label }) => (
                <div
                  key={jour}
                  className="truncate border-b border-slate-200 px-1 pb-3 text-center text-sm font-semibold text-slate-950"
                >
                  <span>{jour}</span>
                  <span className="block text-xs font-medium text-slate-500">{label}</span>
                </div>
              ))}

              <div
                className="relative border-r border-slate-200"
                style={{ height: nombreTranches * hauteurTranche }}
              >
                {heures.map((heure) => (
                  <div
                    key={heure.label}
                    className="absolute left-0 right-1 -translate-y-2 text-right text-xs text-slate-500"
                    style={{ top: heure.top * hauteurTranche }}
                  >
                    {heure.label}
                  </div>
                ))}
              </div>

              {joursAvecDates.map(({ jour, date }) => (
                <div
                  key={jour}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => deposerDansJour(event, jour, date)}
                  className="relative border-b border-r border-slate-200 bg-[linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)]"
                  style={{
                    height: nombreTranches * hauteurTranche,
                    backgroundSize: `100% ${hauteurTranche}px`
                  }}
                >
                  {afficherZones && zonesCognitives
                    .filter((zone) => zone.date === date && zone.day === jour)
                    .map((zone) => {
                      const top = ((zone.startMinute - debutJournee) / pasMinutes) * hauteurTranche;
                      const height = Math.max(hauteurTranche, (zone.dureeMinutes / pasMinutes) * hauteurTranche);
                      const couleur = getDisciplineColor(zone.domaine);

                      return (
                        <div
                          key={zone.id}
                          className="pointer-events-none absolute left-1 right-1 overflow-hidden rounded-md border border-dashed px-1.5 py-1 text-xs"
                          style={{
                            top,
                            height,
                            backgroundColor: couleur.softBackground,
                            borderColor: couleur.border,
                            color: couleur.text,
                            opacity: 0.72
                          }}
                          title={zone.intention}
                        >
                          <p className="truncate font-bold">{zone.titre}</p>
                          <p className="truncate">{zone.domaine}</p>
                        </div>
                      );
                    })}

                  {tuilesVisibles
                    .filter(
                      (tuile) =>
                        tuile.date === date &&
                        tuile.day === jour &&
                        tuile.startMinute !== undefined
                    )
                    .map((tuile) => {
                      const top =
                        ((tuile.startMinute ?? debutJournee) - debutJournee) /
                        pasMinutes *
                        hauteurTranche;
                      const height = Math.max(
                        hauteurTranche,
                        (tuile.dureeMinutes / pasMinutes) * hauteurTranche
                      );

                      return (
                        <Fragment key={tuile.id}>
                        <div
                          data-tuile-id={tuile.id}
                          draggable
                          tabIndex={0}
                          role="button"
                          aria-label={`${tuile.titreSequence}, séance ${tuile.seanceLabel}, ${jour} ${formatHeure(tuile.startMinute ?? debutJournee)}. Entrée pour afficher la fiche, flèches pour déplacer, Suppr pour remettre en réserve.`}
                          onClick={() => setTuileSelectionneeId(tuile.id)}
                          onDoubleClick={() => setFicheOuverteId(tuile.id)}
                          onFocus={() => setTuileSelectionneeId(tuile.id)}
                          onKeyDown={(event) => gererClavierTuile(event, tuile)}
                          onDragStart={(event) => commencerGlisser(event, tuile.id, true)}
                          className={`absolute left-1 right-1 cursor-move overflow-hidden rounded-md border p-1.5 text-white shadow-sm outline-none focus-visible:ring-4 focus-visible:ring-teal-300 ${
                            tuileSelectionneeId === tuile.id ? "ring-2 ring-slate-950" : ""
                          }`}
                          style={{
                            top,
                            height,
                            backgroundColor: getDisciplineColor(tuile.domaine).background,
                            borderColor: getDisciplineColor(tuile.domaine).border
                          }}
                        >
                          <p className="truncate text-xs font-semibold">
                            {tuile.titreSequence}
                          </p>
                          <p className="truncate text-xs">Séance {tuile.seanceLabel}</p>
                          <p className="truncate text-xs">{tuile.domaine}</p>
                          <p className="truncate text-xs">
                            {formatHeure(tuile.startMinute ?? debutJournee)} ·{" "}
                            {libelleDuree(tuile.dureeMinutes)}
                          </p>
                        </div>
                        {tuileSelectionneeId === tuile.id && (
                          <button
                            type="button"
                            data-garde-selection
                            onClick={() => setFicheOuverteId(tuile.id)}
                            className="absolute right-2 z-10 rounded-md bg-white px-2 py-1 text-xs font-semibold text-slate-950 shadow-md ring-1 ring-slate-300 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                            style={{ top: top + 4 }}
                          >
                            Voir la fiche
                          </button>
                        )}
                        </Fragment>
                      );
                    })}
                </div>
              ))}
            </div>
          </section>

          <aside data-garde-selection className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-xl font-bold text-slate-950">Réserve</h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              Les séances envoyées depuis le formulaire arrivent ici avant d'être placées.
            </p>

            <div className="mt-4 grid gap-3">
              {tuilesReserve.length === 0 && (
                <p className="rounded-md bg-slate-100 p-3 text-sm text-slate-700">
                  Aucune séance en réserve.
                </p>
              )}

              {tuilesReserve.map((tuile) => (
                <div
                  key={tuile.id}
                  draggable
                  tabIndex={0}
                  role="button"
                  aria-label={`${tuile.titreSequence}, séance ${tuile.seanceLabel}. Entrée pour placer lundi matin.`}
                  onClick={() => setTuileSelectionneeId(tuile.id)}
                  onKeyDown={(event) => placerDepuisReserve(event, tuile)}
                  onDragStart={(event) => commencerGlisser(event, tuile.id)}
                  className={`cursor-move rounded-md outline-none focus-visible:ring-4 focus-visible:ring-teal-300 border border-l-[6px] p-3 text-sm shadow-sm ${
                    tuileSelectionneeId === tuile.id ? "ring-2 ring-slate-950" : ""
                  }`}
                  style={{
                    backgroundColor: getDisciplineColor(tuile.domaine).softBackground,
                    borderColor: getDisciplineColor(tuile.domaine).border,
                    color: getDisciplineColor(tuile.domaine).text
                  }}
                >
                  <p className="font-semibold">{tuile.titreSequence}</p>
                  <p className="mt-1">Séance {tuile.seanceLabel}</p>
                  <p>{tuile.domaine}</p>
                  <p>{libelleDuree(tuile.dureeMinutes)}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-md border border-slate-200 bg-slate-50 p-4">
              <h3 className="font-semibold text-slate-950">Actions</h3>
              {tuileSelectionnee ? (
                <div className="mt-3">
                  <p className="text-sm font-semibold text-slate-950">
                    {tuileSelectionnee.titreSequence}
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    Séance {tuileSelectionnee.seanceLabel} ·{" "}
                    {libelleDuree(tuileSelectionnee.dureeMinutes)}
                  </p>
                  <div className="mt-4 grid gap-2">
                    <button
                      type="button"
                      onClick={() => setFicheOuverteId(tuileSelectionnee.id)}
                      className="rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-teal-800"
                    >
                      Afficher la fiche de séance
                    </button>
                    {tuileSelectionnee.day && (
                      <button
                        type="button"
                        onClick={() => remettreEnReserve(tuileSelectionnee.id)}
                        className="rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-teal-800"
                      >
                        Remettre en réserve
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => supprimerTuile(tuileSelectionnee.id)}
                      className="rounded-md bg-red-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-800"
                    >
                      Supprimer la tuile
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  Sélectionnez une tuile pour afficher ses actions.
                </p>
              )}
            </div>
          </aside>
        </div>
      </section>

      {ficheOuverte && (
        <FicheSeanceModal
          open
          lesson={ficheOuverte.lesson}
          onClose={() => setFicheOuverteId("")}
          onSave={(lesson) => enregistrerFiche(ficheOuverte, lesson)}
        />
      )}
    </main>
  );
}









