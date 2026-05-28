import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Trash2, Save, X, Upload, Play, Pause, Sun, Moon, Sparkles, AlertCircle, Headphones,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/admin/GlassCard";
import { logAdminAction } from "@/lib/admin/audit";

export const Route = createFileRoute("/admin/audios")({
  component: AdminAudiosPage,
});

type Product = { id: string; name: string; slug: string; status: string };
type Track = {
  id: string;
  product_id: string;
  day: number;
  kind: "despertar" | "aquietar" | "bonus";
  title: string;
  subtitle: string | null;
  duration_seconds: number;
  audio_url: string | null;
  transcript: string | null;
  sort_order: number;
  is_free_preview: boolean;
};

const KIND_META = {
  despertar: { label: "Despertar", icon: Sun,      color: "from-amber-400 to-rose-400" },
  aquietar:  { label: "Aquietar",  icon: Moon,     color: "from-indigo-400 to-violet-500" },
  bonus:     { label: "Bônus",     icon: Sparkles, color: "from-emerald-400 to-teal-500" },
} as const;

function fmtDuration(s: number) {
  if (!s) return "0:00";
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, "0");
  return `${m}:${ss}`;
}

async function listProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products").select("id,name,slug,status").order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function listTracks(productId: string): Promise<Track[]> {
  const { data, error } = await supabase
    .from("audio_tracks").select("*").eq("product_id", productId)
    .order("day").order("kind").order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as Track[];
}

