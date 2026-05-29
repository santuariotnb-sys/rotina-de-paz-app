export function ErrorFallback({ error, reset }: { error: Error; reset?: () => void }) {
  return (
    <div className="grid min-h-dvh place-items-center px-5">
      <div className="max-w-md text-center">
        <h1 className="font-display text-2xl text-[color:var(--deep-purple)]">Algo deu errado</h1>
        <p className="mt-2 text-[13px] text-[color:var(--amethyst)]">{error.message}</p>
        {reset && (
          <button onClick={reset} className="mt-4 rounded-full bg-gradient-to-br from-[#E8C9A0] to-[#C9A876] px-5 py-2.5 text-[13px] font-semibold text-[#2C1F0B]">
            Tentar novamente
          </button>
        )}
      </div>
    </div>
  );
}
