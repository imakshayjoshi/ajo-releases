/**
 * Watchlist Sync — shares favorites between Phone and TV over the cast channel.
 *
 * Merge policy: union by title, latest `lastWatched`/`addedAt` wins.
 * Phone is the source of truth when pushing; TV merges on receipt.
 */
import { castEngine } from './castSync';

const WATCHLIST_KEY = 'ajo_watchlist_v1';

export function getWatchlist() {
  try {
    return JSON.parse(localStorage.getItem(WATCHLIST_KEY) || '[]');
  } catch {
    return [];
  }
}

export function isInWatchlist(item) {
  if (!item) return false;
  return getWatchlist().some(w => w.title === item.title);
}

export function toggleWatchlist(item) {
  if (!item) return getWatchlist();
  const list = getWatchlist();
  const idx = list.findIndex(w => w.title === item.title);
  if (idx !== -1) {
    list.splice(idx, 1);
  } else {
    list.unshift({
      id: item.id,
      title: item.title,
      type: item.type,
      category: item.category,
      poster_url: item.poster_url || item.poster,
      backdrop_url: item.backdrop_url,
      tmdb_id: item.tmdb_id,
      year: item.year,
      rating: item.rating,
      addedAt: Date.now()
    });
  }
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list.slice(0, 100)));
  pushWatchlist(list);
  return list;
}

/** Push local watchlist to the paired TV (fire-and-forget). */
export function pushWatchlist(items) {
  try {
    castEngine.sendToTV({ type: 'WATCHLIST_SYNC', items: items || getWatchlist() });
  } catch {}
}

/**
 * Merge a remote watchlist into local storage (TV side, on receive).
 * Returns the merged list.
 */
export function mergeRemoteWatchlist(remoteItems) {
  if (!Array.isArray(remoteItems) || remoteItems.length === 0) return getWatchlist();
  const local = getWatchlist();
  const byTitle = new Map(local.map(w => [w.title, w]));
  for (const r of remoteItems) {
    const existing = byTitle.get(r.title);
    if (!existing || (r.addedAt || 0) > (existing.addedAt || 0)) {
      byTitle.set(r.title, r);
    }
  }
  const merged = [...byTitle.values()]
    .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
    .slice(0, 100);
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(merged));
  return merged;
}
