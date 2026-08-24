import { isSafeHttpUrl } from '../utils/streamingEngines.js';
import { isFavoriteChannel } from './history.js';
import { parseM3U, normalizeChannelKey } from './iptv.js';

/**
 * Live sports channels — DYNAMIC source.
 *
 * Derives the sports rail at runtime from iptv-org playlists by filtering
 * for sports groups and known sports channel names.
 *
 * v3.9.0 FIX: removed the serial isStreamLive() per-channel HTTP probe.
 * It was doing up to 24 sequential 4-second-timeout fetches, blocking the
 * entire app startup for up to 96 seconds. Dead channels are now handled
 * by the native player's automatic multi-server failover (<1s recovery).
 */

const PLAYLIST_SOURCES = [
  'https://iptv-org.github.io/iptv/categories/sports.m3u'
];

const SPORTS_NAME_PATTERNS = [
  /star\s?sports/i, /sony\s?(sports\s?)?(ten|espn)/i, /willow/i, /astro\s?cricket/i,
  /tensports?/i, /sports18/i, /dd\s?sports/i, /eurosport/i, /sky\s?sports/i,
  /esp(n|n\s?sports?)/i, /cricket/i, /wwe/i, /nba\s?tv/i, /ten\s?1|ten\s?2|ten\s?5/i
];

const SPORTS_GROUP_PATTERNS = [/sport/i, /cricket/i, /football/i, /outdoor/i];

function isSportsChannel(ch) {
  const group = String(ch.category || '');
  const name = String(ch.title || '');
  if (SPORTS_GROUP_PATTERNS.some((p) => p.test(group))) return true;
  return SPORTS_NAME_PATTERNS.some((p) => p.test(name));
}

/** v3.10.0: cap raised 30 -> 200; dedupe via shared normalizeChannelKey. */
export async function getLiveSportsEvents() {
  const seen = new Set();
  const events = [];

  // v3.11.2 FIX: NTV live-sports JSON API — the one verified-working source
  // recovered from the Streamzy payload APK (base_apk_decompiled turned out
  // to be a non-streaming habit app; of all its scraper targets only NTV's
  // API is alive today). Adds real fixtures (cricket, football, tennis) that
  // iptv-org sports mirrors often miss. Watch URLs render in the app's embed
  // player (no X-Frame-Options block, verified 2026-08-25).
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    const response = await fetch('https://ntv.cx/api/get-matches?server=kobra', {
      signal: controller.signal, cache: 'no-store'
    });
    clearTimeout(timer);
    if (response.ok) {
      const data = await response.json();
      const all = Array.isArray(data?.all) ? data.all : [];
      for (const m of all) {
        if (events.length >= 200 || !m || !m.id || !m.title) continue;
        const key = normalizeChannelKey(m.title);
        if (!key || seen.has(key)) continue; // keep iptv-org native HLS when titles collide
        seen.add(key);
        const isCricket = /cricket/i.test(m.category + ' ' + m.title);
        const watchUrl = `https://ntv.cx/watch/${m.id}`;
        const item = {
          id: `ntv-${m.id}`,
          title: m.title,
          title_en: m.title,
          category: isCricket ? 'Cricket' : /football|soccer/i.test(m.category) ? 'Football' : 'Sports',
          poster: m.poster ? (m.poster.startsWith('http') ? m.poster : `https://ntv.cx${m.poster}`) : '',
          poster_url: m.poster ? (m.poster.startsWith('http') ? m.poster : `https://ntv.cx${m.poster}`) : '',
          is_live: true,
          type: 'live',
          year: 'LIVE',
          url: watchUrl,
          stream_url: watchUrl,
          playable: true,
          server: 'NTV Live Sports',
          players: [{ name: 'NTV Live (HD)', url: watchUrl, source: 'embed', quality: 'HD' }],
          player: [{ name: 'NTV Live (HD)', url: watchUrl, source: 'embed', quality: 'HD' }]
        };
        item.is_favorite = isFavoriteChannel(item);
        events.push(item);
      }
    }
  } catch {
    // NTV unreachable — fall back to playlist sources only
  }

  for (const playlistUrl of PLAYLIST_SOURCES) {
    if (events.length >= 200) break;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(playlistUrl, { signal: controller.signal, cache: 'no-store' });
      clearTimeout(timer);
      if (!response.ok) continue;
      const channels = parseM3U(await response.text()).filter(isSportsChannel);

      for (const ch of channels) {
        if (events.length >= 200) break;
        if (!ch.url || !isSafeHttpUrl(ch.url)) continue;
        const key = normalizeChannelKey(ch.title);
        if (!key || seen.has(key)) continue;
        seen.add(key);

        const item = {
          id: `sports-${key}`,
          title: ch.title,
          title_en: ch.title,
          category: /cricket/i.test(ch.title) || /cricket/i.test(ch.category) ? 'Cricket'
            : /football|soccer/i.test(ch.title + ch.category) ? 'Football'
            : 'Sports',
          poster: ch.poster,
          poster_url: ch.poster,
          is_live: true,
          type: 'live',
          year: 'LIVE',
          url: ch.url,
          stream_url: ch.url,
          playable: true,
          players: [{ name: 'Live Stream', url: ch.url, source: 'hls', quality: 'Auto' }],
          player: [{ name: 'Live Stream', url: ch.url, source: 'hls', quality: 'Auto' }]
        };
        item.is_favorite = isFavoriteChannel(item);
        events.push(item);
      }
    } catch {
      // Try next playlist source
    }
  }

  return events;
}

