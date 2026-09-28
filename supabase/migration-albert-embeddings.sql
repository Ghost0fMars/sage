-- À lancer dans Supabase > SQL Editor, APRÈS migration-rag.sql.
--
-- Contexte : SAGE utilisait les embeddings OpenAI (text-embedding-3-small, 1536
-- dimensions). Le passage à Albert API (bge-m3, 1024 dimensions) change l'espace
-- vectoriel : les anciens embeddings ne sont PAS compatibles avec les nouveaux
-- (une similarité cosinus entre les deux espaces n'a aucun sens).
--
-- ⚠️ Cette migration VIDE la table document_chunks. Les documents déjà indexés
-- (guides PDF, références JSON) doivent être ré-indexés après coup avec :
--   npm run index-docs -- ./dossier-guides
--   npx ts-node --project tsconfig.scripts.json scripts/index-json-references.ts

truncate table public.document_chunks;

alter table public.document_chunks
  alter column embedding type vector(1024);

drop index if exists document_chunks_embedding_idx;
create index document_chunks_embedding_idx
  on public.document_chunks
  using hnsw (embedding vector_cosine_ops);

drop function if exists public.match_document_chunks(vector(1536), int, float);

create or replace function public.match_document_chunks(
  query_embedding vector(1024),
  match_count     int   default 6,
  match_threshold float default 0.45
)
returns table (
  id          uuid,
  document_id uuid,
  content     text,
  similarity  float
)
language sql stable
as $$
  select
    dc.id,
    dc.document_id,
    dc.content,
    1 - (dc.embedding <=> query_embedding) as similarity
  from public.document_chunks dc
  where 1 - (dc.embedding <=> query_embedding) > match_threshold
  order by similarity desc
  limit match_count;
$$;

-- La table documents (métadonnées) redevient cohérente au prochain ré-indexage :
-- les scripts suppriment puis recréent chaque ligne "documents" avant d'insérer
-- les nouveaux chunks.
