begin;
do $$
declare
  owner uuid='00000000-0000-0000-0000-000000000001';
  program uuid='20000000-0000-0000-0000-000000000001';
  app uuid='40000000-0000-0000-0000-000000000001';
  src uuid; mr uuid; er uuid; ev uuid; essay uuid; version uuid; evidence uuid; rec uuid;
  uni uuid; round uuid; material uuid;
begin
  -- This suite asserts an owner-visible row exists in EVERY public table, so it must
  -- supply its own fixture for each one (earlier suites roll back, leaving tables empty).
  insert into public.universities(owner_id,name) values(owner,'Fixture University') returning id into uni;
  insert into public.programs(owner_id,university_id,program_name,degree_name,intake_year) values(owner,uni,'Fixture MSc','MSc',2027);
  insert into public.application_rounds(owner_id,program_id,name) values(owner,program,'Fixture Round') returning id into round;
  insert into public.materials(owner_id,type,title) values(owner,'CV','Fixture CV') returning id into material;
  insert into public.sources(owner_id,url,source_type) values(owner,'https://example.edu','USER_INPUT') returning id into src;
  insert into public.source_assertions(owner_id,source_id,program_id,field_path,observed_value) values(owner,src,program,'program_name','"Example"');
  insert into public.program_material_requirements(owner_id,program_id,material_type,label) values(owner,program,'CV','CV') returning id into mr;
  insert into public.program_test_requirements(owner_id,program_id,test_type) values(owner,program,'IELTS');
  insert into public.program_essay_requirements(owner_id,program_id,essay_type) values(owner,program,'PS') returning id into er;
  insert into public.program_recommendation_requirements(owner_id,program_id,required_count,maximum_count) values(owner,program,1,2);
  select id into version from public.material_versions where material_id='50000000-0000-0000-0000-000000000001' limit 1;
  insert into public.application_materials(owner_id,application_id,requirement_id,material_version_id) values(owner,app,mr,version);
  insert into public.evidence_items(owner_id,type,title) values(owner,'PROJECT','Fake Project') returning id into evidence;
  insert into public.essays(owner_id,application_id,program_essay_requirement_id,type) values(owner,app,er,'PS') returning id into essay;
  insert into public.essay_versions(owner_id,essay_id,version_number,content) values(owner,essay,1,'Fake essay') returning id into ev;
  insert into public.essay_evidence_links(owner_id,essay_version_id,evidence_item_id) values(owner,ev,evidence);
  insert into public.recommenders(owner_id,name,email) values(owner,'Fake Recommender','fake@example.invalid') returning id into rec;
  insert into public.recommendation_requests(owner_id,application_id,recommender_id) values(owner,app,rec);
  insert into public.portal_sections(owner_id,application_id,section_key) values(owner,app,'education');
  insert into public.submissions(owner_id,application_id,submitted_at) values(owner,app,now());
  insert into public.tasks(owner_id,application_id,title) values(owner,app,'Fake Task');
  insert into public.inbox_items(owner_id,application_id,type,subject) values(owner,app,'GENERAL','Fake message');
  insert into public.decisions(owner_id,application_id,type) values(owner,app,'OFFER');
  insert into public.import_batches(owner_id,source_schema_version,checksum) values(owner,2,repeat('a',64));
  -- Link tables added by migration 011 and 015.
  insert into public.evidence_material_links(owner_id,evidence_item_id,material_id) values(owner,evidence,material);
  insert into public.material_application_links(owner_id,material_id,application_id) values(owner,material,app);
  insert into public.essay_evidence_items(owner_id,essay_id,evidence_item_id) values(owner,essay,evidence);
end $$;
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
do $$ declare t record; n integer; begin
  for t in select tablename from pg_tables where schemaname='public' loop
    execute format('select count(*) from public.%I',t.tablename) into n;
    if n=0 then raise exception 'No own-row fixture for %',t.tablename; end if;
  end loop;
end $$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
do $$ declare t record; n integer; begin
  for t in select tablename from pg_tables where schemaname='public' loop
    execute format('select count(*) from public.%I where %I=$1',t.tablename,case when t.tablename='profiles' then 'id' else 'owner_id' end)
    into n using '00000000-0000-0000-0000-000000000001'::uuid;
    if n<>0 then raise exception 'Cross-user SELECT on %',t.tablename; end if;
    execute format('update public.%I set id=id where %I=$1',t.tablename,case when t.tablename='profiles' then 'id' else 'owner_id' end)
    using '00000000-0000-0000-0000-000000000001'::uuid;
    get diagnostics n=row_count;
    if n<>0 then raise exception 'Cross-user UPDATE on %',t.tablename; end if;
    execute format('delete from public.%I where %I=$1',t.tablename,case when t.tablename='profiles' then 'id' else 'owner_id' end)
    using '00000000-0000-0000-0000-000000000001'::uuid;
    get diagnostics n=row_count;
    if n<>0 then raise exception 'Cross-user DELETE on %',t.tablename; end if;
  end loop;
end $$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
do $$ begin
  begin update public.essay_versions set content='overwritten'; raise exception 'Essay history overwritten'; exception when check_violation then null; end;
  update public.audit_events set action='tampered';
  if found then raise exception 'Audit modified'; end if;
  delete from public.audit_events;
  if found then raise exception 'Audit deleted'; end if;
  update public.applications set status='SUBMITTED' where id='40000000-0000-0000-0000-000000000001';
  if not exists(select 1 from public.audit_events where action='APPLICATION_STATUS_CHANGED') then raise exception 'Audit missing'; end if;
end $$;
rollback;
