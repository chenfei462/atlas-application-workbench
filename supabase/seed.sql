-- Safe demo seed helper. It requires an authenticated owner and creates only fake data.
-- Call after migrations with: select public.seed_demo_data(auth.uid());
create or replace function public.seed_demo_data(target_owner uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_university_id uuid;
  v_program_id uuid;
  v_round_id uuid;
begin
  if target_owner is null or target_owner <> auth.uid() then
    raise exception 'seed_demo_data requires the current authenticated owner';
  end if;

  insert into profiles (id, display_name, timezone)
  values (target_owner, 'Atlas Demo User', 'Asia/Hong_Kong')
  on conflict (id) do nothing;

  select u.id into v_university_id
  from universities as u
  where u.owner_id = target_owner and u.name = 'Example University'
  limit 1;
  if v_university_id is null then
    insert into universities (owner_id, name, short_name, country_code, city, website_url)
    values (target_owner, 'Example University', 'EU', 'HK', 'Hong Kong', 'https://example.edu')
    returning id into v_university_id;
  end if;

  select p.id into v_program_id
  from programs as p
  where p.owner_id = target_owner
    and p.university_id = v_university_id
    and p.program_name = 'Example MSc in Data & Finance'
  limit 1;
  if v_program_id is null then
    insert into programs (owner_id, university_id, program_name, degree_name, intake_year, intake_term, official_program_url, verification_status)
    values (target_owner, v_university_id, 'Example MSc in Data & Finance', 'MSc', 2027, 'FALL', 'https://example.edu/program', 'NEEDS_VERIFICATION')
    returning id into v_program_id;
  end if;

  insert into application_rounds (owner_id, program_id, name, sort_order, applicant_type, deadline_date, timezone, deadline_precision)
  values (target_owner, v_program_id, 'Round 1', 1, 'INTERNATIONAL', current_date + 30, 'Asia/Hong_Kong', 'DATE_ONLY')
  on conflict (program_id, name, applicant_type) do nothing
  returning id into v_round_id;
  if v_round_id is null then
    select ar.id into v_round_id
    from application_rounds as ar
    where ar.program_id = v_program_id and ar.name = 'Round 1' and ar.applicant_type = 'INTERNATIONAL'
    limit 1;
  end if;

  insert into applications (owner_id, program_id, target_round_id, status, priority)
  values (target_owner, v_program_id, v_round_id, 'PLANNING', 'MEDIUM')
  on conflict (owner_id, program_id) do nothing;

  return jsonb_build_object('university_id', v_university_id, 'program_id', v_program_id, 'round_id', v_round_id);
end;
$$;
