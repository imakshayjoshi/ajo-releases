import React from 'react';
import { MediaCard } from './MediaCard';

// v3.12.57 PERF: React.memo + content-derived stable keys. Index-fallback keys
// reused DOM nodes for DIFFERENT items on category switch / search-result
// replacement: the <img> kept the old poster (flash of wrong title) and
// dataset.fallbackTried survived the reuse, so a card that fell back once
// NEVER retried the real poster of the item that later occupied its node.
const stableKey = (item, idx) =>
  item.id ?? `${(item.title_en || item.title || item.name || 'untitled').toString().toLowerCase().slice(0, 60)}-${item.source || item.provider || 'cat'}`;

export const MediaRail = React.memo(function MediaRail({ title, items = [], isLive = false, onSelectItem }) {
  if (!items || items.length === 0) return null;

  return (
    <section className="tv-rail">
      <div className="tv-rail-header">
        <h2 className="tv-rail-title">{title}</h2>
        <span className="tv-rail-count">{items.length} titles</span>
      </div>

      <div className="tv-rail-track">
        {items.map((item, idx) => (
          <MediaCard
            key={stableKey(item, idx)}
            item={item}
            isLive={isLive}
            onClick={onSelectItem}
          />
        ))}
      </div>
    </section>
  );
});
