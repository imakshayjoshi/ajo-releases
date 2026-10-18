/**
 * Mirror failure memory — v3.12.61.
 *
 * Problem: when a mirror stalls or 403s mid-session, failover moves to the
 * next server — but the NEXT session (or a retry) starts again at Server 1,
 * which is often the same dead mirror. The user re-experiences the exact
 * failure they just watched us handle.
 *
 * This module keeps a small localStorage map host -> { fails, lastFail }
 * (capped, oldest evicted) that ranking and retries consult:
 *   - hosts with 2+ recent failures sort AFTER hosts with none
 *   - failures older than 12h decay (mirrors recover; their outages are
 *     usually brief) so a bad night doesn't permanently blacklist a host
 *   - markMirrorFailed(url) is fire-and-forget and never throws
 */
const KEY = 'ajo_mirror_failures_v1';
const MAX_ENTRIES = 60;
const DECAY_MS = 12 * 60 * 60 * 1000; // 12h

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const obj = raw ? JSON.parse(raw) : {};
    // prune decayed + cap entries on load
    const now = Date.now();
    const out = {};
    let count = 0;
    for (const [host, rec] of Object.entries(obj)) {
      if (!rec || typeof rec !== 'object') continue;
      if (rec.lastFail && now - rec.lastFail > DECAY_MS) continue; // decayed
      out[host] = { fails: Number(rec.fails) || 1, lastFail: Number(rec.lastFail) || now };
      count += 1;
      if (count >= MAX_ENTRIES) break;
    }
    return out;
  } catch {
    return {};
  }
}

function save(map) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch { /* quota: memory is best-effort only */ }
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/** Record a mirror failure. Fire-and-forget. */
export function markMirrorFailed(url) {
  try {
    if (!url) return;
    const host = hostOf(url);
    if (!host) return;
    const map = load();
    const prev = map[host] || { fails: 0, lastFail: 0 };
    map[host] = { fails: (prev.fails || 0) + 1, lastFail: Date.now() };
    save(map);
  } catch {}
}

/**
 * Sort servers so mirrors with recent repeated failures move to the end.
 * Unknown hosts keep their incoming relative order (stable-ish by index).
 * Never removes a server — the mirror might be fine for this title.
 */
export function deprioritizeFailedMirrors(servers) {
  try {
    if (!Array.isArray(servers) || servers.length < 2) return servers;
    const map = load();
    if (Object.keys(map).length === 0) return servers;
    const score = (srv) => {
      const host = hostOf(srv?.url || '');
      const rec = map[host];
      if (!rec) return 0;
      // 2+ failures in the window = burned; 1 failure = slight penalty
      return (rec.fails >= 2 ? 1000 : 1) * (rec.lastFail && Date.now() - rec.lastFail < DECAY_MS ? 1 : 0);
    };
    const scored = servers.map((srv, idx) => ({ srv, idx, s: score(srv) }));
    scored.sort((a, b) => a.s - b.s || a.idx - b.idx);
    return scored.map((x) => x.srv);
  } catch {
    return servers;
  }
}
