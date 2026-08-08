-- DEPARTMENTS-STUB-01
-- Disposable PG17 stub for public.departments columns referenced by
-- the department council seed predecessor migration.
-- Marks the synthetic department inactive so the idempotent seed does not
-- create an extra council beyond the deterministic 4-council fixture.
-- No production connection.

alter table if exists public.departments
  add column if not exists name_ar text not null default 'قسم تجريبي',
  add column if not exists name_en text,
  add column if not exists is_active boolean not null default false;

update public.departments set is_active = false where id = 'd1000000-0000-0000-0000-000000000001';
