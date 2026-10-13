-- DB-003/004: universities, programs, rounds, sources, and field assertions.
create table public.universities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  short_name text,
  country_code text,
  city text,
  website_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint universities_website_url_check check (website_url is null or website_url ~* '^https?://')
);

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  university_id uuid not null references public.universities(id) on delete restrict,
  school_name text,
  program_name text not null,
  degree_name text,
  intake_year integer not null check (intake_year between 2000 and 2200),
  intake_term text not null default 'FALL' check (intake_term in ('SPRING', 'SUMMER', 'FALL', 'WINTER', 'UNKNOWN')),
  study_mode text not null default 'TAUGHT' check (study_mode in ('TAUGHT', 'RESEARCH', 'UNKNOWN')),
  duration_text text,
  rolling_admission boolean not null default false,
  application_open_date date,
  official_program_url text,
  official_application_url text,
  verification_status text not null default 'NEEDS_VERIFICATION' check (verification_status in ('VERIFIED', 'STALE', 'CONFLICT', 'NEEDS_VERIFICATION', 'UNKNOWN')),
  verified_at timestamptz,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint programs_url_check check ((official_program_url is null or official_program_url ~* '^https?://') and (official_application_url is null or official_application_url ~* '^https?://'))
);

create table public.application_rounds (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  name text not null,
  sort_order integer not null default 1 check (sort_order > 0),
  applicant_type text not null default 'GENERAL',
  open_date date,
  deadline_date date,
  deadline_time time,
  timezone text,
  deadline_precision text not null default 'DATE_ONLY' check (deadline_precision in ('DATE_ONLY', 'EXACT_TIME', 'UNKNOWN_TIME')),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint application_rounds_date_check check (open_date is null or deadline_date is null or deadline_date >= open_date),
  constraint application_rounds_time_check check ((deadline_precision = 'EXACT_TIME' and deadline_time is not null and timezone is not null) or deadline_precision <> 'EXACT_TIME'),
  unique (program_id, name, applicant_type)
);

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  source_type text not null check (source_type in ('OFFICIAL_PROGRAM', 'OFFICIAL_GRAD_SCHOOL', 'OFFICIAL_ADMISSION', 'OFFICIAL_PDF', 'SECONDARY', 'USER_INPUT', 'UNKNOWN')),
  title text,
  retrieved_at timestamptz,
  verified_at timestamptz,
  content_hash text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint sources_url_check check (url ~* '^https?://')
);

create table public.source_assertions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete restrict,
  program_id uuid not null references public.programs(id) on delete cascade,
  application_round_id uuid references public.application_rounds(id) on delete cascade,
  field_path text not null,
  observed_value jsonb not null,
  verification_status text not null default 'NEEDS_VERIFICATION' check (verification_status in ('VERIFIED', 'STALE', 'CONFLICT', 'NEEDS_VERIFICATION', 'UNKNOWN')),
  verified_at timestamptz,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger universities_set_updated_at before update on public.universities for each row execute function public.set_updated_at();
create trigger programs_set_updated_at before update on public.programs for each row execute function public.set_updated_at();
create trigger rounds_set_updated_at before update on public.application_rounds for each row execute function public.set_updated_at();
create trigger sources_set_updated_at before update on public.sources for each row execute function public.set_updated_at();
create trigger assertions_set_updated_at before update on public.source_assertions for each row execute function public.set_updated_at();
