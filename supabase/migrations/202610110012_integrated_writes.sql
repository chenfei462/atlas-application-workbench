-- Atomic high-value writes use invoker rights: RLS remains the boundary.
create function public.save_essay_version(p_essay_id uuid,p_expected_version integer,p_content text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare essay public.essays; version public.essay_versions; next_number integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_content is null or length(p_content)>500000 then raise exception 'Invalid essay content' using errcode='23514'; end if;
  select * into essay from public.essays where id=p_essay_id and owner_id=auth.uid() for update;
  if not found then raise exception 'Essay unavailable' using errcode='42501'; end if;
  if essay.current_version_number is distinct from p_expected_version then raise exception 'Essay changed in another session' using errcode='40001'; end if;
  select coalesce(max(version_number),0)+1 into next_number from public.essay_versions where essay_id=p_essay_id;
  insert into public.essay_versions(owner_id,essay_id,version_number,content,word_count,content_hash)
  values(auth.uid(),p_essay_id,next_number,p_content,case when trim(p_content)='' then 0 else array_length(regexp_split_to_array(trim(p_content),'\s+'),1) end,encode(sha256(convert_to(p_content,'UTF8')),'hex')) returning * into version;
  update public.essays set current_version_number=next_number,status='DRAFT' where id=p_essay_id;
  return jsonb_build_object('version',to_jsonb(version),'versionNumber',next_number);
end $$;
revoke all on function public.save_essay_version(uuid,integer,text) from public,anon;
grant execute on function public.save_essay_version(uuid,integer,text) to authenticated;

create function public.record_submission(p_application_id uuid,p_submitted_at timestamptz,p_application_number text,p_confirmation_received boolean,p_receipt_path text default null)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare app public.applications; submission public.submissions;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into app from public.applications where id=p_application_id and owner_id=auth.uid() for update;
  if not found then raise exception 'Application unavailable' using errcode='42501'; end if;
  if p_submitted_at is null or nullif(trim(p_application_number),'') is null then raise exception 'Submission proof required' using errcode='23514'; end if;
  insert into public.submissions(owner_id,application_id,submitted_at,application_number,confirmation_received,receipt_storage_path)
  values(auth.uid(),p_application_id,p_submitted_at,p_application_number,coalesce(p_confirmation_received,false),p_receipt_path) returning * into submission;
  update public.applications set status='SUBMITTED' where id=p_application_id;
  return to_jsonb(submission);
end $$;
revoke all on function public.record_submission(uuid,timestamptz,text,boolean,text) from public,anon;
grant execute on function public.record_submission(uuid,timestamptz,text,boolean,text) to authenticated;

create function public.delete_material_version(p_id uuid) returns void
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare version public.material_versions;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into version from public.material_versions where id=p_id and owner_id=auth.uid() for update;
  if not found then raise exception 'Version unavailable' using errcode='42501'; end if;
  if exists(select 1 from public.application_materials where material_version_id=p_id) or exists(select 1 from public.submissions where receipt_storage_path=version.storage_path and version.storage_path is not null) then
    raise exception 'Version is referenced by an application or receipt' using errcode='23503';
  end if;
  delete from public.material_versions where id=p_id;
end $$;
revoke all on function public.delete_material_version(uuid) from public,anon;
grant execute on function public.delete_material_version(uuid) to authenticated;
create function public.audit_material_version_delete() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if exists(select 1 from auth.users where id=old.owner_id) then
    insert into public.audit_events(owner_id,entity_type,entity_id,action)
    values(old.owner_id,'material_versions',old.id,'MATERIAL_VERSION_DELETED');
  end if;
  return old;
end $$;
revoke all on function public.audit_material_version_delete() from public,anon,authenticated;
create trigger material_version_delete_audit after delete on public.material_versions for each row execute function public.audit_material_version_delete();
