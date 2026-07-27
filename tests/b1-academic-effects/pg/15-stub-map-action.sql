CREATE OR REPLACE FUNCTION public.b1_map_ui_staff_action(p_action text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_action
$$;
