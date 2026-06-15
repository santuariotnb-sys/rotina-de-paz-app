import { createFileRoute } from "@tanstack/react-router";
import { runReconciliation } from "@/lib/admin/reconciliation.server";

export const Route = createFileRoute("/api/public/cron/reconciliation")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Vercel Cron envia Authorization: Bearer <CRON_SECRET>
        const cronSecret = process.env.CRON_SECRET;
        if (cronSecret) {
          const auth = request.headers.get("authorization");
          if (auth !== `Bearer ${cronSecret}`) {
            return new Response("Unauthorized", { status: 401 });
          }
        }

        try {
          const report = await runReconciliation({ hoursBack: 24 });
          return Response.json({ ok: true, report });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[reconciliation] erro:", msg);
          return Response.json({ ok: false, error: msg }, { status: 500 });
        }
      },
    },
  },
});
