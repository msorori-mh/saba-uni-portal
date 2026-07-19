create or replace function public.log_audit(text,uuid,text,jsonb,jsonb,text,uuid)
returns void language plpgsql as $$begin raise exception 'forced audit failure'; end$$;
