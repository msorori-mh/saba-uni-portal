\set ON_ERROR_STOP on
-- Run only in an empty, disposable PostgreSQL 17 database. All fixtures roll back.
BEGIN;
SET LOCAL statement_timeout = '30s';
CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE FUNCTION public.test_id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE
AS $$ SELECT lpad(to_hex(n), 32, '0')::uuid $$;

CREATE TABLE student_profiles (id uuid PRIMARY KEY, user_id uuid, academic_number text,
  full_name_ar text, full_name_en text, program_id uuid);
CREATE TABLE student_enrollments (id uuid PRIMARY KEY, student_profile_id uuid,
  course_section_id uuid, enrollment_status text);
CREATE TABLE student_grades (id uuid PRIMARY KEY, student_enrollment_id uuid,
  grade_component_id uuid, score numeric, status text);
CREATE TABLE grade_components (id uuid PRIMARY KEY, max_score numeric);
CREATE TABLE grade_appeal_details (id uuid PRIMARY KEY, student_enrollment_id uuid,
  approved_final_result numeric, result_change_applied_at timestamptz);
CREATE TABLE course_sections (id uuid PRIMARY KEY, course_offering_id uuid, section_code text);
CREATE TABLE course_offerings (id uuid PRIMARY KEY, course_id uuid, program_id uuid,
  academic_year_id uuid, semester_id uuid, level_id uuid);
CREATE TABLE courses (id uuid PRIMARY KEY, code text, name_ar text, credit_hours integer, department_id uuid);
CREATE TABLE programs (id uuid PRIMARY KEY, name_ar text);
CREATE TABLE departments (id uuid PRIMARY KEY, name_ar text);
CREATE TABLE academic_years (id uuid PRIMARY KEY, name text);
CREATE TABLE semesters (id uuid PRIMARY KEY, name text, code text);
CREATE TABLE academic_levels (id uuid PRIMARY KEY, name text, level_number integer);
CREATE TABLE student_equivalency_credits (id uuid PRIMARY KEY, student_profile_id uuid,
  course_id uuid, credit_hours integer, external_course_code text, external_course_name text);
CREATE INDEX ON student_enrollments (student_profile_id);
CREATE INDEX ON student_grades (student_enrollment_id);
CREATE INDEX ON grade_appeal_details (student_enrollment_id, result_change_applied_at DESC);

INSERT INTO programs VALUES (test_id(10),'برنامج اختبار');
INSERT INTO departments VALUES (test_id(11),'قسم اختبار');
INSERT INTO academic_years VALUES (test_id(12),'عام اختبار');
INSERT INTO semesters VALUES (test_id(13),'فصل اختبار','S1');
INSERT INTO academic_levels VALUES (test_id(14),'مستوى اختبار',1);
INSERT INTO student_profiles VALUES
  (test_id(1),test_id(101),'TEST-A','طالب أ','Student A',test_id(10)),
  (test_id(2),test_id(102),'TEST-B','طالب ب','Student B',test_id(10));
INSERT INTO courses SELECT test_id(200+n),'C'||n,'مقرر '||n,3,test_id(11) FROM generate_series(1,9) n;
INSERT INTO course_offerings SELECT test_id(300+n),test_id(200+n),test_id(10),test_id(12),test_id(13),test_id(14) FROM generate_series(1,9) n;
INSERT INTO course_sections SELECT test_id(400+n),test_id(300+n),'S'||n FROM generate_series(1,9) n;
INSERT INTO student_enrollments SELECT test_id(500+n),test_id(CASE WHEN n=9 THEN 2 ELSE 1 END),test_id(400+n),'enrolled' FROM generate_series(1,9) n;
INSERT INTO grade_components SELECT test_id(1000+n*2+g),CASE WHEN n=4 THEN 0 ELSE 50 END FROM generate_series(1,9) n CROSS JOIN generate_series(0,1) g;
INSERT INTO student_grades
SELECT test_id(2000+n*2+g),test_id(500+n),test_id(1000+n*2+g),
 CASE n WHEN 1 THEN 47.99/2 WHEN 2 THEN 48.0/2 WHEN 3 THEN 90.0/2
        WHEN 4 THEN 0 WHEN 6 THEN 50 WHEN 7 THEN 60.0/2 WHEN 9 THEN 75.0/2 END,
 CASE WHEN n=6 THEN CASE WHEN g=0 THEN 'draft' ELSE 'submitted' END ELSE 'approved' END
