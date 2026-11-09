import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Invalid session" }, 401);

    const admin = createClient(url, serviceKey);
    const { data: profile, error: profileError } = await admin.from("profiles")
      .select("platform_role").eq("id", userData.user.id).single();
    if (profileError || !["platform_admin", "developer"].includes(profile?.platform_role || "")) {
      return json({ error: "Only Raremedia platform administrators and developers can create businesses." }, 403);
    }

    const body = await req.json();
    const name = String(body.name || "").trim();
    const ownerEmail = String(body.owner_email || "").trim().toLowerCase();
    const ownerPassword = String(body.password || "");
    if (!name || !ownerEmail) return json({ error: "Business name and owner email are required." }, 400);
    if (ownerPassword.length < 8) return json({ error: "Owner password must be at least 8 characters." }, 400);

    let ownerId: string | null = null;
    let ownerCreated = false;
    for (let page = 1; !ownerId; page++) {
      const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (listError) return json({ error: `Could not check existing owner accounts: ${listError.message}` }, 500);
      ownerId = listed.users.find(user => user.email?.toLowerCase() === ownerEmail)?.id || null;
      if (ownerId || listed.users.length < 1000) break;
    }

    if (!ownerId) {
      const { data: created, error: createUserError } = await admin.auth.admin.createUser({
        email: ownerEmail,
        password: ownerPassword,
        email_confirm: true,
        user_metadata: { full_name: String(body.owner_name || "").trim() }
      });
      if (createUserError || !created.user) {
        return json({ error: createUserError?.message || "Could not create the owner login." }, 400);
      }
      ownerId = created.user.id;
      ownerCreated = true;
    }

    const { data: orgId, error: createError } = await admin.rpc("bootstrap_organization", {
      p_name: name,
      p_business_type: String(body.business_type || "Other"),
      p_phone: String(body.phone || ""),
      p_address: String(body.address || ""),
      p_currency: String(body.currency || "RWF"),
      p_owner_id: ownerId,
      p_load_demo: Boolean(body.load_demo)
    });
    if (createError) return json({ error: createError.message }, 400);

    return json({ organization_id: orgId, owner_user_id: ownerId, owner_created: ownerCreated });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected server error" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
