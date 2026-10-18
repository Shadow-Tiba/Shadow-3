import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/20261018120000_phase1_main_office_snapshot_scope.sql", import.meta.url),
  "utf8"
);

test("global Phase 1 snapshot requires an active Main Office identity", () => {
  const start = migration.indexOf("CREATE OR REPLACE FUNCTION public.get_phase1_snapshot");
  const end = migration.indexOf("CREATE OR REPLACE FUNCTION public.get_vehicle_live_locations");
  const fn = migration.slice(start, end);
  assert.match(fn, /PERFORM public\.current_main_office_user\(\)/i);
  assert.doesNotMatch(fn, /au\.role IN \('ADMIN','HEAD_OFFICE'\)/i);
  assert.match(fn, /'actual_loading_records'/i);
});

test("live vehicle locations require an active Main Office identity", () => {
  const start = migration.indexOf("CREATE OR REPLACE FUNCTION public.get_vehicle_live_locations");
  const end = migration.indexOf("REVOKE ALL ON FUNCTION public.get_phase1_snapshot");
  const fn = migration.slice(start, end);
  assert.match(fn, /PERFORM public\.current_main_office_user\(\)/i);
  assert.match(fn, /public\.driver_vehicle_assignments/i);
  assert.match(fn, /public\.driver_live_locations/i);
});

test("global snapshot RPCs remain authenticated-only", () => {
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_phase1_snapshot\(\) FROM PUBLIC, anon/i);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.get_phase1_snapshot\(\) TO authenticated/i);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_vehicle_live_locations\(\) FROM PUBLIC, anon/i);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.get_vehicle_live_locations\(\) TO authenticated/i);
});
