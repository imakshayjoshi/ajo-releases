/**
 * Catch-Up TV — replay content that aired on a live channel in the past days.
 *
 * Two supported backends:
 *  1. Xtream Codes portals (user config in Settings): timeshift + catchup APIs
 *     - /player_api.php?action=get_vod_streams style catchup listing
 *     - timeshift: /streaming/timeshift.php?username=&password=&stream=&start=&duration=
 *  2. HLS catchup: many IPTV providers expose ?...catchup... or
 *     #EXTVLCOPT http-referrer style URLs with a "catchup" attribute in M3U
 *     (catchup="1" catchup-source="?utc={start}&lutc={now}").
 *     We rewrite the channel URL with utc start/duration params.
 *
 * The M3U parser now captures catchup attrs so channels that support it are
 * flagged, and this module builds playable catch-up URLs for a chosen
 * date/time window.
 */

const CATCHUP_KEY = 'ajo_catchup_channels_v1';

// ---- parse helpers (mirror iptv.js attribute extraction) ----

export function extractCatchupAttrs(line) {
  const attr = (name) => {
    const m = line.match(new RegExp(`${name}="([^"]*)"`, 'i'));
    return m ? m[1] : '';
  };
  const has = attr('catchup');
  if (!has || has === '0' || has === 'default') return null;
  return {
    catchup: has,                       // 1 | default | flare | xtimate
    catchupSource: attr('catchup-source'),
    catchupDays: parseInt(attr('catchup-days') || '7', 10) || 7,
    tvgId: attr('tvg-id')
  };
}

/**
 * Build a playable catch-up URL for a channel at a given start time.
 * @param {Object} channel - normalized channel item with url + catchup meta
 * @param {Date} startAt - when the programme started
 * @param {number} durationMin - how many minutes to watch
 * @returns {string|null} playable URL or null if unsupported
 */
export function buildCatchupUrl(channel, startAt, durationMin = 120) {
  if (!channel?.url) return null;
  const start = Math.floor(startAt.getTime() / 1000);
  const now = Math.floor(Date.now() / 1000);
  const dur = Math.min(durationMin, Math.max(1, Math.floor((now - start) / 60)));

  // Style 1: {utc}/{lutc} template in catchup-source or url
  const template = channel.catchupSource || channel.url;
  if (template.includes('{utc}') || template.includes('{lutc}') || template.includes('{duration}')) {
    return template
      .replace(/{utc}/g, String(start))
      .replace(/{lutc}/g, String(now))
      .replace(/{duration}/g, String(dur * 60))
      .replace(/{Y}/g, String(startAt.getFullYear()))
      .replace(/{m}/g, String(startAt.getMonth() + 1).padStart(2, '0'))
      .replace(/{d}/g, String(startAt.getDate()).padStart(2, '0'))
      .replace(/{H}/g, String(startAt.getHours()).padStart(2, '0'))
      .replace(/{M}/g, String(startAt.getMinutes()).padStart(2, '0'));
  }

  // Style 2: plain HLS with utc/lutc query params appended
  const joiner = channel.url.includes('?') ? '&' : '?';
  return `${channel.url}${joiner}utc=${start}&lutc=${now}`;
}

/**
 * List available catch-up windows for a channel (last N days, hourly blocks).
 * UI shows "Today, Yesterday, 2 days ago..." with time slots.
 */
export function getCatchupWindows(channel, daysBack = null) {
  const maxDays = Math.min(daysBack || channel?.catchupDays || 7, 7);
  const windows = [];
  const now = new Date();
  for (let d = 0; d < maxDays; d++) {
    const day = new Date(now);
    day.setDate(now.getDate() - d);
    windows.push({
      label: d === 0 ? 'Today' : d === 1 ? 'Yesterday' : `${d} days ago`,
      date: day,
      // 30-min slots from 6:00 to current hour (today) or full day (past)
      slots: buildSlots(day, d === 0 ? now.getHours() : 23)
    });
  }
  return windows;
}

function buildSlots(day, upToHour) {
  const slots = [];
  for (let h = 0; h <= upToHour; h += 1) {
    for (let m = 0; m < 60; m += 30) {
      const s = new Date(day);
      s.setHours(h, m, 0, 0);
      if (s.getTime() > Date.now()) break;
      slots.push({
        label: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
        start: s
      });
      if (m === 30) break; // hourly granularity keeps the list short
    }
  }
  return slots.reverse(); // most recent first
}

/**
 * Parse Xtream portal credentials from a portal URL if the user added one.
 * e.g. http://host:port/live/username/password/12345.m3u8
 */
export function parseXtreamFromUrl(url) {
  const m = url.match(/^https?:\/\/([^/]+)\/(?:live|movie)\/([^/]+)\/([^/]+)\/(\d+)(?:\.m3u8)?$/i);
  if (!m) return null;
  return { host: m[1], username: m[2], password: m[3], streamId: m[4] };
}

/**
 * Xtream timeshift URL (for portals).
 */
export function buildXtreamTimeshiftUrl(xtream, startAt, durationMin = 120) {
  if (!xtream) return null;
  const start = Math.floor(startAt.getTime() / 1000);
  return `http://${xtream.host}/streaming/timeshift.php?username=${encodeURIComponent(xtream.username)}&password=${encodeURIComponent(xtream.password)}&stream=${xtream.streamId}&start=${start}&duration=${durationMin}`;
}
