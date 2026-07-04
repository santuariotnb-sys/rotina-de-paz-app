// Recon READ-ONLY do storage/tabelas — não modifica nada.
// Carrega .env manualmente e imprime só um resumo (sem segredos).
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key, { auth: { persistSession: false } });

const bucketOf = (u) => {
  if (!u) return "(null)";
  const m = String(u).match(/\/object\/(?:public|sign)\/([^/]+)\//);
  return m ? m[1] : "(externo/outro)";
};

console.log("=== BUCKETS ===");
const { data: buckets, error: bErr } = await sb.storage.listBuckets();
if (bErr) console.log("erro listBuckets:", bErr.message);
else buckets.forEach((b) => console.log(`  ${b.id}  public=${b.public}`));

console.log("\n=== EBOOKS (cover_url vs file_url) ===");
const { data: ebooks, error: eErr } = await sb
  .from("ebooks")
  .select("id, title, status, required_product_id, cover_url, file_url");
if (eErr) console.log("erro ebooks:", eErr.message);
else {
  const tally = {};
  ebooks.forEach((e) => {
    const cb = bucketOf(e.cover_url), fb = bucketOf(e.file_url);
    const k = `cover=${cb} | file=${fb}`;
    tally[k] = (tally[k] || 0) + 1;
  });
  console.log(`  total ebooks: ${ebooks.length}`);
  Object.entries(tally).forEach(([k, n]) => console.log(`  ${n}x  ${k}`));
  console.log("  com file_url preenchido:", ebooks.filter((e) => e.file_url).length);
}

console.log("\n=== LOUVORES (audio_url) ===");
const { data: louv, error: lErr } = await sb
  .from("louvores")
  .select("id, audio_url");
if (lErr) console.log("erro louvores:", lErr.message);
else {
  const tally = {};
  louv.forEach((r) => { const b = bucketOf(r.audio_url); tally[b] = (tally[b] || 0) + 1; });
  console.log(`  total louvores: ${louv.length}`);
  Object.entries(tally).forEach(([b, n]) => console.log(`  ${n}x  bucket=${b}`));
}

console.log("\n=== SAMPLE de objetos por bucket (nomes, sem baixar) ===");
for (const b of ["ebooks-files", "louvores-audios"]) {
  const { data: objs, error } = await sb.storage.from(b).list("", { limit: 5 });
  if (error) { console.log(`  ${b}: erro ${error.message}`); continue; }
  console.log(`  ${b}: ${objs.length} na raiz →`, objs.map((o) => o.name).join(", ") || "(vazio na raiz — provavelmente em subpasta)");
  const { data: sub } = await sb.storage.from(b).list("file", { limit: 5 });
  if (sub && sub.length) console.log(`    file/ →`, sub.map((o) => o.name).slice(0, 5).join(", "));
}
