import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
const c = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const { error: se } = await c.auth.signInWithPassword({ email: 'gp-e2e01-coordinator@test-only.usr.edu.ye', password: 'TestOnly#Journey2026' });
if (se) throw se;
const { data, error } = await c.rpc('create_graduation_project_team', {
  p_department_id: '11111111-1111-4111-8111-111111111111',
  p_leader_student_profile_id: 'cfcec612-06fb-4a75-aa8c-d95a3a59b50a',
  p_leader_user_id: '70481e8b-255a-44ad-9f01-4289170a9941',
  p_program_id: '8df96335-4197-4e33-85ca-a970608f6a63',
  p_academic_year_id: '1b9e6972-0870-41d6-b849-bdcbc7b6c0d6',
  p_semester_id: 'dc917e4d-607d-43ce-9d78-020de14eccf0',
  p_correlation_id: randomUUID(),
});
console.log(JSON.stringify({ data, error }, null, 2));
