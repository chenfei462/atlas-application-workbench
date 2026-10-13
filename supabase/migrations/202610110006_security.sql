-- DB-011/012: private storage and owner-isolated RLS policies.
insert into storage.buckets (id, name, public)
values ('application-documents', 'application-documents', false)
on conflict (id) do update set public = false;

alter table public.profiles enable row level security;
create policy profiles_select_own on public.profiles for select using (id = auth.uid());
create policy profiles_insert_own on public.profiles for insert with check (id = auth.uid());
create policy profiles_update_own on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

do $$
declare
  table_name text;
  private_tables text[] := array[
    'universities', 'programs', 'application_rounds', 'sources', 'source_assertions', 'applications',
    'program_material_requirements', 'program_test_requirements', 'program_essay_requirements',
    'program_recommendation_requirements', 'materials', 'material_versions', 'application_materials',
    'evidence_items', 'essays', 'essay_versions', 'essay_evidence_links', 'recommenders',
    'recommendation_requests', 'portal_sections', 'submissions', 'tasks', 'inbox_items', 'decisions',
    'audit_events', 'import_batches'
  ];
begin
  foreach table_name in array private_tables loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('create policy %I on public.%I for select using (owner_id = auth.uid())', table_name || '_select_own', table_name);
    execute format('create policy %I on public.%I for insert with check (owner_id = auth.uid())', table_name || '_insert_own', table_name);
    execute format('create policy %I on public.%I for update using (owner_id = auth.uid()) with check (owner_id = auth.uid())', table_name || '_update_own', table_name);
    execute format('create policy %I on public.%I for delete using (owner_id = auth.uid())', table_name || '_delete_own', table_name);
  end loop;
end $$;

create policy application_documents_select_own on storage.objects
for select to authenticated
using (bucket_id = 'application-documents' and (storage.foldername(name))[1] = (auth.uid()::text));

create policy application_documents_insert_own on storage.objects
for insert to authenticated
with check (bucket_id = 'application-documents' and (storage.foldername(name))[1] = (auth.uid()::text));

create policy application_documents_update_own on storage.objects
for update to authenticated
using (bucket_id = 'application-documents' and (storage.foldername(name))[1] = (auth.uid()::text))
with check (bucket_id = 'application-documents' and (storage.foldername(name))[1] = (auth.uid()::text));

create policy application_documents_delete_own on storage.objects
for delete to authenticated
using (bucket_id = 'application-documents' and (storage.foldername(name))[1] = (auth.uid()::text));
