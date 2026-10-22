import React, { useRef } from 'react';
import { Film, Flame } from 'lucide-react';
import { useTouchDragScroll } from '../hooks/useTouchDragScroll';

export function Top10Rail({ title = "🔥 Top 10 in India Today", items = [], onSelectItem }) {
  const scrollRef = useRef(null);
  useTouchDragScroll(scrollRef); // v3.9.12: manual drag scroll
  if (!items || items.length === 0) return null;

  const top10 = items.slice(0, 10);

  return (
    <div className="mobile-rail-section" style={{ position: 'relative', zIndex: 20, margin: '22px 0' }}>
      <div className="mobile-rail-header" style={{ position: 'relative', zIndex: 20, padding: '0 16px 10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '24px',
            height: '24px',
            borderRadius: '6px',
            background: 'rgba(239, 68, 68, 0.18)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Flame size={14} color="#ef4444" />
          </div>
          <h2 className="mobile-rail-title" style={{
            fontSize: '18px',
            fontWeight: 900,
            color: '#ffffff',
            letterSpacing: '-0.3px',
            textShadow: '0 2px 8px rgba(0, 0, 0, 0.8)',
            margin: 0
          }}>
            {title}
          </h2>
        </div>
      </div>

      <div ref={scrollRef} className="mobile-top10-scroll" style={{
        position: 'relative',
        zIndex: 20,
        display: 'flex',
        gap: '12px',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        touchAction: 'pan-x pan-y',
        padding: '0 16px 10px 16px',
        scrollSnapType: 'x proximity', // v3.9.12: was 'x mandatory' — mandatory snap fought the drag-scroll momentum and could snap BACK after a swipe
        scrollbarWidth: 'none',
        // v3.9.10: first card's rank numeral no longer hangs off the left edge
        scrollPaddingLeft: 16
      }}>
        {top10.map((item, index) => {
          const rank = index + 1;
          const poster = item.poster_url || item.poster || item.logo || '';
          const itemTitle = item.title_en || item.title || item.name || 'Untitled';

          return (
            <div
              key={item.id || index}
              className="mobile-top10-card"
              onClick={() => onSelectItem(item)}
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                position: 'relative',
                flex: '0 0 auto',
                scrollSnapAlign: 'start',
                cursor: 'pointer',
                transition: 'transform 0.1s ease',
                userSelect: 'none'
              }}
            >
              {/* Netflix-style rank numeral — dark fill + VISIBLE gray
                  outline (the v3.9.10 dark-on-dark stroke read as invisible);
                  margin overlap kept inside the scroll padding so #1 never
                  clips at the left edge. */}
              <div className="mobile-top10-rank-number" aria-hidden="true" style={{
                fontSize: '88px',
                fontWeight: 900,
                lineHeight: '0.78',
                color: '#16181f',
                WebkitTextStroke: '2.5px #5b6472',
                marginRight: '-16px',
                zIndex: 1,
                letterSpacing: '-4px',
                flexShrink: 0
              }}>
                {rank}
              </div>

              {/* Poster Box */}
              <div className="mobile-top10-poster-box" style={{
                position: 'relative',
                width: '125px',
                aspectRatio: '2 / 3',
                borderRadius: '10px',
                overflow: 'hidden',
                background: '#10101a',
                border: '1px solid rgba(255, 255, 255, 0.10)',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
                zIndex: 2
              }}>
                {poster ? (
                  <img
                    src={poster}
                    alt={itemTitle}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#10101a' }}>
                    <Film size={28} color="#00BB7F" />
                  </div>
                )}

                {/* Top 10 badge — TV parity red tag */}
                <div style={{
                  position: 'absolute',
                  top: '6px',
                  left: '6px',
                  background: '#E50914',
                  color: '#ffffff',
                  fontSize: '8px',
                  fontWeight: 900,
                  padding: '2px 5px',
                  borderRadius: '3px',
                  letterSpacing: '0.5px'
                }}>
                  TOP 10
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
