# Phase 1 isolated staging test matrix

Status: **NOT RUN — this is a test plan, not evidence of passing SQL behavior.**

Use an isolated Supabase staging database only. Do not seed or mutate production data for these tests. Use synthetic accounts with the roles ADMIN, HEAD_OFFICE, BRANCH, and DRIVER; synthetic driver/vehicle pairs; and synthetic GPS points.

## Release-blocking test cases

| ID | Scenario | Expected result | Evidence to record |
|---|---|---|---|
| AUTH-01 | Unauthenticated caller invokes every operational RPC | Rejected | SQLSTATE/error and function |
| ROLE-01 | BRANCH calls create/update driver or vehicle, dispatch, cancel, redirect, direct assign | Rejected server-side | RPC result for each signature |
| ROLE-02 | HEAD_OFFICE creates/updates drivers and vehicles, dispatches, cancels, redirects, direct assigns | Allowed only when input is valid | Returned IDs and audit entries |
| DIR-01 | HEAD assigns an eligible driver/vehicle | Booking is BOOKED; no actual_loading_records row; audit office is HEAD | Booking/audit rows |
| DIR-02 | Assigned driver requests pending assignments | Only that driver's pending assignments returned | RPC output using two synthetic drivers |
| DIR-03 | Different driver accepts the booking | Rejected; no state change | Error and unchanged row counts |
| DIR-04 | Correct driver accepts once | Booking becomes LOADING_STATEMENT; exactly one actual record; accepted_at populated | Before/after rows |
| DIR-05 | Correct driver accepts same booking concurrently/twice | At most one successful transition and one actual record | Parallel call results and row counts |
| GPS-01 | GPS missing, captured_at NULL, older than 10 minutes, or >1 minute in future | Direct assignment rejected | Each test input and error |
| GPS-02 | updated_at stale while captured_at is fresh (and vice versa) | Rejected | Each test input and error |
| GEO-01 | Eligible driver just inside configured radius | Eligible | Computed distance and result |
| GEO-02 | Driver outside radius | Published loads/queue hidden and direct assignment rejected | Snapshot and RPC result |
| GEO-03 | Driver leaves radius after direct assignment | Own pending/active booking remains visible; new published loads/queue hidden | Snapshot before/after movement |
| CAN-01 | Cancel pending direct assignment with reason | Booking cancelled; audit preserved; one queue re-entry at tail | Booking/audit/queue rows |
| CAN-02 | Cancel without reason, cancel twice, or cancel after actual weight/delivery evidence | Rejected with no duplicate queue entry | Error and queue count |
| CAN-04 | Cancel an IN_TRANSIT booking with no actual weight and no delivery confirmation | Allowed with reason; booking cancelled; audit preserved; one queue re-entry at HEAD tail unless vehicle is out of service | Booking/audit/queue rows |
| CAN-03 | Cancel with vehicle out of service | Booking cancelled, no queue re-entry | Queue rows and audit |
| RED-01 | Redirect a loaded/in-transit trip with valid reason | Same booking/actual record retained; factory_id updated; audit has reason/time/new destination | Before/after row IDs |
| RED-02 | Redirect a cancelled or invalid booking | Rejected | Error and unchanged rows |
| RED-03 | Redirect after actual weight or confirmed delivery | Allowed as a corrective destination change; same actual-load row, weight, scale image, delivery timestamp/coordinates, and booking status preserved; old/new destination and reason audited | Before/after row IDs, evidence fields, and audit payload |
| DEL-01 | Delivery confirmation missing weight or scale image | Rejected | Error and unchanged rows |
| DEL-02 | Confirm delivery twice | Second confirmation rejected; no duplicate effects | RPC results and row counts |
| RPT-01 | Reports include only delivered trips with actual weight | Undelivered and unweighted trips excluded | Query output compared with fixture |
| BR-01 | HEAD creates a branch employee with a unique username and password | Auth user, app_users profile, BRANCH role and BRANCH office association created atomically; password is never stored in app tables | Auth/profile/role rows |
| BR-02 | Duplicate username or invalid password/phone submitted | Rejected; no orphan Auth user or profile | Function response and row counts |
| BR-03 | BRANCH user requests get_phase1_snapshot or any office mutation RPC | Rejected server-side | RPC response and unchanged data |
| BR-04 | BRANCH user requests get_branch_office_snapshot | Only branch-scoped loads/actuals/allocations/waiting and permitted contact directory returned | Snapshot payload reviewed for out-of-scope records |
| BR-05 | HEAD deactivates a branch employee | Subsequent branch snapshot and other RPCs denied; audit record retained | Auth session and RPC result |
| BR-06 | Branch app user attempts to edit/cancel/redirect/create loads | No write controls in UI and server-side authorization rejects direct RPC calls | UI smoke test and RPC responses |
| DATA-01 | Historical Excel/WhatsApp files are present only as reference/staging data | No operational booking/loading rows imported | Counts before/after |


| CAN-05 | Attempt to cancel a booking whose status is `LOADED` through any write path | Rejected with `LOADED_TRIP_CANNOT_BE_CANCELLED`; booking and loading evidence unchanged | RPC/direct-update result and before/after rows |
| CAN-06 | Attempt cancellation after actual weight or delivery confirmation exists | Rejected with `ACTUAL_DELIVERY_ALREADY_RECORDED`; no state change | Error and before/after rows |
| BR-07 | BRANCH calls cancellation or redirect RPCs | Rejected server-side; booking and audit state unchanged | RPC responses and before/after rows |

## Run order

1. Reconcile the exact repository migration list against the production migration ledger before any replay.
2. Start with a clean isolated staging database and apply only the reconciled migration sequence.
3. Run static definition checks in `supabase/tests/phase1_direct_assignment_security_checks.sql`.
4. Run this matrix with synthetic fixtures; save outputs and the staging migration ledger.
5. Run frontend lint/build and a real Android device smoke test for driver location permissions/background capture, plus the separate Ras Sedr branch APK login, read-only screens, click-to-call and access-denial checks.
6. Fix every failure and rerun the full suite. Do not merge or deploy until all release-blocking cases pass.

## Current known limitations

- Repository migration version/name reconciliation is incomplete.
- Production does not have linked driver auth accounts, GPS points, active vehicle-driver assignments, or actual-loading records sufficient for end-to-end driver tests.
- GitHub Actions currently validates frontend lint/build only; it does not execute these SQL assertions.
- No production migrations have been applied as part of this audit.
