import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Info, Star, Plus, Check, Sparkles } from 'lucide-react';

/**
 * MovieBox-style auto-rotating spotlight carousel for Android TV.
 * Shows 5-7 featured items with smooth cross-fade transitions and dot indicators.
 */
export function HeroBanner({ items = [], onPlay, onSelectInfo }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef(null);

  // Limit to 7 items max for the carousel
  const carouselItems = items.slice(0, 7).filter(Boolean);

  const goToSlide = useCallback((idx) => {
    setActiveIndex(idx % carouselItems.length);
  }, [carouselItems.length]);

  // Auto-rotate every 6 seconds
  useEffect(() => {
    if (isPaused || carouselItems.length <= 1) return;
    timerRef.current = setInterval(() => {
      setActiveIndex(prev => (prev + 1) % carouselItems.length);
    }, 6000);
    return () => clearInterval(timerRef.current);
  }, [isPaused, carouselItems.length]);

  // Pause on focus/interaction, resume on blur
  const handleFocus = () => setIsPaused(true);
  const handleBlur = () => setIsPaused(false);

  if (carouselItems.length === 0) return null;

  return (
    <div
      className="tv-hero-carousel"
      onMouseEnter={handleFocus}
      onMouseLeave={handleBlur}
    >
      {carouselItems.map((item, idx) => {
        const isActive = idx === activeIndex;
        const title = item.title_en || item.title || item.name || 'Featured';
        const poster = item.backdrop_url || item.poster_url || item.poster || '';
        const desc = typeof item.description === 'string' ? item.description : (item.overview || '');
        const year = item.year || (item.release_date ? item.release_date.split('-')[0] : '');
        const rating = typeof item.rating === 'number' ? item.rating.toFixed(1)
          : typeof item.rating === 'string' && item.rating !== '[object Object]' ? item.rating : '';
        const genres = item.genres?.map(g => g.name).filter(Boolean).slice(0, 3) || [];

        return (
          <div
            key={item.id || idx}
            className={`tv-hero-carousel-slide ${isActive ? 'active' : ''}`}
          >
            <div
              tabIndex={isActive ? 0 : -1}
              className="tv-hero"
              style={{
                backgroundImage: poster ? `url(${poster})` : undefined,
              }}
              onClick={() => onSelectInfo && onSelectInfo(item)}
              onFocus={handleFocus}
              onBlur={handleBlur}
            >
              <div className="tv-hero-overlay" />
              <div className="tv-hero-content">
                <div className="tv-hero-badge">
                  <Sparkles size={11} />
                  <span>Featured</span>
                </div>

                <h1 className="tv-hero-title">{title}</h1>

                {/* Meta row with year, rating, genres */}
                <div className="tv-hero-meta">
                  {year && <span className="tv-hero-meta-tag">{year}</span>}
                  {rating && (
                    <>
                      <span className="tv-hero-meta-separator" />
                      <span style={{ color: '#2DD4BF', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Star size={12} fill="#2DD4BF" color="#2DD4BF" />
                        {rating}
                      </span>
                    </>
                  )}
                  {genres.length > 0 && (
                    <>
                      <span className="tv-hero-meta-separator" />
                      <span>{genres.join(' • ')}</span>
                    </>
                  )}
                </div>

                <p className="tv-hero-desc">{desc}</p>

                <div className="tv-hero-actions">
                  <button
                    className="tv-hero-btn"
                    tabIndex={isActive ? 0 : -1}
                    onClick={(e) => { e.stopPropagation(); onPlay && onPlay(item); }}
                  >
                    <Play size={16} fill="#08080f" />
                    <span>Watch Now</span>
                  </button>
                  <button
                    className="tv-hero-btn-secondary"
                    tabIndex={isActive ? 0 : -1}
                    onClick={(e) => { e.stopPropagation(); onSelectInfo && onSelectInfo(item); }}
                  >
                    <Info size={15} />
                    <span>Details</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Dot indicators */}
      {carouselItems.length > 1 && (
        <div className="tv-hero-dots">
          {carouselItems.map((_, idx) => (
            <button
              key={idx}
              className={`tv-hero-dot ${idx === activeIndex ? 'active' : ''}`}
              onClick={() => goToSlide(idx)}
              tabIndex={0}
              aria-label={`Slide ${idx + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
