import { useEffect, useMemo, useRef, useState } from 'react';
import { groupByCategory, liveLogoProxyUrl } from '../api/live';

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

// v3.12.76 (thumbnails fix): URLs that already failed this session go straight
// to the fallback tile — previously ch.logo stayed truthy after onError, so any
// remount (chunked render window, category switch, scrolling) put the broken
// image back and the tile flickered logo→fallback forever.
const deadLogoUrls = new Set();

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

  // v3.12.74 (Lumio 55" crash hardening): never mount a 1,000+ card DOM at
  // once on low-RAM Android TV WebViews. React still sees the full catalog;
  // only the rendered window is capped, and D-pad scrolling loads the next
  // chunk before the focused tile reaches the bottom.
  const [visibleCount, setVisibleCount] = useState(120);
  useEffect(() => setVisibleCount(120), [activeCat, channels]);
  useEffect(() => {
    const root = gridRef.current;
    if (!root) return;
    const onScroll = () => {
      const nearBottom = root.scrollHeight - root.scrollTop - root.clientHeight < 600;
      if (nearBottom) setVisibleCount((n) => Math.min(n + 120, visible.length));
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => root.removeEventListener('scroll', onScroll);
  }, [visible.length]);
  const rendered = useMemo(() => visible.slice(0, visibleCount), [visible, visibleCount]);

  // Render in steady 120-card chunks: memory stays capped while the wall
  // continues filling automatically instead of hanging on one giant commit.
  useEffect(() => {
    if (visibleCount >= visible.length) return;
    const t = setTimeout(() => setVisibleCount((n) => Math.min(n + 120, visible.length)), 180);
    return () => clearTimeout(t);
  }, [visible.length, visibleCount]);

  // Keep the focused live tile onscreen as D-pad moves through the grid,
  // and extend the rendered window BEFORE the focus runs past its bottom.
  useEffect(() => {
    const root = gridRef.current;
    if (!root || typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(() => {
      const el = document.activeElement;
      if (root.contains(el)) {
        const rect = el.getBoundingClientRect();
        if (rect.bottom > root.getBoundingClientRect().bottom - 700) {
          setVisibleCount((n) => Math.min(n + 120, visible.length));
        }
        // v3.12.82 (live-catalog focus-jump fix): the previous build called
        // el.scrollIntoView({block:'center'}) on EVERY focus change. On a TV
        // the browser's native scrollIntoView fights the app's own scroller
        // and yanks the focused card to mid-screen each press — that's the
        // "focus jumps around the live channel catalog" Akkshay reported.
        // Now we nudge the page scroller just enough to keep the card inside
        // the viewport (nearest-edge), never re-centering. The spatial nav
        // engine's own focusAndScroll does the same, so this stays in lockstep.
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
        // NO scrollIntoView here — that was the jump source.
      }
    });
    observer.observe(root, { subtree: true, attributes: true, attributeFilter: ['tabindex', 'class'] });
    return () => observer.disconnect();
  }, [visible.length]);

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
          {rendered.map((ch, idx) => {
            const logoDead = ch.logo && deadLogoUrls.has(ch.logo);
            return (
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
                {ch.logo && !logoDead ? (
                  <img
                    className="live-logo"
                    src={ch.logo}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                      // v3.12.84: rescue before fallback. The TV routes some
                      // logo CDNs badly, so a direct-URL failure retries ONCE
                      // through the VPS image proxy (cloudfront/jio/amagi only
                      // — it can't serve raw.githubusercontent/hotstar). Only
                      // when the proxy also fails do we swap to initials.
                      const img = e.currentTarget;
                      const cur = img.getAttribute('src') || '';
                      const proxyUrl = liveLogoProxyUrl(cur);
                      if (proxyUrl && cur !== proxyUrl) {
                        img.src = proxyUrl;
                        return;
                      }
                      deadLogoUrls.add(cur);
                      const box = img.parentElement;
                      if (!box) return;
                      const fallback = document.createElement('div');
                      fallback.className = 'live-logo live-logo-fallback';
                      fallback.setAttribute('aria-hidden', 'true');
                      fallback.textContent = String(ch.title || ch.name || '📺').replace(/[^A-Za-z0-9 ]/g, '').trim().slice(0, 2).toUpperCase() || '📺';
                      const badge = document.createElement('span');
                      badge.className = 'tv-badge-live';
                      badge.textContent = 'LIVE';
                      box.replaceChildren(fallback, badge);
                    }}
                  />
                ) : (
                  <div className="live-logo live-logo-fallback" aria-hidden="true">{String(ch.title || ch.name || '📺').replace(/[^A-Za-z0-9 ]/g, '').trim().slice(0, 2).toUpperCase() || '📺'}</div>
                )}
                <span className="tv-badge-live">LIVE</span>
              </div>
              <div className="tv-card-info live-card-info">
                <span className="tv-card-title">{ch.title || ch.name}</span>
                <span className="live-card-meta">{ch.lang || ch.category || 'Live channel'}</span>
                {visible.length > visibleCount && idx === rendered.length - 1 && (
                  <span className="live-more-count">{visible.length - visibleCount} more below</span>
                )}
              </div>
            </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
