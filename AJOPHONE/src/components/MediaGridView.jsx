import React, { useState, useMemo, useRef, useEffect } from 'react';
import { MediaCard } from './MediaCard';

const PAGE_SIZE = 30;
const GENRE_CHIP_CAP = 24; // unbounded chips render thousands of focusable buttons on TV

/**
 * MediaGridView — full-catalog grid for Movies / Series / Sports.
 *
 * v3.12.83 (Apple-TV scoped browse): genre chips + a sort control on top of
 * the existing category pills. The user asked for "proper categories or search
 * like Apple TV" — this gives every catalog screen a genre rail (All / Action /
 * Comedy / ...) plus a sort toggle (Popular / Newest / A-Z), all D-pad
 * reachable, while keeping the existing category filter and infinite scroll.
 */
export function MediaGridView({ title, items = [], isLive = false, onSelectItem }) {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedGenre, setSelectedGenre] = useState('All');
  const [sortBy, setSortBy] = useState('popular');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef(null);

  // Extract unique categories
  const categories = useMemo(() => {
    const set = new Set(['All']);
    if (isLive) {
      set.add('Marathi (मराठी)');
    }
    items.forEach((item) => {
      if (item.category) set.add(item.category);
    });
    return Array.from(set);
  }, [items, isLive]);

  // v3.12.83: genre chips derived from the items' own genre lists (most-common
  // first), capped so the rail stays D-pad navigable on a low-RAM stick.
  const genres = useMemo(() => {
    const counts = new Map();
    items.forEach((item) => {
      const gs = Array.isArray(item.genres) ? item.genres : [];
      gs.forEach((g) => {
        const name = typeof g === 'object' ? g?.name : g;
        if (name) counts.set(name, (counts.get(name) || 0) + 1);
      });
    });
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([n]) => n);
    return ['All', ...sorted.slice(0, GENRE_CHIP_CAP)];
  }, [items]);

  // Filter by category, then genre
  const filteredItems = useMemo(() => {
    let pool = items;
    if (selectedCategory === 'Marathi (मराठी)') {
      pool = pool.filter(item => {
        const cat = (item.category || '').toLowerCase();
        const title = (item.title || item.name || '').toLowerCase();
        return cat.includes('marathi') || title.includes('marathi') || title.includes('majha') || title.includes('taas') || title.includes('jhakaas') || title.includes('lokmat') || title.includes('saam') || title.includes('pravah') || title.includes('sahyadri');
      });
    } else if (selectedCategory !== 'All') {
      pool = pool.filter((item) => item.category === selectedCategory);
    }
    if (selectedGenre !== 'All') {
      pool = pool.filter((item) => {
        const gs = Array.isArray(item.genres) ? item.genres : [];
        return gs.some((g) => (typeof g === 'object' ? g?.name : g) === selectedGenre);
      });
    }
    return pool;
  }, [items, selectedCategory, selectedGenre]);

  // v3.12.83: sort. Popular = source order (already popularity-ranked by the
  // APIs); Newest sorts by year desc; A-Z by title.
  const sortedItems = useMemo(() => {
    const arr = [...filteredItems];
    if (sortBy === 'newest') {
      arr.sort((a, b) => {
        const ya = parseInt(a.year || (a.release_date || '').split('-')[0] || '0', 10) || 0;
        const yb = parseInt(b.year || (b.release_date || '').split('-')[0] || '0', 10) || 0;
        return yb - ya;
      });
    } else if (sortBy === 'az') {
      arr.sort((a, b) => String(a.title_en || a.title || a.name || '').localeCompare(String(b.title_en || b.title || b.name || '')));
    }
    return arr;
  }, [filteredItems, sortBy]);

  // Reset visible count when any filter changes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [selectedCategory, selectedGenre, sortBy]);

  // Slice to visible count for progressive rendering
  const visibleItems = useMemo(
    () => sortedItems.slice(0, visibleCount),
    [sortedItems, visibleCount]
  );

  const hasMore = visibleCount < sortedItems.length;

  // IntersectionObserver to auto-load more when user scrolls near the bottom
  useEffect(() => {
    if (!hasMore || !sentinelRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount(prev => Math.min(prev + PAGE_SIZE, sortedItems.length));
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, sortedItems.length]);

  return (
    <div className="tv-grid-view">
      <div className="tv-rail-header" style={{ marginBottom: 12 }}>
        <h2 className="tv-rail-title">{title}</h2>
        <span className="tv-rail-count">{sortedItems.length} available</span>
      </div>

      {/* v3.12.83: Sort control (Apple-TV style) — D-pad reachable pills. */}
      <div className="tv-sort-bar">
        <span className="tv-sort-label">Sort</span>
        {[
          { id: 'popular', label: 'Most Popular' },
          { id: 'newest', label: 'Newest' },
          { id: 'az', label: 'A to Z' },
        ].map((opt) => (
          <button
            key={opt.id}
            tabIndex={0}
            className={`tv-cat-btn tv-sort-btn ${sortBy === opt.id ? 'active' : ''}`}
            onClick={() => setSortBy(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Category Pills Bar (existing source/category filter) */}
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

      {/* v3.12.83: Genre chips (the Apple-TV scoped-browse rail) */}
      {genres.length > 1 && (
        <div className="tv-genre-bar">
          <span className="tv-genre-label">Genre</span>
          <div className="tv-genre-chips">
            {genres.map((g) => (
              <button
                key={g}
                tabIndex={0}
                className={`tv-cat-btn tv-genre-chip ${selectedGenre === g ? 'active' : ''}`}
                onClick={() => setSelectedGenre(g)}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Media Grid — progressively rendered */}
      <div className="tv-grid">
        {visibleItems.map((item, idx) => (
          <MediaCard
            key={item.id || idx}
            item={item}
            isLive={isLive}
            onClick={onSelectItem}
          />
        ))}
      </div>

      {sortedItems.length === 0 && (
        <div className="tv-center-state">
          <p style={{ color: '#8a8a9a', fontSize: 17 }}>Nothing matches this filter. Try a different genre or category.</p>
        </div>
      )}

      {/* Sentinel element for infinite scroll */}
      {hasMore && (
        <div ref={sentinelRef} style={{ height: 1, width: '100%' }} />
      )}
    </div>
  );
}
