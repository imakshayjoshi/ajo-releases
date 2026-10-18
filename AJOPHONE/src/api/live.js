/**
 * AJO Live Channels — Elite Streams feed merge (v3.12.64)
 *
 * Source: https://new.ajo.co.in/live/channels.json — VPS aggregator that
 * merges Elite Streams' live feeds (jio-tv-api, premiumplugx jiostb,
 * hotstar, sliv, zee5, yupp, dangal, biggboss), health-checks every
 * manifest, and normalizes categories. Refreshes every 15 min server-side.
 *
 * Channel shape:
 *   { id, name, logo, category, lang, url, kind: 'hls'|'dash',
 *     drm: {type:'clearkey', keys:[[kid,key],...]} | null,
 *     headers: {Cookie|User-Agent|Referer|Origin} | null }
 *
 * DRM channels need the native ClearKey path (media3 in PlayerActivity).
 * All others are direct HLS — handed straight to ExoPlayer.
 */

const LIVE_URL = 'https://new.ajo.co.in/live/channels.json';
const CACHE_KEY = 'ajo_live_channels_v1';
const TTL = 10 * 60 * 1000; // 10 min client cache (server refreshes 15 min)

export function normalizeLiveChannel(raw) {
  if (!raw || !raw.url) return null;
  const name = String(raw.name || 'Live Channel').trim();
  return {
    id: raw.id || name.toLowerCase().replace(/\s+/g, '-'),
    title: name,
    title_en: name,
    name,
    poster: raw.logo || '',
    logo: raw.logo || '',
    category: raw.category || 'Entertainment',
    lang: raw.lang || '',
    url: raw.url,
    players: [{ url: raw.url, label: 'Live', drm: raw.drm, headers: raw.headers, kind: raw.kind }],
    is_live: true,
    type: 'live',
    year: 'LIVE',
    drm: raw.drm || null,
    headers: raw.headers || null,
    kind: raw.kind || 'hls',
    source: raw.source || 'ajo-live'
  };
}

export async function getLiveChannels() {
  // localStorage cache first (stick is slow, 190-channel payload ~100KB)
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { t, channels } = JSON.parse(cached);
      if (Date.now() - t < TTL && Array.isArray(channels) && channels.length) {
        return channels.map(normalizeLiveChannel).filter(Boolean);
      }
    }
  } catch { /* corrupt cache — refetch */ }

  const res = await fetch(LIVE_URL, { signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined });
  if (!res.ok) throw new Error('live catalog http ' + res.status);
  const data = await res.json();
  const channels = Array.isArray(data.channels) ? data.channels : [];
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), channels }));
  } catch { /* storage full — fine */ }
  return channels.map(normalizeLiveChannel).filter(Boolean);
}

export function groupByCategory(channels) {
  const groups = new Map();
  for (const ch of channels) {
    const cat = ch.category || 'Entertainment';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(ch);
  }
  return groups;
}
