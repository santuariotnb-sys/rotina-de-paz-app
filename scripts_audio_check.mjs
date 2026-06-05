// READ-ONLY: confirma o produto-método e os audio_tracks existentes. Não escreve nada.
const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY;
if (!URL || !KEY) { console.error("Falta SUPABASE_URL/SUPABASE_SECRET_KEY no .env"); process.exit(1); }
const h = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const pr = await fetch(`${URL}/rest/v1/products?select=id,name,slug,kind,status&kind=eq.method&status=eq.active`, { headers: h });
if (pr.status === 401) { console.error("401 — secret key inválida (cheque a transcrição)."); process.exit(1); }
const prods = await pr.json();
console.log("PRODUTOS kind=method active:");
console.log(JSON.stringify(prods, null, 2));

const prod = Array.isArray(prods) ? prods[0] : null;
if (prod?.id) {
  const tr = await fetch(`${URL}/rest/v1/audio_tracks?select=id,day,kind,title,audio_url,sort_order,duration_seconds&product_id=eq.${prod.id}&order=kind.asc,day.asc`, { headers: h });
  const tracks = await tr.json();
  console.log(`\nAUDIO_TRACKS já existentes p/ esse produto: ${tracks.length}`);
  for (const t of tracks) console.log(`  day${t.day} ${t.kind} · "${t.title}" · ${t.audio_url ? t.audio_url.slice(0, 55) : "SEM URL"}`);
} else {
  console.log("\n⚠️ Nenhum produto kind=method active encontrado.");
}
