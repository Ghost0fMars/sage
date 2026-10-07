"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getCurrentUser,
  readUserData,
  writeUserData,
  type LocalUser
} from "./lib/user-storage";
import { getDisciplineColor } from "./lib/discipline-colors";

type SeanceDetaillee = {
  titre: string;
  objectif: string;
  niveau: string;
  dureeTotale: string;
  materielGlobal: string;
};

type TuilePlanning = {
  id: string;
  titreSequence: string;
  seanceLabel: string;
  domaine: string;
  dureeMinutes: number;
  lesson: SeanceDetaillee;
  day?: string;
  date?: string;
  startMinute?: number;
};

type SeancePreparee = {
  id: string;
  cycle: string;
  niveau: string;
  domaine: string;
  sousDomaine: string;
  sequenceTitle: string;
  sequenceTotal: number;
  seanceNumero: number;
  lesson: SeanceDetaillee;
};

type SequencePreparee = {
  id: string;
  cycle: string;
  niveau: string;
  domaine: string;
  sousDomaine: string;
  sequence: {
    titre: string;
  };
};

type Eleve = {
  id: string;
  nom: string;
  prenom: string;
};

type EvenementAgenda = {
  id: string;
  title: string;
  date: string;
  time: string;
  type: string;
  notes: string;
};

const PLANNING_STORAGE_KEY = "sage-planning-tiles";
const PREPARED_LESSONS_STORAGE_KEY = "sage-prepared-lessons";
const SEQUENCES_STORAGE_KEY = "sage-sequences";
const STUDENTS_STORAGE_KEY = "sage-students";
const EVENTS_STORAGE_KEY = "sage-events";
const joursOrdre = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];
const typesEvenements = ["Classe", "Réunion", "Sortie", "Administratif", "Rendez-vous", "Autre"];

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

function datePourJourSemaine(jour: string) {
  const index = joursOrdre.indexOf(jour);
  if (index === -1) {
    return undefined;
  }

  const lundi = lundiDeLaSemaine(new Date());
  lundi.setDate(lundi.getDate() + index);
  return formatDateInput(lundi);
}

