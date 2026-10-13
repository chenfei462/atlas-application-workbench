-- DB-013: prevent an owner-scoped child row from referencing another owner's row.
-- Composite foreign keys make the tenant boundary part of the relational model.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'universities', 'programs', 'application_rounds', 'sources', 'applications',
    'program_material_requirements', 'program_test_requirements',
    'program_essay_requirements', 'program_recommendation_requirements',
    'materials', 'material_versions', 'application_materials', 'evidence_items',
    'essays', 'essay_versions', 'essay_evidence_links', 'recommenders',
    'recommendation_requests', 'portal_sections', 'submissions', 'tasks',
    'inbox_items', 'decisions'
  ] loop
    execute format('alter table public.%I add constraint %I unique (owner_id, id)', table_name, table_name || '_owner_id_id_key');
  end loop;
end $$;

alter table public.application_rounds add constraint rounds_program_id_id_key unique (program_id, id);

alter table public.programs add constraint programs_owner_university_fk
  foreign key (owner_id, university_id) references public.universities(owner_id, id);
alter table public.application_rounds add constraint rounds_owner_program_fk
  foreign key (owner_id, program_id) references public.programs(owner_id, id);
alter table public.source_assertions add constraint assertions_owner_source_fk
  foreign key (owner_id, source_id) references public.sources(owner_id, id);
alter table public.source_assertions add constraint assertions_owner_program_fk
  foreign key (owner_id, program_id) references public.programs(owner_id, id);
alter table public.source_assertions add constraint assertions_owner_round_fk
  foreign key (owner_id, application_round_id) references public.application_rounds(owner_id, id);
alter table public.applications add constraint applications_owner_program_fk
  foreign key (owner_id, program_id) references public.programs(owner_id, id);
alter table public.applications add constraint applications_owner_round_fk
  foreign key (owner_id, target_round_id) references public.application_rounds(owner_id, id);
alter table public.applications add constraint applications_program_round_fk
  foreign key (program_id, target_round_id) references public.application_rounds(program_id, id);

alter table public.program_material_requirements add constraint material_requirements_owner_program_fk
  foreign key (owner_id, program_id) references public.programs(owner_id, id);
alter table public.program_test_requirements add constraint test_requirements_owner_program_fk
  foreign key (owner_id, program_id) references public.programs(owner_id, id);
alter table public.program_essay_requirements add constraint essay_requirements_owner_program_fk
  foreign key (owner_id, program_id) references public.programs(owner_id, id);
alter table public.program_recommendation_requirements add constraint recommendation_requirements_owner_program_fk
  foreign key (owner_id, program_id) references public.programs(owner_id, id);
alter table public.program_material_requirements add constraint material_requirements_owner_source_fk
  foreign key (owner_id, source_id) references public.sources(owner_id, id);
alter table public.program_test_requirements add constraint test_requirements_owner_source_fk
  foreign key (owner_id, source_id) references public.sources(owner_id, id);
alter table public.program_essay_requirements add constraint essay_requirements_owner_source_fk
  foreign key (owner_id, source_id) references public.sources(owner_id, id);
alter table public.program_recommendation_requirements add constraint recommendation_requirements_owner_source_fk
  foreign key (owner_id, source_id) references public.sources(owner_id, id);

alter table public.material_versions add constraint material_versions_owner_material_fk
  foreign key (owner_id, material_id) references public.materials(owner_id, id);
alter table public.application_materials add constraint application_materials_owner_application_fk
  foreign key (owner_id, application_id) references public.applications(owner_id, id);
alter table public.application_materials add constraint application_materials_owner_requirement_fk
  foreign key (owner_id, requirement_id) references public.program_material_requirements(owner_id, id);
alter table public.application_materials add constraint application_materials_owner_version_fk
  foreign key (owner_id, material_version_id) references public.material_versions(owner_id, id);
alter table public.essays add constraint essays_owner_application_fk
  foreign key (owner_id, application_id) references public.applications(owner_id, id);
alter table public.essays add constraint essays_owner_requirement_fk
  foreign key (owner_id, program_essay_requirement_id) references public.program_essay_requirements(owner_id, id);
alter table public.essay_versions add constraint essay_versions_owner_essay_fk
  foreign key (owner_id, essay_id) references public.essays(owner_id, id);
alter table public.essay_evidence_links add constraint essay_links_owner_version_fk
  foreign key (owner_id, essay_version_id) references public.essay_versions(owner_id, id);
alter table public.essay_evidence_links add constraint essay_links_owner_evidence_fk
  foreign key (owner_id, evidence_item_id) references public.evidence_items(owner_id, id);
alter table public.recommendation_requests add constraint recommendation_requests_owner_application_fk
  foreign key (owner_id, application_id) references public.applications(owner_id, id);
alter table public.recommendation_requests add constraint recommendation_requests_owner_recommender_fk
  foreign key (owner_id, recommender_id) references public.recommenders(owner_id, id);

alter table public.portal_sections add constraint portal_sections_owner_application_fk
  foreign key (owner_id, application_id) references public.applications(owner_id, id);
alter table public.submissions add constraint submissions_owner_application_fk
  foreign key (owner_id, application_id) references public.applications(owner_id, id);
alter table public.tasks add constraint tasks_owner_application_fk
  foreign key (owner_id, application_id) references public.applications(owner_id, id);
alter table public.inbox_items add constraint inbox_items_owner_application_fk
  foreign key (owner_id, application_id) references public.applications(owner_id, id);
alter table public.decisions add constraint decisions_owner_application_fk
  foreign key (owner_id, application_id) references public.applications(owner_id, id);
