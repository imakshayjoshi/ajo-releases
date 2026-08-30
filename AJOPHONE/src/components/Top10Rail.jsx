import React from 'react';
import { Film, Flame } from 'lucide-react';
import { getSourceProvider } from '../utils/sourceProvider';

export function Top10Rail({ title = "🔥 Top 10 in India Today", items = [], onSelectItem }) {
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

      <div className="mobile-top10-scroll" style={{
        position: 'relative',
        zIndex: 20,
        display: 'flex',
        gap: '12px',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        touchAction: 'pan-x pan-y',
        padding: '0 16px 10px 16px',
        scrollSnapType: 'x mandatory',
        scrollbarWidth: 'none'
      }}>
        {top10.map((item, index) => {
          const rank = index + 1;
          const poster = item.poster_url || item.poster || item.logo || '';
          const itemTitle = item.title_en || item.title || item.name || 'Untitled';
          const provider = getSourceProvider(item);

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
              {/* Massive Stylized Outlined Rank Number */}
              <div className="mobile-top10-rank-number" style={{
                fontSize: '94px',
                fontWeight: 900,
                lineHeight: '0.8',
                color: '#06090e',
                WebkitTextStroke: '3px #596579',
                marginRight: '-18px',
                zIndex: 1,
                fontFamily: 'Impact, sans-serif, system-ui',
                letterSpacing: '-6px'
              }}>
                {rank}
              </div>

              {/* Poster Box */}
              <div className="mobile-top10-poster-box" style={{
                position: 'relative',
                width: '125px',
                aspectRatio: '2 / 3',
                borderRadius: '8px',
                overflow: 'hidden',
                background: '#111827',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
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
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a' }}>
                    <Film size={28} color="#38bdf8" />
                  </div>
                )}

                {/* Recently Added / Top 10 Badge */}
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

                {/* Source Badge */}
                <div style={{
                  position: 'absolute',
                  bottom: '6px',
                  right: '6px',
                  width: '20px',
                  height: '20px',
                  borderRadius: '5px',
                  background: provider.color || '#3b82f6',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '10px'
                }}>
                  {provider.icon}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
