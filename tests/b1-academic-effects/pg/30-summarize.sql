-- Summarize academic-effects matrix.
\set ON_ERROR_STOP on

DO $$
DECLARE
  positive_ok int;
  positive_n int;
  deny_ok int;
  deny_n int;
  zero_ok int;
  zero_n int;
  idem_ok int;
  idem_n int;
  rb_ok boolean;
  ec_ok boolean;
  fail_n int;
BEGIN
  SELECT count(*) FILTER (WHERE ok), count(*) INTO positive_ok, positive_n
    FROM b1_fx.results WHERE class='positive';
  SELECT count(*) FILTER (WHERE ok), count(*) INTO deny_ok, deny_n
    FROM b1_fx.results WHERE class='deny';
  SELECT count(*) FILTER (WHERE ok), count(*) INTO zero_ok, zero_n
    FROM b1_fx.results WHERE class='zero_mutation';
  SELECT count(*) FILTER (WHERE ok), count(*) INTO idem_ok, idem_n
    FROM b1_fx.results WHERE class='idempotent';
  SELECT ok INTO rb_ok FROM b1_fx.results WHERE case_id='rollback/savepoint';
  SELECT ok INTO ec_ok FROM b1_fx.results WHERE case_id='regression/enrollment_certificate';
  SELECT count(*) INTO fail_n FROM b1_fx.results WHERE NOT ok;

  RAISE NOTICE 'EFFECT_MATRIX positive=%/% deny=%/% zero_mutation=%/% idempotent=%/% rollback=% ec_regression=% fails=%',
    positive_ok, positive_n, deny_ok, deny_n, zero_ok, zero_n, idem_ok, idem_n,
    CASE WHEN rb_ok THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN ec_ok THEN 'NONE' ELSE 'HIT' END,
    fail_n;

  IF fail_n > 0 OR positive_ok <> 5 OR idem_ok <> 5 OR rb_ok IS NOT TRUE OR ec_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'B1_ACADEMIC_EFFECTS_MATRIX_FAILED fails=%', fail_n;
  END IF;
END $$;

SELECT case_id, class, ok, detail FROM b1_fx.results ORDER BY class, case_id;