FROM generate_series(1,9) n CROSS JOIN generate_series(0,1) g WHERE n NOT IN (5,8);
INSERT INTO grade_appeal_details VALUES
 (test_id(3001),test_id(507),88,'2026-01-01T00:00:00Z'),
 (test_id(3002),test_id(507),92,'2026-02-01T00:00:00Z'),
 (test_id(3003),test_id(507),99,NULL),
 (test_id(3004),test_id(508),99,'2026-03-01T00:00:00Z');
INSERT INTO student_equivalency_credits VALUES
 (test_id(4001),test_id(1),test_id(205),4,'EXT-A','معادلة أ'),
 (test_id(4002),test_id(2),test_id(206),NULL,'EXT-B','معادلة ب');

\ir fixtures/transcript-before-04.sql
CREATE VIEW public.student_transcript_summary WITH (security_invoker=true) AS
  SELECT student_profile_id,count(*) AS courses_count FROM public.student_unofficial_transcript GROUP BY student_profile_id;
GRANT USAGE ON SCHEMA public TO authenticated,anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated,anon;
ALTER TABLE student_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_profile ON student_profiles FOR SELECT TO authenticated
  USING (user_id = nullif(current_setting('request.jwt.claim.sub',true),'')::uuid);

CREATE TEMP TABLE baseline AS SELECT * FROM student_unofficial_transcript;
CREATE TEMP TABLE view_metadata AS SELECT oid,relowner,relacl,reloptions FROM pg_class WHERE oid='public.student_unofficial_transcript'::regclass;
\ir ../../supabase/migrations/20260910080000_transcript_per_enrollment_aggregation.sql

DO $test$
BEGIN
 IF EXISTS ((SELECT * FROM baseline EXCEPT ALL SELECT * FROM student_unofficial_transcript)
       UNION ALL (SELECT * FROM student_unofficial_transcript EXCEPT ALL SELECT * FROM baseline)) THEN
   RAISE EXCEPTION 'Output changed versus original view';
 END IF;
 IF (SELECT count(*) FROM student_unofficial_transcript) <> 8 THEN RAISE EXCEPTION 'Unexpected fixture row count'; END IF;
 IF (SELECT course_status FROM student_unofficial_transcript WHERE enrollment_id=test_id(501)) <> 'failed' THEN RAISE EXCEPTION '47.99 boundary'; END IF;
 IF (SELECT official_result FROM student_unofficial_transcript WHERE enrollment_id=test_id(502)) <> 50 THEN RAISE EXCEPTION '48 boundary'; END IF;
 IF (SELECT grade_label FROM student_unofficial_transcript WHERE enrollment_id=test_id(503)) <> 'ممتاز' THEN RAISE EXCEPTION '90 boundary'; END IF;
 IF (SELECT official_result FROM student_unofficial_transcript WHERE enrollment_id=test_id(504)) <> 0 THEN RAISE EXCEPTION 'Zero maximum'; END IF;
 IF EXISTS (SELECT 1 FROM student_unofficial_transcript WHERE enrollment_id IN(test_id(505),test_id(506),test_id(508))) THEN RAISE EXCEPTION 'No approved grade must not gain a row'; END IF;
 IF (SELECT final_score FROM student_unofficial_transcript WHERE enrollment_id=test_id(507)) <> 92 THEN RAISE EXCEPTION 'Latest applied appeal precedence'; END IF;
 IF (SELECT credit_hours FROM student_unofficial_transcript WHERE enrollment_id=test_id(4001)) <> 4
 OR (SELECT credit_hours FROM student_unofficial_transcript WHERE enrollment_id=test_id(4002)) <> 3 THEN RAISE EXCEPTION 'Equivalency credits'; END IF;
 IF EXISTS (SELECT 1 FROM view_metadata b JOIN pg_class c ON c.oid=b.oid
   WHERE c.relowner<>b.relowner OR c.relacl IS DISTINCT FROM b.relacl OR c.reloptions IS DISTINCT FROM b.reloptions) THEN RAISE EXCEPTION 'Owner, grants or invoker security changed'; END IF;
 IF (SELECT sum(courses_count) FROM student_transcript_summary) <> 8 THEN RAISE EXCEPTION 'Dependent summary changed'; END IF;
