const HLS_PATTERNS = [/\.m3u8(?:$|\?)/i, /\/getm3u8\//i, /\/getstream\//i];
const DASH_PATTERNS = [/\.mpd(?:$|\?)/i];
const VIDEO_PATTERNS = [/\.(mp4|m4v|webm|mkv)(?:$|\?)/i];

export function isSafeHttpUrl(value) {
  if (!value || typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function detectStreamType(url, declaredType = '') {
  const cleanType = String(declaredType || '').toLowerCase();
  if (cleanType === 'hls' || cleanType === 'm3u8') return 'hls';
  if (cleanType === 'dash' || cleanType === 'mpd') return 'dash';
  if (cleanType === 'video' || cleanType === 'mp4') return 'video';
  if (HLS_PATTERNS.some(pattern => pattern.test(url || ''))) return 'hls';
  if (DASH_PATTERNS.some(pattern => pattern.test(url || ''))) return 'dash';
  if (VIDEO_PATTERNS.some(pattern => pattern.test(url || ''))) return 'video';
  return 'unknown';
}

export async function resolveTmdbId(item) {
  if (!item) return null;
  const id = Number(item.tmdb_id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function generateUniversalServers(item) {
  if (!item) return [];

  const raw = [];
  const declared = Array.isArray(item.players)
    ? item.players
    : Array.isArray(item.player)
      ? item.player
      : item.players || item.player
        ? [item.players || item.player]
        : [];

  raw.push(...declared);
  if (item.url) raw.push({ url: item.url, source: item.source, quality: item.quality });
  if (item.stream_url) raw.push({ url: item.stream_url, source: item.source, quality: item.quality });

  const seen = new Set();
  return raw.flatMap((entry, index) => {
    const url = typeof entry === 'string' ? entry : entry?.url;
    if (!isSafeHttpUrl(url) || seen.has(url)) return [];
    seen.add(url);
    const type = detectStreamType(url, typeof entry === 'object' ? entry.source || entry.type : '');
    return [{
      id: entry?.id || `source-${index + 1}`,
      name: entry?.name || entry?.translator || `Source ${index + 1}`,
      url,
      source: type,
      type,
      quality: entry?.quality || null,
      headers: entry?.headers || {},
      provider: entry?.provider || item.provider || item.network || null
    }];
  });
}
