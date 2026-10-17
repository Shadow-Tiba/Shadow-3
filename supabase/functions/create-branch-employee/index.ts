import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  let createdAuthUserId: string | null = null;
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !serviceRoleKey || !anonKey) return json({ error: "SERVER_CONFIGURATION_MISSING" }, 500);
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "AUTH_REQUIRED" }, 401);
    const token = authorization.slice("Bearer ".length);
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const callerClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authorization } },
    });
    const { data: callerData, error: callerError } = await callerClient.auth.getUser(token);
    if (callerError || !callerData.user) return json({ error: "AUTH_REQUIRED" }, 401);
    const { error: officeAccessError } = await callerClient.rpc("main_office_get_directory");
    if (officeAccessError) {
      const message = String(officeAccessError.message ?? "");
      const denied = /MAIN_OFFICE_ACCESS_REQUIRED|AUTH_REQUIRED|permission denied|42501|28000/i.test(message);
      return json({ error: denied ? "INSUFFICIENT_ROLE" : "AUTHORIZATION_CHECK_FAILED" }, denied ? 403 : 500);
    }

    const body = await req.json();
    const displayName = String(body.display_name ?? "").trim();
    const username = String(body.username ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const phone = normalizeEgyptianPhone(body.phone);
    if (displayName.length < 3) return json({ error: "DISPLAY_NAME_REQUIRED" }, 400);
    if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(username)) return json({ error: "USERNAME_INVALID" }, 400);
    if (password.length < 10) return json({ error: "PASSWORD_TOO_SHORT" }, 400);
    if (body.phone && !phone) return json({ error: "PHONE_INVALID" }, 400);

    const { data: existing, error: existingError } = await admin.from("app_users")
      .select("user_id").ilike("username", username).maybeSingle();
    if (existingError) throw existingError;
    if (existing) return json({ error: "USERNAME_ALREADY_EXISTS" }, 409);

    const { data: branchOffices, error: officeError } = await admin.from("offices")
      .select("office_id").eq("office_code", "RAS_SEDR").eq("office_type", "BRANCH").eq("is_active", true).limit(2);
    if (officeError) throw officeError;
    if (!branchOffices || branchOffices.length !== 1) return json({ error: "EXPECTED_ONE_ACTIVE_BRANCH_OFFICE" }, 409);

    // Reserved .invalid domain is an internal Auth identifier only; no email is sent.
    const internalEmail = username + "@tiba-supplies.invalid";
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: internalEmail, password, email_confirm: true,
      user_metadata: { display_name: displayName, username, app_role: "BRANCH" },
      app_metadata: { app_role: "BRANCH" },
    });
    if (createError) {
      const duplicate = /already|registered|exists/i.test(createError.message);
      return json({ error: duplicate ? "USERNAME_ALREADY_EXISTS" : "ACCOUNT_CREATION_FAILED" }, duplicate ? 409 : 400);
    }
    if (!created.user) return json({ error: "ACCOUNT_CREATION_FAILED" }, 500);
    createdAuthUserId = created.user.id;

    const { data: profile, error: profileError } = await admin.from("app_users").insert({
      auth_user_id: created.user.id, display_name: displayName, username, phone, role: "BRANCH",
      office_id: branchOffices[0].office_id, is_active: true,
    }).select("user_id").single();
    if (profileError) throw profileError;
    return json({ success: true, username, display_name: displayName, office_id: branchOffices[0].office_id });
  } catch (error) {
    if (createdAuthUserId) {
      try {
        const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { data: linked } = await admin.from("app_users").select("user_id").eq("auth_user_id", createdAuthUserId).maybeSingle();
        if (!linked) await admin.auth.admin.deleteUser(createdAuthUserId);
      } catch (cleanupError) { console.error("Branch account cleanup failed", cleanupError); }
    }
    console.error("create-branch-employee failed", error);
    return json({ error: "INTERNAL_ERROR" }, 500);
  }
});

function normalizeEgyptianPhone(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  let phone = value.trim().replace(/[\s()-]/g, "");
  if (phone.startsWith("00")) phone = "+" + phone.slice(2);
  if (/^01[0125]\d{8}$/.test(phone)) phone = "+20" + phone.slice(1);
  if (/^20(10|11|12|15)\d{8}$/.test(phone)) phone = "+" + phone;
  return /^\+20(10|11|12|15)\d{8}$/.test(phone) ? phone : null;
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
