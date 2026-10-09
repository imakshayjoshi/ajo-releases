import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { MediaCard } from './MediaCard';

const PAGE_SIZE = 30;

// v3.12.57 PERF: content-derived stable key (see MediaRail) + React.memo.
const stableKey = (item) =>
  item.id ?? `${(item.title_en || item.title || item.name || 'untitled').toString().toLowerCase().slice(0, 60)}-${item.source || item.provider || 'cat'}`;

/** Provider display metadata — mirrors the provider-catalog pattern. */
const PROVIDERS = {
  movibox: { label: 'Movibox', icon: '⚡' },
  addon: { label: 'Stremio Addons', icon: '🧩' },
  tmdb: { label: 'TMDB Discover', icon: '🎬' },
};

const SORTS = [
  { id: 'popular', label: 'Most Popular' },
  { id: 'newest', label: 'Newest' },
  { id: 'az', label: 'A-Z' },
];

/**
 * Provider-aware catalog grid.
 * - Provider selector: All / Movibox / Stremio / TMDB
 * - Scoped search: "Search on <provider>..." placeholder (the exact
 *   pattern from the reference site)
 * - Genre chips: horizontal scroll, one active
 * - Sort: Most Popular / Newest / A-Z
 * - Poster grid with progressive rendering
 */
