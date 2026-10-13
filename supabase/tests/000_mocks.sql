create schema if not exists auth;
-- Migrations 011-015 issue `revoke ... from public, anon` and grant to `authenticated`.
-- The real Supabase stack ships all three roles, so the mock must provide them too,
-- otherwise replay fails with `role "anon" does not exist` (a harness gap, not a schema defect).
do $$ begin
  create role anon;
exception when duplicate_object then null;
end $$;
do $$ begin
  create role authenticated;
exception when duplicate_object then null;
end $$;
do $$ begin
  create role service_role;
exception when duplicate_object then null;
end $$;
create table if not exists auth.users (id uuid primary key);
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text not null, public boolean not null default false);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text not null, name text not null);
alter table storage.objects enable row level security;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function storage.foldername(path text) returns text[] language sql immutable as $$ select string_to_array(path, '/') $$;
grant usage on schema auth, public, storage to authenticated;
grant execute on function auth.uid() to authenticated;
grant execute on function storage.foldername(text) to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on all tables in schema storage to authenticated;
