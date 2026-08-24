import React from 'react';
import { Star } from 'lucide-react';

export function MediaCard({ item, onClick, isLive = false }) {
  if (!item) return null;

  const title = typeof item.title_en === 'string' && item.title_en
    ? item.title_en
    : typeof item.title === 'string' && item.title
    ? item.title
    : typeof item.name === 'string' && item.name
    ? item.name
    : 'Untitled';

  const poster = typeof item.poster_url === 'string' && item.poster_url
    ? item.poster_url
    : typeof item.poster === 'string' && item.poster
    ? item.poster
    : typeof item.logo === 'string' && item.logo
    ? item.logo
    : '';

  let rating = '';
  if (typeof item.rating === 'number' || (typeof item.rating === 'string' && item.rating !== '[object Object]')) {
    rating = String(item.rating).trim();
  } else if (typeof item.ratings === 'object' && item.ratings !== null) {
    const r = item.ratings.imdb || item.ratings.kinopoisk || item.ratings.rating || '';
    rating = typeof r === 'string' || typeof r === 'number' ? String(r).trim() : '';
  }
  if (rating === '[object Object]') rating = '';

  let category = item.category;
  if (typeof category === 'object' && category !== null) {
    category = category.name || category.title || category.label || '';
  }
  category = String(category || '').trim();
  if (!category || category === '[object Object]') {
    category = isLive ? 'Live' : (item.year && item.year !== 'LIVE' ? item.year : 'HD');
  }

  const fallbackPoster = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22200%22%20height%3D%22300%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%23151c2c%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20fill%3D%22%2364748b%22%20dominant-baseline%3D%22middle%22%20text-anchor%3D%22middle%22%20font-family%3D%22sans-serif%22%20font-size%3D%2214%22%3ENo%20Poster%3C%2Ftext%3E%3C%2Fsvg%3E';

  return (
    <div
      tabIndex={0}
      className="tv-card"
      onClick={() => onClick && onClick(item)}
    >
      <img
        src={poster || fallbackPoster}
        alt={title}
        className={isLive ? 'tv-card-poster tv-card-live-poster' : 'tv-card-poster'}
        loading="lazy"
        onError={(e) => {
          e.target.src = fallbackPoster;
        }}
      />

      <div className="tv-card-info">
        <span className="tv-card-title">{title}</span>
        <div className="tv-card-meta">
          {isLive ? (
            <span className="tv-badge-live">LIVE</span>
          ) : (
            <span style={{ color: '#94a3b8' }}>{category}</span>
          )}

          {Boolean(rating) && (
            <span className="tv-badge-rating">
              <Star size={11} fill="#f59e0b" color="#f59e0b" />
              <span>{rating}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
