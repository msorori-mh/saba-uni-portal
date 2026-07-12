import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
for (const id of ['84bb64f3-ed20-4110-b9d7-f4316559d22f','fb4925bb-ac41-476c-bbe7-7ba0aab81e0d']) {
  const { data, error } = await s.auth.admin.getUserById(id);
  console.log(id, error ? 'ERR:'+error.message : JSON.stringify({email:data.user.email, created_at:data.user.created_at, last_sign_in_at:data.user.last_sign_in_at, identities:data.user.identities?.map(i=>i.provider), app_metadata:data.user.app_metadata, user_metadata:data.user.user_metadata}));
}
