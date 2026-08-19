const HLS_PATTERNS = [/\.m3u8(?:$|\?)/i, /\/getm3u8\//i, /\/getstream\//i, /\/live\//i, /\/playlist/i];
const DASH_PATTERNS = [/\.mpd(?:$|\?)/i];
const VIDEO_PATTERNS = [/\.(mp4|m4v|webm|mkv)(?:$|\?)/i];
const EMBED_PATTERNS = [/apiplayer\.ru/i, /vidlink\.pro/i, /vidsrc\.to/i, /autoembed\.co/i, /\/embed\//i, /rasta428jem\.com/i, /\/play\//i];

export function isSafeHttpUrl(value) {
  if (!value || typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function isEmbedUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return EMBED_PATTERNS.some(pattern => pattern.test(url));
}

export function detectStreamType(url, declaredType = '') {
  const cleanType = String(declaredType || '').toLowerCase();
  if (cleanType === 'm3u8' || cleanType === 'hls' || HLS_PATTERNS.some(pattern => pattern.test(url || ''))) return 'hls';
  if (cleanType === 'video' || cleanType === 'mp4' || VIDEO_PATTERNS.some(pattern => pattern.test(url || ''))) return 'video';
  if (cleanType === 'dash' || cleanType === 'mpd' || DASH_PATTERNS.some(pattern => pattern.test(url || ''))) return 'dash';
  if (cleanType === 'embed' || cleanType === 'iframe' || isEmbedUrl(url)) return 'embed';
  return 'hls'; // Default all unclassified streaming URLs to HLS media pipeline
}

export async function resolveTmdbId(item) {
  if (!item) return null;
  const id = Number(item.tmdb_id || item.movie_id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** Synchronous TMDB id lookup used when building the server list. */
function tmdbIdOf(item) {
  const id = Number(item?.tmdb_id || item?.movie_id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * APIPlayer.ru embed mirror — a web-backup source used when every direct
 * HLS/MP4 server is down. Requires a TMDB id, so items without one get no
 * mirror. Always ranked after direct streams: an iframe cannot be handed to
 * the native ExoPlayer activity, so on Fire TV it is a last resort.
 */
function buildApiPlayerMirror(item) {
  const tmdbId = tmdbIdOf(item);
  if (!tmdbId) return null;

  const isSeries = item.category === 'serials'
    || item.type === 'series'
    || item.type === 'serial'
    || item.type === 'tv';
  const kind = isSeries ? 'tv' : 'movie';

  return {
    id: 'apiplayer-mirror',
    name: 'Web Backup Mirror (APIPlayer)',
    url: `https://apiplayer.ru/embed/${kind}/${tmdbId}?color=38bdf8&auto=1`,
    source: 'embed',
    provider: 'apiplayer',
    quality: 'Auto'
  };
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
  if (item.stream_url) raw.push({ url: item.stream_url, source: 'm3u8', quality: item.quality, name: item.server_name || 'Primary Stream' });
  if (item.url) raw.push({ url: item.url, source: 'm3u8', quality: item.quality, name: item.server_name || 'Direct Stream' });

  // Separate direct playable streams (HLS/MP4) from embed/iframe mirrors
  const directStreams = [];
  const embedStreams = [];

  raw.forEach(entry => {
    const url = typeof entry === 'string' ? entry : entry?.url;
    if (!isSafeHttpUrl(url)) return;
    const declaredSrc = typeof entry === 'object' ? String(entry.source || entry.type || '').toLowerCase() : '';
    
    // Direct stream check
    const isDirect = declaredSrc === 'm3u8' || 
                     declaredSrc === 'mp4' || 
                     declaredSrc === 'video' || 
                     HLS_PATTERNS.some(p => p.test(url)) || 
                     VIDEO_PATTERNS.some(p => p.test(url));

    if (isDirect && declaredSrc !== 'iframe' && declaredSrc !== 'embed') {
      directStreams.push(entry);
    } else {
      embedStreams.push(entry);
    }
  });

  // Always put direct, high-speed HLS streams FIRST for TV & Mobile, then
  // embed mirrors, then the APIPlayer web-backup mirror as a final fallback.
  const orderedList = [...directStreams, ...embedStreams];
  const apiPlayerMirror = buildApiPlayerMirror(item);
  if (apiPlayerMirror) orderedList.push(apiPlayerMirror);

  const seen = new Set();
  return orderedList.flatMap((entry, index) => {
    const url = typeof entry === 'string' ? entry : entry?.url;
    if (!isSafeHttpUrl(url) || seen.has(url)) return [];
    seen.add(url);
    const type = detectStreamType(url, typeof entry === 'object' ? entry.source || entry.type : '');
    
    // Friendly naming with language/source clarity
    let name = entry?.name || entry?.translator;
    if (!name) {
      if (type === 'hls' || type === 'video') {
        name = `Server ${index + 1}: Direct HD (${type.toUpperCase()})`;
      } else {
        name = `Server ${index + 1}: Web Backup Mirror`;
      }
    }

    return [{
      id: entry?.id || `source-${index + 1}`,
      name,
      url,
      source: type,
      type,
      quality: entry?.quality || 'Auto 1080p/720p',
      headers: entry?.headers || {},
      provider: entry?.provider || item.provider || item.network || 'AJO SuperCDN'
    }];
  });
}
