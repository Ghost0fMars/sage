"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { readUserData, writeUserData } from "../lib/user-storage";
import {
  ALBERT_KEY_HEADER,
  ecrireCleAlbert,
  ecrireModeleAlbert,
  lireCleAlbert,
  lireModeleAlbert
} from "../lib/albert-settings";
import { extraireTextePdf } from "../lib/pdf-text";
import { CLASSES_STORAGE_KEY, Classe, NIVEAUX_SCOLAIRES, lireClasses } from "../lib/classes";

const PROFILE_KEY = "sage-profile";
const REGLEMENT_STORAGE_KEY = "sage-reglement-interieur";
const REGLEMENT_TAILLE_MAX = 8 * 1024 * 1024;
const HELP_EMAIL = "contact@alacle.org";

type Profile = {
  firstName: string;
  lastName: string;
  school: string;
};

type ReglementInterieur = {
  nom: string;
  type: string;
  tailleOctets: number;
  dataUrl: string;
  importeLe: string;
  texte: string;
  texteTronque: boolean;
};

export default function ParametresPage() {
  const [form, setForm] = useState<Profile>({
    firstName: "",
    lastName: "",
    school: "",
  });
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [reglement, setReglement] = useState<ReglementInterieur | null>(null);
  const [reglementErreur, setReglementErreur] = useState("");
  const [reglementEnCours, setReglementEnCours] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [classes, setClasses] = useState<Classe[]>([]);
  const [cleAlbert, setCleAlbert] = useState("");
  const [cleVisible, setCleVisible] = useState(false);
  const [modeleAlbert, setModeleAlbert] = useState("");
  const [modelesAlbert, setModelesAlbert] = useState<string[]>([]);
  const [albertMessage, setAlbertMessage] = useState("");
  const [albertEnCours, setAlbertEnCours] = useState(false);

  useEffect(() => {
    const cle = lireCleAlbert();
    setCleAlbert(cle);
    setModeleAlbert(lireModeleAlbert());
    void chargerModeles(cle);
  }, []);

  // Sans clé personnelle, interroge la clé intégrée à Sage (ALBERT_API_KEY du serveur).
  async function chargerModeles(cle: string) {
    setAlbertEnCours(true);
    setAlbertMessage("");

    try {
      const response = await fetch("/api/albert-models", cle ? { headers: { [ALBERT_KEY_HEADER]: cle } } : undefined);
      const data = (await response.json()) as { modeles?: string[]; error?: string };

      if (!response.ok || !data.modeles) {
        setModelesAlbert([]);
        setAlbertMessage(cle ? data.error ?? "Impossible de récupérer les modèles." : "");
        return;
      }

      setModelesAlbert(data.modeles);
      setAlbertMessage(
        cle
          ? `Clé valide : ${data.modeles.length} modèle(s) disponible(s).`
          : `Clé intégrée à Sage active : ${data.modeles.length} modèle(s) disponible(s).`
      );
    } catch {
      setAlbertMessage("Impossible de joindre le serveur.");
    } finally {
      setAlbertEnCours(false);
    }
  }

  async function connecterAlbert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cle = cleAlbert.trim();
    ecrireCleAlbert(cle);

    if (!cle) {
      ecrireModeleAlbert("");
      setModeleAlbert("");
    }

    await chargerModeles(cle);
  }

  function choisirModele(modele: string) {
    setModeleAlbert(modele);
    ecrireModeleAlbert(modele);
  }

  useEffect(() => {
    try {
      const stored = localStorage.getItem(PROFILE_KEY);
      if (stored) {
        const profile = JSON.parse(stored) as Profile;
        setForm(profile);
      }
    } catch {
      // ignore
    }
    setReglement(readUserData<ReglementInterieur | null>(REGLEMENT_STORAGE_KEY, null));
    setClasses(lireClasses());
  }, []);

  function enregistrerClasses(prochainesClasses: Classe[]) {
    setClasses(prochainesClasses);
    writeUserData(CLASSES_STORAGE_KEY, prochainesClasses);
  }

  function modifierClasse(id: string, miseAJour: Partial<Classe>) {
    enregistrerClasses(classes.map((classe) => (classe.id === id ? { ...classe, ...miseAJour } : classe)));
  }

  function basculerNiveau(classe: Classe, niveau: string) {
    modifierClasse(classe.id, {
      niveaux: classe.niveaux.includes(niveau)
        ? classe.niveaux.filter((n) => n !== niveau)
        : NIVEAUX_SCOLAIRES.filter((n) => n === niveau || classe.niveaux.includes(n))
    });
  }

  function supprimerClasse(classe: Classe) {
    if (!window.confirm(`Supprimer la classe « ${classe.nom} » ?`)) return;
    enregistrerClasses(classes.filter((c) => c.id !== classe.id));
  }

  function updateField(field: keyof Profile, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function importerReglement(fichier: File | undefined) {
    if (!fichier) return;
    setReglementErreur("");

    if (fichier.type !== "application/pdf" && !fichier.type.startsWith("image/")) {
      setReglementErreur("Formats acceptés : PDF ou image.");
      return;
    }
    if (fichier.size > REGLEMENT_TAILLE_MAX) {
      setReglementErreur("Le fichier dépasse la taille maximale (8 Mo).");
      return;
    }

    setReglementEnCours(true);
    const lecteur = new FileReader();
    lecteur.onload = async () => {
      const dataUrl = String(lecteur.result);
      let texte = "";
      let texteTronque = false;

      if (fichier.type === "application/pdf") {
        try {
          const extraction = await extraireTextePdf(dataUrl);
          texte = extraction.texte;
          texteTronque = extraction.tronque;
        } catch {
          texte = "";
        }
      }

      const prochainReglement: ReglementInterieur = {
        nom: fichier.name,
        type: fichier.type,
        tailleOctets: fichier.size,
        dataUrl,
        importeLe: new Date().toISOString(),
        texte,
        texteTronque
      };
      setReglement(prochainReglement);
      writeUserData(REGLEMENT_STORAGE_KEY, prochainReglement);
      setReglementEnCours(false);
    };
    lecteur.onerror = () => {
      setReglementErreur("Impossible de lire ce fichier.");
      setReglementEnCours(false);
    };
    lecteur.readAsDataURL(fichier);
  }

  function supprimerReglement() {
    const confirmation = window.confirm("Supprimer le règlement intérieur importé ?");
    if (!confirmation) return;
    setReglement(null);
    writeUserData(REGLEMENT_STORAGE_KEY, null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function formaterTaille(octets: number) {
    return octets < 1024 * 1024
      ? `${Math.round(octets / 1024)} Ko`
      : `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
  }

  function sauvegarderProfil(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      localStorage.setItem(
        PROFILE_KEY,
        JSON.stringify({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          school: form.school.trim(),
        })
      );
      setMessage("Profil enregistré.");
    } catch {
      setMessage("Impossible d'enregistrer le profil.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-3xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
              Paramètres
            </p>
            <h1 className="mt-2 text-3xl font-bold text-slate-950">Compte enseignant</h1>
            <p className="mt-2 leading-7 text-slate-700">
              Gérez vos informations personnelles et la configuration de l&apos;IA.
            </p>
          </div>
          <a
            href="/"
            className="rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100"
          >
            Tableau de bord
          </a>
        </div>

        <form
          onSubmit={sauvegarderProfil}
          className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h2 className="text-xl font-bold text-slate-950">Informations personnelles</h2>
          <p className="mt-1 text-base text-slate-500">
            Stockées uniquement sur votre ordinateur.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold text-slate-800">
              Prénom
              <input
                value={form.firstName}
                onChange={(event) => updateField("firstName", event.target.value)}
                className="rounded-md border border-slate-300 px-3 py-3 text-base outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
                placeholder="Prénom"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-slate-800">
              Nom
              <input
                value={form.lastName}
                onChange={(event) => updateField("lastName", event.target.value)}
                className="rounded-md border border-slate-300 px-3 py-3 text-base outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
                placeholder="Nom"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-slate-800 sm:col-span-2">
              École
              <input
                value={form.school}
                onChange={(event) => updateField("school", event.target.value)}
                className="rounded-md border border-slate-300 px-3 py-3 text-base outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
                placeholder="Nom de l'école ou de l'établissement"
              />
            </label>
          </div>

          {message && (
            <p className="mt-4 rounded-md bg-slate-100 p-3 text-base text-slate-700">{message}</p>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
            >
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
            <a
              href={`mailto:${HELP_EMAIL}?subject=Aide%20Sage`}
              className="rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100"
            >
              Demander de l&apos;aide
            </a>
          </div>
        </form>

        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-bold text-slate-950">Mes classes</h2>
          <p className="mt-2 leading-7 text-slate-700">
            Ajoutez chaque classe dont vous vous occupez et cochez ses niveaux : plusieurs niveaux
            pour une classe multi-niveaux (ex. CE2-CM1), plusieurs classes au collège (ex. 5ème A,
            4ème B). Les élèves et la préparation des séquences s&apos;y adaptent.
          </p>

          <div className="mt-5 grid gap-3">
            {classes.map((classe) => (
              <div key={classe.id} className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    value={classe.nom}
                    onChange={(event) => modifierClasse(classe.id, { nom: event.target.value })}
                    aria-label="Nom de la classe"
                    placeholder="Nom de la classe"
                    className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
                  />
                  <button
                    type="button"
                    onClick={() => supprimerClasse(classe)}
                    className="rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-focus"
                  >
                    Supprimer
                  </button>
                </div>
                <fieldset className="mt-3 flex flex-wrap gap-2">
                  <legend className="sr-only">Niveaux de {classe.nom}</legend>
                  {NIVEAUX_SCOLAIRES.map((niveau) => (
                    <label
                      key={niveau}
                      className={`cursor-pointer rounded-full border px-3 py-1 text-sm font-semibold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-teal-300 ${
                        classe.niveaux.includes(niveau)
                          ? "border-teal-700 bg-teal-700 text-white"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={classe.niveaux.includes(niveau)}
                        onChange={() => basculerNiveau(classe, niveau)}
                        className="sr-only"
                      />
                      {niveau}
                    </label>
                  ))}
                </fieldset>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() =>
              enregistrerClasses([
                ...classes,
                { id: crypto.randomUUID(), nom: `Classe ${classes.length + 1}`, niveaux: [] }
              ])
            }
            className="mt-4 rounded-md bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800"
          >
            Ajouter une classe
          </button>
        </section>

        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-bold text-slate-950">Assistant IA</h2>
          <p className="mt-2 leading-7 text-slate-700">
            L&apos;assistant IA de Sage est propulsé par <strong>Albert</strong>, l&apos;API
            d&apos;intelligence artificielle de l&apos;État (DINUM / Etalab). Une clé API
            personnelle est conseillée : les données restent hébergées en France, sous droit français.
          </p>
          <a
            href="https://albert.playground.etalab.gouv.fr/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block text-sm font-semibold text-teal-700 underline underline-offset-2 hover:text-teal-800"
          >
            Se connecter pour récupérer une clé API Albert
          </a>

          <form onSubmit={connecterAlbert} className="mt-5 grid gap-4">
            <label className="grid gap-2 text-sm font-semibold text-slate-800">
              Clé API Albert
              <span className="flex gap-2">
                <input
                  type={cleVisible ? "text" : "password"}
                  value={cleAlbert}
                  onChange={(event) => setCleAlbert(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-3 text-base outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
                  placeholder="Facultatif : clé intégrée à Sage utilisée par défaut"
                />
                <button
                  type="button"
                  onClick={() => setCleVisible(!cleVisible)}
                  className="rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
                >
                  {cleVisible ? "Masquer" : "Afficher"}
                </button>
              </span>
            </label>

            <label className="grid gap-2 text-sm font-semibold text-slate-800">
              Modèle
              <select
                value={modeleAlbert}
                onChange={(event) => choisirModele(event.target.value)}
                disabled={modelesAlbert.length === 0}
                className="rounded-md border border-slate-300 bg-white px-3 py-3 text-base outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus disabled:bg-slate-100 disabled:text-slate-400"
              >
                <option value="">Modèle par défaut</option>
                {modeleAlbert && !modelesAlbert.includes(modeleAlbert) && (
                  <option value={modeleAlbert}>{modeleAlbert}</option>
                )}
                {modelesAlbert.map((modele) => (
                  <option key={modele} value={modele}>
                    {modele}
                  </option>
                ))}
              </select>
              {modelesAlbert.length === 0 && (
                <span className="text-sm font-normal text-slate-600">
                  Saisissez une clé API pour choisir un modèle.
                </span>
              )}
            </label>

            {albertMessage && (
              <p className="rounded-md bg-slate-100 p-3 text-base text-slate-700" role="status">
                {albertMessage}
              </p>
            )}

            <div>
              <button
                type="submit"
                disabled={albertEnCours}
                className="rounded-md bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-wait disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
              >
                {albertEnCours ? "Connexion..." : "Se connecter et lister les modèles"}
              </button>
            </div>
            <p className="text-sm text-slate-600">
              La clé est conservée uniquement sur cet appareil et n&apos;est pas synchronisée avec
              votre compte.
            </p>
          </form>
        </section>

        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-bold text-slate-950">Règlement intérieur de l&apos;établissement</h2>
          <p className="mt-2 leading-7 text-slate-700">
            Importez le règlement intérieur de votre école pour l&apos;avoir toujours sous la main.
            Stocké uniquement sur votre ordinateur (et synchronisé si vous êtes connecté).
          </p>

          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/*"
            onChange={(event) => importerReglement(event.target.files?.[0])}
            className="sr-only"
          />

          {reglement ? (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-4">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-950">{reglement.nom}</p>
                <p className="mt-0.5 text-base text-slate-500">
                  {formaterTaille(reglement.tailleOctets)} · importé le{" "}
                  {new Date(reglement.importeLe).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric"
                  })}
                </p>
                {reglement.texte ? (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>
                    L&apos;assistant IA peut répondre à ce sujet
                    {reglement.texteTronque ? " (début du document)" : ""}
                  </p>
                ) : (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>
                    {reglement.type === "application/pdf"
                      ? "Texte non détecté (PDF scanné ?) — l'assistant ne peut pas s'en servir"
                      : "Format image — l'assistant ne peut pas encore lire ce document"}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={reglement.dataUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-focus"
                >
                  Voir
                </a>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-focus"
                >
                  Remplacer
                </button>
                <button
                  type="button"
                  onClick={supprimerReglement}
                  className="rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-focus"
                >
                  Supprimer
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={reglementEnCours}
              className="mt-5 flex items-center gap-2 rounded-md border border-dashed border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700 focus:outline-none focus:ring-2 focus:ring-focus disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
              </svg>
              {reglementEnCours ? "Import en cours..." : "Importer le règlement intérieur"}
            </button>
          )}

          {reglementErreur && (
            <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-base text-red-900">
              {reglementErreur}
            </p>
          )}
        </section>
      </section>
    </main>
  );
}
