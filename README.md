# Tiba-Supplies — Latest Phase 1 Handover

**Updated:** 2026-10-17  
**Working branch:** `shadow/phase1-hardening`  
**Latest implementation commit (excluding this handover edit):** `a394531ee796e2f86b4b3144cf51394282444170`  
**Target Shadow project:** `bvyxiahpxogblkmtjxyx` (`Tiba Shadow`, `eu-west-1`)

## Latest work completed

- Applied the clean Phase 1 migration chain to the intended Shadow project, including the paper-load entry/import RPCs and the managed `pg_cron` dispatch-window scheduler. The existing migration-ledger remediation row was preserved; no database reset was performed.
- Verified 20 public tables exist and all 20 have RLS enabled; required dashboard, delivery, and paper-import RPCs exist; direct client table grants remain revoked; `ensure_rls` remains installed.
- Confirmed the scheduler job `tiba-finalize-expired-dispatch-windows` is scheduled every minute.
- Current Shadow directory state was rechecked on 2026-10-19: 2 offices, 23 factories, 12 quarries, 108 vehicle owners, 139 vehicles, 1 driver, and 2 `app_users` rows. `load_orders`, `bookings`, `actual_loading_records`, `loading_data_records`, and `delivery_confirmations` currently have zero rows. Do not blindly re-import: reconcile the existing directory rows against source records and verify provenance/completeness first.
- Paper-load manual entry and CSV import UI/RPC are present on the review branch. The import RPC validates the file before inserts, preserves row/file provenance, and reports duplicates/conflicts.
- Updated the Windows Main Office build workflow to target the same Shadow project as the Android review builds.
- Phase 1 Shadow CI and Phase 1 build passed on commit `41da9940`; the newer Windows-targeting commit `a394531e` is under final build verification.
- Changes remain on `shadow/phase1-hardening`; no merge to `main` and no Production writes were performed.

### CI links

