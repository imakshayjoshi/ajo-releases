import React from 'react';
import { Search, Settings, Flame } from 'lucide-react';

export function GoogleTVHeader({ activeTab, onTabChange }) {
  const tabs = [
    { id: 'search', label: 'Search', icon: Search },
    { id: 'home', label: 'For You' },
    { id: 'short_tv', label: 'ShortTV', icon: Flame, badge: 'HOT' },
    { id: 'epg', label: 'Live TV & Guide' },
    { id: 'movies', label: 'Movies' },
    { id: 'shows', label: 'Shows' },
  ];

  return (
    <header className="gtv-top-header">
      {/* Brand Logo on Top-Left */}
      <div 
        className="gtv-brand-container" 
        onClick={() => onTabChange('home')}
        style={{ cursor: 'pointer' }}
      >
        <div className="gtv-brand-icon">
          <span style={{ fontSize: '18px', fontWeight: 900, color: '#fff' }}>A</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
          <span className="gtv-brand-title">AJO</span>
          <span className="gtv-brand-sub">TV</span>
        </div>
      </div>

      {/* Navigation Pills (Google TV Standard) */}
      <nav className="gtv-nav-bar">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              className={`gtv-nav-pill ${isActive ? 'gtv-pill-active is-focused' : ''}`}
              data-focusable="true"
              tabIndex={0}
              onClick={() => onTabChange(tab.id)}
              style={{ position: 'relative' }}
            >
              {Icon && <Icon size={16} color={tab.id === 'short_tv' ? '#f59e0b' : undefined} />}
              <span>{tab.label}</span>
              {tab.badge && (
                <span style={{
                  background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                  color: '#fff',
                  fontSize: '9px',
                  fontWeight: 900,
                  padding: '1px 5px',
                  borderRadius: '4px',
                  marginLeft: '2px'
                }}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Settings / Profile on Top-Right */}
      <div className="gtv-header-right">
        <button
          className={`gtv-profile-btn ${activeTab === 'settings' ? 'gtv-pill-active is-focused' : ''}`}
          data-focusable="true"
          tabIndex={0}
          onClick={() => onTabChange('settings')}
          title="Settings & Software Updates"
        >
          <Settings size={18} />
        </button>
      </div>
    </header>
  );
}
