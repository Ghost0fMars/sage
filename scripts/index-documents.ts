/**
 * Script d'indexation des documents PDF dans Supabase (pgvector).
 *
 * Usage :
 *   npm run index-docs -- ./dossier-guides
 *
 * Prérequis :
 *   - Avoir exécuté supabase/migration-rag.sql PUIS supabase/migration-albert-embeddings.sql
 *     dans Supabase > SQL Editor
 *   - .env.local avec ALBERT_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

import { readFileSync, readdirSync } from "fs";
import { basename, join, extname } from "path";
import { createClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse") as (
  buf: Buffer
) => Promise<{ text: string; numpages: number }>;

const ALBERT_API_KEY      = process.env.ALBERT_API_KEY ?? "";
const SUPABASE_URL        = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const CHUNK_WORDS   = 500;
const OVERLAP_WORDS = 60;
const EMBED_BATCH   = 48;   // nombre de blocs envoyés par appel à l'API embeddings
const INSERT_BATCH  = 100;  // nombre de lignes insérées par appel Supabase

// ─── Découpage en blocs ────────────────────────────────────────────────────

function chunkText(text: string): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const chunks: string[] = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + CHUNK_WORDS, words.length);
    const chunk = words.slice(start, end).join(" ");
    if (chunk.trim().length > 80) chunks.push(chunk);
    start += CHUNK_WORDS - OVERLAP_WORDS;
  }

  return chunks;
}

// ─── Embeddings (traitement par lots) ─────────────────────────────────────

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
  return data.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

// ─── Indexation d'un PDF ───────────────────────────────────────────────────

async function indexPDF(
  filePath: string,
  supabase: ReturnType<typeof createClient>
) {
  const filename = basename(filePath);
  const title    = basename(filePath, extname(filePath));

  process.stdout.write(`\n📄 ${filename}\n`);

  // Lecture + extraction du texte
  const buffer  = readFileSync(filePath);
  const pdfData = await pdfParse(buffer);
  const text    = pdfData.text.replace(/\s+/g, " ").trim();

  process.stdout.write(`   ${pdfData.numpages} pages extraites\n`);

  // Découpage
  const chunks = chunkText(text);
  process.stdout.write(`   ${chunks.length} blocs de ~${CHUNK_WORDS} mots\n`);

  // Suppression de l'ancienne version si elle existe
  await supabase.from("documents").delete().eq("filename", filename);

  // Insertion du document
  const { data: doc, error: docErr } = await supabase
    .from("documents")
    .insert({ title, filename, chunk_count: chunks.length })
    .select()
    .single();

  if (docErr ?? !doc) {
    throw new Error(`Impossible d'insérer le document : ${docErr?.message}`);
  }

  // Embeddings par lots
  let embedded = 0;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const batch = chunks.slice(i, i + EMBED_BATCH);
    const vecs  = await embedBatch(batch);
    allEmbeddings.push(...vecs);
    embedded += batch.length;
    process.stdout.write(`\r   Embeddings : ${embedded}/${chunks.length}`);
  }
  process.stdout.write("\n");

  // Insertion dans Supabase par lots
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

    if (error) throw new Error(`Erreur d'insertion Supabase : ${error.message}`);
  }

  process.stdout.write(`   ✅ Indexation terminée\n`);
}

// ─── Point d'entrée ────────────────────────────────────────────────────────

async function main() {
  const folder = process.argv[2];

  if (!folder) {
    console.error("Usage : npm run index-docs -- <dossier>");
    process.exit(1);
  }

  if (!ALBERT_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error(
      "Variables manquantes dans .env.local :\n" +
      "  ALBERT_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY"
    );
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const files = readdirSync(folder)
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .map((f) => join(folder, f));

  if (files.length === 0) {
    console.error(`Aucun fichier PDF trouvé dans : ${folder}`);
    process.exit(1);
  }

  console.log(`\n🔍 ${files.length} PDF(s) détecté(s) dans ${folder}`);
  console.log(`   Modèle : bge-m3 (Albert API — gratuit pour les agents publics)\n`);

  let success = 0;

  for (const file of files) {
    try {
      await indexPDF(file, supabase);
      success++;
    } catch (err) {
      console.error(`\n❌ ${basename(file)} : ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\n🎉 ${success}/${files.length} document(s) indexé(s) avec succès.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
