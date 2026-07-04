// GATE + REPOINT: prova que signed URL do ebooks-private abre (HTTP 200) e SÓ ENTÃO
// repointa ebooks.file_url de ebooks-files → ebooks-private. Não deleta originais.
// Reversível: rodar de novo com DIRECTION=back reverte o repoint.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const FROM = process.env.DIRECTION === "back" ? "ebooks-private" : "ebooks-files";
const TO   = process.env.DIRECTION === "back" ? "ebooks-files"   : "ebooks-private";

// 1. GATE: gerar signed URL de um PDF no bucket destino e fazer HEAD (200?)
const { data: sample } = await sb.storage.from(TO).list("file", { limit: 1 });
if (!sample?.length) { console.log(`ABORT: ${TO}/file/ vazio — rode a cópia primeiro`); process.exit(1); }
const { data: signed, error: sErr } = await sb.storage.from(TO).createSignedUrl(`file/${sample[0].name}`, 300);
if (sErr || !signed?.signedUrl) { console.log("ABORT: createSignedUrl falhou:", sErr?.message); process.exit(1); }
const head = await fetch(signed.signedUrl, { method: "HEAD" });
console.log(`GATE: signed URL de ${TO}/file/${sample[0].name} → HTTP ${head.status}`);
if (!head.ok) { console.log("ABORT: signed URL não retornou 200. Repoint cancelado."); process.exit(1); }

// 2. REPOINT: só e-books cujo file_url aponta pro bucket FROM
const { data: ebooks } = await sb.from("ebooks").select("id, title, file_url");
const targets = ebooks.filter((e) => e.file_url && e.file_url.includes(`/object/public/${FROM}/`));
console.log(`\nRepoint ${FROM} → ${TO}: ${targets.length} e-books`);
let ok = 0;
for (const e of targets) {
  const nu = e.file_url.replace(`/object/public/${FROM}/`, `/object/public/${TO}/`);
  const { error } = await sb.from("ebooks").update({ file_url: nu }).eq("id", e.id);
  if (error) console.log(`  ✗ ${e.title}: ${error.message}`);
  else { console.log(`  ✓ ${e.title}`); ok++; }
}
console.log(`\nRepointados: ${ok}/${targets.length}. Originais em ${FROM}/file/ INTACTOS (leak fecha só ao deletar).`);
