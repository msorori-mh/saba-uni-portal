-- USR ORGANIZATION REGISTRY FOUNDATION 02
-- DRAFT ONLY. DO NOT PLACE IN supabase/migrations OR APPLY TO ANY DATABASE.
-- Additive design for isolated university-expansion environment.

begin;

do $$ begin
  if current_setting('usr.allow_draft_migration', true) is distinct from 'TEST_ONLY' then
    raise exception 'DRAFT_GUARD: set usr.allow_draft_migration=TEST_ONLY in an isolated database';
  end if;
end $$;

create type public.usr_organizational_unit_type as enum (
  'presidency',
  'university_council',
  'vice_presidency',
  'secretariat',
  'college',
  'department',
  'center',
  'deanship',
  'general_administration',
  'administration',
  'unit'
);

create type public.usr_source_status as enum (
  'verified',
  'pending_verification',
  'retired'
);

create table public.usr_institutions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]+$'),
  name_ar text not null,
  name_en text,
  official_website text,
  source_status public.usr_source_status not null default 'pending_verification',
  source_url text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.usr_campuses (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.usr_institutions(id) on delete restrict,
  code text not null,
  name_ar text not null,
  name_en text,
  source_status public.usr_source_status not null default 'pending_verification',
  source_url text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (institution_id, code),
  unique (id, institution_id)
);

create table public.usr_organizational_units (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.usr_institutions(id) on delete restrict,
  campus_id uuid,
  parent_unit_id uuid,
  code text not null,
  unit_type public.usr_organizational_unit_type not null,
  name_ar text not null,
  name_en text,
  source_status public.usr_source_status not null default 'pending_verification',
  source_url text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (institution_id, code),
  unique (id, institution_id),
  constraint usr_unit_campus_same_institution_fk
    foreign key (campus_id, institution_id)
    references public.usr_campuses(id, institution_id) on delete restrict,
  constraint usr_unit_parent_not_self check (parent_unit_id is null or parent_unit_id <> id)
);

alter table public.usr_organizational_units
  add constraint usr_unit_parent_same_institution_fk
  foreign key (parent_unit_id, institution_id)
  references public.usr_organizational_units(id, institution_id)
  on delete restrict;

create index usr_units_parent_idx
  on public.usr_organizational_units(parent_unit_id)
  where is_active;

create table public.usr_organizational_unit_memberships (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.usr_organizational_units(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  role_code text not null,
  assigned_from date not null default current_date,
  assigned_to date,
  is_active boolean not null default true,
  scope_includes_descendants boolean not null default false,
  source_position_assignment_id uuid references public.position_assignments(id) on delete restrict,
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (is_active and assigned_to is null)
    or
    (not is_active and assigned_to is not null and assigned_to >= assigned_from)
  )
);

create unique index usr_unit_membership_active_unique
  on public.usr_organizational_unit_memberships(unit_id, user_id, role_code)
  where is_active;

create table public.usr_legacy_department_unit_links (
  department_id uuid primary key references public.departments(id) on delete restrict,
  unit_id uuid not null unique references public.usr_organizational_units(id) on delete restrict,
  link_status public.usr_source_status not null default 'pending_verification',
  evidence_url text,
  verified_by uuid references auth.users(id) on delete restrict,
  verified_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  check (
    (link_status = 'verified' and verified_by is not null and verified_at is not null)
    or link_status <> 'verified'
  )
);

alter table public.usr_institutions enable row level security;
alter table public.usr_campuses enable row level security;
alter table public.usr_organizational_units enable row level security;
alter table public.usr_organizational_unit_memberships enable row level security;
alter table public.usr_legacy_department_unit_links enable row level security;

revoke all on public.usr_institutions from anon, authenticated;
revoke all on public.usr_campuses from anon, authenticated;
revoke all on public.usr_organizational_units from anon, authenticated;
revoke all on public.usr_organizational_unit_memberships from anon, authenticated;
revoke all on public.usr_legacy_department_unit_links from anon, authenticated;

grant select on public.usr_institutions to authenticated;
grant select on public.usr_campuses to authenticated;
grant select on public.usr_organizational_units to authenticated;
grant select on public.usr_organizational_unit_memberships to authenticated;
grant select on public.usr_legacy_department_unit_links to authenticated;

create policy usr_memberships_read_own
  on public.usr_organizational_unit_memberships
  for select to authenticated
  using (user_id = auth.uid() and is_active);

create policy usr_units_read_member_scope
  on public.usr_organizational_units
  for select to authenticated
  using (
    exists (
      select 1
      from public.usr_organizational_unit_memberships m
      where m.user_id = auth.uid()
        and m.unit_id = usr_organizational_units.id
        and m.is_active
        and m.assigned_from <= current_date
        and (m.assigned_to is null or m.assigned_to >= current_date)
    )
  );

