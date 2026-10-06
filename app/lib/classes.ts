"use client";

import { readUserData } from "./user-storage";

export type Classe = {
  id: string;
  nom: string;
  niveaux: string[];
};

export const CLASSES_STORAGE_KEY = "sage-classes";

// Libellés identiques à la colonne « Niveau » du référentiel de compétences.
export const NIVEAUX_SCOLAIRES = [
  "PS", "MS", "GS", "CP", "CE1", "CE2", "CM1", "CM2", "6ème", "5ème", "4ème", "3ème"
];

export function lireClasses() {
  return readUserData<Classe[]>(CLASSES_STORAGE_KEY, []);
}

export function niveauxEnseignes(classes: Classe[]) {
  const niveaux = new Set(classes.flatMap((classe) => classe.niveaux));
  return NIVEAUX_SCOLAIRES.filter((niveau) => niveaux.has(niveau));
}

// ponytail: contenus sans classeId (anciens ou dérivés) rattachés par niveau ; deux classes du même niveau les partagent.
export function appartientALaClasse(item: { classeId?: string; niveau?: string }, classe: Classe) {
  return item.classeId ? item.classeId === classe.id : classe.niveaux.includes(item.niveau ?? "");
}
