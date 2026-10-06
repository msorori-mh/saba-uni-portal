-- DRAFT ONLY — DO NOT APPLY FROM THIS PATH.
-- =====================================================================
-- STUDENT-SERVICES-GLOBAL-SWITCH-01
-- مفتاح عام لدى الأدمن: إيقاف مؤقت / إعادة تفعيل جميع الخدمات الطلابية.
--
-- Review artifact only. Promotion to supabase/migrations and any apply are a
-- separate, explicitly authorized gate (see
-- docs/reviews/STUDENT-SERVICES-GLOBAL-SWITCH-01.md).
--
-- WHAT THIS DRAFT DOES
--   1. Creates ONE table: public.student_services_switch — a single row
--      (boolean primary key pinned to true) holding `enabled`, the optional
--      Arabic notice, and who/when changed it. RLS is enabled with NO policy
--      and every table privilege is revoked from PUBLIC/anon/authenticated:
--      the row is reachable only through the functions below.
--      It is seeded ENABLED in this same transaction, so applying the draft
--      changes no behaviour until an admin flips the switch.
--   2. Creates SIX functions (all new, none replaces an existing one):
--        student_services_enabled()                 the one predicate (STABLE)
--        get_student_services_status()              read for any signed-in user
--        admin_get_student_services_switch()        read incl. who/when (admin)
--        admin_set_student_services_enabled(boolean,text)   the ONLY write path
--        guard_student_services_switch()            trigger fn on student_requests
--        guard_student_services_switch_row()        keeps the single row alive
--   3. Creates THREE triggers:
--        trg_00_student_services_switch_guard   BEFORE INSERT OR UPDATE
--                                               ON public.student_requests
--        trg_student_services_switch_row_keep   BEFORE DELETE
--                                               ON public.student_services_switch
--        trg_student_services_switch_no_truncate BEFORE TRUNCATE (same table)
--
-- WHY A TRIGGER AND NOT A PATCH OF EVERY SUBMIT RPC
--   A student can create or submit a request through at least eight deployed
--   entry points (create_student_request, submit_student_request,
--   submit_student_request_with_details,
--   submit_student_request_with_secure_attachments,
--   submit_b1_student_request_atomic, create_b1_request_draft_for_student,
--   save_b1_request_draft_for_student, and the direct RLS INSERT / UPDATE on
--   the table itself). Every one of them ends in exactly one place: a row
--   INSERT, or a draft -> non-draft status change, on public.student_requests.
--   Gating that single choke point (the same pattern already used by
--   trg_guard_b1_request_submit_boundary and trg_p1_guard_detailless_submit)
--   - cannot be bypassed by an entry point nobody remembered, nor by one that
--     is added later;
--   - rewrites NO deployed function body, so it cannot drift from, or collide
--     with, EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01 (PR #436), which
--     patches initialize_b1_request_workflow_strict and
--     act_on_b1_student_request_step_atomic. This draft applies identically
--     before or after that one.
--
-- WHAT IS BLOCKED WHILE DISABLED (and only then)
--   Only writes made BY THE OWNING STUDENT (auth.uid() = the user of
--   NEW.student_profile_id):
--     - INSERT of a request row in any status  -> "start a new request";
--     - UPDATE draft -> any status except draft / cancelled -> "submit".
--   Everything else is untouched:
--     - returned / returned_for_completion -> submitted (resubmission of a
--       request staff sent back is NOT a new service) stays allowed;
--     - cancelling or editing an own draft stays allowed;
--     - every staff, service_role and system write (auth.uid() is NULL or is
--       not the owner) stays allowed, so in-flight requests keep moving;
--     - no read path is touched: tracking, timeline, documents, downloads.
--   The portal's two service-role fallback paths (auth.uid() NULL) are gated
--   in the application server instead (src/lib/student-affairs.functions.ts).
--
-- WHAT THIS DRAFT NEVER DOES
--   - no write to student_requests, workflow steps/events, details, documents;
--   - no backfill, no cleanup, no delete, no reset;
--   - no change to request_types (student_visible / is_active stay as they are);
--   - no change to any deployed function, policy, grant or existing trigger;
--   - no accounts, roles or assignments; "admin" = admin | system_admin, the
--     same pair assertAdmin() uses; no other role can flip the switch.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0. Preconditions — abort before creating anything if the target differs
-- ---------------------------------------------------------------------
DO $pre$
DECLARE
  v_item text;
  v_count integer;
BEGIN
  FOREACH v_item IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_item) THEN
      RAISE EXCEPTION 'STUDENT_SERVICES_SWITCH_01_ROLE_MISSING:%', v_item;
    END IF;
  END LOOP;

  FOREACH v_item IN ARRAY ARRAY[
    'public.student_requests','public.student_profiles','public.audit_logs'
  ] LOOP
    IF to_regclass(v_item) IS NULL THEN
      RAISE EXCEPTION 'STUDENT_SERVICES_SWITCH_01_RELATION_MISSING:%', v_item;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_count
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND (c.table_name, c.column_name, c.data_type) IN (
      ('student_requests','id','uuid'),
      ('student_requests','student_profile_id','uuid'),
      ('student_requests','status','text'),
      ('student_profiles','id','uuid'),
      ('student_profiles','user_id','uuid'));
  IF v_count <> 5 THEN
    RAISE EXCEPTION 'STUDENT_SERVICES_SWITCH_01_COLUMN_CONTRACT_MISMATCH:%', v_count;
  END IF;

  FOREACH v_item IN ARRAY ARRAY[
    'auth.uid()',
    'public.has_any_role(uuid,text[])',
    'public.log_audit(text,uuid,text,jsonb,jsonb,text,uuid)'
  ] LOOP
    IF to_regprocedure(v_item) IS NULL THEN
      RAISE EXCEPTION 'STUDENT_SERVICES_SWITCH_01_FUNCTION_MISSING:%', v_item;
    END IF;
  END LOOP;

  -- The audit function must be the canonical single overload.
  SELECT count(*) INTO v_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'log_audit';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'STUDENT_SERVICES_SWITCH_01_LOG_AUDIT_OVERLOADS:%', v_count;
  END IF;

  -- A pre-existing object under one of our names must already be ours.
  IF to_regclass('public.student_services_switch') IS NOT NULL THEN
    SELECT count(*) INTO v_count
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'student_services_switch'
      AND (c.column_name, c.data_type) IN (
        ('id','boolean'),('enabled','boolean'),('message_ar','text'),
        ('updated_at','timestamp with time zone'),('updated_by','uuid'));
    IF v_count <> 5 OR (
      SELECT count(*) FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = 'student_services_switch') <> 5 THEN
      RAISE EXCEPTION 'STUDENT_SERVICES_SWITCH_01_TABLE_CONTRACT_MISMATCH';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'public.student_requests'::regclass
      AND t.tgname = 'trg_00_student_services_switch_guard'
      AND NOT t.tgisinternal
      AND to_regprocedure('public.guard_student_services_switch()') IS DISTINCT FROM t.tgfoid::regprocedure
  ) THEN
    RAISE EXCEPTION 'STUDENT_SERVICES_SWITCH_01_TRIGGER_NAME_TAKEN';
  END IF;
