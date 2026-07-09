import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { getQuizzes, type QuizOption } from "./quiz-catalog.functions";

const STORAGE_KEY = "admin.quizId";

function readStoredQuizId(): string | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? raw : null; // "" ou ausente → null
}

type AdminQuizContextValue = {
  quizId: string | null;
  setQuizId: (id: string | null) => void;
  quizzes: QuizOption[];
  isLoading: boolean;
};

const AdminQuizContext = createContext<AdminQuizContextValue | null>(null);

export function AdminQuizProvider({ children }: { children: ReactNode }) {
  const [quizId, setQuizIdState] = useState<string | null>(() => readStoredQuizId());

  const { data: quizzes = [], isLoading } = useQuery({
    queryKey: ["admin-quizzes"],
    queryFn: () => getQuizzes(),
  });

  function setQuizId(id: string | null) {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, id ?? "");
    }
    setQuizIdState(id);
  }

  const value = useMemo<AdminQuizContextValue>(
    () => ({ quizId, setQuizId, quizzes, isLoading }),
    [quizId, quizzes, isLoading],
  );

  return <AdminQuizContext.Provider value={value}>{children}</AdminQuizContext.Provider>;
}

export function useAdminQuiz(): AdminQuizContextValue {
  const ctx = useContext(AdminQuizContext);
  if (!ctx) throw new Error("useAdminQuiz deve ser usado dentro de <AdminQuizProvider>");
  return ctx;
}
