// v3.4.1: background stream-health sweep — after the first catalog paint,
// probe the FIRST direct source of the items currently on screen and mark
// confirmed-dead titles so they disappear from the catalog. Only a hard
// 404/410 marks an item dead (403/401/network can be UA gates or blips and
// must NOT hide working content). Bounded: 12 items, one probe each, 4s
// timeout, runs once per app launch.
import { markItemDead, getDeadItemIds } from '../api/history';

function firstDirectUrl(item) {
  const players = Array.isArray(item?.players) ? item.players
    : Array.isArray(item?.player) ? item.player : [];
  for (const p of players) {
    const u = p?.url || '';
    if (/^https?:\/\//i.test(u) && /\.m3u8(\?|$)|\/getm3u8\/|\.mp4(\?|$)/i.test(u)) return u;
  }
  const u = item?.stream_url || item?.url || '';
  if (/^https?:\/\//i.test(u) && /\.m3u8(\?|$)|\/getm3u8\/|\.mp4(\?|$)/i.test(u)) return u;
  return null;
}

export function runStreamHealthSweep(items, { max = 12, timeoutMs = 4000 } = {}) {
  if (!Array.isArray(items) || !items.length) return;
  const dead = getDeadItemIds();
  const candidates = [];
  const seen = new Set();
  for (const item of items) {
    if (!item || !item.id || dead.has(String(item.id)) || seen.has(String(item.id))) continue;
    if (item.is_live || item.type === 'live') continue; // live wall has its own probe lane
    const url = firstDirectUrl(item);
    if (!url) continue; // embed-only items can't be probed safely
    seen.add(String(item.id));
    candidates.push({ id: String(item.id), url });
    if (candidates.length >= max) break;
  }
  // fire-and-forget, staggered so we never burst the sources
  candidates.forEach((c, idx) => {
    setTimeout(async () => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        // Range-GET 1 byte: HEAD is blocked by more CDNs than range GETs.
        const res = await fetch(c.url, {
          method: 'GET',
          headers: { Range: 'bytes=0-0' },
          signal: controller.signal,
          cache: 'no-store'
        });
        clearTimeout(timer);
        if (res.status === 404 || res.status === 410) {
          markItemDead(c.id);
        }
        try { await res.body?.cancel?.(); } catch {}
      } catch {
        // abort/DNS/CORS — inconclusive, never mark dead
      }
    }, 600 + idx * 450);
  });
}
