import React, { useCallback } from 'react';
import { Play, Star } from 'lucide-react';

/**
 * HeroGrid — multi-tile spotlight for TV home (v3.12.76).
 *
 * Replaces the single auto-rotating banner: one featured tile + four smaller
 * tiles are all visible at once, so the home screen shows five things to
 * watch instead of one rotating slide. Every tile is a D-pad target.
 */
export function HeroGrid({ items = [], onPlay, onSelectInfo }) {
  const tiles = items.slice(0, 5).filter(Boolean);
  const pick = useCallback((item) => {
    if (onPlay) onPlay(item);
  }, [onPlay]);

  if (tiles.length === 0) return null;

  const Tile = ({ item, large }) => {
    const title = item.title_en || item.title || item.name || 'Featured';
    const poster = item.backdrop_url || item.poster_url || item.poster || '';
    const rating = typeof item.rating === 'number' ? item.rating.toFixed(1)
      : typeof item.rating === 'string' && item.rating !== '[object Object]' ? item.rating : '';
    const year = item.year || (item.release_date ? String(item.release_date).split('-')[0] : '');
    return (
      <button
        type="button"
        tabIndex={0}
        className={`tv-hero-grid-tile${large ? ' tv-hero-grid-tile-lg' : ''}`}
        onClick={() => pick(item)}
        aria-label={`Play ${title}`}
      >
        {poster
          ? <img className="tv-hero-grid-img" src={poster} alt="" loading={large ? 'eager' : 'lazy'} decoding="async" />
          : <div className="tv-hero-grid-img tv-hero-grid-img-fallback" aria-hidden="true">🎬</div>}
        <div className="tv-hero-grid-scrim" aria-hidden="true" />
        <div className="tv-hero-grid-info">
          {large && <span className="tv-hero-grid-badge">FEATURED</span>}
          <span className="tv-hero-grid-title">{title}</span>
          <span className="tv-hero-grid-meta">
            {rating && <span className="tv-hero-grid-rating"><Star size={12} fill="currentColor" /> {rating}</span>}
            {year && <span>{year}</span>}
            <span className="tv-hero-grid-play"><Play size={12} fill="currentColor" /> Play</span>
          </span>
        </div>
      </button>
    );
  };

  return (
    <section className="tv-hero-grid" aria-label="Featured">
      <Tile item={tiles[0]} large />
      <div className="tv-hero-grid-side">
        {tiles.slice(1).map((it, i) => <Tile key={it.id || it.title || i} item={it} />)}
      </div>
    </section>
  );
}