- [Phase 1 Shadow CI — success](https://github.com/Midoelfawakhry/Tiba-Supplies/actions/runs/38976381080)
- [Phase 1 build — success](https://github.com/Midoelfawakhry/Tiba-Supplies/actions/runs/38976380844)
- [Migration integrity — success](https://github.com/Midoelfawakhry/Tiba-Supplies/actions/runs/38976368567)
- [Signed Android builds — success](https://github.com/Midoelfawakhry/Tiba-Supplies/actions/runs/38976368540)
- [Windows Main Office build — success](https://github.com/Midoelfawakhry/Tiba-Supplies/actions/runs/38976368645)

## Implementation completed on the review branch

### Loading data and actual delivery

Migration: `supabase/migrations/20261017100000_phase1_separate_loading_data_from_actual_delivery.sql`

- Added `loading_data_records` for booking/assignment/loading-sheet information, kept separate from actual factory-delivery weight.
- Supports paper-origin actual-load rows without a booking when the date, vehicle, driver, quarry, and factory are identified.
- Adds provenance fields: `record_source`, `source_record_id`, `source_file_name`, `source_row_number`, and `imported_at`.
- Distinguishes driver-confirmed delivery, paper import, office correction, and legacy records. Existing records remain labeled as legacy evidence.
- Adds concurrency-safe daily numbering and duplicate-identity checks.

### Scale-ticket authorization

- Added scoped helper functions for upload, read, and delete authorization.
- Restricted helper execution to authenticated users and revoked public/anonymous execution.
- Updated Storage policies to use the scoped predicates.
- Limits deletion to the owning active driver for an in-transit booking before delivery confirmation.

### Test and SQL fixes

- Corrected SQL dollar quoting in the daily trip identity trigger.
- Corrected tests that check Main Office scope per reporting RPC.
- Added contract checks for scale-ticket grants and Storage policy references.

## Build artifacts

The latest signed Android artifacts below were built from commit `41da994054fd531c3bdad68885dbada21a368775`. The Android build workflow pins the app to the intended Shadow project `bvyxiahpxogblkmtjxyx`.

- [Ras Sedr Branch signed APK artifact](https://api.github.com/repos/Midoelfawakhry/Tiba-Supplies/actions/artifacts/12081411038)
- [Main Office signed APK artifact](https://api.github.com/repos/Midoelfawakhry/Tiba-Supplies/actions/artifacts/12081212472)
- [Driver signed APK artifact](https://api.github.com/repos/Midoelfawakhry/Tiba-Supplies/actions/artifacts/12080993649)
- [Latest Windows Main Office build — in progress](https://github.com/Midoelfawakhry/Tiba-Supplies/actions/runs/38981528252)

Do not use older Windows artifacts built before `.github/workflows/windows-office-build.yml` was updated to the intended Shadow URL. The newer Windows artifact must finish and then be smoke-tested. Successful build jobs do not replace installation/device smoke tests or authenticated database acceptance tests. GitHub artifact retention is time-limited.

## Remaining work — prioritized

### P0 — real directory data and access provisioning

1. Reconcile the existing factory, quarry, owner, vehicle, and driver directories against the source records; verify codes, names, office mappings, and row-level provenance. Do not invent missing codes/names or blindly re-import existing rows.
2. Verify the two existing `app_users` rows and the driver/Auth mapping correspond to the intended operational accounts and correct role/office scope; provision only genuinely missing accounts through the approved account-setup flow.
3. Run authenticated acceptance tests for Main Office, Ras Sedr Branch, and Driver roles, including paper entry/import, duplicate re-import, delivery confirmation, reports, and scale-ticket access.
4. Define and test correction/re-import behavior, row-level failures, duplicate files, and concurrent daily numbering.

### P1 — release validation

1. Finish the Windows package build and signed Driver APK build against this Shadow project.
2. Install and smoke-test Driver, Main Office, and Ras Sedr Branch APKs on Android.
3. Verify login/logout, location permissions, background tracking, stale/inaccurate location behavior, driver/vehicle assignment, and paper import.
4. Rebuild final artifacts from the final candidate commit and check each build's embedded Supabase URL.
5. Recheck the v191 AI assistant and native driver tracking remain intact.

### P2 — controlled data rollout

- Preserve source files and row-level provenance when importing real paper records.
- Use isolated synthetic fixtures for volume tests; never seed shared databases with fake business records.
- Prepare rollback/recovery and a separate Production review before any live rollout.

### P1 — release validation

- Install and smoke-test Driver, Main Office, and Ras Sedr Branch APKs on Android.
- Verify login/logout, location permissions, background tracking, stale/inaccurate location behavior, and driver/vehicle assignment.
- Smoke-test the Windows package.
- Verify builds target Shadow, not Production.
- Rebuild final artifacts from the final candidate commit.
- Recheck the v191 AI assistant and native driver tracking remain intact.

### P2 — controlled data rollout

- Validate vehicle, driver, owner, factory, quarry, and office mappings before importing real paper records.
- Preserve source files and row-level provenance.
- Use isolated synthetic fixtures for volume tests; never seed shared databases with fake business records.
- Prepare rollback/recovery and a separate Production review before any live rollout.

## Safety boundaries

- Production Supabase remains read-only for this work; do not apply migrations or write SQL there.
- Work only on `shadow/phase1-hardening` unless explicitly authorized otherwise.
- Do not merge to `main` without explicit approval.
- Do not reset Shadow, remove its existing migration-ledger row, or drop the `ensure_rls` event trigger.
- Do not use the unrelated Supabase project as the Shadow target.
- Never put service-role credentials in client configuration.
- Preserve v191 AI assistant and native driver tracking; do not deploy an AI Edge Function or modify tracking as part of this schema task.
- Do not use PR 63 as a shortcut.

## Current Shadow verification — 2026-10-19

- Target checked: Supabase project `bvyxiahpxogblkmtjxyx` (`Tiba Shadow`, `eu-west-1`); no Production database was queried for writes or modified.
- Schema: 21 public tables; all 21 have RLS enabled. Direct table SELECT/INSERT/UPDATE/DELETE grants to `authenticated` and direct SELECT/INSERT grants to `anon` were absent in the current privilege check. Tables currently have no RLS policies, so RPC grants, function authorization and Storage policies remain the actual access boundary and must continue to be audited.
- Functions: 60 public `SECURITY DEFINER` functions were found; all have a fixed `search_path`; none is executable by `anon` or `PUBLIC`; 48 are executable by `authenticated`. This is not a blanket defect: each exposed function must be checked for the intended role/office guard. Supabase Security Advisor still reports these authenticated SECURITY DEFINER functions for review.
- Directory integrity checks returned zero duplicate factory codes, quarry codes, or non-null vehicle plate numbers; zero vehicles with a missing owner reference; and zero broken `app_users`/driver references to `auth.users`. These checks do not establish that every source-sheet row has been imported.
- Loaded-trip cancellation regression SQL ran successfully against Shadow and verified the trigger exists exactly once, guards loaded trips and delivery evidence, and the cancellation/redirect RPCs remain gated by the Main Office authorizer. These are definition-level checks only; authenticated runtime tests with separate HEAD_OFFICE, BRANCH, and DRIVER sessions remain pending.
- Security Advisor also reports leaked-password protection disabled. The available project connection does not expose an Auth-settings update action; enable it in Supabase Auth settings and verify sign-in compatibility before production rollout.
- Performance Advisor reports unindexed foreign keys. Review and add indexes selectively after examining query patterns and migration parity; do not apply a blanket index migration without checking current schema and workload.

## Acceptance checklist

- [x] Phase 1 Shadow CI passed on `ab3f7b3d`.
- [x] Phase 1 build passed on `ab3f7b3d`.
- [x] Migration integrity, signed Android, and Windows workflows succeeded on `ecd39f6d`.
- [x] Scoped scale-ticket authorization helpers and contract checks added.
- [x] No Production database writes or migration were performed.
- [x] No merge to `main` was performed.
- [x] Paper-load entry/import UI and secure RPC implemented on the review branch.
- [x] Paper-load RPCs and current migration chain applied to intended Shadow.
- [x] Core schema, required RPCs, RLS, Storage policies, and dispatch scheduler verified.
- [x] Phase 1 CI, disposable PostgreSQL baseline, and v191 clean-chain tests passed on commit `a394531e`.
- [ ] Provision real application users and import validated real directory data.
- [ ] Authenticated database acceptance tests pass against intended Shadow.
- [ ] Android and Windows device/package smoke tests pass (vehicle tracking is user-confirmed working; remaining release checks are listed in the tracking handover).
- [ ] Final release artifacts rebuilt from the final candidate commit and checked.
- [ ] Separate Production review and explicit authorization completed.

**Next action:** provision real users and load validated factory/quarry/owner/vehicle/driver directories, then run authenticated acceptance tests and device smoke tests. Do not import synthetic business data or merge to `main`.


## AI assistant recovery — 2026-10-17

- Confirmed the app-connected Edge Function had been deployed only to the older Shadow project `awgppfjxegognuqozldl`; the current Tiba Shadow project `bvyxiahpxogblkmtjxyx` did not list `tiba-ai-assistant`.
- Deployed `tiba-ai-assistant` directly to current Tiba Shadow as active version 1 with JWT verification enabled.
- Corrected `supabase/functions/tiba-ai-assistant/index.ts` to authorize against the current schema's `app_users.role` field instead of the obsolete `user_roles` join.
- Corrected `.github/workflows/deploy-tiba-ai-assistant-shadow.yml` to target current Tiba Shadow.
- Gemini model IDs reviewed against current Google AI developer documentation on 2026-10-17: `gemini-3.8-flash` is current and documented; `gemini-3.5-flash-lite` is also a current stable Flash-Lite model. The model strings were not the apparent cause of the reported Edge Function connection error.
- GitHub Actions auto-deploy job is currently failing because the configured Supabase access token lacks the `edge_functions_read` permission. Direct deployment via the authorized Supabase connection succeeded. Fix token permissions before relying on automated deployment.
- Still required: test from an authenticated app session; verify `GEMINI_API_KEY` is set in Shadow function secrets without exposing it; inspect function logs and run one real question. The deployed function's presence alone does not prove Gemini generation is configured or the UI request succeeds.
- Production remains untouched; no merge to `main`.

## Live tracking and Egypt time — handover 2026-10-17

### Updated on `shadow/phase1-hardening`
- `supabase/migrations/20261017120000_repair_live_vehicle_tracking_current_schema.sql`: aligns tracking RPCs with Shadow's current schema. `driver_live_locations` has no `vehicle_id`; the active vehicle is resolved through `driver_vehicle_assignments`.
- `src/components/VehicleTrackingScreen.tsx`: renders map timestamps explicitly in `Africa/Cairo`.
- `src/components/OfficeDirectoryScreen.tsx`: renders arrival, load-order and actual-load timestamps in `Africa/Cairo`.
- Timestamp policy: keep instants in UTC/`timestamptz`; display with `Africa/Cairo`. Do not add/subtract hours manually. Compare device `captured_at` with server `received_at` to diagnose clock skew or upload delay.

### Verified
- Shadow contains `get_vehicle_live_locations()` and `update_driver_live_location(...)`; authenticated execution grants were checked.
- The migration was adjusted after finding that `driver_live_locations` has no `vehicle_id` column.
- The changes are on `shadow/phase1-hardening`; `main` and Production were not changed.

### Not yet verified / remaining
- **User-confirmed status (2026-10-17):** the user reported that vehicle tracking is now working in the app.
- The user's confirmation establishes that the tracking issue is resolved in their current test; a separate physical-device audit of timestamps and background operation is not documented here.
- Remaining validation: confirm `captured_at` and `received_at` advance plausibly, stale status after 10 minutes is correct, and timestamps display in Egypt time.
- Run `npm run lint` and `npm run build`; inspect the corresponding GitHub Actions result before distributing a final APK.
- If the tracking issue recurs, record the exact UI error and inspect matching PostgREST/Edge logs before changing RPC names again.
- Keep work on `shadow/phase1-hardening`; do not merge to `main` or write to Production without explicit approval.
