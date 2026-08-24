/**
 * VPS Mirror Health Service
 *
 * Fetches the live mirror ranking from the AJO health-checker (runs on the
 * Hostinger VPS, refreshed every 10 min). Dead mirrors are pushed to the back
 * of the server queue BEFORE the user ever taps play.
 *
 * Endpoint: http://srv1370827.hstgr.cloud:3003/health.json
 */

const HEALTH_URL = 'http://srv1370827.hstgr.cloud:3003/health.json';
const CACHE_KEY = 'ajo_mirror_health';
const CACHE_TTL = 10 * 60 * 1000; // matches VPS refresh cadence

let cachedRanking = null;

export async function getMirrorHealth() {
  // memory cache first
  if (cachedRanking && Date.now() - cachedRanking.fetchedAt < CACHE_TTL) {
    return cachedRanking.data;
  }
  // localStorage cache second (instant on app restart)
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.fetchedAt < CACHE_TTL) {
        cachedRanking = parsed;
        return parsed.data;
      }
    }
  } catch {}

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(HEALTH_URL, { signal: controller.signal, cache: 'no-store' });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    cachedRanking = { fetchedAt: Date.now(), data };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cachedRanking)); } catch {}
    return data;
  } catch {
    // Health service unreachable — return null, app proceeds with default order
    return null;
  }
}

/**
 * Reorder a server queue: healthy mirrors first (by latency), dead mirrors last.
 * Servers not tracked by the health service keep their original relative order
 * in the middle. Never removes servers — only reorders.
 */
export function rankServersByHealth(servers, health) {
  if (!health || !Array.isArray(health.mirrors) || !Array.isArray(servers)) {
    return servers;
  }
  const statusByName = {};
  for (const m of health.mirrors) {
    statusByName[m.name.toLowerCase()] = { ok: m.ok, ms: m.ms };
  }

  const hostOf = (url) => {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
  };

  const scored = servers.map((srv, idx) => {
    const host = hostOf(srv?.url || '');
    // match host against known mirror keys (suffix match: s95.upstreamcdn.co → upstream.to won't match, but autoembed.co will)
    let match = null;
    for (const [name, st] of Object.entries(statusByName)) {
      if (host === name || host.endsWith('.' + name)) { match = { name, ...st }; break; }
    }
    return {
      srv,
      idx,
      tier: match ? (match.ok ? 0 : 2) : 1, // 0=healthy, 1=unknown, 2=dead
      ms: match?.ms ?? 9999
    };
  });

  scored.sort((a, b) => a.tier - b.tier || a.ms - b.ms || a.idx - b.idx);
  return scored.map(s => s.srv);
}

/**
 * Convenience: fetch health (cached) and rank a server list in one call.
 */
export async function getRankedServers(servers) {
  const health = await getMirrorHealth();
  return rankServersByHealth(servers, health);
}
