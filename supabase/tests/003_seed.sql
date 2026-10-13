-- Demo seed smoke test. It uses fake records only and rolls back the transaction.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select public.seed_demo_data(auth.uid());
select public.seed_demo_data(auth.uid());
do $$ begin
  if (select count(*) from public.universities where owner_id = auth.uid() and name = 'Example University') <> 1 then
    raise exception 'demo university seed is not idempotent';
  end if;
  if (select count(*) from public.programs where owner_id = auth.uid() and program_name = 'Example MSc in Data & Finance') <> 1 then
    raise exception 'demo program seed is not idempotent';
  end if;
end $$;
select 'demo seed smoke test passed' as result;
rollback;
