-- Explicit, queryable columns for known legacy UI semantics. Unknown fields remain in the byte archive.
alter table public.universities add column country_text text;
alter table public.programs add column tuition_text text, add column application_fee_text text,
 add column tags text[] not null default '{}', add column academic_requirements_text text,
 add column language_requirements_text text, add column region_text text, add column country_text text,
 add column legacy_application_status text;
alter table public.applications add column language_requirement_met boolean,
 add column legacy_readiness_score integer, add column portal_payment_status text,
 add column portal_submission_status text;
alter table public.materials add column issued_at timestamptz, add column expires_at timestamptz,
 add column verified boolean, add column legacy_file_reference text, add column variant text,
 add column legacy_version_number integer check(legacy_version_number is null or legacy_version_number>=0);
alter table public.essays add column prompt text, add column word_limit integer, add column notes text;
alter table public.material_versions add column notes text;
alter table public.essay_versions add column notes text;
alter table public.recommendation_requests add column required boolean;
alter table public.application_rounds add column legacy_status text, add column verified_at timestamptz;
alter table public.portal_sections add column label text;
comment on column public.materials.legacy_file_reference is 'Original local metadata, not an uploaded Storage object path.';
comment on column public.materials.legacy_version_number is 'Legacy display version; does not fabricate immutable material_versions history.';
comment on column public.applications.legacy_readiness_score is 'Original local display snapshot; recompute live readiness from relational records.';

create or replace function public.import_atlas_backup(p_checksum text,p_schema_version integer,p_archive_path text,p_rows jsonb,p_id_map jsonb,p_warnings jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,extensions as $$
declare
 actor uuid:=auth.uid(); batch public.import_batches; t text; r jsonb; current_row jsonb;
 column_list text; select_list text; bad_key text; cnt integer; counts jsonb:='{}'; fingerprint text; repeated boolean:=false;
 allowed text[]:=array['profiles','universities','programs','application_rounds','sources','source_assertions','applications','program_material_requirements','program_test_requirements','program_essay_requirements','program_recommendation_requirements','materials','material_versions','application_materials','evidence_items','evidence_material_links','material_application_links','essays','essay_versions','essay_evidence_links','recommenders','recommendation_requests','portal_sections','submissions','tasks','inbox_items','decisions'];
begin
 if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_checksum !~ '^[a-f0-9]{64}$' or p_schema_version not in(1,2,3) or p_archive_path is distinct from actor::text||'/imports/'||p_checksum||'/source.json' then raise exception 'Invalid source archive contract'; end if;
 if not exists(select 1 from storage.objects where bucket_id='application-documents' and name=p_archive_path) then raise exception 'Verified source archive required before import'; end if;
 if jsonb_typeof(p_rows) is distinct from 'object' or jsonb_typeof(p_id_map) is distinct from 'object' or jsonb_typeof(p_warnings) is distinct from 'array' then raise exception 'Invalid import payload'; end if;
 select key into bad_key from jsonb_object_keys(p_rows) key where not(key=any(allowed)) limit 1;
 if bad_key is not null then raise exception 'Import table is not allowed: %',bad_key; end if;
 fingerprint:=encode(digest(convert_to(p_rows::text,'UTF8'),'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended(actor::text||':atlas-import',0));
 select * into batch from public.import_batches where owner_id=actor and checksum=p_checksum for update;
 if found then
  if batch.plan_checksum is distinct from fingerprint or batch.archive_path is distinct from p_archive_path or batch.source_schema_version is distinct from p_schema_version or batch.id_map is distinct from p_id_map then raise exception 'Existing import contradicts this import plan'; end if;
  repeated:=batch.status='COMPLETED';
 else
  insert into public.import_batches(owner_id,source_schema_version,checksum,archive_path,id_map,warnings,plan_checksum)
  values(actor,p_schema_version,p_checksum,p_archive_path,p_id_map,p_warnings,fingerprint) returning * into batch;
 end if;
 foreach t in array allowed loop
  if jsonb_typeof(coalesce(p_rows->t,'[]'::jsonb)) is distinct from 'array' then raise exception '% rows must be an array',t; end if;
  if exists(select 1 from jsonb_array_elements(coalesce(p_rows->t,'[]')) e group by e->>'id' having count(*)>1) then raise exception 'Duplicate IDs in %',t; end if;
  cnt:=0;
  for r in select value from jsonb_array_elements(coalesce(p_rows->t,'[]')) loop
   if jsonb_typeof(r) is distinct from 'object' or (case when t='profiles' then r->>'id' else r->>'owner_id' end) is distinct from actor::text or r->>'id' is null then raise exception 'Import row owner or ID rejected in %',t using errcode='42501'; end if;
   select key into bad_key from jsonb_object_keys(r) key where not exists(select 1 from pg_attribute a where a.attrelid=('public.'||t)::regclass and a.attname=key and a.attnum>0 and not a.attisdropped and a.attgenerated='') limit 1;
   if bad_key is not null then raise exception 'Unknown import column %.%',t,bad_key; end if;
   -- Normalize timestamp/numeric representations before comparing idempotent rows.
   execute format('select jsonb_object_agg(k.key,to_jsonb(x)->k.key) from jsonb_populate_record(null::public.%I,$1) x cross join jsonb_object_keys($1) k(key)',t) into r using r;
   execute format('select to_jsonb(x) from public.%I x where id=$1 and %I=$2 for update',t,case when t='profiles' then 'id' else 'owner_id' end) into current_row using (r->>'id')::uuid,actor;
   if current_row is not null then
    -- jsonb containment is intentionally stricter than upsert: no history updates,
    -- no silently replacing remote edits. Defaults absent from payload may differ.
    if not(current_row @> r) then raise exception 'Import conflict with existing %.%: existing edits/history are protected',t,r->>'id' using errcode='23505'; end if;
   elsif repeated then raise exception 'Previously imported %.% is now missing',t,r->>'id';
   else
    select string_agg(format('%I',key),',' order by key),string_agg(format('x.%I',key),',' order by key) into column_list,select_list from jsonb_object_keys(r) key;
    execute format('insert into public.%I(%s) select %s from jsonb_populate_record(null::public.%I,$1) x',t,column_list,select_list,t) using r;
   end if;
   cnt:=cnt+1;
  end loop;
  counts:=counts||jsonb_build_object(t,cnt);
 end loop;
 -- A second pass verifies actual persisted row counts. Immediate owner and business
 -- composite FKs/checks have already verified all references within this transaction.
 foreach t in array allowed loop
  execute format('select count(*) from public.%I where %I=$1 and id in(select (value->>''id'')::uuid from jsonb_array_elements($2))',t,case when t='profiles' then 'id' else 'owner_id' end)
   into cnt using actor,coalesce(p_rows->t,'[]'::jsonb);
  if cnt<>(counts->>t)::integer then raise exception 'Post-import count mismatch in %',t; end if;
 end loop;
 update public.import_batches set status='COMPLETED',completed_at=coalesce(completed_at,now()),records_imported=counts,error=null where id=batch.id;
 return jsonb_build_object('batchId',batch.id,'status','COMPLETED','counts',counts,'checksum',p_checksum,'archivePath',p_archive_path,'repeated',repeated);
end $$;
revoke all on function public.import_atlas_backup(text,integer,text,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.import_atlas_backup(text,integer,text,jsonb,jsonb,jsonb) to authenticated;


