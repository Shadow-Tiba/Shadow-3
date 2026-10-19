-- Phase 1 permission hardening: a loaded trip cannot be cancelled.
-- HEAD owns operational mutations; BRANCH remains read-only for cancellation/redirect.
-- Forward-only migration. Validate on isolated staging; do not apply to production here.

CREATE OR REPLACE FUNCTION public.prevent_cancelling_loaded_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NEW.status = 'CANCELLED' AND OLD.status IS DISTINCT FROM NEW.status THEN
    -- Protect the loaded state even if a caller bypasses the current office RPC.
    IF OLD.status = 'LOADED' THEN
      RAISE EXCEPTION 'LOADED_TRIP_CANNOT_BE_CANCELLED';
    END IF;

    -- Independent evidence guard: no cancellation after actual weight or delivery
    -- confirmation has been recorded, regardless of which write path is used.
    IF EXISTS (
      SELECT 1
      FROM public.actual_loading_records a
      WHERE a.booking_id = OLD.booking_id
        AND (a.actual_weight IS NOT NULL OR a.delivery_confirmed_at IS NOT NULL)
    ) THEN
      RAISE EXCEPTION 'ACTUAL_DELIVERY_ALREADY_RECORDED';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS bookings_prevent_cancelling_loaded_trip ON public.bookings;
CREATE TRIGGER bookings_prevent_cancelling_loaded_trip
BEFORE UPDATE OF status ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.prevent_cancelling_loaded_booking();

-- Fail closed if the existing office mutation endpoints lose their role boundary.
DO $checks$
DECLARE
  v_cancel text;
  v_redirect text;
  v_authorizer text;
BEGIN
  SELECT pg_get_functiondef(to_regprocedure(
    'public.main_office_cancel_booking(uuid,text)'
  )) INTO v_cancel;
  SELECT pg_get_functiondef(to_regprocedure(
    'public.main_office_redirect_booking(uuid,uuid,text)'
  )) INTO v_redirect;
  SELECT pg_get_functiondef(to_regprocedure(
    'public.current_main_office_user()'
  )) INTO v_authorizer;

  IF v_cancel IS NULL THEN
    RAISE EXCEPTION 'EXPECTED_OFFICE_CANCEL_RPC_MISSING';
  END IF;
  IF v_redirect IS NULL THEN
    RAISE EXCEPTION 'EXPECTED_OFFICE_REDIRECT_RPC_MISSING';
  END IF;

  IF v_authorizer IS NULL
     OR position('CURRENT_MAIN_OFFICE_USER()' IN upper(v_cancel)) = 0
     OR position('CURRENT_MAIN_OFFICE_USER()' IN upper(v_redirect)) = 0 THEN
    RAISE EXCEPTION 'OFFICE_MUTATION_ROLE_GATE_MISSING';
  END IF;

  IF position('MAIN_OFFICE_ACCESS_REQUIRED' IN upper(v_authorizer)) = 0
     OR position('AU.ROLE IN (''ADMIN'',''HEAD_OFFICE'')' IN upper(v_authorizer)) = 0
     OR position('O.OFFICE_CODE=''MAIN''' IN upper(v_authorizer)) = 0 THEN
    RAISE EXCEPTION 'OFFICE_MUTATIONS_MUST_REMAIN_HEAD_OWNED';
  END IF;
END
$checks$;

REVOKE ALL ON FUNCTION public.prevent_cancelling_loaded_booking() FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';
