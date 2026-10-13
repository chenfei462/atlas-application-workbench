-- DB-008/009/010: portal, submission, tasks, inbox, decisions, and audit events.
create table public.portal_sections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  section_key text not null,
  status text not null default 'NOT_STARTED' check (status in ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETE', 'BLOCKED')),
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  notes text,
  updated_at timestamptz not null default timezone('utc', now()),
  unique (application_id, section_key)
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  submitted_at timestamptz not null,
  application_number text,
  confirmation_received boolean not null default false,
  payment_amount numeric(12, 2) check (payment_amount is null or payment_amount >= 0),
  payment_currency text,
  receipt_storage_path text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (application_id)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid references public.applications(id) on delete cascade,
  source_type text not null default 'MANUAL' check (source_type in ('MANUAL', 'BLOCKER_ENGINE', 'DEADLINE_ENGINE', 'INBOX')),
  source_key text,
  title text not null,
  description text,
  status text not null default 'OPEN' check (status in ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED')),
  priority text not null default 'MEDIUM' check (priority in ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
  due_at timestamptz,
  manual boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  unique (owner_id, source_type, source_key)
);

create table public.inbox_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid references public.applications(id) on delete set null,
  external_message_id text,
  type text not null check (type in ('APPLICATION_CONFIRMATION', 'MISSING_DOCUMENT', 'INTERVIEW', 'RECOMMENDATION', 'PAYMENT', 'DECISION', 'GENERAL')),
  sender text,
  subject text,
  received_at timestamptz,
  summary text,
  action_required boolean not null default false,
  due_at timestamptz,
  status text not null default 'OPEN' check (status in ('OPEN', 'ACTIONED', 'ARCHIVED')),
  raw_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (owner_id, external_message_id)
);

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  type text not null check (type in ('OFFER', 'CONDITIONAL_OFFER', 'WAITLIST', 'REJECTED', 'WITHDRAWN')),
  received_at timestamptz,
  response_deadline date,
  deposit_amount numeric(12, 2) check (deposit_amount is null or deposit_amount >= 0),
  deposit_currency text,
  conditions text[] not null default '{}',
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (application_id)
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source text not null default 'LOCAL_STORAGE',
  source_schema_version integer not null,
  checksum text not null,
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  records_imported jsonb not null default '{}'::jsonb,
  status text not null default 'STARTED' check (status in ('STARTED', 'COMPLETED', 'FAILED', 'MIGRATION_NOT_VERIFIED')),
  error text,
  unique (owner_id, checksum)
);

create trigger portal_sections_set_updated_at before update on public.portal_sections for each row execute function public.set_updated_at();
create trigger tasks_set_updated_at before update on public.tasks for each row execute function public.set_updated_at();
create trigger inbox_items_set_updated_at before update on public.inbox_items for each row execute function public.set_updated_at();
create trigger decisions_set_updated_at before update on public.decisions for each row execute function public.set_updated_at();
