import React from 'react';

export function AppProvidersRow({ onSelectApp }) {
  const apps = [
    { id: 'netflix', name: 'Netflix', color: '#E50914', icon: '🔴' },
    { id: 'hbomax', name: 'HBO Max', color: '#5822b4', icon: '🟣' },
    { id: 'appletv', name: 'Apple TV+', color: '#1c1c1e', icon: '🍏' },
    { id: 'prime', name: 'Prime Video', color: '#00A8E1', icon: '🟡' },
    { id: 'documentaries', name: 'Documentaries', color: '#009688', icon: '🌍' },
    { id: 'anime', name: 'Anime Vault', color: '#F47521', icon: '⚔️' },
    { id: 'hotstar', name: 'JioHotstar', color: '#134074', icon: '⭐' },
    { id: 'discovery', name: 'Discovery+ / True Crime', color: '#00695c', icon: '🔍' },
    { id: 'sonyliv', name: 'SonyLIV', color: '#0044b5', icon: '📺' },
    { id: 'zee5', name: 'Zee5', color: '#8230c6', icon: '💎' },
    { id: 'jiocinema', name: 'JioCinema', color: '#d90429', icon: '🍿' },
  ];

  return (
    <div className="mobile-apps-row-container" style={{ position: 'relative', zIndex: 20, marginTop: '22px' }}>
      <div className="mobile-section-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>👑</span>
          <h2 style={{
            fontSize: '18px',
            fontWeight: 900,
            color: '#ffffff',
            letterSpacing: '-0.3px',
            margin: 0,
            textShadow: '0 2px 8px rgba(0, 0, 0, 0.8)'
          }}>
            Universal Hubs & Streaming Networks
          </h2>
        </div>
      </div>

      <div className="mobile-apps-scroll" style={{
        position: 'relative',
        zIndex: 20,
        display: 'flex',
        gap: '8px',
        overflowX: 'auto', WebkitOverflowScrolling: 'touch', touchAction: 'pan-x pan-y',
        padding: '0 16px 8px 16px',
        scrollbarWidth: 'none'
      }}>
        {apps.map((app) => (
          <button
            key={app.id}
            className="mobile-app-chip"
            onClick={() => onSelectApp(app.id)}
            style={{ 
              '--app-accent': app.color,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 15px',
              borderRadius: '20px',
              background: 'rgba(15, 23, 42, 0.85)',
              border: `1.5px solid ${app.color}70`,
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 800,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)'
            }}
          >
            <span className="mobile-app-chip-icon">{app.icon}</span>
            <span className="mobile-app-chip-name" style={{ color: '#ffffff', fontWeight: 800 }}>{app.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
