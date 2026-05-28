import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Save, X, Upload, Play, Pause, AlertCircle, Music2, UploadCloud, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/admin/GlassCard";
import { logAdminAction } from "@/lib/admin/audit";

export const Route = createFileRoute("/admin/louvores")({
  component: AdminLouvoresPage,
});

type Louvor = {
  id: string;
  book: string;
  chapter_index: number;
  title: string;
  subtitle: string | null;
  duration_seconds: number;
  audio_url: string | null;
  is_bonus: boolean;
  sort_order: number;
};

const BOOKS = [
  { key: "salmos", label: "Salmos" },
  { key: "proverbios", label: "Provérbios" },
  { key: "tessalonicenses", label: "1 Tessalonicenses" },
  { key: "colossenses", label: "Colossenses" },
];

function fmt(s: number) {
  if (!s) return "0:00";
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

async function listLouvores(): Promise<Louvor[]> {
  const { data, error } = await supabase
    .from("louvores").select("*").order("book").order("sort_order").order("chapter_index");
  if (error) throw new Error(error.message);
  return (data ?? []) as Louvor[];
}

function AdminLouvoresPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Louvor | "new" | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bookFilter, setBookFilter] = useState<string>("all");

  const { data: items = [], isLoading, error } = useQuery({ queryKey: ["adm-louvores"], queryFn: listLouvores });

  const grouped = useMemo(() => {
    const filtered = bookFilter === "all" ? items : items.filter((i) => i.book === bookFilter);
    const map = new Map<string, Louvor[]>();
    for (const i of filtered) {
      if (!map.has(i.book)) map.set(i.book, []);
      map.get(i.book)!.push(i);
    }
    return [...map.entries()];
  }, [items, bookFilter]);

  const delMutation = useMutation({
    mutationFn: async (l: Louvor) => {
      if (l.audio_url) {
        const path = l.audio_url.split("/louvores-audios/")[1];
        if (path) await supabase.storage.from("louvores-audios").remove([path]);
      }
      const { error } = await supabase.from("louvores").delete().eq("id", l.id);
      if (error) throw new Error(error.message);
      await logAdminAction("louvor.delete", { resourceType: "louvor", resourceId: l.id, metadata: { title: l.title } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adm-louvores"] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Louvores do Reino</h1>
          <p className="text-sm text-white/60">Faixas organizadas por livro bíblico. Marque Salmos como bônus gratuito se quiser.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={bookFilter} onChange={(e) => setBookFilter(e.target.value)} className="adm-input min-w-[200px]">
            <option value="all">Todos os livros</option>
            {BOOKS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
          </select>
          <button onClick={() => setBulkOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-[rgba(201,169,110,0.30)] bg-[rgba(201,169,110,0.08)] px-4 py-2.5 text-sm font-semibold text-[var(--adm-gold-light)] backdrop-blur-md hover:bg-[rgba(201,169,110,0.16)]">
            <UploadCloud className="h-4 w-4" /> Upload em massa
          </button>
          <button onClick={() => setEditing("new")} className="adm-btn-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm">
            <Plus className="h-4 w-4" /> Nova faixa
          </button>
        </div>
      </div>

      {error && <GlassCard className="flex items-center gap-3 border-rose-500/30 p-4 text-rose-200"><AlertCircle className="h-5 w-5" /> {(error as Error).message}</GlassCard>}

      {isLoading ? (
        <GlassCard className="p-10 text-center text-white/60">Carregando…</GlassCard>
      ) : grouped.length === 0 ? (
        <GlassCard className="p-10 text-center text-white/60">
          <Music2 className="mx-auto mb-3 h-8 w-8 opacity-50" />
          Nenhuma faixa ainda. Clique em <b>Nova faixa</b>.
        </GlassCard>
      ) : (
        <div className="space-y-4">
          {grouped.map(([book, list]) => (
            <GlassCard key={book} className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-white/70">{BOOKS.find((b) => b.key === book)?.label ?? book}</h3>
                <span className="text-xs text-white/40">{list.length} faixa(s)</span>
              </div>
              <div className="grid gap-2">
                {list.map((l) => (
                  <div key={l.id} className="flex items-center gap-3 rounded-xl bg-white/5 p-3 hover:bg-white/10">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#D4B06A] to-[#B8952E] text-[#07090f]">
                      <Music2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">
                        {l.title} {l.is_bonus && <span className="ml-1 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300">BÔNUS</span>}
                      </p>
                      <p className="truncate text-xs text-white/50">
                        Cap. {l.chapter_index} · {fmt(l.duration_seconds)} {l.audio_url ? "" : "· sem áudio"} {l.subtitle ? `· ${l.subtitle}` : ""}
                      </p>
                    </div>
                    {l.audio_url && <MiniPlayer src={l.audio_url} />}
                    <button onClick={() => setEditing(l)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10">Editar</button>
                    <button onClick={() => { if (confirm(`Excluir "${l.title}"?`)) delMutation.mutate(l); }} className="rounded-lg p-2 text-rose-300 hover:bg-rose-500/10">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {editing && (
        <LouvorEditor
          louvor={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["adm-louvores"] }); }}
        />
      )}
      {bulkOpen && (
        <BulkUploader
          existing={items}
          onClose={() => setBulkOpen(false)}
          onDone={() => { setBulkOpen(false); qc.invalidateQueries({ queryKey: ["adm-louvores"] }); }}
        />
      )}
    </div>
  );
}

function MiniPlayer({ src }: { src: string }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  return (
    <>
      <audio ref={ref} src={src} onEnded={() => setPlaying(false)} preload="none" />
      <button onClick={() => { const a = ref.current; if (!a) return; if (playing) { a.pause(); setPlaying(false); } else { a.play(); setPlaying(true); } }} className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20">
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </button>
    </>
  );
}

function LouvorEditor({ louvor, onClose, onSaved }: { louvor: Louvor | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !louvor;
  const [form, setForm] = useState({
    book: louvor?.book ?? "salmos",
    chapter_index: louvor?.chapter_index ?? 1,
    title: louvor?.title ?? "",
    subtitle: louvor?.subtitle ?? "",
    duration_seconds: louvor?.duration_seconds ?? 0,
    audio_url: louvor?.audio_url ?? "",
    is_bonus: louvor?.is_bonus ?? false,
    sort_order: louvor?.sort_order ?? 0,
  });
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleFile(file: File) {
    setErr(null); setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "mp3";
      const path = `${form.book}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("louvores-audios").upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type || "audio/mpeg" });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("louvores-audios").getPublicUrl(path);
      const audio = new Audio(pub.publicUrl);
      await new Promise<void>((res) => {
        audio.addEventListener("loadedmetadata", () => res(), { once: true });
        audio.addEventListener("error", () => res(), { once: true });
        setTimeout(() => res(), 4000);
      });
      setForm((f) => ({ ...f, audio_url: pub.publicUrl, duration_seconds: Number.isFinite(audio.duration) ? Math.round(audio.duration) : f.duration_seconds }));
    } catch (e) { setErr((e as Error).message); }
    finally { setUploading(false); }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Título é obrigatório.");
      const payload = {
        book: form.book,
        chapter_index: Number(form.chapter_index) || 0,
        title: form.title.trim(),
        subtitle: form.subtitle.trim() || null,
        duration_seconds: Number(form.duration_seconds) || 0,
        audio_url: form.audio_url || null,
        is_bonus: !!form.is_bonus,
        sort_order: Number(form.sort_order) || 0,
      };
      if (isNew) {
        const { data, error } = await supabase.from("louvores").insert(payload).select().single();
        if (error) throw new Error(error.message);
        await logAdminAction("louvor.create", { resourceType: "louvor", resourceId: data.id, metadata: { title: data.title } });
      } else {
        const { error } = await supabase.from("louvores").update(payload).eq("id", louvor!.id);
        if (error) throw new Error(error.message);
        await logAdminAction("louvor.update", { resourceType: "louvor", resourceId: louvor!.id, metadata: { title: payload.title } });
      }
    },
    onSuccess: onSaved,
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="adm-glass-dark relative h-full w-full max-w-xl overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{isNew ? "Nova faixa" : "Editar faixa"}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <label className="col-span-2 block text-xs">
              <span className="mb-1 block text-white/60">Livro</span>
              <select value={form.book} onChange={(e) => setForm({ ...form, book: e.target.value })} className="adm-input w-full">
                {BOOKS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
              </select>
            </label>
            <label className="block text-xs">
              <span className="mb-1 block text-white/60">Capítulo</span>
              <input type="number" value={form.chapter_index} onChange={(e) => setForm({ ...form, chapter_index: Number(e.target.value) })} className="adm-input w-full" />
            </label>
          </div>
          <label className="block text-xs">
            <span className="mb-1 block text-white/60">Título</span>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Salmos 23 — O Senhor é Meu Pastor" className="adm-input w-full" />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block text-white/60">Subtítulo (opcional)</span>
            <input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} placeholder="Ex.: Espaço TNB" className="adm-input w-full" />
          </label>
          <div>
            <span className="mb-1 block text-xs text-white/60">Arquivo de áudio</span>
            <div className="flex items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10">
                <Upload className="h-4 w-4" /> {uploading ? "Enviando…" : "Enviar arquivo"}
                <input type="file" accept="audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </label>
              {form.audio_url && <audio src={form.audio_url} controls className="h-8 max-w-[260px]" />}
            </div>
            <input value={form.audio_url} onChange={(e) => setForm({ ...form, audio_url: e.target.value })} placeholder="ou cole uma URL" className="adm-input mt-2 w-full text-xs" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="block text-xs">
              <span className="mb-1 block text-white/60">Duração (s)</span>
              <input type="number" value={form.duration_seconds} onChange={(e) => setForm({ ...form, duration_seconds: Number(e.target.value) })} className="adm-input w-full" />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block text-white/60">Ordem</span>
              <input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} className="adm-input w-full" />
            </label>
            <label className="flex items-end gap-2 text-xs text-white/70">
              <input type="checkbox" checked={form.is_bonus} onChange={(e) => setForm({ ...form, is_bonus: e.target.checked })} className="h-4 w-4 accent-emerald-400" />
              Bônus grátis
            </label>
          </div>
          {err && <div className="flex items-center gap-2 rounded-lg bg-rose-500/10 p-3 text-xs text-rose-200"><AlertCircle className="h-4 w-4" /> {err}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-white/70 hover:bg-white/5">Cancelar</button>
            <button disabled={saveMutation.isPending || uploading} onClick={() => saveMutation.mutate()} className="adm-btn-primary inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm disabled:opacity-40">
              <Save className="h-4 w-4" /> {saveMutation.isPending ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * BulkUploader — upload em massa por livro (Salmos, Provérbios…)
 * Cada arquivo vira uma faixa. Título inferido do filename.
 * chapter_index e sort_order são auto-incrementados.
 * ============================================================ */
function BulkUploader({
  existing,
  onClose,
  onDone,
}: {
  existing: Louvor[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [book, setBook] = useState<string>("salmos");
  const [files, setFiles] = useState<File[]>([]);
  const [isBonus, setIsBonus] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Array<{ name: string; status: "pending" | "ok" | "error"; msg?: string }>>([]);
  const [err, setErr] = useState<string | null>(null);

  const nextChapter = useMemo(() => {
    const inBook = existing.filter((l) => l.book === book);
    const max = inBook.reduce((m, l) => Math.max(m, l.chapter_index || 0), 0);
    return max + 1;
  }, [existing, book]);

  function pickFiles(list: FileList | null) {
    if (!list) return;
    const arr = Array.from(list).filter((f) => f.type.startsWith("audio/") || /\.(mp3|wav|m4a|aac|ogg)$/i.test(f.name));
    setFiles(arr);
    setProgress(arr.map((f) => ({ name: f.name, status: "pending" as const })));
  }

  function titleFromFilename(name: string) {
    return name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  }

  async function getDuration(url: string): Promise<number> {
    return new Promise((resolve) => {
      const a = new Audio(url);
      const done = (v: number) => resolve(Number.isFinite(v) ? Math.round(v) : 0);
      a.addEventListener("loadedmetadata", () => done(a.duration), { once: true });
      a.addEventListener("error", () => done(0), { once: true });
      setTimeout(() => done(0), 4000);
    });
  }

  async function runUpload() {
    if (files.length === 0) return;
    setRunning(true);
    setErr(null);
    let chapter = nextChapter;
    let sort = (existing.filter((l) => l.book === book).reduce((m, l) => Math.max(m, l.sort_order || 0), 0)) + 1;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const ext = file.name.split(".").pop() || "mp3";
        const path = `${book}/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage.from("louvores-audios").upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || "audio/mpeg",
        });
        if (up.error) throw up.error;
        const { data: pub } = supabase.storage.from("louvores-audios").getPublicUrl(path);
        const duration = await getDuration(pub.publicUrl);
        const payload = {
          book,
          chapter_index: chapter,
          title: titleFromFilename(file.name),
          subtitle: null,
          duration_seconds: duration,
          audio_url: pub.publicUrl,
          is_bonus: isBonus,
          sort_order: sort,
        };
        const { data, error } = await supabase.from("louvores").insert(payload).select().single();
        if (error) throw new Error(error.message);
        await logAdminAction("louvor.create", { resourceType: "louvor", resourceId: data.id, metadata: { title: data.title, bulk: true } });
        setProgress((prev) => prev.map((p, idx) => (idx === i ? { ...p, status: "ok" } : p)));
        chapter++;
        sort++;
      } catch (e) {
        setProgress((prev) => prev.map((p, idx) => (idx === i ? { ...p, status: "error", msg: (e as Error).message } : p)));
      }
    }
    setRunning(false);
  }

  const done = progress.filter((p) => p.status !== "pending").length;
  const allDone = files.length > 0 && done === files.length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="adm-glass-dark relative h-full w-full max-w-xl overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Upload em massa</h2>
            <p className="mt-1 text-xs text-white/60">Vários áudios de uma vez. Categorize por livro — Salmos, Provérbios, etc.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4">
          <label className="block text-xs">
            <span className="mb-1 block text-white/60">Livro / categoria</span>
            <select value={book} onChange={(e) => setBook(e.target.value)} disabled={running} className="adm-input w-full">
              {BOOKS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
            </select>
          </label>

          <label className="flex items-center gap-2 text-xs text-white/70">
            <input type="checkbox" checked={isBonus} onChange={(e) => setIsBonus(e.target.checked)} disabled={running} className="h-4 w-4 accent-[#C9A96E]" />
            Marcar todos como bônus grátis
          </label>

          <div>
            <span className="mb-2 block text-xs text-white/60">
              Arquivos de áudio (capítulos começam em <b className="text-[var(--adm-gold-light)]">{nextChapter}</b>)
            </span>
            <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-[rgba(201,169,110,0.30)] bg-[rgba(201,169,110,0.04)] p-6 text-center transition hover:bg-[rgba(201,169,110,0.08)]">
              <UploadCloud className="mx-auto mb-2 h-8 w-8 text-[var(--adm-gold-light)]" />
              <p className="text-sm font-medium">Clique para selecionar áudios</p>
              <p className="mt-1 text-xs text-white/50">.mp3, .wav, .m4a — múltiplos arquivos</p>
              <input
                type="file"
                accept="audio/*"
                multiple
                className="hidden"
                disabled={running}
                onChange={(e) => pickFiles(e.target.files)}
              />
            </label>
          </div>

          {progress.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="mb-2 flex items-center justify-between text-xs text-white/70">
                <span>{files.length} arquivo(s) selecionado(s)</span>
                {running && <span>{done}/{files.length} concluído(s)…</span>}
                {allDone && !running && <span className="text-[var(--adm-success)]">tudo pronto</span>}
              </div>
              <div className="max-h-[260px] space-y-1 overflow-y-auto pr-1">
                {progress.map((p, idx) => (
                  <div key={idx} className="flex items-center gap-2 truncate text-xs">
                    {p.status === "pending" && <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-white/30" />}
                    {p.status === "ok" && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[var(--adm-success)]" />}
                    {p.status === "error" && <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-300" />}
                    <span className="flex-1 truncate text-white/80">{p.name}</span>
                    {p.msg && <span className="truncate text-rose-300/80" title={p.msg}>erro</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {err && <div className="rounded-lg bg-rose-500/10 p-3 text-xs text-rose-200">{err}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} disabled={running} className="rounded-xl px-4 py-2 text-sm text-white/70 hover:bg-white/5 disabled:opacity-40">
              {allDone ? "Fechar" : "Cancelar"}
            </button>
            {!allDone && (
              <button
                onClick={runUpload}
                disabled={running || files.length === 0}
                className="adm-btn-primary inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm disabled:opacity-40"
              >
                <UploadCloud className="h-4 w-4" />
                {running ? `Enviando ${done + 1}/${files.length}…` : `Enviar ${files.length || ""} faixa(s)`}
              </button>
            )}
            {allDone && (
              <button onClick={onDone} className="adm-btn-primary inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm">
                <CheckCircle2 className="h-4 w-4" /> Concluir
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}