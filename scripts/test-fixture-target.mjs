// A denylist alone cannot prove that a new project is disposable.
export function assertTestFixtureTarget(env = process.env) {
  if (env.ALLOW_TEST_FIXTURES !== '1') throw new Error('Explicit fixture authorization is required');
  let url;
  try { url = new URL(env.SUPABASE_URL); } catch { throw new Error('A test-only Supabase URL is required'); }
  const productionRefs = ['wpmicqriltrowwonknox', 'pwapivqjofdsevycegph', 'cldpnartkfnmllrkjaoi'];
  const ref = env.TEST_ONLY_PROJECT_REF;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const explicitTestProject = /^[a-z]{20}$/.test(ref ?? '')
    && !productionRefs.includes(ref) && url.protocol === 'https:'
    && url.hostname === `${ref}.supabase.co`;
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || (!local && !explicitTestProject)) {
    throw new Error('Target must be localhost or the explicitly selected TEST_ONLY_PROJECT_REF; production is blocked');
  }
  return url.href;
}
