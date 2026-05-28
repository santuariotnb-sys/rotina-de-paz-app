import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/admin/StubPage";
export const Route = createFileRoute("/admin/tracking")({
  component: () => <StubPage phase="Fase 5" title="Tracking" description="Pixel, CAPI, UTM e ROAS." />,
});