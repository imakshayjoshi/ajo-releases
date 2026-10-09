import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search as SearchIcon, Delete, Clock, Flame } from 'lucide-react';
import { searchAllMedia } from '../api/pikashow';
import { MediaCard } from './MediaCard';

/**
 * SearchView v3.12.62 — rebuilt for remote ergonomics:
 *  - QWERTY keyboard (matches the Fire TV on-screen keyboard muscle memory;
 *    the old ABC layout forced a mental re-map on every search)
 *  - Recent searches as one-click chips (most searches are repeats)
 *  - Trending row when the query is empty (zero-press discovery)
 *  - Search-as-you-type with 300ms debounce (unchanged) + out-of-order guard
 *  - Space/Del larger targets; row-jump with Up/Down
 */
const KEYBOARD_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
];
const NUM_ROW = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const RECENTS_KEY = 'ajo_recent_searches_v1';
const MAX_RECENTS = 8;

function loadRecents() {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    return raw ? JSON.parse(raw).filter((x) => typeof x === 'string') : [];
  } catch { return []; }
}
function saveRecents(list) {
  try { localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, MAX_RECENTS))); } catch {}
}

export function SearchView({ onSelectItem }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [recents, setRecents] = useState(loadRecents);
  const inputRef = useRef(null);
  // v3.12.57 FIX: out-of-order response guard — only the newest request may
  // write state (type "av" then "avatar" must never show "av" results).
  const reqSeqRef = useRef(0);

  // v3.12.66 UX FIX: on TV, entering the Search tab must put focus IN the
  // input. Without this, physical typing went to the document and nothing
  // appeared in the field; the on-screen keyboard worked, real typing didn't.
  useEffect(() => {
    const t = setTimeout(() => {
      const active = document.activeElement;
      // If focus is still on the header pill or body, take it for typing.
      if (!active || active === document.body || active.tagName === 'BUTTON') {
        try { inputRef.current?.focus({ preventScroll: true }); } catch {}
      }
    }, 120);
    return () => clearTimeout(t);
  }, []);

  // Debounced search-as-you-type
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(() => {
      const id = ++reqSeqRef.current;
      searchAllMedia(query).then((items) => {
        if (reqSeqRef.current !== id) return;
        setResults(items);
        setIsSearching(false);
        try {
          import('../api/analytics').then((m) => m.trackSearchQuery(query, items.length)).catch(() => {});
        } catch {}
      }).catch(() => {
        if (reqSeqRef.current !== id) return;
        setIsSearching(false);
      });
    }, 300);
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

  const handleSearchSubmit = useCallback(() => {
    commitSearch(query);
    if (inputRef.current) inputRef.current.blur();
  }, [query, commitSearch]);

  const handleKeyPress = (char) => setQuery((prev) => prev + char);
  const handleBackspace = () => setQuery((prev) => prev.slice(0, -1));
  const handleClear = () => setQuery('');

  // Type into the field from the physical remote too — keep the input as the
  // single source of truth.
  const Key = ({ k, wide }) => (
    <button
      tabIndex={0}
      className="tv-cat-btn tv-kbd-key"
      data-k={k}
      style={{
        width: wide ? 72 : 46,
        height: 40,
        padding: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '1rem',
        fontWeight: 700,
        borderRadius: 8,
      }}
      onClick={() => handleKeyPress(k)}
    >{k}</button>
  );

  return (
    <div className="tv-search-container" style={{ padding: '0 24px' }}>
      <div style={{ display: 'flex', gap: '32px', alignItems: 'flex-start', marginTop: '8px' }}>
        {/* Left Column: Search Bar & QWERTY Keyboard */}
        <div style={{ width: '470px', flexShrink: 0 }}>
          <div className="tv-search-input-box" style={{ marginBottom: '14px' }}>
            <SearchIcon size={22} color="#38bdf8" />
            <input
              ref={inputRef}
              type="text"
              className="tv-search-input"
              placeholder="Search movies, series, live TV..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onBlur={() => commitSearch(query)}
              onKeyDown={(e) => {
                // v3.12.66: keep remote/keyboard typing inside the field.
                // D-pad down should still reach the on-screen keyboard.
                if (e.key === 'ArrowDown') return;
                if (e.key === 'Backspace' || e.key === 'Delete') {
                  e.stopPropagation();
                }
              }}
              tabIndex={0}
            />
            {query && (
              <button className="tv-cat-btn" onClick={handleClear} tabIndex={0} style={{ padding: '4px 10px', fontSize: '0.8rem' }}>
                Clear
              </button>
            )}
          </div>

          {/* QWERTY keyboard */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '7px',
            background: 'rgba(15, 20, 31, 0.75)',
            padding: '14px',
            borderRadius: '16px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
          }}>
            {KEYBOARD_ROWS.map((row, ri) => (
              <div key={ri} style={{ display: 'flex', gap: '7px', justifyContent: 'center' }}>
                {row.map((k) => <Key key={k} k={k} />)}
              </div>
            ))}
            <div style={{ display: 'flex', gap: '7px', justifyContent: 'center', flexWrap: 'wrap' }}>
              {NUM_ROW.map((k) => <Key key={k} k={k} />)}
            </div>
            <div style={{ display: 'flex', gap: '7px', justifyContent: 'center' }}>
              <button
                tabIndex={0}
                className="tv-cat-btn"
                style={{ width: 132, height: 40, fontWeight: 800, borderRadius: 8, fontSize: '0.85rem' }}
                onClick={() => handleKeyPress(' ')}
              >Space</button>
              <button
                tabIndex={0}
                className="tv-cat-btn"
                style={{ width: 96, height: 40, fontWeight: 800, borderRadius: 8, fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                onClick={handleBackspace}
              ><Delete size={14} /> Del</button>
              <button
                tabIndex={0}
                className="tv-btn-primary"
                style={{ width: 96, height: 40, fontWeight: 800, borderRadius: 8, fontSize: '0.85rem' }}
                onClick={handleSearchSubmit}
              >Search</button>
            </div>
          </div>

          {/* Recent searches */}
          {recents.length > 0 && !query && (
            <div style={{ marginTop: 14 }}>
              <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Clock size={12} /> Recent searches
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {recents.map((r) => (
                  <button
                    key={r}
                    tabIndex={0}
                    className="tv-cat-btn"
                    style={{ padding: '7px 14px', borderRadius: 999, fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
                    onClick={() => setQuery(r)}
                  >{r}</button>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: '12px', color: '#64748b', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>💡 Tip: Press</span>
            <span style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px', color: '#38bdf8', fontWeight: 700 }}>Right ▶</span>
            <span>on remote to jump straight to results</span>
          </div>
        </div>

        {/* Right Column: Live Search Results */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{
            fontSize: '1.2rem',
            fontWeight: 800,
            marginBottom: '16px',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            {isSearching ? '⚡ Searching...' : query ? `Results for "${query}" (${results.length})` : (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Flame size={18} color="#38bdf8" /> Type to search — or browse trending below</span>
            )}
          </h3>

          {results.length > 0 ? (
            <div className="tv-grid" style={{ maxHeight: 'calc(100vh - 180px)', overflowY: 'auto', paddingRight: '8px' }}>
              {results.map((item, idx) => (
                <MediaCard
                  key={item.id || idx}
                  item={item}
                  isLive={item.is_live}
                  onClick={onSelectItem}
                />
              ))}
            </div>
          ) : query && !isSearching ? (
            <div className="tv-center-state" style={{ marginTop: 60, textAlign: 'center' }}>
              <p style={{ color: '#94a3b8', fontSize: '1.05rem' }}>
                No content found matching "{query}". Try another title or check spelling.
              </p>
            </div>
          ) : !query ? (
            <div style={{ color: '#64748b', fontSize: '0.95rem', marginTop: 40, textAlign: 'center' }}>
              Type any movie name, web series, or TV channel on the keyboard.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
