// Consigne ajoutée aux prompts IA quand la classe regroupe plusieurs niveaux.
export function consigneMultiNiveaux(niveauxClasse: unknown) {
  if (!Array.isArray(niveauxClasse)) return "";
  const niveaux = niveauxClasse
    .filter((n): n is string => typeof n === "string" && n.length > 0 && n.length <= 20)
    .slice(0, 12);
  if (niveaux.length < 2) return "";

  return `

Classe multi-niveaux (${niveaux.join(", ")}) : tous ces niveaux travaillent en même temps dans la même salle.
- Garde des moments communs (amorce, mise en commun) quand c'est pertinent.
- Différencie explicitement par niveau la recherche, l'entraînement, les consignes et les attendus, en nommant chaque niveau.
- Organise l'alternance : un groupe en autonomie pendant que l'enseignant accompagne l'autre.`;
}
