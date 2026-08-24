import React, { useState, useEffect, useMemo } from 'react';
import { 
  Radio, 
  Star, 
  Search, 
  X, 
  Play
} from 'lucide-react';
import { getCurrentAndNextProgram } from '../api/epg';
import { getIPTVChannels } from '../api/iptv';
import { toggleFavoriteChannel, isFavoriteChannel } from '../api/history';

export function EPGGuideView({ channels = [], onSelectChannel, onFocusItem }) {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchFilter, setSearchFilter] = useState('');
  const [channelData, setChannelData] = useState([]);
  const [favRefreshCount, setFavRefreshCount] = useState(0);

  const categories = [
    '⭐ Favorites',
    'All', 
    'Sports', 
    'Entertainment',
    'Movies', 
    'News', 
    'Kids', 
    'Music', 
    'Documentary', 
    'Regional'
  ];

  useEffect(() => {
    getIPTVChannels().then(chs => {
      const sourceList = chs && chs.length > 0 ? chs : (channels || []);
      const processed = sourceList.map((ch, idx) => {
        const epg = getCurrentAndNextProgram(ch);
        return {
          ...ch,
          channelNumber: 100 + idx + 1,
          epg: epg,
          is_fav: isFavoriteChannel(ch)
        };
      });
      setChannelData(processed);
    });
  }, [channels, favRefreshCount]);

  const handleToggleFav = (e, ch) => {
    e.stopPropagation();
    toggleFavoriteChannel(ch);
    setFavRefreshCount(prev => prev + 1);
  };

  const filteredChannels = useMemo(() => {
    return channelData.filter(ch => {
      const q = searchFilter.toLowerCase().trim();
      const matchesSearch = !q || 
        ch.title.toLowerCase().includes(q) || 
        (ch.category || '').toLowerCase().includes(q);
      if (!matchesSearch) return false;

      if (selectedCategory === '⭐ Favorites') {
        return isFavoriteChannel(ch);
      }

      if (selectedCategory === 'All') return true;
      const cat = (ch.category || '').toLowerCase();
      const title = (ch.title || '').toLowerCase();
      const target = selectedCategory.toLowerCase();

      if (target === 'sports') return cat.includes('sport') || title.includes('sport') || title.includes('cricket') || title.includes('willow') || title.includes('ten') || title.includes('fancode');
      if (target === 'news') return cat.includes('news') || title.includes('news') || title.includes('tak') || title.includes('abp') || title.includes('republic') || title.includes('cnn');
      if (target === 'documentary') return cat.includes('docu') || title.includes('docu') || title.includes('discovery') || title.includes('nat geo') || title.includes('docubay');
      if (target === 'movies') return cat.includes('movie') || title.includes('cinema') || title.includes('max') || title.includes('film') || title.includes('goldmines');
      if (target === 'music') return cat.includes('music') || title.includes('music') || title.includes('9x') || title.includes('mtv') || title.includes('zing');
      if (target === 'kids') return cat.includes('kid') || cat.includes('anim') || title.includes('cartoon') || title.includes('disney') || title.includes('nick');
      if (target === 'regional') return cat.includes('regional') || title.includes('pravah') || title.includes('marathi') || title.includes('maa') || title.includes('sun');
      if (target === 'entertainment') return cat.includes('entertainment') || title.includes('star') || title.includes('sony') || title.includes('zee') || title.includes('colors');
      return true;
    });
  }, [channelData, selectedCategory, searchFilter, favRefreshCount]);

  return (
    <div className="mobile-epg-container" style={{ position: 'relative', zIndex: 20, padding: '16px 24px 80px 24px', width: '100%', boxSizing: 'border-box' }}>
      {/* Top Header Banner */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(239, 68, 68, 0.5)'
          }}>
            <Radio size={20} color="#ffffff" />
          </div>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 900, color: '#ffffff', margin: 0, letterSpacing: '-0.3px' }}>
              Live Satellite TV & EPG Guide
            </h2>
            <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>
              {filteredChannels.length} Live Channels Available
            </span>
          </div>
        </div>

        {/* Search Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(15, 23, 42, 0.8)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '20px',
          padding: '8px 16px',
          width: '260px'
        }}>
          <Search size={16} color="#38bdf8" />
          <input
            type="text"
            className="search-bar-input tv-focusable-card"
            data-focusable="true"
            tabIndex={0}
            placeholder="Search channels..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 700,
              outline: 'none'
            }}
          />
          {searchFilter && (
            <button 
              onClick={() => setSearchFilter('')}
              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Category Pills Bar */}
      <div style={{
        position: 'relative',
        zIndex: 25,
        display: 'flex',
        gap: '10px',
        overflowX: 'auto',
        paddingBottom: '12px',
        marginBottom: '16px',
        scrollbarWidth: 'none'
      }}>
        {categories.map(cat => {
          const isSelected = selectedCategory === cat;
          return (
            <button
              key={cat}
              className="tv-focusable-card"
              data-focusable="true"
              tabIndex={0}
              onClick={() => setSelectedCategory(cat)}
              style={{
                padding: '9px 18px',
                borderRadius: '20px',
                fontSize: '13px',
                fontWeight: 800,
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                border: isSelected ? '2px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.18)',
                background: isSelected ? 'linear-gradient(135deg, #38bdf8 0%, #3b82f6 100%)' : 'rgba(15, 23, 42, 0.85)',
                color: isSelected ? '#06090e' : '#ffffff',
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              <span>{cat}</span>
            </button>
          );
        })}
      </div>

      {/* Vertical Channels List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
        {filteredChannels.length === 0 ? (
          <div style={{ padding: '50px 20px', textAlign: 'center', color: '#94a3b8' }}>
            <Radio size={44} color="#64748b" style={{ margin: '0 auto 12px auto' }} />
            <p style={{ fontWeight: 700, fontSize: '15px' }}>
              {selectedCategory === '⭐ Favorites' 
                ? 'No favorite channels pinned yet. Click the ⭐ star on any channel to pin it!' 
                : 'No live channels found matching your filter.'}
            </p>
          </div>
        ) : (
          filteredChannels.map((ch, idx) => {
            const isFav = isFavoriteChannel(ch);
            const currentProg = ch.epg?.current;
            const logo = ch.logo || ch.poster_url || ch.poster;

            return (
              <div
                key={ch.id || ch.url || idx}
                className="channel-guide-row tv-card tv-focusable-card"
                data-focusable="true"
                tabIndex={0}
                onClick={() => onSelectChannel && onSelectChannel(ch)}
                onFocus={() => onFocusItem && onFocusItem(ch)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  padding: '14px 18px',
                  borderRadius: '16px',
                  background: 'rgba(17, 24, 39, 0.9)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  cursor: 'pointer',
                  width: '100%',
                  boxSizing: 'border-box'
                }}
              >
                {/* Channel Logo & Number */}
                <div style={{
                  position: 'relative',
                  width: '56px',
                  height: '56px',
                  borderRadius: '12px',
                  background: '#0a0e17',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  overflow: 'hidden',
                  border: '1px solid rgba(255,255,255,0.15)'
                }}>
                  {logo ? (
                    <img 
                      src={logo} 
                      alt={ch.title} 
                      style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '4px' }}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <Radio size={26} color="#38bdf8" />
                  )}
                  <span style={{
                    position: 'absolute',
                    bottom: '2px',
                    right: '2px',
                    fontSize: '9px',
                    fontWeight: 900,
                    background: 'rgba(0,0,0,0.85)',
                    color: '#38bdf8',
                    padding: '1px 4px',
                    borderRadius: '3px'
                  }}>
                    #{ch.channelNumber}
                  </span>
                </div>

                {/* Channel Title & Program Details */}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <span style={{
                      fontSize: '16px',
                      fontWeight: 800,
                      color: '#ffffff',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {ch.title}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#38bdf8', fontWeight: 700 }}>
                    <span>{ch.category || 'Live TV'}</span>
                    <span>•</span>
                    <span style={{ color: '#4ade80' }}>24/7 LIVE HD</span>
                  </div>

                  <span style={{
                    fontSize: '12px',
                    color: '#94a3b8',
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {currentProg?.title || 'Live Satellite Broadcast Stream'}
                  </span>
                </div>

                {/* Direct Play Pill + Favorite Star */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                  <button
                    onClick={(e) => handleToggleFav(e, ch)}
                    style={{
                      background: isFav ? 'rgba(234, 179, 8, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                      border: isFav ? '1px solid #eab308' : '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '50%',
                      width: '36px',
                      height: '36px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isFav ? '#eab308' : '#94a3b8',
                      cursor: 'pointer'
                    }}
                    title={isFav ? "Remove from Favorites" : "Add to Favorites"}
                  >
                    <Star size={16} fill={isFav ? "#eab308" : "none"} />
                  </button>

                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    color: '#ffffff',
                    padding: '8px 16px',
                    borderRadius: '20px',
                    fontSize: '13px',
                    fontWeight: 900,
                    boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)'
                  }}>
                    <Play size={14} fill="#fff" />
                    <span>PLAY</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
