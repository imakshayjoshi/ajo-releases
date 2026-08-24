import { isSafeHttpUrl } from '../utils/streamingEngines.js';
import { isFavoriteChannel } from './history.js';

/**
 * Live sports channels — DYNAMIC source (health fix 2026-08-21).
 *
 * The previous hardcoded list pointed at dtv2023.top and stream.sportzfy.xyz,
 * both of which no longer resolve in DNS — the entire sports rail was dead.
 * Guessed replacement URLs (cricfy.live/stream/*.m3u8) also returned 404:
 * that host is a WordPress landing page, not a stream CDN.
 *
 * Instead of hardcoding more URLs that will rot, we now derive the sports
 * rail at runtime from the iptv-org India playlist (the same source the Live
 * TV tab already uses, ~700+ channels) by filtering for sports groups and
 * known sports channel names. Channels appear only while their playlist
 * entries exist, so the rail can never show a structurally dead channel.
 */

const PLAYLIST_SOURCES = [
  'https://iptv-org.github.io/iptv/countries/in.m3u',
  'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_in.m3u'
];

const SPORTS_NAME_PATTERNS = [
  /star\s?sports/i, /sony\s?(sports\s?)?(ten|espn)/i, /willow/i, /astro\s?cricket/i,
  /tensports?/i, /sports18/i, /dd\s?sports/i, /eurosport/i, /sky\s?sports/i,
  /esp(n|n\s?sports?)/i, /cricket/i, /wwe/i, /nba\s?tv/i, /ten\s?1|ten\s?2|ten\s?5/i
];

const SPORTS_GROUP_PATTERNS = [/sport/i, /cricket/i, /football/i, /outdoor/i];

function parseM3U(content) {
  if (!content) return [];
  const channels = [];
  let pending = null;
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('#EXTINF:')) {
      const attr = (name) => line.match(new RegExp(name + '="([^"]*)"', 'i'))?.[1] || '';
      pending = {
        id: attr('tvg-id'),
        poster: attr('tvg-logo'),
        category: attr('group-title') || 'Live TV',
        title: line.slice(line.lastIndexOf(',') + 1).trim()
      };
    } else if (pending && /^https?:\/\//i.test(line)) {
      pending.url = line;
      channels.push(pending);
      pending = null;
    }
  }
  return channels;
}

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
    if (events.length >= 24) break;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(playlistUrl, { signal: controller.signal, cache: 'no-store' });
      clearTimeout(timer);
      if (!response.ok) continue;
      const channels = parseM3U(await response.text()).filter(isSportsChannel);

      for (const ch of channels) {
        if (events.length >= 24) break;
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
