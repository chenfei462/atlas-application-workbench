-- DB-006/007: material versions, evidence, essays, and recommender data.
create table public.materials (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  status text not null default 'MISSING' check (status in ('MISSING', 'DRAFT', 'UPLOADED', 'CONFIRMED', 'EXPIRED', 'REJECTED')),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.material_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  variant text not null default 'GENERAL',
  storage_path text,
  original_filename text,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  sha256 text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (material_id, version_number)
);

create table public.application_materials (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  requirement_id uuid not null references public.program_material_requirements(id) on delete restrict,
  material_version_id uuid references public.material_versions(id) on delete set null,
  status text not null default 'MISSING' check (status in ('MISSING', 'IN_PROGRESS', 'COMPLETE', 'BLOCKED')),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (application_id, requirement_id)
);

create table public.evidence_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  organization text,
  role text,
  start_date date,
  end_date date,
  description text,
  responsibilities text[] not null default '{}',
  achievements text[] not null default '{}',
  metrics text[] not null default '{}',
  skills text[] not null default '{}',
  technologies text[] not null default '{}',
  verified boolean not null default false,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table public.essays (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  program_essay_requirement_id uuid references public.program_essay_requirements(id) on delete set null,
  type text not null,
  status text not null default 'NOT_STARTED' check (status in ('NOT_STARTED', 'OUTLINE', 'DRAFT', 'REVISING', 'FACT_CHECK', 'FINAL', 'SUBMITTED')),
  deadline_date date,
  current_version_number integer check (current_version_number is null or current_version_number > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.essay_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  essay_id uuid not null references public.essays(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  content text not null default '',
  word_count integer not null default 0 check (word_count >= 0),
  content_hash text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (essay_id, version_number)
);

create table public.essay_evidence_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  essay_version_id uuid not null references public.essay_versions(id) on delete cascade,
  evidence_item_id uuid not null references public.evidence_items(id) on delete restrict,
  claim_note text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (essay_version_id, evidence_item_id)
);

create table public.recommenders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  title text,
  organization text,
  relationship text,
  email text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.recommendation_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  recommender_id uuid not null references public.recommenders(id) on delete restrict,
  status text not null default 'NOT_REQUESTED' check (status in ('NOT_REQUESTED', 'REQUESTED', 'ACCEPTED', 'SUBMITTED', 'OVERDUE', 'WAIVED')),
  requested_at timestamptz,
  accepted_at timestamptz,
  submitted_at timestamptz,
  due_date date,
  reminder_at timestamptz,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (application_id, recommender_id)
);

create trigger materials_set_updated_at before update on public.materials for each row execute function public.set_updated_at();
create trigger application_materials_set_updated_at before update on public.application_materials for each row execute function public.set_updated_at();
create trigger evidence_set_updated_at before update on public.evidence_items for each row execute function public.set_updated_at();
create trigger essays_set_updated_at before update on public.essays for each row execute function public.set_updated_at();
create trigger recommenders_set_updated_at before update on public.recommenders for each row execute function public.set_updated_at();
create trigger recommendation_requests_set_updated_at before update on public.recommendation_requests for each row execute function public.set_updated_at();
