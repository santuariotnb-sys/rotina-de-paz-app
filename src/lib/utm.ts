const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid"] as const;
export type UtmParams = Partial<Record<(typeof UTM_KEYS)[number], string>>;

const STORAGE_KEY = "rdp:utm";

export function captureUtms(): UtmParams {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const captured: UtmParams = {};
  for (const k of UTM_KEYS) {
    const v = params.get(k);
    if (v) captured[k] = v;
  }
  if (Object.keys(captured).length > 0) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(captured));
    } catch {}
    return captured;
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored) as UtmParams;
  } catch {}
  return {};
}

export function buildKirvanoUrl(
  baseUrl: string,
  extras: { archetype?: string; name?: string; email?: string } = {},
): string {
  try {
    const url = new URL(baseUrl);
    const utms = captureUtms();
    for (const [k, v] of Object.entries(utms)) {
      if (v) url.searchParams.set(k, v);
    }
    if (extras.archetype) url.searchParams.set("arquetipo", extras.archetype);
    if (extras.name) url.searchParams.set("nome", extras.name);
    if (extras.email) url.searchParams.set("email", extras.email);
    return url.toString();
  } catch {
    return baseUrl;
  }
}