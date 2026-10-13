-- Account cascade removes its audit log too. Do not recreate a log referencing
-- the auth row that has already been removed by the same transaction.
create or replace function public.record_important_change() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare event_action text; previous jsonb; current_value jsonb; row_owner uuid; row_id uuid;
begin
  if tg_op='DELETE' then row_owner=old.owner_id; row_id=old.id; else row_owner=new.owner_id; row_id=new.id; end if;
  if not exists(select 1 from auth.users where id=row_owner) then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
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
