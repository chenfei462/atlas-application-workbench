begin;
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
do $$ declare essay uuid; result jsonb; begin
  insert into public.essays(owner_id,application_id,type) values(auth.uid(),'40000000-0000-0000-0000-000000000001','PS') returning id into essay;
  result=public.save_essay_version(essay,null,'Original text');
  if (result->>'versionNumber')::integer<>1 then raise exception 'Version number wrong'; end if;
  begin perform public.save_essay_version(essay,null,'Stale overwrite'); raise exception 'Stale editor accepted'; exception when serialization_failure then null; end;
  if (select count(*) from public.essay_versions where essay_id=essay)<>1 then raise exception 'Failed save left partial rows'; end if;
  if (select content from public.essay_versions where essay_id=essay)<>'Original text' then raise exception 'Original text lost'; end if;
end $$;
rollback;
