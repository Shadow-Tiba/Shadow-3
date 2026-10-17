-- Repair branch employee management against the current Shadow identity schema.
-- Role membership is stored directly on app_users.role; user_roles/roles are legacy.

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS phone text;

CREATE UNIQUE INDEX IF NOT EXISTS app_users_username_lower_uidx
  ON public.app_users (lower(username))
  WHERE username IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_branch_employee_directory()
RETURNS TABLE (
  user_id uuid,
  username text,
  display_name text,
  phone text,
  is_active boolean,
  created_at timestamptz,
  office_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_actor uuid;
BEGIN
  v_actor := public.current_main_office_user();

  RETURN QUERY
  SELECT au.user_id, au.username, au.display_name, au.phone,
         au.is_active, au.created_at, o.name AS office_name
  FROM public.app_users au
  JOIN public.offices o ON o.office_id = au.office_id
  WHERE au.role = 'BRANCH'
    AND o.office_code = 'RAS_SEDR'
    AND o.office_type = 'BRANCH'
  ORDER BY au.is_active DESC, au.created_at DESC, au.display_name;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_branch_employee_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_branch_employee_directory() TO authenticated;

CREATE OR REPLACE FUNCTION public.update_branch_employee_details(
  p_user_id uuid,
  p_display_name text,
  p_phone text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_name text := NULLIF(btrim(p_display_name), '');
  v_phone text := NULLIF(btrim(p_phone), '');
BEGIN
  PERFORM public.current_main_office_user();
  IF v_name IS NULL OR length(v_name) < 3 THEN
    RAISE EXCEPTION 'DISPLAY_NAME_REQUIRED';
  END IF;
  IF v_phone IS NOT NULL AND v_phone !~ '^[0-9+() -]{7,20}$' THEN
    RAISE EXCEPTION 'PHONE_INVALID';
  END IF;

  UPDATE public.app_users au
  SET display_name = v_name, phone = v_phone
  FROM public.offices o
  WHERE au.user_id = p_user_id
    AND au.role = 'BRANCH'
    AND o.office_id = au.office_id
    AND o.office_code = 'RAS_SEDR'
    AND o.office_type = 'BRANCH';
  IF NOT FOUND THEN RAISE EXCEPTION 'BRANCH_EMPLOYEE_NOT_FOUND'; END IF;
  RETURN jsonb_build_object('success', true, 'user_id', p_user_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.update_branch_employee_details(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_branch_employee_details(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_branch_employee_active(
  p_user_id uuid,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_actor uuid;
  v_target public.app_users%ROWTYPE;
BEGIN
  v_actor := public.current_main_office_user();

  SELECT au.* INTO v_target
  FROM public.app_users au
  JOIN public.offices o ON o.office_id = au.office_id
  WHERE au.user_id = p_user_id
    AND au.role = 'BRANCH'
    AND o.office_code = 'RAS_SEDR'
    AND o.office_type = 'BRANCH'
  FOR UPDATE OF au;
  IF NOT FOUND THEN RAISE EXCEPTION 'BRANCH_EMPLOYEE_NOT_FOUND'; END IF;

  UPDATE public.app_users SET is_active = p_is_active WHERE user_id = p_user_id;
  INSERT INTO public.audit_log(actor_user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor,
    CASE WHEN p_is_active THEN 'BRANCH_EMPLOYEE_ACTIVATED' ELSE 'BRANCH_EMPLOYEE_DEACTIVATED' END,
    'app_user', p_user_id::text,
    jsonb_build_object('is_active', v_target.is_active, 'username', v_target.username, 'office_id', v_target.office_id),
    jsonb_build_object('is_active', p_is_active, 'username', v_target.username, 'office_id', v_target.office_id)
  );
  RETURN jsonb_build_object('success', true, 'user_id', p_user_id, 'is_active', p_is_active);
END;
$function$;

REVOKE ALL ON FUNCTION public.set_branch_employee_active(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_branch_employee_active(uuid, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
