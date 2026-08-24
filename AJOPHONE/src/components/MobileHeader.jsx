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
            {/* Netflix Stylized Red "A" Logo */}
            <div style={{
              width: '28px',
              height: '32px',
              background: 'linear-gradient(135deg, #E50914 0%, #B81D24 100%)',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              fontSize: '18px',
              color: '#ffffff',
              fontFamily: 'Impact, sans-serif',
              boxShadow: '0 2px 10px rgba(229, 9, 20, 0.5)'
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
                color: '#ef4444',
                fontSize: '11px',
                fontWeight: 900,
                letterSpacing: '0.5px',
                background: 'rgba(239, 68, 68, 0.18)',
                padding: '2px 6px',
                borderRadius: '4px',
                border: '1px solid rgba(239, 68, 68, 0.35)'
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
                color: '#38bdf8',
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
              background: isSettings ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.08)',
              border: isSettings ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.12)',
              color: isSettings ? '#38bdf8' : '#ffffff',
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
          overflowX: 'auto',
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
              background: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '16px',
              color: '#38bdf8',
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
