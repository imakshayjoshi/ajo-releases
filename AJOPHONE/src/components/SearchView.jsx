import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search as SearchIcon, X, Film, Tv, Radio, Sparkles, Loader2 } from 'lucide-react';
import { searchAllMedia } from '../api/pikashow';
import { MediaCard } from './MediaCard';
import { LandscapeMediaCard } from './LandscapeMediaCard';

export function SearchView({ 
  onSelectItem, 
  onFocusItem,
  preloadedItems = []
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [filterType, setFilterType] = useState('all'); // all, movies, shows, live
  const inputRef = useRef(null);

  const quickKeywords = [
    'Cricket', 'Star Sports', 'Sony Sports', 'Bollywood', 'Hollywood', 
    'Action', 'Panchayat', 'Farzi', 'Sony Max', 'Aaj Tak', 'Hotstar'
  ];

  // Perform search across local items and remote API
  const performSearch = useCallback(async (searchQuery) => {
    const clean = (searchQuery || '').trim().toLowerCase();
    if (!clean) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    // 1. Instant local search from preloaded catalog
    const localMatches = (preloadedItems || []).filter(item => {
      const title = (item.title_en || item.title || item.title_ru || item.name || '').toLowerCase();
      const cat = (item.category || '').toLowerCase();
      return title.includes(clean) || cat.includes(clean);
    });

    setResults(localMatches);

    // 2. Fetch from remote search API
    try {
      const remoteResults = await searchAllMedia(clean);
      const combined = [...localMatches];
      const seen = new Set(localMatches.map(i => i.id || i.kinopoisk_id || i.title));

      (remoteResults || []).forEach(item => {
        const id = item.id || item.kinopoisk_id || item.title;
        if (!seen.has(id)) {
          seen.add(id);
          combined.push(item);
        }
      });

      setResults(combined);
    } catch (e) {
      console.warn('Remote search error:', e);
    } finally {
      setIsSearching(false);
    }
  }, [preloadedItems]);

  useEffect(() => {
    if (!query) {
      setResults([]);
      return;
    }

    const timer = setTimeout(() => {
      performSearch(query);
    }, 200);

    return () => clearTimeout(timer);
  }, [query, performSearch]);

  const filteredResults = results.filter(item => {
    if (filterType === 'all') return true;
    const isLive = item.is_live || item.type === 'live' || item.year === 'LIVE';
    if (filterType === 'live') return isLive;
    if (filterType === 'shows') return item.type === 'series' || item.type === 'serial';
    if (filterType === 'movies') return !isLive && item.type !== 'series' && item.type !== 'serial';
    return true;
  });

  return (
    <div className="mobile-search-container" style={{ position: 'relative', zIndex: 20, padding: '14px 14px 90px 14px', width: '100%', boxSizing: 'border-box' }}>
      {/* Top Search Input Box */}
      <div className="mobile-search-box" style={{
        position: 'relative',
        zIndex: 25,
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        background: 'rgba(15, 23, 42, 0.9)',
        border: '1.5px solid rgba(255, 255, 255, 0.15)',
        borderRadius: '16px',
        padding: '12px 16px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)'
      }}>
        <SearchIcon size={20} color="#38bdf8" />
        <input
          ref={inputRef}
          type="search"
          className="mobile-search-input"
          placeholder="Search movies, series, sports, channels..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            color: '#ffffff',
            fontSize: '15px',
            fontWeight: 700,
            outline: 'none'
          }}
        />
        {query && (
          <button 
            className="mobile-search-clear-btn" 
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Quick Trending Keyword Chips */}
      <div className="mobile-quick-chips" style={{
        position: 'relative',
        zIndex: 25,
        display: 'flex',
        gap: '8px',
        overflowX: 'auto',
        padding: '12px 0',
        scrollbarWidth: 'none'
      }}>
        {quickKeywords.map((kw) => {
          const isActive = query === kw;
          return (
            <button
              key={kw}
              className={`mobile-quick-chip ${isActive ? 'is-active' : ''}`}
              onClick={() => setQuery(kw)}
              style={{
                padding: '7px 14px',
                borderRadius: '16px',
                background: isActive ? 'linear-gradient(135deg, #38bdf8 0%, #3b82f6 100%)' : 'rgba(15, 23, 42, 0.85)',
                border: isActive ? '1.5px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.15)',
                color: isActive ? '#06090e' : '#f8fafc',
                fontSize: '12px',
                fontWeight: 800,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              {kw}
            </button>
          );
        })}
      </div>

      {/* Filter Tabs when results present */}
      {results.length > 0 && (
        <div className="mobile-search-tabs" style={{
          position: 'relative',
          zIndex: 25,
          display: 'flex',
          gap: '8px',
          margin: '8px 0 14px 0'
        }}>
          {[
            { id: 'all', label: `All (${results.length})` },
            { id: 'movies', label: 'Movies' },
            { id: 'shows', label: 'Shows' },
            { id: 'live', label: 'Live TV' },
          ].map(tab => {
            const isActive = filterType === tab.id;
            return (
              <button
                key={tab.id}
                className={`mobile-search-tab ${isActive ? 'is-active' : ''}`}
                onClick={() => setFilterType(tab.id)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '12px',
                  background: isActive ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                  border: isActive ? '1.5px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.12)',
                  color: isActive ? '#38bdf8' : '#ffffff',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Results or Loading */}
      {isSearching && results.length === 0 ? (
        <div className="mobile-search-loader" style={{ position: 'relative', zIndex: 20, padding: '48px 0', textAlign: 'center' }}>
          <Loader2 size={32} className="spin-animation" color="#38bdf8" />
          <span style={{ display: 'block', marginTop: '12px', color: '#94a3b8', fontWeight: 700, fontSize: '14px' }}>
            Searching catalog...
          </span>
        </div>
      ) : filteredResults.length > 0 ? (
        <div className="mobile-search-grid" style={{ position: 'relative', zIndex: 20 }}>
          {filteredResults.map((item, idx) => {
            const isLive = item.is_live || item.type === 'live' || item.year === 'LIVE';
            const key = item.id || item.kinopoisk_id || `${item.title}-${idx}`;
            return isLive ? (
              <LandscapeMediaCard
                key={key}
                item={item}
                onClick={onSelectItem}
                onFocus={onFocusItem}
              />
            ) : (
              <MediaCard
                key={key}
                item={item}
                onClick={onSelectItem}
                onFocus={onFocusItem}
              />
            );
          })}
        </div>
      ) : query ? (
        <div className="mobile-empty-state" style={{ position: 'relative', zIndex: 20, padding: '48px 0', textAlign: 'center' }}>
          <Film size={36} color="#64748b" />
          <p style={{ color: '#cbd5e1', fontSize: '14px', fontWeight: 700, marginTop: '10px' }}>
            No results found for "{query}".
          </p>
        </div>
      ) : (
        <div className="mobile-search-initial" style={{ position: 'relative', zIndex: 20, padding: '48px 20px', textAlign: 'center' }}>
          <Sparkles size={32} color="#38bdf8" />
          <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#ffffff', margin: '10px 0 6px 0' }}>Instant Universal Search</h3>
          <p style={{ color: '#94a3b8', fontSize: '13px', maxWidth: '280px', margin: '0 auto' }}>
            Search over 1,000+ movies, web series, live sports & worldwide television.
          </p>
        </div>
      )}
    </div>
  );
}
