/**
 * Dicky News TikTok Analytics — serverless Worker
 * Public TikTok pages only. Never invent unavailable technical or moderation data.
 */
const ALLOWED_ORIGINS = new Set([
  "https://dickynews.github.io",
  "http://localhost:8788",
  "http://127.0.0.1:8788"
]);
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

function cors(request) {
  const origin = request.headers.get("Origin") || "";
  const headers = { ...JSON_HEADERS, "access-control-allow-methods": "GET, OPTIONS", "access-control-allow-headers": "Content-Type" };
  if (ALLOWED_ORIGINS.has(origin)) headers["access-control-allow-origin"] = origin;
  headers["vary"] = "Origin";
  return headers;
}
function reply(request, payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: cors(request) });
}
function validTikTokUrl(input) {
  try {
    const u = new URL(input);
    return ["http:", "https:"].includes(u.protocol) &&
      (u.hostname === "tiktok.com" || u.hostname.endsWith(".tiktok.com"));
  } catch { return false; }
}
function findVideoObjects(root) {
  const found = [];
  const seen = new Set();
  function walk(v, depth) {
    if (!v || typeof v !== "object" || depth > 28 || seen.has(v)) return;
    seen.add(v);
    // TikTok has used several shapes for public video metadata across page versions.
    for (const key of ["video", "videoMeta", "videoInfo", "itemVideo"]) {
      const candidate = v[key];
      if (candidate && typeof candidate === "object" &&
          (candidate.width || candidate.height || candidate.codecType || candidate.playAddr ||
           candidate.duration || candidate.fps || candidate.frameRate || candidate.bitrate || candidate.bitRate)) {
        found.push(candidate);
      }
    }
    if (v.itemStruct && typeof v.itemStruct === "object" && v.itemStruct.video) found.push(v.itemStruct.video);
    for (const value of Object.values(v)) walk(value, depth + 1);
  }
  walk(root, 0);
  return found.sort((a, b) => {
    const score = v => ["width","height","duration","fps","frameRate","bitrate","bitRate","codecType","codec","size","fileSize"].filter(k => v[k] != null).length;
    return score(b) - score(a);
  })[0] || null;
}
function parseEmbeddedJson(html) {
  const patterns = [
    /<script[^>]+id=["']__UNIVERSAL_DATA_FOR_REHYDRATION__["'][^>]*>([\s\S]*?)<\/script>/i,
    /<script[^>]+id=["']SIGI_STATE["'][^>]*>([\s\S]*?)<\/script>/i
  ];
  for (const pattern of patterns) {
    const m = html.match(pattern);
    if (m) { try { return JSON.parse(m[1]); } catch {} }
  }
  return null;
}
function numeric(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function formatBytes(n) {
  if (!n) return null;
  const units = ["B", "KB", "MB", "GB"];
  let v = n, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return v.toFixed(i ? 2 : 0) + " " + units[i];
}
function formatBitrate(bitsPerSecond) {
  if (!Number.isFinite(bitsPerSecond) || bitsPerSecond <= 0) return null;
  return bitsPerSecond >= 1000000
    ? (bitsPerSecond / 1000000).toFixed(2) + " Mbps"
    : Math.round(bitsPerSecond / 1000) + " kbps";
}
function firstNumeric(object, keys) {
  for (const key of keys) {
    const value = numeric(object?.[key]);
    if (value) return value;
  }
  return null;
}
function findTechnicalNumber(root, keys) {
  const wanted = new Set(keys.map(k => k.toLowerCase()));
  const seen = new Set();
  let result = null;
  function walk(v, depth) {
    if (!v || typeof v !== "object" || depth > 30 || seen.has(v) || result !== null) return;
    seen.add(v);
    for (const [key, value] of Object.entries(v)) {
      if (wanted.has(key.toLowerCase())) {
        const n = numeric(value);
        if (n && n <= 1000) { result = n; return; }
      }
    }
    for (const value of Object.values(v)) walk(value, depth + 1);
  }
  walk(root, 0);
  return result;
}
function classifyResolution(width, height) {
  const long = Math.max(width, height);
  if (long >= 3800) return "4K";
  if (long >= 2500) return "2K / QHD";
  if (long >= 2000) return "1440p";
  if (long >= 1050) return "1080p / Full HD";
  if (long >= 700) return "720p / HD";
  if (long >= 500) return "540p";
  if (long >= 350) return "360p";
  return "Di bawah 360p";
}
function findItemStruct(root) {
  let found = null; const seen = new Set();
  function walk(v, depth) {
    if (!v || typeof v !== "object" || depth > 24 || seen.has(v) || found) return;
    seen.add(v);
    if (v.itemStruct && typeof v.itemStruct === "object" && (v.itemStruct.id || v.itemStruct.desc || v.itemStruct.stats)) { found = v.itemStruct; return; }
    for (const value of Object.values(v)) walk(value, depth + 1);
  }
  walk(root, 0); return found;
}
function baseResult(input) {
  return {
    input_url: input, title: null, author: null, description: null, thumbnail: null,
    video_id: null, created_at: null, duration: null, play_count: null, like_count: null,
    comment_count: null, share_count: null, music_title: null, music_author: null, aspect_ratio: null,
    resolution: null, resolution_label: null, video_format: null, fps: null, fps_value: null, bitrate: null, codec: null, file_size: null, container: null,
    region: "Tidak tersedia dari data publik", review_status: "Tidak dapat diverifikasi secara publik",
    visibility: "Belum diverifikasi", index_visibility: "Tidak tersedia dari data publik",
    data_source: [], limitations: []
  };
}
async function fetchWithTimeout(url, init = {}, ms = 9000) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
}
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      const headers = cors(request);
      headers["access-control-max-age"] = "86400";
      return new Response(null, { status: 204, headers });
    }
    if (url.pathname === "/health") return reply(request, { ok: true, service: "Dicky News TikTok Analytics", mode: "public-metadata", version: "1.0.0" });
    if (request.method !== "GET" || url.pathname !== "/public/tiktok-analytics") {
      return reply(request, { error: "Not found" }, 404);
    }
    const input = (url.searchParams.get("url") || "").trim();
    if (!input || input.length > 2048 || !validTikTokUrl(input)) {
      return reply(request, { error: "Masukkan URL video TikTok publik yang valid." }, 400);
    }
    const result = baseResult(input);
    let canonicalUrl = input;
    try {
      const page = await fetchWithTimeout(input, {
        redirect: "follow",
        headers: { "user-agent": "Mozilla/5.0 (compatible; DickyNewsAnalytics/1.0; +https://dickynews.github.io/)" }
      }, 9000);
      canonicalUrl = page.url || input;
      result.visibility = page.ok ? "Halaman publik dapat diakses" : "Halaman publik tidak dapat diakses (HTTP " + page.status + ")";
      if (page.ok) {
        const html = await page.text();
        const title = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)/i) ||
          html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i);
        const image = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)/i) ||
          html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:image["']/i);
        if (title) result.title = title[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
        if (image) result.thumbnail = image[1].replace(/&amp;/g, "&");
        const embedded = parseEmbeddedJson(html);
        const item = embedded ? findItemStruct(embedded) : null;
        if (item) {
          const stats = item.stats || item.statsV2 || {};
          const author = item.author || {};
          const music = item.music || {};
          result.video_id = item.id || null;
          result.description = item.desc || result.description;
          result.author = author.nickname || author.uniqueId || result.author;
          result.created_at = numeric(item.createTime) ? new Date(Number(item.createTime) * 1000).toISOString() : null;
          result.duration = numeric(item.video?.duration) ? Number(item.video.duration) + " detik" : null;
          result.play_count = stats.playCount ?? stats.play_count ?? null;
          result.like_count = stats.diggCount ?? stats.digg_count ?? null;
          result.comment_count = stats.commentCount ?? stats.comment_count ?? null;
          result.share_count = stats.shareCount ?? stats.share_count ?? null;
          result.music_title = music.title || null;
          result.music_author = music.authorName || null;
          result.aspect_ratio = item.video?.ratio || null;
          result.data_source.push("Metadata video publik");
        }
        const video = embedded ? findVideoObjects(embedded) : null;
        if (video) {
          const width = numeric(video.width), height = numeric(video.height);
          if (width && height) {
            result.resolution = width + "×" + height;
            result.resolution_label = classifyResolution(width, height);
          }
          // Expert fallback: check the selected video object, the canonical item video,
          // and then the embedded payload for explicitly published frame-rate fields.
          // Never infer FPS from a caption, thumbnail, or duration alone.
          const fps = firstNumeric(video, ["fps", "frameRate", "frame_rate", "frame_rate_num", "frameRateNum"]) ||
            firstNumeric(item?.video, ["fps", "frameRate", "frame_rate", "frame_rate_num", "frameRateNum"]) ||
            (embedded ? findTechnicalNumber(embedded, ["fps", "frameRate", "frame_rate", "frame_rate_num", "frameRateNum"]) : null);
          if (fps && fps <= 1000) {
            result.fps_value = fps;
            result.fps = fps + " FPS";
          }
          if (result.resolution_label && result.fps_value) {
            result.video_format = result.resolution_label + " " + result.fps_value + " FPS";
          } else if (result.resolution_label) {
            result.video_format = result.resolution_label + " · FPS tidak terverifikasi";
          }

          // Preserve an explicitly supplied bitrate. If TikTok exposes only file size and
          // duration, calculate average total bitrate and label it as derived, not source metadata.
          const br = firstNumeric(video, ["bitrate", "bitRate", "bit_rate", "playBitrate", "downloadBitrate"]);
          if (br) {
            result.bitrate = formatBitrate(br);
            result.bitrate_source = "Metadata TikTok";
          }
          if (video.codecType || video.codec || video.codec_type) {
            result.codec = String(video.codecType || video.codec || video.codec_type).slice(0, 40);
          }
          const bytes = firstNumeric(video, ["size", "fileSize", "file_size", "downloadSize"]);
          if (bytes) result.file_size = formatBytes(bytes);
          if (video.format || video.container || video.containerFormat) {
            result.container = String(video.format || video.container || video.containerFormat).slice(0, 20);
          }
          // Some page payloads expose dimensions/duration but no FPS or bitrate.
          // Do not manufacture FPS. Derive average bitrate only when both size and duration are known.
          const itemDuration = firstNumeric(video, ["duration", "durationSeconds", "duration_sec"]);
          const seconds = itemDuration || (typeof result.duration === "string" ? Number(result.duration.match(/[0-9.]+/)?.[0]) : null);
          if (!result.bitrate && bytes && seconds > 0) {
            result.bitrate = formatBitrate((bytes * 8) / seconds);
            result.bitrate_source = "Perkiraan rata-rata dari ukuran file dan durasi";
          }
          result.data_source.push("Halaman publik TikTok");
        }
      }
    } catch (e) {
      result.limitations.push("Halaman TikTok tidak dapat dibaca oleh serverless worker (anti-bot, link privat, atau timeout).");
    }
    try {
      const oembedUrl = "https://www.tiktok.com/oembed?url=" + encodeURIComponent(canonicalUrl);
      const response = await fetchWithTimeout(oembedUrl, {
        headers: { "accept": "application/json", "user-agent": "Mozilla/5.0" }
      }, 7000);
      if (response.ok) {
        const o = await response.json();
        result.title = result.title || o.title || null;
        result.description = result.description || o.title || null;
        result.author = o.author_name || result.author;
        result.thumbnail = result.thumbnail || o.thumbnail_url || null;
        if (o.title || o.author_name) result.data_source.push("TikTok oEmbed");
      } else {
        result.limitations.push("TikTok oEmbed tidak mengembalikan metadata (HTTP " + response.status + ").");
      }
    } catch {
      result.limitations.push("Layanan TikTok oEmbed tidak merespons.");
    }
    if (!result.fps) {
      result.limitations.push("Frame rate (FPS) tidak disertakan pada metadata publik TikTok untuk video ini; FPS asli tidak bisa dipastikan tanpa mengakses file video.");
    }
    if (!result.bitrate) {
      result.limitations.push("Bitrate tidak tersedia dan tidak dapat dihitung karena ukuran file sumber atau durasi tidak tersedia.");
    } else if (result.bitrate_source === "Perkiraan rata-rata dari ukuran file dan durasi") {
      result.limitations.push("Bitrate adalah rata-rata total hasil perhitungan ukuran file/durasi, bukan bitrate video stream yang terukur langsung.");
    }
    if (!result.resolution || !result.codec || !result.file_size) {
      result.limitations.push("Sebagian detail teknis tidak dipublikasikan TikTok pada metadata yang dapat dibaca.");
    }
    result.data_source = [...new Set(result.data_source)];
    result.analyzed_at = new Date().toISOString();
    result.status = result.data_source.length ? "partial" : "unavailable";
    return reply(request, result);
  }
};
