-- =====================================================================
-- COUNCILS-MVP-DB-APPLY-01
-- Source: docs/drafts/20260703000000_councils_mvp_schema_rls.draft.sql
-- Scope: Academic Councils MVP — schema + RLS + helpers + safety triggers.
-- No seed. No storage. No notifications. No changes to existing tables.
-- =====================================================================

-- 0. ENUM TYPES
CREATE TYPE public.academic_council_type AS ENUM ('college', 'department');

CREATE TYPE public.academic_council_member_role AS ENUM (
  'chair', 'vice_chair', 'secretary', 'member', 'viewer'
);

CREATE TYPE public.academic_council_meeting_status AS ENUM (
  'scheduled', 'intake_open', 'intake_closed',
  'agenda_ready', 'in_session', 'minutes_draft',
  'minutes_locked', 'archived', 'cancelled'
);

CREATE TYPE public.academic_council_topic_status AS ENUM (
  'draft', 'submitted', 'under_review', 'needs_completion',
  'accepted_for_agenda', 'deferred', 'rejected',
  'decided', 'closed'
);

CREATE TYPE public.academic_council_decision_status AS ENUM (
  'issued', 'assigned', 'in_progress',
  'partially_completed', 'completed',
  'delayed', 'cancelled'
);

-- 1. academic_councils
CREATE TABLE public.academic_councils (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  name_en        text,
  council_type   public.academic_council_type NOT NULL,
  department_id  uuid REFERENCES public.departments(id) ON DELETE RESTRICT,
  description    text,
  settings       jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active      boolean NOT NULL DEFAULT true,
  created_by     uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_academic_councils_department ON public.academic_councils(department_id);
CREATE INDEX idx_academic_councils_type ON public.academic_councils(council_type);
GRANT SELECT, INSERT, UPDATE ON public.academic_councils TO authenticated;
GRANT ALL ON public.academic_councils TO service_role;
REVOKE DELETE ON public.academic_councils FROM authenticated;
ALTER TABLE public.academic_councils ENABLE ROW LEVEL SECURITY;

-- 2. academic_council_members
CREATE TABLE public.academic_council_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  council_id   uuid NOT NULL REFERENCES public.academic_councils(id) ON DELETE RESTRICT,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  member_role  public.academic_council_member_role NOT NULL DEFAULT 'member',
  is_active    boolean NOT NULL DEFAULT true,
  active_from  date NOT NULL DEFAULT CURRENT_DATE,
  active_to    date,
  notes        text,
  created_by   uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (council_id, user_id, member_role, active_from)
);
CREATE INDEX idx_acm_council ON public.academic_council_members(council_id);
CREATE INDEX idx_acm_user ON public.academic_council_members(user_id);
CREATE INDEX idx_acm_active ON public.academic_council_members(council_id, user_id) WHERE is_active;
GRANT SELECT, INSERT, UPDATE ON public.academic_council_members TO authenticated;
GRANT ALL ON public.academic_council_members TO service_role;
REVOKE DELETE ON public.academic_council_members FROM authenticated;
ALTER TABLE public.academic_council_members ENABLE ROW LEVEL SECURITY;

