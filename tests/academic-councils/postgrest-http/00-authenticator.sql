-- Disposable PostgREST authenticator bootstrap for local PG17 harness.
-- SOURCE-ONLY / TEST_ONLY. Never apply to production.

\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator LOGIN PASSWORD 'testsecret' NOINHERIT;
  ELSE
    ALTER ROLE authenticator WITH LOGIN PASSWORD 'testsecret' NOINHERIT;
  END IF;
END
$$;

GRANT anon, authenticated, service_role TO authenticator;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, authenticator;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role, authenticator;

ALTER ROLE authenticator SET pgrst.db_schemas = 'public';

-- Ensure auth.uid() remains executable under switched roles.
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
