import React from 'react';
import { Home, Film, Tv, Radio, Search, Cast, Download } from 'lucide-react';

export function MobileBottomNav({ activeTab, onTabChange }) {
  const tabs = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'movies', label: 'Movies', icon: Film },
    { id: 'shows', label: 'Shows', icon: Tv },
    { id: 'downloads', label: 'Downloads', icon: Download },
    { id: 'epg', label: 'Live TV', icon: Radio },
    { id: 'remote', label: 'TV Cast', icon: Cast },
    { id: 'search', label: 'Search', icon: Search },
  ];

  return (
    <nav className="mobile-bottom-nav" style={{ zIndex: 100 }}>
      <div className="mobile-bottom-nav-inner" style={{ gap: '2px' }}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              className={`mobile-nav-item ${isActive ? 'mobile-nav-active' : ''}`}
              onClick={() => onTabChange(tab.id)}
              style={{ position: 'relative' }}
            >
              <div className="mobile-nav-icon-box">
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} color={tab.id === 'short_tv' ? '#f59e0b' : undefined} />
                {isActive && <div className="mobile-nav-glow-dot" />}
                {tab.badge && (
                  <span style={{
                    position: 'absolute',
                    top: '-3px',
                    right: '-4px',
                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    color: '#fff',
                    fontSize: '8px',
                    fontWeight: 900,
                    padding: '1px 3px',
                    borderRadius: '4px',
                    lineHeight: 1
                  }}>
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="mobile-nav-label" style={{
                color: isActive ? '#38bdf8' : '#94a3b8',
                fontWeight: isActive ? 800 : 600,
                fontSize: '10px'
              }}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
