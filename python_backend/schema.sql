-- Supabase/Postgres contract for the production repositories.
-- Vector content remains in Pinecone; Postgres is the durable source of truth.

create extension if not exists pgcrypto;

create type public.ingestion_status as enum (
  'queued', 'validating', 'parsing', 'chunking', 'embedding',
  'indexing', 'verifying', 'completed', 'failed', 'cancelled'
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'admin', 'owner')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create or replace function public.is_organization_member(target uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (
  select 1 from public.organization_members
  where organization_id = target and user_id = auth.uid()
) $$;

create table public.documents (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  filename text not null,
  storage_bucket text not null default 'financial-documents',
  storage_key text not null,
  mime_type text,
  status text not null default 'processing',
  created_at timestamptz not null default now(),
  unique (organization_id, storage_key)
);

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id text not null references public.documents(id) on delete cascade,
  version integer not null,
  sha256 text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  page_count integer check (page_count >= 0),
  created_at timestamptz not null default now(),
  unique (document_id, version), unique (document_id, sha256)
);

create table public.pages (
  id uuid primary key default gen_random_uuid(),
  document_version_id uuid not null references public.document_versions(id) on delete cascade,
  page_number integer not null check (page_number > 0),
  source_type text not null default 'native_text',
  extracted_text text not null default '',
  extraction_confidence real check (extraction_confidence between 0 and 1),
  metadata jsonb not null default '{}'::jsonb,
  unique (document_version_id, page_number)
);

create table public.chunks (
  id text primary key,
  document_version_id uuid not null references public.document_versions(id) on delete cascade,
  page_start integer not null check (page_start > 0),
  page_end integer not null check (page_end >= page_start),
  section text,
  source_text text not null,
  embedding_text text not null,
  token_count integer not null check (token_count > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index chunks_document_version_idx on public.chunks(document_version_id);

create table public.ingestion_jobs (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_id text references public.documents(id) on delete set null,
  storage_key text not null,
  filename text not null,
  status public.ingestion_status not null default 'queued',
  progress smallint not null default 0 check (progress between 0 and 100),
  stage text not null default 'Queued',
  total_pages integer not null default 0,
  total_chunks integer not null default 0,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ingestion_jobs_org_created_idx on public.ingestion_jobs(organization_id, created_at desc);

create table public.vector_records (
  chunk_id text primary key references public.chunks(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pinecone_index text not null,
  pinecone_namespace text not null,
  vector_id text not null,
  indexed_at timestamptz not null default now(),
  unique (pinecone_index, pinecone_namespace, vector_id)
);

create table public.query_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  query text not null,
  filters jsonb not null default '{}'::jsonb,
  retrieval_ms real,
  created_at timestamptz not null default now()
);

create table public.answer_logs (
  id uuid primary key default gen_random_uuid(),
  query_id uuid not null references public.query_logs(id) on delete cascade,
  answer text not null,
  citations jsonb not null default '[]'::jsonb,
  generation_ms real,
  model text,
  created_at timestamptz not null default now()
);

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null references public.answer_logs(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  rating smallint check (rating in (-1, 1)),
  comment text,
  created_at timestamptz not null default now(),
  unique (answer_id, user_id)
);

create table public.evaluation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  git_sha text,
  corpus_version text not null,
  configuration jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.pages enable row level security;
alter table public.chunks enable row level security;
alter table public.ingestion_jobs enable row level security;
alter table public.vector_records enable row level security;
alter table public.query_logs enable row level security;
alter table public.answer_logs enable row level security;
alter table public.feedback enable row level security;
alter table public.evaluation_runs enable row level security;

create policy organization_member_access on public.organizations
  for select using (public.is_organization_member(id));
create policy member_roster_access on public.organization_members
  for select using (public.is_organization_member(organization_id));
create policy documents_member_access on public.documents
  for all using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id) and created_by = auth.uid());
create policy jobs_member_access on public.ingestion_jobs
  for all using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));
create policy vectors_member_access on public.vector_records
  for all using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));
create policy queries_member_access on public.query_logs
  for all using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id) and user_id = auth.uid());
create policy evaluations_member_access on public.evaluation_runs
  for select using (organization_id is null or public.is_organization_member(organization_id));

-- Child rows inherit authorization through their owning document/query.
create policy versions_member_access on public.document_versions for all using (
  exists (select 1 from public.documents d where d.id = document_id and public.is_organization_member(d.organization_id))
);
create policy pages_member_access on public.pages for all using (
  exists (select 1 from public.document_versions v join public.documents d on d.id = v.document_id
          where v.id = document_version_id and public.is_organization_member(d.organization_id))
);
create policy chunks_member_access on public.chunks for all using (
  exists (select 1 from public.document_versions v join public.documents d on d.id = v.document_id
          where v.id = document_version_id and public.is_organization_member(d.organization_id))
);
create policy answers_member_access on public.answer_logs for all using (
  exists (select 1 from public.query_logs q where q.id = query_id and public.is_organization_member(q.organization_id))
);
create policy feedback_owner_access on public.feedback for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Create the private Supabase Storage bucket separately if migrations cannot
-- write storage metadata: bucket=financial-documents, public=false, 100 MiB.
