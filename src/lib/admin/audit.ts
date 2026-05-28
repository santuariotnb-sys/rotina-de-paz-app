import { supabase } from "@/integrations/supabase/client";
import { getCurrentAdmin } from "./auth";

export async function logAdminAction(
  action: string,
  opts: {
    resourceType?: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
  } = {},
): Promise<void> {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) return;
    await supabase.from("admin_audit_logs").insert({
      admin_id: admin.id,
      action,
      resource_type: opts.resourceType ?? null,
      resource_id: opts.resourceId ?? null,
      metadata: (opts.metadata ?? null) as never,
    });
  } catch {
    // audit logging must never break the UI flow
  }
}