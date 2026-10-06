"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { readUserData, writeUserData } from "../lib/user-storage";
import { Classe, lireClasses } from "../lib/classes";

type Eleve = {
  id: string;
  nom: string;
  prenom: string;
  classeId?: string;
  niveau?: string;
  naissance: string;
  groupe: string;
  genre: string;
  cooperative: string;
  notes: string;
  cantine: boolean;
  ficheRenseignement: boolean;
  urgence: boolean;
  assurance: boolean;
  ficheDroitImage: boolean;
  liberteInformatique: boolean;
  notificationPassage: boolean;
  piscine: boolean;
  kermesse: boolean;
  differenciation: boolean;
  ppre: boolean;
  aide: boolean;
  aidePsy: boolean;
  stageRemiseNiveau: boolean;
  pap: boolean;
  pai: boolean;
  pps: boolean;
  elco: boolean;
  etudeSurveillee: boolean;
  accompagnement: boolean;
  suiviExterieur: boolean;
};

type Evaluation = {
  id: string;
  titre: string;
  date: string;
  domaine: string;
  competence: string;
  objectif: string;
  resultats: {
    eleveId: string;
    niveau: "Non évalué" | "À renforcer" | "En cours" | "Acquis" | "Dépassé";
    commentaire: string;
  }[];
};

type NoteEleve = {
  id: string;
  eleveId: string;
  date: string;
  texte: string;
};

type PhotoEleve = {
  eleveId: string;
  dataUrl: string;
};

type ColonneBooleenne = {
  key: keyof Pick<
    Eleve,
    | "cantine"
    | "ficheRenseignement"
    | "urgence"
    | "assurance"
    | "ficheDroitImage"
    | "liberteInformatique"
    | "notificationPassage"
    | "piscine"
    | "kermesse"
    | "differenciation"
    | "ppre"
    | "aide"
    | "aidePsy"
    | "stageRemiseNiveau"
    | "pap"
    | "pai"
    | "pps"
    | "elco"
    | "etudeSurveillee"
    | "accompagnement"
    | "suiviExterieur"
  >;
  label: string;
};

const STORAGE_KEY = "sage-students";
const EVALUATIONS_STORAGE_KEY = "sage-evaluations";
const STUDENT_NOTES_STORAGE_KEY = "sage-student-notes";
const STUDENT_PHOTOS_STORAGE_KEY = "sage-student-photos";

const colonnesBooleennes: ColonneBooleenne[] = [
  { key: "cantine", label: "Cantine" },
  { key: "ficheRenseignement", label: "Fiche de\nrenseignement" },
  { key: "assurance", label: "Assurance" },
  { key: "ficheDroitImage", label: "Droit\nimage" },
  { key: "etudeSurveillee", label: "Études" },
  { key: "accompagnement", label: "Suivi" }
];

const groupes = ["Bleu", "Vert", "Jaune", "Orange", "Rouge"];
const genres = ["", "F", "M"];
const valeursNiveaux = {
  "Non évalué": 0,
  "À renforcer": 25,
  "En cours": 50,
  Acquis: 75,
  Dépassé: 100
};

function creerEleve(numero: number, classe?: Classe): Eleve {
  return {
    id: crypto.randomUUID(),
    nom: `Nom${numero}`,
    prenom: `Prénom${numero}`,
    classeId: classe?.id ?? "",
    niveau: classe?.niveaux.length === 1 ? classe.niveaux[0] : "",
    naissance: "",
    groupe: "",
    genre: "",
    cooperative: "0,00 €",
    notes: "",
    cantine: false,
    ficheRenseignement: false,
    urgence: false,
    assurance: false,
    ficheDroitImage: false,
    liberteInformatique: false,
    notificationPassage: false,
    piscine: false,
    kermesse: false,
    differenciation: false,
    ppre: false,
    aide: false,
    aidePsy: false,
    stageRemiseNiveau: false,
    pap: false,
    pai: false,
    pps: false,
    elco: false,
    etudeSurveillee: false,
    accompagnement: false,
    suiviExterieur: false
  };
}

function lireEleves() {
  return readUserData<Eleve[]>(STORAGE_KEY, [], STORAGE_KEY);
}

