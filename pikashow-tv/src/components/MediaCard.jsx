import React, { useState } from 'react';
import { Star, Film, Play, Tv } from 'lucide-react';
import { getSourceProvider } from '../utils/sourceProvider';
import { castEngine } from '../api/castSync';

export const MediaCard = React.memo(function MediaCard({ item, onClick, onFocus }) {
  const [imgError, setImgError] = useState(false);
  const [casted, setCasted] = useState(false);

  if (!item) return null;

  const title = item.title_en || item.title || item.title_ru || item.name || "Untitled";
  const rating = item.ratings?.mlab?.rating || item.ratings?.imdb?.rating;
  const isLive = item.is_live || item.type === 'live' || item.year === 'LIVE';
  const year = isLive ? 'LIVE' : (item.year || '2026');
  const poster = item.poster_url || item.poster || item.logo || item.image || '';
  const progressPercent = item.percentage;
  const provider = getSourceProvider(item);

  const handleCastToTV = (e) => {
    e.stopPropagation();
    castEngine.sendToTV({
      type: 'PLAY_MEDIA',
      item: item
    });
    setCasted(true);
    setTimeout(() => setCasted(false), 2000);
    if (navigator.vibrate) {
      try { navigator.vibrate([40, 30, 40]); } catch (err) {}
    }
  };

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
          background: '#111827',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.6)'
        }}
      >
        {!imgError && poster ? (
          <img
            src={poster}
            alt={title}
            className="mobile-card-img"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="mobile-card-fallback" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px', background: '#0f172a' }}>
            <Film size={24} color="#38bdf8" />
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#ffffff', marginTop: '4px', textAlign: 'center' }}>{title}</span>
          </div>
        )}

        <div className="mobile-card-gradient" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, transparent 40%, rgba(0,0,0,0.85) 100%)', pointerEvents: 'none' }} />

        {/* Top Badges */}
        <div className="mobile-card-top-badges" style={{ position: 'absolute', top: '6px', left: '6px', right: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', pointerEvents: 'none' }}>
          {isLive ? (
            <div className="mobile-live-pill" style={{ background: 'rgba(239, 68, 68, 0.95)', padding: '2px 6px', borderRadius: '5px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span className="mobile-live-dot" style={{ width: '4px', height: '4px', background: '#fff', borderRadius: '50%' }} />
              <span style={{ fontSize: '9px', fontWeight: 900, color: '#fff' }}>LIVE</span>
            </div>
          ) : rating ? (
            <div className="mobile-rating-pill" style={{ background: 'rgba(0,0,0,0.85)', padding: '2px 6px', borderRadius: '5px', display: 'flex', alignItems: 'center', gap: '3px' }}>
              <Star size={10} fill="#facc15" strokeWidth={0} />
              <span style={{ fontSize: '10px', fontWeight: 800, color: '#fff' }}>{typeof rating === 'number' ? rating.toFixed(1) : rating}</span>
            </div>
          ) : <div />}

          <div className="mobile-quality-pill" style={{ background: 'rgba(56, 189, 248, 0.95)', padding: '2px 6px', borderRadius: '5px' }}>
            <span style={{ fontSize: '9px', fontWeight: 900, color: '#06090e' }}>4K</span>
          </div>
        </div>

        {/* Quick Play & Cast Buttons on Poster Bottom */}
        <div style={{
          position: 'absolute',
          bottom: '6px',
          left: '6px',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          zIndex: 15
        }}>
          <button
            onClick={handleCastToTV}
            style={{
              background: casted ? 'rgba(56, 189, 248, 0.9)' : 'rgba(15, 23, 42, 0.85)',
              border: '1px solid rgba(56, 189, 248, 0.6)',
              borderRadius: '6px',
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: casted ? '#06090e' : '#38bdf8',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.5)'
            }}
            title="Play on TV"
          >
            <Tv size={12} />
          </button>
        </div>

        {/* Streaming Source Badge */}
        <div 
          className="mobile-source-pill"
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

        {/* Watch Progress */}
        {progressPercent !== undefined && (
          <div className="mobile-progress-track" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '3px', background: 'rgba(255,255,255,0.2)' }}>
            <div className="mobile-progress-bar" style={{ width: `${progressPercent}%`, height: '100%', background: '#38bdf8' }} />
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
          <span>•</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.genres?.[0]?.name || item.category || '4K UHD'}
          </span>
        </div>
      </div>
    </div>
  );
});
