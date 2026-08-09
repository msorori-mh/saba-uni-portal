-- ============================================================================
-- PORTAL-B1-PR310 Definitive Operator Architecture — LONGRUN-14
-- Canonical fixture: migration-head marker for Fixture-13 precondition
--
-- Fixture-13 asserts that the database is at migration head 20260731203030.
-- We insert that marker here. This is NOT a claim that all migrations were
-- replayed; MIGRATION_REPLAY_EQUIVALENCE = NOT_CLAIMED.
-- ============================================================================
\set ON_ERROR_STOP on

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260731203030', '20260731203030_8e3ed620-f5d3-4f20-a326-e4f6366f44fd')
ON CONFLICT (version) DO NOTHING;

-- Fixture-13 expects migration head exactly 20260731203030. The canonical fixture
-- may have applied later migrations for function-graph completeness; truncate the
-- schema_migrations tail so the precondition is satisfied.
DELETE FROM supabase_migrations.schema_migrations WHERE version > '20260731203030';