-- 3. academic_council_meetings
CREATE TABLE public.academic_council_meetings (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  council_id         uuid NOT NULL REFERENCES public.academic_councils(id) ON DELETE RESTRICT,
  academic_year_id   uuid REFERENCES public.academic_years(id) ON DELETE RESTRICT,
  meeting_number     integer NOT NULL,
  title              text NOT NULL,
  scheduled_at       timestamptz NOT NULL,
  location           text,
  intake_opens_at    timestamptz,
  intake_closes_at   timestamptz,
  status             public.academic_council_meeting_status NOT NULL DEFAULT 'scheduled',
  notes              text,
  created_by         uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_acmeet_council ON public.academic_council_meetings(council_id);
CREATE INDEX idx_acmeet_status ON public.academic_council_meetings(status);
CREATE UNIQUE INDEX idx_acmeet_council_year_number
  ON public.academic_council_meetings(council_id, academic_year_id, meeting_number)
  WHERE academic_year_id IS NOT NULL;
CREATE UNIQUE INDEX idx_acmeet_council_number_without_year
  ON public.academic_council_meetings(council_id, meeting_number)
  WHERE academic_year_id IS NULL;
GRANT SELECT, INSERT, UPDATE ON public.academic_council_meetings TO authenticated;
GRANT ALL ON public.academic_council_meetings TO service_role;
REVOKE DELETE ON public.academic_council_meetings FROM authenticated;
ALTER TABLE public.academic_council_meetings ENABLE ROW LEVEL SECURITY;

-- 4. academic_council_topics
CREATE TABLE public.academic_council_topics (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  council_id     uuid NOT NULL REFERENCES public.academic_councils(id) ON DELETE RESTRICT,
  meeting_id     uuid REFERENCES public.academic_council_meetings(id) ON DELETE RESTRICT,
  title          text NOT NULL,
  body           text NOT NULL,
  category       text,
  status         public.academic_council_topic_status NOT NULL DEFAULT 'draft',
  submitted_by   uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reviewed_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  review_note    text,
  submitted_at   timestamptz,
  decided_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_actopics_council ON public.academic_council_topics(council_id);
CREATE INDEX idx_actopics_meeting ON public.academic_council_topics(meeting_id);
CREATE INDEX idx_actopics_owner ON public.academic_council_topics(submitted_by);
CREATE INDEX idx_actopics_status ON public.academic_council_topics(status);
GRANT SELECT, INSERT, UPDATE ON public.academic_council_topics TO authenticated;
GRANT ALL ON public.academic_council_topics TO service_role;
REVOKE DELETE ON public.academic_council_topics FROM authenticated;
ALTER TABLE public.academic_council_topics ENABLE ROW LEVEL SECURITY;

-- 5. academic_council_agenda_items
CREATE TABLE public.academic_council_agenda_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id   uuid NOT NULL REFERENCES public.academic_council_meetings(id) ON DELETE RESTRICT,
  topic_id     uuid REFERENCES public.academic_council_topics(id) ON DELETE RESTRICT,
  order_index  integer NOT NULL,
  title        text NOT NULL,
  notes        text,
  is_approved  boolean NOT NULL DEFAULT false,
  approved_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at  timestamptz,
  created_by   uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, order_index)
);
CREATE INDEX idx_acagenda_meeting ON public.academic_council_agenda_items(meeting_id);
GRANT SELECT, INSERT, UPDATE ON public.academic_council_agenda_items TO authenticated;
GRANT ALL ON public.academic_council_agenda_items TO service_role;
REVOKE DELETE ON public.academic_council_agenda_items FROM authenticated;
ALTER TABLE public.academic_council_agenda_items ENABLE ROW LEVEL SECURITY;

-- 6. academic_council_minutes
CREATE TABLE public.academic_council_minutes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id    uuid NOT NULL UNIQUE REFERENCES public.academic_council_meetings(id) ON DELETE RESTRICT,
  body          text NOT NULL DEFAULT '',
  drafted_by    uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_locked     boolean NOT NULL DEFAULT false,
  locked_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.academic_council_minutes TO authenticated;
GRANT ALL ON public.academic_council_minutes TO service_role;
REVOKE DELETE ON public.academic_council_minutes FROM authenticated;
ALTER TABLE public.academic_council_minutes ENABLE ROW LEVEL SECURITY;

-- 7. academic_council_decisions
CREATE TABLE public.academic_council_decisions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id            uuid NOT NULL REFERENCES public.academic_council_meetings(id) ON DELETE RESTRICT,
  topic_id              uuid REFERENCES public.academic_council_topics(id) ON DELETE RESTRICT,
  decision_number       integer NOT NULL,
  title                 text NOT NULL,
  body                  text NOT NULL,
  status                public.academic_council_decision_status NOT NULL DEFAULT 'issued',
  responsible_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  due_date              date,
  execution_note        text,
  created_by            uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, decision_number)
);
CREATE INDEX idx_acdec_meeting ON public.academic_council_decisions(meeting_id);
CREATE INDEX idx_acdec_resp ON public.academic_council_decisions(responsible_user_id);
CREATE INDEX idx_acdec_status ON public.academic_council_decisions(status);
GRANT SELECT, INSERT, UPDATE ON public.academic_council_decisions TO authenticated;
GRANT ALL ON public.academic_council_decisions TO service_role;
REVOKE DELETE ON public.academic_council_decisions FROM authenticated;
ALTER TABLE public.academic_council_decisions ENABLE ROW LEVEL SECURITY;

