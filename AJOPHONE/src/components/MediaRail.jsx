import React from 'react';
import { MediaCard } from './MediaCard';
import { LandscapeMediaCard } from './LandscapeMediaCard';
import { ChevronRight, Sparkles, Flame, Film, Tv, Radio, Newspaper } from 'lucide-react';

export function MediaRail({ title, items, landscape = false, onSelectItem, onFocusItem, onSeeAll }) {
  const safeItems = Array.isArray(items) ? items : (items && Array.isArray(items.results) ? items.results : []);
  if (safeItems.length === 0) return null;

  // Determine section icon
  const titleLower = (title || '').toLowerCase();
  let SectionIcon = Sparkles;
  if (titleLower.includes('sport') || titleLower.includes('cricket')) SectionIcon = Flame;
  else if (titleLower.includes('bollywood') || titleLower.includes('hollywood') || titleLower.includes('cinema') || titleLower.includes('movie')) SectionIcon = Film;
  else if (titleLower.includes('series') || titleLower.includes('show')) SectionIcon = Tv;
  else if (titleLower.includes('live') || titleLower.includes('star') || titleLower.includes('sony')) SectionIcon = Radio;
  else if (titleLower.includes('news')) SectionIcon = Newspaper;

  return (
    <section className="mobile-rail-section" style={{ position: 'relative', zIndex: 20, width: '100%', marginTop: '22px' }}>
      <div className="mobile-rail-header" style={{ position: 'relative', zIndex: 20, padding: '0 16px 10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="mobile-rail-title-box" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '24px',
            height: '24px',
            borderRadius: '6px',
            background: 'rgba(56, 189, 248, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <SectionIcon size={14} color="#38bdf8" />
          </div>
          <h2 className="mobile-rail-title" style={{
            fontSize: '18px',
            fontWeight: 900,
            color: '#ffffff',
            letterSpacing: '-0.3px',
            textShadow: '0 2px 8px rgba(0, 0, 0, 0.8)',
            margin: 0
          }}>
            {title}
          </h2>
        </div>

        {onSeeAll && (
          <button 
            className="mobile-rail-see-all" 
            onClick={onSeeAll}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
              background: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '12px',
              padding: '4px 10px',
              color: '#38bdf8',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            <span>See All</span>
            <ChevronRight size={14} />
          </button>
        )}
      </div>

      <div className={`mobile-rail-scroll ${landscape ? 'is-landscape' : 'is-portrait'}`} style={{ position: 'relative', zIndex: 20 }}>
        {safeItems.map((item, index) => {
          const key = item.kinopoisk_id || item.id || item.movie_id || `${item.title}-${index}`;
          return landscape ? (
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
    </section>
  );
}
