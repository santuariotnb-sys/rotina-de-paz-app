import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60_000, // 5 min: conteúdo não refaz a query a cada navegação entre abas
        gcTime: 30 * 60_000, // mantém no cache 30 min → voltar à aba é instantâneo
        refetchOnWindowFocus: false, // não refaz ao voltar o foco da janela
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Pré-carrega o loader da rota no hover/touch do <Link> → navegação parece instantânea.
    defaultPreload: "intent",
    // Reusa o cache por 30s no preload (antes 0 forçava refetch a cada intent).
    defaultPreloadStaleTime: 30_000,
  });

  return router;
};
