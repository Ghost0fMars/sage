/**
 * Indexe les fichiers JSON de références pédagogiques dans Supabase (pgvector).
 * Chaque entrée JSON devient un chunk avec son embedding.
 *
 * Usage :
 *   npx ts-node --project tsconfig.scripts.json scripts/index-json-references.ts
 *
 * Prérequis :
 *   - supabase/migration-rag.sql PUIS supabase/migration-albert-embeddings.sql exécutés
 *     dans Supabase > SQL Editor
 *   - .env.local avec ALBERT_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

import { readFileSync } from "fs";
import { join } from "path";
import { createClient } from "@supabase/supabase-js";

const ALBERT_API_KEY       = process.env.ALBERT_API_KEY ?? "";
const SUPABASE_URL         = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const EMBED_BATCH  = 48;
const INSERT_BATCH = 100;

type EmbeddingResponse = {
  data: { embedding: number[]; index: number }[];
};

async function embedBatch(texts: string[]): Promise<number[][]> {
  const response = await fetch("https://albert.api.etalab.gouv.fr/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ALBERT_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "bge-m3", input: texts }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Embeddings API : ${response.status} — ${err}`);
  }

  const data = (await response.json()) as EmbeddingResponse;
  return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

// ─── Formateur de contenu par type de fichier ──────────────────────────────

type EntryFormatter = (entry: Record<string, string>) => string | null;

const FORMATTERS: Record<string, EntryFormatter> = {
  "guides.json": (e) => {
    const parts = [
      e.titre_guide && `Guide : ${e.titre_guide}`,
      e.matiere && `Matière : ${e.matiere}`,
      e.cycle && `Cycle : ${e.cycle}`,
      e.niveau && `Niveau : ${e.niveau}`,
      e.section && `Section : ${e.section}`,
      e.contenu,
    ].filter(Boolean);
    return parts.length > 1 ? parts.join("\n") : null;
  },

  "code_education.json": (e) => {
    const parts = [
      e.titre && `Article : ${e.titre}`,
      e.partie && `Partie : ${e.partie}`,
      e.contenu,
    ].filter(Boolean);
    return parts.length > 1 ? parts.join("\n") : null;
  },

  "attendus.json": (e) => {
    const parts = [
      e.matiere && `Matière : ${e.matiere}`,
      e.niveau && `Niveau : ${e.niveau}`,
      e.domaine && `Domaine : ${e.domaine}`,
      e.competence && `Compétence : ${e.competence}`,
      e.criteres && `Critères : ${e.criteres}`,
      e.exemples && `Exemples : ${e.exemples}`,
    ].filter(Boolean);
    return parts.join("\n") || null;
  },

  "fiches.json": (e) => {
    const parts = [
      e.matiere && `Matière : ${e.matiere}`,
      e.titre && `Fiche : ${e.titre}`,
      e.section && `Section : ${e.section}`,
      e.contenu,
    ].filter(Boolean);
    return parts.length > 1 ? parts.join("\n") : null;
  },
};

// ─── Indexation d'un fichier JSON ─────────────────────────────────────────

async function indexJsonFile(
  filename: string,
  supabase: ReturnType<typeof createClient>
) {
  const filePath = join(process.cwd(), "references", filename);
  const entries = JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, string>[];
  const formatter = FORMATTERS[filename];

  if (!formatter) {
    console.log(`  Pas de formateur pour ${filename}, ignoré.`);
    return;
  }

  // 1 entrée JSON = 1 chunk, tronqué à 24 000 caractères (~6 000 tokens)
  const MAX_CHARS = 24_000;
  const chunks: string[] = [];
  for (const entry of entries) {
    const text = formatter(entry);
    if (!text || text.trim().length <= 40) continue;
    const trimmed = text.trim();
    chunks.push(trimmed.length > MAX_CHARS ? trimmed.slice(0, MAX_CHARS) : trimmed);
  }

  console.log(`\n  ${filename} : ${entries.length} entrées → ${chunks.length} chunks`);

  // Supprimer l'ancienne version
  await supabase.from("documents").delete().eq("filename", filename);

  // Créer le document
  const { data: doc, error: docErr } = await supabase
    .from("documents")
    .insert({ title: filename.replace(".json", ""), filename, chunk_count: chunks.length })
    .select()
    .single();

  if (docErr || !doc) {
    throw new Error(`Impossible d'insérer ${filename} : ${docErr?.message}`);
  }

  // Embeddings par lots
  let embedded = 0;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const batch = chunks.slice(i, i + EMBED_BATCH);
    const vecs = await embedBatch(batch);
    allEmbeddings.push(...vecs);
    embedded += batch.length;
    process.stdout.write(`\r  Embeddings : ${embedded}/${chunks.length}`);
  }
  process.stdout.write("\n");

  // Insertion dans Supabase
  const rows = chunks.map((content, i) => ({
    document_id: (doc as { id: string }).id,
    content,
    embedding: JSON.stringify(allEmbeddings[i]),
    chunk_index: i,
  }));

  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const { error } = await supabase
      .from("document_chunks")
      .insert(rows.slice(i, i + INSERT_BATCH));
    if (error) throw new Error(`Erreur Supabase : ${error.message}`);
  }

  console.log(`  Indexé : ${filename}`);
}

// ─── Point d'entrée ────────────────────────────────────────────────────────

async function main() {
  if (!ALBERT_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error(
      "Variables manquantes dans .env.local :\n" +
      "  ALBERT_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY"
    );
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const files = Object.keys(FORMATTERS);
  console.log(`\nIndexation de ${files.length} fichiers JSON de références...`);
  console.log(`Modèle : bge-m3 (Albert API)\n`);

  let success = 0;
  for (const file of files) {
    try {
      await indexJsonFile(file, supabase);
      success++;
    } catch (err) {
      console.error(`\nErreur ${file} : ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\n${success}/${files.length} fichier(s) indexé(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
