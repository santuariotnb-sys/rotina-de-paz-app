import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Save, X, Upload, AlertCircle, GraduationCap, ChevronLeft, PlayCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/admin/GlassCard";
import { logAdminAction } from "@/lib/admin/audit";

export const Route = createFileRoute("/admin/cursos")({
  component: AdminCursosPage,
});

type Course = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  badge: string | null;
  cover_url: string | null;
  days: number;
  modules: number;
  sort_order: number;
  status: "active" | "draft" | "archived";
  kind: "devocional" | "curso";
};

type Lesson = {
  id: string;
  course_id: string;
  module_index: number;
  lesson_index: number;
  title: string;
  description: string | null;
  video_url: string | null;
  duration_seconds: number;
  sort_order: number;
};

function fmt(s: number) {
  if (!s) return "0:00";
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

async function listCourses(): Promise<Course[]> {
  const { data, error } = await supabase.from("courses").select("*").order("sort_order").order("title");
  if (error) throw new Error(error.message);
  return (data ?? []) as Course[];
}
async function listLessons(courseId: string): Promise<Lesson[]> {
  const { data, error } = await supabase.from("course_lessons").select("*").eq("course_id", courseId)
    .order("module_index").order("lesson_index").order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as Lesson[];
}

function AdminCursosPage() {
  const qc = useQueryClient();
  const [editingCourse, setEditingCourse] = useState<Course | "new" | null>(null);
  const [openCourseId, setOpenCourseId] = useState<string | null>(null);

  const { data: courses = [], isLoading } = useQuery({ queryKey: ["adm-courses"], queryFn: listCourses });

  const delMutation = useMutation({
    mutationFn: async (c: Course) => {
      const { error } = await supabase.from("courses").delete().eq("id", c.id);
      if (error) throw new Error(error.message);
      await logAdminAction("course.delete", { resourceType: "course", resourceId: c.id, metadata: { title: c.title } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adm-courses"] }),
  });

  if (openCourseId) {
    const course = courses.find((c) => c.id === openCourseId);
    if (course) return <CourseDetail course={course} onBack={() => setOpenCourseId(null)} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Cursos & Devocionais</h1>
          <p className="text-sm text-white/60">Cursos em vídeo com módulos e aulas. Clique em um para gerenciar aulas.</p>
        </div>
        <button onClick={() => setEditingCourse("new")} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#3B5BFD] to-[#7C3AED] px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          <Plus className="h-4 w-4" /> Novo curso
        </button>
      </div>

      {isLoading ? (
        <GlassCard className="p-10 text-center text-white/60">Carregando…</GlassCard>
      ) : courses.length === 0 ? (
        <GlassCard className="p-10 text-center text-white/60">
          <GraduationCap className="mx-auto mb-3 h-8 w-8 opacity-50" /> Nenhum curso ainda.
        </GlassCard>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => (
            <GlassCard key={c.id} className="overflow-hidden p-0">
              <button onClick={() => setOpenCourseId(c.id)} className="block w-full text-left">
                <div className="h-32 w-full bg-gradient-to-br from-violet-500 to-fuchsia-500">
                  {c.cover_url && <img src={c.cover_url} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-2">
                    {c.badge && <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-white/70">{c.badge}</span>}
                    {c.status !== "active" && <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300">{c.status}</span>}
                  </div>
                  <h3 className="mt-2 truncate text-base font-semibold text-white">{c.title}</h3>
                  <p className="line-clamp-2 text-xs text-white/60">{c.subtitle}</p>
                  <p className="mt-2 text-[11px] text-white/40">{c.days} dias · {c.modules} módulo(s) · {c.kind}</p>
                </div>
              </button>
              <div className="flex border-t border-white/5">
                <button onClick={() => setEditingCourse(c)} className="flex-1 px-3 py-2 text-xs text-white/80 hover:bg-white/5">Editar</button>
                <button onClick={() => { if (confirm(`Excluir "${c.title}" e suas aulas?`)) delMutation.mutate(c); }} className="px-3 py-2 text-rose-300 hover:bg-rose-500/10"><Trash2 className="h-4 w-4" /></button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {editingCourse && (
        <CourseEditor
          course={editingCourse === "new" ? null : editingCourse}
          onClose={() => setEditingCourse(null)}
          onSaved={() => { setEditingCourse(null); qc.invalidateQueries({ queryKey: ["adm-courses"] }); }}
        />
      )}
    </div>
  );
}

function CourseDetail({ course, onBack }: { course: Course; onBack: () => void }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Lesson | "new" | null>(null);
  const { data: lessons = [], isLoading } = useQuery({ queryKey: ["adm-lessons", course.id], queryFn: () => listLessons(course.id) });

  const grouped = useMemo(() => {
    const map = new Map<number, Lesson[]>();
    for (const l of lessons) {
      if (!map.has(l.module_index)) map.set(l.module_index, []);
      map.get(l.module_index)!.push(l);
    }
    return [...map.entries()].sort(([a], [b]) => a - b);
  }, [lessons]);

  const delMutation = useMutation({
    mutationFn: async (l: Lesson) => {
      if (l.video_url) {
        const path = l.video_url.split("/course-videos/")[1];
        if (path) await supabase.storage.from("course-videos").remove([path]);
      }
      const { error } = await supabase.from("course_lessons").delete().eq("id", l.id);
      if (error) throw new Error(error.message);
      await logAdminAction("lesson.delete", { resourceType: "lesson", resourceId: l.id, metadata: { title: l.title } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adm-lessons", course.id] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <button onClick={onBack} className="mb-2 inline-flex items-center gap-1 text-xs text-white/60 hover:text-white"><ChevronLeft className="h-4 w-4" /> Voltar</button>
          <h1 className="text-2xl font-semibold text-white">{course.title}</h1>
          <p className="text-sm text-white/60">{course.modules} módulo(s) · {course.days} dias</p>
        </div>
        <button onClick={() => setEditing("new")} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#3B5BFD] to-[#7C3AED] px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          <Plus className="h-4 w-4" /> Nova aula
        </button>
      </div>

      {isLoading ? (
        <GlassCard className="p-10 text-center text-white/60">Carregando…</GlassCard>
      ) : lessons.length === 0 ? (
        <GlassCard className="p-10 text-center text-white/60">Nenhuma aula. Clique em <b>Nova aula</b>.</GlassCard>
      ) : (
        <div className="space-y-4">
          {grouped.map(([mod, list]) => (
            <GlassCard key={mod} className="p-4">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/70">Módulo {mod}</h3>
              <div className="grid gap-2">
                {list.map((l) => (
                  <div key={l.id} className="flex items-center gap-3 rounded-xl bg-white/5 p-3 hover:bg-white/10">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
                      <PlayCircle className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">Aula {l.lesson_index} — {l.title}</p>
                      <p className="truncate text-xs text-white/50">{fmt(l.duration_seconds)} {l.video_url ? "" : "· sem vídeo"}</p>
                    </div>
                    <button onClick={() => setEditing(l)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10">Editar</button>
                    <button onClick={() => { if (confirm(`Excluir "${l.title}"?`)) delMutation.mutate(l); }} className="rounded-lg p-2 text-rose-300 hover:bg-rose-500/10"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {editing && (
        <LessonEditor
          courseId={course.id}
          lesson={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["adm-lessons", course.id] }); }}
        />
      )}
    </div>
  );
}

function slugify(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function CourseEditor({ course, onClose, onSaved }: { course: Course | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !course;
  const [form, setForm] = useState({
    slug: course?.slug ?? "",
    title: course?.title ?? "",
    subtitle: course?.subtitle ?? "",
    badge: course?.badge ?? "",
    cover_url: course?.cover_url ?? "",
    days: course?.days ?? 7,
    modules: course?.modules ?? 1,
    sort_order: course?.sort_order ?? 0,
    status: (course?.status ?? "active") as Course["status"],
    kind: (course?.kind ?? "devocional") as Course["kind"],
    required_product_id: (course as any)?.required_product_id ?? "",
  });
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { data: products = [] } = useQuery({
    queryKey: ["adm-products-mini"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name").order("name");
      if (error) throw new Error(error.message);
      return data as { id: string; name: string }[];
    },
  });

  async function uploadCover(file: File) {
    setErr(null); setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `covers/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("course-videos").upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type || undefined });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("course-videos").getPublicUrl(path);
      setForm((f) => ({ ...f, cover_url: pub.publicUrl }));
    } catch (e) { setErr((e as Error).message); }
    finally { setUploading(false); }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Título é obrigatório.");
      const slug = (form.slug || slugify(form.title)).trim();
      if (!slug) throw new Error("Slug inválido.");
      const payload = {
        slug,
        title: form.title.trim(),
        subtitle: form.subtitle.trim() || null,
        badge: form.badge.trim() || null,
        cover_url: form.cover_url || null,
        days: Number(form.days) || 0,
        modules: Number(form.modules) || 0,
        sort_order: Number(form.sort_order) || 0,
        status: form.status,
        kind: form.kind,
        required_product_id: form.required_product_id || null,
      };
      if (isNew) {
        const { data, error } = await supabase.from("courses").insert(payload).select().single();
        if (error) throw new Error(error.message);
        await logAdminAction("course.create", { resourceType: "course", resourceId: data.id, metadata: { title: data.title } });
      } else {
        const { error } = await supabase.from("courses").update(payload).eq("id", course!.id);
        if (error) throw new Error(error.message);
        await logAdminAction("course.update", { resourceType: "course", resourceId: course!.id, metadata: { title: payload.title } });
      }
    },
    onSuccess: onSaved,
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="adm-glass-dark relative h-full w-full max-w-xl overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{isNew ? "Novo curso" : "Editar curso"}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4">
          <label className="block text-xs">
            <span className="mb-1 block text-white/60">Título</span>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value, slug: form.slug || slugify(e.target.value) })} className="adm-input w-full" />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block text-white/60">Slug</span>
            <input value={form.slug} onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })} className="adm-input w-full" />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block text-white/60">Subtítulo</span>
            <input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} className="adm-input w-full" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs">
              <span className="mb-1 block text-white/60">Tipo</span>
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Course["kind"] })} className="adm-input w-full">
                <option value="devocional">Devocional</option>
                <option value="curso">Curso</option>
              </select>
            </label>
            <label className="block text-xs">
              <span className="mb-1 block text-white/60">Status</span>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Course["status"] })} className="adm-input w-full">
                <option value="active">Ativo</option>
                <option value="draft">Rascunho</option>
                <option value="archived">Arquivado</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <label className="block text-xs">
              <span className="mb-1 block text-white/60">Dias</span>
              <input type="number" value={form.days} onChange={(e) => setForm({ ...form, days: Number(e.target.value) })} className="adm-input w-full" />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block text-white/60">Módulos</span>
              <input type="number" value={form.modules} onChange={(e) => setForm({ ...form, modules: Number(e.target.value) })} className="adm-input w-full" />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block text-white/60">Etiqueta</span>
              <input value={form.badge} onChange={(e) => setForm({ ...form, badge: e.target.value })} className="adm-input w-full" />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block text-white/60">Ordem</span>
              <input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} className="adm-input w-full" />
            </label>
          </div>
          <div>
            <span className="mb-1 block text-xs text-white/60">Capa</span>
            <div className="flex items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10">
                <Upload className="h-4 w-4" /> {uploading ? "Enviando…" : "Enviar capa"}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCover(f); }} />
              </label>
              {form.cover_url && <img src={form.cover_url} alt="" className="h-14 w-20 rounded object-cover" />}
            </div>
            <input value={form.cover_url} onChange={(e) => setForm({ ...form, cover_url: e.target.value })} placeholder="ou URL" className="adm-input mt-2 w-full text-xs" />
          </div>
          <label className="block text-xs">
            <span className="mb-1 block text-white/60">Produto necessário (gating)</span>
            <select value={form.required_product_id} onChange={(e) => setForm({ ...form, required_product_id: e.target.value })} className="adm-input w-full">
              <option value="">Nenhum (acesso livre)</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <p className="mt-1 text-white/40">Quando preenchido, só alunos com entitlement ativo desse produto destravam o devocional.</p>
          </label>
          {err && <div className="flex items-center gap-2 rounded-lg bg-rose-500/10 p-3 text-xs text-rose-200"><AlertCircle className="h-4 w-4" /> {err}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-white/70 hover:bg-white/5">Cancelar</button>
            <button disabled={saveMutation.isPending || uploading} onClick={() => saveMutation.mutate()} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#3B5BFD] to-[#7C3AED] px-4 py-2 text-sm font-medium text-white shadow-lg disabled:opacity-40">
              <Save className="h-4 w-4" /> {saveMutation.isPending ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LessonEditor({ courseId, lesson, onClose, onSaved }: { courseId: string; lesson: Lesson | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !lesson;
  const [form, setForm] = useState({
    module_index: lesson?.module_index ?? 1,
    lesson_index: lesson?.lesson_index ?? 1,
    title: lesson?.title ?? "",
    description: lesson?.description ?? "",
    video_url: lesson?.video_url ?? "",
    duration_seconds: lesson?.duration_seconds ?? 0,
    sort_order: lesson?.sort_order ?? 0,
  });
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function uploadVideo(file: File) {
    setErr(null); setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "mp4";
      const path = `${courseId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("course-videos").upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type || "video/mp4" });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("course-videos").getPublicUrl(path);
      const video = document.createElement("video");
      video.src = pub.publicUrl;
      await new Promise<void>((res) => {
        video.addEventListener("loadedmetadata", () => res(), { once: true });
        video.addEventListener("error", () => res(), { once: true });
        setTimeout(() => res(), 5000);
      });
      setForm((f) => ({ ...f, video_url: pub.publicUrl, duration_seconds: Number.isFinite(video.duration) ? Math.round(video.duration) : f.duration_seconds }));
    } catch (e) { setErr((e as Error).message); }
    finally { setUploading(false); }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Título é obrigatório.");
      const payload = {
        course_id: courseId,
        module_index: Number(form.module_index) || 1,
        lesson_index: Number(form.lesson_index) || 1,
        title: form.title.trim(),
        description: form.description.trim() || null,
        video_url: form.video_url || null,
        duration_seconds: Number(form.duration_seconds) || 0,
        sort_order: Number(form.sort_order) || 0,
      };
      if (isNew) {
        const { data, error } = await supabase.from("course_lessons").insert(payload).select().single();
        if (error) throw new Error(error.message);
        await logAdminAction("lesson.create", { resourceType: "lesson", resourceId: data.id, metadata: { title: data.title } });
      } else {
        const { error } = await supabase.from("course_lessons").update(payload).eq("id", lesson!.id);
        if (error) throw new Error(error.message);
        await logAdminAction("lesson.update", { resourceType: "lesson", resourceId: lesson!.id, metadata: { title: payload.title } });
      }
    },
    onSuccess: onSaved,
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="adm-glass-dark relative h-full w-full max-w-xl overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{isNew ? "Nova aula" : "Editar aula"}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <label className="block text-xs">
              <span className="mb-1 block text-white/60">Módulo</span>
              <input type="number" value={form.module_index} onChange={(e) => setForm({ ...form, module_index: Number(e.target.value) })} className="adm-input w-full" />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block text-white/60">Aula</span>
              <input type="number" value={form.lesson_index} onChange={(e) => setForm({ ...form, lesson_index: Number(e.target.value) })} className="adm-input w-full" />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block text-white/60">Ordem</span>
              <input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} className="adm-input w-full" />
            </label>
          </div>
          <label className="block text-xs">
            <span className="mb-1 block text-white/60">Título</span>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="adm-input w-full" />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block text-white/60">Descrição</span>
            <textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="adm-input w-full resize-y" />
          </label>
          <div>
            <span className="mb-1 block text-xs text-white/60">Vídeo</span>
            <div className="flex items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10">
                <Upload className="h-4 w-4" /> {uploading ? "Enviando…" : "Enviar vídeo"}
                <input type="file" accept="video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadVideo(f); }} />
              </label>
              {form.video_url && <video src={form.video_url} controls className="h-16 rounded" />}
            </div>
            <input value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} placeholder="ou URL (YouTube, Vimeo, mp4)" className="adm-input mt-2 w-full text-xs" />
          </div>
          <label className="block text-xs">
            <span className="mb-1 block text-white/60">Duração (segundos)</span>
            <input type="number" value={form.duration_seconds} onChange={(e) => setForm({ ...form, duration_seconds: Number(e.target.value) })} className="adm-input w-full" />
          </label>
          {err && <div className="flex items-center gap-2 rounded-lg bg-rose-500/10 p-3 text-xs text-rose-200"><AlertCircle className="h-4 w-4" /> {err}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-white/70 hover:bg-white/5">Cancelar</button>
            <button disabled={saveMutation.isPending || uploading} onClick={() => saveMutation.mutate()} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#3B5BFD] to-[#7C3AED] px-4 py-2 text-sm font-medium text-white shadow-lg disabled:opacity-40">
              <Save className="h-4 w-4" /> {saveMutation.isPending ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}