import React, { useState, useEffect, useCallback } from 'react';
import { Search as SearchIcon, Delete, RotateCcw } from 'lucide-react';
import { searchAllMedia } from '../api/pikashow';
import { MediaCard } from './MediaCard';

const KEYBOARD_KEYS = [
  'A', 'B', 'C', 'D', 'E', 'F', '1', '2', '3',
  'G', 'H', 'I', 'J', 'K', 'L', '4', '5', '6',
  'M', 'N', 'O', 'P', 'Q', 'R', '7', '8', '9',
  'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '0'
];

export function SearchView({ onSelectItem }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(() => {
      searchAllMedia(query).then((items) => {
        setResults(items);
        setIsSearching(false);
      }).catch(() => {
        setIsSearching(false);
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const handleKeyPress = (char) => {
    setQuery((prev) => prev + char);
  };

  const handleBackspace = () => {
    setQuery((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setQuery('');
  };

  return (
    <div className="tv-search-container" style={{ padding: '0 24px' }}>
      {/* 2-Column TV Layout: Left Column = Keyboard & Input, Right Column = Live Results */}
      <div style={{
        display: 'flex',
        gap: '32px',
        alignItems: 'flex-start',
        marginTop: '8px'
      }}>
        {/* Left Column: Search Bar & TV Keyboard */}
        <div style={{ width: '420px', flexShrink: 0 }}>
          <div className="tv-search-input-box" style={{ marginBottom: '14px' }}>
            <SearchIcon size={22} color="#38bdf8" />
            <input
              type="text"
              className="tv-search-input"
              placeholder="Search movies, series, live TV..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              tabIndex={0}
            />
            {query && (
              <button className="tv-cat-btn" onClick={handleClear} tabIndex={0} style={{ padding: '4px 10px', fontSize: '0.8rem' }}>
                Clear
              </button>
            )}
          </div>

          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
            background: 'rgba(15, 20, 31, 0.75)',
            padding: '14px',
            borderRadius: '16px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
          }}>
            {KEYBOARD_KEYS.map((k) => (
              <button
                key={k}
                tabIndex={0}
                className="tv-cat-btn"
                style={{
                  width: '42px',
                  height: '38px',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.95rem',
                  fontWeight: 800,
                  borderRadius: '8px'
                }}
                onClick={() => handleKeyPress(k)}
              >
                {k}
              </button>
            ))}
            <button
              tabIndex={0}
              className="tv-cat-btn"
              style={{
                flex: 1,
                minWidth: '100px',
                height: '38px',
                fontWeight: 800,
                borderRadius: '8px',
                fontSize: '0.85rem'
              }}
              onClick={() => handleKeyPress(' ')}
            >
              Space
            </button>
            <button
              tabIndex={0}
              className="tv-cat-btn"
              style={{
                padding: '0 14px',
                height: '38px',
                fontWeight: 800,
                borderRadius: '8px',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
              onClick={handleBackspace}
            >
              <Delete size={14} />
              Del
            </button>
          </div>

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
            {isSearching ? '⚡ Searching...' : query ? `Results for "${query}" (${results.length})` : 'Popular & Trending Suggestions'}
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
          ) : (
            <div style={{ color: '#64748b', fontSize: '0.95rem', marginTop: 40, textAlign: 'center' }}>
              Type any movie name, web series, or TV channel on the keyboard.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
