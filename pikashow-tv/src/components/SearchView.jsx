import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search as SearchIcon, X } from 'lucide-react';
import { loadCatalog, getLiveBroadcasts } from '../api/pikashow';
import { filterAliveItems } from '../api/history.js';
import { MediaRail } from './MediaRail';

/**
 * SearchView v3.17.8 — rebuilt around how the app is actually used:
 *  - NO on-screen keyboard (the TV's native IME pops up on input focus —
 *    the old QWERTY panel stole 60% of the screen and squeezed results into
 *    a 40% column).
 *  - Results paint PROGRESSIVELY per source (movibox → TMDB → YouTube →
 *    local/live) instead of waiting for the slowest one.
 *  - Results grouped into category rails: Movies / Series / Live TV / Anime /
 *    YouTube — full width, Netflix-style.
 *  - Per-query session cache: retyping a query is instant.
 *  - 200ms debounce (was 300), out-of-order guard kept.
 */
const RECENTS_KEY = 'ajo_recent_searches_v1';
const MAX_RECENTS = 8;

const CATEGORY_ORDER = [
  ['movies', 'Movies'],
  ['series', 'Series'],
  ['live', 'Live TV'],
  ['anime', 'Anime'],
  ['youtube', 'YouTube'],
];

function categoryOf(item) {
  if (item.is_live) return 'live';
  if (item.is_youtube) return 'youtube';
  if (item.anime || item.type === 'anime') return 'anime';
  if (item.type === 'series' || item.type === 'tv') return 'series';
  return 'movies';
}

function groupResults(items) {
  const groups = new Map();
  for (const item of items) {
    const cat = categoryOf(item);
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(item);
  }
  return CATEGORY_ORDER
    .filter(([key]) => groups.has(key))
    .map(([key, label]) => ({ key, label, items: groups.get(key) }));
}

function loadRecents() {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    return raw ? JSON.parse(raw).filter((x) => typeof x === 'string') : [];
  } catch { return []; }
}
function saveRecents(list) {
  try { localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, MAX_RECENTS))); } catch {}
}

// session result cache — same query twice = instant
const queryCache = new Map();

