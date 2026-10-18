// v3.15.0: vidy.st direct-stream resolver.
// Their player loads embed pages that fetch ENCRYPTED source lists from
// api.wecollege.net /{city}/sources. The full scheme (ported from their
// shipped chunk 122, Oct 18 2026):
//   1. GET /seed?mediaId={tmdbId}           -> {seed, ttlMs} (30s TTL)
//   2. GET /miami/sources?...&enc=2&seed=.. -> base64url blob
//   3. blob XOR keystream(seed, tmdbId) -> 'mvm1' magic + utf8 JSON
//      {sources:[{file|url,label|quality}], subtitles, thumbnail}
// Decrypted sources are raw HLS (moon.zenoak.top) = they play in our own
// player: no ads, no embed UI, real seek + ABR.

const L = [1116352408, 1899447441, 3049323471, 3921009573, 961987163, 1508970993, 2453635748, 2870763221, 3624381080, 310598401, 607225278, 1426881987, 1925078388, 2162078206, 2614888103, 3248222580];
const MAGIC = [109, 118, 109, 49]; // 'mvm1'
const GOLDEN = 2654435769;

function m(e) {
  e >>>= 0; e ^= e >>> 16; e = Math.imul(e, 2246822507) >>> 0; e ^= e >>> 13; e = Math.imul(e, 3266489909) >>> 0; return (e ^= e >>> 16) >>> 0;
}
function rotl(e, t) {
  e >>>= 0; t &= 31; return t === 0 ? e >>> 0 : ((e << t) | (e >>> (32 - t))) >>> 0;
}
function fnv(str) {
  let t = 2166136261;
  for (let a = 0; a < str.length; a++) t = Math.imul(t ^ str.charCodeAt(a), 16777619) >>> 0;
  return m(t);
}

function keyState(seed, mediaId) {
  // Their RC4 branch is dead code (I(x) is never true for real lengths).
  const a = new Array(61); // sparse on purpose — `d in a` is used below
  let s = m(fnv(String(seed)) ^ m((mediaId >>> 0) ^ GOLDEN)) >>> 0;
  for (let e = 0; e < 8; e++) {
    const t = s % 61;
    s = rotl((s + GOLDEN) >>> 0, 7 + (7 & e));
    a[t] = (s ^ m(s)) >>> 0;
    s = m((s + t) >>> 0);
  }
  return { S: a, acc: m(2779096485 ^ s) >>> 0 };
}

function nextWord(state, n) {
  const S = state.S;
  const acc = state.acc;
  const d = acc % 61;
  const inS = (d in S);
  const r = 0 - Number(inS);
  const i = (inS ? S[d] : 0) >>> 0;
  const s2 = (i ^ Math.imul(GOLDEN, n + 1)) >>> 0;
  const a2 = acc;
  let l = ((((a2 ^ s2) >>> 0) | ((a2 & s2 & r) >>> 0)) >>> 0);
  l = (rotl((l + acc) >>> 0, 31 & d) ^ rotl(acc, 31 & Math.imul(d, 7))) >>> 0;
  const nacc = m((l + GOLDEN) >>> 0);
  S[d] = nacc >>> 0;
  state.acc = nacc;
  return nacc >>> 0;
}

function keyStream(seed, mediaId, len) {
  const state = keyState(seed, mediaId);
  const out = new Uint8Array(len);
  let n = 0, e = 0;
  while (e < len) {
    const t = nextWord(state, n++);
    out[e++] = 255 & t;
    if (e < len) out[e++] = (t >>> 8) & 255;
    if (e < len) out[e++] = (t >>> 16) & 255;
    if (e < len) out[e++] = (t >>> 24) & 255;
  }
  return out;
}

function b64urlDecode(str) {
  const t = String(str).replace(/-/g, '+').replace(/_/g, '/').padEnd(4 * Math.ceil(String(str).length / 4), '=');
  const bin = atob(t);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function vidyDecrypt(payload, seed, mediaId) {
  const bytes = b64urlDecode(payload);
  const ks = keyStream(seed, mediaId, bytes.length);
  for (let i = 0; i < bytes.length; i++) bytes[i] ^= ks[i];
  for (let i = 0; i < MAGIC.length; i++) {
    if (bytes[i] !== MAGIC[i]) throw new Error('vidy decrypt failed: bad seed or tampered payload');
  }
  return new TextDecoder('utf-8').decode(bytes.subarray(MAGIC.length));
}

const VIDY_API = 'https://api.wecollege.net';
const VIDY_CITIES = ['miami', 'boise', 'vegas', 'reno', 'oakland', 'seattle', 'phoenix', 'dallas'];

const seedCache = new Map();

async function getSeed(tmdbId) {
  const cached = seedCache.get(tmdbId);
  if (cached && cached.expiresAt - 5000 > Date.now()) return cached.seed;
  const res = await fetch(`${VIDY_API}/seed?mediaId=${tmdbId}`);
  if (!res.ok) throw new Error('vidy seed failed');
  const data = await res.json();
  if (!data || !data.seed) throw new Error('vidy seed empty');
  seedCache.set(tmdbId, { seed: data.seed, expiresAt: Date.now() + (data.ttlMs || 30000) });
  return data.seed;
}

/**
 * Resolve direct HLS sources for a title via vidy.st's API.
 * Returns [{ url, quality, label, headers }] — empty on any failure.
 * Callers must treat this as best-effort and keep the embed chain as backup.
 */
export async function resolveVidyDirect({ title, year, tmdbId, imdbId, mediaType, season, episode }) {
  if (!tmdbId) return [];
  try {
    const seed = await getSeed(tmdbId);
    const params = new URLSearchParams({
      title: encodeURIComponent(title || ''),
      mediaType: mediaType === 'tv' ? 'tv' : 'movie',
      year: String(year || ''),
      episodeId: String(episode || 1),
      seasonId: String(season || 1),
      tmdbId: String(tmdbId),
      imdbId: imdbId || '',
      enc: '2',
      seed,
    });
    // miami first (their default), boise as second opinion
    for (const city of VIDY_CITIES.slice(0, 2)) {
      try {
        const res = await fetch(`${VIDY_API}/${city}/sources?${params}`, { headers: { Referer: 'https://www.vidy.st/' } });
        if (!res.ok) continue;
        const blob = await res.text();
        const json = JSON.parse(vidyDecrypt(blob, seed, tmdbId));
        const list = Array.isArray(json?.sources) ? json.sources : [];
        const out = [];
        for (const s of list) {
          const url = s.file || s.url || '';
          if (!/^https:\/\//.test(url)) continue;
          out.push({
            url,
            quality: s.label || s.quality || '1080p',
            label: `⚡ Direct ${s.label || s.quality || 'HD'} (No Ads)`,
            source: 'hls',
            headers: { Referer: 'https://www.vidy.st/', Origin: 'https://www.vidy.st' },
          });
        }
        if (out.length) return out;
      } catch { /* next city */ }
    }
    return [];
  } catch {
    return [];
  }
}
