import React from 'react';
import { 
  Home, 
  Tv, 
  Film, 
  Video, 
  Search, 
  Radio, 
  Settings,
  Sparkles,
  Trophy,
  CalendarDays,
  Clapperboard,
  Flame
} from 'lucide-react';

export function NavigationSidebar({ activeTab, onTabChange, isSearching, onToggleSearch }) {
  const navItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'short_tv', label: 'ShortTV', icon: Flame, badge: 'HOT' },
    { id: 'epg', label: 'TV Guide (EPG)', icon: CalendarDays, badge: 'GUIDE' },
    { id: 'sports', label: 'Sports (Cricfy)', icon: Trophy, badge: 'LIVE' },
    { id: 'live', label: 'Live TV (Jio)', icon: Radio, badge: '700+' },
    { id: 'marathi', label: 'Marathi (मराठी)', icon: Clapperboard, badge: 'NEW' },
    { id: 'bollywood', label: 'Bollywood', icon: Film },
    { id: 'hollywood', label: 'Hollywood', icon: Video },
    { id: 'serials', label: 'Series', icon: Tv },
  ];

  return (
    <aside className="tv-sidebar">
      {/* Sleek Stationary AJO Brand Header */}
      <div className="sidebar-logo">
        <div className="logo-badge">
          <span style={{ fontSize: '20px', fontWeight: 900, letterSpacing: '-0.5px', color: '#fff' }}>A</span>
        </div>
        <div className="logo-text-box">
          <span className="logo-title">AJO</span>
          <span className="logo-tag">TV</span>
        </div>
      </div>

      {/* Primary Navigation Menu */}
      <nav className="nav-menu">
        {/* Global Search Button */}
        <button
          className={`nav-item ${isSearching ? 'is-active is-focused' : ''}`}
          data-focusable="true"
          tabIndex={0}
          onClick={() => onToggleSearch(!isSearching)}
        >
          <Search size={20} className="nav-item-icon" />
          <span className="nav-item-label">Search</span>
        </button>

        <div className="nav-divider" />

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = !isSearching && activeTab === item.id;
          return (
            <button
              key={item.id}
              className={`nav-item ${isActive ? 'is-active is-focused' : ''}`}
              data-focusable="true"
              tabIndex={0}
              onClick={() => {
                if (isSearching) onToggleSearch(false);
                onTabChange(item.id);
              }}
            >
              <Icon size={20} className="nav-item-icon" />
              <span className="nav-item-label">{item.label}</span>
              {item.badge && (
                <span className="nav-badge">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Settings Tab Button */}
      <div style={{ marginTop: 'auto', width: '100%' }}>
        <button
          className={`nav-item ${activeTab === 'settings' ? 'is-active is-focused' : ''}`}
          data-focusable="true"
          tabIndex={0}
          onClick={() => {
            if (isSearching) onToggleSearch(false);
            onTabChange('settings');
          }}
        >
          <Settings size={20} className="nav-item-icon" />
          <span className="nav-item-label">Settings</span>
        </button>
      </div>
    </aside>
  );
}
