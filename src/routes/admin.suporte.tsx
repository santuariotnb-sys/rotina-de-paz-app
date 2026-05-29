import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/admin/StubPage";
export const Route = createFileRoute("/admin/suporte")({
  component: () => <StubPage phase="Onda 2" title="Suporte" description="Tickets, respostas e histórico de atendimento." />,
});
