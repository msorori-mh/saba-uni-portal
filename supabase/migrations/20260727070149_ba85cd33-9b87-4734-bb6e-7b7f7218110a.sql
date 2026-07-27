ALTER TABLE public.b1_draft_mutation_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b1_draft_mutation_idempotency FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.b1_draft_mutation_idempotency FROM PUBLIC, anon, authenticated;