export function SearchView({ onSelectItem, initialQuery }) {
  const [query, setQuery] = useState(initialQuery || '');
  const [groups, setGroups] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [recents, setRecents] = useState(loadRecents);
  const inputRef = useRef(null);
  const reqSeqRef = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => {
      const active = document.activeElement;
      if (!active || active === document.body || active.tagName === 'BUTTON') {
        try { inputRef.current?.focus({ preventScroll: true }); } catch {}
      }
    }, 120);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const clean = query.trim().toLowerCase();
    if (!clean) {
      setGroups(null);
      setTotalCount(0);
      setIsSearching(false);
      return;
    }
    const cached = queryCache.get(clean);
    if (cached) {
      setGroups(groupResults(cached));
      setTotalCount(cached.length);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(() => {
      const id = ++reqSeqRef.current;
      const merged = [];
      const seen = new Set();
      let pending = 4;

      const push = (items) => {
        if (reqSeqRef.current !== id || !Array.isArray(items)) return;
        for (const item of items) {
          if (!item) continue;
          const key = `${(item.title || item.name || '').toLowerCase().trim()}:${item.type || 'movie'}:${item.is_live ? 'L' : ''}${item.is_youtube ? 'Y' : ''}`;
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(item);
        }
        const alive = filterAliveItems(merged);
        setGroups(groupResults(alive));
        setTotalCount(alive.length);
      };
      const done = () => {
        if (reqSeqRef.current !== id) return;
        if (--pending === 0) {
          setIsSearching(false);
          queryCache.set(clean, merged.slice());
          if (queryCache.size > 40) queryCache.delete(queryCache.keys().next().value);
          try {
            import('../api/analytics').then((m) => m.trackSearchQuery(query, merged.length)).catch(() => {});
          } catch {}
        }
      };

      // 1. Local catalog + live (fast, already cached after home load)
      Promise.allSettled([loadCatalog(), getLiveBroadcasts()]).then(([cat, live]) => {
        const localItems = [
          ...(cat.status === 'fulfilled' ? (cat.value.all || []) : []),
          ...(live.status === 'fulfilled' ? live.value : []),
        ];
        push(localItems.filter((item) =>
          `${item.title} ${item.category || ''}`.toLowerCase().includes(clean)));
        done();
      });

      // 2. Movibox (direct MP4s — best quality)
      import('../api/movibox.js')
        .then((m) => m.searchMovibox(clean))
        .then((items) => { push(items); done(); })
        .catch(() => done());

      // 3. TMDB (deep catalog)
      import('../api/tmdb.js')
        .then((m) => m.searchTmdb(clean))
        .then((items) => { push(items); done(); })
        .catch(() => done());

      // 4. YouTube (piped)
      import('../api/youtube.js')
        .then((m) => m.searchYouTubeVideos(clean))
        .then((items) => { push(items); done(); })
        .catch(() => done());
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const commitSearch = useCallback((q) => {
    const clean = String(q || '').trim();
    if (!clean) return;
    setRecents((prev) => {
      const next = [clean, ...prev.filter((x) => x.toLowerCase() !== clean.toLowerCase())];
      saveRecents(next);
      return next.slice(0, MAX_RECENTS);
    });
  }, []);

  return (
    <div className="tv-search-container" style={{ padding: '0 48px' }}>
      {/* Full-width search bar — the TV's native keyboard pops on focus */}
      <div className="tv-search-input-box" style={{
        margin: '10px 0 22px',
        maxWidth: 860,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <SearchIcon size={24} color="#00BB7F" />
        <input
          ref={inputRef}
          type="text"
          className="tv-search-input"
          placeholder="Search movies, series, anime, live TV..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onBlur={() => commitSearch(query)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') return; // fall through to spatial nav
            if (e.key === 'Backspace' || e.key === 'Delete') e.stopPropagation();
            // v3.17.15: the TV IME eats D-pad keys while open — Enter submits,
            // dismisses the keyboard, and lands focus on the first result.
            if (e.key === 'Enter') {
              e.preventDefault();
              commitSearch(query);
              try { inputRef.current?.blur(); } catch {}
              setTimeout(() => {
                try {
                  const first = document.querySelector('.tv-search-container .tv-rail .tv-card')
                    || document.querySelector('.tv-search-container .tv-cat-btn');
                  first?.focus({ preventScroll: true });
                } catch {}
              }, 150);
            }
          }}
          tabIndex={0}
          style={{ flex: 1 }}
        />
        {query && (
          <button
            className="tv-cat-btn"
            onClick={() => setQuery('')}
            tabIndex={0}
            aria-label="Clear search"
            style={{ padding: '6px 12px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <X size={14} /> Clear
          </button>
        )}
      </div>

      {/* Results header */}
      {query.trim() !== '' && (
        <h3 style={{
          fontSize: '1.05rem',
          fontWeight: 800,
          marginBottom: '14px',
          color: '#ffffff',
        }}>
          {isSearching && totalCount === 0
            ? `Searching for "${query.trim()}"...`
            : `${totalCount} result${totalCount === 1 ? '' : 's'} for "${query.trim()}"`}
        </h3>
      )}

      {/* Categorized result rails — full width */}
      {groups && groups.map((g) => (
        <MediaRail
          key={g.key}
          title={g.label}
          items={g.items.slice(0, 24)}
          isLive={g.key === 'live'}
          onSelectItem={onSelectItem}
        />
      ))}

      {/* Empty states */}
      {!isSearching && query.trim() !== '' && totalCount === 0 && (
        <div className="tv-center-state" style={{ marginTop: 60, textAlign: 'center' }}>
          <p style={{ color: '#94a3b8', fontSize: '1.05rem' }}>
            No content found matching "{query.trim()}". Try another title or check spelling.
          </p>
        </div>
      )}

      {query.trim() === '' && recents.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <div style={{ color: '#9aa0ab', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
            Recent searches
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {recents.map((r) => (
              <button
                key={r}
                tabIndex={0}
                className="tv-cat-btn"
                style={{ padding: '8px 16px', borderRadius: 999, fontSize: '0.9rem', fontWeight: 600 }}
                onClick={() => setQuery(r)}
              >{r}</button>
            ))}
          </div>
        </div>
      )}

      {query.trim() === '' && recents.length === 0 && (
        <div style={{ color: '#64748b', fontSize: '0.95rem', marginTop: 40 }}>
          Type any movie name, web series, anime, or TV channel.
        </div>
      )}
    </div>
  );
}
