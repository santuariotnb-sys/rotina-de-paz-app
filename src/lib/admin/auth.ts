import { supabase } from "@/integrations/supabase/client";

export type AdminRecord = {
  id: string;
  user_id: string;
  email: string;
  name: string;
  role: string;
};

/**
 * Returns the current admin record, or null if the signed-in user
 * is not in admin_users. Safe to call client-side: RLS on admin_users
 * only allows admins to read it, so non-admins simply get 0 rows.
 */
export async function getCurrentAdmin(): Promise<AdminRecord | null> {
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) {
    console.log("[admin-auth] no user session", userErr?.message);
    return null;
  }
  console.log("[admin-auth] checking admin for", userRes.user.id, userRes.user.email);
  const { data, error } = await supabase
    .from("admin_users")
    .select("id,user_id,email,name,role")
    .eq("user_id", userRes.user.id)
    .maybeSingle();
  if (error) console.log("[admin-auth] query error", error.message);
  if (!data) console.log("[admin-auth] no admin record found");
  else console.log("[admin-auth] admin found:", data.role);
  if (error || !data) return null;
  return data as AdminRecord;
}