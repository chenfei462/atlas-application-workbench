-- RLS smoke test. The session claim is changed between User A and User B.
-- Keep all SET LOCAL statements inside one transaction so the test behaves
-- consistently in psql and in CI runners.
grant select, insert, update, delete on all tables in schema public to authenticated;
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
insert into public.universities (owner_id, name) values (auth.uid(), 'User A University');
do $$ begin
  if (select count(*) from public.universities where name='User A University')<>1 then raise exception 'User A read failed'; end if;
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$ declare affected integer; begin
  if (select count(*) from public.universities where name='User A University')<>0 then raise exception 'User B read User A'; end if;
  update public.universities set name='Hijacked' where name='User A University';
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'User B updated User A'; end if;
  delete from public.universities where name='User A University';
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'User B deleted User A'; end if;
  begin
    insert into public.universities(owner_id,name) values('00000000-0000-0000-0000-000000000001','Spoofed');
    raise exception 'Spoofed owner accepted';
  exception when insufficient_privilege then null; end;
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$ declare affected integer; begin
  update public.universities set name='Updated' where name='User A University';
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'User A update failed'; end if;
  delete from public.universities where name='Updated';
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'User A delete failed'; end if;
end $$;
rollback;
