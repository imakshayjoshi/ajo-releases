import React, { useState } from 'react';
import { Star, Radio } from 'lucide-react';
import { LazyImage } from './LazyImage';

export const LandscapeMediaCard = React.memo(function LandscapeMediaCard({ item, onClick, onFocus }) {
  const [imgError, setImgError] = useState(false);

  if (!item) return null;

  const title = item.title_en || item.title || item.title_ru || item.name || "Live Broadcast";
  const rating = item.ratings?.mlab?.rating || item.ratings?.imdb?.rating;
  const isLive = item.is_live || item.type === 'live' || item.year === 'LIVE';
  const logo = item.logo || item.poster_url || item.poster || item.image || '';

  return (
    <div
      className="mobile-landscape-card"
      onClick={() => onClick && onClick(item)}
      style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 10 }}
    >
      <div className="mobile-landscape-media-box" style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16 / 9',
        borderRadius: '12px',
        overflow: 'hidden',
        background: '#10101a',
        border: '1px solid rgba(255, 255, 255, 0.10)',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)'
      }}>
        {!imgError && logo ? (
          <LazyImage
            src={logo}
            alt={title}
            className="mobile-landscape-img"
            style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#0a0f18', padding: '6px' }}
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="mobile-landscape-fallback" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px', background: '#0f172a' }}>
            <Radio size={28} color="#00BB7F" />
            <span style={{ fontSize: '12px', fontWeight: 800, marginTop: '4px', color: '#ffffff', textAlign: 'center' }}>
              {title}
            </span>
          </div>
        )}

        <div className="mobile-card-gradient" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.1) 0%, transparent 40%, rgba(0,0,0,0.85) 100%)', pointerEvents: 'none' }} />

        {/* Live Badge — TV parity red tag */}
        <div className="mobile-live-badge" style={{
          position: 'absolute',
          top: '6px',
          left: '6px',
          background: '#E50914',
          padding: '2px 6px',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          <span className="mobile-live-dot" style={{ width: '4px', height: '4px', background: '#fff', borderRadius: '50%' }} />
          <span style={{ fontSize: '9px', fontWeight: 900, color: '#fff', letterSpacing: '0.5px' }}>LIVE</span>
        </div>
      </div>

      <div className="mobile-landscape-info" style={{ marginTop: '6px', padding: '0 2px' }}>
        <span className="mobile-landscape-title" style={{
          fontSize: '13px',
          fontWeight: 800,
          color: '#ffffff',
          lineHeight: '1.25',
          display: '-webkit-box',
          WebkitLineClamp: 1,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          textShadow: '0 1px 4px rgba(0, 0, 0, 0.8)'
        }}>
          {title}
        </span>
        <div className="mobile-landscape-sub" style={{
          fontSize: '11px',
          fontWeight: 700,
          color: '#94a3b8',
          marginTop: '3px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          <span>{item.category || 'Live Channel'}</span>
        </div>
      </div>
    </div>
  );
});
