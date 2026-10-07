"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, supabaseConfigured } from "../lib/supabase-client";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"connexion" | "inscription">("connexion");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function chargerStatutValidation() {
      if (!supabase) {
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;

      if (!user) {
        return;
      }

      const { data: acces } = await supabase
        .from("user_access")
        .select("status")
        .eq("user_id", user.id)
        .maybeSingle();

      if (acces?.status === "pending") {
        setMessage(
          "Votre compte est en attente de validation. Vous recevrez l'accès dès que l'administrateur aura accepté votre demande."
        );
      }

      if (acces?.status === "rejected") {
        setMessage("Votre demande d'accès n'a pas été acceptée pour le moment.");
      }
    }

    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const errorDescription =
      searchParams.get("error_description") ?? hashParams.get("error_description");
    const validation = searchParams.get("validation");

    if (validation === "pending") {
      setMessage(
        "Votre compte est en attente de validation. Vous recevrez l'accès dès que l'administrateur aura accepté votre demande."
      );
      return;
    }

    if (validation === "rejected") {
      setMessage("Votre demande d'accès n'a pas été acceptée pour le moment.");
      return;
    }

    if (errorDescription) {
      setMessage(
        errorDescription.includes("expired") || errorDescription.includes("invalid")
          ? "Le lien de confirmation est expiré ou invalide. Recréez le compte ou demandez un nouveau lien de confirmation."
          : errorDescription
      );
      return;
    }

    chargerStatutValidation();
  }, []);

  async function notifierDemandeInscription() {
    try {
      await fetch("/api/notify-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name: name.trim() || email
        })
      });
    } catch {
      // La notification ne doit pas bloquer l'inscription de l'enseignant.
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setMessage("Supabase n'est pas encore configuré dans les variables d'environnement.");
      return;
    }

    setLoading(true);
    setMessage("");

    const response =
      mode === "connexion"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: {
              data: { name: name.trim() || email },
              emailRedirectTo: `${window.location.origin}/auth`
            }
          });

    setLoading(false);

    if (response.error) {
      setMessage(response.error.message);
      return;
    }

    if (mode === "inscription") {
      await notifierDemandeInscription();
    }

    if (mode === "inscription" && !response.data.session) {
      setMessage(
        "Compte créé. Vérifiez votre email pour confirmer l'inscription. La demande restera ensuite en attente de validation par l'administrateur."
      );
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Compte</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">
          {mode === "connexion" ? "Connexion" : "Créer un compte"}
        </h1>
        <p className="mt-2 leading-7 text-slate-700">
          Connectez-vous pour sauvegarder les élèves, préparations, progressions et plannings.
        </p>

        {!supabaseConfigured && (
          <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            Ajoutez `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY` dans Vercel et dans `.env.local` pour activer la connexion.
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
          {mode === "inscription" && (
            <label className="grid gap-2 text-sm font-semibold text-slate-800">
              Nom affiché
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="rounded-md border border-slate-300 px-3 py-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
                placeholder="Prénom ou nom d'enseignant"
              />
            </label>
          )}

          <label className="grid gap-2 text-sm font-semibold text-slate-800">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="rounded-md border border-slate-300 px-3 py-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
              placeholder="enseignant@example.com"
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold text-slate-800">
            Mot de passe
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
              className="rounded-md border border-slate-300 px-3 py-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-focus"
              placeholder="6 caractères minimum"
            />
          </label>

          {message && (
            <p className="rounded-md bg-slate-100 p-3 text-sm text-slate-700">{message}</p>
          )}

          <button
            type="submit"
            disabled={loading || !supabaseConfigured}
            className="rounded-md bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
          >
            {loading ? "Chargement..." : mode === "connexion" ? "Se connecter" : "Créer le compte"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setMode(mode === "connexion" ? "inscription" : "connexion")}
          className="mt-4 text-sm font-semibold text-teal-700"
        >
          {mode === "connexion" ? "Créer un nouveau compte" : "J'ai déjà un compte"}
        </button>
      </section>
    </main>
  );
}
