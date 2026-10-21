import React from 'react';
import { Settings, Search, ArrowLeft, Tv, Film, Radio, Sparkles } from 'lucide-react';

export function MobileHeader({ activeTab, onTabChange }) {
  const isHome = activeTab === 'home';
  const isSettings = activeTab === 'settings';

  return (
    <header className="mobile-top-header" style={{
      position: 'sticky',
      top: 0,
      zIndex: 100,
      background: 'linear-gradient(180deg, rgba(6, 9, 14, 0.98) 0%, rgba(6, 9, 14, 0.92) 85%, transparent 100%)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      paddingTop: 'env(safe-area-inset-top, 8px)',
      borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
    }}>
      {/* Main Top Row */}
      <div className="mobile-header-inner" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        height: '52px'
      }}>
        {/* Left: Brand or Back */}
        {isSettings ? (
          <button 
            className="mobile-header-btn" 
            onClick={() => onTabChange('home')}
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'none',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              padding: 0
            }}
          >
            <ArrowLeft size={20} />
            <span style={{ fontSize: '15px', fontWeight: 800, marginLeft: '6px' }}>Settings</span>
          </button>
        ) : (
          <div 
            className="mobile-brand-container" 
            onClick={() => onTabChange('home')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
          >
            {/* Brand mark — app green identity (v3.9.10: was Netflix red) */}
            <div style={{
              width: '28px',
              height: '32px',
              background: 'linear-gradient(135deg, #00BB7F 0%, #00875F 100%)',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              fontSize: '18px',
              color: '#0f1014',
              letterSpacing: '-0.5px'
            }}>
              A
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                fontSize: '20px',
                fontWeight: 900,
                color: '#ffffff',
                letterSpacing: '-0.5px'
              }}>
                AJO
              </span>
              <span style={{
                color: '#00BB7F',
                fontSize: '11px',
                fontWeight: 900,
                letterSpacing: '0.5px',
                background: 'rgba(0, 187, 127, 0.14)',
                padding: '2px 6px',
                borderRadius: '4px',
                border: '1px solid rgba(0, 187, 127, 0.35)'
              }}>
                PHONE
              </span>
            </div>
          </div>
        )}

        {/* Right Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {activeTab !== 'remote' && (
            <button
              onClick={() => onTabChange('remote')}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#00BB7F',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
              title="Cast to TV / Firestick"
            >
              <Tv size={17} />
            </button>
          )}

          {activeTab !== 'search' && !isSettings && (
            <button
              onClick={() => onTabChange('search')}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
              title="Search"
            >
              <Search size={17} />
            </button>
          )}

          <button
            onClick={() => onTabChange(isSettings ? 'home' : 'settings')}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: isSettings ? 'rgba(0, 187, 127, 0.2)' : 'rgba(255, 255, 255, 0.08)',
              border: isSettings ? '1px solid #00BB7F' : '1px solid rgba(255, 255, 255, 0.12)',
              color: isSettings ? '#00BB7F' : '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
            title="Settings"
          >
            <Settings size={17} />
          </button>
        </div>
      </div>

      {/* Netflix Sub-Nav Category Tabs */}
      {isHome && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: '8px',
          padding: '6px 16px 10px 16px',
          overflowX: 'auto', WebkitOverflowScrolling: 'touch', touchAction: 'pan-x pan-y',
          scrollbarWidth: 'none'
        }}>
          <button 
            onClick={() => onTabChange('shows')}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '16px',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              padding: '6px 14px',
              whiteSpace: 'nowrap'
            }}
          >
            TV Shows
          </button>

          <button 
            onClick={() => onTabChange('movies')}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '16px',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              padding: '6px 14px',
              whiteSpace: 'nowrap'
            }}
          >
            Movies
          </button>

          <button 
            onClick={() => onTabChange('epg')}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '16px',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              padding: '6px 14px',
              whiteSpace: 'nowrap'
            }}
          >
            Live TV
          </button>

          <button 
            onClick={() => onTabChange('shows')}
            style={{
              background: 'rgba(0, 187, 127, 0.12)',
              border: '1px solid rgba(0, 187, 127, 0.3)',
              borderRadius: '16px',
              color: '#00BB7F',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              padding: '6px 14px',
              whiteSpace: 'nowrap'
            }}
          >
            Documentaries & Anime
          </button>
        </div>
      )}
    </header>
  );
}
