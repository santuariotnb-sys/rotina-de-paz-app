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
  if (userErr || !userRes.user) return null;

  const { data: isAdmin, error: rpcErr } = await supabase.rpc("is_admin", {
    _user_id: userRes.user.id,
  });
  if (rpcErr || !isAdmin) return null;

  const { data: adminRow, error: fetchErr } = await supabase
    .from("admin_users")
    .select("id, user_id, email, name, role")
    .eq("user_id", userRes.user.id)
    .maybeSingle();
  if (fetchErr || !adminRow) return null;
  return adminRow as AdminRecord;
}