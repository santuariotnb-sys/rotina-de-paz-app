export function ErrorFallback({ error, reset }: { error: Error; reset?: () => void }) {
  // Detalhe técnico só pro dev, nunca na tela da cliente
  console.error("[ErrorFallback]", error);

  const reload = () => {
    if (reset) {
      reset();
    } else {
      window.location.reload();
    }
  };

  return (
    <div className="rdp-app-bg grid min-h-dvh place-items-center px-5">
      <div className="max-w-md text-center">
        <h1 className="font-display text-2xl text-[color:var(--deep-purple)]">
          Tivemos um probleminha
        </h1>
        <p className="mt-3 text-[14px] text-[color:var(--amethyst)] leading-relaxed">
          Não conseguimos carregar esta tela. Quase sempre é a conexão — toque
          em <strong>Recarregar</strong> pra tentar de novo.
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <button
            onClick={reload}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-[#E8C9A0] to-[#C9A876] px-5 py-3 text-[14px] font-semibold text-[#2C1F0B] shadow-[0_8px_24px_-10px_rgba(201,168,118,0.55)]"
          >
            Recarregar
          </button>
          <a
            href="/app"
            className="text-[13px] font-medium text-[color:var(--amethyst)] underline"
          >
            Voltar ao início
          </a>
        </div>
      </div>
    </div>
  );
}
