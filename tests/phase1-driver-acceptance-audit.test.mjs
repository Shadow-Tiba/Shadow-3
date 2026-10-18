import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/20261018110000_phase1_driver_acceptance_audit_scope.sql", import.meta.url),
  "utf8"
);

test("driver acceptance records its audit event without calling the Main Office-only helper", () => {
  const accept = migration.slice(
    migration.indexOf("CREATE OR REPLACE FUNCTION public.accept_direct_assignment"),
    migration.indexOf("REVOKE ALL ON FUNCTION public.accept_direct_assignment")
  );
  assert.match(accept, /where auth_user_id=auth\.uid\(\) and is_active=true and cancelled_at is null/i);
  assert.match(accept, /v_booking\.driver_id<>v_driver_id/i);
  assert.match(accept, /for update/i);
  assert.match(accept, /INSERT INTO public\.audit_log/i);
  assert.match(accept, /auth\.uid\(\),NULL,'ACCEPT_DIRECT_ASSIGNMENT','BOOKING'/i);
  assert.doesNotMatch(accept, /public\.write_audit_event/i);
  assert.match(accept, /INSERT INTO public\.notifications/i);
  assert.match(accept, /direct_acceptance_status='ACCEPTED'/i);
});

test("driver acceptance RPC stays authenticated-only", () => {
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.accept_direct_assignment\(uuid\) FROM PUBLIC, anon/i);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.accept_direct_assignment\(uuid\) TO authenticated/i);
});
