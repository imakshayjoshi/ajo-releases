import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { Home, Film, Tv, Radio, Trophy, Search, Settings, Zap, Music } from 'lucide-react';

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

  const tabs = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'sports', label: 'Sports', icon: Trophy },
    { id: 'movies', label: 'Movies', icon: Film },
    { id: 'series', label: 'Series', icon: Tv },
    { id: 'live', label: 'Live TV', icon: Radio },
    { id: 'search', label: 'Search', icon: Search },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const subTabs = [
    { id: 'trending', label: '🔥 Trending' },
    { id: 'movies', label: '🎬 Movies' },
    { id: 'series', label: '📺 Series' },
    { id: 'anime', label: '⛩️ Anime' },
    { id: 'kids', label: '🧸 Kids' },
    { id: 'music', label: '🎵 Music' },
    { id: 'providers', label: '📡 Providers' },
  ];

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
          <div className="tv-logo-badge">AJO TV</div>
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

      {/* Sub-tab bar — only on Home tab */}
      {activeTab === 'home' && onSelectSubTab && (
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
