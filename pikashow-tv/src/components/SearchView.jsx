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
    <div className="tv-search-container">
      {/* Search Input Bar */}
      <div className="tv-search-input-box">
        <SearchIcon size={24} color="#38bdf8" />
        <input
          type="text"
          className="tv-search-input"
          placeholder="Search movies, web series, live channels..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          tabIndex={0}
        />
        {query && (
          <button className="tv-cat-btn" onClick={handleClear} tabIndex={0} style={{ padding: '4px 10px' }}>
            Clear
          </button>
        )}
      </div>

      {/* On-Screen TV Keyboard */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        maxWidth: '520px',
        background: 'rgba(15, 20, 31, 0.6)',
        padding: '16px',
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.06)'
      }}>
        {KEYBOARD_KEYS.map((k) => (
          <button
            key={k}
            tabIndex={0}
            className="tv-cat-btn"
            style={{ width: '46px', height: '40px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: 700 }}
            onClick={() => handleKeyPress(k)}
          >
            {k}
          </button>
        ))}
        <button
          tabIndex={0}
          className="tv-cat-btn"
          style={{ padding: '0 16px', height: '40px', fontWeight: 700 }}
          onClick={() => handleKeyPress(' ')}
        >
          Space
        </button>
        <button
          tabIndex={0}
          className="tv-cat-btn"
          style={{ padding: '0 16px', height: '40px', fontWeight: 700 }}
          onClick={handleBackspace}
        >
          <Delete size={16} style={{ display: 'inline', marginRight: 4 }} />
          Del
        </button>
      </div>

      {/* Search Results */}
      <div style={{ marginTop: 12 }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 16 }}>
          {isSearching ? 'Searching...' : query ? `Results for "${query}" (${results.length})` : 'Search for any movie or channel'}
        </h3>

        {results.length > 0 ? (
          <div className="tv-grid">
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
          <div className="tv-center-state">
            <p>No content found matching "{query}". Try another title.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
