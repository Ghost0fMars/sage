export type SlideKind =
  | "accroche"
  | "recherche"
  | "mise_en_commun"
  | "institutionnalisation"
  | "entrainement"
  | "synthese";

export type TextBlock = {
  id: string;
  type: "text";
  style?: "bullets" | "paragraph";
  lignes: string[];
};

export type ChartBlock = {
  id: string;
  type: "chart";
  chartType: "bar" | "line" | "pie";
  titre?: string;
  unite?: string;
  categories: string[];
  series: { nom: string; valeurs: number[] }[];
};

export type SchemaFrise = {
  id: string;
  type: "schema";
  variant: "frise";
  titre?: string;
  evenements: { date: string; label: string; description?: string }[];
};

export type SchemaCycle = {
  id: string;
  type: "schema";
  variant: "cycle";
  titre?: string;
  etapes: { label: string; description?: string }[];
};

export type SchemaEtapes = {
  id: string;
  type: "schema";
  variant: "etapes";
  titre?: string;
  etapes: { label: string; description?: string }[];
};

export type SchemaLegende = {
  id: string;
  type: "schema";
  variant: "legende";
  titre?: string;
  image?: { src: string };
  points: { numero: number; x: number; y: number; label: string }[];
};

export type SchemaComparaison = {
  id: string;
  type: "schema";
  variant: "comparaison";
  titre?: string;
  colonnes: { titre: string; points: string[] }[];
};

export type SchemaBlock =
  | SchemaFrise
  | SchemaCycle
  | SchemaEtapes
  | SchemaLegende
  | SchemaComparaison;

export type SlideMedia = {
  type: "image" | "youtube";
  src: string;
  legende?: string;
  disposition: "dessus" | "gauche" | "droite" | "fond";
};

export type MediaBlock = {
  id: string;
  type: "media";
  media: SlideMedia;
};

export type SlideBlock = TextBlock | ChartBlock | SchemaBlock | MediaBlock;

export type Slide = {
  id: string;
  titre: string;
  type: SlideKind | string;
  blocks: SlideBlock[];
  notes_enseignant: string;
  interaction: string;
};

export type CoursPresentation = {
  titre: string;
  niveau: string;
  objectif: string;
  slides: Slide[];
  deroule_projection: string[];
  materiel: string[];
};

export type CoursSauvegarde = {
  id: string;
  createdAt: string;
  preparedLessonId?: string;
  classeId?: string;
  cycle: string;
  niveau: string;
  domaine: string;
  sousDomaine: string;
  item: string;
  competence: string;
  sequenceTitle: string;
  seanceNumero: number;
  course: CoursPresentation;
};

// ─── Legacy on-disk shape (pre-blocks) ─────────────────────────────────────

type LegacySlideMedia = {
  type: "image" | "youtube";
  src: string;
  legende?: string;
  position: "dessus" | "gauche" | "droite" | "fond";
};

type LegacySlide = {
  titre: string;
  type: string;
  contenu?: string[];
  notes_enseignant: string;
  interaction: string;
  media?: LegacySlideMedia;
};

type LegacyOrCurrentSlide = Slide | LegacySlide;

function estDejaMigree(slide: LegacyOrCurrentSlide): slide is Slide {
  return Array.isArray((slide as Slide).blocks);
}

/**
 * Convertit un cours enregistré au format legacy (contenu: string[], media optionnel)
 * vers le format par blocs. Idempotente : un cours déjà migré est retourné tel quel.
 * À appeler à la lecture (localStorage/Supabase), jamais en réécriture forcée.
 */
export function migrerCoursLegacy(
  course: Omit<CoursPresentation, "slides"> & { slides: LegacyOrCurrentSlide[] }
): CoursPresentation {
  return {
    ...course,
    slides: course.slides.map((slide): Slide => {
      if (estDejaMigree(slide)) {
        return slide;
      }

      const blocks: SlideBlock[] = [];

      if (slide.contenu && slide.contenu.length > 0) {
        blocks.push({ id: crypto.randomUUID(), type: "text", lignes: slide.contenu });
      }

      if (slide.media) {
        blocks.push({
          id: crypto.randomUUID(),
          type: "media",
          media: {
            type: slide.media.type,
            src: slide.media.src,
            legende: slide.media.legende,
            disposition: slide.media.position
          }
        });
      }

      return {
        id: crypto.randomUUID(),
        titre: slide.titre,
        type: slide.type,
        blocks,
        notes_enseignant: slide.notes_enseignant,
        interaction: slide.interaction
      };
    })
  };
}

