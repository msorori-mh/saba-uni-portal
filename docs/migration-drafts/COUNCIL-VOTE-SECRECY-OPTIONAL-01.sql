-- COUNCIL-VOTE-SECRECY-OPTIONAL-01
-- DRAFT ONLY — DO NOT APPLY FROM THIS PATH.
-- OPTIONAL: apply only if the college decides individual council votes are
-- confidential (the UI contract in src/lib/councils-c4-c8.functions.ts already
-- promises it "never returns an individual vote direction").
--
-- Current policy (20260810012715_72757e0e-…sql, "ac_votes_select") lets ANY
-- active council member, including the viewer role, read every member's
-- yes/no/abstain via PostgREST with their own token.
-- After this change: a member reads only their own vote; council admins keep
-- full access; aggregate results stay readable via
-- academic_council_vote_results / get_council_vote_result.

BEGIN;

DROP POLICY IF EXISTS "ac_votes_select" ON public.academic_council_votes;

CREATE POLICY "ac_votes_select"
  ON public.academic_council_votes
  FOR SELECT TO authenticated
  USING (
    voter_user_id = auth.uid()
    OR public.is_council_admin(auth.uid())
  );

COMMIT;

-- Before applying, confirm no SECURITY INVOKER function or UI path relies on
-- members reading others' votes (grep: academic_council_votes in src/ and in
-- non-SECURITY DEFINER functions).
