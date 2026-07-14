import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertAdmin } from "./server-auth";

export type QuizResponseRow = {
  id: string;
  lead_id: string;
  question_key: string;
  answer_value: string;
  answer_text: string;
  time_to_answer: number | null;
  created_at: string;
};

/**
 * Fonte canonica das respostas do quiz para o admin.
 * Exclui respostas de leads marcados is_test=true (quiz_responses nao tem is_test
 * proprio, entao o filtro e pelo lead). Roda server-side com service role — nao
 * expoe a tabela crua pela anon key. Substitui a query crua de admin.quiz.tsx.
 */
export const getQuizResponses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        sinceISO: z.string(),
        quizId: z.string().nullish(),
        limit: z.number().int().min(1).max(20000).default(5000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<QuizResponseRow[]> => {
    await assertAdmin(context.userId);

    // Tipos gerados do Supabase estão desatualizados (schema real tem quiz_id em
    // leads e question_key/answer_value em quiz_responses). Cast como o resto do
    // admin já faz — ver (supabase as any) na versão anterior de admin.quiz.tsx.
    const db = supabaseAdmin as any;

    // 1. leads de teste (denylist is_test) + baseline de producao, em paralelo.
    //    leads_reais aplica o mesmo production_start_at; replicamos aqui p/ os KPIs
    //    de respostas baterem com os de leads na mesma tela.
    let testQuery = db.from("leads").select("id").eq("is_test", true);
    if (data.quizId) testQuery = testQuery.eq("quiz_id", data.quizId);
    const [testRes, cfgRes] = await Promise.all([
      testQuery,
      db.from("checkout_config").select("value").eq("key", "production_start_at").maybeSingle(),
    ]);
    if (testRes.error) throw new Error(testRes.error.message);
    const testIds = (testRes.data ?? []).map((l: { id: string }) => l.id);

    // piso efetivo = o mais recente entre o filtro de periodo e o inicio de producao
    const prodStart = cfgRes.data?.value as string | undefined;
    const since =
      prodStart && new Date(prodStart) > new Date(data.sinceISO) ? prodStart : data.sinceISO;

    // 2. respostas do periodo, excluindo as de leads de teste
    let query = db
      .from("quiz_responses")
      .select("id, lead_id, question_key, answer_value, answer_text, time_to_answer, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.quizId) query = query.eq("quiz_id", data.quizId);
    if (testIds.length > 0) query = query.not("lead_id", "in", `(${testIds.join(",")})`);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return (rows ?? []) as QuizResponseRow[];
  });
