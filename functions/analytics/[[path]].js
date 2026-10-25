const UPSTREAM = "https://golden-tiktok-analytics.alinkdicky45.workers.dev/public/tiktok-analytics";
const MAX_INPUT_LENGTH = 2048;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const BASE_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer"
};

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: BASE_HEADERS });
}

function validTikTokUrl(input) {
  try {
    const u = new URL(input);
    return u.protocol === "https:" &&
      (u.hostname === "tiktok.com" || u.hostname.endsWith(".tiktok.com"));
  } catch {
    return false;
  }
}

async function readBounded(response) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_RESPONSE_BYTES) {
    try { await response.body?.cancel(); } catch {}
    throw new Error("Respons analytics melewati batas ukuran.");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let body = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      try { await reader.cancel(); } catch {}
      throw new Error("Respons analytics melewati batas ukuran.");
    }
    body += decoder.decode(value, { stream: true });
  }
  return body + decoder.decode();
}

export async function onRequest({ request }) {
  const incoming = new URL(request.url);
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...BASE_HEADERS, "allow": "GET, OPTIONS" }
    });
  }
  if (request.method !== "GET" || incoming.pathname !== "/analytics/public/tiktok-analytics") {
    return json({ error: "Not found" }, 404);
  }

  const input = (incoming.searchParams.get("url") || "").trim();
  if (!input || input.length > MAX_INPUT_LENGTH || !validTikTokUrl(input)) {
    return json({ error: "Masukkan URL video TikTok HTTPS yang valid." }, 400);
  }

  const upstream = new URL(UPSTREAM);
  upstream.searchParams.set("url", input);
  try {
    const response = await fetch(upstream.toString(), {
      method: "GET",
      headers: { "accept": "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(16000)
    });
    if (response.status >= 300 && response.status < 400) {
      try { await response.body?.cancel(); } catch {}
      return json({ error: "Redirect analytics ditolak." }, 502);
    }
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      try { await response.body?.cancel(); } catch {}
      return json({ error: "Respons analytics tidak valid." }, 502);
    }
    const body = await readBounded(response);
    return new Response(body, {
      status: response.status,
      headers: BASE_HEADERS
    });
  } catch {
    return json({ error: "Layanan analisis sementara tidak tersedia." }, 502);
  }
}
