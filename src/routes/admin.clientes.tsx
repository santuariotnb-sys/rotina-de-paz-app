import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Users, Mail, Calendar, Package, Plus, KeyRound, AlertCircle, X, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/admin/GlassCard";
import { logAdminAction } from "@/lib/admin/audit";

export const Route = createFileRoute("/admin/clientes")({
  component: AdminClientesPage,
});

type Profile = {
  user_id: string;
  email: string | null;
  name: string | null;
  created_at: string;
  archetype: string | null;
};

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

function AdminClientesPage() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Profile | null>(null);

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["adm-clientes"],
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, email, name, created_at, archetype")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []) as Profile[];
    },
  });

  const { data: entitlements = [] } = useQuery({
    queryKey: ["adm-clientes-entitlements"],
    queryFn: async (): Promise<Entitlement[]> => {
      const { data, error } = await supabase
        .from("entitlements")
        .select("*")
        .order("granted_at", { ascending: false })
        .limit(2000);
      if (error) throw new Error(error.message);
      return (data ?? []) as Entitlement[];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["adm-products-mini"],
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase.from("products").select("id, name, slug").order("name");
      if (error) throw new Error(error.message);
      return (data ?? []) as Product[];
    },
  });

  const productById = useMemo(() => {
    const m: Record<string, Product> = {};
    for (const p of products) m[p.id] = p;
    return m;
  }, [products]);

  const entitlementsByUser = useMemo(() => {
    const m: Record<string, Entitlement[]> = {};
    for (const e of entitlements) {
      if (!m[e.user_id]) m[e.user_id] = [];
      m[e.user_id].push(e);
    }
    return m;
  }, [entitlements]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter(
      (p) =>
        (p.name ?? "").toLowerCase().includes(q) ||
        (p.email ?? "").toLowerCase().includes(q),
    );
  }, [profiles, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Clientes</h1>
          <p className="text-sm text-white/60">Todas as alunas cadastradas. Clique numa linha pra ver histórico e conceder acesso.</p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou email…"
            className="adm-input w-72 pl-9 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <GlassCard className="p-4">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-white/60" />
            <div>
              <p className="text-xs uppercase tracking-wider text-white/40">Total</p>
              <p className="text-xl font-semibold text-white">{profiles.length}</p>
            </div>
          </div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-white/60" />
            <div>
              <p className="text-xs uppercase tracking-wider text-white/40">Com acesso ativo</p>
              <p className="text-xl font-semibold text-white">
                {Object.values(entitlementsByUser).filter((es) => es.some((e) => e.status === "active")).length}
              </p>
            </div>
          </div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="flex items-center gap-3">
            <Package className="h-5 w-5 text-white/60" />
            <div>
              <p className="text-xs uppercase tracking-wider text-white/40">Entitlements totais</p>
              <p className="text-xl font-semibold text-white">{entitlements.length}</p>
            </div>
          </div>
        </GlassCard>
      </div>

      <GlassCard className="overflow-hidden p-0">
        {isLoading ? (
          <div className="p-6 text-sm text-white/60">Carregando…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-white/50">
            {search ? "Nenhuma aluna encontrada com esse termo." : "Nenhuma aluna cadastrada ainda."}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03] text-left text-[11px] uppercase tracking-wider text-white/40">
              <tr>
                <th className="px-4 py-3">Aluna</th>
                <th className="px-4 py-3">Arquétipo</th>
                <th className="px-4 py-3">Acessos ativos</th>
                <th className="px-4 py-3">Cadastro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((p) => {
                const ents = entitlementsByUser[p.user_id] ?? [];
                const active = ents.filter((e) => e.status === "active");
                return (
                  <tr
                    key={p.user_id}
                    onClick={() => setSelected(p)}
                    className="cursor-pointer text-white/80 transition hover:bg-white/[0.04]"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">{p.name ?? "—"}</div>
                      <div className="text-xs text-white/50">{p.email ?? "—"}</div>
                    </td>
                    <td className="px-4 py-3">
                      {p.archetype ? (
                        <span className="rounded-md bg-white/5 px-2 py-0.5 text-xs capitalize">{p.archetype}</span>
                      ) : (
                        <span className="text-xs text-white/30">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {active.length > 0 ? (
                        <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300">
                          {active.length} ativo{active.length > 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span className="text-xs text-white/30">Sem acesso</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-white/50">
                      {new Date(p.created_at).toLocaleDateString("pt-BR")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </GlassCard>

      {selected && (
        <ClienteDrawer
          profile={selected}
          entitlements={entitlementsByUser[selected.user_id] ?? []}
          productById={productById}
          products={products}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function ClienteDrawer({
  profile,
  entitlements,
  productById,
  products,
  onClose,
}: {
  profile: Profile;
  entitlements: Entitlement[];
  productById: Record<string, Product>;
  products: Product[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [grantOpen, setGrantOpen] = useState(false);

  const grant = useMutation({
    mutationFn: async () => {
      if (!profile.email) throw new Error("Aluna sem email cadastrado.");
      if (!productId) throw new Error("Selecione um produto.");
      const { data, error } = await supabase.rpc("grant_entitlement_manual", {
        _email: profile.email,
        _product_id: productId,
      });
      if (error) {
        if (error.message.includes("user_not_found")) throw new Error("Aluna não encontrada.");
        throw new Error(error.message);
      }
      await logAdminAction("entitlement.grant", {
        resourceType: "entitlement",
        resourceId: data as string,
        metadata: { email: profile.email, productId, from: "clientes-drawer" },
      });
    },
    onSuccess: () => {
      setGrantOpen(false);
      setErr(null);
      qc.invalidateQueries({ queryKey: ["adm-clientes-entitlements"] });
    },
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="adm-glass-dark relative h-full w-full max-w-lg overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-white/50 hover:bg-white/5 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-6">
          <h2 className="text-lg font-semibold text-white">{profile.name ?? "Sem nome"}</h2>
          <div className="mt-1.5 flex items-center gap-3 text-xs text-white/60">
            <span className="inline-flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" /> {profile.email ?? "—"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" /> {new Date(profile.created_at).toLocaleDateString("pt-BR")}
            </span>
          </div>
          {profile.archetype && (
            <span className="mt-3 inline-block rounded-md bg-white/5 px-2 py-0.5 text-xs capitalize text-white/70">
              Arquétipo: {profile.archetype}
            </span>
          )}
        </div>

        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Histórico de acessos</h3>
            <button
              onClick={() => setGrantOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#3B5BFD] to-[#7C3AED] px-3 py-1.5 text-xs font-medium text-white"
            >
              <Plus className="h-3.5 w-3.5" /> Conceder
            </button>
          </div>

          {grantOpen && (
            <div className="mb-4 space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
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
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>
              {err && (
                <div className="flex items-center gap-2 rounded-lg bg-rose-500/10 p-2.5 text-xs text-rose-200">
                  <AlertCircle className="h-4 w-4" /> {err}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setGrantOpen(false); setErr(null); }}
                  className="rounded-lg px-3 py-1.5 text-xs text-white/70 hover:bg-white/5"
                >
                  Cancelar
                </button>
                <button
                  disabled={grant.isPending}
                  onClick={() => grant.mutate()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#3B5BFD] to-[#7C3AED] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                >
                  <KeyRound className="h-3.5 w-3.5" /> {grant.isPending ? "Concedendo…" : "Confirmar"}
                </button>
              </div>
            </div>
          )}

          {entitlements.length === 0 ? (
            <p className="rounded-xl border border-white/5 bg-white/[0.02] p-4 text-center text-xs text-white/40">
              Nenhum acesso registrado.
            </p>
          ) : (
            <ul className="space-y-2">
              {entitlements.map((e) => {
                const prod = productById[e.product_id];
                const isActive = e.status === "active";
                return (
                  <li
                    key={e.id}
                    className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-white">{prod?.name ?? "Produto removido"}</p>
                      <p className="mt-0.5 text-[11px] text-white/40">
                        {e.source} · {new Date(e.granted_at).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <span
                      className={
                        isActive
                          ? "rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300"
                          : "rounded-md bg-white/5 px-2 py-0.5 text-[11px] text-white/50"
                      }
                    >
                      {e.status}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}