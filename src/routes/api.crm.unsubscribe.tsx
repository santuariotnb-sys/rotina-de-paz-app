import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

const processUnsubscribe = createServerFn({ method: "GET" })
  .inputValidator((input) => {
    const token = (input as { token?: string })?.token;
    if (!token) throw new Error("Token ausente");
    return { token };
  })
  .handler(async ({ data }) => {
    const { processOptOut } = await import("@/lib/admin/crm-unsub.server");
    return processOptOut(data.token);
  });

export const Route = createFileRoute("/api/crm/unsubscribe")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: (search.token as string) ?? "",
  }),
  loaderDeps: ({ search }) => ({ token: search.token }),
  loader: async ({ deps }) => {
    if (!deps.token) return { success: false, error: "Link inválido" };
    return processUnsubscribe({ data: { token: deps.token } });
  },
  component: UnsubscribePage,
});

function UnsubscribePage() {
  const result = Route.useLoaderData();

  const title = result.success ? "Cancelamento confirmado" : "Erro";
  const message = result.success
    ? "Você não receberá mais mensagens neste canal. Se mudar de ideia, entre em contato pelo nosso suporte."
    : result.error ?? "Não foi possível processar.";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8F1F3] p-5 font-sans">
      <div className="max-w-[440px] rounded-[20px] bg-white p-10 text-center shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
        <div className="mb-6 font-serif text-base tracking-[4px] text-[#C49A5A]">
          ROTINA DE PAZ
        </div>
        <h1 className="mb-4 font-serif text-2xl text-[#4A3B56]">{title}</h1>
        <p className="leading-relaxed text-[#7C6387]">{message}</p>
      </div>
    </div>
  );
}
