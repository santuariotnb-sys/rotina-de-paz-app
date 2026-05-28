import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/admin/StubPage";
export const Route = createFileRoute("/admin/leads")({
  component: () => <StubPage phase="Fase 4" title="Leads do Quiz" description="Análise, busca direta no banco e insights." />,
});