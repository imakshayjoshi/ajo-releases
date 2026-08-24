import React from 'react';
import { MediaCard } from './MediaCard';

export function MediaRail({ title, items = [], isLive = false, onSelectItem }) {
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
            key={item.id || idx}
            item={item}
            isLive={isLive}
            onClick={onSelectItem}
          />
        ))}
      </div>
    </section>
  );
}