-- 8. HELPER FUNCTIONS (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.is_council_admin(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user, 'system_admin'::public.app_role)
      OR public.has_role(_user, 'admin'::public.app_role);
$$;

CREATE OR REPLACE FUNCTION public.is_council_member(_user uuid, _council uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.academic_council_members m
    WHERE m.council_id = _council AND m.user_id = _user AND m.is_active = true
      AND (m.active_to IS NULL OR m.active_to > CURRENT_DATE)
  );
$$;

CREATE OR REPLACE FUNCTION public.has_council_role(
  _user uuid, _council uuid, _role public.academic_council_member_role
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.academic_council_members m
    WHERE m.council_id = _council AND m.user_id = _user AND m.member_role = _role
      AND m.is_active = true AND (m.active_to IS NULL OR m.active_to > CURRENT_DATE)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_council(_user uuid, _council uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_council_admin(_user)
      OR public.has_council_role(_user, _council, 'chair'::public.academic_council_member_role);
$$;

CREATE OR REPLACE FUNCTION public.can_write_council_agenda(_user uuid, _council uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_council_admin(_user)
      OR public.has_council_role(_user, _council, 'chair'::public.academic_council_member_role)
      OR public.has_council_role(_user, _council, 'secretary'::public.academic_council_member_role);
$$;

REVOKE ALL ON FUNCTION public.is_council_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_council_member(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_council_role(uuid, uuid, public.academic_council_member_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_council(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_write_council_agenda(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_council_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_council_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_council_role(uuid, uuid, public.academic_council_member_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_council(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_write_council_agenda(uuid, uuid) TO authenticated, service_role;

-- 9. RLS POLICIES
CREATE POLICY "councils_select" ON public.academic_councils FOR SELECT TO authenticated
  USING (public.is_council_admin(auth.uid()) OR public.is_council_member(auth.uid(), id));
CREATE POLICY "councils_insert_admin" ON public.academic_councils FOR INSERT TO authenticated
  WITH CHECK (public.is_council_admin(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "councils_update_admin_or_chair" ON public.academic_councils FOR UPDATE TO authenticated
  USING (public.can_manage_council(auth.uid(), id))
  WITH CHECK (public.can_manage_council(auth.uid(), id));

CREATE POLICY "council_members_select" ON public.academic_council_members FOR SELECT TO authenticated
  USING (public.is_council_admin(auth.uid()) OR public.is_council_member(auth.uid(), council_id));
CREATE POLICY "council_members_insert" ON public.academic_council_members FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_council(auth.uid(), council_id) AND created_by = auth.uid());
CREATE POLICY "council_members_update" ON public.academic_council_members FOR UPDATE TO authenticated
  USING (public.can_manage_council(auth.uid(), council_id))
  WITH CHECK (public.can_manage_council(auth.uid(), council_id));

CREATE POLICY "meetings_select" ON public.academic_council_meetings FOR SELECT TO authenticated
  USING (public.is_council_admin(auth.uid()) OR public.is_council_member(auth.uid(), council_id));
CREATE POLICY "meetings_insert" ON public.academic_council_meetings FOR INSERT TO authenticated
  WITH CHECK (public.can_write_council_agenda(auth.uid(), council_id) AND created_by = auth.uid());
CREATE POLICY "meetings_update" ON public.academic_council_meetings FOR UPDATE TO authenticated
  USING (public.can_write_council_agenda(auth.uid(), council_id))
  WITH CHECK (public.can_write_council_agenda(auth.uid(), council_id));

CREATE POLICY "topics_select" ON public.academic_council_topics FOR SELECT TO authenticated
  USING (public.is_council_admin(auth.uid()) OR public.is_council_member(auth.uid(), council_id) OR submitted_by = auth.uid());
CREATE POLICY "topics_insert_member" ON public.academic_council_topics FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid()
    AND (public.is_council_admin(auth.uid()) OR public.is_council_member(auth.uid(), council_id)));
CREATE POLICY "topics_update_owner_draft" ON public.academic_council_topics FOR UPDATE TO authenticated
  USING (
    (submitted_by = auth.uid() AND status IN (
       'draft'::public.academic_council_topic_status,
       'needs_completion'::public.academic_council_topic_status))
    OR public.can_write_council_agenda(auth.uid(), council_id)
  )
  WITH CHECK (
    (submitted_by = auth.uid() AND status IN (
       'draft'::public.academic_council_topic_status,
       'needs_completion'::public.academic_council_topic_status,
       'submitted'::public.academic_council_topic_status))
    OR public.can_write_council_agenda(auth.uid(), council_id)
  );

CREATE POLICY "agenda_select" ON public.academic_council_agenda_items FOR SELECT TO authenticated
  USING (public.is_council_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.academic_council_meetings mt
               WHERE mt.id = meeting_id AND public.is_council_member(auth.uid(), mt.council_id)));
CREATE POLICY "agenda_insert" ON public.academic_council_agenda_items FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.academic_council_meetings mt
                WHERE mt.id = meeting_id AND public.can_write_council_agenda(auth.uid(), mt.council_id)));
CREATE POLICY "agenda_update" ON public.academic_council_agenda_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.academic_council_meetings mt
                 WHERE mt.id = meeting_id AND public.can_write_council_agenda(auth.uid(), mt.council_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.academic_council_meetings mt
                      WHERE mt.id = meeting_id AND public.can_write_council_agenda(auth.uid(), mt.council_id)));

CREATE POLICY "minutes_select" ON public.academic_council_minutes FOR SELECT TO authenticated
  USING (public.is_council_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.academic_council_meetings mt
               WHERE mt.id = meeting_id AND public.is_council_member(auth.uid(), mt.council_id)));
CREATE POLICY "minutes_insert_secretary" ON public.academic_council_minutes FOR INSERT TO authenticated
  WITH CHECK (drafted_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.academic_council_meetings mt
                WHERE mt.id = meeting_id
                  AND (public.is_council_admin(auth.uid())
                    OR public.has_council_role(auth.uid(), mt.council_id, 'secretary'::public.academic_council_member_role))));
CREATE POLICY "minutes_update_before_lock" ON public.academic_council_minutes FOR UPDATE TO authenticated
  USING (is_locked = false
    AND EXISTS (SELECT 1 FROM public.academic_council_meetings mt
                WHERE mt.id = meeting_id
                  AND (public.is_council_admin(auth.uid())
                    OR public.has_council_role(auth.uid(), mt.council_id, 'secretary'::public.academic_council_member_role))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.academic_council_meetings mt
                      WHERE mt.id = meeting_id
                        AND (public.is_council_admin(auth.uid())
                          OR public.has_council_role(auth.uid(), mt.council_id, 'secretary'::public.academic_council_member_role))));

CREATE POLICY "decisions_select" ON public.academic_council_decisions FOR SELECT TO authenticated
  USING (public.is_council_admin(auth.uid())
    OR responsible_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.academic_council_meetings mt
               WHERE mt.id = meeting_id AND public.is_council_member(auth.uid(), mt.council_id)));
CREATE POLICY "decisions_insert" ON public.academic_council_decisions FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.academic_council_meetings mt
                WHERE mt.id = meeting_id AND public.can_write_council_agenda(auth.uid(), mt.council_id)));
CREATE POLICY "decisions_update" ON public.academic_council_decisions FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.academic_council_meetings mt
                 WHERE mt.id = meeting_id AND public.can_write_council_agenda(auth.uid(), mt.council_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.academic_council_meetings mt
                      WHERE mt.id = meeting_id AND public.can_write_council_agenda(auth.uid(), mt.council_id)));

