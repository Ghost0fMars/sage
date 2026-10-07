"use client";

// La clé reste dans le navigateur de l'enseignant (jamais synchronisée dans le cloud)
// et n'est transmise qu'aux routes /api de Sage, qui la relaient à Albert.
const KEY_STORAGE = "sage-albert-api-key";
const MODEL_STORAGE = "sage-albert-model";

export const ALBERT_KEY_HEADER = "x-albert-key";
export const ALBERT_MODEL_HEADER = "x-albert-model";

const ROUTES_SANS_CLE = ["/api/delete-account", "/api/notify-signup"];

function lire(cle: string) {
  try {
    return localStorage.getItem(cle) ?? "";
  } catch {
    return "";
  }
}

function ecrire(cle: string, valeur: string) {
  if (valeur) localStorage.setItem(cle, valeur);
  else localStorage.removeItem(cle);
}

export const lireCleAlbert = () => lire(KEY_STORAGE);
export const lireModeleAlbert = () => lire(MODEL_STORAGE);
export const ecrireCleAlbert = (cle: string) => ecrire(KEY_STORAGE, cle.trim());
export const ecrireModeleAlbert = (modele: string) => ecrire(MODEL_STORAGE, modele.trim());

// Ajoute la clé et le modèle choisis à chaque appel aux routes /api de Sage.
export function installerFetchAlbert() {
  const w = window as typeof window & { __albertFetch?: boolean };
  if (w.__albertFetch) return;
  w.__albertFetch = true;

  const fetchOriginal = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
    const chemin = url.startsWith("/") ? url : url.startsWith(window.location.origin) ? new URL(url).pathname : "";
    const cle = lireCleAlbert();

    if (!chemin.startsWith("/api/") || ROUTES_SANS_CLE.some((r) => chemin.startsWith(r)) || !cle) {
      return fetchOriginal(input, init);
    }

    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (!headers.has(ALBERT_KEY_HEADER)) headers.set(ALBERT_KEY_HEADER, cle);
    const modele = lireModeleAlbert();
    if (modele && !headers.has(ALBERT_MODEL_HEADER)) headers.set(ALBERT_MODEL_HEADER, modele);
    return fetchOriginal(input, { ...init, headers });
  };
}