function formatHeure(minutesDepuisMinuit?: number) {
  if (minutesDepuisMinuit === undefined) {
    return "Non planifié";
  }

  const heures = Math.floor(minutesDepuisMinuit / 60);
  const minutes = minutesDepuisMinuit % 60;
  return `${heures.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

function formatDateLongue(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long"
  });
}

function formatMois(mois: string) {
  return new Date(`${mois}-01T00:00:00`).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric"
  });
}

export default function TableauDeBord() {
  const [tuiles, setTuiles] = useState<TuilePlanning[]>([]);
  const [seancesPreparees, setSeancesPreparees] = useState<SeancePreparee[]>([]);
  const [sequences, setSequences] = useState<SequencePreparee[]>([]);
  const [eleves, setEleves] = useState<Eleve[]>([]);
  const [evenements, setEvenements] = useState<EvenementAgenda[]>([]);
  const [user, setUser] = useState<LocalUser | null>(null);
  const [dateCahierJournal, setDateCahierJournal] = useState("");
  const [dateAgenda, setDateAgenda] = useState(formatDateInput(new Date()));
  const [nouvelEvenement, setNouvelEvenement] = useState({
    title: "",
    time: "08:30",
    type: "Classe",
    notes: ""
  });
  const [ajoutAgendaOuvert, setAjoutAgendaOuvert] = useState(false);

  useEffect(() => {
    setUser(getCurrentUser());
    setTuiles(
      readUserData<TuilePlanning[]>(PLANNING_STORAGE_KEY, [], PLANNING_STORAGE_KEY).map(
        (tuile) => ({
          ...tuile,
          date: tuile.date ?? (tuile.day ? datePourJourSemaine(tuile.day) : undefined)
        })
      )
    );
    setSeancesPreparees(
      readUserData<SeancePreparee[]>(PREPARED_LESSONS_STORAGE_KEY, [], PREPARED_LESSONS_STORAGE_KEY)
    );
    setSequences(
      readUserData<SequencePreparee[]>(SEQUENCES_STORAGE_KEY, [], SEQUENCES_STORAGE_KEY)
    );
    setEleves(readUserData<Eleve[]>(STUDENTS_STORAGE_KEY, [], STUDENTS_STORAGE_KEY));
    setEvenements(readUserData<EvenementAgenda[]>(EVENTS_STORAGE_KEY, [], EVENTS_STORAGE_KEY));
  }, []);

  const tuilesPlanifiees = useMemo(
    () =>
      tuiles
        .filter((tuile) => tuile.day && tuile.startMinute !== undefined)
        .sort((a, b) => {
          const dateA = a.date ?? "";
          const dateB = b.date ?? "";
          return dateA.localeCompare(dateB) || (a.startMinute ?? 0) - (b.startMinute ?? 0);
        }),
    [tuiles]
  );

  const prochainesSeances = tuilesPlanifiees.slice(0, 4);
  const datesDisponibles = useMemo(() => {
    return Array.from(
      new Set(tuilesPlanifiees.map((tuile) => tuile.date).filter(Boolean) as string[])
    ).sort();
  }, [tuilesPlanifiees]);

  useEffect(() => {
    if (!dateCahierJournal && datesDisponibles.length > 0) {
      setDateCahierJournal(datesDisponibles[0]);
    }
  }, [dateCahierJournal, datesDisponibles]);

  const seancesDuJour = useMemo(() => {
    if (!dateCahierJournal) {
      return prochainesSeances;
    }

    return tuilesPlanifiees.filter((tuile) => tuile.date === dateCahierJournal);
  }, [dateCahierJournal, prochainesSeances, tuilesPlanifiees]);

  const moisAgenda = dateAgenda.slice(0, 7);

  const evenementsParJour = useMemo(() => {
    const duMois = evenements
      .filter((e) => e.date.startsWith(moisAgenda))
      .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));
    const groupes = new Map<string, EvenementAgenda[]>();
    for (const e of duMois) {
      if (!groupes.has(e.date)) groupes.set(e.date, []);
      groupes.get(e.date)!.push(e);
    }
    return Array.from(groupes.entries());
  }, [moisAgenda, evenements]);

  function ajouterEvenementAgenda() {
    const titre = nouvelEvenement.title.trim();

    if (!titre || !dateAgenda) {
      return;
    }

    const evenement: EvenementAgenda = {
      id: crypto.randomUUID(),
      title: titre,
      date: dateAgenda,
      time: nouvelEvenement.time || "08:30",
      type: nouvelEvenement.type,
      notes: nouvelEvenement.notes.trim()
    };
    const prochainsEvenements = [...evenements, evenement];

    setEvenements(prochainsEvenements);
    writeUserData(EVENTS_STORAGE_KEY, prochainsEvenements);
    setNouvelEvenement({ title: "", time: "08:30", type: "Classe", notes: "" });
  }

  function supprimerEvenementAgenda(id: string) {
    const prochainsEvenements = evenements.filter((evenement) => evenement.id !== id);
    setEvenements(prochainsEvenements);
    writeUserData(EVENTS_STORAGE_KEY, prochainsEvenements);
  }

  const clesSequencesExistantes = new Set(
    sequences.map(
      (sequence) =>
        `${sequence.cycle}|||${sequence.niveau}|||${sequence.domaine}|||${sequence.sousDomaine}|||${sequence.sequence.titre}`
    )
  );
  const seancesBibliotheque = seancesPreparees.filter((seance) =>
    clesSequencesExistantes.has(
      `${seance.cycle}|||${seance.niveau}|||${seance.domaine}|||${seance.sousDomaine}|||${seance.sequenceTitle}`
    )
  );
  const domainesUniques = new Set(sequences.map((sequence) => sequence.domaine));
  const progression = Math.min(100, Math.round((seancesBibliotheque.length / 24) * 100));
  const focus = prochainesSeances[0] ?? tuiles[0];

  return (
    <main className="px-4 py-6 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
            Tableau de bord
          </p>
          <h1 className="mt-2 text-3xl font-bold">Bonjour {user?.name ?? ""}</h1>
          <p className="mt-2 max-w-2xl leading-7 text-slate-700">
            Vue globale de la classe, des préparations et des prochains temps de la semaine.
          </p>
        </header>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Séances préparées", value: seancesBibliotheque.length },
            { label: "Séances planifiées", value: tuilesPlanifiees.length },
            { label: "Séquences", value: sequences.length },
            { label: "Domaines travaillés", value: domainesUniques.size }
          ].map((stat) => (
            <article
              key={stat.label}
              className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
            >
              <p className="text-sm font-medium text-slate-500">{stat.label}</p>
              <p className="mt-6 text-4xl font-bold">{stat.value}</p>
            </article>
          ))}
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <article className="rounded-lg bg-slate-950 p-6 text-white shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wide text-white/70">
              Focus du moment
            </p>
            <h2 className="mt-8 text-4xl font-bold">
              {focus?.titreSequence ?? "Aucune séance planifiée"}
            </h2>
            <p className="mt-4 max-w-2xl leading-7 text-slate-300">
              {focus
                ? `${focus.day ?? "Réserve"} · ${formatHeure(focus.startMinute)} · séance ${
                    focus.seanceLabel
                  } en ${focus.domaine}.`
                : "Préparez une séance, puis envoyez-la dans le planning pour alimenter cette vue."}
            </p>
            <a
              href="/planning"
              className="mt-8 inline-flex rounded-md bg-teal-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-focus"
            >
              Ouvrir le planning
            </a>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-600">Progression du programme</p>
            <p className="mt-3 text-3xl font-bold text-slate-950">{progression}%</p>
            <p className="mt-1 text-sm text-slate-600">Préparations enregistrées</p>
            <div className="mt-5 h-2 rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-teal-500" style={{ width: `${progression}%` }} />
            </div>
          </article>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">Cahier journal</h2>
                {dateCahierJournal && (
                  <p className="mt-1 text-sm text-slate-600">
                    {formatDateLongue(dateCahierJournal)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={dateCahierJournal}
                  onChange={(event) => setDateCahierJournal(event.target.value)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
                >
                  {datesDisponibles.length === 0 && <option value="">Aucune date</option>}
                  {datesDisponibles.map((date) => (
                    <option key={date} value={date}>
                      {formatDateLongue(date)}
                    </option>
                  ))}
                </select>
                <a
                  href="/planning"
                  className="rounded-sm text-sm font-semibold text-teal-700 focus:outline-none focus:ring-2 focus:ring-focus"
                >
                  Voir tout
                </a>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {seancesDuJour.length === 0 && (
                <p className="rounded-md bg-slate-100 p-4 text-sm text-slate-600">
                  Aucune séance prévue à cette date.
                </p>
              )}

              {seancesDuJour.map((tuile) => (
                <article
                  key={tuile.id}
                  className="rounded-md border border-l-[6px] p-4"
                  style={{
                    backgroundColor: getDisciplineColor(tuile.domaine).softBackground,
                    borderColor: getDisciplineColor(tuile.domaine).border,
                    color: getDisciplineColor(tuile.domaine).text
                  }}
                >
                  <p className="text-sm font-semibold opacity-75">
                    {tuile.day} · {formatHeure(tuile.startMinute)}
                  </p>
                  <h3 className="mt-2 font-bold">{tuile.titreSequence}</h3>
                  <p className="mt-1 text-sm opacity-80">
                    Séance {tuile.seanceLabel} · {tuile.dureeMinutes} min · {tuile.domaine}
                  </p>
                </article>
              ))}
            </div>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold">Élèves & profils</h2>
            <p className="mt-3 leading-7 text-slate-600">
              La liste des élèves et les profils seront ajoutés dans une prochaine étape.
            </p>
            <div className="mt-5 rounded-md bg-slate-100 p-4">
              <p className="text-sm font-semibold text-slate-500">Élèves enregistrés</p>
              <p className="mt-3 text-4xl font-bold">{eleves.length}</p>
            </div>
          </article>
        </section>

        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">Agenda</h2>
              <p className="mt-1 text-sm text-slate-600">
                {moisAgenda ? formatMois(moisAgenda) : "Choisir une date"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={dateAgenda}
                onChange={(event) => setDateAgenda(event.target.value)}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
              />
              <button
                type="button"
                onClick={() => setAjoutAgendaOuvert((ouvert) => !ouvert)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-focus"
              >
                {ajoutAgendaOuvert ? "Fermer" : "+ Ajouter"}
              </button>
            </div>
          </div>

          {ajoutAgendaOuvert && (
            <div className="mt-4 grid gap-3 rounded-md bg-slate-50 p-3 md:grid-cols-[minmax(0,1fr)_120px_150px]">
              <input
                type="text"
                value={nouvelEvenement.title}
                onChange={(event) =>
                  setNouvelEvenement((actuel) => ({ ...actuel, title: event.target.value }))
                }
                placeholder="Conseil d'école, réunion, sortie, rendez-vous..."
                className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
              />
              <input
                type="time"
                value={nouvelEvenement.time}
                onChange={(event) =>
                  setNouvelEvenement((actuel) => ({ ...actuel, time: event.target.value }))
                }
                className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
              />
              <select
                value={nouvelEvenement.type}
                onChange={(event) =>
                  setNouvelEvenement((actuel) => ({ ...actuel, type: event.target.value }))
                }
                className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
              >
                {typesEvenements.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <textarea
                value={nouvelEvenement.notes}
                onChange={(event) =>
                  setNouvelEvenement((actuel) => ({ ...actuel, notes: event.target.value }))
                }
                placeholder="Notes facultatives"
                rows={2}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus md:col-span-2"
              />
              <button
                type="button"
                onClick={ajouterEvenementAgenda}
                className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-focus"
              >
                Ajouter
              </button>
            </div>
          )}

          <div className="mt-4 grid gap-3">
            {evenementsParJour.length === 0 && (
              <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">
                Aucun évènement ce mois-ci.
              </p>
            )}
            {evenementsParJour.map(([date, evts]) => (
              <div key={date}>
                <p className="mb-1 text-xs font-semibold text-slate-500">
                  {formatDateLongue(date)}
                </p>
                <div className="grid gap-2">
                  {evts.map((evenement) => (
                    <article
                      key={evenement.id}
                      className="flex flex-wrap items-start justify-between gap-3 rounded-md bg-slate-50 p-3"
                    >
                      <div>
                        <p className="text-sm font-semibold opacity-75">
                          {evenement.time} · {evenement.type}
                        </p>
                        <h4 className="font-bold text-slate-950">{evenement.title}</h4>
                        {evenement.notes && (
                          <p className="mt-1 text-sm text-slate-600">{evenement.notes}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Supprimer « ${evenement.title} » de l'agenda ?`)) {
                            supprimerEvenementAgenda(evenement.id);
                          }
                        }}
                        className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-focus"
                      >
                        Supprimer
                      </button>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}


