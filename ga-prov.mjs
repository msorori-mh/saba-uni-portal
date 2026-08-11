import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
const url = process.env.SUPABASE_URL, svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, svc, { auth: { persistSession: false } });
const DEPT = '11111111-1111-4111-8111-111111111111';
const PROG = '8df96335-4197-4e33-85ca-a970608f6a63';
const PASS = 'TestOnly#Journey2026';
const TAG = 'TEST_ONLY_GA_JOURNEY_01';
const EMAIL = 'ga-journey01@test-only.usr.edu.ye';
const APPROVER = '4c261c1c-97fb-42da-a544-e8a59853ebe3';

let userId;
const { data: created, error } = await admin.auth.admin.createUser({ email: EMAIL, password: PASS, email_confirm: true, user_metadata: { full_name: `خريج اختبار - ${TAG}` } });
if (error) {
  if (!/already/i.test(error.message)) throw error;
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  userId = list.users.find(u => u.email === EMAIL).id;
  await admin.auth.admin.updateUserById(userId, { password: PASS, email_confirm: true });
} else userId = created.user.id;

const academic_number = `${TAG}-G`;
const { data: prof, error: pe } = await admin.from('student_profiles').upsert({
  user_id: userId, academic_number, full_name_ar: `خريج اختبار - ${TAG}`, email: EMAIL,
  department_id: DEPT, program_id: PROG, status: 'active', must_change_password: false,
}, { onConflict: 'academic_number' }).select('id').single();
if (pe) throw pe;
await admin.from('user_roles').upsert({ user_id: userId, role: 'student' }, { onConflict: 'user_id,role' });

const snapshot = { gpa: 3.4, total_credits: 132, tag: TAG };
const sha = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
const ref = `${TAG}-DECISION-01`;
let { data: dec } = await admin.from('graduate_official_decisions').select('id').eq('source_reference', ref).maybeSingle();
if (!dec) {
  const ins = await admin.from('graduate_official_decisions').insert({
    student_profile_id: prof.id, source_kind: 'registrar_approved_decision', source_reference: ref,
    decision_state: 'approved', approved_at: new Date().toISOString(), approved_by: APPROVER,
    effective_graduation_date: '2026-07-15', program_id: PROG, department_id: DEPT,
    academic_snapshot: snapshot, source_payload_sha256: sha,
  }).select('id').single();
  if (ins.error) throw ins.error;
  dec = ins.data;
}
let { data: rec } = await admin.from('graduate_records').select('id').eq('official_decision_id', dec.id).maybeSingle();
if (!rec) {
  const ins = await admin.from('graduate_records').insert({
    official_decision_id: dec.id, student_profile_id: prof.id, effective_graduation_date: '2026-07-15',
    program_id: PROG, department_id: DEPT, academic_snapshot: snapshot, record_state: 'approved', created_by: APPROVER,
  }).select('id').single();
  if (ins.error) throw ins.error;
  rec = ins.data;
}
console.log(JSON.stringify({ userId, profileId: prof.id, email: EMAIL, decisionId: dec.id, graduateRecordId: rec.id }, null, 2));