// ─── Validation / normalisation du cours généré par l'IA ──────────────────

const CHART_TYPES = new Set(["bar", "line", "pie"]);
const SCHEMA_VARIANTS = new Set(["frise", "cycle", "etapes", "legende", "comparaison"]);

function normaliserTextBlock(bloc: Record<string, unknown>): TextBlock | null {
  const lignesBrutes = bloc.lignes;
  if (!Array.isArray(lignesBrutes)) return null;
  const lignes = lignesBrutes.map((l) => String(l)).filter((l) => l.trim().length > 0);
  if (lignes.length === 0) return null;
  return {
    id: crypto.randomUUID(),
    type: "text",
    style: bloc.style === "paragraph" ? "paragraph" : "bullets",
    lignes
  };
}

function normaliserChartBlock(bloc: Record<string, unknown>): ChartBlock | null {
  const chartType = bloc.chartType;
  if (typeof chartType !== "string" || !CHART_TYPES.has(chartType)) return null;

  const categoriesBrutes = bloc.categories;
  if (!Array.isArray(categoriesBrutes)) return null;
  const categories = categoriesBrutes.map((c) => String(c));
  if (categories.length < 2 || categories.length > 8) return null;

  const seriesBrutes = bloc.series;
  if (!Array.isArray(seriesBrutes)) return null;
  let series = seriesBrutes
    .map((s): { nom: string; valeurs: number[] } | null => {
      if (typeof s !== "object" || s === null) return null;
      const serie = s as Record<string, unknown>;
      const valeursBrutes = serie.valeurs;
      if (!Array.isArray(valeursBrutes) || valeursBrutes.length !== categories.length) return null;
      const valeurs = valeursBrutes.map((v) => Number(v));
      if (valeurs.some((v) => !Number.isFinite(v))) return null;
      return { nom: typeof serie.nom === "string" ? serie.nom : "", valeurs };
    })
    .filter((s): s is { nom: string; valeurs: number[] } => s !== null);

  if (series.length === 0) return null;
  if (chartType === "pie") {
    series = [series[0]];
    if (series[0].valeurs.some((v) => v < 0)) return null;
  }
  if (series.length > 4) series = series.slice(0, 4);

  return {
    id: crypto.randomUUID(),
    type: "chart",
    chartType: chartType as ChartBlock["chartType"],
    titre: typeof bloc.titre === "string" ? bloc.titre : undefined,
    unite: typeof bloc.unite === "string" ? bloc.unite : undefined,
    categories,
    series
  };
}

function normaliserSchemaBlock(bloc: Record<string, unknown>): SchemaBlock | null {
  const variant = bloc.variant;
  if (typeof variant !== "string" || !SCHEMA_VARIANTS.has(variant)) return null;
  const titre = typeof bloc.titre === "string" ? bloc.titre : undefined;
  const id = crypto.randomUUID();

  if (variant === "frise") {
    const evenementsBrutes = bloc.evenements;
    if (!Array.isArray(evenementsBrutes)) return null;
    const evenements: { date: string; label: string; description?: string }[] = [];
    for (const e of evenementsBrutes) {
      if (typeof e !== "object" || e === null) continue;
      const ev = e as Record<string, unknown>;
      if (typeof ev.date !== "string" || typeof ev.label !== "string") continue;
      const description = typeof ev.description === "string" ? ev.description : undefined;
      evenements.push(description === undefined ? { date: ev.date, label: ev.label } : { date: ev.date, label: ev.label, description });
    }
    if (evenements.length < 2 || evenements.length > 8) return null;
    return { id, type: "schema", variant: "frise", titre, evenements };
  }

  if (variant === "cycle" || variant === "etapes") {
    const etapesBrutes = bloc.etapes;
    if (!Array.isArray(etapesBrutes)) return null;
    const etapes: { label: string; description?: string }[] = [];
    for (const e of etapesBrutes) {
      if (typeof e !== "object" || e === null) continue;
      const et = e as Record<string, unknown>;
      if (typeof et.label !== "string") continue;
      const description = typeof et.description === "string" ? et.description : undefined;
      etapes.push(description === undefined ? { label: et.label } : { label: et.label, description });
    }
    const min = variant === "cycle" ? 3 : 2;
    if (etapes.length < min || etapes.length > 8) return null;
    return variant === "cycle"
      ? { id, type: "schema", variant: "cycle", titre, etapes }
      : { id, type: "schema", variant: "etapes", titre, etapes };
  }

  if (variant === "legende") {
    const pointsBrutes = bloc.points;
    if (!Array.isArray(pointsBrutes)) return null;
    const points = pointsBrutes
      .map((p) => {
        if (typeof p !== "object" || p === null) return null;
        const pt = p as Record<string, unknown>;
        const numero = Number(pt.numero);
        const x = Number(pt.x);
        const y = Number(pt.y);
        if (!Number.isFinite(numero) || !Number.isFinite(x) || !Number.isFinite(y)) return null;
        if (typeof pt.label !== "string") return null;
        return { numero, x, y, label: pt.label };
      })
      .filter((p): p is { numero: number; x: number; y: number; label: string } => p !== null);
    if (points.length === 0) return null;
    return { id, type: "schema", variant: "legende", titre, points };
  }

  // comparaison
  const colonnesBrutes = bloc.colonnes;
  if (!Array.isArray(colonnesBrutes)) return null;
  const colonnes = colonnesBrutes
    .map((c) => {
      if (typeof c !== "object" || c === null) return null;
      const col = c as Record<string, unknown>;
      if (typeof col.titre !== "string" || !Array.isArray(col.points)) return null;
      const points = col.points.map((p) => String(p));
      return { titre: col.titre, points };
    })
    .filter((c): c is { titre: string; points: string[] } => c !== null);
  if (colonnes.length < 2 || colonnes.length > 3) return null;
  return { id, type: "schema", variant: "comparaison", titre, colonnes };
}

