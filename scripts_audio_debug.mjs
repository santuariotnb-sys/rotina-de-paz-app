const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const SECRET = process.env.SUPABASE_SECRET_KEY || "";
async function test(label, key) {
  const r = await fetch(`${URL}/rest/v1/products?select=id&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  console.log(`${label}: status ${r.status} · ${(await r.text()).slice(0,120)}`);
}
console.log("URL:", URL);
console.log("ANON prefixo:", ANON.slice(0,8), "len", ANON.length);
console.log("SECRET prefixo:", SECRET.slice(0,11), "len", SECRET.length);
await test("ANON  ", ANON);
await test("SECRET", SECRET);
