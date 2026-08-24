import { isSafeHttpUrl } from '../utils/streamingEngines.js';
import { isFavoriteChannel } from './history.js';
import { parseM3U } from './iptv.js';

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

/** Dedupe by normalized title, prefer https entries, cap list size. */
export async function getLiveSportsEvents() {
  const seen = new Set();
  const events = [];

  for (const playlistUrl of PLAYLIST_SOURCES) {
    if (events.length >= 30) break;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(playlistUrl, { signal: controller.signal, cache: 'no-store' });
      clearTimeout(timer);
      if (!response.ok) continue;
      const channels = parseM3U(await response.text()).filter(isSportsChannel);

      for (const ch of channels) {
        if (events.length >= 30) break;
        if (!ch.url || !isSafeHttpUrl(ch.url)) continue;
        const key = ch.title.toLowerCase().replace(/[^a-z0-9]/g, '');
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