END $test$;

-- Exercise the actual replacement view under an invoking role, not its owner.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',test_id(101)::text,true);
DO $test$
BEGIN
 IF (SELECT count(*) FROM student_unofficial_transcript) <> 6 THEN RAISE EXCEPTION 'Owner A must see six rows'; END IF;
 IF EXISTS (SELECT 1 FROM student_unofficial_transcript WHERE student_profile_id=test_id(2)) THEN RAISE EXCEPTION 'Cross-owner read'; END IF;
END $test$;
SELECT set_config('request.jwt.claim.sub',test_id(102)::text,true);
DO $test$
BEGIN
 IF (SELECT count(*) FROM student_unofficial_transcript) <> 2 THEN RAISE EXCEPTION 'Owner B must see two rows'; END IF;
 IF EXISTS (SELECT 1 FROM student_unofficial_transcript WHERE student_profile_id=test_id(1)) THEN RAISE EXCEPTION 'Reverse cross-owner read'; END IF;
END $test$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $test$
BEGIN
 IF EXISTS (SELECT 1 FROM student_unofficial_transcript) THEN RAISE EXCEPTION 'Anonymous read'; END IF;
END $test$;
RESET ROLE;

-- Unrelated data must not become work for one student's grade aggregate.
INSERT INTO student_enrollments SELECT test_id(30000+n),test_id(2),test_id(409),'enrolled' FROM generate_series(1,5000) n;
INSERT INTO student_grades SELECT test_id(40000+n),test_id(30000+n),test_id(1018),40,'approved' FROM generate_series(1,5000) n;
ANALYZE student_profiles;
ANALYZE student_enrollments;
ANALYZE student_grades;
DO $test$
DECLARE plan jsonb; visited numeric;
BEGIN
 EXECUTE 'EXPLAIN (ANALYZE,FORMAT JSON) SELECT * FROM student_unofficial_transcript WHERE student_profile_id='''||test_id(1)||'''' INTO plan;
 WITH RECURSIVE nodes(p) AS (
   SELECT plan->0->'Plan'
   UNION ALL SELECT child FROM nodes CROSS JOIN LATERAL jsonb_array_elements(p->'Plans') AS children(child)
 ) SELECT sum((coalesce((p->>'Actual Rows')::numeric,0)+coalesce((p->>'Rows Removed by Filter')::numeric,0))*(p->>'Actual Loops')::numeric)
 INTO visited FROM nodes WHERE p->>'Relation Name'='student_grades';
 IF visited IS NULL OR visited > 16 THEN RAISE EXCEPTION 'Unrelated grade scan: % rows',visited; END IF;
 RAISE NOTICE 'CAP04 grade rows visited for student A: %',visited;
END $test$;

-- Reapplying the migration must preserve the contract and dependents.
\ir ../../supabase/migrations/20260910080000_transcript_per_enrollment_aggregation.sql
DO $test$ BEGIN
 IF (SELECT courses_count FROM student_transcript_summary WHERE student_profile_id=test_id(1))<>6 THEN RAISE EXCEPTION 'Reapply changed result'; END IF;
END $test$;
ROLLBACK;
SELECT 'PASS: exact rows, academic boundaries, appeals, equivalencies, RLS, metadata, indexed work and reapply' AS result;