export default function ElevesPage() {
  const [eleves, setEleves] = useState<Eleve[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [notesEleves, setNotesEleves] = useState<NoteEleve[]>([]);
  const [photosEleves, setPhotosEleves] = useState<PhotoEleve[]>([]);
  const [eleveOuvertId, setEleveOuvertId] = useState("");
  const [nouvelleNote, setNouvelleNote] = useState("");
  const [filtre, setFiltre] = useState("");
  const [classes, setClasses] = useState<Classe[]>([]);
  const [classeFiltreId, setClasseFiltreId] = useState("");
  const [donneesChargees, setDonneesChargees] = useState(false);
  const [modificationsNonSauvegardees, setModificationsNonSauvegardees] = useState(false);
  const [messageSauvegarde, setMessageSauvegarde] = useState("");

  useEffect(() => {
    const elevesStockes = lireEleves();
    setEleves(
      elevesStockes.length > 0
        ? elevesStockes.map((eleve) => ({
            ...eleve,
            cooperative: eleve.cooperative || "0,00 €"
          }))
        : Array.from({ length: 8 }, (_, i) => creerEleve(i + 1))
    );
    setEvaluations(readUserData<Evaluation[]>(EVALUATIONS_STORAGE_KEY, [], EVALUATIONS_STORAGE_KEY));
    setNotesEleves(readUserData<NoteEleve[]>(STUDENT_NOTES_STORAGE_KEY, [], STUDENT_NOTES_STORAGE_KEY));
    setPhotosEleves(readUserData<PhotoEleve[]>(STUDENT_PHOTOS_STORAGE_KEY, [], STUDENT_PHOTOS_STORAGE_KEY));
    setClasses(lireClasses());
    setDonneesChargees(true);
  }, []);

  const elevesFiltres = useMemo(() => {
    const recherche = filtre.trim().toLowerCase();
    return eleves.filter(
      (eleve) =>
        (!classeFiltreId || eleve.classeId === classeFiltreId) &&
        `${eleve.nom} ${eleve.prenom} ${eleve.groupe} ${eleve.niveau ?? ""} ${eleve.notes}`
          .toLowerCase()
          .includes(recherche)
    );
  }, [eleves, filtre, classeFiltreId]);

  const classeFiltree = classes.find((classe) => classe.id === classeFiltreId);

  function mettreAJourEleve(id: string, miseAJour: Partial<Eleve>) {
    setEleves((elevesActuels) =>
      elevesActuels.map((eleve) => (eleve.id === id ? { ...eleve, ...miseAJour } : eleve))
    );
    setModificationsNonSauvegardees(true);
    setMessageSauvegarde("");
  }

  function ajouterEleve() {
    setEleves((elevesActuels) => [...elevesActuels, creerEleve(elevesActuels.length + 1, classeFiltree)]);
    setModificationsNonSauvegardees(true);
    setMessageSauvegarde("");
  }

  function supprimerEleve(id: string) {
    setEleves((elevesActuels) => elevesActuels.filter((eleve) => eleve.id !== id));
    setModificationsNonSauvegardees(true);
    setMessageSauvegarde("");
  }

  function changerTexte(
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
    id: string,
    champ: keyof Eleve
  ) {
    mettreAJourEleve(id, { [champ]: event.target.value });
  }

  function sauvegarderEleves() {
    writeUserData(STORAGE_KEY, eleves);
    setModificationsNonSauvegardees(false);
    setMessageSauvegarde(`Données élèves sauvegardées (${eleves.length} élève(s)).`);
  }

  const eleveOuvert = eleves.find((eleve) => eleve.id === eleveOuvertId);
  const notesEleveOuvert = notesEleves.filter((note) => note.eleveId === eleveOuvertId);
  const photoEleveOuvert = photosEleves.find((photo) => photo.eleveId === eleveOuvertId);
  const progressionEleve = useMemo(() => {
    if (!eleveOuvertId) {
      return [];
    }

    const domaines = new Map<string, number[]>();

    evaluations.forEach((evaluation) => {
      const resultat = evaluation.resultats.find((item) => item.eleveId === eleveOuvertId);
      if (!resultat) {
        return;
      }

      const domaine = evaluation.domaine || "Sans domaine";
      domaines.set(domaine, [...(domaines.get(domaine) ?? []), valeursNiveaux[resultat.niveau]]);
    });

    return Array.from(domaines.entries()).map(([domaine, valeurs]) => ({
      domaine,
      valeur: Math.round(valeurs.reduce((total, valeur) => total + valeur, 0) / valeurs.length)
    }));
  }, [eleveOuvertId, evaluations]);

  function pointsRadar() {
    const centre = 150;
    const rayonMax = 105;
    const donnees = progressionEleve.length > 0 ? progressionEleve : [{ domaine: "Aucune donnée", valeur: 0 }];

    return donnees
      .map((item, index) => {
        const angle = (Math.PI * 2 * index) / donnees.length - Math.PI / 2;
        const rayon = (item.valeur / 100) * rayonMax;
        return `${centre + Math.cos(angle) * rayon},${centre + Math.sin(angle) * rayon}`;
      })
      .join(" ");
  }

  function ajouterNoteEleve() {
    if (!eleveOuvertId || !nouvelleNote.trim()) {
      return;
    }

    const note: NoteEleve = {
      id: crypto.randomUUID(),
      eleveId: eleveOuvertId,
      date: new Date().toISOString(),
      texte: nouvelleNote.trim()
    };
    const prochainesNotes = [note, ...notesEleves];

    setNotesEleves(prochainesNotes);
    writeUserData(STUDENT_NOTES_STORAGE_KEY, prochainesNotes);
    setNouvelleNote("");
  }

  function importerPhotoEleve(fichier: File | undefined) {
    if (!eleveOuvertId || !fichier) {
      return;
    }

    const lecteur = new FileReader();
    lecteur.onload = () => {
      const dataUrl = String(lecteur.result);
      const prochainesPhotos = [
        ...photosEleves.filter((photo) => photo.eleveId !== eleveOuvertId),
        {
          eleveId: eleveOuvertId,
          dataUrl
        }
      ];

      setPhotosEleves(prochainesPhotos);
      writeUserData(STUDENT_PHOTOS_STORAGE_KEY, prochainesPhotos);
    };
    lecteur.readAsDataURL(fichier);
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-[1800px]">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
              Élèves & suivi
            </p>
            <h1 className="mt-2 text-3xl font-bold text-slate-950">Tableau de suivi de classe</h1>
            <p className="mt-2 max-w-3xl leading-7 text-slate-700">
              Saisissez les informations des élèves et cochez les dispositifs ou documents à suivre.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <a
              href="/"
              className="rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100"
            >
              Tableau de bord
            </a>
            <button
              type="button"
              onClick={sauvegarderEleves}
              disabled={!donneesChargees}
              className="rounded-md bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              Sauvegarder
            </button>
            <button
              type="button"
              onClick={ajouterEleve}
              className="rounded-md bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800"
            >
              Ajouter un élève
            </button>
          </div>
        </div>

        {(messageSauvegarde || modificationsNonSauvegardees) && (
          <div
            className={`mb-4 rounded-md border p-4 ${
              modificationsNonSauvegardees
                ? "border-amber-200 bg-amber-50 text-amber-950"
                : "border-teal-200 bg-teal-50 text-teal-950"
            }`}
          >
            {modificationsNonSauvegardees
              ? "Modifications non sauvegardées."
              : messageSauvegarde}
          </div>
        )}

        <div className="mb-4 flex flex-wrap gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          {classes.length > 0 && (
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-slate-800">Classe</span>
              <select
                value={classeFiltreId}
                onChange={(event) => setClasseFiltreId(event.target.value)}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              >
                <option value="">Toutes les classes</option>
                {classes.map((classe) => (
                  <option key={classe.id} value={classe.id}>
                    {classe.nom}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="grid max-w-md flex-1 gap-2">
            <span className="text-sm font-semibold text-slate-800">Rechercher</span>
            <input
              value={filtre}
              onChange={(event) => setFiltre(event.target.value)}
              placeholder="Nom, prénom, groupe, note..."
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
          </label>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-[1440px] w-full table-fixed border-collapse text-xs">
            <thead>
              <tr className="bg-[#f0fdfa] text-slate-950">
                <th className="w-36 border border-white bg-[#f0fdfa] px-2 py-1 text-left text-xs leading-tight">
                  Nom
                </th>
                <th className="w-28 border border-white px-2 py-1 text-left text-xs leading-tight">Prénom</th>
                {classes.length > 0 && (
                  <>
                    <th className="w-24 border border-white px-2 py-1 text-left text-xs leading-tight">Classe</th>
                    <th className="w-20 border border-white px-2 py-1 text-left text-xs leading-tight">Niveau</th>
                  </>
                )}
                <th className="w-28 border border-white px-2 py-1 text-left text-xs leading-tight">Naissance</th>
                <th className="w-16 border border-white px-2 py-1 text-left text-xs leading-tight">Groupe</th>
                <th className="w-14 border border-white px-2 py-1 text-left text-xs leading-tight">Genre</th>
                {colonnesBooleennes.map((colonne) => (
                  <th
                    key={colonne.key}
                    className={`border border-white px-1 py-1 text-center text-xs leading-tight ${
                      colonne.key === "ficheRenseignement" ? "w-24" : "w-16"
                    }`}
                  >
                    <span className="block whitespace-pre-line">{colonne.label}</span>
                  </th>
                ))}
                <th className="w-20 border border-white px-2 py-1 text-left text-xs leading-tight">Coopérative</th>
                <th className="w-[320px] min-w-[320px] border border-white px-2 py-1 text-left text-xs leading-tight">Notes</th>
                <th className="w-28 min-w-28 border border-white px-2 py-1 text-left text-xs leading-tight">Action</th>
              </tr>
            </thead>

            <tbody>
              {elevesFiltres.map((eleve, index) => (
                <tr
                  key={eleve.id}
                  className={index % 2 === 0 ? "bg-blue-50" : "bg-white"}
                >
                  <td className="border border-white bg-inherit px-2 py-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEleveOuvertId(eleve.id)}
                        className="rounded-md bg-teal-700 px-2 py-1 text-xs font-semibold text-white transition hover:bg-teal-800"
                      >
                        Fiche
                      </button>
                      <input
                        value={eleve.nom}
                        onChange={(event) => changerTexte(event, eleve.id, "nom")}
                        onDoubleClick={() => setEleveOuvertId(eleve.id)}
                        className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-1 font-semibold outline-none focus:border-teal-500 focus:bg-white"
                      />
                    </div>
                  </td>
                  <td className="border border-white px-2 py-1">
                    <input
                      value={eleve.prenom}
                      onChange={(event) => changerTexte(event, eleve.id, "prenom")}
                      onDoubleClick={() => setEleveOuvertId(eleve.id)}
                      className="w-full rounded border border-transparent bg-transparent px-1 py-1 outline-none focus:border-teal-500 focus:bg-white"
                    />
                  </td>
                  {classes.length > 0 && (
                    <>
                      <td className="border border-white px-2 py-1">
                        <select
                          value={eleve.classeId ?? ""}
                          onChange={(event) => {
                            const classe = classes.find((c) => c.id === event.target.value);
                            mettreAJourEleve(eleve.id, {
                              classeId: event.target.value,
                              niveau: classe?.niveaux.length === 1 ? classe.niveaux[0] : ""
                            });
                          }}
                          className="w-full rounded border border-transparent bg-transparent px-1 py-1 outline-none focus:border-teal-500 focus:bg-white"
                        >
                          <option value="">-</option>
                          {classes.map((classe) => (
                            <option key={classe.id} value={classe.id}>
                              {classe.nom}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="border border-white px-2 py-1">
                        <select
                          value={eleve.niveau ?? ""}
                          onChange={(event) => changerTexte(event, eleve.id, "niveau")}
                          className="w-full rounded border border-transparent bg-transparent px-1 py-1 outline-none focus:border-teal-500 focus:bg-white"
                        >
                          <option value="">-</option>
                          {(classes.find((c) => c.id === eleve.classeId)?.niveaux ?? []).map((niveau) => (
                            <option key={niveau} value={niveau}>
                              {niveau}
                            </option>
                          ))}
                        </select>
                      </td>
                    </>
                  )}
                  <td className="border border-white px-2 py-1">
                    <input
                      type="date"
                      value={eleve.naissance}
                      onChange={(event) => changerTexte(event, eleve.id, "naissance")}
                      className="w-full rounded border border-transparent bg-transparent px-1 py-1 outline-none focus:border-teal-500 focus:bg-white"
                    />
                  </td>
                  <td className="border border-white px-2 py-1">
                    <select
                      value={eleve.groupe}
                      onChange={(event) => changerTexte(event, eleve.id, "groupe")}
                      className="w-full rounded border border-transparent bg-transparent px-1 py-1 outline-none focus:border-teal-500 focus:bg-white"
                    >
                      <option value="">-</option>
                      {groupes.map((groupe) => (
                        <option key={groupe} value={groupe}>
                          {groupe}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="border border-white px-2 py-1">
                    <select
                      value={eleve.genre}
                      onChange={(event) => changerTexte(event, eleve.id, "genre")}
                      className="w-full rounded border border-transparent bg-transparent px-1 py-1 outline-none focus:border-teal-500 focus:bg-white"
                    >
                      {genres.map((genre) => (
                        <option key={genre} value={genre}>
                          {genre || "-"}
                        </option>
                      ))}
                    </select>
                  </td>

                  {colonnesBooleennes.map((colonne) => (
                    <td key={colonne.key} className="border border-white px-2 py-1 text-center">
                      <input
                        type="checkbox"
                        checked={Boolean(eleve[colonne.key])}
                        onChange={(event) =>
                          mettreAJourEleve(eleve.id, { [colonne.key]: event.target.checked })
                        }
                        className="h-4 w-4 accent-teal-700"
                      />
                    </td>
                  ))}

                  <td className="border border-white px-2 py-1">
                    <input
                      value={eleve.cooperative}
                      onChange={(event) => changerTexte(event, eleve.id, "cooperative")}
                      onBlur={() => {
                        if (!eleve.cooperative.trim()) {
                          mettreAJourEleve(eleve.id, { cooperative: "0,00 €" });
                        }
                      }}
                      placeholder="0,00 €"
                      className="w-full rounded border border-transparent bg-transparent px-1 py-1 outline-none focus:border-teal-500 focus:bg-white"
                    />
                  </td>
                  <td className="w-[320px] min-w-[320px] border border-white px-2 py-1">
                    <textarea
                      value={eleve.notes}
                      onChange={(event) => changerTexte(event, eleve.id, "notes")}
                      className="h-8 w-full resize-none rounded border border-transparent bg-transparent px-1 py-1 outline-none focus:border-teal-500 focus:bg-white"
                    />
                  </td>
                  <td className="w-28 min-w-28 border border-white px-2 py-1">
                    <button
                      type="button"
                      onClick={() => supprimerEleve(eleve.id)}
                      className="w-full rounded-md bg-red-700 px-2 py-2 text-xs font-semibold text-white transition hover:bg-red-800"
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {eleveOuvert && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
            <section className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
                    Fiche élève
                  </p>
                  <h2 className="mt-1 text-2xl font-bold text-slate-950">
                    {eleveOuvert.nom} {eleveOuvert.prenom}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {eleveOuvert.naissance || "Date de naissance non renseignée"} · Groupe{" "}
                    {eleveOuvert.groupe || "-"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEleveOuvertId("")}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100"
                >
                  Fermer
                </button>
              </div>

              <div className="mt-5 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
                <aside className="grid gap-4">
                  <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <h3 className="font-bold text-slate-950">Photo</h3>
                    <div className="mt-3 flex flex-col items-center gap-3">
                      <div className="aspect-[7/9] w-40 overflow-hidden rounded-lg border border-slate-200 bg-white">
                        {photoEleveOuvert ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={photoEleveOuvert.dataUrl}
                            alt={`Photo de ${eleveOuvert.nom} ${eleveOuvert.prenom}`}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="grid h-full place-items-center px-2 text-center text-sm text-slate-500">
                            Aucune photo
                          </div>
                        )}
                      </div>
                      <label className="inline-flex cursor-pointer rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 focus-within:outline-none focus-within:ring-2 focus-within:ring-teal-100">
                        Importer une photo
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(event) => importerPhotoEleve(event.target.files?.[0])}
                          className="sr-only"
                        />
                      </label>
                    </div>
                  </section>

                  <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <h3 className="font-bold text-slate-950">Informations</h3>
                  <dl className="mt-3 grid gap-2 text-sm text-slate-800">
                    <div>
                      <dt className="font-semibold">Genre</dt>
                      <dd>{eleveOuvert.genre || "-"}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Coopérative</dt>
                      <dd>{eleveOuvert.cooperative || "-"}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Notes générales</dt>
                      <dd>{eleveOuvert.notes || "-"}</dd>
                    </div>
                  </dl>

                  <h3 className="mt-5 font-bold text-slate-950">Suivis cochés</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {colonnesBooleennes
                      .filter((colonne) => eleveOuvert[colonne.key])
                      .map((colonne) => (
                        <span
                          key={colonne.key}
                          className="rounded-full bg-teal-100 px-3 py-1 text-xs font-semibold text-teal-900"
                        >
                          {colonne.label}
                        </span>
                      ))}
                  </div>
                  </section>
                </aside>

                <section className="grid gap-5">
                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <h3 className="font-bold text-slate-950">Progrès par domaine</h3>
                    <div className="mt-4 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                      <svg viewBox="0 0 300 300" className="h-80 w-full">
                        {[20, 40, 60, 80, 100].map((niveau) => (
                          <circle
                            key={niveau}
                            cx="150"
                            cy="150"
                            r={(niveau / 100) * 105}
                            fill="none"
                            stroke="#cbd5e1"
                            strokeWidth="1"
                          />
                        ))}
                        <polygon points={pointsRadar()} fill="#0f766e66" stroke="#0f766e" strokeWidth="3" />
                        {progressionEleve.map((item, index) => {
                          const angle = (Math.PI * 2 * index) / progressionEleve.length - Math.PI / 2;
                          const x = 150 + Math.cos(angle) * 130;
                          const y = 150 + Math.sin(angle) * 130;
                          return (
                            <text key={item.domaine} x={x} y={y} textAnchor="middle" className="fill-slate-700 text-[10px]">
                              {item.domaine.slice(0, 18)}
                            </text>
                          );
                        })}
                      </svg>

                      <div className="grid gap-2 content-start">
                        {progressionEleve.length === 0 && (
                          <p className="rounded-md bg-slate-100 p-3 text-sm text-slate-700">
                            Aucune évaluation renseignée pour cet élève.
                          </p>
                        )}
                        {progressionEleve.map((item) => (
                          <div key={item.domaine} className="rounded-md bg-slate-100 p-3">
                            <div className="flex justify-between gap-3 text-sm">
                              <span className="font-semibold">{item.domaine}</span>
                              <span>{item.valeur}%</span>
                            </div>
                            <div className="mt-2 h-2 rounded-full bg-slate-200">
                              <div
                                className="h-2 rounded-full bg-teal-700"
                                style={{ width: `${item.valeur}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <h3 className="font-bold text-slate-950">Notes de suivi</h3>
                    <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
                      <textarea
                        value={nouvelleNote}
                        onChange={(event) => setNouvelleNote(event.target.value)}
                        placeholder="Incident, observation, échange avec la famille..."
                        className="min-h-24 resize-y rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                      />
                      <button
                        type="button"
                        onClick={ajouterNoteEleve}
                        className="rounded-md bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800"
                      >
                        Enregistrer la note
                      </button>
                    </div>

                    <div className="mt-4 grid gap-3">
                      {notesEleveOuvert.length === 0 && (
                        <p className="rounded-md bg-slate-100 p-3 text-sm text-slate-700">
                          Aucune note enregistrée pour cet élève.
                        </p>
                      )}
                      {notesEleveOuvert.map((note) => (
                        <article key={note.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                          <p className="text-xs font-semibold text-slate-500">
                            {new Date(note.date).toLocaleDateString("fr-FR")}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-slate-800">{note.texte}</p>
                        </article>
                      ))}
                    </div>
                  </div>
                </section>
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