create policy usr_institutions_read_member_scope
  on public.usr_institutions
  for select to authenticated
  using (
    exists (
      select 1
      from public.usr_organizational_units u
      join public.usr_organizational_unit_memberships m on m.unit_id = u.id
      where u.institution_id = usr_institutions.id
        and m.user_id = auth.uid()
        and m.is_active
        and m.assigned_from <= current_date
        and (m.assigned_to is null or m.assigned_to >= current_date)
    )
  );

create policy usr_campuses_read_member_scope
  on public.usr_campuses
  for select to authenticated
  using (
    exists (
      select 1
      from public.usr_organizational_units u
      join public.usr_organizational_unit_memberships m on m.unit_id = u.id
      where u.campus_id = usr_campuses.id
        and m.user_id = auth.uid()
        and m.is_active
        and m.assigned_from <= current_date
        and (m.assigned_to is null or m.assigned_to >= current_date)
    )
  );

create policy usr_legacy_links_read_member_scope
  on public.usr_legacy_department_unit_links
  for select to authenticated
  using (
    link_status = 'verified'
    and exists (
      select 1
      from public.usr_organizational_unit_memberships m
      where m.unit_id = usr_legacy_department_unit_links.unit_id
        and m.user_id = auth.uid()
        and m.is_active
        and m.assigned_from <= current_date
        and (m.assigned_to is null or m.assigned_to >= current_date)
    )
  );

-- Writes intentionally have no authenticated policies.
-- service_role remains the controlled seed/migration path in an isolated environment.

insert into public.usr_institutions
  (code, name_ar, name_en, official_website, source_status, source_url, metadata)
values
  ('usr', 'جامعة إقليم سبأ', 'University of Saba Region',
   'https://www.usr.edu.ye/', 'verified', 'https://www.usr.edu.ye/',
   '{"data_classification":"TEST_ONLY","official_source_checked":"2026-08-19"}'::jsonb);

with institution as (
  select id from public.usr_institutions where code = 'usr'
)
insert into public.usr_organizational_units
  (institution_id, code, unit_type, name_ar, source_status, source_url, sort_order, metadata)
select institution.id, v.code, v.unit_type::public.usr_organizational_unit_type,
       v.name_ar, 'verified'::public.usr_source_status, v.source_url, v.sort_order,
       '{"data_classification":"TEST_ONLY"}'::jsonb
from institution
cross join (values
  ('presidency', 'presidency', 'رئاسة الجامعة', 'https://www.usr.edu.ye/', 10),
  ('university_council', 'university_council', 'مجلس الجامعة', 'https://www.usr.edu.ye/', 20),
  ('vp_academic', 'vice_presidency', 'نيابة الشؤون الأكاديمية', 'https://www.usr.edu.ye/', 30),
  ('vp_students', 'vice_presidency', 'نيابة شؤون الطلاب', 'https://www.usr.edu.ye/', 40),
  ('vp_postgraduate_research', 'vice_presidency', 'نيابة الدراسات العليا والبحث العلمي', 'https://www.usr.edu.ye/', 50),
  ('general_secretariat', 'secretariat', 'الأمانة العامة', 'https://www.usr.edu.ye/', 60),
  ('admissions_registration', 'general_administration', 'الإدارة العامة للقبول والتسجيل', 'https://www.usr.edu.ye/', 70),
  ('college_medicine', 'college', 'كلية الطب', 'https://www.usr.edu.ye/colleges/faculty-of-medicinen-and-health-sciences', 100),
  ('college_itcs', 'college', 'كلية تكنولوجيا المعلومات وعلوم الحاسوب', 'https://www.usr.edu.ye/', 110),
  ('college_admin_finance', 'college', 'كلية العلوم الإدارية والمالية', 'https://www.usr.edu.ye/', 120),
  ('college_education_science', 'college', 'كلية التربية والعلوم', 'https://www.usr.edu.ye/', 130),
  ('college_sharia_law', 'college', 'كلية الشريعة والقانون', 'https://www.usr.edu.ye/', 140),
  ('college_jawf_education', 'college', 'كلية التربية والعلوم الإنسانية والتطبيقية - الجوف', 'https://www.usr.edu.ye/', 150),
  ('college_arts_humanities', 'college', 'كلية الآداب والعلوم الإنسانية', 'https://www.usr.edu.ye/colleges/faculty-of-arts-and-humanities', 160),
  ('center_academic_quality', 'center', 'مركز التطوير الأكاديمي وضمان الجودة', 'https://www.usr.edu.ye/', 200),
  ('center_research_community', 'center', 'مركز البحوث وخدمة المجتمع', 'https://www.usr.edu.ye/', 210),
  ('center_languages_translation', 'center', 'مركز اللغات والترجمة', 'https://www.usr.edu.ye/', 220)
) as v(code, unit_type, name_ar, source_url, sort_order);

-- Deliberately no automatic links to legacy departments.
-- Each link requires an evidence-backed, manually verified mapping.

rollback;
-- The final ROLLBACK is intentional in this draft and compile harness.
