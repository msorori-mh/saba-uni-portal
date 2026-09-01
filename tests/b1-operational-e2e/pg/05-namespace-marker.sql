-- TEST_ONLY_B1_FIVE_SERVICES_OPERATIONAL_E2E
-- Disposable synthetic marker only. Never run against Production/Staging.

SELECT set_config('application_name', 'TEST_ONLY_B1_FIVE_SERVICES_OPERATIONAL_E2E', false);

DO $$
BEGIN
  CREATE SCHEMA IF NOT EXISTS b1_ops_e2e;
  CREATE TABLE IF NOT EXISTS b1_ops_e2e.markers (
    key text PRIMARY KEY,
    value text NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now()
  );
  INSERT INTO b1_ops_e2e.markers(key, value)
  VALUES
    ('namespace', 'TEST_ONLY_B1_FIVE_SERVICES_OPERATIONAL_E2E'),
    ('data_class', 'SYNTHETIC_DISPOSABLE_ONLY'),
    ('production_write', 'FORBIDDEN')
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, recorded_at = now();
END $$;