export const MediaGridView = React.memo(function MediaGridView({
  title,
  items = [],
  isLive = false,
  onSelectItem,
}) {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedProvider, setSelectedProvider] = useState('all');
  const [sortMode, setSortMode] = useState('popular');
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef(null);
  const searchInputRef = useRef(null);

  // Provider list from actual item data (only providers with content show up)
  const providers = useMemo(() => {
    const set = new Set();
    items.forEach((item) => {
      const src = String(item.source || item.provider || '').toLowerCase();
      const id = String(item.id || '');
      if (src.startsWith('movibox')) set.add('movibox');
      else if (src.startsWith('addon')) set.add('addon');
      else if (id.startsWith('tmdb-') || src.startsWith('tmdb')) set.add('tmdb');
    });
    return Array.from(set);
  }, [items]);

  const hasProviderFilters = providers.length > 1;
  const activeProviderLabel = PROVIDERS[selectedProvider]?.label || 'All Sources';

  // Extract unique categories (genres)
  const categories = useMemo(() => {
    const set = new Set(['All']);
    if (isLive) set.add('Marathi (मराठी)');
    items.forEach((item) => {
      // Prefer genre arrays (TMDB/Movibox) over single category string
      const genres = Array.isArray(item.genres) && item.genres.length
        ? item.genres
        : [item.category].filter(Boolean);
      genres.forEach((g) => {
        const clean = String(g).trim();
        if (clean) set.add(clean);
      });
    });
    return Array.from(set).slice(0, 24); // cap chip count for TV performance
  }, [items, isLive]);

  // Provider filter
  const providerFiltered = useMemo(() => {
    if (!hasProviderFilters || selectedProvider === 'all') return items;
    return items.filter((item) => {
      const src = String(item.source || item.provider || '').toLowerCase();
      const id = String(item.id || '');
      if (selectedProvider === 'movibox') return src.startsWith('movibox');
      if (selectedProvider === 'addon') return src.startsWith('addon');
      if (selectedProvider === 'tmdb') return id.startsWith('tmdb-') || src.startsWith('tmdb');
      return true;
    });
  }, [items, selectedProvider, hasProviderFilters]);

  // Filter by genre/category
  const genreFiltered = useMemo(() => {
    if (selectedCategory === 'All') return providerFiltered;
    if (selectedCategory === 'Marathi (मराठी)') {
      return providerFiltered.filter((item) => {
        const cat = (item.category || '').toLowerCase();
        const t = (item.title || item.name || '').toLowerCase();
        return cat.includes('marathi') || t.includes('marathi') ||
          t.includes('majha') || t.includes('taas') || t.includes('jhakaas') ||
          t.includes('lokmat') || t.includes('saam') || t.includes('pravah') ||
          t.includes('sahyadri');
      });
    }
    return providerFiltered.filter((item) => {
      // Check genre arrays first, then legacy single category
      if (Array.isArray(item.genres) && item.genres.length) {
        return item.genres.some((g) => String(g).trim() === selectedCategory);
      }
      return item.category === selectedCategory;
    });
  }, [providerFiltered, selectedCategory]);

  // Scoped search (within the already-filtered set — search on <provider>)
  const searchFiltered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return genreFiltered;
    return genreFiltered.filter((item) => {
      const t = String(item.title_en || item.title || item.name || '').toLowerCase();
      return t.includes(q);
    });
  }, [genreFiltered, searchQuery]);

  // Sort
  const filteredItems = useMemo(() => {
    const list = searchFiltered.slice();
    if (sortMode === 'popular') {
      list.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0) || (b.popularity || 0) - (a.popularity || 0));
    } else if (sortMode === 'newest') {
      list.sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
    } else {
      list.sort((a, b) => String(a.title_en || a.title || '').localeCompare(String(b.title_en || b.title || '')));
    }
    return list;
  }, [searchFiltered, sortMode]);

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [selectedCategory, selectedProvider, searchQuery, sortMode]);

  // Slice to visible count for progressive rendering
  const visibleItems = useMemo(
    () => filteredItems.slice(0, visibleCount),
    [filteredItems, visibleCount]
  );

  const hasMore = visibleCount < filteredItems.length;

  // IntersectionObserver to auto-load more when user scrolls near the bottom
  useEffect(() => {
    if (!hasMore || !sentinelRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, filteredItems.length));
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, filteredItems.length]);

  const handleSearchKey = useCallback((e) => {
    // D-pad down from the search input jumps to the first card
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const firstCard = document.querySelector('.tv-grid .tv-card');
      if (firstCard) firstCard.focus();
    }
  }, []);

  const searchPlaceholder = selectedProvider === 'all'
    ? 'Search across all sources...'
    : `Search on ${activeProviderLabel}...`;

  return (
    <div className="tv-grid-view">
      <div className="tv-rail-header provider-catalog-header">
        <div className="provider-catalog-titles">
          <button
            tabIndex={0}
            className="provider-back-btn"
            onClick={() => {
              const homePill = document.querySelector('.tv-nav-pill');
              if (homePill) homePill.click();
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
            <span>Home</span>
          </button>
          <h2 className="tv-rail-title">{title}</h2>
          <p className="provider-catalog-sub">
            {activeProviderLabel} — {filteredItems.length} titles
          </p>
        </div>
        <div className="provider-toolbar">
          <div className="provider-search-box">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              className="tv-search-input provider-search-input"
              placeholder={searchPlaceholder}
              value={searchQuery}
              tabIndex={0}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKey}
            />
          </div>
          <select
            className="provider-sort-select"
            tabIndex={0}
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value)}
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Provider selector row — only when multiple sources exist */}
      {hasProviderFilters && (
        <div className="tv-category-bar provider-bar">
          <button
            key="all-providers"
            tabIndex={0}
            className={`tv-cat-btn provider-chip ${selectedProvider === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedProvider('all')}
          >
            All Sources
          </button>
          {providers.map((p) => {
            const meta = PROVIDERS[p] || { label: p, icon: '' };
            return (
              <button
                key={p}
                tabIndex={0}
                className={`tv-cat-btn provider-chip ${selectedProvider === p ? 'active' : ''}`}
                onClick={() => setSelectedProvider(p)}
              >
                {meta.icon} {meta.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Category / Genre Chips */}
      {categories.length > 1 && (
        <div className="tv-category-bar">
          {categories.map((cat) => (
            <button
              key={cat}
              tabIndex={0}
              className={`tv-cat-btn ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Media Grid — progressively rendered */}
      <div className="tv-grid">
        {visibleItems.map((item, idx) => (
          <MediaCard
            key={stableKey(item)}
            item={item}
            isLive={isLive}
            onClick={onSelectItem}
          />
        ))}
      </div>

      {/* Sentinel element for infinite scroll */}
      {hasMore && (
        <div ref={sentinelRef} style={{ height: 1, width: '100%' }} />
      )}
    </div>
  );
});
