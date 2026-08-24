import React, { useState, useEffect } from 'react';
import { Home, Film, Tv, Radio, Trophy, Search, Settings } from 'lucide-react';

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

  const tabs = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'sports', label: 'Sports', icon: Trophy },
    { id: 'movies', label: 'Movies', icon: Film },
    { id: 'series', label: 'Web Series', icon: Tv },
    { id: 'live', label: 'Live TV', icon: Radio },
    { id: 'search', label: 'Search', icon: Search },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <header className="tv-header">
      <div className="tv-logo-section">
        <div className="tv-logo-badge">AJO TV</div>
        <div className="tv-logo-title">Cinema & Live</div>
      </div>

      <nav className="tv-nav-pills">
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
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="tv-header-info">
        <span>{timeStr}</span>
      </div>
    </header>
  );
}
