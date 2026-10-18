import React, { useState, useEffect } from 'react';
import { Play, Info, Star, Plus, Check } from 'lucide-react';
import { getSourceProvider } from '../utils/sourceProvider';
import { isFavorite, toggleFavorite } from '../api/history';

// v3.5.1: bingr.one-style hero — left-aligned bottom stack, condensed Bebas
// display title, yellow-star rating meta, green primary Play. Replaces the
// centered Netflix layout (red ribbon, white play button).
export function HeroBanner({ featuredItem, onPlay, onSelectInfo, onFavoritesChanged }) {
  const [inWatchlist, setInWatchlist] = useState(false);

  useEffect(() => {
    if (featuredItem) {
      setInWatchlist(isFavorite(featuredItem));
    }
  }, [featuredItem]);

  if (!featuredItem) return null;

  const isLive = featuredItem.is_live || featuredItem.type === 'live' || featuredItem.year === 'LIVE';
  const title = featuredItem.title_en || featuredItem.title || featuredItem.title_ru || featuredItem.name || "Featured Spotlight";
  const poster = featuredItem.backdrop_url || featuredItem.backdrop || featuredItem.poster_url || featuredItem.poster || featuredItem.logo || '';
  const provider = getSourceProvider(featuredItem);

  const handleToggleWatchlist = (e) => {
    e.stopPropagation();
    const newState = toggleFavorite(featuredItem);
    setInWatchlist(newState);
    if (onFavoritesChanged) onFavoritesChanged();
  };

  const genres = featuredItem.genres?.map(g => (typeof g === 'string' ? g : g.name)).filter(Boolean) || [];
  const rating = featuredItem.rating ? Number(featuredItem.rating).toFixed(1) : null;
  const year = featuredItem.year || '';
  // bingr meta format: "6.1 · 2026 · Thriller · Drama"
  const metaParts = [year, ...genres.slice(0, 2)].filter(Boolean).join(' · ');

  return (
    <section
      className="mobile-netflix-hero"
      onClick={() => onSelectInfo(featuredItem)}
      style={{
        position: 'relative',
        width: '100%',
        height: '520px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        padding: '0 18px 22px 18px',
        cursor: 'pointer',
        overflow: 'hidden'
      }}
    >
      {/* Backdrop */}
      {poster && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${poster})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center 20%',
            transform: 'scale(1.03)',
            filter: 'brightness(0.95)'
          }}
        />
      )}

      {/* bingr gradient: clear image on top, solid #0f1014 at the bottom */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(15,16,20,0.05) 0%, rgba(15,16,20,0.15) 35%, rgba(15,16,20,0.72) 72%, #0f1014 100%)',
          pointerEvents: 'none'
        }}
      />

      <div style={{ position: 'relative', zIndex: 3, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left' }}>
        {/* small provider eyebrow, bingr-green */}
        {provider && (
          <div style={{
            color: '#00BB7F',
            fontSize: '10px',
            fontWeight: 900,
            letterSpacing: '1.6px',
            textTransform: 'uppercase',
            marginBottom: '6px',
            textShadow: '0 1px 6px rgba(0,0,0,0.8)'
          }}>
            {isLive ? 'LIVE TV' : String(provider).replace(/-/g, ' ')}
          </div>
        )}

        {/* Bebas display title */}
        <h1 style={{
          fontFamily: "'Bebas Neue', 'Anton', Impact, sans-serif",
          fontSize: '46px',
          fontWeight: 400,
          color: '#ffffff',
          letterSpacing: '1.5px',
          lineHeight: '0.95',
          margin: '0 0 8px 0',
          textTransform: 'uppercase',
          textShadow: '0 2px 18px rgba(0,0,0,0.85)',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden'
        }}>
          {title}
        </h1>

        {/* meta row: yellow star rating · year · genres */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '12.5px',
          fontWeight: 700,
          color: '#c7ccd4',
          marginBottom: '18px',
          textShadow: '0 1px 4px rgba(0,0,0,0.8)'
        }}>
          {rating && (
            <>
              <Star size={13} fill="#FFD236" color="#FFD236" />
              <span style={{ color: '#FFD236' }}>{rating}</span>
              {(metaParts) && <span style={{ color: '#5f6773' }}>·</span>}
            </>
          )}
          {isLive ? '24/7 Live · Ultra HD' : metaParts}
        </div>

        {/* bingr action row: solid green Play + ghost My List + ghost Info */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => onPlay(featuredItem)}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '13px 24px',
              borderRadius: '8px',
              background: '#00BB7F',
              color: '#04120d',
              border: 'none',
              fontSize: '15px',
              fontWeight: 900,
              cursor: 'pointer',
              boxShadow: '0 6px 20px rgba(0, 187, 127, 0.35)'
            }}
          >
            <Play size={18} fill="#04120d" color="#04120d" />
            <span>Play</span>
          </button>

          <button
            onClick={handleToggleWatchlist}
            aria-label="My List"
            style={{
              width: '47px',
              height: '47px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px',
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.18)',
              color: inWatchlist ? '#00BB7F' : '#ffffff',
              cursor: 'pointer',
              backdropFilter: 'blur(8px)'
            }}
          >
            {inWatchlist ? <Check size={20} color="#00BB7F" /> : <Plus size={20} color="#ffffff" />}
          </button>

          <button
            onClick={() => onSelectInfo(featuredItem)}
            aria-label="More info"
            style={{
              width: '47px',
              height: '47px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px',
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.18)',
              color: '#ffffff',
              cursor: 'pointer',
              backdropFilter: 'blur(8px)'
            }}
          >
            <Info size={20} color="#ffffff" />
          </button>
        </div>
      </div>
    </section>
  );
}
