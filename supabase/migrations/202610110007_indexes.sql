-- DB-013: indexes for War Room and application detail queries.
create index universities_owner_idx on public.universities(owner_id);
create index programs_owner_idx on public.programs(owner_id);
create index rounds_owner_deadline_idx on public.application_rounds(owner_id, deadline_date);
create index rounds_program_deadline_idx on public.application_rounds(program_id, deadline_date);
create index sources_owner_verified_idx on public.sources(owner_id, verified_at);
create index assertions_program_field_idx on public.source_assertions(program_id, field_path);
create index applications_owner_status_idx on public.applications(owner_id, status);
create index applications_owner_priority_idx on public.applications(owner_id, priority);
create index materials_owner_status_idx on public.materials(owner_id, status);
create index application_materials_application_idx on public.application_materials(application_id, status);
create index essays_application_idx on public.essays(application_id, status);
create index essay_versions_essay_idx on public.essay_versions(essay_id, version_number desc);
create index recommendation_requests_application_idx on public.recommendation_requests(application_id, status);
create index portal_sections_application_idx on public.portal_sections(application_id, status);
create index submissions_owner_submitted_idx on public.submissions(owner_id, submitted_at desc);
create index tasks_owner_open_due_idx on public.tasks(owner_id, due_at) where status <> 'DONE' and status <> 'CANCELLED';
create index inbox_owner_action_idx on public.inbox_items(owner_id, due_at) where action_required = true and status = 'OPEN';
create index decisions_owner_received_idx on public.decisions(owner_id, received_at desc);
