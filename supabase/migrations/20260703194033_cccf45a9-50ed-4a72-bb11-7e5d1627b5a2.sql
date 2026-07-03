-- COUNCILS-MVP-DB-HARDEN-01
REVOKE ALL PRIVILEGES ON TABLE
  public.academic_councils,
  public.academic_council_members,
  public.academic_council_meetings,
  public.academic_council_topics,
  public.academic_council_agenda_items,
  public.academic_council_minutes,
  public.academic_council_decisions
FROM anon;

REVOKE EXECUTE ON FUNCTION public.is_council_admin(uuid)                                                        FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_council_member(uuid, uuid)                                                 FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_council_role(uuid, uuid, public.academic_council_member_role)             FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_manage_council(uuid, uuid)                                                FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_write_council_agenda(uuid, uuid)                                          FROM anon, PUBLIC;

GRANT SELECT, INSERT, UPDATE ON
  public.academic_councils,
  public.academic_council_members,
  public.academic_council_meetings,
  public.academic_council_topics,
  public.academic_council_agenda_items,
  public.academic_council_minutes,
  public.academic_council_decisions
TO authenticated;

GRANT ALL ON
  public.academic_councils,
  public.academic_council_members,
  public.academic_council_meetings,
  public.academic_council_topics,
  public.academic_council_agenda_items,
  public.academic_council_minutes,
  public.academic_council_decisions
TO service_role;

GRANT EXECUTE ON FUNCTION public.is_council_admin(uuid)                                                        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_council_member(uuid, uuid)                                                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_council_role(uuid, uuid, public.academic_council_member_role)             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_council(uuid, uuid)                                                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_write_council_agenda(uuid, uuid)                                          TO authenticated, service_role;
