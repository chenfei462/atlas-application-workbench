-- DB-005: applications and normalized program requirements.
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete restrict,
  target_round_id uuid references public.application_rounds(id) on delete set null,
  status text not null default 'INTERESTED' check (status in ('INTERESTED', 'SHORTLISTED', 'PLANNING', 'PREPARING', 'READY', 'IN_PROGRESS', 'WAITING_RECOMMENDATION', 'READY_TO_SUBMIT', 'SUBMITTED', 'UNDER_REVIEW', 'INTERVIEW', 'WAITLIST', 'OFFER', 'REJECTED', 'WITHDRAWN', 'CLOSED')),
  priority text not null default 'MEDIUM' check (priority in ('LOW', 'MEDIUM', 'HIGH')),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (owner_id, program_id)
);

create table public.program_material_requirements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  material_type text not null,
  label text not null,
  required boolean not null default true,
  quantity integer not null default 1 check (quantity > 0),
  notes text,
  source_id uuid references public.sources(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (program_id, material_type, label)
);

create table public.program_test_requirements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  test_type text not null check (test_type in ('TOEFL', 'IELTS', 'GRE', 'GMAT', 'OTHER')),
  required boolean not null default true,
  minimum_overall numeric,
  waiver_allowed boolean not null default false,
  minimum_sections jsonb not null default '{}'::jsonb,
  notes text,
  source_id uuid references public.sources(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (minimum_overall is null or minimum_overall >= 0),
  unique (program_id, test_type)
);

create table public.program_essay_requirements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  essay_type text not null,
  prompt text,
  word_limit integer check (word_limit is null or word_limit > 0),
  character_limit integer check (character_limit is null or character_limit > 0),
  required boolean not null default true,
  source_id uuid references public.sources(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (program_id, essay_type)
);

create table public.program_recommendation_requirements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  required_count integer not null default 0 check (required_count >= 0),
  maximum_count integer not null default 0 check (maximum_count >= required_count),
  notes text,
  source_id uuid references public.sources(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (program_id)
);

create trigger applications_set_updated_at before update on public.applications for each row execute function public.set_updated_at();
create trigger material_requirements_set_updated_at before update on public.program_material_requirements for each row execute function public.set_updated_at();
create trigger test_requirements_set_updated_at before update on public.program_test_requirements for each row execute function public.set_updated_at();
create trigger essay_requirements_set_updated_at before update on public.program_essay_requirements for each row execute function public.set_updated_at();
create trigger recommendation_requirements_set_updated_at before update on public.program_recommendation_requirements for each row execute function public.set_updated_at();
