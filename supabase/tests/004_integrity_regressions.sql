begin;
insert into public.programs(id,owner_id,university_id,program_name,intake_year)
values ('20000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Other program',2027);
insert into public.program_material_requirements(id,owner_id,program_id,material_type,label)
values ('60000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000003','CV','Other CV');
insert into public.program_essay_requirements(id,owner_id,program_id,essay_type)
values ('70000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000003','PS');
do $$ begin
  begin
    insert into public.essays(owner_id,application_id,program_essay_requirement_id,type)
    values('00000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','PS');
    raise exception 'Wrong-program essay requirement accepted';
  exception when check_violation then null; end;
  begin
    insert into public.application_materials(owner_id,application_id,requirement_id)
    values ('00000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001');
    raise exception 'Wrong-program material requirement accepted';
  exception when check_violation then null; end;
  begin
    insert into public.application_rounds(owner_id,program_id,name,deadline_date,deadline_time,deadline_precision)
    values ('00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Invalid precision','2026-11-01','23:59','DATE_ONLY');
    raise exception 'DATE_ONLY accepted a fabricated time';
  exception when check_violation then null; end;
  begin
    update public.material_versions set original_filename='replaced.pdf' where material_id='50000000-0000-0000-0000-000000000001';
    raise exception 'Material history update accepted';
  exception when check_violation then null; end;
  begin
    insert into public.material_versions(owner_id,material_id,version_number,storage_path)
    values('00000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',2,'00000000-0000-0000-0000-000000000002/private.pdf');
    raise exception 'Other-user Storage metadata path accepted';
  exception when check_violation then null; end;
  begin
    insert into public.application_rounds(owner_id,program_id,name,deadline_date,deadline_time,deadline_precision,timezone)
    values ('00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Invalid timezone','2026-11-01','12:00','EXACT_TIME','Made/Up');
    raise exception 'Invalid timezone accepted';
  exception when check_violation then null; end;
end $$;
rollback;
