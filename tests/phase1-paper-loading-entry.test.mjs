import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [migration, importMigration, screen, board, directoryScreen] = await Promise.all([
  read("../supabase/migrations/20261017111000_phase1_paper_actual_load_entry.sql"),
  read("../supabase/migrations/20261017110000_phase1_paper_load_import_rpc.sql"),
  read("../src/components/PaperLoadingEntryScreen.tsx"),
  read("../src/components/LiveOperationsBoard.tsx"),
  read("../src/components/OfficeDirectoryScreen.tsx"),
]);

test("paper loading entry is Main Office-authorized and writes a paper provenance record", () => {
  assert.match(migration, /v_actor := public\.current_main_office_user\(\)/i);
  assert.match(migration, /record_source,\s*source_record_id,\s*source_file_name,\s*source_row_number,\s*imported_at/i);
  assert.match(migration, /'PAPER_IMPORT'/);
  assert.match(migration, /public\.write_audit_event\('PAPER_ACTUAL_LOAD_RECORDED'/i);
  assert.match(migration, /revoke all on function public\.main_office_record_paper_actual_load/i);
  assert.match(migration, /grant execute on function public\.main_office_record_paper_actual_load.*to authenticated/i);
});

test("manual paper-load entry is removed while CSV import remains available", () => {
  assert.doesNotMatch(screen, /main_office_record_paper_actual_load/);
  assert.doesNotMatch(screen, /تسجيل التحميل الورقي/);
  assert.match(board, /PaperLoadingEntryScreen/);
  assert.match(board, /activeScreen === 'actual'/);
  assert.match(screen, /main_office_import_paper_loads/);
  assert.match(screen, /duplicateSourceIds/);
  assert.ok(screen.includes("text.replace(/^\\uFEFF/, '')"), "CSV parser must strip a UTF-8 BOM");
  assert.ok(screen.includes("ch === '\\n'") && screen.includes("ch === '\\r'"), "CSV parser must recognize LF and CR row endings");
  assert.ok(screen.includes("input[i + 1] === '\\n'"), "CSV parser must consume the LF in CRLF row endings");
  assert.match(screen, /معاينة بيانات التحميل الفعلي قبل الإرسال/);
  assert.match(screen, /importRows\.slice\(0, 5\)/);
  assert.match(screen, /scope="col"/);
  assert.match(screen, /duplicateHeaders/);
  assert.match(screen, /malformedRow/);
  assert.match(screen, /عدد الخلايا غير مطابق لعدد الأعمدة/);
});

test("CSV import validates source rows and has an idempotent Main Office RPC", () => {
  assert.match(importMigration, /v_actor := public\.current_main_office_user\(\)/i);
  assert.match(importMigration, /jsonb_array_length\(p_rows\) > 2000/);
  assert.match(importMigration, /DUPLICATE_SOURCE_ROW_NUMBER_IN_FILE/);
  assert.match(importMigration, /DUPLICATE_SOURCE_RECORD_ID_IN_FILE/);
  assert.match(importMigration, /v_date > current_date \+ 1/);
  assert.match(importMigration, /upper\(trim\(vehicle_code\)\)=upper\(trim\(v_row->>'vehicle_code'\)\) and is_active=true/);
  assert.match(importMigration, /upper\(trim\(driver_code\)\)=upper\(trim\(v_row->>'driver_code'\)\) and is_active=true/);
  assert.match(importMigration, /v_actor,v_notes/);
  assert.match(importMigration, /VEHICLE_CODE_NOT_FOUND/);
  assert.match(importMigration, /DRIVER_CODE_NOT_FOUND/);
  assert.match(importMigration, /FACTORY_CODE_NOT_FOUND/);
  assert.match(importMigration, /QUARRY_CODE_NOT_FOUND/);
  assert.match(importMigration, /actual_loading_records_import_source_id_unique/);
  assert.match(importMigration, /SOURCE_IDENTITY_CONFLICT/);
  assert.match(importMigration, /v_existing\.actual_weight is distinct from round\(v_weight,3\)/);
  assert.match(importMigration, /record_source,source_record_id,source_file_name,source_row_number,imported_at/);
  assert.match(importMigration, /grant execute on function public\.main_office_import_paper_loads\(text,jsonb\) to authenticated/i);
  assert.match(screen, /main_office_import_paper_loads/);
  assert.match(screen, /source_row_number: index \+ 2/);
  assert.match(directoryScreen, /get_vehicle_owner_reports/);
  assert.match(directoryScreen, /actual_loading_records: Array\.isArray\(reportsResult\.data\?\.trips\)/);
});
