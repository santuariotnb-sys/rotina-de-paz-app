// FECHA O LEAK: deleta os PDFs originais de ebooks-files/file/ (bucket público).
// Só o prefixo file/ — capas em cover/ ficam intactas. Reversível: cópias vivem em ebooks-private.
// Prova antes/depois: a URL pública antiga vai de 200 → 404/400.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const BUCKET = "ebooks-files", PREFIX = "file";

// 1. Listar PDFs originais
const { data: objs, error: lErr } = await sb.storage.from(BUCKET).list(PREFIX, { limit: 1000 });
if (lErr) { console.log("ABORT list:", lErr.message); process.exit(1); }
const files = objs.filter((o) => o.id);
if (!files.length) { console.log("Nada em ebooks-files/file/ — já deletado?"); process.exit(0); }

// 2. Provar que a URL pública antiga AINDA abre (antes)
const sampleName = files[0].name;
const publicUrl = `${env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${PREFIX}/${sampleName}`;
const before = await fetch(publicUrl, { method: "HEAD" });
console.log(`ANTES: URL pública ${PREFIX}/${sampleName} → HTTP ${before.status}`);

// 3. Salvaguarda: confirmar que as cópias existem no bucket privado antes de deletar
const { data: priv } = await sb.storage.from("ebooks-private").list(PREFIX, { limit: 1000 });
const privNames = new Set((priv ?? []).map((o) => o.name));
const missing = files.filter((f) => !privNames.has(f.name));
if (missing.length) { console.log(`ABORT: ${missing.length} arquivo(s) sem cópia em ebooks-private:`, missing.map((m) => m.name).join(", ")); process.exit(1); }
console.log(`Salvaguarda OK: todas as ${files.length} cópias existem em ebooks-private/file/`);

// 4. Deletar
const paths = files.map((f) => `${PREFIX}/${f.name}`);
const { data: del, error: dErr } = await sb.storage.from(BUCKET).remove(paths);
if (dErr) { console.log("ABORT remove:", dErr.message); process.exit(1); }
console.log(`\nDeletados ${del?.length ?? paths.length} PDFs de ${BUCKET}/${PREFIX}/`);

// 5. Provar 404 (depois)
const after = await fetch(publicUrl, { method: "HEAD" });
console.log(`DEPOIS: URL pública ${PREFIX}/${sampleName} → HTTP ${after.status}  ${after.ok ? "⚠️ AINDA ABRE" : "✅ FECHADO"}`);
