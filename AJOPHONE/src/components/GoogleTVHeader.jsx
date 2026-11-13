import React, { useState, useEffect } from 'react';
import { Home, Film, Tv, Radio, Search, Settings } from 'lucide-react';

export function GoogleTVHeader({ activeTab, onSelectTab }) {
  const [timeStr, setTimeStr] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  // v3.17.53: six permanent destinations only. MovieBox remains a source for
  // Movies/Series, while Anime and Torrents can still surface inside content.
  // They no longer consume top-level remote navigation slots.
  const tabs = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'live', label: 'Live TV', icon: Radio },
    { id: 'movies', label: 'Movies', icon: Film },
    { id: 'series', label: 'Series', icon: Tv },
    { id: 'search', label: 'Search', icon: Search },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <header className="tv-header" aria-label="AJO TV main navigation">
      <div className="tv-logo-section">
        <button
          className="tv-logo-badge"
          tabIndex={0}
          aria-label="Open AJO TV Home"
          onClick={() => onSelectTab('home')}
        >
          AJO
        </button>
        <div className="tv-logo-title" aria-hidden="true">
          <strong>AJO TV</strong>
          <span>Cinema & Live</span>
        </div>
      </div>

      <nav className="tv-nav-pills" aria-label="Browse">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              tabIndex={0}
              className={`tv-nav-pill ${isActive ? 'active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onSelectTab(tab.id)}
            >
              <Icon size={20} strokeWidth={2.2} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="tv-header-info" aria-hidden="true">
        <span className="tv-nav-clock">{timeStr}</span>
        <span className="tv-nav-hint">Left opens menu · Right returns</span>
      </div>
    </header>
  );
}
