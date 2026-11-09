import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const roles = ["admin", "cashier", "accountant", "stock_manager", "waiter", "auditor"] as const;
type TeamRole = typeof roles[number];

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
    if (profileError) return json({ error: "Could not verify the caller's platform role." }, 500);
    const platformAdmin = ["platform_admin", "developer"].includes(profile?.platform_role || "");

    const body = await req.json();
    const action = String(body.action || "");
    const organizationId = String(body.organization_id || "");
    if (!organizationId) return json({ error: "Business ID is required." }, 400);

    let callerRole: string | null = null;
    if (!platformAdmin) {
      const { data: membership, error: membershipError } = await admin.from("organization_users")
        .select("role,is_active").eq("organization_id", organizationId).eq("user_id", userData.user.id).maybeSingle();
      if (membershipError) return json({ error: "Could not verify business access." }, 500);
      if (!membership?.is_active || !["owner", "admin"].includes(membership.role)) {
        return json({ error: "Only an active business owner or admin can manage team members." }, 403);
      }
      callerRole = membership.role;
    }

    if (action === "list") {
      const { data: members, error: membersError } = await admin.from("organization_users")
        .select("id,user_id,role,is_active,created_at").eq("organization_id", organizationId)
        .order("created_at", { ascending: true }).limit(250);
      if (membersError) return json({ error: `Could not load team members: ${membersError.message}` }, 500);

      const memberRows = members || [];
      const userIds = memberRows.map(member => member.user_id);
      if (!userIds.length) return json({ members: [] });
      const { data: profiles, error: profilesError } = await admin.from("profiles")
        .select("id,full_name").in("id", userIds);
      if (profilesError) return json({ error: `Could not load team profiles: ${profilesError.message}` }, 500);
      const profileById = new Map((profiles || []).map(item => [item.id, item]));
      const authUsers: { id: string; email?: string }[] = [];
      for (let index = 0; index < userIds.length; index += 10) {
        const batch = await Promise.all(userIds.slice(index, index + 10).map(async id => {
          const { data, error } = await admin.auth.admin.getUserById(id);
          if (error) throw new Error(`Could not load team account ${id}: ${error.message}`);
          return data.user;
        }));
        authUsers.push(...batch);
      }
      const emailById = new Map(authUsers.map(user => [user.id, user.email || null]));
      return json({ members: memberRows.map(member => ({
        ...member,
        full_name: profileById.get(member.user_id)?.full_name || null,
        email: emailById.get(member.user_id) || null
      })) });
    }

    if (action === "invite") {
      const fullName = String(body.full_name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const role = String(body.role || "cashier");
      if (!fullName) return json({ error: "Team member name is required." }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter a valid email address." }, 400);
      if (password.length < 8) return json({ error: "Temporary password must be at least 8 characters." }, 400);
      if (!roles.includes(role as TeamRole)) return json({ error: "Choose a valid business role." }, 400);
      if (role === "admin" && !platformAdmin && callerRole !== "owner") {
        return json({ error: "Only the business owner can assign the admin role." }, 403);
      }

      let userId: string | null = null;
      for (let page = 1; !userId; page++) {
        const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (listError) return json({ error: `Could not check existing accounts: ${listError.message}` }, 500);
        userId = listed.users.find(user => user.email?.toLowerCase() === email)?.id || null;
        if (userId || listed.users.length < 1000) break;
      }

      let invited = false;
      if (userId) {
        const { data: existing, error: existingError } = await admin.from("organization_users")
          .select("id").eq("organization_id", organizationId).eq("user_id", userId).maybeSingle();
        if (existingError) return json({ error: `Could not check business membership: ${existingError.message}` }, 500);
        if (existing) return json({ error: "This account is already a member of this business." }, 409);
      } else {
        const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
          data: { full_name: fullName }
        });
        if (inviteError || !invitation.user) {
          return json({ error: inviteError?.message || "Could not send the invitation email." }, 400);
        }
        userId = invitation.user.id;
        invited = true;
        const { error: passwordError } = await admin.auth.admin.updateUserById(userId, {
          password,
          user_metadata: { full_name: fullName }
        });
        if (passwordError) {
          return json({ error: `Invitation sent, but the temporary password could not be set: ${passwordError.message}` }, 500);
        }
      }

      const { error: insertError } = await admin.from("organization_users").insert({
        organization_id: organizationId,
        user_id: userId,
        role,
        is_active: true
      });
      if (insertError) {
        return json({ error: `${invited ? "Invitation sent, but" : "Could not"} add the team member: ${insertError.message}` }, 500);
      }
      return json({ user_id: userId, invited });
    }

    if (action === "update") {
      const memberId = String(body.member_id || "");
      const requestedRole = body.role === undefined ? undefined : String(body.role);
      const requestedActive = body.is_active === undefined ? undefined : body.is_active;
      if (!memberId) return json({ error: "Team member ID is required." }, 400);
      if (requestedRole !== undefined && !roles.includes(requestedRole as TeamRole)) {
        return json({ error: "Choose a valid business role." }, 400);
      }
      if (requestedActive !== undefined && typeof requestedActive !== "boolean") {
        return json({ error: "Team member status must be enabled or disabled." }, 400);
      }
      if (requestedRole === undefined && requestedActive === undefined) {
        return json({ error: "Provide a role or access-status change." }, 400);
      }

      const { data: target, error: targetError } = await admin.from("organization_users")
        .select("id,user_id,role").eq("id", memberId).eq("organization_id", organizationId).maybeSingle();
      if (targetError) return json({ error: `Could not load team member: ${targetError.message}` }, 500);
      if (!target) return json({ error: "Team member not found." }, 404);
      if (target.role === "owner") return json({ error: "The business owner access cannot be changed here." }, 403);
      if (target.user_id === userData.user.id) return json({ error: "You cannot change your own team access." }, 403);
      if (target.role === "admin" && !platformAdmin && callerRole !== "owner") {
        return json({ error: "Only the business owner can change another admin's access." }, 403);
      }
      if (requestedRole === "admin" && !platformAdmin && callerRole !== "owner") {
        return json({ error: "Only the business owner can assign the admin role." }, 403);
      }

      const changes: { role?: TeamRole; is_active?: boolean } = {};
      if (requestedRole !== undefined) changes.role = requestedRole as TeamRole;
      if (requestedActive !== undefined) changes.is_active = requestedActive;
      const { error: updateError } = await admin.from("organization_users")
        .update(changes).eq("id", memberId).eq("organization_id", organizationId);
      if (updateError) return json({ error: `Could not update team member: ${updateError.message}` }, 500);
      return json({ success: true });
    }

    return json({ error: "Unsupported team management action." }, 400);
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
