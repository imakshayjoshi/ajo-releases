import { useEffect, useMemo, useRef, useState } from 'react';
import { getLiveChannels, groupByCategory } from '../api/live';

/**
 * LiveView — MovieBoxTV-style live channel browser (v3.12.64).
 *
 * Reverse-engineered UX from MovieBoxTV Premium:
 *  - LEFT rail: country/category selector (vertical, D-pad friendly)
 *  - RIGHT: channel grid with logos, "LIVE" badge, current category name
 *  - Channels grouped like MovieBox's live tab (Sports/News/Entertainment...)
 *
 * Data: Elite Streams' feeds merged + health-checked on the VPS
 * (https://new.ajo.co.in/live/channels.json), so only playable channels
 * reach the stick.
 */

const CATEGORY_ICONS = {
  Sports: '🏆', News: '📰', Entertainment: '🎬', Movies: '🍿',
  Kids: '🧒', Music: '🎵', Devotional: '🙏', Infotainment: '🌍',
  Lifestyle: '✨', Education: '📚'
};

const ALL = 'All Channels';

export function LiveView({ channels, onSelectItem, loading }) {
  const [activeCat, setActiveCat] = useState(ALL);
  const gridRef = useRef(null);

  const groups = useMemo(() => groupByCategory(channels), [channels]);
  const cats = useMemo(() => {
    const order = ['Sports', 'News', 'Entertainment', 'Movies', 'Kids', 'Music', 'Devotional', 'Infotainment', 'Lifestyle', 'Education'];
    const present = Array.from(groups.keys());
    return [ALL, ...order.filter(c => present.includes(c)), ...present.filter(c => !order.includes(c))];
  }, [groups]);

  const visible = activeCat === ALL ? channels : (groups.get(activeCat) || []);

  // When category switches, move focus into the grid so D-pad works immediately.
  useEffect(() => {
    const t = setTimeout(() => {
      const first = gridRef.current?.querySelector('[tabindex="0"], button, [role="button"]');
      if (first && document.activeElement?.closest?.('.live-cat-rail') === null) {
        // only steal focus if focus is still on the category rail
      }
    }, 50);
    return () => clearTimeout(t);
  }, [activeCat]);

  if (loading) {
    return (
      <div className="tv-empty-state" style={{ textAlign: 'center', marginTop: 100 }}>
        <p style={{ color: '#9aa3b2', fontSize: 20 }}>Loading live channels…</p>
      </div>
    );
  }

  if (!channels.length) {
    return (
      <div className="tv-empty-state" style={{ textAlign: 'center', marginTop: 80 }}>
        <p style={{ color: '#9aa3b2', fontSize: 19, marginBottom: 20 }}>
          Couldn't load channels right now. Check your internet and try again.
        </p>
      </div>
    );
  }

  const railStyle = {
    width: 220, flexShrink: 0, padding: '14px 10px',
    borderRight: '1px solid rgba(255,255,255,0.08)',
    display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 'calc(100vh - 150px)',
    overflowY: 'auto'
  };

  const catBtn = (cat, count) => {
    const active = activeCat === cat;
    return (
      <button
        key={cat}
        tabIndex={0}
        className="tv-cat-btn"
        onClick={() => setActiveCat(cat)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', padding: '11px 16px', fontSize: '1rem', fontWeight: 700,
          borderRadius: 10, textAlign: 'left',
          border: active ? '2px solid #00BB7F' : '1px solid transparent',
          background: active ? 'linear-gradient(135deg, rgba(0,187,127,0.25), rgba(2,132,199,0.18))' : 'transparent',
          color: active ? '#ffffff' : '#b6c0cf', cursor: 'pointer'
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '1.1rem' }}>{CATEGORY_ICONS[cat] || '📺'}</span>
          {cat === ALL ? '📺 All' : cat}
        </span>
        <span style={{ fontSize: '0.75rem', color: active ? '#00BB7F' : '#71809a', fontWeight: 800 }}>{count}</span>
      </button>
    );
  };

  return (
    <div style={{ display: 'flex', gap: 0, minHeight: 'calc(100vh - 130px)' }}>
      {/* LEFT: category rail (MovieBox style) */}
      <div className="live-cat-rail" style={railStyle}>
        {cats.map(cat => catBtn(cat, cat === ALL ? channels.length : (groups.get(cat) || []).length))}
      </div>

      {/* RIGHT: channel grid */}
      <div style={{ flex: 1, minWidth: 0, padding: '10px 26px 26px 26px', overflowY: 'auto' }} ref={gridRef}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '6px 0 16px 0' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff3b30', boxShadow: '0 0 10px #ff3b30' }} />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#fff' }}>
            {activeCat === ALL ? 'All Live Channels' : activeCat}
            <span style={{ color: '#71809a', fontWeight: 600, marginLeft: 10, fontSize: '0.95rem' }}>{visible.length}</span>
          </h2>
        </div>

        <div className="tv-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: 14
        }}>
          {visible.map((ch, idx) => (
            <button
              key={ch.id || idx}
              tabIndex={0}
              className="media-card"
              onClick={() => onSelectItem(ch)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 8, padding: '14px 8px', minHeight: 120,
                background: 'linear-gradient(160deg, rgba(22,32,48,0.92), rgba(12,18,30,0.96))',
                borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
                position: 'relative'
              }}
            >
              {ch.logo ? (
                <img src={ch.logo} alt="" style={{ width: 64, height: 64, objectFit: 'contain', borderRadius: 8,
                  background: 'rgba(255,255,255,0.06)', padding: 4 }} loading="lazy" />
              ) : (
                <div style={{ width: 64, height: 64, borderRadius: 8, background: 'rgba(0,187,127,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>📺</div>
              )}
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#e8edf5', textAlign: 'center',
                lineHeight: 1.25, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {ch.title || ch.name}
              </span>
              <span style={{
                position: 'absolute', top: 8, right: 8, padding: '2px 7px', borderRadius: 4,
                background: '#e50914', color: '#fff', fontSize: '0.62rem', fontWeight: 900, letterSpacing: 0.5
              }}>LIVE</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
