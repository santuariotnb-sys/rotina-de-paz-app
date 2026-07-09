import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertAdmin } from "./server-auth";

export type QuizOption = { id: string; name: string };

export const getQuizzes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<QuizOption[]> => {
    await assertAdmin(context.userId);
    // Tabela `quizzes` não está no types.ts gerado → cast
    const { data, error } = await (supabaseAdmin as any)
      .from("quizzes")
      .select("id, name:nome")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as QuizOption[];
  });
