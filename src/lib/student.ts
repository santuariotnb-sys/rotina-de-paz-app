import { ARCHETYPES, type Archetype } from "@/data/quiz";
import { supabase } from "@/integrations/supabase/client";

export type Student = {
  archetype: Archetype;
  name?: string | null;
  email?: string | null;
  desire?: string | null;
  situation?: string | null;
  lead_id?: string | null;
  created_at?: string;
};
export type Progress = Record<string, boolean>;

export const STUDENT_KEY = "sacra_student";
export const PROGRESS_KEY = "sacra_progress";
export const SPLASH_KEY = "rdp_splash_seen";

export function loadStudent(): Student | null {
  try {
    const raw = localStorage.getItem(STUDENT_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return p && ARCHETYPES[p.archetype as Archetype] ? p : null;
  } catch { return null; }
}
export function saveStudent(s: Student) {
  try { localStorage.setItem(STUDENT_KEY, JSON.stringify({ ...s, created_at: s.created_at ?? new Date().toISOString() })); } catch {}
}

/**
 * Carrega o profile do usuário autenticado no Supabase e mescla com o student local.
 * Se houver dados locais (do quiz) e a coluna no profile estiver vazia, faz upsert.
 */
export async function syncStudentWithProfile(userId: string, email: string | null): Promise<Student | null> {
  try {
    const local = loadStudent();
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    // Mescla: profile remoto tem prioridade, mas completa com dados locais (quiz)
    const merged: Student = {
      archetype: (profile?.archetype as Archetype) || local?.archetype || "antecipatoria",
      name: profile?.name || local?.name || (email ? email.split("@")[0] : null),
      email: profile?.email || email,
      desire: profile?.desire || local?.desire || null,
      situation: profile?.situation || local?.situation || null,
      lead_id: profile?.lead_id || local?.lead_id || null,
    };

    // Se faltam dados no profile e temos locais, faz upsert
    const needsUpdate =
      !profile ||
      (!profile.archetype && merged.archetype) ||
      (!profile.desire && merged.desire) ||
      (!profile.situation && merged.situation) ||
      (!profile.lead_id && merged.lead_id);

    if (needsUpdate) {
      await supabase.from("profiles").upsert(
        {
          user_id: userId,
          email: merged.email,
          name: merged.name,
          archetype: merged.archetype,
          desire: merged.desire,
          situation: merged.situation,
          lead_id: merged.lead_id,
        },
        { onConflict: "user_id" },
      );
    }

    saveStudent(merged);
    return merged;
  } catch (e) {
    console.error("[syncStudentWithProfile]", e);
    return loadStudent();
  }
}

export function clearStudent() {
  try {
    localStorage.removeItem(STUDENT_KEY);
    localStorage.removeItem(PROGRESS_KEY);
    sessionStorage.removeItem(SPLASH_KEY);
  } catch {}
}
export function loadProgress(): Progress {
  try { const r = localStorage.getItem(PROGRESS_KEY); return r ? JSON.parse(r) : {}; } catch { return {}; }
}
export function saveProgress(p: Progress) { try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch {} }