END;
$pre$;

-- ---------------------------------------------------------------------
-- 1. The single settings row
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_services_switch (
  id         boolean     PRIMARY KEY DEFAULT true,
  enabled    boolean     NOT NULL DEFAULT true,
  message_ar text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT student_services_switch_singleton_chk CHECK (id),
  -- Plain text only: bounded, no markup brackets, no control characters
  -- other than a line feed.
  CONSTRAINT student_services_switch_message_chk CHECK (
    message_ar IS NULL OR (
      char_length(message_ar) BETWEEN 1 AND 500
      AND message_ar = btrim(message_ar)
      AND message_ar !~ '[<>]'
      AND message_ar !~ '[\u0001-\u0009\u000B-\u001F\u007F]'
    )
  )
);

COMMENT ON TABLE public.student_services_switch IS
  'STUDENT_SERVICES_GLOBAL_SWITCH_01: single row; enabled=false pauses NEW student-service requests. Written only by admin_set_student_services_enabled().';

ALTER TABLE public.student_services_switch ENABLE ROW LEVEL SECURITY;
-- intentionally: NO policy for anon/authenticated (fail closed); access is
-- through the SECURITY DEFINER functions below only.
REVOKE ALL ON public.student_services_switch FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.student_services_switch TO service_role;

-- Seeded ENABLED in the same transaction. A second apply never resets a
-- switch an admin has already turned off.
INSERT INTO public.student_services_switch (id, enabled, message_ar, updated_by)
VALUES (true, true, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- The row must never disappear: with no row the predicate below answers
-- "disabled" (fail closed), so deleting it would be an outage.
CREATE OR REPLACE FUNCTION public.guard_student_services_switch_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'STUDENT_SERVICES_SWITCH_ROW_IS_PERMANENT' USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.guard_student_services_switch_row() FROM PUBLIC, anon, authenticated;

DO $rowguard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.student_services_switch'::regclass
      AND tgname = 'trg_student_services_switch_row_keep' AND NOT tgisinternal) THEN
    CREATE TRIGGER trg_student_services_switch_row_keep
      BEFORE DELETE ON public.student_services_switch
      FOR EACH ROW EXECUTE FUNCTION public.guard_student_services_switch_row();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.student_services_switch'::regclass
      AND tgname = 'trg_student_services_switch_no_truncate' AND NOT tgisinternal) THEN
    CREATE TRIGGER trg_student_services_switch_no_truncate
      BEFORE TRUNCATE ON public.student_services_switch
      FOR EACH STATEMENT EXECUTE FUNCTION public.guard_student_services_switch_row();
  END IF;
