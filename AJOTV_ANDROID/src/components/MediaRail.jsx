import React from 'react';
import { MediaCard } from './MediaCard';
import { ChevronRight } from 'lucide-react';

export function MediaRail({ title, items = [], isLive = false, onSelectItem, onSeeAll }) {
  if (!items || items.length === 0) return null;

  return (
    <section className="tv-rail">
      <div className="tv-rail-header">
        <h2 className="tv-rail-title">{title}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="tv-rail-count">{items.length} {items.length === 1 ? 'title' : 'titles'}</span>
          {onSeeAll && (
            <button
              tabIndex={0}
              className="tv-rail-see-all"
              onClick={onSeeAll}
            >
              See All <ChevronRight size={14} style={{ verticalAlign: 'middle' }} />
            </button>
          )}
        </div>
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
