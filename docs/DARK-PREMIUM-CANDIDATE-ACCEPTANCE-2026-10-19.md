# Tiba-Supplies Dark Premium Candidate Acceptance — 2026-10-19

## Candidate boundary
- Repository: `Shadow-Tiba/Shadow-3`
- Candidate branch: `ui/dark-premium-final`
- Draft review: https://github.com/Shadow-Tiba/Shadow-3/pull/4
- Backend source branch remains `shadow/phase1-hardening`.
- No merge to `main`, no Production database changes, and no live operational rows were created during this candidate packaging work.
- Firebase Hosting is used only for a temporary visual preview; the application backend target remains the Tiba Shadow Supabase project.

## Candidate CI evidence
- Phase 1 Shadow CI: https://github.com/Shadow-Tiba/Shadow-3/actions/runs/39258529018 — success.
- Phase 1 build: https://github.com/Shadow-Tiba/Shadow-3/actions/runs/39258529108 — success.
- Android signed release workflow: https://github.com/Shadow-Tiba/Shadow-3/actions/runs/39258550925 — all Office, Ras Sedr Branch, and Driver jobs succeeded. APK signature verification ran with `apksigner`; v1 and v2 signature schemes verified for all three APKs.
- Windows + Office web workflow: https://github.com/Shadow-Tiba/Shadow-3/actions/runs/39258519279 — both jobs succeeded. The Windows bundle check confirmed the configured Tiba Shadow Supabase URL and the configured publishable key were present without printing the key.
- Firebase preview workflow: https://github.com/Shadow-Tiba/Shadow-3/actions/runs/39257531729 — success.
- Preview URL: https://mido-supplies--design-preview-iqeyloro.web.app

## Build artifacts (GitHub Actions; retention expires 2026-11-18)
- Office signed APK artifact: https://github.com/Shadow-Tiba/Shadow-3/actions/runs/39258550925/artifacts/12188502062
- Ras Sedr Branch signed APK artifact: https://github.com/Shadow-Tiba/Shadow-3/actions/runs/39258550925/artifacts/12188387111
- Driver signed APK artifact: https://github.com/Shadow-Tiba/Shadow-3/actions/runs/39258550925/artifacts/12189336786
- Office web bundle artifact: https://github.com/Shadow-Tiba/Shadow-3/actions/runs/39258519279/artifacts/12188471653
- Office Windows portable EXE artifact: https://github.com/Shadow-Tiba/Shadow-3/actions/runs/39258519279/artifacts/12188882334

These are CI artifacts for review/testing, not a production release. Artifact ZIPs need to be downloaded and their contents installed/opened in a controlled acceptance session.

## Supabase Shadow observations
- Public application tables currently have RLS enabled and direct client table grants remain revoked, according to the latest prior read-only audit.
- The current Supabase Security Advisor reports 21 RLS-enabled tables with no direct policies and 48 SECURITY DEFINER functions executable by authenticated users. This application intentionally uses RPC-oriented access with direct table grants revoked; the warnings must be interpreted alongside the function-by-function authorization contract, not “fixed” by granting broad table access or blindly revoking required RPCs.
- Read-only function-definition inspection showed fixed `search_path` settings on the reviewed SECURITY DEFINER functions; the callable RPC set includes main-office guard calls, branch guard calls, or authenticated driver-owned checks. Continue the function-by-function review and real-session acceptance.
- Performance Advisor reports 38 foreign keys without covering indexes. Review query plans and workload before adding indexes; do not apply a blanket index migration.
- Leaked-password protection is still reported disabled. Enable it in Supabase Auth settings and verify sign-in compatibility before production rollout.

## Remaining release gates
1. Visual review at desktop and mobile widths.
2. Install each APK on a test device; verify app identity, intended Supabase URL, login, update behavior, and preservation of app data. Signing verification in CI does not prove upgrade compatibility on a physical device.
3. Authenticated acceptance tests for HEAD_OFFICE, BRANCH, and DRIVER accounts, including role-denial checks, load visibility, geofence boundaries, queue selection, notifications, paper import, actual weight, delivery confirmation, scale-ticket storage, reports, and Egypt-time timestamps.
4. Reconcile original factory/quarry/owner/vehicle/driver and paper-loading source files before importing business data. The current repository contains a paper-load import template but no complete authoritative daily source workbook/CSV was found in the checked repository/project materials; do not synthesize operational records or infer missing values.
5. Verify signed APK update installation without losing app data; confirm Windows EXE startup and its bundled web app.
6. Resolve or formally accept the remaining security/performance findings, then prepare a separate release review.

## Release disposition
**Build pipeline: green. Candidate packaging: available. Operational release: NOT APPROVED YET.**

Do not merge PR #4, deploy to Production, import synthetic records, or change production settings without explicit release approval and completion of the acceptance gates above.