END;
$rowguard$;

-- ---------------------------------------------------------------------
-- 2. The one predicate
--    Row missing / unreadable -> false (fail closed for submission). This is
--    safe against a permanent outage because (a) the row is seeded above in
--    this transaction, (b) it can be neither deleted nor truncated, and
--    (c) admin_set_student_services_enabled() UPSERTS, so an admin can always
--    restore service from the UI even if the row were somehow gone.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.student_services_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT s.enabled FROM public.student_services_switch s WHERE s.id),
    false);
$$;

REVOKE ALL ON FUNCTION public.student_services_enabled() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_services_enabled() TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. Read for any signed-in user (students included).
--    Never exposes who changed the switch. The notice is returned only while
--    the services are disabled.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_student_services_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.student_services_switch%ROWTYPE;
BEGIN
  -- No caller check here: EXECUTE is granted to authenticated and
  -- service_role only (anon is revoked), and the payload is not sensitive.
  SELECT * INTO v_row FROM public.student_services_switch s WHERE s.id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('enabled', false, 'message_ar', NULL, 'updated_at', NULL);
  END IF;

  RETURN jsonb_build_object(
    'enabled', v_row.enabled,
    'message_ar', CASE WHEN v_row.enabled THEN NULL ELSE v_row.message_ar END,
    'updated_at', v_row.updated_at);
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_services_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_services_status() TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. Admin read (who / when)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_student_services_switch()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.student_services_switch%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'STUDENT_SERVICES_SWITCH_AUTH_REQUIRED' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_any_role(v_uid, ARRAY['admin','system_admin']) THEN
    RAISE EXCEPTION 'STUDENT_SERVICES_SWITCH_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.student_services_switch s WHERE s.id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('enabled', false, 'message_ar', NULL,
      'updated_at', NULL, 'updated_by', NULL, 'row_missing', true);
  END IF;

  RETURN jsonb_build_object(
    'enabled', v_row.enabled,
    'message_ar', v_row.message_ar,
    'updated_at', v_row.updated_at,
    'updated_by', v_row.updated_by,
    'row_missing', false);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_student_services_switch() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_student_services_switch() TO authenticated;

