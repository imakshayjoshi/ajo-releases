import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Tv, 
  Play, 
  Clock, 
  Radio, 
  Star, 
  Flame, 
  Sparkles, 
  Search, 
  X, 
  Heart,
  Cast
} from 'lucide-react';
import { getCurrentAndNextProgram } from '../api/epg';
import { getIPTVChannels } from '../api/iptv';
import { toggleFavoriteChannel, isFavoriteChannel } from '../api/history';
import { castEngine } from '../api/castSync';

export function EPGGuideView({ channels = [], onSelectChannel }) {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchFilter, setSearchFilter] = useState('');
  const [channelData, setChannelData] = useState([]);
  const [favRefreshCount, setFavRefreshCount] = useState(0);
  const [castAlert, setCastAlert] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const clockRef = useRef(null);

  // Refresh clock every 30s to keep NOW/NEXT labels accurate
  useEffect(() => {
    clockRef.current = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(clockRef.current);
  }, []);

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

  const handleCastToTV = (e, ch) => {
    e.stopPropagation();
    castEngine.castMedia(ch).catch(() => {});
    setCastAlert(`Casting ${ch.title} to TV...`);
    setTimeout(() => setCastAlert(null), 2500);
    if (navigator.vibrate) {
      try { navigator.vibrate([40, 30, 40]); } catch (err) {}
    }
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
    <div className="mobile-epg-container" style={{ position: 'relative', zIndex: 20, padding: '14px 14px 90px 14px', width: '100%', boxSizing: 'border-box' }}>
      {/* Toast Alert */}
      {castAlert && (
        <div style={{
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid #38bdf8',
          color: '#ffffff',
          padding: '10px 20px',
          borderRadius: '24px',
          fontSize: '13px',
          fontWeight: 800,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 8px 24px rgba(56, 189, 248, 0.4)',
          zIndex: 99999
        }}>
          <Cast size={16} color="#38bdf8" />
          <span>{castAlert}</span>
        </div>
      )}

      {/* Top Page Header Banner */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '16px',
        padding: '0 2px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '34px',
            height: '34px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(239, 68, 68, 0.5)'
          }}>
            <Radio size={18} color="#ffffff" />
          </div>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 900, color: '#ffffff', letterSpacing: '-0.4px', margin: 0 }}>
              Live TV Guide & Channels
            </h1>
            <p style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', margin: '2px 0 0 0' }}>
              {filteredChannels.length} Curated HD Channels • 24/7 Live
            </p>
          </div>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'rgba(239, 68, 68, 0.95)',
          padding: '4px 10px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)'
        }}>
          <span style={{ width: '6px', height: '6px', background: '#fff', borderRadius: '50%' }} />
          <span style={{ fontSize: '11px', fontWeight: 900, color: '#fff' }}>24/7 LIVE</span>
        </div>
      </div>

      {/* Search Input Bar */}
      <div style={{
        position: 'relative',
        zIndex: 25,
        marginBottom: '14px',
        width: '100%'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: 'rgba(15, 23, 42, 0.9)',
          border: '1.5px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '14px',
          padding: '10px 14px',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.4)'
        }}>
          <Search size={18} color="#38bdf8" />
          <input
            type="text"
            placeholder="Search Live Channels..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: '#ffffff',
              fontSize: '14px',
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

      {/* Category Pills Bar (Including ⭐ Favorites) */}
      <div style={{
        position: 'relative',
        zIndex: 25,
        display: 'flex',
        gap: '8px',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        touchAction: 'pan-x pan-y',
        paddingBottom: '12px',
        marginBottom: '12px',
        scrollbarWidth: 'none'
      }}>
        {categories.map(cat => {
          const isSelected = selectedCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              style={{
                padding: '9px 16px',
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

      {/* Channel Count */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        margin: '6px 0 12px 0'
      }}>
        <span style={{ fontSize: '13px', fontWeight: 800, color: '#f8fafc' }}>
          {filteredChannels.length} Channels {selectedCategory === '⭐ Favorites' ? 'in Favorites' : `in ${selectedCategory}`}
        </span>
      </div>

      {/* Vertical Channels List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
        {filteredChannels.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8' }}>
            <Radio size={40} color="#64748b" style={{ margin: '0 auto 12px auto' }} />
            <p style={{ fontWeight: 700, fontSize: '14px' }}>
              {selectedCategory === '⭐ Favorites' 
                ? 'No favorite channels pinned yet. Tap the ❤️ heart icon on any channel to pin it!' 
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
                onClick={() => onSelectChannel && onSelectChannel(ch)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  padding: '12px 14px',
                  borderRadius: '16px',
                  background: '#111827',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  cursor: 'pointer',
                  width: '100%',
                  boxSizing: 'border-box'
                }}
              >
                {/* Channel Logo & Number */}
                <div style={{
                  position: 'relative',
                  width: '52px',
                  height: '52px',
                  borderRadius: '12px',
                  background: '#0a0e17',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  overflow: 'hidden',
                  border: '1px solid rgba(255,255,255,0.12)'
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
                    <Radio size={24} color="#38bdf8" />
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
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <span style={{
                      fontSize: '15px',
                      fontWeight: 800,
                      color: '#ffffff',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      display: 'block'
                    }}>
                      {ch.title}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#38bdf8', fontWeight: 700 }}>
                    <span>{ch.category || 'Live TV'}</span>
                    <span>•</span>
                    <span style={{ color: '#4ade80' }}>24/7 LIVE HD</span>
                  </div>

                  {/* Now Playing */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ fontSize: '9px', fontWeight: 900, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.5px', flexShrink: 0 }}>NOW</span>
                    <span style={{
                      fontSize: '12px',
                      color: '#cbd5e1',
                      fontWeight: 600,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {currentProg?.title || 'Live Broadcast'}
                    </span>
                  </div>
                  {/* Next Program */}
                  {ch.epg?.next && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ fontSize: '9px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', flexShrink: 0 }}>NEXT</span>
                      <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ch.epg.next.startTimeFormatted} · {ch.epg.next.title}
                      </span>
                    </div>
                  )}
                </div>

                {/* Favorite Heart + Cast to TV + Play Icon */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  <button
                    onClick={(e) => handleToggleFav(e, ch)}
                    style={{
                      background: isFav ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                      border: isFav ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '50%',
                      width: '34px',
                      height: '34px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isFav ? '#ef4444' : '#94a3b8',
                      cursor: 'pointer'
                    }}
                    title={isFav ? "Remove from Favorites" : "Add to Favorites"}
                  >
                    <Heart size={16} fill={isFav ? "#ef4444" : "none"} />
                  </button>

                  <button
                    onClick={(e) => handleCastToTV(e, ch)}
                    style={{
                      background: 'rgba(56, 189, 248, 0.15)',
                      border: '1px solid rgba(56, 189, 248, 0.4)',
                      borderRadius: '50%',
                      width: '34px',
                      height: '34px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#38bdf8',
                      cursor: 'pointer'
                    }}
                    title="Play on TV"
                  >
                    <Cast size={16} />
                  </button>

                  <div style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)'
                  }}>
                    <Play size={15} fill="#fff" />
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
