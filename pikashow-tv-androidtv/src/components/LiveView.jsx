import { useEffect, useMemo, useRef, useState } from 'react';
import { groupByCategory } from '../api/live';

/**
 * LiveView — MovieBoxTV-style live channel browser.
 *
 * v3.12.66 UX rework:
 *  - Channel tiles now use `.tv-card` + `.tv-card-live`, so the SAME focus
 *    halo/scale the rest of the app uses actually applies. The old markup
 *    used `.media-card`, a class with no focus styles — that is why live
 *    thumbnails never highlighted on Fire TV/Android TV.
 *  - Focused tiles scroll into view (centered vertically, nearest edge
 *    horizontally) — no more tiles focused offscreen.
 *  - Category rail collapses its own scrollbars; channel grid gets a real
 *    TV layout instead of a phone-sized auto-fill.
 *  - Enter is native (`<button>`), so play-on-select works everywhere.
 */

const CATEGORY_ICONS = {
  Sports: '🏆', News: '📰', Entertainment: '🎬', Movies: '🍿',
  Kids: '🧒', Music: '🎵', Devotional: '🙏', Infotainment: '🌍',
  Lifestyle: '✨', Education: '📚'
};

const ALL = 'All Channels';
const CATEGORY_ORDER = ['Sports', 'News', 'Entertainment', 'Movies', 'Kids', 'Music', 'Devotional', 'Infotainment', 'Lifestyle', 'Education'];

export function LiveView({ channels, onSelectItem, loading }) {
  const [activeCat, setActiveCat] = useState(ALL);
  const gridRef = useRef(null);
  const railRef = useRef(null);

  const groups = useMemo(() => groupByCategory(channels), [channels]);
  const cats = useMemo(() => {
    const present = Array.from(groups.keys());
    return [ALL, ...CATEGORY_ORDER.filter(c => present.includes(c)), ...present.filter(c => !CATEGORY_ORDER.includes(c))];
  }, [groups]);

  const visible = useMemo(() => (
    activeCat === ALL ? channels : (groups.get(activeCat) || [])
  ), [activeCat, channels, groups]);

  // Keep the focused live tile onscreen as D-pad moves through the grid.
  useEffect(() => {
    const root = gridRef.current;
    if (!root || typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(() => {
      const el = document.activeElement;
      if (root.contains(el)) {
        // v3.12.68: scrollIntoView({inline:'nearest'}) was a no-op for the
        // horizontally-overflowing grid ancestor; scroll the page scroller
        // directly so the focused row is always visible.
        const scroller = el.closest('.tv-main-content') || document.querySelector('.tv-main-content');
        if (scroller) {
          const er = el.getBoundingClientRect();
          const sr = scroller.getBoundingClientRect();
          if (er.bottom > sr.bottom - 24) {
            scroller.scrollTop += (er.bottom - sr.bottom + 24);
          } else if (er.top < sr.top + 24) {
            scroller.scrollTop -= (sr.top + 24 - er.top);
          }
        }
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      }
    });
    observer.observe(root, { subtree: true, attributes: true, attributeFilter: ['tabindex', 'class'] });
    return () => observer.disconnect();
  }, []);

  // A category switch replaces the grid: land focus on its first channel
  // unless the user is still navigating the category rail itself.
  useEffect(() => {
    const t = setTimeout(() => {
      if (railRef.current?.contains(document.activeElement)) return;
      const first = gridRef.current?.querySelector('.tv-card-live');
      if (first instanceof HTMLElement) first.focus();
    }, 60);
    return () => clearTimeout(t);
  }, [activeCat]);

  if (loading) {
    return (
      <div className="tv-empty-state" style={{ textAlign: 'center', marginTop: 100 }}>
        <div className="tv-spinner" />
        <p style={{ color: '#9aa3b2', fontSize: 20, marginTop: 16 }}>Loading live channels…</p>
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

  return (
    <div className="live-view-shell">
      {/* LEFT: category rail */}
      <nav className="live-cat-rail" ref={railRef} aria-label="Live TV categories">
        {cats.map((cat) => {
          const active = activeCat === cat;
          const count = cat === ALL ? channels.length : (groups.get(cat) || []).length;
          return (
            <button
              key={cat}
              type="button"
              tabIndex={0}
              className={`tv-cat-btn live-cat-btn${active ? ' active' : ''}`}
              aria-current={active ? 'true' : undefined}
              onClick={() => setActiveCat(cat)}
            >
              <span className="live-cat-name">
                <span>{CATEGORY_ICONS[cat] || '📺'}</span>
                {cat === ALL ? 'All Channels' : cat}
              </span>
              <span className="live-cat-count">{count}</span>
            </button>
          );
        })}
      </nav>

      {/* RIGHT: channel grid */}
      <section className="live-grid-scroll" ref={gridRef} aria-label={`${activeCat} channels`}>
        <header className="live-grid-header">
          <span className="live-dot" aria-hidden="true" />
          <h2 className="live-grid-title">
            {activeCat === ALL ? 'All Live Channels' : activeCat}
            <span className="live-grid-count">{visible.length}</span>
          </h2>
        </header>

        <div className="live-channel-grid" role="list">
          {visible.map((ch, idx) => (
            <button
              key={ch.id || `${ch.title}-${idx}`}
              type="button"
              tabIndex={0}
              role="listitem"
              className="tv-card tv-card-live live-channel-card"
              aria-label={`Play ${ch.title || ch.name}`}
              onClick={() => onSelectItem(ch)}
            >
              <div className="tv-card-media tv-card-live-media">
                {ch.logo ? (
                  <img
                    className="live-logo"
                    src={ch.logo}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                      // v3.12.73 (thumbnails fix): first failure — retry the same
                      // logo through the VPS image proxy (covers devices that
                      // can't reach the logo CDN, and hotlink-gated hosts).
                      // Second failure — clean fallback tile.
                      const img = e.currentTarget;
                      const orig = img.dataset.logoSrc || img.getAttribute('src') || '';
                      if (orig && !img.dataset.proxyTried && !orig.startsWith('https://new.ajo.co.in/channels/logo')) {
                        img.dataset.proxyTried = '1';
                        img.dataset.logoSrc = orig;
                        img.src = 'https://new.ajo.co.in/channels/logo?u=' + encodeURIComponent(orig);
                        return;
                      }
                      // v3.12.70: dead feed logo (e.g. sonypicturesnetworks 403) —
                      // swap to a clean fallback tile. No user data is written here;
                      // DOM nodes are created with fixed literal classes/text only.
                      const box = img.parentElement;
                      if (!box) return;
                      const fallback = document.createElement('div');
                      fallback.className = 'live-logo live-logo-fallback';
                      fallback.setAttribute('aria-hidden', 'true');
                      fallback.textContent = '📺';
                      const badge = document.createElement('span');
                      badge.className = 'tv-badge-live';
                      badge.textContent = 'LIVE';
                      box.replaceChildren(fallback, badge);
                    }}
                  />
                ) : (
                  <div className="live-logo live-logo-fallback" aria-hidden="true">📺</div>
                )}
                <span className="tv-badge-live">LIVE</span>
              </div>
              <div className="tv-card-info live-card-info">
                <span className="tv-card-title">{ch.title || ch.name}</span>
                <span className="live-card-meta">{ch.lang || ch.category || 'Live channel'}</span>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
