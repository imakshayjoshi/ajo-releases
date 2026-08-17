import React, { useState } from 'react';
import { Star, Radio, Play, Tv } from 'lucide-react';
import { getSourceProvider } from '../utils/sourceProvider';
import { castEngine } from '../api/castSync';

export const LandscapeMediaCard = React.memo(function LandscapeMediaCard({ item, onClick, onFocus }) {
  const [imgError, setImgError] = useState(false);
  const [castSuccess, setCastSuccess] = useState(false);

  if (!item) return null;

  const title = item.title_en || item.title || item.title_ru || item.name || "Live Broadcast";
  const rating = item.ratings?.mlab?.rating || item.ratings?.imdb?.rating;
  const isLive = item.is_live || item.type === 'live' || item.year === 'LIVE';
  const logo = item.logo || item.poster_url || item.poster || item.image || '';
  const provider = getSourceProvider(item);

  const handleCastDirectly = (e) => {
    e.stopPropagation();
    castEngine.sendToTV({
      type: 'PLAY_MEDIA',
      item: item,
      server: item.players?.[0] || item.player?.[0] || (item.url ? { url: item.url, source: 'm3u8' } : null)
    });
    setCastSuccess(true);
    setTimeout(() => setCastSuccess(false), 2500);
    if (navigator.vibrate) {
      try { navigator.vibrate([40, 30, 40]); } catch (_) {}
    }
  };

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

        <div className="mobile-card-gradient" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.1) 0%, transparent 40%, rgba(0,0,0,0.85) 100%)', pointerEvents: 'none' }} />

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

        {/* 1-Tap Play on TV Button */}
        <button
          onClick={handleCastDirectly}
          className="mobile-card-tv-cast-btn"
          title="Play on TV"
          style={{
            position: 'absolute',
            top: '6px',
            right: '6px',
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            background: castSuccess ? 'rgba(34, 197, 94, 0.95)' : 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(8px)',
            border: castSuccess ? '1px solid rgba(74, 222, 128, 0.8)' : '1px solid rgba(255, 255, 255, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 30,
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.7)',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        >
          <Tv size={14} color={castSuccess ? '#ffffff' : '#38bdf8'} />
        </button>

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
