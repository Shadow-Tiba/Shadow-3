import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../supabase/functions/create-driver-account/index.ts", import.meta.url),
  "utf8",
);

const branchSource = await readFile(
  new URL("../supabase/functions/create-branch-employee/index.ts", import.meta.url),
  "utf8",
);

const aiFunctionSource = await readFile(
  new URL("../supabase/functions/tiba-ai-assistant/index.ts", import.meta.url),
  "utf8",
);
const aiUiSource = await readFile(
  new URL("../src/components/SystemAiAssistant.tsx", import.meta.url),
  "utf8",
);
const officeUiSource = await readFile(
  new URL("../src/components/LiveOperationsBoard.tsx", import.meta.url),
  "utf8",
);
const branchUiSource = await readFile(
  new URL("../src/components/BranchOfficeApp.tsx", import.meta.url),
  "utf8",
);

test("driver account creation delegates authorization to Phase 1 Main Office guard", () => {
  assert.ok(source.includes('callerClient.rpc("main_office_get_directory")'));
  assert.ok(source.includes("MAIN_OFFICE_ACCESS_REQUIRED"));
  assert.ok(!source.includes('from("user_roles")'));
});

test("the function validates the caller token with Supabase Auth", () => {
  assert.match(source, /callerClient\.auth\.getUser\(token\)/);
  assert.match(source, /if \(callerError \|\| !callerData\.user\)/);
});

test("Phase 1 Main Office guard precedes privileged account creation and reset", () => {
  const gate = source.indexOf('callerClient.rpc("main_office_get_directory")');
  const create = source.indexOf("admin.auth.admin.createUser", gate);
  const resetBranch = source.indexOf('if (body.action === "reset_password")', gate);
  const reset = source.indexOf("admin.auth.admin.updateUserById", resetBranch);
  assert.ok(gate >= 0, "Main Office authorization guard must exist");
  assert.ok(create > gate, "Account creation must happen after the Main Office guard");
  assert.ok(resetBranch > gate && reset > resetBranch, "Password reset must happen after the Main Office guard and inside its reset branch");
});

test("driver login uses office-managed phone/password credentials without forced first-login change", () => {
  assert.match(source, /driverLoginEmail\(phone\)/);
  assert.match(source, /password: temporaryPassword/);
  assert.match(source, /app_metadata: \{ must_change_password: false \}/);
  assert.match(source, /app_metadata: \{ \.\.\.appMetadata, must_change_password: false \}/);
  assert.doesNotMatch(source, /must_change_password: true/);
  assert.doesNotMatch(source, /complete_password_setup/);
});

test("branch employee creation is restricted by the authorized Main Office directory RPC", () => {
  const gate = branchSource.indexOf('callerClient.rpc("main_office_get_directory")');
  const deny = branchSource.indexOf('if (officeAccessError)', gate);
  const create = branchSource.indexOf("admin.auth.admin.createUser", gate);
  assert.ok(gate >= 0, "Main Office authorization RPC must be checked");
  assert.ok(deny > gate, "Authorization failures must be handled before account creation");
  assert.ok(create > deny, "Branch account creation must occur only after authorization succeeds");
  assert.match(branchSource, /MAIN_OFFICE_ACCESS_REQUIRED|INSUFFICIENT_ROLE/);
  assert.doesNotMatch(branchSource, /\[\s*"ADMIN"\s*,\s*"HEAD_OFFICE"\s*,\s*"BRANCH"\s*\]\.includes/);
});

test("branch employee creation validates identity, credentials, and exactly one active branch office", () => {
  assert.match(branchSource, /callerClient\.auth\.getUser\(token\)/);
  assert.match(branchSource, /\.eq\("is_active", true\)/);
  assert.match(branchSource, /password\.length < 10/);
  assert.match(branchSource, /\^\[a-z0-9\]\[a-z0-9\._-\]\{2,29\}\$/);
  assert.match(branchSource, /EXPECTED_ONE_ACTIVE_BRANCH_OFFICE/);
  assert.match(branchSource, /username \+ "@tiba-supplies\.invalid"/);
  assert.match(branchSource, /app_metadata: \{ app_role: "BRANCH" \}/);
});