function normaliserBloc(bloc: unknown): SlideBlock | null {
  if (typeof bloc !== "object" || bloc === null) return null;
  const b = bloc as Record<string, unknown>;

  switch (b.type) {
    case "text":
      return normaliserTextBlock(b);
    case "chart":
      return normaliserChartBlock(b);
    case "schema":
      return normaliserSchemaBlock(b);
    // L'IA ne doit jamais produire de bloc "media" — les images/vidéos sont
    // ajoutées uniquement par l'enseignant. On l'ignore défensivement s'il en émet un.
    default:
      return null;
  }
}

/**
 * Valide et normalise un cours brut produit par l'IA. Contrairement à l'ancienne
 * validation stricte (tout ou rien), un bloc malformé fait tomber ce bloc, pas
 * toute la diapo : l'enseignant garde un cours exploitable et éditable.
 * Lève une erreur uniquement si le cours est structurellement inutilisable.
 */
export function normaliserEtValiderCours(coursBrut: unknown): CoursPresentation {
  if (typeof coursBrut !== "object" || coursBrut === null) {
    throw new Error("Le cours généré est incomplet.");
  }
  const c = coursBrut as Record<string, unknown>;

  if (
    typeof c.titre !== "string" ||
    typeof c.objectif !== "string" ||
    !Array.isArray(c.slides) ||
    c.slides.length < 3
  ) {
    throw new Error("Le cours généré est incomplet.");
  }

  const slides: Slide[] = c.slides.map((slideBrut): Slide => {
    const s = (typeof slideBrut === "object" && slideBrut !== null ? slideBrut : {}) as Record<
      string,
      unknown
    >;
    const blocsBrutes = Array.isArray(s.blocks) ? s.blocks : [];
    let blocks = blocsBrutes
      .map((b) => normaliserBloc(b))
      .filter((b): b is SlideBlock => b !== null)
      .slice(0, 3);

    const titre = typeof s.titre === "string" ? s.titre : "";

    if (blocks.length === 0) {
      blocks = [{ id: crypto.randomUUID(), type: "text", lignes: titre ? [titre] : [] }];
    }

    return {
      id: crypto.randomUUID(),
      titre,
      type: typeof s.type === "string" ? s.type : "cours",
      blocks,
      notes_enseignant: typeof s.notes_enseignant === "string" ? s.notes_enseignant : "",
      interaction: typeof s.interaction === "string" ? s.interaction : ""
    };
  });

  return {
    titre: c.titre,
    niveau: typeof c.niveau === "string" ? c.niveau : "",
    objectif: c.objectif,
    slides,
    deroule_projection: Array.isArray(c.deroule_projection) ? c.deroule_projection.map(String) : [],
    materiel: Array.isArray(c.materiel) ? c.materiel.map(String) : []
  };
}
