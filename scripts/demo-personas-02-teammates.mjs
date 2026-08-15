// DEMO_ONLY_UNIVERSITY_PRESENTATION_01 — create 2 GP teammates (auth + profile only).
import { createClient } from '@supabase/supabase-js';
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const DEPT = 'ce485c67-5f7c-498d-b120-4b1130a86ae8';
const PROG = '97638001-87cd-4df0-abe9-63c829504072';
const YEAR = '1b9e6972-0870-41d6-b849-bdcbc7b6c0d6';
const SEM = 'dc917e4d-607d-43ce-9d78-020de14eccf0';
const L4 = 'aab5f2cb-17a8-4eab-bb85-3baba0a00331';
const PASS = 'Demo#Portal2026';
const team = [
  { email: 'demo.student.gp2@testonly.invalid', name: 'سارة عبدالملك الشرجبي', num: 'DEMO-2023-0102' },
  { email: 'demo.student.gp3@testonly.invalid', name: 'يوسف محمد القدسي', num: 'DEMO-2023-0103' },
];
const out = [];
for (const m of team) {
  let userId;
  const { data: created, error } = await admin.auth.admin.createUser({
    email: m.email, password: PASS, email_confirm: true, user_metadata: { full_name: m.name },
  });
  if (error) {
    if (!/already|registered|exists/i.test(error.message)) throw error;
    const { data: prof } = await admin.from('student_profiles').select('user_id').eq('email', m.email).maybeSingle();
    userId = prof?.user_id;
    if (!userId) throw new Error('cannot resolve existing user ' + m.email);
    await admin.auth.admin.updateUserById(userId, { password: PASS, email_confirm: true });
  } else userId = created.user.id;

  const { data: sp, error: pe } = await admin.from('student_profiles').upsert({
    user_id: userId, academic_number: m.num, full_name_ar: m.name, email: m.email,
    department_id: DEPT, program_id: PROG, status: 'active', must_change_password: false,
    study_system: 'regular',
  }, { onConflict: 'academic_number' }).select('id').single();
  if (pe) throw pe;

  const { data: st } = await admin.from('student_academic_status')
    .select('id').eq('student_profile_id', sp.id).eq('enrollment_status', 'active').maybeSingle();
  if (!st) {
    const { error: se } = await admin.from('student_academic_status').insert({
      student_profile_id: sp.id, academic_year_id: YEAR, semester_id: SEM, level_id: L4,
      enrollment_status: 'active',
    });
    if (se) throw se;
  }
  await admin.from('user_roles').upsert({ user_id: userId, role: 'student' }, { onConflict: 'user_id,role' });
  out.push({ email: m.email, userId, profileId: sp.id });
}
console.log(JSON.stringify(out, null, 2));
