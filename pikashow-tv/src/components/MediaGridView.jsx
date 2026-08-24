import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { MediaCard } from './MediaCard';

const PAGE_SIZE = 30;

export function MediaGridView({ title, items = [], isLive = false, onSelectItem }) {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef(null);

  // Extract unique categories
  const categories = useMemo(() => {
    const set = new Set(['All']);
    items.forEach((item) => {
      if (item.category) set.add(item.category);
    });
    return Array.from(set);
  }, [items]);

  // Filter items by category
  const filteredItems = useMemo(() => {
    if (selectedCategory === 'All') return items;
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
            key={item.id || idx}
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
}

