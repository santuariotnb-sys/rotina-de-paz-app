import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/admin/StubPage";
export const Route = createFileRoute("/admin/membros")({
  component: () => <StubPage phase="Fase 5" title="Membros" description="Compradores ativos, entitlements e ações." />,
});