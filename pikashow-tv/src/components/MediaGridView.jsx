import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { MediaCard } from './MediaCard';

const PAGE_SIZE = 30;

// v3.12.57 PERF: content-derived stable key (see MediaRail) + React.memo.
const stableKey = (item) =>
  item.id ?? `${(item.title_en || item.title || item.name || 'untitled').toString().toLowerCase().slice(0, 60)}-${item.source || item.provider || 'cat'}`;

export const MediaGridView = React.memo(function MediaGridView({ title, items = [], isLive = false, onSelectItem }) {
  const [selectedCategory, setSelectedCategory] = useState('All');
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

  // Filter items by category
  const filteredItems = useMemo(() => {
    if (selectedCategory === 'All') return items;
    if (selectedCategory === 'Marathi (मराठी)') {
      return items.filter(item => {
        const cat = (item.category || '').toLowerCase();
        const title = (item.title || item.name || '').toLowerCase();
        return cat.includes('marathi') || title.includes('marathi') || title.includes('majha') || title.includes('taas') || title.includes('jhakaas') || title.includes('lokmat') || title.includes('saam') || title.includes('pravah') || title.includes('sahyadri');
      });
    }
    return items.filter((item) => item.category === selectedCategory);
  }, [items, selectedCategory]);

  // Reset visible count when category changes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [selectedCategory]);

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
          setVisibleCount(prev => Math.min(prev + PAGE_SIZE, filteredItems.length));
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, filteredItems.length]);

  return (
    <div className="tv-grid-view">
      <div className="tv-rail-header" style={{ marginBottom: 16 }}>
        <h2 className="tv-rail-title">{title}</h2>
        <span className="tv-rail-count">{filteredItems.length} available</span>
      </div>

      {/* Category Pills Bar */}
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

