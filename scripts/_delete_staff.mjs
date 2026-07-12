import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const authUsers = ['84bb64f3-ed20-4110-b9d7-f4316559d22f','fb4925bb-ac41-476c-bbe7-7ba0aab81e0d'];
for (const id of authUsers) {
  const { error } = await s.auth.admin.deleteUser(id);
  console.log('deleteUser', id, error ? 'ERR:'+error.message : 'OK');
  const { data } = await s.auth.admin.getUserById(id);
  console.log('  after:', data?.user ? 'STILL EXISTS' : 'gone');
}

const profiles = [
  ['0bbc6c43-abab-4d48-9fbc-4f0de8c9d28a','S0001'],
  ['d3cd48fd-3ee6-48ba-8a19-739da6fde798','STF7A99'],
  ['b2f3abaf-1095-4a95-82e6-f6ff9549ddca','DEMO-STF'],
  ['b4afffa3-92d2-4459-bbd0-0dbbdd744de1','s20251'],
  ['a9f211a2-2975-47ad-97d6-e1849e7336f5','S218'],
];
for (const [id, emp] of profiles) {
  const { data, error, count } = await s.from('staff_profiles').delete({count:'exact'}).eq('id', id).eq('employee_number', emp).select('id');
  console.log('delete staff', id, emp, error ? 'ERR:'+error.message : `rows=${count}`);
}

const { data: remaining } = await s.from('staff_profiles').select('id,full_name_ar,employee_number,user_id');
console.log('remaining count:', remaining?.length, JSON.stringify(remaining, null, 2));
