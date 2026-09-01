-- TEST_ONLY disposable fixture compatibility; never a production migration.
-- The production student_profiles contract has updated_at, while the shared
-- B1 minimal fixture predates that column. Keep the fixture additive and local.
ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
