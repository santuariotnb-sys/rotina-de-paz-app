import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, AlertCircle, KeyRound, Mail, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/admin/GlassCard";
import { logAdminAction } from "@/lib/admin/audit";

export const Route = createFileRoute("/admin/acessos")({
  component: AdminAccessPage,
});

type Entitlement = {
  id: string;
  user_id: string;
  product_id: string;
  source: string;
  status: string;
  buyer_email: string | null;
  granted_at: string;
  revoked_at: string | null;
};

type Product = { id: string; name: string; slug: string };
type Profile = { user_id: string; email: string | null; name: string | null };

function AdminAccessPage() {
  const qc = useQueryClient();
  const [showGrant, setShowGrant] = useState(false);
  const [filterProduct, setFilterProduct] = useState<string>("all");

  const { data: products = [] } = useQuery({
    queryKey: ["adm-products-mini"],
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug")
        .order("name");
      if (error) throw new Error(error.message);
      return (data ?? []) as Product[];
    },
  });

  const {
    data: entitlements = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["adm-entitlements", filterProduct],
    queryFn: async (): Promise<Entitlement[]> => {
      let q = supabase
        .from("entitlements")
        .select("*")
        .order("granted_at", { ascending: false })
        .limit(500);
      if (filterProduct !== "all") q = q.eq("product_id", filterProduct);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as Entitlement[];
    },
  });

  const userIds = useMemo(() => [...new Set(entitlements.map((e) => e.user_id))], [entitlements]);
  const { data: profilesMap = {} } = useQuery({
    queryKey: ["adm-ent-profiles", userIds.join(",")],
    enabled: userIds.length > 0,
    queryFn: async (): Promise<Record<string, Profile>> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, email, name")
        .in("user_id", userIds);
      if (error) throw new Error(error.message);
      const map: Record<string, Profile> = {};
      for (const p of (data ?? []) as Profile[]) map[p.user_id] = p;
      return map;
    },
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("entitlements")
        .update({ status: "revoked", revoked_at: new Date().toISOString() })
        .eq("id", id)
        .select("id");
      if (error) throw new Error(error.message);
      // Sem isto, um UPDATE bloqueado por RLS (ou linha inexistente) retorna 0 linhas
      // SEM erro — a falha ficaria invisivel e o acesso permaneceria ativo.
      if (!data || data.length === 0) {
        throw new Error(
          "Revogação não aplicada: nenhuma linha alterada (verifique permissões/RLS ou se o acesso ainda existe).",
        );
      }
      await logAdminAction("entitlement.revoke", { resourceType: "entitlement", resourceId: id });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adm-entitlements"] }),
  });

  const productById = useMemo(() => {
    const m: Record<string, Product> = {};
    for (const p of products) m[p.id] = p;
    return m;
  }, [products]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Acessos & Entitlements</h1>
          <p className="text-sm text-white/60">
            Quem tem acesso a quê. Conceda manualmente quando precisar bypass do Kirvano.
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={filterProduct}
            onChange={(e) => setFilterProduct(e.target.value)}
            className="adm-input text-sm"
          >
            <option value="all">Todos os produtos</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowGrant(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#3B5BFD] to-[#7C3AED] px-4 py-2.5 text-sm font-medium text-white shadow-lg"
          >
            <Plus className="h-4 w-4" /> Conceder acesso
          </button>
        </div>
      </div>

      {error && (
        <GlassCard className="flex items-center gap-3 border-rose-500/30 p-4 text-rose-200">
          <AlertCircle className="h-5 w-5" /> {(error as Error).message}
        </GlassCard>
      )}
      {revoke.isError && (
        <GlassCard className="flex items-center gap-3 border-rose-500/30 p-4 text-rose-200">
          <AlertCircle className="h-5 w-5" /> Falha ao revogar: {(revoke.error as Error).message}
        </GlassCard>
      )}

      <GlassCard className="overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-sm text-white/60">Carregando…</div>
        ) : entitlements.length === 0 ? (
          <div className="p-10 text-center text-sm text-white/50">
            Nenhum entitlement encontrado.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03] text-left text-[11px] uppercase tracking-wider text-white/40">
              <tr>
                <th className="px-4 py-3">Aluno</th>
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3">Origem</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Concedido</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {entitlements.map((e) => {
                const p = profilesMap[e.user_id];
                const prod = productById[e.product_id];
                return (
                  <tr key={e.id} className="text-white/80">
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">{p?.name ?? "—"}</div>
                      <div className="text-xs text-white/50">
                        {p?.email ?? e.buyer_email ?? e.user_id.slice(0, 8)}
                      </div>
                    </td>
                    <td className="px-4 py-3">{prod?.name ?? e.product_id.slice(0, 8)}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-white/5 px-2 py-0.5 text-xs">{e.source}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-md px-2 py-0.5 text-xs ${e.status === "active" ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}
                      >
                        {e.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-white/50">
                      {new Date(e.granted_at).toLocaleString("pt-BR")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {e.status === "active" && (
                        <button
                          onClick={() => {
                            if (confirm("Revogar este acesso?")) revoke.mutate(e.id);
                          }}
                          className="rounded-lg p-2 text-rose-300 hover:bg-rose-500/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </GlassCard>

      {showGrant && (
        <GrantDrawer
          products={products}
          onClose={() => setShowGrant(false)}
          onSaved={() => {
            setShowGrant(false);
            qc.invalidateQueries({ queryKey: ["adm-entitlements"] });
          }}
        />
      )}
    </div>
  );
}

function GrantDrawer({
  products,
  onClose,
  onSaved,
}: {
  products: Product[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [email, setEmail] = useState("");
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [err, setErr] = useState<string | null>(null);

  const grant = useMutation({
    mutationFn: async () => {
      if (!email.trim() || !productId) throw new Error("Email e produto são obrigatórios.");
      const { data, error } = await supabase.rpc("grant_entitlement_manual", {
        _email: email.trim(),
        _product_id: productId,
      });
      if (error) {
        if (error.message.includes("user_not_found"))
          throw new Error("Nenhum aluno com este email. Ele precisa se cadastrar primeiro.");
        throw new Error(error.message);
      }
      await logAdminAction("entitlement.grant", {
        resourceType: "entitlement",
        resourceId: data as string,
        metadata: { email, productId },
      });
    },
    onSuccess: onSaved,
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="adm-glass-dark relative h-full w-full max-w-md overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-5 text-lg font-semibold text-white">Conceder acesso manual</h2>
        <div className="space-y-4">
          <label className="block text-xs">
            <span className="mb-1 flex items-center gap-1.5 text-white/60">
              <Mail className="h-3.5 w-3.5" /> Email do aluno
            </span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="aluno@email.com"
              className="adm-input w-full"
            />
          </label>
          <label className="block text-xs">
            <span className="mb-1 flex items-center gap-1.5 text-white/60">
              <Package className="h-3.5 w-3.5" /> Produto
            </span>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="adm-input w-full"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <p className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-200">
            O aluno precisa já ter conta cadastrada (mesmo email).
          </p>
          {err && (
            <div className="flex items-center gap-2 rounded-lg bg-rose-500/10 p-3 text-xs text-rose-200">
              <AlertCircle className="h-4 w-4" /> {err}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-sm text-white/70 hover:bg-white/5"
            >
              Cancelar
            </button>
            <button
              disabled={grant.isPending}
              onClick={() => grant.mutate()}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#3B5BFD] to-[#7C3AED] px-4 py-2 text-sm font-medium text-white shadow-lg disabled:opacity-40"
            >
              <KeyRound className="h-4 w-4" /> {grant.isPending ? "Concedendo…" : "Conceder"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
