import { createClient } from '@supabase/supabase-js';
const url = process.env.SUPABASE_URL, svc = process.env.SUPABASE_SERVICE_ROLE_KEY, pub = process.env.SUPABASE_PUBLISHABLE_KEY;
const admin = createClient(url, svc, { auth: { persistSession: false } });
const DEPT = '11111111-1111-4111-8111-111111111111';
const PROG = '8df96335-4197-4e33-85ca-a970608f6a63';
const YEAR = '1b9e6972-0870-41d6-b849-bdcbc7b6c0d6';
const SEM  = 'dc917e4d-607d-43ce-9d78-020de14eccf0';
const L4   = 'aab5f2cb-17a8-4eab-bb85-3baba0a00331';
const PASS = 'TestOnly#Journey2026';
const TAG = 'TEST_ONLY_GP_JOURNEY_01';
const members = [
  { key: 'L',  email: `gp-journey01-leader@test-only.usr.edu.ye`,   name: 'طالب اختبار قائد' },
  { key: 'MA', email: `gp-journey01-member-a@test-only.usr.edu.ye`, name: 'طالب اختبار عضو أ' },
  { key: 'MB', email: `gp-journey01-member-b@test-only.usr.edu.ye`, name: 'طالب اختبار عضو ب' },
];
const out = {};
for (const m of members) {
  let userId;
  const { data: created, error } = await admin.auth.admin.createUser({ email: m.email, password: PASS, email_confirm: true, user_metadata: { full_name: `${m.name} - ${TAG}` } });
  if (error) {
    if (!/already/i.test(error.message)) throw error;
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    userId = list.users.find(u => u.email === m.email).id;
    await admin.auth.admin.updateUserById(userId, { password: PASS, email_confirm: true });
  } else userId = created.user.id;
  const academic_number = `${TAG}-${m.key}`;
  const { data: prof, error: pe } = await admin.from('student_profiles').upsert({
    user_id: userId, academic_number, full_name_ar: `${m.name} - ${TAG}`, email: m.email,
    department_id: DEPT, program_id: PROG, status: 'active', must_change_password: false,
  }, { onConflict: 'academic_number' }).select('id').single();
  if (pe) throw pe;
  await admin.from('student_academic_status').delete().eq('student_profile_id', prof.id);
  const { error: se } = await admin.from('student_academic_status').insert({ student_profile_id: prof.id, academic_year_id: YEAR, semester_id: SEM, level_id: L4, enrollment_status: 'active' });
  if (se) throw se;
  await admin.from('user_roles').upsert({ user_id: userId, role: 'student' }, { onConflict: 'user_id,role' });
  out[m.key] = { userId, profileId: prof.id, email: m.email, academic_number };
}
// coordinator
const COORD_USER = 'e8fb43dd-3ff3-490f-b896-f38da99d0a1d';
const { data: cu } = await admin.auth.admin.getUserById(COORD_USER);
await admin.auth.admin.updateUserById(COORD_USER, { password: PASS, email_confirm: true });
out.coordinator = { userId: COORD_USER, email: cu.user.email };
console.log(JSON.stringify(out, null, 2));
