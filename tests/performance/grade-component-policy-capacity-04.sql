\set ON_ERROR_STOP on
-- Empty disposable PG17 database only. Includes real RLS and auth.uid semantics.
BEGIN;
SET LOCAL statement_timeout='30s';
CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$
 SELECT coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
   (nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub'))::uuid
$fn$;
CREATE FUNCTION test_id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE
 AS $$SELECT lpad(to_hex(n),32,'0')::uuid$$;
CREATE TABLE student_profiles(id uuid PRIMARY KEY,user_id uuid UNIQUE);
CREATE TABLE student_enrollments(id uuid PRIMARY KEY,student_profile_id uuid,course_section_id uuid);
CREATE INDEX ON student_enrollments(student_profile_id);
CREATE TABLE grade_components(id uuid PRIMARY KEY,course_section_id uuid,max_score numeric);
CREATE TABLE fixture_roles(user_id uuid,role_name text);
CREATE TABLE fixture_sections(user_id uuid,section_id uuid,role_name text);
CREATE FUNCTION has_any_role(u uuid,r text[]) RETURNS boolean LANGUAGE sql STABLE
 SECURITY DEFINER SET search_path=public AS $fn$
 SELECT EXISTS(SELECT 1 FROM fixture_roles WHERE user_id=u AND role_name=ANY(r))
$fn$;
CREATE FUNCTION is_dept_head_of_section(u uuid,s uuid) RETURNS boolean LANGUAGE sql STABLE
 SECURITY DEFINER SET search_path=public AS $fn$
 SELECT EXISTS(SELECT 1 FROM fixture_sections WHERE user_id=u AND section_id=s AND role_name='head')
$fn$;
CREATE FUNCTION is_faculty_of_section(u uuid,s uuid) RETURNS boolean LANGUAGE sql STABLE
 SECURITY DEFINER SET search_path=public AS $fn$
 SELECT EXISTS(SELECT 1 FROM fixture_sections WHERE user_id=u AND section_id=s AND role_name='faculty')
$fn$;
INSERT INTO student_profiles VALUES(test_id(1),test_id(101)),(test_id(2),test_id(102)),(test_id(3),test_id(103));
INSERT INTO student_profiles SELECT test_id(10000+n),NULL FROM generate_series(1,20000) n;
INSERT INTO student_enrollments VALUES(test_id(501),test_id(1),test_id(1001)),(test_id(502),test_id(2),test_id(1002));
INSERT INTO grade_components VALUES
 (test_id(11),test_id(1001),50),(test_id(12),test_id(1001),50),
 (test_id(21),test_id(1002),100),(test_id(31),test_id(1003),100),(test_id(41),test_id(1004),100);
INSERT INTO fixture_roles VALUES(test_id(301),'admin'),(test_id(401),'support');
INSERT INTO fixture_sections VALUES(test_id(201),test_id(1003),'head'),(test_id(202),test_id(1002),'faculty');
GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
GRANT SELECT ON student_profiles,student_enrollments TO authenticated,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON grade_components TO authenticated,anon;
ALTER TABLE student_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE grade_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY sp_select ON student_profiles FOR SELECT TO authenticated USING (
 auth.uid()=user_id OR has_any_role(auth.uid(),ARRAY['admin','system_admin','registrar','dean','student_affairs']));
CREATE POLICY se_select ON student_enrollments FOR SELECT TO authenticated USING (
 EXISTS(SELECT 1 FROM student_profiles sp WHERE sp.id=student_profile_id AND sp.user_id=auth.uid())
 OR has_any_role(auth.uid(),ARRAY['admin','system_admin','registrar','dean','student_affairs']));
-- Exact current gc_select predicate, present in both staging and production.
CREATE POLICY gc_select ON grade_components FOR SELECT TO authenticated USING (
 has_any_role(auth.uid(),ARRAY['admin'::text,'system_admin'::text,'registrar'::text,'dean'::text,'student_affairs'::text])
 OR is_dept_head_of_section(auth.uid(),course_section_id)
 OR is_faculty_of_section(auth.uid(),course_section_id)
 OR EXISTS(SELECT 1 FROM student_enrollments e JOIN student_profiles sp ON sp.id=e.student_profile_id
   WHERE e.course_section_id=grade_components.course_section_id AND sp.user_id=auth.uid()));
CREATE TEMP TABLE policy_metadata AS SELECT polname,polroles,polcmd,polpermissive,polwithcheck
 FROM pg_policy WHERE polrelid='grade_components'::regclass;
CREATE TEMP TABLE table_metadata AS SELECT relowner,relacl,relrowsecurity,relforcerowsecurity
 FROM pg_class WHERE oid='grade_components'::regclass;
CREATE TEMP TABLE matrix(actor integer,expected uuid[]);
INSERT INTO matrix VALUES
 (101,ARRAY[test_id(11),test_id(12)]),(102,ARRAY[test_id(21)]),(103,ARRAY[]::uuid[]),
 (201,ARRAY[test_id(31)]),(202,ARRAY[test_id(21)]),
 (301,ARRAY[test_id(11),test_id(12),test_id(21),test_id(31),test_id(41)]),
 (401,ARRAY[]::uuid[]),(999,ARRAY[]::uuid[]),(NULL,ARRAY[]::uuid[]);
CREATE TEMP TABLE baseline_matrix(actor integer,rows_seen uuid[]);
DO $test$
DECLARE a record; actual uuid[];
BEGIN
 FOR a IN SELECT * FROM matrix LOOP
   PERFORM set_config('request.jwt.claim.sub',coalesce(test_id(a.actor)::text,''),true);
   EXECUTE 'SET LOCAL ROLE authenticated';
   SELECT coalesce(array_agg(id ORDER BY id),ARRAY[]::uuid[]) INTO actual FROM grade_components;
   EXECUTE 'RESET ROLE';
   IF actual IS DISTINCT FROM a.expected THEN RAISE EXCEPTION 'Old policy fixture mismatch for %',a.actor; END IF;
   INSERT INTO baseline_matrix VALUES(a.actor,actual);
 END LOOP;
END $test$;
\ir ../../supabase/migrations/20260910090000_grade_component_student_identity_initplan.sql
DO $test$
DECLARE a record; actual uuid[];
BEGIN
 FOR a IN SELECT m.*,b.rows_seen FROM matrix m JOIN baseline_matrix b ON m.actor IS NOT DISTINCT FROM b.actor LOOP
   PERFORM set_config('request.jwt.claim.sub',coalesce(test_id(a.actor)::text,''),true);
   EXECUTE 'SET LOCAL ROLE authenticated';
   SELECT coalesce(array_agg(id ORDER BY id),ARRAY[]::uuid[]) INTO actual FROM grade_components;
   EXECUTE 'RESET ROLE';
   IF actual IS DISTINCT FROM a.expected OR actual IS DISTINCT FROM a.rows_seen THEN
     RAISE EXCEPTION 'Authorization changed for %',a.actor;
   END IF;
 END LOOP;
 IF EXISTS(SELECT * FROM policy_metadata EXCEPT ALL SELECT polname,polroles,polcmd,polpermissive,polwithcheck
   FROM pg_policy WHERE polrelid='grade_components'::regclass) THEN RAISE EXCEPTION 'Policy metadata changed'; END IF;
 IF EXISTS(SELECT * FROM table_metadata EXCEPT ALL SELECT relowner,relacl,relrowsecurity,relforcerowsecurity
   FROM pg_class WHERE oid='grade_components'::regclass) THEN RAISE EXCEPTION 'Owner, grants or RLS changed'; END IF;
END $test$;
-- An anon role cannot gain access even when a sub claim is present.
SELECT set_config('request.jwt.claim.sub',test_id(101)::text,true);
SET LOCAL ROLE anon;
DO $test$ BEGIN
 IF EXISTS(SELECT 1 FROM grade_components) THEN RAISE EXCEPTION 'Anonymous access'; END IF;
END $test$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $test$
DECLARE changed integer; denied boolean=false;
BEGIN
 BEGIN
   INSERT INTO grade_components VALUES(test_id(999),test_id(1001),100);
 EXCEPTION WHEN insufficient_privilege THEN denied=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'SELECT optimization opened INSERT'; END IF;
 UPDATE grade_components SET max_score=999 WHERE id=test_id(11);
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>0 THEN RAISE EXCEPTION 'SELECT optimization opened UPDATE'; END IF;
 DELETE FROM grade_components WHERE id=test_id(11);
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>0 THEN RAISE EXCEPTION 'SELECT optimization opened DELETE'; END IF;
END $test$;
RESET ROLE;
ANALYZE student_profiles;
ANALYZE student_enrollments;
ANALYZE grade_components;
SET LOCAL ROLE authenticated;
DO $test$
DECLARE plan jsonb; visited numeric; actual uuid[];
BEGIN
 EXECUTE 'EXPLAIN (ANALYZE,FORMAT JSON) SELECT id FROM grade_components' INTO plan;
 WITH RECURSIVE nodes(p) AS (
   SELECT plan->0->'Plan'
   UNION ALL SELECT child FROM nodes CROSS JOIN LATERAL jsonb_array_elements(p->'Plans') children(child)
 ) SELECT sum((coalesce((p->>'Actual Rows')::numeric,0)+coalesce((p->>'Rows Removed by Filter')::numeric,0))*
   coalesce((p->>'Actual Loops')::numeric,0)) INTO visited FROM nodes WHERE p->>'Relation Name'='student_profiles';
 IF visited IS NULL OR visited>16 THEN RAISE EXCEPTION 'Student policy scanned unrelated profiles: %',visited; END IF;
 RAISE NOTICE 'CAP04 profile rows visited under student RLS: %',visited;
 -- The initplan is per statement: changing identity on one connection must not
 -- retain the previous student's visible components.
 PERFORM set_config('request.jwt.claim.sub',test_id(102)::text,true);
 SELECT array_agg(id ORDER BY id) INTO actual FROM grade_components;
 IF actual IS DISTINCT FROM ARRAY[test_id(21)] THEN RAISE EXCEPTION 'Identity cached across statements'; END IF;
END $test$;
RESET ROLE;
\ir ../../supabase/migrations/20260910090000_grade_component_student_identity_initplan.sql
ROLLBACK;
SELECT 'PASS: exact old/new role matrix, anonymous denial, write isolation, metadata, bounded profile scan, identity switch and reapply' AS result;
