-- COUNCILS-FACULTY-REVIEW-FIXES-01
-- DRAFT ONLY — DO NOT APPLY FROM THIS PATH.
-- Source: faculty-portal code review 2026-10-01 (academic councils track).
-- Forward-only; applied migrations are not edited.
--
-- 1) get_council_report_vote_result_summary ordered by r.created_at, a column
--    academic_council_vote_results does not have (it has calculated_at), so the
--    "ملخص نتائج التصويت" report tab errors on every call.
--    Last definition: 20260810124128_8b20af1b-8607-42cd-94d8-f71793d9a687.sql.
-- 2) Topic attachment upload is blocked: C0 hardening
--    (20260808120000_councils_c0_write_surface_hardening_01.sql) revoked INSERT
--    on academic_council_topic_attachments from authenticated, but the server
--    function still inserts with the user client. This adds a narrow
--    SECURITY DEFINER writer that re-checks can_upload_council_topic_attachment;
--    tg_enforce_council_topic_attachment still validates path/limits on insert.
--    The app (src/lib/faculty-councils.functions.ts) calls this RPC first and
--    only falls back to the old insert while the RPC is not deployed.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Vote result summary: order by calculated_at.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_council_report_vote_result_summary(p_council_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_attendance_require_auth_uid();
BEGIN
  IF NOT (public.is_council_admin(v_uid) OR public.is_council_member(v_uid, p_council_id)) THEN
    RAISE EXCEPTION 'COUNCIL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'agenda_item_id', r.agenda_item_id,
      'meeting_id', i.meeting_id,
      'title', i.title,
      'yes_count', r.yes_count,
      'no_count', r.no_count,
      'abstain_count', r.abstain_count,
      'total_votes', r.total_votes,
      'outcome', r.outcome
    ) ORDER BY r.calculated_at DESC), '[]'::jsonb)
    FROM public.academic_council_vote_results r
    JOIN public.academic_council_agenda_items i ON i.id = r.agenda_item_id
    JOIN public.academic_council_meetings m ON m.id = i.meeting_id
    WHERE m.council_id = p_council_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_council_report_vote_result_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_council_report_vote_result_summary(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Narrow writer for topic attachment metadata rows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_council_topic_attachment(
  p_attachment_id uuid,
  p_topic_id uuid,
  p_council_id uuid,
  p_file_name text,
  p_file_path text,
  p_file_size bigint,
  p_mime_type text,
  p_file_ext text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.academic_council_topic_attachments;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_upload_council_topic_attachment(v_uid, p_topic_id, p_council_id) THEN
    RAISE EXCEPTION 'COUNCIL_ATTACHMENT_DENIED' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.academic_council_topic_attachments (
    id, topic_id, council_id, uploaded_by,
    file_name, file_path, file_size, mime_type, file_ext, storage_bucket
  ) VALUES (
    p_attachment_id, p_topic_id, p_council_id, v_uid,
    p_file_name, p_file_path, p_file_size, p_mime_type, p_file_ext,
    'council-topic-attachments'
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'file_path', v_row.file_path,
    'storage_bucket', v_row.storage_bucket
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_council_topic_attachment(uuid, uuid, uuid, text, text, bigint, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_council_topic_attachment(uuid, uuid, uuid, text, text, bigint, text, text)
  TO authenticated, service_role;

COMMIT;

-- Not included (governance decisions, see review report):
--  * ac_votes_select lets any council member read each member's individual
--    vote. If ballots must be secret, see COUNCIL-VOTE-SECRECY-OPTIONAL-01.sql.
--  * resolve_agenda_item has no state check and issue_council_decision does not
--    require outcome='passed'. Needs a decision on override semantics.
