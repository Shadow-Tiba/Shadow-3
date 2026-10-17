import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [vehicleOwnerSql, reportsMigration, statementsMigration, vehicleReportsUi, accountStatementsUi] = await Promise.all([
  read("../supabase/migrations/20261014340000_phase1_vehicle_owner_and_vehicle_creation.sql"),
  read("../supabase/migrations/20261011001729_vehicle_owner_reports.sql"),
  read("../supabase/migrations/20261016010000_account_statement_trip_identifiers.sql"),
  read("../src/components/VehicleOwnerReportsScreen.tsx"),
  read("../src/components/AccountStatementsScreen.tsx"),
]);

test("vehicle identity is generated and permanently associated with its registered owner", () => {
  assert.match(vehicleOwnerSql, /v_code:='VH-'\|\|lpad\(nextval\('public\.vehicle_code_seq'/);
  assert.match(vehicleOwnerSql, /insert into public\.vehicles\(vehicle_code,plate_number,owner_id,office_id/);
  assert.match(vehicleOwnerSql, /'vehicle_code',v_code,'plate_number',v_plate,'owner_id',p_owner_id/);
});

test("owner and vehicle reports drill down to completed trips and actual tons", () => {
  assert.ok(reportsMigration.toLowerCase().replace(/\s+/g, ' ').includes('left join public.vehicles v on v.vehicle_id = alr.vehicle_id'));
  assert.ok(reportsMigration.toLowerCase().replace(/\s+/g, ' ').includes('left join public.vehicle_owners vo on vo.owner_id = v.owner_id'));
  assert.match(vehicleReportsUi, /setSelectedOwner/);
  assert.match(vehicleReportsUi, /tripCode/);
  assert.match(vehicleReportsUi, /factoryFilter/);
  assert.match(vehicleReportsUi, /quarryFilter/);
  assert.match(vehicleReportsUi, /مالك العربية/);
});

test("factory and quarry statements filter by vehicle, its registered owner, and trip code", () => {
  assert.match(statementsMigration, /'vehicle_id', alr\.vehicle_id/i);
  assert.ok(statementsMigration.toLowerCase().replace(/\s+/g, ' ').includes('left join public.vehicles v on v.vehicle_id = alr.vehicle_id'));
  assert.match(statementsMigration, /'trip_code', alr\.trip_code/i);
  assert.match(statementsMigration, /'daily_load_number', alr\.daily_load_number/i);
  assert.match(statementsMigration, /'loading_sequence_date', alr\.loading_sequence_date/i);
  assert.match(accountStatementsUi, /row\.trip_code/);
  assert.match(accountStatementsUi, /setOwnerId/);
  assert.match(accountStatementsUi, /vehicles\.find\(v => String\(v\.vehicle_id\) === String\(row\.vehicle_id\)\)\?\.owner_id/);
  assert.match(accountStatementsUi, /مالك العربية/);
  assert.match(accountStatementsUi, /كود النقلة/);
});
