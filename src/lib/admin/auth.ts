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
  const { data, error } = await supabase.rpc("is_admin", {
    check_user_id: userRes.user.id,
  });
  if (error || !data || !Array.isArray(data) || data.length === 0) return null;
  return data[0] as AdminRecord;
}