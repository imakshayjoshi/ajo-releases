import React from 'react';
import { Star } from 'lucide-react';

// v3.9.1: moved outside component to avoid recreation on every render (was
// causing React to create a new function reference each render, triggering
// unnecessary child re-renders in the Live TV grid).
const COLOR_PALETTES = [
  { bg1: '#e11d48', bg2: '#881337', accent: '#fb7185' }, // Red / Entertainment
  { bg1: '#2563eb', bg2: '#1e3a8a', accent: '#60a5fa' }, // Blue / Sports
  { bg1: '#059669', bg2: '#064e3b', accent: '#34d399' }, // Green / Live
  { bg1: '#d97706', bg2: '#78350f', accent: '#fbbf24' }, // Gold / Zee
  { bg1: '#7c3aed', bg2: '#4c1d95', accent: '#c084fc' }, // Purple / Cinema
  { bg1: '#0284c7', bg2: '#075985', accent: '#38bdf8' }, // Cyan / News
];

/**
 * Generate an SVG data-URI badge for live channels when the CDN logo fails.
 * v3.9.1 FIX: changed "utf8" → "charset=UTF-8" in the MIME type. Older
 * WebView versions (Fire TV, Android 7-9) reject data URIs with the informal
 * "utf8" variant and leave the img blank.
 */
function createLiveChannelBadge(t = 'TV', _cat = 'Live') {
  const cleanTitle = String(t || 'Live TV').replace(/^(HD|FHD|4K|SD|LIVE)\s*/i, '').trim();
  const words = cleanTitle.split(/\s+/).filter(Boolean);
  const initials = words.length > 1
    ? (words[0][0] + (words[1][0] || '')).toUpperCase()
    : cleanTitle.slice(0, 3).toUpperCase();

  let hash = 0;
  for (let i = 0; i < cleanTitle.length; i++) hash = (hash << 5) - hash + cleanTitle.charCodeAt(i);
  const theme = COLOR_PALETTES[Math.abs(hash) % COLOR_PALETTES.length];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">
    <defs>
      <linearGradient id="bgG" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${theme.bg1}"/>
        <stop offset="100%" stop-color="${theme.bg2}"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#bgG)"/>
    <circle cx="160" cy="75" r="42" fill="rgba(255,255,255,0.12)" stroke="${theme.accent}" stroke-width="2"/>
    <text x="160" y="87" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="900" text-anchor="middle" letter-spacing="2">${initials}</text>
    <rect x="20" y="136" width="280" height="38" rx="8" fill="rgba(0,0,0,0.55)"/>
    <text x="160" y="160" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="700" text-anchor="middle">${cleanTitle.slice(0, 22)}</text>
    <rect x="236" y="12" width="68" height="22" rx="4" fill="${theme.accent}"/>
    <text x="270" y="27" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="10" font-weight="900" text-anchor="middle">LIVE HD</text>
  </svg>`;

  // Use charset=UTF-8 (RFC-compliant) instead of the informal "utf8" spelling.
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const VOD_FALLBACK_POSTER =
  'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22200%22%20height%3D%22300%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%23151c2c%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20fill%3D%22%2364748b%22%20dominant-baseline%3D%22middle%22%20text-anchor%3D%22middle%22%20font-family%3D%22sans-serif%22%20font-size%3D%2214%22%3ENo%20Poster%3C%2Ftext%3E%3C%2Fsvg%3E';

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

  const fallbackPoster = isLive
    ? createLiveChannelBadge(title, category)
    : VOD_FALLBACK_POSTER;

  return (
    <div
      tabIndex={0}
      className="tv-card"
      onClick={() => onClick && onClick(item)}
    >
      <div style={{ position: 'relative', width: '100%', overflow: 'hidden', borderRadius: '8px' }}>
        <img
          src={poster || fallbackPoster}
          alt={title}
          className={isLive ? 'tv-card-poster tv-card-live-poster' : 'tv-card-poster'}
          loading="lazy"
          onError={(e) => {
            e.target.src = fallbackPoster;
          }}
        />
        {typeof item.percentage === 'number' && item.percentage > 0 && !isLive && (
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '4px',
            background: 'rgba(0, 0, 0, 0.75)',
            zIndex: 2
          }}>
            <div style={{
              width: `${Math.min(100, Math.max(2, item.percentage))}%`,
              height: '100%',
              background: '#e50914',
              boxShadow: '0 0 6px #e50914'
            }} />
          </div>
        )}
      </div>

      <div className="tv-card-info">
        <span className="tv-card-title">{title}</span>
        <div className="tv-card-meta">
          {isLive ? (
            <span className="tv-badge-live">LIVE</span>
          ) : typeof item.percentage === 'number' && item.percentage > 0 ? (
            <span style={{ color: '#38bdf8', fontWeight: 700 }}>Resume {item.percentage}%</span>
          ) : (
            <span style={{ color: '#94a3b8' }}>{category}</span>
          )}

          {Boolean(rating) && !item.percentage && (
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
