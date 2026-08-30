import React, { useState } from 'react';
import { Star, Radio, Play } from 'lucide-react';
import { getSourceProvider } from '../utils/sourceProvider';

export const LandscapeMediaCard = React.memo(function LandscapeMediaCard({ item, onClick, onFocus }) {
  const [imgError, setImgError] = useState(false);

  if (!item) return null;

  const title = item.title_en || item.title || item.title_ru || item.name || "Live Broadcast";
  const rating = item.ratings?.mlab?.rating || item.ratings?.imdb?.rating;
  const isLive = item.is_live || item.type === 'live' || item.year === 'LIVE';
  const logo = item.logo || item.poster_url || item.poster || item.image || '';
  const provider = getSourceProvider(item);

  return (
    <div
      className="tv-card tv-landscape-card tv-focusable-card"
      data-focusable="true"
      tabIndex={0}
      onClick={() => onClick && onClick(item)}
      onFocus={() => onFocus && onFocus(item)}
      style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 10 }}
    >
      <div className="mobile-landscape-media-box" style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16 / 9',
        borderRadius: '12px',
        overflow: 'hidden',
        background: '#111827',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.6)'
      }}>
        {!imgError && logo ? (
          <img
            src={logo}
            alt={title}
            className="mobile-landscape-img"
            style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#0a0f18', padding: '6px' }}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="mobile-landscape-fallback" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px', background: '#0f172a' }}>
            <Radio size={28} color="#38bdf8" />
            <span style={{ fontSize: '12px', fontWeight: 800, marginTop: '4px', color: '#ffffff', textAlign: 'center' }}>
              {title}
            </span>
          </div>
        )}

        <div className="mobile-card-gradient" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.1) 0%, transparent 40%, rgba(0,0,0,0.85) 100%)', pointerEvents: 'none' }} />

        {/* Live Badge */}
        <div className="mobile-live-badge" style={{
          position: 'absolute',
          top: '6px',
          left: '6px',
          background: 'rgba(239, 68, 68, 0.95)',
          padding: '2px 6px',
          borderRadius: '5px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          <span className="mobile-live-dot" style={{ width: '4px', height: '4px', background: '#fff', borderRadius: '50%' }} />
          <span style={{ fontSize: '9px', fontWeight: 900, color: '#fff' }}>LIVE</span>
        </div>

        {/* Play Icon on Bottom */}
        <div className="mobile-landscape-play-overlay" style={{
          position: 'absolute',
          bottom: '6px',
          left: '6px',
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          background: 'rgba(56, 189, 248, 0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Play size={13} fill="#06090e" color="#06090e" style={{ marginLeft: '1px' }} />
        </div>

        {/* Broadcaster Badge */}
        <div 
          className="mobile-landscape-provider"
          style={{
            position: 'absolute',
            bottom: '6px',
            right: '6px',
            width: '22px',
            height: '22px',
            borderRadius: '6px',
            background: provider.color || '#3b82f6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            boxShadow: '0 2px 6px rgba(0,0,0,0.6)'
          }}
        >
          <span>{provider.icon}</span>
        </div>

        {/* Continue Watching Progress Bar */}
        {typeof item.percentage === 'number' && item.percentage > 0 && !isLive && (
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '4px',
            background: 'rgba(0, 0, 0, 0.75)',
            zIndex: 6
          }}>
            <div style={{
              width: `${Math.min(100, Math.max(2, item.percentage))}%`,
              height: '100%',
              background: '#38bdf8',
              boxShadow: '0 0 6px #38bdf8'
            }} />
          </div>
        )}
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
          <span>•</span>
          <span>1080p HD</span>
        </div>
      </div>
    </div>
  );
});
