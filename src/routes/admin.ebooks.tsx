import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Save, X, Upload, AlertCircle, BookOpen, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/admin/GlassCard";
import { logAdminAction } from "@/lib/admin/audit";

export const Route = createFileRoute("/admin/ebooks")({
  component: AdminEbooksPage,
});

type Ebook = {
  id: string;
  title: string;
  subtitle: string | null;
  category: "bonus" | "colecao" | "embreve";
  price_cents: number;
  badge: string | null;
  cover_url: string | null;
  file_url: string | null;
  sort_order: number;
  status: "active" | "draft" | "archived";
  required_product_id: string | null;
};

const CAT_META = {
  bonus:   { label: "Bônus",   color: "from-emerald-400 to-teal-500" },
  colecao: { label: "Coleção", color: "from-violet-500 to-fuchsia-500" },
  embreve: { label: "Em breve", color: "from-slate-400 to-slate-600" },
} as const;

async function listEbooks(): Promise<Ebook[]> {
  const { data, error } = await supabase.from("ebooks").select("*").order("category").order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as Ebook[];
}

function AdminEbooksPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Ebook | "new" | null>(null);

  const { data: items = [], isLoading, error } = useQuery({ queryKey: ["adm-ebooks"], queryFn: listEbooks });

  const grouped = useMemo(() => {
    const map = new Map<Ebook["category"], Ebook[]>();
    for (const i of items) {
      if (!map.has(i.category)) map.set(i.category, []);
      map.get(i.category)!.push(i);
    }
    return [...map.entries()];
  }, [items]);

  const delMutation = useMutation({
    mutationFn: async (e: Ebook) => {
      for (const url of [e.cover_url, e.file_url]) {
        if (url) {
          const path = url.split("/ebooks-files/")[1];
          if (path) await supabase.storage.from("ebooks-files").remove([path]);
        }
      }
      const { error } = await supabase.from("ebooks").delete().eq("id", e.id);
      if (error) throw new Error(error.message);
      await logAdminAction("ebook.delete", { resourceType: "ebook", resourceId: e.id, metadata: { title: e.title } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adm-ebooks"] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">E-books</h1>
          <p className="text-sm text-white/60">Biblioteca com capa, arquivo PDF e categoria (bônus, coleção, em breve).</p>
        </div>
        <button onClick={() => setEditing("new")} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#3B5BFD] to-[#7C3AED] px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          <Plus className="h-4 w-4" /> Novo e-book
        </button>
      </div>

      {error && <GlassCard className="flex items-center gap-3 border-rose-500/30 p-4 text-rose-200"><AlertCircle className="h-5 w-5" /> {(error as Error).message}</GlassCard>}

      {isLoading ? (
        <GlassCard className="p-10 text-center text-white/60">Carregando…</GlassCard>
      ) : items.length === 0 ? (
        <GlassCard className="p-10 text-center text-white/60">
          <BookOpen className="mx-auto mb-3 h-8 w-8 opacity-50" /> Nenhum e-book ainda.
        </GlassCard>
      ) : (
        <div className="space-y-4">
          {grouped.map(([cat, list]) => (
            <GlassCard key={cat} className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-white/70">{CAT_META[cat].label}</h3>
                <span className="text-xs text-white/40">{list.length} título(s)</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((e) => (
                  <div key={e.id} className="flex gap-3 rounded-xl bg-white/5 p-3 hover:bg-white/10">
                    <div className={`h-20 w-14 shrink-0 overflow-hidden rounded-md bg-gradient-to-br ${CAT_META[cat].color}`}>
                      {e.cover_url && <img src={e.cover_url} alt="" className="h-full w-full object-cover" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{e.title}</p>
                      <p className="line-clamp-2 text-xs text-white/50">{e.subtitle}</p>
                      <div className="mt-1.5 flex items-center gap-2 text-[10px]">
                        {e.badge && <span className="rounded bg-white/10 px-1.5 py-0.5 text-white/70">{e.badge}</span>}
                        {e.price_cents > 0 && <span className="text-white/60">R$ {(e.price_cents / 100).toFixed(2)}</span>}
                        {e.status !== "active" && <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-300">{e.status}</span>}
                      </div>
                      <div className="mt-2 flex items-center gap-1.5">
                        {e.file_url && <a href={e.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-white/70 hover:bg-white/10"><ExternalLink className="h-3 w-3" /> PDF</a>}
                        <button onClick={() => setEditing(e)} className="rounded-lg px-2 py-1 text-[11px] text-white/80 hover:bg-white/10">Editar</button>
                        <button onClick={() => { if (confirm(`Excluir "${e.title}"?`)) delMutation.mutate(e); }} className="rounded-lg p-1.5 text-rose-300 hover:bg-rose-500/10"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {editing && (
        <EbookEditor
          ebook={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["adm-ebooks"] }); }}
        />
      )}
    </div>
  );
}

function EbookEditor({ ebook, onClose, onSaved }: { ebook: Ebook | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !ebook;
  const [form, setForm] = useState({
    title: ebook?.title ?? "",
    subtitle: ebook?.subtitle ?? "",
    category: (ebook?.category ?? "bonus") as Ebook["category"],
    price_cents: ebook?.price_cents ?? 0,
    badge: ebook?.badge ?? "",
    cover_url: ebook?.cover_url ?? "",
    file_url: ebook?.file_url ?? "",
    sort_order: ebook?.sort_order ?? 0,
    status: (ebook?.status ?? "active") as Ebook["status"],
    required_product_id: ebook?.required_product_id ?? "",
  });
  const [uploading, setUploading] = useState<"cover" | "file" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const { data: products = [] } = useQuery({
    queryKey: ["adm-products-mini"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name").order("name");
      if (error) throw new Error(error.message);
      return data as { id: string; name: string }[];
    },
  });

  async function upload(file: File, kind: "cover" | "file") {
    setErr(null); setUploading(kind);
    try {
      const ext = file.name.split(".").pop() || (kind === "cover" ? "jpg" : "pdf");
      const path = `${kind}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("ebooks-files").upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type || undefined });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("ebooks-files").getPublicUrl(path);
      setForm((f) => kind === "cover" ? { ...f, cover_url: pub.publicUrl } : { ...f, file_url: pub.publicUrl });
    } catch (e) { setErr((e as Error).message); }
    finally { setUploading(null); }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Título é obrigatório.");
      const payload = {
        title: form.title.trim(),
        subtitle: form.subtitle.trim() || null,
        category: form.category,
        price_cents: Number(form.price_cents) || 0,
        badge: form.badge.trim() || null,
        cover_url: form.cover_url || null,
        file_url: form.file_url || null,
        sort_order: Number(form.sort_order) || 0,
        status: form.status,
        required_product_id: form.required_product_id || null,
      };
      if (isNew) {
        const { data, error } = await supabase.from("ebooks").insert(payload).select().single();
        if (error) throw new Error(error.message);
        await logAdminAction("ebook.create", { resourceType: "ebook", resourceId: data.id, metadata: { title: data.title } });
      } else {
        const { error } = await supabase.from("ebooks").update(payload).eq("id", ebook!.id);
        if (error) throw new Error(error.message);
        await logAdminAction("ebook.update", { resourceType: "ebook", resourceId: ebook!.id, metadata: { title: payload.title } });
      }
    },
    onSuccess: onSaved,
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="adm-glass-dark relative h-full w-full max-w-xl overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{isNew ? "Novo e-book" : "Editar e-book"}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4">
          <label className="block text-xs">
            <span className="mb-1 block text-white/60">Título</span>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="adm-input w-full" />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block text-white/60">Subtítulo</span>
            <input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} className="adm-input w-full" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs">
              <span className="mb-1 block text-white/60">Categoria</span>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as Ebook["category"] })} className="adm-input w-full">
                <option value="bonus">Bônus</option>
                <option value="colecao">Coleção</option>
                <option value="embreve">Em breve</option>
              </select>
            </label>
            <label className="block text-xs">
              <span className="mb-1 block text-white/60">Status</span>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Ebook["status"] })} className="adm-input w-full">
                <option value="active">Ativo</option>
                <option value="draft">Rascunho</option>
                <option value="archived">Arquivado</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="block text-xs">
              <span className="mb-1 block text-white/60">Preço (centavos)</span>
              <input type="number" value={form.price_cents} onChange={(e) => setForm({ ...form, price_cents: Number(e.target.value) })} className="adm-input w-full" />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block text-white/60">Etiqueta</span>
              <input value={form.badge} onChange={(e) => setForm({ ...form, badge: e.target.value })} placeholder="Ex.: Incluso" className="adm-input w-full" />
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
                <Upload className="h-4 w-4" /> {uploading === "cover" ? "Enviando…" : "Enviar capa"}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, "cover"); }} />
              </label>
              {form.cover_url && <img src={form.cover_url} alt="" className="h-14 w-10 rounded object-cover" />}
            </div>
            <input value={form.cover_url} onChange={(e) => setForm({ ...form, cover_url: e.target.value })} placeholder="ou URL" className="adm-input mt-2 w-full text-xs" />
          </div>
          <div>
            <span className="mb-1 block text-xs text-white/60">Arquivo PDF</span>
            <div className="flex items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10">
                <Upload className="h-4 w-4" /> {uploading === "file" ? "Enviando…" : "Enviar PDF"}
                <input type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, "file"); }} />
              </label>
              {form.file_url && <a href={form.file_url} target="_blank" rel="noreferrer" className="text-xs text-white/70 underline">abrir</a>}
            </div>
            <input value={form.file_url} onChange={(e) => setForm({ ...form, file_url: e.target.value })} placeholder="ou URL" className="adm-input mt-2 w-full text-xs" />
          </div>
          <label className="block text-xs">
            <span className="mb-1 block text-white/60">Produto necessário (gating)</span>
            <select value={form.required_product_id} onChange={(e) => setForm({ ...form, required_product_id: e.target.value })} className="adm-input w-full">
              <option value="">Nenhum (acesso livre)</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <p className="mt-1 text-white/40">Quando preenchido, só alunos com entitlement ativo desse produto verão o conteúdo destravado.</p>
          </label>
          {err && <div className="flex items-center gap-2 rounded-lg bg-rose-500/10 p-3 text-xs text-rose-200"><AlertCircle className="h-4 w-4" /> {err}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-white/70 hover:bg-white/5">Cancelar</button>
            <button disabled={saveMutation.isPending || !!uploading} onClick={() => saveMutation.mutate()} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#3B5BFD] to-[#7C3AED] px-4 py-2 text-sm font-medium text-white shadow-lg disabled:opacity-40">
              <Save className="h-4 w-4" /> {saveMutation.isPending ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}