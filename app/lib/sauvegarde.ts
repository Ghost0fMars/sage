"use client";

// Sauvegarde complète des données Sage de cet appareil (séances, séquences, planning,
// activités, cours, élèves, classes, profils) dans un fichier JSON. Les séances
// renvoient aux séquences et au planning : on sauvegarde donc tout l'ensemble.
// La clé API Albert est volontairement exclue du fichier.

const FORMAT = "sage-sauvegarde";
const VERSION = 1;
const CLES_EXCLUES = new Set(["sage-albert-api-key"]);

type Sauvegarde = {
  format: typeof FORMAT;
  version: number;
  exporteeLe: string;
  donnees: Record<string, string>;
};

function estCleSage(cle: string) {
  return (cle.startsWith("sage-") || cle.startsWith("sage:")) && !CLES_EXCLUES.has(cle);
}

function clesSage() {
  return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter(
    (cle): cle is string => cle !== null && estCleSage(cle)
  );
}

export function exporterSauvegarde() {
  const donnees: Record<string, string> = {};
  for (const cle of clesSage()) {
    donnees[cle] = localStorage.getItem(cle) ?? "";
  }

  const sauvegarde: Sauvegarde = {
    format: FORMAT,
    version: VERSION,
    exporteeLe: new Date().toISOString(),
    donnees
  };

  const blob = new Blob([JSON.stringify(sauvegarde)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = `sage-sauvegarde-${sauvegarde.exporteeLe.slice(0, 10)}.json`;
  lien.click();
  URL.revokeObjectURL(url);
}

export function lireSauvegarde(contenu: string): Sauvegarde {
  let sauvegarde: Partial<Sauvegarde>;
  try {
    sauvegarde = JSON.parse(contenu);
  } catch {
    throw new Error("Ce fichier n'est pas une sauvegarde Sage.");
  }

  if (sauvegarde?.format !== FORMAT || typeof sauvegarde.donnees !== "object" || !sauvegarde.donnees) {
    throw new Error("Ce fichier n'est pas une sauvegarde Sage.");
  }
  if ((sauvegarde.version ?? 0) > VERSION) {
    throw new Error("Cette sauvegarde vient d'une version plus récente de Sage : mettez Sage à jour.");
  }
  return sauvegarde as Sauvegarde;
}

// Remplace toutes les données Sage de cet appareil par celles de la sauvegarde.
// En cas d'échec (stockage plein), les données d'origine sont remises en place.
export function restaurerSauvegarde(sauvegarde: Sauvegarde) {
  const avant = clesSage().map((cle) => [cle, localStorage.getItem(cle) ?? ""] as const);
  const remplacer = (donnees: Iterable<readonly [string, unknown]>) => {
    for (const cle of clesSage()) {
      localStorage.removeItem(cle);
    }
    for (const [cle, valeur] of donnees) {
      if (estCleSage(cle) && typeof valeur === "string") {
        localStorage.setItem(cle, valeur);
      }
    }
  };

  try {
    remplacer(Object.entries(sauvegarde.donnees));
  } catch {
    remplacer(avant);
    throw new Error("Espace de stockage insuffisant : vos données actuelles ont été conservées.");
  }
}
