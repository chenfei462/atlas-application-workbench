-- DB-001/002: extensions, domain checks, and updated_at trigger.
create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.is_owner(candidate uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select candidate = auth.uid();
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'Asia/Hong_Kong',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

comment on table public.profiles is 'Private applicant profile linked one-to-one with auth.users.';