test("Tiba AI assistant requires an authenticated active profile and checks role per interface", () => {
  assert.match(aiFunctionSource, /callerClient\.auth\.getUser\(token\)/);
  assert.match(aiFunctionSource, /\.from\("app_users"\)[\s\S]*?\.eq\("is_active", true\)/);
  assert.match(aiFunctionSource, /audience === "HEAD_OFFICE"[\s\S]*?\["ADMIN", "HEAD_OFFICE"\]/);
  assert.match(aiFunctionSource, /audience === "BRANCH"[\s\S]*?role !== "BRANCH"/);
  assert.match(aiFunctionSource, /\.eq\("office_id", profile\.office_id\)[\s\S]*?\.eq\("office_type", "BRANCH"\)[\s\S]*?\.eq\("is_active", true\)/);
  assert.match(aiFunctionSource, /GEMINI_API_KEY/);
  assert.match(aiFunctionSource, /contextText\.length > 12000/);
  assert.match(aiFunctionSource, /question\.length > 1200/);
});

test("AI key stays server-side and assistant is advisory-only", () => {
  assert.match(aiFunctionSource, /Deno\.env\.get\("GEMINI_API_KEY"\)/);
  assert.doesNotMatch(aiUiSource, /GEMINI_API_KEY|generativelanguage\.googleapis\.com/);
  assert.match(aiUiSource, /محتاج إعداد مفتاح Gemini الآمن في Supabase/);
  assert.match(aiFunctionSource, /لا تنفذ أي إجراء/);
  assert.match(aiFunctionSource, /لا تقترح تنفيذ تعديلات أو إسناد أو إلغاء من حساب الفرع/);
});

test("both office interfaces expose the shared AI assistant with separate role contexts", () => {
  assert.match(officeUiSource, /SystemAiAssistant audience="HEAD_OFFICE"/);
  assert.match(officeUiSource, /\['assistant', 'مساعد النظام AI', Bot\]/);
  assert.match(branchUiSource, /SystemAiAssistant audience="BRANCH"/);
  assert.match(branchUiSource, /key:'assistant',label:'مساعد النظام AI'/);
});


test("new driver accounts and office password resets do not force password changes", () => {
  assert.match(source, /app_metadata: \{ must_change_password: false \}/);
  assert.match(source, /app_metadata: \{ \.\.\.appMetadata, must_change_password: false \}/);
  assert.doesNotMatch(source, /must_change_password: true/);
  assert.doesNotMatch(source, /complete_password_setup/);
});




const trackingSource = await readFile(
  new URL("../supabase/functions/driver-native-location/index.ts", import.meta.url),
  "utf8",
);
const trackingMigration = await readFile(
  new URL("../supabase/migrations/20261014_native_driver_tracking_sessions.sql", import.meta.url),
  "utf8",
);

test("native tracking is scoped to authenticated, active driver sessions", () => {
  assert.match(trackingSource, /auth\.getUser\(token\)/);
  assert.match(trackingSource, /DRIVER_ACCOUNT_NOT_LINKED/);
  assert.match(trackingSource, /TRACKING_TOKEN_INVALID_OR_EXPIRED/);
  assert.match(trackingSource, /NO_ACTIVE_VEHICLE_ASSIGNMENT/);
  assert.match(trackingSource, /LOCATION_RATE_LIMITED/);
  assert.match(trackingSource, /\.from\("driver_live_locations"\)/);
});

test("tracking-session tokens are stored only as hashes and not exposed to client table access", () => {
  assert.match(trackingSource, /token_hash: await sha256\(trackingToken\)/);
  assert.match(trackingMigration, /token_hash text NOT NULL UNIQUE/);
  assert.match(trackingMigration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(trackingMigration, /REVOKE ALL ON public\.driver_location_tracking_sessions FROM PUBLIC, anon, authenticated/);
});


const nativeServiceSource = await readFile(
  new URL("../native/android/NativeDriverTrackingService.java", import.meta.url),
  "utf8",
);

test("native Android tracking uses the deployed Phase 1 live-location RPC contract", () => {
  assert.match(nativeServiceSource, /\/rest\/v1\/rpc\/driver_update_live_location/);
  assert.doesNotMatch(nativeServiceSource, /\/rest\/v1\/rpc\/update_driver_live_location/);
  assert.match(nativeServiceSource, /body\.put\("p_latitude"/);
  assert.match(nativeServiceSource, /body\.put\("p_longitude"/);
  assert.match(nativeServiceSource, /body\.put\("p_accuracy_m"/);
  assert.match(nativeServiceSource, /body\.put\("p_captured_at"/);
  assert.doesNotMatch(nativeServiceSource, /body\.put\("p_heading"|body\.put\("p_speed_kmh"/);
});