function AdminAudiosPage() {
  const qc = useQueryClient();
  const [productId, setProductId] = useState<string>("");
  const [editing, setEditing] = useState<Track | "new" | null>(null);

  const { data: products = [] } = useQuery({ queryKey: ["adm-products-list"], queryFn: listProducts });

  useEffect(() => {
    if (!productId && products.length > 0) setProductId(products[0].id);
  }, [products, productId]);

  const { data: tracks = [], isLoading, error } = useQuery({
    queryKey: ["adm-tracks", productId],
    queryFn: () => listTracks(productId),
    enabled: !!productId,
  });

  const grouped = useMemo(() => {
    const map = new Map<number, Track[]>();
    for (const t of tracks) {
      if (!map.has(t.day)) map.set(t.day, []);
      map.get(t.day)!.push(t);
    }
    return [...map.entries()].sort(([a], [b]) => a - b);
  }, [tracks]);

  const delMutation = useMutation({
    mutationFn: async (track: Track) => {
      if (track.audio_url) {
        const path = track.audio_url.split("/method-audios/")[1];
        if (path) await supabase.storage.from("method-audios").remove([path]);
      }
      const { error } = await supabase.from("audio_tracks").delete().eq("id", track.id);
      if (error) throw new Error(error.message);
      await logAdminAction("audio_track.delete", { resourceType: "audio_track", resourceId: track.id, metadata: { title: track.title } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adm-tracks", productId] }),
  });

  const selectedProduct = products.find((p) => p.id === productId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Áudios do Método</h1>
          <p className="text-sm text-white/60">Faixas de Despertar, Aquietar e bônus por produto e dia.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="adm-input min-w-[220px]"
          >
            {products.length === 0 && <option value="">Nenhum produto</option>}
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name} {p.status !== "active" ? `(${p.status})` : ""}</option>
            ))}
          </select>
          <button
            disabled={!productId}
            onClick={() => setEditing("new")}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#3B5BFD] to-[#7C3AED] px-4 py-2.5 text-sm font-medium text-white shadow-lg disabled:opacity-40"
          >
            <Plus className="h-4 w-4" /> Nova faixa
          </button>
        </div>
      </div>

      {error && (
        <GlassCard className="flex items-center gap-3 border-rose-500/30 p-4 text-rose-200">
          <AlertCircle className="h-5 w-5" /> {(error as Error).message}
        </GlassCard>
      )}

      {!productId ? (
        <GlassCard className="p-10 text-center text-white/60">
          Cadastre um produto em <b>Produtos & Kirvano</b> antes de subir áudios.
        </GlassCard>
      ) : isLoading ? (
        <GlassCard className="p-10 text-center text-white/60">Carregando faixas…</GlassCard>
      ) : tracks.length === 0 ? (
        <GlassCard className="p-10 text-center text-white/60">
          <Headphones className="mx-auto mb-3 h-8 w-8 opacity-50" />
          Nenhuma faixa em <b>{selectedProduct?.name}</b>. Clique em <b>Nova faixa</b>.
        </GlassCard>
      ) : (
        <div className="space-y-4">
          {grouped.map(([day, items]) => (
            <GlassCard key={day} className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-white/70">Dia {day}</h3>
                <span className="text-xs text-white/40">{items.length} faixa(s)</span>
              </div>
              <div className="grid gap-2">
                {items.map((t) => {
                  const meta = KIND_META[t.kind];
                  const Icon = meta.icon;
                  return (
                    <div key={t.id} className="flex items-center gap-3 rounded-xl bg-white/5 p-3 hover:bg-white/10">
                      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br ${meta.color} text-white`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">{t.title}</p>
                        <p className="truncate text-xs text-white/50">
                          {meta.label} · {fmtDuration(t.duration_seconds)}
                          {t.audio_url ? "" : " · sem áudio"}
                          {t.subtitle ? ` · ${t.subtitle}` : ""}
                        </p>
                      </div>
                      {t.audio_url && <MiniPlayer src={t.audio_url} />}
                      <button
                        onClick={() => setEditing(t)}
                        className="rounded-lg px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10"
                      >Editar</button>
                      <button
                        onClick={() => {
                          if (confirm(`Excluir "${t.title}"?`)) delMutation.mutate(t);
                        }}
                        className="rounded-lg p-2 text-rose-300 hover:bg-rose-500/10"
                      ><Trash2 className="h-4 w-4" /></button>
                    </div>
                  );
                })}
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {editing && productId && (
        <TrackEditor
          productId={productId}
          track={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["adm-tracks", productId] });
          }}
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
      <button
        onClick={() => {
          const a = ref.current; if (!a) return;
          if (playing) { a.pause(); setPlaying(false); }
          else { a.play(); setPlaying(true); }
        }}
        className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </button>
    </>
  );
}

function TrackEditor({
  productId, track, onClose, onSaved,
}: { productId: string; track: Track | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !track;
  const [form, setForm] = useState({
    day: track?.day ?? 1,
    kind: (track?.kind ?? "despertar") as Track["kind"],
    title: track?.title ?? "",
    subtitle: track?.subtitle ?? "",
    duration_seconds: track?.duration_seconds ?? 0,
    audio_url: track?.audio_url ?? "",
    transcript: track?.transcript ?? "",
    sort_order: track?.sort_order ?? 0,
    is_free_preview: track?.is_free_preview ?? false,
  });
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleFile(file: File) {
    setErr(null); setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "mp3";
      const path = `${productId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("method-audios").upload(path, file, {
        cacheControl: "3600", upsert: false, contentType: file.type || "audio/mpeg",
      });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("method-audios").getPublicUrl(path);
      // tenta inferir duração
      const audio = new Audio(pub.publicUrl);
      await new Promise<void>((res) => {
        audio.addEventListener("loadedmetadata", () => res(), { once: true });
        audio.addEventListener("error", () => res(), { once: true });
        setTimeout(() => res(), 4000);
      });
      setForm((f) => ({
        ...f,
        audio_url: pub.publicUrl,
        duration_seconds: Number.isFinite(audio.duration) ? Math.round(audio.duration) : f.duration_seconds,
      }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Título é obrigatório.");
      const payload = {
        product_id: productId,
        day: Number(form.day),
        kind: form.kind,
        title: form.title.trim(),
        subtitle: form.subtitle.trim() || null,
        duration_seconds: Number(form.duration_seconds) || 0,
        audio_url: form.audio_url || null,
        transcript: form.transcript || null,
        sort_order: Number(form.sort_order) || 0,
        is_free_preview: form.is_free_preview,
      };
      if (isNew) {
        const { data, error } = await supabase.from("audio_tracks").insert(payload).select().single();
        if (error) throw new Error(error.message);
        await logAdminAction("audio_track.create", { resourceType: "audio_track", resourceId: data.id, metadata: { title: data.title } });
      } else {
        const { error } = await supabase.from("audio_tracks").update(payload).eq("id", track!.id);
        if (error) throw new Error(error.message);
        await logAdminAction("audio_track.update", { resourceType: "audio_track", resourceId: track!.id, metadata: { title: payload.title } });
      }
    },
    onSuccess: onSaved,
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="adm-glass-dark relative h-full w-full max-w-xl overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{isNew ? "Nova faixa" : "Editar faixa"}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <label className="block text-xs">
              <span className="mb-1 block text-white/60">Dia</span>
              <input type="number" min={1} max={31} value={form.day}
                onChange={(e) => setForm({ ...form, day: Number(e.target.value) })} className="adm-input w-full" />
            </label>
            <label className="col-span-2 block text-xs">
              <span className="mb-1 block text-white/60">Tipo</span>
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Track["kind"] })} className="adm-input w-full">
                <option value="despertar">Despertar (manhã)</option>
                <option value="aquietar">Aquietar (noite)</option>
                <option value="bonus">Bônus</option>
              </select>
            </label>
          </div>

          <label className="block text-xs">
            <span className="mb-1 block text-white/60">Título</span>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Ex.: Renovação Neural — Dia 1" className="adm-input w-full" />
          </label>

          <label className="block text-xs">
            <span className="mb-1 block text-white/60">Subtítulo (opcional)</span>
            <input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
              placeholder="Ex.: Reconhecer o padrão" className="adm-input w-full" />
          </label>

          <div>
            <span className="mb-1 block text-xs text-white/60">Arquivo de áudio</span>
            <div className="flex items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10">
                <Upload className="h-4 w-4" />
                {uploading ? "Enviando…" : "Enviar arquivo"}
                <input type="file" accept="audio/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </label>
              {form.audio_url && <audio src={form.audio_url} controls className="h-8 max-w-[260px]" />}
            </div>
            <input
              value={form.audio_url}
              onChange={(e) => setForm({ ...form, audio_url: e.target.value })}
              placeholder="ou cole uma URL"
              className="adm-input mt-2 w-full text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs">
              <span className="mb-1 block text-white/60">Duração (segundos)</span>
              <input type="number" min={0} value={form.duration_seconds}
                onChange={(e) => setForm({ ...form, duration_seconds: Number(e.target.value) })} className="adm-input w-full" />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block text-white/60">Ordem</span>
              <input type="number" value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} className="adm-input w-full" />
            </label>
          </div>

          <label className="block text-xs">
            <span className="mb-1 block text-white/60">Transcrição / notas (opcional)</span>
            <textarea value={form.transcript} onChange={(e) => setForm({ ...form, transcript: e.target.value })}
              rows={5} className="adm-input w-full resize-y" />
          </label>

          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/80">
            <input
              type="checkbox"
              checked={form.is_free_preview}
              onChange={(e) => setForm({ ...form, is_free_preview: e.target.checked })}
              className="h-4 w-4 accent-emerald-400"
            />
            <span>
              <b>Prévia grátis</b> — libera essa faixa para todos os usuários autenticados, mesmo sem ter comprado o produto.
            </span>
          </label>

          {err && (
            <div className="flex items-center gap-2 rounded-lg bg-rose-500/10 p-3 text-xs text-rose-200">
              <AlertCircle className="h-4 w-4" /> {err}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-white/70 hover:bg-white/5">Cancelar</button>
            <button
              disabled={saveMutation.isPending || uploading}
              onClick={() => saveMutation.mutate()}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#3B5BFD] to-[#7C3AED] px-4 py-2 text-sm font-medium text-white shadow-lg disabled:opacity-40"
            >
              <Save className="h-4 w-4" /> {saveMutation.isPending ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}