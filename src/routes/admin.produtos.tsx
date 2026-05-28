import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Search, Trash2, Link as LinkIcon, X, Save, Package, AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/admin/GlassCard";
import { logAdminAction } from "@/lib/admin/audit";

export const Route = createFileRoute("/admin/produtos")({
  component: AdminProductsPage,
});

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  price_cents: number;
  currency: string;
  status: "draft" | "active" | "archived";
  kind: "method" | "course" | "ebook" | "bundle" | "other";
  content_ref: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  checkout_url: string | null;
};

type OfferRow = {
  id: string;
  product_id: string;
  kirvano_offer_id: string;
  label: string | null;
};

const KIND_LABEL: Record<ProductRow["kind"], string> = {
  method: "Método",
  course: "Curso",
  ebook: "E-book",
  bundle: "Bundle",
  other: "Outro",
};

const STATUS_LABEL: Record<ProductRow["status"], string> = {
  draft: "Rascunho",
  active: "Ativo",
  archived: "Arquivado",
};

function brl(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function listProducts(): Promise<ProductRow[]> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProductRow[];
}

async function listOffers(productId: string): Promise<OfferRow[]> {
  const { data, error } = await supabase
    .from("product_kirvano_offers")
    .select("*")
    .eq("product_id", productId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as OfferRow[];
}

function AdminProductsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ProductRow | "new" | null>(null);
  const [offersFor, setOffersFor] = useState<ProductRow | null>(null);

  const { data: products = [], isLoading, error } = useQuery({
    queryKey: ["admin", "products"],
    queryFn: listProducts,
  });

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(t) || p.slug.toLowerCase().includes(t),
    );
  }, [products, search]);

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw new Error(error.message);
      await logAdminAction("product.delete", { resourceType: "product", resourceId: id });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "products"] }),
  });

  return (
    <div className="adm-fade-up space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--adm-text-muted)]">
            Fase 2
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--adm-navy-deep)]">
            Produtos &amp; Kirvano
          </h1>
          <p className="mt-1 text-[13px] text-[var(--adm-text-muted)]">
            Cadastre produtos, vincule ofertas da Kirvano e libere acesso automaticamente após o pagamento.
          </p>
        </div>
        <button
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-[#3B5BFD] to-[#2745D8] px-4 py-2.5 text-[13px] font-semibold text-white shadow-md shadow-blue-500/25 transition hover:brightness-110"
        >
          <Plus className="h-4 w-4" />
          Novo produto
        </button>
      </header>

      <GlassCard className="p-0">
        <div className="flex items-center gap-2 border-b border-slate-200/60 px-4 py-3">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou slug…"
            className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-slate-400"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 px-4 py-6 text-[13px] text-rose-600">
            <AlertCircle className="h-4 w-4" />
            {(error as Error).message}
          </div>
        )}

        {isLoading ? (
          <div className="px-4 py-12 text-center text-[13px] text-[var(--adm-text-muted)]">
            Carregando…
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <Package className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-[14px] font-semibold text-[var(--adm-navy-deep)]">
              {search ? "Nada encontrado" : "Nenhum produto ainda"}
            </p>
            <p className="mt-1 text-[12px] text-[var(--adm-text-muted)]">
              {search ? "Tente outro termo." : "Crie o primeiro produto para começar a vincular ofertas da Kirvano."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-slate-200/60 text-[11px] uppercase tracking-wide text-[var(--adm-text-muted)]">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Produto</th>
                  <th className="px-4 py-2.5 font-medium">Tipo</th>
                  <th className="px-4 py-2.5 font-medium">Preço</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <div className="font-medium text-[var(--adm-navy-deep)]">{p.name}</div>
                      <div className="text-[11px] text-[var(--adm-text-muted)]">/{p.slug}</div>
                    </td>
                    <td className="px-4 py-3 text-[var(--adm-navy-deep)]">{KIND_LABEL[p.kind]}</td>
                    <td className="px-4 py-3 tabular-nums text-[var(--adm-navy-deep)]">{brl(p.price_cents)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium " +
                          (p.status === "active"
                            ? "bg-emerald-100 text-emerald-700"
                            : p.status === "draft"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-slate-200 text-slate-600")
                        }
                      >
                        {STATUS_LABEL[p.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setOffersFor(p)}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-[var(--adm-accent)] hover:bg-blue-50"
                          title="Vincular ofertas Kirvano"
                        >
                          <LinkIcon className="h-3.5 w-3.5" />
                          Ofertas
                        </button>
                        <button
                          onClick={() => setEditing(p)}
                          className="rounded-md px-2 py-1 text-[12px] text-[var(--adm-navy-deep)] hover:bg-slate-100"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Apagar "${p.name}"? As entitlements vinculadas serão removidas.`))
                              remove.mutate(p.id);
                          }}
                          className="rounded-md p-1 text-rose-500 hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {editing && (
        <ProductEditor
          product={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["admin", "products"] });
            setEditing(null);
          }}
        />
      )}
      {offersFor && (
        <OfferEditor
          product={offersFor}
          onClose={() => setOffersFor(null)}
        />
      )}
    </div>
  );
}

// ---------------- Product editor (drawer) ----------------
function ProductEditor({
  product,
  onClose,
  onSaved,
}: {
  product: ProductRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !product;
  const [form, setForm] = useState({
    slug: product?.slug ?? "",
    name: product?.name ?? "",
    description: product?.description ?? "",
    cover_url: product?.cover_url ?? "",
    price_cents: product?.price_cents ?? 0,
    currency: product?.currency ?? "BRL",
    status: product?.status ?? "draft",
    kind: product?.kind ?? "method",
    content_ref: JSON.stringify(product?.content_ref ?? {}, null, 2),
    checkout_url: product?.checkout_url ?? "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    try {
      let contentRef: Record<string, unknown> = {};
      try {
        contentRef = JSON.parse(form.content_ref || "{}");
      } catch {
        throw new Error("Content ref precisa ser JSON válido.");
      }
      const payload = {
        slug: form.slug.trim(),
        name: form.name.trim(),
        description: form.description || null,
        cover_url: form.cover_url || null,
        price_cents: Number(form.price_cents) || 0,
        currency: form.currency,
        status: form.status,
        kind: form.kind,
        content_ref: contentRef as never,
        checkout_url: form.checkout_url.trim() || null,
      };
      if (!payload.slug || !payload.name) throw new Error("Slug e nome são obrigatórios.");

      if (isNew) {
        const { data, error } = await supabase.from("products").insert(payload).select("id").single();
        if (error) throw new Error(error.message);
        await logAdminAction("product.create", { resourceType: "product", resourceId: data.id, metadata: { slug: payload.slug } });
      } else {
        const { error } = await supabase.from("products").update(payload).eq("id", product!.id);
        if (error) throw new Error(error.message);
        await logAdminAction("product.update", { resourceType: "product", resourceId: product!.id });
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer onClose={onClose} title={isNew ? "Novo produto" : `Editar · ${product?.name}`}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nome" required>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="adm-input"
            required
          />
        </Field>
        <Field label="Slug (URL-friendly)" required hint="ex: rotina-de-paz">
          <input
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
            className="adm-input"
            required
          />
        </Field>
        <Field label="Descrição">
          <textarea
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="adm-input resize-y"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo">
            <select
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as ProductRow["kind"] })}
              className="adm-input"
            >
              {(Object.keys(KIND_LABEL) as ProductRow["kind"][]).map((k) => (
                <option key={k} value={k}>{KIND_LABEL[k]}</option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as ProductRow["status"] })}
              className="adm-input"
            >
              {(Object.keys(STATUS_LABEL) as ProductRow["status"][]).map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Preço (centavos)" hint={`Pré-visualização: ${brl(Number(form.price_cents) || 0)}`}>
            <input
              type="number"
              min={0}
              value={form.price_cents}
              onChange={(e) => setForm({ ...form, price_cents: Number(e.target.value) })}
              className="adm-input"
            />
          </Field>
          <Field label="Moeda">
            <input
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
              className="adm-input"
            />
          </Field>
        </div>
        <Field label="URL da capa">
          <input
            value={form.cover_url}
            onChange={(e) => setForm({ ...form, cover_url: e.target.value })}
            placeholder="https://…"
            className="adm-input"
          />
        </Field>
        <Field label="Link de checkout (Kirvano)" hint="Usado nos botões 'Comprar' dos cards bloqueados">
          <input
            value={form.checkout_url}
            onChange={(e) => setForm({ ...form, checkout_url: e.target.value })}
            placeholder="https://pay.kirvano.com/…"
            className="adm-input"
          />
        </Field>
        <Field label="Content ref (JSON)" hint='Qual módulo do app esse produto libera. Ex: {"method":"rotina-de-paz"}'>
          <textarea
            rows={4}
            value={form.content_ref}
            onChange={(e) => setForm({ ...form, content_ref: e.target.value })}
            className="adm-input font-mono text-[12px]"
          />
        </Field>

        {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-600">{err}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-[13px] text-[var(--adm-text-muted)] hover:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-[#3B5BFD] to-[#2745D8] px-4 py-2 text-[13px] font-semibold text-white shadow-md transition hover:brightness-110 disabled:opacity-60"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </Drawer>
  );
}

// ---------------- Offer editor (drawer) ----------------
function OfferEditor({ product, onClose }: { product: ProductRow; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: offers = [], isLoading } = useQuery({
    queryKey: ["admin", "offers", product.id],
    queryFn: () => listOffers(product.id),
  });
  const [offerId, setOfferId] = useState("");
  const [label, setLabel] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: async () => {
      const value = offerId.trim();
      if (!value) throw new Error("Informe o ID da oferta.");
      const { error } = await supabase.from("product_kirvano_offers").insert({
        product_id: product.id,
        kirvano_offer_id: value,
        label: label.trim() || null,
      });
      if (error) throw new Error(error.message);
      await logAdminAction("offer.add", { resourceType: "product", resourceId: product.id, metadata: { kirvano_offer_id: value } });
    },
    onSuccess: () => {
      setOfferId("");
      setLabel("");
      setErr(null);
      qc.invalidateQueries({ queryKey: ["admin", "offers", product.id] });
    },
    onError: (e) => setErr(e instanceof Error ? e.message : "Falha"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("product_kirvano_offers").delete().eq("id", id);
      if (error) throw new Error(error.message);
      await logAdminAction("offer.remove", { resourceType: "product", resourceId: product.id, metadata: { offer_row_id: id } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "offers", product.id] }),
  });

  return (
    <Drawer onClose={onClose} title={`Ofertas Kirvano · ${product.name}`}>
      <div className="space-y-4">
        <p className="text-[12px] text-[var(--adm-text-muted)]">
          Cole aqui o ID das ofertas dentro da Kirvano que entregam este produto. Quando o webhook avisar que essa oferta foi paga, o acesso é liberado automaticamente.
        </p>

        <div className="rounded-xl border border-slate-200/70 bg-white p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr,1fr,auto]">
            <input
              value={offerId}
              onChange={(e) => setOfferId(e.target.value)}
              placeholder="ID da oferta (ex: off_abc123)"
              className="adm-input"
            />
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Rótulo (opcional, ex: Order Bump)"
              className="adm-input"
            />
            <button
              onClick={() => add.mutate()}
              disabled={add.isPending}
              className="inline-flex items-center justify-center gap-1 rounded-lg bg-[var(--adm-navy-deep)] px-3 py-2 text-[12px] font-semibold text-white hover:brightness-110 disabled:opacity-60"
            >
              <Plus className="h-3.5 w-3.5" />
              Vincular
            </button>
          </div>
          {err && <p className="mt-2 text-[12px] text-rose-600">{err}</p>}
        </div>

        <div className="rounded-xl border border-slate-200/70 bg-white">
          {isLoading ? (
            <p className="p-4 text-[12px] text-[var(--adm-text-muted)]">Carregando…</p>
          ) : offers.length === 0 ? (
            <p className="p-4 text-[12px] text-[var(--adm-text-muted)]">Nenhuma oferta vinculada ainda.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {offers.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div>
                    <p className="font-mono text-[12px] text-[var(--adm-navy-deep)]">{o.kirvano_offer_id}</p>
                    {o.label && <p className="text-[11px] text-[var(--adm-text-muted)]">{o.label}</p>}
                  </div>
                  <button
                    onClick={() => del.mutate(o.id)}
                    className="rounded-md p-1.5 text-rose-500 hover:bg-rose-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Drawer>
  );
}

// ---------------- Shared bits ----------------
function Drawer({ children, title, onClose }: { children: React.ReactNode; title: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <button aria-label="Fechar" className="flex-1 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="adm-fade-up flex w-full max-w-lg flex-col bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-[15px] font-semibold text-[var(--adm-navy-deep)]">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">
        {label} {required && <span className="text-rose-500">*</span>}
      </span>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">{hint}</p>}
    </label>
  );
}