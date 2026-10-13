begin;
insert into auth.users(id) values('00000000-0000-0000-0000-000000000099');
insert into public.materials(owner_id,type,title) values('00000000-0000-0000-0000-000000000099','CV','Fake cascade material');
delete from auth.users where id='00000000-0000-0000-0000-000000000099';
do $$ begin
  if exists(select 1 from public.materials where owner_id='00000000-0000-0000-0000-000000000099') then raise exception 'Account data remained'; end if;
end $$;
rollback;
