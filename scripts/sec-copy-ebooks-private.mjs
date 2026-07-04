// Cria bucket privado ebooks-private e COPIA os PDFs de ebooks-files/file/ para lá.
// NÃO deleta originais. NÃO repointa file_url no banco. Inerte até o repoint (passo separado).
// Reversível: basta deletar o bucket ebooks-private.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const SRC = "ebooks-files";
const DST = "ebooks-private";
const PREFIX = "file";

// 1. Criar bucket privado (idempotente)
const { data: buckets } = await sb.storage.listBuckets();
if (buckets.some((b) => b.id === DST)) {
  console.log(`bucket ${DST} já existe`);
} else {
  const { error } = await sb.storage.createBucket(DST, { public: false });
  if (error) { console.log("ERRO createBucket:", error.message); process.exit(1); }
  console.log(`bucket ${DST} criado (private)`);
}

// 2. Listar PDFs em ebooks-files/file/
const { data: objs, error: lErr } = await sb.storage.from(SRC).list(PREFIX, { limit: 1000 });
if (lErr) { console.log("ERRO list:", lErr.message); process.exit(1); }
const files = objs.filter((o) => o.id); // arquivos, não subpastas
console.log(`\n${files.length} arquivos em ${SRC}/${PREFIX}/`);

// 3. Copiar cada um para ebooks-private/file/
let ok = 0, skip = 0, fail = 0;
for (const f of files) {
  const path = `${PREFIX}/${f.name}`;
  const { data: exists } = await sb.storage.from(DST).list(PREFIX, { search: f.name, limit: 1 });
  if (exists && exists.some((e) => e.name === f.name)) { console.log(`  = ${path} (já copiado)`); skip++; continue; }
  const { error } = await sb.storage.from(SRC).copy(path, path, { destinationBucket: DST });
  if (error) { console.log(`  ✗ ${path}: ${error.message}`); fail++; }
  else { console.log(`  ✓ ${path}`); ok++; }
}

// 4. Verificar destino
const { data: dstObjs } = await sb.storage.from(DST).list(PREFIX, { limit: 1000 });
console.log(`\nResultado: copiados=${ok} já-existiam=${skip} falhas=${fail}`);
console.log(`${DST}/${PREFIX}/ agora tem ${dstObjs?.length ?? 0} arquivos`);
console.log("\nOriginais em ebooks-files/file/ INTACTOS. Nenhum file_url repointado. Nada em produção mudou.");
