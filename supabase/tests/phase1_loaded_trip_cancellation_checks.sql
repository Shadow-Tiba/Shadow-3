-- Phase 1 loaded-trip cancellation regression checks.
-- Run only on an isolated database after applying the intended migration set.
-- These are definition-level checks; runtime behavior still needs transactional tests.

DO $checks$
DECLARE
  v_trigger_count integer;
  v_trigger_def text;
  v_cancel_def text;
  v_redirect_def text;
  v_authorizer_def text;
BEGIN
  SELECT count(*) INTO v_trigger_count
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'bookings'
    AND t.tgname = 'bookings_prevent_cancelling_loaded_trip'
    AND NOT t.tgisinternal;

  IF v_trigger_count <> 1 THEN
    RAISE EXCEPTION 'LOADED_TRIP_CANCELLATION_TRIGGER_MISSING_OR_DUPLICATED';
  END IF;

  SELECT pg_get_functiondef(to_regprocedure(
    'public.prevent_cancelling_loaded_booking()'
  )) INTO v_trigger_def;

  IF v_trigger_def IS NULL
     OR position('LOADED_TRIP_CANNOT_BE_CANCELLED' IN upper(v_trigger_def)) = 0
     OR position('ACTUAL_DELIVERY_ALREADY_RECORDED' IN upper(v_trigger_def)) = 0
     OR position('OLD.STATUS = ''LOADED''' IN upper(v_trigger_def)) = 0 THEN
    RAISE EXCEPTION 'LOADED_TRIP_CANCELLATION_GUARDS_INCOMPLETE';
  END IF;

  SELECT pg_get_functiondef(to_regprocedure(
    'public.main_office_cancel_booking(uuid,text)'
  )) INTO v_cancel_def;
  SELECT pg_get_functiondef(to_regprocedure(
    'public.main_office_redirect_booking(uuid,uuid,text)'
  )) INTO v_redirect_def;
  SELECT pg_get_functiondef(to_regprocedure(
    'public.current_main_office_user()'
  )) INTO v_authorizer_def;

  IF v_cancel_def IS NULL OR v_redirect_def IS NULL OR v_authorizer_def IS NULL THEN
    RAISE EXCEPTION 'OFFICE_MUTATION_RPC_OR_AUTHORIZER_MISSING';
  END IF;

  IF position('CURRENT_MAIN_OFFICE_USER()' IN upper(v_cancel_def)) = 0
     OR position('CURRENT_MAIN_OFFICE_USER()' IN upper(v_redirect_def)) = 0
     OR position('MAIN_OFFICE_ACCESS_REQUIRED' IN upper(v_authorizer_def)) = 0
     OR position('AU.ROLE IN (''ADMIN'',''HEAD_OFFICE'')' IN upper(v_authorizer_def)) = 0
     OR position('O.OFFICE_CODE=''MAIN''' IN upper(v_authorizer_def)) = 0 THEN
    RAISE EXCEPTION 'BRANCH_MUST_NOT_CANCEL_OR_REDIRECT';
  END IF;
END
$checks$;

-- Required isolated staging runtime tests (not performed by this static file):
-- 1. BRANCH cancellation and redirect RPC calls fail without changing booking data.
-- 2. HEAD cancellation of a BOOKED, not-yet-loaded trip succeeds only with a reason.
-- 3. Any attempt to set a LOADED booking to CANCELLED raises
--    LOADED_TRIP_CANNOT_BE_CANCELLED, including a direct UPDATE under a test role.
-- 4. Any attempt to cancel after actual_weight or delivery_confirmed_at is populated
--    raises ACTUAL_DELIVERY_ALREADY_RECORDED.
-- 5. Failed updates leave booking, actual-load evidence, and audit rows unchanged.