-- ---------------------------------------------------------------------
-- 5. The ONLY write path: admin | system_admin, validated, audited
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_student_services_enabled(
  p_enabled boolean,
  p_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_message text := NULLIF(btrim(COALESCE(p_message, '')), '');
  v_old public.student_services_switch%ROWTYPE;
  v_had_row boolean;
  v_new public.student_services_switch%ROWTYPE;
  v_action text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'STUDENT_SERVICES_SWITCH_AUTH_REQUIRED' USING ERRCODE = '28000';
  END IF;
  -- Same role pair as assertAdmin(); no dean / registrar / student_affairs bypass.
  IF NOT public.has_any_role(v_uid, ARRAY['admin','system_admin']) THEN
    RAISE EXCEPTION 'STUDENT_SERVICES_SWITCH_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'STUDENT_SERVICES_SWITCH_STATE_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF v_message IS NOT NULL THEN
    IF char_length(v_message) > 500 THEN
      RAISE EXCEPTION 'STUDENT_SERVICES_SWITCH_MESSAGE_TOO_LONG' USING ERRCODE = '22023';
    END IF;
    IF v_message ~ '[<>]' OR v_message ~ '[\u0001-\u0009\u000B-\u001F\u007F]' THEN
      RAISE EXCEPTION 'STUDENT_SERVICES_SWITCH_MESSAGE_PLAIN_TEXT_REQUIRED' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT * INTO v_old FROM public.student_services_switch s WHERE s.id FOR UPDATE;
  v_had_row := FOUND;

  IF v_had_row
     AND v_old.enabled = p_enabled
     AND v_old.message_ar IS NOT DISTINCT FROM v_message THEN
    RETURN jsonb_build_object(
      'enabled', v_old.enabled, 'message_ar', v_old.message_ar,
      'updated_at', v_old.updated_at, 'updated_by', v_old.updated_by, 'changed', false);
  END IF;

  INSERT INTO public.student_services_switch AS s (id, enabled, message_ar, updated_at, updated_by)
  VALUES (true, p_enabled, v_message, now(), v_uid)
  ON CONFLICT (id) DO UPDATE
    SET enabled = EXCLUDED.enabled,
        message_ar = EXCLUDED.message_ar,
        updated_at = EXCLUDED.updated_at,
        updated_by = EXCLUDED.updated_by
  RETURNING s.* INTO v_new;

  v_action := CASE
    WHEN v_had_row AND v_old.enabled = p_enabled THEN 'student_services_message_updated'
    WHEN p_enabled THEN 'student_services_enabled'
    ELSE 'student_services_disabled'
  END;

  PERFORM public.log_audit(
    'student_services_switch'::text,
    NULL::uuid,
    v_action,
    CASE WHEN v_had_row
      THEN jsonb_build_object('enabled', v_old.enabled, 'message_ar', v_old.message_ar)
      ELSE NULL::jsonb END,
    jsonb_build_object('enabled', v_new.enabled, 'message_ar', v_new.message_ar),
    'STUDENT_SERVICES_GLOBAL_SWITCH_01'::text,
    v_uid);

  RETURN jsonb_build_object(
    'enabled', v_new.enabled, 'message_ar', v_new.message_ar,
    'updated_at', v_new.updated_at, 'updated_by', v_new.updated_by, 'changed', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_student_services_enabled(boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_student_services_enabled(boolean, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 6. The enforcement point: one guard on public.student_requests
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_student_services_switch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_owner uuid;
BEGIN
  -- Only "start" (INSERT) and "submit a draft" (draft -> not draft, not
  -- cancelled) are ever in scope. Resubmitting a returned request, staff
  -- decisions and every other update leave here immediately.
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM 'draft'
       OR NEW.status IS NOT DISTINCT FROM OLD.status
       OR NEW.status = 'cancelled' THEN
      RETURN NEW;
    END IF;
  END IF;

  IF public.student_services_enabled() THEN
    RETURN NEW;
  END IF;

  -- Staff / service_role / system writes are never student-originated.
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT sp.user_id INTO v_owner
  FROM public.student_profiles sp
  WHERE sp.id = NEW.student_profile_id;

  IF v_owner IS NULL OR v_owner <> v_uid THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'STUDENT_SERVICES_TEMPORARILY_DISABLED'
    USING ERRCODE = 'P0001',
          HINT = 'New student-service requests are paused by an administrator.';
END;
$$;

REVOKE ALL ON FUNCTION public.guard_student_services_switch() FROM PUBLIC, anon, authenticated;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.student_requests'::regclass
      AND tgname = 'trg_00_student_services_switch_guard' AND NOT tgisinternal) THEN
    -- No column list on purpose: the guard compares OLD/NEW itself, so it
    -- also sees a status another BEFORE trigger might have rewritten.
    CREATE TRIGGER trg_00_student_services_switch_guard
      BEFORE INSERT OR UPDATE ON public.student_requests
      FOR EACH ROW EXECUTE FUNCTION public.guard_student_services_switch();
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.student_requests'::regclass
      AND tgname = 'trg_00_student_services_switch_guard'
      AND tgfoid = 'public.guard_student_services_switch()'::regprocedure
      -- 23 = ROW | BEFORE | INSERT | UPDATE
      AND tgtype = 23 AND tgenabled = 'O' AND tgconstraint = 0 AND tgnargs = 0
      AND cardinality(tgattr::smallint[]) = 0) THEN
    RAISE EXCEPTION 'STUDENT_SERVICES_SWITCH_01_GUARD_TRIGGER_CONTRACT_MISMATCH';
  END IF;
END;
$guard$;

COMMENT ON FUNCTION public.guard_student_services_switch() IS
  'STUDENT_SERVICES_GLOBAL_SWITCH_01: while student_services_enabled() is false, the owning student may not INSERT a request nor move a draft out of draft. Staff/system writes and resubmission of returned requests are never blocked.';

-- ---------------------------------------------------------------------
-- 7. Self-verification — the transaction commits only in the intended state
-- ---------------------------------------------------------------------
DO $post$
DECLARE
  v_rows integer;
BEGIN
  SELECT count(*) INTO v_rows FROM public.student_services_switch;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'STUDENT_SERVICES_SWITCH_01_ROW_COUNT:%', v_rows;
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.student_services_switch'::regclass) THEN
    RAISE EXCEPTION 'STUDENT_SERVICES_SWITCH_01_RLS_NOT_ENABLED';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'student_services_switch') THEN
    RAISE EXCEPTION 'STUDENT_SERVICES_SWITCH_01_UNEXPECTED_POLICY';
  END IF;
  IF has_table_privilege('anon', 'public.student_services_switch', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
     OR has_table_privilege('authenticated', 'public.student_services_switch', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
     OR has_table_privilege('service_role', 'public.student_services_switch', 'INSERT,UPDATE,DELETE,TRUNCATE') THEN
    RAISE EXCEPTION 'STUDENT_SERVICES_SWITCH_01_TABLE_PRIVILEGE_LEAK';
  END IF;
  IF has_function_privilege('anon', 'public.admin_set_student_services_enabled(boolean,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_student_services_status()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.student_services_enabled()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_get_student_services_switch()', 'EXECUTE') THEN
    RAISE EXCEPTION 'STUDENT_SERVICES_SWITCH_01_ANON_EXECUTE_LEAK';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.student_requests'::regclass
      AND tgname = 'trg_00_student_services_switch_guard' AND tgenabled = 'O' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'STUDENT_SERVICES_SWITCH_01_GUARD_NOT_INSTALLED';
  END IF;
END;
$post$;

COMMIT;
