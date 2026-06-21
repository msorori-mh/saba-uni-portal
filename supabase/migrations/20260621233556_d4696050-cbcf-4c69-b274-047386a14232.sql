CREATE OR REPLACE FUNCTION public.generate_verification_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_code text;
BEGIN
  LOOP
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text || gen_random_uuid()::text), 1, 10));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.official_documents WHERE verification_code = v_code);
  END LOOP;
  RETURN v_code;
END;
$function$;