-- Constraint smoke tests. Every block must fail with the expected constraint.
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
insert into public.profiles (id, display_name) values ('00000000-0000-0000-0000-000000000001', 'Test User');
insert into public.universities (id, owner_id, name, short_name) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Example University', 'EU');
insert into public.programs (id, owner_id, university_id, program_name, intake_year) values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Example MSc', 2027);
insert into public.universities (id, owner_id, name, short_name) values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'Other University', 'OU');

do $$ begin
  begin
    insert into public.programs (owner_id, university_id, program_name, intake_year)
    values ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'Cross-owner Program', 2027);
    raise exception 'cross-owner parent reference was accepted';
  exception when foreign_key_violation then null;
  end;
end $$;

do $$ begin
  begin
    insert into public.application_rounds (owner_id, program_id, name, open_date, deadline_date)
    values ('00000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Invalid', '2026-11-01', '2026-10-01');
    raise exception 'invalid round was accepted';
  exception when check_violation then null;
  end;
end $$;

insert into public.application_rounds (id, owner_id, program_id, name, deadline_date) values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Round 1', '2026-11-06');
insert into public.applications (id, owner_id, program_id, target_round_id) values ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001');

do $$ begin
  begin
    insert into public.portal_sections (owner_id, application_id, section_key, progress_percent) values ('00000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Education', 101);
    raise exception 'invalid progress was accepted';
  exception when check_violation then null;
  end;
end $$;

insert into public.materials (id, owner_id, type, title) values ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'CV', 'Master CV');
insert into public.material_versions (owner_id, material_id, version_number) values ('00000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 1);
do $$ begin
  begin
    insert into public.material_versions (owner_id, material_id, version_number) values ('00000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 1);
    raise exception 'duplicate material version was accepted';
  exception when unique_violation then null;
  end;
end $$;

do $$ begin
  begin
    insert into public.submissions (owner_id, application_id, submitted_at, payment_amount) values ('00000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', now(), -1);
    raise exception 'negative payment was accepted';
  exception when check_violation then null;
  end;
end $$;

select 'constraint smoke tests passed' as result;
