import React, { useState } from 'react';
import { Star, Film } from 'lucide-react';
import { LazyImage } from './LazyImage';

export const MediaCard = React.memo(function MediaCard({ item, onClick, onFocus }) {
  const [imgError, setImgError] = useState(false);

  if (!item) return null;

  const title = item.title_en || item.title || item.title_ru || item.name || "Untitled";
  const rating = item.ratings?.mlab?.rating || item.ratings?.imdb?.rating || item.rating;
  const isLive = item.is_live || item.type === 'live' || item.year === 'LIVE';
  const year = isLive ? 'LIVE' : (item.year || '2026');
  const poster = item.poster_url || item.poster || item.logo || item.image || '';
  const progressPercent = item.percentage;

  return (
    <div
      className="mobile-portrait-card"
      onClick={() => onClick && onClick(item)}
      style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 10 }}
    >
      <div 
        className="mobile-card-poster-box"
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '2 / 3',
          borderRadius: '12px',
          overflow: 'hidden',
          background: '#10101a',
          border: '1px solid rgba(255, 255, 255, 0.10)',
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.4)'
        }}
      >
        {!imgError && poster ? (
          <LazyImage
            src={poster}
            alt={title}
            className="mobile-card-img"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="mobile-card-fallback" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px', background: '#0f172a' }}>
            <Film size={24} color="#00BB7F" />
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#ffffff', marginTop: '4px', textAlign: 'center' }}>{title}</span>
          </div>
        )}

        <div className="mobile-card-gradient" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, transparent 40%, rgba(0,0,0,0.85) 100%)', pointerEvents: 'none' }} />

        {/* Top-left badge — ONE only: LIVE for channels, rating for VOD.
            v3.9.10 TV parity: removed the fake "4K" pill that sat on every
            card, the per-card cast mini-button (cast lives in the details
            modal), and the provider pill — the card carries art + one badge. */}
        {(isLive || Boolean(rating)) && (
          <div className="mobile-card-top-badges" style={{ position: 'absolute', top: '6px', left: '6px', pointerEvents: 'none' }}>
            {isLive ? (
              <div className="mobile-live-pill" style={{ background: '#E50914', padding: '2px 6px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span className="mobile-live-dot" style={{ width: '4px', height: '4px', background: '#fff', borderRadius: '50%' }} />
                <span style={{ fontSize: '9px', fontWeight: 900, color: '#fff', letterSpacing: '0.5px' }}>LIVE</span>
              </div>
            ) : (
              <div className="mobile-rating-pill" style={{ background: 'rgba(0,0,0,0.8)', padding: '2px 6px', borderRadius: '5px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                <Star size={10} fill="#FFD236" strokeWidth={0} />
                <span style={{ fontSize: '10px', fontWeight: 800, color: '#fff' }}>{typeof rating === 'number' ? rating.toFixed(1) : rating}</span>
              </div>
            )}
          </div>
        )}

        {/* Watch Progress — TV parity red bar */}
        {progressPercent !== undefined && (
          <div className="mobile-progress-track" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '3px', background: 'rgba(0,0,0,0.7)' }}>
            <div className="mobile-progress-bar" style={{ width: `${progressPercent}%`, height: '100%', background: '#e50914' }} />
          </div>
        )}
      </div>

      {/* Info below card with clear bold text */}
      <div className="mobile-card-info" style={{ marginTop: '6px', padding: '0 2px' }}>
        <span 
          className="mobile-card-title"
          style={{
            fontSize: '13px',
            fontWeight: 800,
            color: '#ffffff',
            lineHeight: '1.25',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            textShadow: '0 1px 4px rgba(0, 0, 0, 0.8)'
          }}
        >
          {title}
        </span>
        <div 
          className="mobile-card-sub"
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: '#94a3b8',
            marginTop: '3px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          <span>{year}</span>
          {(item.genres?.[0]?.name || item.category) && (
            <>
              <span>•</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.genres?.[0]?.name || item.category}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
});
