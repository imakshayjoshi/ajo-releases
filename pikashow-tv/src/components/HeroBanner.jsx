import React, { useState, useEffect } from 'react';
import { Play, Info, Star, Plus, Check, Sparkles } from 'lucide-react';
import { getSourceProvider } from '../utils/sourceProvider';
import { isFavorite, toggleFavorite } from '../api/history';

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
  const poster = featuredItem.backdrop_url || featuredItem.poster_url || featuredItem.poster || featuredItem.logo || '';
  const provider = getSourceProvider(featuredItem);

  const handleToggleWatchlist = (e) => {
    e.stopPropagation();
    const newState = toggleFavorite(featuredItem);
    setInWatchlist(newState);
    if (onFavoritesChanged) onFavoritesChanged();
  };

  const genres = featuredItem.genres?.map(g => g.name).filter(Boolean) || [];
  const genreTags = genres.length > 0 
    ? genres.slice(0, 3).join(' • ')
    : (isLive ? '24/7 Live Broadcast • Ultra HD' : 'Action • Thriller • Blockbuster');

  return (
    <section 
      className="mobile-netflix-hero" 
      onClick={() => onSelectInfo(featuredItem)}
      style={{
        position: 'relative',
        width: '100%',
        height: '490px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        padding: '0 16px 20px 16px',
        cursor: 'pointer',
        overflow: 'hidden'
      }}
    >
      {/* Cinematic Backdrop Image */}
      {poster && (
        <div 
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage: `url(${poster})`,
            backgroundSize: 'cover',
            backgroundPosition: 'top center',
            transform: 'scale(1.04)',
            filter: 'brightness(0.92)'
          }}
        />
      )}

      {/* Netflix Vignette Gradient Overlays */}
      <div 
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'linear-gradient(180deg, rgba(6, 9, 14, 0.2) 0%, rgba(6, 9, 14, 0.1) 40%, rgba(6, 9, 14, 0.8) 75%, #06090e 100%)',
          pointerEvents: 'none'
        }} 
      />

      <div style={{ position: 'relative', zIndex: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        {/* Netflix Red AJO Ribbon */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <div style={{
            background: 'rgba(229, 9, 20, 0.95)',
            color: '#ffffff',
            fontSize: '9px',
            fontWeight: 900,
            letterSpacing: '1.2px',
            padding: '3px 8px',
            borderRadius: '4px',
            boxShadow: '0 2px 8px rgba(229, 9, 20, 0.4)'
          }}>
            🔴 AJO ORIGINALS
          </div>

          <div style={{
            background: 'rgba(0, 0, 0, 0.75)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: '#38bdf8',
            fontSize: '9px',
            fontWeight: 800,
            padding: '3px 7px',
            borderRadius: '4px'
          }}>
            ⚡ 4K DOLBY ATMOS
          </div>
        </div>

        {/* Big Hero Title */}
        <h1 style={{
          fontSize: '28px',
          fontWeight: 900,
          color: '#ffffff',
          letterSpacing: '-0.5px',
          lineHeight: '1.15',
          margin: '0 0 6px 0',
          textShadow: '0 2px 16px rgba(0,0,0,0.9)',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden'
        }}>
          {title}
        </h1>

        {/* Netflix Dot-Separated Genre Tags */}
        <div style={{
          fontSize: '12px',
          fontWeight: 700,
          color: '#cbd5e1',
          marginBottom: '16px',
          textShadow: '0 1px 4px rgba(0,0,0,0.8)'
        }}>
          {genreTags}
        </div>

        {/* Netflix Iconic Triad Action Row */}
        <div 
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            width: '100%',
            maxWidth: '340px'
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* 1. My List Button */}
          <button 
            className="tv-hero-action-btn tv-focusable-btn"
            data-focusable="true"
            tabIndex={0}
            onClick={handleToggleWatchlist}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              background: 'transparent',
              border: 'none',
              color: inWatchlist ? '#38bdf8' : '#ffffff',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 700
            }}
          >
            {inWatchlist ? <Check size={22} color="#38bdf8" /> : <Plus size={22} color="#ffffff" />}
            <span>{inWatchlist ? 'My List' : 'My List'}</span>
          </button>

          {/* 2. Solid White Netflix Play Button */}
          <button 
            className="tv-hero-action-btn tv-focusable-btn"
            data-focusable="true"
            tabIndex={0}
            onClick={() => onPlay(featuredItem)}
            style={{
              flex: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '11px 24px',
              borderRadius: '8px',
              background: '#ffffff',
              color: '#06090e',
              border: 'none',
              fontSize: '15px',
              fontWeight: 900,
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(255, 255, 255, 0.35)',
              transition: 'transform 0.1s ease'
            }}
          >
            <Play size={18} fill="#06090e" color="#06090e" />
            <span>Play</span>
          </button>

          {/* 3. Info Button */}
          <button 
            className="tv-hero-action-btn tv-focusable-btn"
            data-focusable="true"
            tabIndex={0}
            onClick={() => onSelectInfo(featuredItem)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              background: 'transparent',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 700
            }}
          >
            <Info size={22} color="#ffffff" />
            <span>Info</span>
          </button>
        </div>
      </div>
    </section>
  );
}
