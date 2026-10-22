import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { Home, Film, Tv, Radio, Search, Settings, Sparkles } from 'lucide-react';

export function GoogleTVHeader({ activeTab, onSelectTab, activeSubTab, onSelectSubTab }) {
  const [timeStr, setTimeStr] = useState('');
  const navRef = useRef(null);
  const indicatorRef = useRef(null);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  // v3.12.83 (StreamFlix structure): clean content-type nav. Sports folds into
  // Live TV; Search stays a top-level tab (magnifier on the right). 6 items,
  // no clutter — matches the StreamFlix reference the user pointed at.
  const tabs = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'live', label: 'Live TV', icon: Radio },
    { id: 'movies', label: 'Movies', icon: Film },
    { id: 'series', label: 'Series', icon: Tv },
    // v3.14.0: dedicated Anime tab (bingr.one catalog) — matches the bingr
    // UX the user asked to replicate.
    { id: 'anime', label: 'Anime', icon: Sparkles },
    { id: 'search', label: 'Search', icon: Search },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  // v3.12.83: Home is one curated feed now — no cluttered sub-tab bar. The
  // Movies/Series content lives on its own top-level tab with genre + sort.
  const subTabs = [];

  // v3.12.79 ColorOS sliding indicator — glides to the active pill without
  // a hard cut. transform/width only (GPU), no layout thrash on the Lumio.
  useLayoutEffect(() => {
    const nav = navRef.current;
    const ind = indicatorRef.current;
    if (!nav || !ind) return;
    const active = nav.querySelector('.tv-nav-pill.active');
    if (active) {
      const navRect = nav.getBoundingClientRect();
      const r = active.getBoundingClientRect();
      ind.style.width = r.width + 'px';
      ind.style.transform = 'translateX(' + (r.left - navRect.left) + 'px)';
      ind.classList.add('visible');
    } else {
      ind.classList.remove('visible');
    }
  }, [activeTab]);

  return (
    <>
      <header className="tv-header">
        <div className="tv-logo-section">
          {/* v3.12.81: focusable so D-pad can land on it deliberately from the
              first pill; sits in the header zone (fast-path in spatial nav). */}
          <button className="tv-logo-badge" tabIndex={0} aria-label="AJO TV home">AJO TV</button>
          <div className="tv-logo-title">Cinema & Live</div>
        </div>

        <nav className="tv-nav-pills" ref={navRef}>
          <div className="tv-nav-indicator" ref={indicatorRef} aria-hidden="true" />
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                tabIndex={0}
                className={`tv-nav-pill ${isActive ? 'active' : ''}`}
                onClick={() => onSelectTab(tab.id)}
              >
                <Icon size={15} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="tv-header-info">
          <span>{timeStr}</span>
        </div>
      </header>

      {/* Sub-tab bar — only rendered when there ARE sub-tabs (v3.12.83: Home
          is a single curated feed now, so this is empty and renders nothing). */}
      {activeTab === 'home' && onSelectSubTab && subTabs.length > 0 && (
        <div style={{ padding: '0 40px' }}>
          <div className="tv-subtab-bar">
            {subTabs.map(sub => (
              <button
                key={sub.id}
                tabIndex={0}
                className={`tv-subtab ${activeSubTab === sub.id ? 'active' : ''}`}
                onClick={() => onSelectSubTab(sub.id)}
              >
                {sub.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