-- 10. TRIGGERS
CREATE OR REPLACE FUNCTION public.tg_academic_councils_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_ac_touch BEFORE UPDATE ON public.academic_councils
  FOR EACH ROW EXECUTE FUNCTION public.tg_academic_councils_touch_updated_at();
CREATE TRIGGER trg_acm_touch BEFORE UPDATE ON public.academic_council_members
  FOR EACH ROW EXECUTE FUNCTION public.tg_academic_councils_touch_updated_at();
CREATE TRIGGER trg_acmeet_touch BEFORE UPDATE ON public.academic_council_meetings
  FOR EACH ROW EXECUTE FUNCTION public.tg_academic_councils_touch_updated_at();
CREATE TRIGGER trg_actopics_touch BEFORE UPDATE ON public.academic_council_topics
  FOR EACH ROW EXECUTE FUNCTION public.tg_academic_councils_touch_updated_at();
CREATE TRIGGER trg_acagenda_touch BEFORE UPDATE ON public.academic_council_agenda_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_academic_councils_touch_updated_at();
CREATE TRIGGER trg_acmin_touch BEFORE UPDATE ON public.academic_council_minutes
  FOR EACH ROW EXECUTE FUNCTION public.tg_academic_councils_touch_updated_at();
CREATE TRIGGER trg_acdec_touch BEFORE UPDATE ON public.academic_council_decisions
  FOR EACH ROW EXECUTE FUNCTION public.tg_academic_councils_touch_updated_at();

CREATE OR REPLACE FUNCTION public.tg_minutes_block_locked_edits()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.is_locked = true THEN
    RAISE EXCEPTION 'academic_council_minutes: record is locked and cannot be modified';
  END IF;
  IF NEW.is_locked = true AND OLD.is_locked = false THEN
    NEW.locked_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_acmin_lock_guard BEFORE UPDATE ON public.academic_council_minutes
  FOR EACH ROW EXECUTE FUNCTION public.tg_minutes_block_locked_edits();

CREATE OR REPLACE FUNCTION public.tg_councils_validate_department_binding()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.council_type = 'department' AND NEW.department_id IS NULL THEN
    RAISE EXCEPTION 'academic_councils: department_id is required for department councils';
  END IF;
  IF NEW.council_type = 'college' AND NEW.department_id IS NOT NULL THEN
    RAISE EXCEPTION 'academic_councils: department_id must be NULL for college councils';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ac_validate_dept
  BEFORE INSERT OR UPDATE ON public.academic_councils
  FOR EACH ROW EXECUTE FUNCTION public.tg_councils_validate_department_binding();