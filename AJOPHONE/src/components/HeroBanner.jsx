import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Info, Star, Plus, Check, Sparkles } from 'lucide-react';
import { isFavorite, toggleFavorite } from '../api/history';

// v3.9.0: TV-parity hero — the same auto-rotating spotlight carousel as the
// Android TV app (tv-hero design tokens: accent badge, 900-weight title,
// green-glow Play button, dot indicators), adapted to portrait + touch.
// Accepts a LIST of items (featuredItems) or a single featuredItem; rotates
// every 6s, pauses while touching, swipe to change slide.
export function HeroBanner({ featuredItem, featuredItems, onPlay, onSelectInfo, onFavoritesChanged }) {
  const items = (Array.isArray(featuredItems) && featuredItems.length > 0
    ? featuredItems
    : featuredItem ? [featuredItem] : []
  ).filter(Boolean).slice(0, 7);

  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [inWatchlist, setInWatchlist] = useState(false);
  const timerRef = useRef(null);
  const touchRef = useRef(null);

  const active = items[activeIndex] || items[0] || null;

  useEffect(() => {
    if (active) setInWatchlist(isFavorite(active));
  }, [active]);

  useEffect(() => {
    if (isPaused || items.length <= 1) return;
    timerRef.current = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % items.length);
    }, 6000);
    return () => clearInterval(timerRef.current);
  }, [isPaused, items.length]);

  const goToSlide = useCallback((idx) => {
    if (items.length === 0) return;
    setActiveIndex(((idx % items.length) + items.length) % items.length);
  }, [items.length]);

  const onTouchStart = (e) => { touchRef.current = e.touches[0].clientX; setIsPaused(true); };
  const onTouchEnd = (e) => {
    setIsPaused(false);
    if (touchRef.current == null || items.length <= 1) return;
    const dx = e.changedTouches[0].clientX - touchRef.current;
    touchRef.current = null;
    if (Math.abs(dx) > 42) goToSlide(activeIndex + (dx < 0 ? 1 : -1));
  };

  if (!active) return null;

  const isLive = active.is_live || active.type === 'live' || active.year === 'LIVE';
  const title = active.title_en || active.title || active.title_ru || active.name || 'Featured';
  const genres = (active.genres || []).map(g => (typeof g === 'string' ? g : g.name)).filter(Boolean);
  const rating = active.rating ? Number(active.rating).toFixed(1) : null;
  const year = active.year || (active.release_date ? String(active.release_date).split('-')[0] : '');
  const desc = typeof active.description === 'string' ? active.description : (active.overview || '');

  const handleToggleWatchlist = (e) => {
    e.stopPropagation();
    const newState = toggleFavorite(active);
    setInWatchlist(newState);
    if (onFavoritesChanged) onFavoritesChanged();
  };

  return (
    <section
      className="ajo-hero"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onClick={() => onSelectInfo && onSelectInfo(active)}
      style={{
        position: 'relative',
        width: '100%',
        height: '480px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        overflow: 'hidden',
        cursor: 'pointer'
      }}
    >
      {/* slides cross-fade */}
      {items.map((item, idx) => {
        const p = item.backdrop_url || item.backdrop || item.poster_url || item.poster || item.logo || '';
        return (
          <div
            key={item.id || idx}
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: p ? `url(${p})` : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center 20%',
              opacity: idx === activeIndex ? 1 : 0,
              transition: 'opacity 0.7s ease',
              transform: 'scale(1.02)'
            }}
          />
        );
      })}

      {/* gradient into page bg — a slate gradient under everything so the
          hero is never a pure black void while poster art loads (v3.9.10) */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, #171a22 0%, #131519 55%, #0f1014 100%)',
        pointerEvents: 'none', zIndex: 1
      }} />
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(180deg, rgba(15,16,20,0.08) 0%, rgba(15,16,20,0.18) 40%, rgba(15,16,20,0.78) 74%, #0f1014 100%)',
        pointerEvents: 'none', zIndex: 2
      }} />

      <div style={{ position: 'relative', zIndex: 3, padding: '0 18px 22px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left' }}>
        {/* badge (tv-hero-badge) */}
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: '#E50914', color: '#fff',
          fontSize: 11, fontWeight: 900, textTransform: 'uppercase',
          padding: '3px 10px', borderRadius: 4, marginBottom: 10, letterSpacing: 0.8
        }}>
          <Sparkles size={11} />
          Featured
        </span>

        {/* title (tv-hero-title) */}
        <h1 style={{
          fontSize: 30, fontWeight: 900, lineHeight: 1.15, letterSpacing: -0.5,
          margin: '0 0 8px', color: '#fff', textShadow: '0 2px 20px rgba(0,0,0,0.9)',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
        }}>{title}</h1>

        {/* meta row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, fontSize: 13, color: '#d7dae0', fontWeight: 600, flexWrap: 'wrap' }}>
          {rating && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#FFD236' }}>
              <Star size={13} fill="#FFD236" /> {rating}
            </span>
          )}
          {year && <span>{year}</span>}
          {genres.slice(0, 2).map(g => <span key={g} style={{ opacity: 0.85 }}>{g}</span>)}
          {isLive && <span style={{ color: '#ff4d4d', fontWeight: 800 }}>● LIVE</span>}
        </div>

        {desc && (
          <p style={{
            margin: '0 0 14px', fontSize: 13, lineHeight: 1.45, color: '#b9bdc7',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            maxWidth: 520
          }}>{desc}</p>
        )}

        {/* actions (tv-hero-btn) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onPlay && onPlay(active)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '12px 26px', background: '#00BB7F', color: '#0f1014',
              fontWeight: 800, fontSize: 15, borderRadius: 8, border: 'none',
              cursor: 'pointer'
            }}
          >
            <Play size={17} fill="#0f1014" /> Play
          </button>
          <button
            onClick={handleToggleWatchlist}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '12px 18px', background: 'rgba(255,255,255,0.1)', color: '#fff',
              fontWeight: 700, fontSize: 14, borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.22)', cursor: 'pointer'
            }}
          >
            {inWatchlist ? <Check size={16} color="#00BB7F" /> : <Plus size={16} />} My List
          </button>
          <button
            onClick={() => onSelectInfo && onSelectInfo(active)}
            aria-label="More info"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 44, height: 44, background: 'rgba(255,255,255,0.1)', color: '#fff',
              borderRadius: 8, border: '1px solid rgba(255,255,255,0.22)', cursor: 'pointer'
            }}
          >
            <Info size={17} />
          </button>
        </div>
      </div>

      {/* dots */}
      {items.length > 1 && (
        <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 7, zIndex: 10 }}>
          {items.map((_, idx) => (
            <button
              key={idx}
              aria-label={`Slide ${idx + 1}`}
              onClick={(e) => { e.stopPropagation(); goToSlide(idx); }}
              style={{
                width: idx === activeIndex ? 18 : 7, height: 7,
                borderRadius: 4, border: 'none', padding: 0, cursor: 'pointer',
                background: idx === activeIndex ? '#00BB7F' : 'rgba(255,255,255,0.35)',
                transition: 'all 0.25s ease'
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}
