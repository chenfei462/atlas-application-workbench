-- Forward-only integrity repair. Existing inconsistent rows abort this migration.
alter table public.application_rounds add constraint rounds_precision_consistent check (
  (deadline_precision = 'EXACT_TIME' and deadline_date is not null and deadline_time is not null and nullif(timezone,'') is not null)
  or (deadline_precision in ('DATE_ONLY','UNKNOWN_TIME') and deadline_time is null)
);
create function public.validate_round_timezone() returns trigger
language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  if new.timezone is not null and not exists (select 1 from pg_timezone_names where name=new.timezone) then
    raise exception 'Invalid round timezone' using errcode='23514';
  end if;
  return new;
end $$;
create trigger rounds_validate_timezone before insert or update on public.application_rounds
for each row execute function public.validate_round_timezone();
do $$ begin
  if exists (select 1 from public.application_rounds r where r.timezone is not null and not exists (select 1 from pg_timezone_names t where t.name=r.timezone)) then
    raise exception 'Existing invalid round timezone; repair before migration' using errcode='23514';
  end if;
end $$;

alter table public.source_assertions add constraint assertions_program_round_fk
foreign key(program_id,application_round_id) references public.application_rounds(program_id,id);

-- program_id is a relational discriminator. A trigger fills it; composite FKs
-- also enforce integrity when an application or requirement is later changed.
alter table public.applications add constraint applications_owner_program_id_key unique(owner_id,program_id,id);
alter table public.program_material_requirements add constraint material_requirements_owner_program_id_key unique(owner_id,program_id,id);
alter table public.program_essay_requirements add constraint essay_requirements_owner_program_id_key unique(owner_id,program_id,id);
alter table public.application_materials add column program_id uuid;
alter table public.essays add column program_id uuid;
update public.application_materials m set program_id=a.program_id from public.applications a where a.id=m.application_id;
update public.essays e set program_id=a.program_id from public.applications a where a.id=e.application_id;
alter table public.application_materials alter column program_id set not null;
alter table public.essays alter column program_id set not null;
alter table public.application_materials add constraint application_materials_application_program_fk foreign key(owner_id,program_id,application_id) references public.applications(owner_id,program_id,id) on delete cascade;
alter table public.application_materials add constraint application_materials_requirement_program_fk foreign key(owner_id,program_id,requirement_id) references public.program_material_requirements(owner_id,program_id,id);
alter table public.essays add constraint essays_application_program_fk foreign key(owner_id,program_id,application_id) references public.applications(owner_id,program_id,id) on delete cascade;
alter table public.essays add constraint essays_requirement_program_fk foreign key(owner_id,program_id,program_essay_requirement_id) references public.program_essay_requirements(owner_id,program_id,id);
create function public.set_application_program() returns trigger language plpgsql security invoker set search_path=public as $$
declare application_program uuid;
begin
  select program_id into application_program from public.applications where id=new.application_id and owner_id=new.owner_id;
  if application_program is null then raise exception 'Application unavailable' using errcode='23503'; end if;
  if tg_table_name='application_materials' then
    if not exists(select 1 from public.program_material_requirements where id=new.requirement_id and owner_id=new.owner_id and program_id=application_program) then
      raise exception 'Material requirement belongs to another program' using errcode='23514';
    end if;
  elsif new.program_essay_requirement_id is not null then
    if not exists(select 1 from public.program_essay_requirements where id=new.program_essay_requirement_id and owner_id=new.owner_id and program_id=application_program) then
      raise exception 'Essay requirement belongs to another program' using errcode='23514';
    end if;
  end if;
  new.program_id=application_program;
  return new;
end $$;
create trigger application_materials_set_program before insert or update on public.application_materials for each row execute function public.set_application_program();
create trigger essays_set_program before insert or update on public.essays for each row execute function public.set_application_program();

alter table public.material_versions add constraint material_versions_private_path check(storage_path is null or (split_part(storage_path,'/',1)=owner_id::text and storage_path !~ '(^|/)\.\.(/|$)' and storage_path !~ '//'));
alter table public.material_versions add constraint material_versions_sha256 check(sha256 is null or sha256 ~ '^[a-f0-9]{64}$');
alter table public.submissions add constraint submissions_private_path check(receipt_storage_path is null or (split_part(receipt_storage_path,'/',1)=owner_id::text and receipt_storage_path !~ '(^|/)\.\.(/|$)' and receipt_storage_path !~ '//'));
create function public.reject_history_update() returns trigger language plpgsql security invoker set search_path=public as $$
begin raise exception 'History is immutable; insert a new version' using errcode='23514'; end $$;
create trigger material_versions_immutable before update on public.material_versions for each row execute function public.reject_history_update();
create trigger essay_versions_immutable before update on public.essay_versions for each row execute function public.reject_history_update();

-- Only DB triggers create audit entries. Users can read their own entries.
drop policy audit_events_insert_own on public.audit_events;
drop policy audit_events_update_own on public.audit_events;
drop policy audit_events_delete_own on public.audit_events;
create function public.record_important_change() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare event_action text; previous jsonb; current_value jsonb; row_owner uuid; row_id uuid;
begin
  if tg_op='DELETE' then row_owner=old.owner_id; row_id=old.id; else row_owner=new.owner_id; row_id=new.id; end if;
  if tg_table_name='applications' and tg_op='UPDATE' then
    if new.status is not distinct from old.status then return new; end if;
    event_action='APPLICATION_STATUS_CHANGED'; previous=jsonb_build_object('status',old.status); current_value=jsonb_build_object('status',new.status);
  elsif tg_table_name='application_rounds' then
    event_action='ROUND_CHANGED';
    previous=jsonb_build_object('deadline_date',old.deadline_date,'deadline_time',old.deadline_time,'deadline_precision',old.deadline_precision,'timezone',old.timezone);
    current_value=jsonb_build_object('deadline_date',new.deadline_date,'deadline_time',new.deadline_time,'deadline_precision',new.deadline_precision,'timezone',new.timezone);
    if previous=current_value then return new; end if;
  elsif tg_table_name='submissions' then event_action='SUBMISSION_CREATED';
  elsif tg_table_name='decisions' then event_action='DECISION_RECEIVED';
  elsif tg_table_name='materials' then event_action='MATERIAL_DELETED';
  elsif tg_table_name='sources' then
    if new.verified_at is not distinct from old.verified_at then return new; end if;
    event_action='SOURCE_VERIFIED';
  end if;
  insert into public.audit_events(owner_id,entity_type,entity_id,action,old_value,new_value)
  values(row_owner,tg_table_name,row_id,event_action,previous,current_value);
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function public.record_important_change() from public;
create trigger applications_audit after update on public.applications for each row execute function public.record_important_change();
create trigger rounds_audit after update on public.application_rounds for each row execute function public.record_important_change();
create trigger submissions_audit after insert on public.submissions for each row execute function public.record_important_change();
create trigger decisions_audit after insert on public.decisions for each row execute function public.record_important_change();
create trigger materials_audit after delete on public.materials for each row execute function public.record_important_change();
create trigger sources_audit after update on public.sources for each row execute function public.record_important_change();
