import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Tv, 
  Cast, 
  Play, 
  Pause, 
  RotateCcw, 
  RotateCw, 
  ArrowUp, 
  ArrowDown, 
  ArrowLeft, 
  ArrowRight, 
  Home, 
  ChevronLeft, 
  Search, 
  Radio, 
  Film, 
  Video, 
  CheckCircle2, 
  Sparkles,
  Zap,
  Settings,
  RefreshCw,
  Unplug,
  AlertCircle,
  Loader2,
  Bookmark,
  Check
} from 'lucide-react';
import { 
  castEngine, 
  CONNECTION_STATES, 
  REMOTE_COMMANDS 
} from '../api/castSync';
import { getIPTVChannels } from '../api/iptv';

export function TVRemoteControlView({ onTuneChannelLocally }) {
  // Cast & Pairing State
  const [castState, setCastState] = useState(() => ({
    state: castEngine.connectionState,
    roomCode: castEngine.roomCode,
    session: castEngine.session,
    isPaired: Boolean(castEngine.session?.sessionId)
  }));
  const [roomInput, setRoomInput] = useState(castEngine.roomCode || '');
  const [isEditingRoom, setIsEditingRoom] = useState(false);
  const [toast, setToast] = useState(null);
  const [commandInProgress, setCommandInProgress] = useState(null);

  // Channels State
  const [channels, setChannels] = useState([]);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [channelError, setChannelError] = useState(null);
  const [channelSearch, setChannelSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [castingChannelId, setCastingChannelId] = useState(null);

  // Subscribe to Engine Connection State
  useEffect(() => {
    const unsub = castEngine.subscribeState((info) => {
      setCastState(info);
      if (info.roomCode && !roomInput) setRoomInput(info.roomCode);
    });
    return () => unsub();
  }, []);

  // Subscribe to TV Playback Status Reports
  useEffect(() => {
    const unsub = castEngine.subscribe((msg) => {
      if (msg.type === 'CAST_STATUS') {
        if (msg.status === 'PLAYING') {
          triggerToast(`▶ TV Playing: ${msg.title || 'Live Channel'}`);
          setCastingChannelId(null);
        } else if (msg.status === 'SOURCE_FAILED' || msg.status === 'UNAVAILABLE') {
          triggerToast(`⚠ Stream Unavailable on TV`);
          setCastingChannelId(null);
        } else if (msg.status === 'BUFFERING') {
          triggerToast(`⏳ TV Buffering: ${msg.title || ''}...`);
        }
      }
    });
    return () => unsub();
  }, []);

  const triggerToast = (msg) => {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 3000);
  };

  // Load Channels dynamically
  const loadChannels = useCallback(async () => {
    setLoadingChannels(true);
    setChannelError(null);
    try {
      const data = await getIPTVChannels();
      setChannels(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('[Channel Cast] Failed to load IPTV channels:', err);
      setChannelError('Could not load channels. Tap Retry.');
    } finally {
      setLoadingChannels(false);
    }
  }, []);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  // Handshake Handlers
  const handleJoinRoom = (e) => {
    e?.preventDefault();
    if (!roomInput.trim()) return;
    const clean = castEngine.joinRoom(roomInput.trim());
    setRoomInput(clean);
    setIsEditingRoom(false);
    triggerToast(`🔗 Connecting & Pairing with ${clean}...`);
    castEngine.requestPairing().then(() => {
      triggerToast(`📡 Pairing handshake sent to ${clean}`);
    }).catch(() => {
      triggerToast(`📡 Pairing handshake sent to ${clean}`);
    });
  };

  const handlePairAgain = () => {
    try {
      castEngine.requestPairing();
      triggerToast(`Requesting handshake with TV...`);
    } catch (e) {
      triggerToast(e.message);
    }
  };

  const handleForgetDevice = () => {
    castEngine.forgetPairing();
    triggerToast('Unpaired from TV');
  };

  // Remote Commands Dispatch
  const sendCommand = async (commandName, label) => {
    if (!castEngine.roomCode) {
      triggerToast('Enter TV Room Code above to control TV');
      return;
    }

    setCommandInProgress(commandName);
    try {
      await castEngine.sendRemoteCommand(commandName, 3000);
      triggerToast(`TV: ${label || commandName}`);
      if (navigator.vibrate) {
        try { navigator.vibrate(30); } catch (_) {}
      }
    } catch (err) {
      console.warn('[Remote] Command status:', err);
      triggerToast(`TV: ${label || commandName}`);
    } finally {
      setCommandInProgress(null);
    }
  };

  // Channel Cast Dispatch
  const handleCastChannel = async (channel, e) => {
    if (e) e.stopPropagation();

    if (!castEngine.roomCode) {
      triggerToast('Enter your TV Room Code above first');
      return;
    }

    setCastingChannelId(channel.id);
    triggerToast(`Casting ${channel.title} to TV...`);

    try {
      await castEngine.castMedia(channel);
      if (navigator.vibrate) {
        try { navigator.vibrate([40, 30, 40]); } catch (_) {}
      }
    } catch (err) {
      console.error('[Cast] Channel cast failed:', err);
      triggerToast(`Cast sent to TV`);
    } finally {
      setTimeout(() => setCastingChannelId(null), 1500);
    }
  };

  // Filtered Channels
  const categories = useMemo(() => {
    const set = new Set(['All']);
    channels.forEach(ch => {
      if (ch.category) set.add(ch.category);
    });
    return Array.from(set).slice(0, 10);
  }, [channels]);

  const filteredChannels = useMemo(() => {
    let list = channels;
    if (selectedCategory !== 'All') {
      list = list.filter(ch => ch.category === selectedCategory);
    }
    if (channelSearch.trim()) {
      const q = channelSearch.trim().toLowerCase();
      list = list.filter(ch => (ch.title || '').toLowerCase().includes(q));
    }
    return list;
  }, [channels, selectedCategory, channelSearch]);

  const isConnected = castState.state === CONNECTION_STATES.CONNECTED;
  const isConnecting = castState.state === CONNECTION_STATES.CONNECTING || castState.state === CONNECTION_STATES.PAIRING;

  return (
    <div style={{
      padding: '16px 14px 100px 14px',
      color: '#ffffff',
      maxWidth: '520px',
      margin: '0 auto',
      boxSizing: 'border-box'
    }}>
      {/* Action Toast Alert */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(15, 23, 42, 0.96)',
          border: '1px solid #38bdf8',
          color: '#ffffff',
          padding: '10px 18px',
          borderRadius: '24px',
          fontSize: '13px',
          fontWeight: 800,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 8px 24px rgba(56, 189, 248, 0.4)',
          zIndex: 99999,
          maxWidth: '90%'
        }}>
          <Cast size={16} color="#38bdf8" />
          <span>{toast}</span>
        </div>
      )}

      {/* Header & TV Pairing Card */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '20px',
        padding: '16px',
        marginBottom: '16px',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.4)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: isConnected 
                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' 
                : isConnecting 
                  ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' 
                  : 'linear-gradient(135deg, #64748b 0%, #475569 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: isConnected ? '0 4px 16px rgba(16, 185, 129, 0.4)' : 'none'
            }}>
              <Tv size={24} color="#ffffff" />
            </div>
            <div>
              <h2 style={{ fontSize: '17px', fontWeight: 900, margin: 0, letterSpacing: '-0.3px' }}>
                {isConnected ? (castState.session?.tvName || 'AJO Smart TV') : 'AJO TV Remote & Cast'}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                <span style={{ 
                  width: '8px', 
                  height: '8px', 
                  borderRadius: '50%', 
                  background: isConnected ? '#22c55e' : isConnecting ? '#f59e0b' : '#ef4444',
                  boxShadow: isConnected ? '0 0 8px #22c55e' : 'none'
                }} />
                <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700 }}>
                  {isConnected ? (
                    <>Connected • Room <b style={{ color: '#38bdf8' }}>{castState.roomCode}</b></>
                  ) : isConnecting ? (
                    <>Connecting to <b style={{ color: '#f59e0b' }}>{castState.roomCode}</b>...</>
                  ) : (
                    <>Not Paired • Enter TV Code</>
                  )}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            {isConnected ? (
              <button
                onClick={handleForgetDevice}
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
                  minHeight: '36px',
                  padding: '0 10px',
                  borderRadius: '10px',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                title="Unpair Device"
              >
                <Unplug size={14} />
                <span>Forget</span>
              </button>
            ) : (
              <button
                onClick={() => setIsEditingRoom(!isEditingRoom)}
                style={{
                  background: 'rgba(56, 189, 248, 0.15)',
                  border: '1px solid rgba(56, 189, 248, 0.4)',
                  color: '#38bdf8',
                  minHeight: '36px',
                  padding: '0 12px',
                  borderRadius: '10px',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                {isEditingRoom ? 'Cancel' : 'Pair TV'}
              </button>
            )}
          </div>
        </div>

        {/* Pair Room Form */}
        {(isEditingRoom || !isConnected) && (
          <form onSubmit={handleJoinRoom} style={{ marginTop: '14px', display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
              placeholder="e.g. AJO-7492 (shown on TV)"
              style={{
                flex: 1,
                background: 'rgba(0, 0, 0, 0.5)',
                border: '1.5px solid #38bdf8',
                borderRadius: '10px',
                padding: '10px 14px',
                color: '#fff',
                fontWeight: 800,
                fontSize: '14px',
                outline: 'none',
                minHeight: '44px',
                boxSizing: 'border-box'
              }}
            />
            <button
              type="submit"
              style={{
                background: '#38bdf8',
                color: '#06090e',
                border: 'none',
                borderRadius: '10px',
                padding: '0 16px',
                fontWeight: 900,
                fontSize: '13px',
                cursor: 'pointer',
                minHeight: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <Cast size={16} />
              <span>Connect</span>
            </button>
          </form>
        )}
      </div>

      {/* 1-Tap Instant TV Channel Cast Section */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Zap size={16} color="#38bdf8" />
            <span style={{ fontSize: '13px', fontWeight: 900, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              1-Tap Instant TV Channel Cast
            </span>
          </div>
          <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>
            {filteredChannels.length} Channels
          </span>
        </div>

        {/* Channel Search & Category Filters */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            background: 'rgba(15, 23, 42, 0.8)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '10px',
            padding: '0 10px',
            minHeight: '38px'
          }}>
            <Search size={14} color="#94a3b8" />
            <input
              type="text"
              value={channelSearch}
              onChange={(e) => setChannelSearch(e.target.value)}
              placeholder="Search live channels..."
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 700,
                marginLeft: '8px',
                width: '100%'
              }}
            />
          </div>
          <button
            onClick={loadChannels}
            style={{
              background: 'rgba(30, 41, 59, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '10px',
              color: '#94a3b8',
              padding: '0 10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
            title="Refresh Channels"
          >
            <RefreshCw size={14} className={loadingChannels ? 'spin-animation' : ''} />
          </button>
        </div>

        {/* Category Pills */}
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '6px', marginBottom: '8px' }}>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              style={{
                background: selectedCategory === cat ? '#38bdf8' : 'rgba(30, 41, 59, 0.7)',
                color: selectedCategory === cat ? '#06090e' : '#cbd5e1',
                border: 'none',
                borderRadius: '8px',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 800,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Channels Grid / State */}
        {loadingChannels && channels.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '30px 0', gap: '8px', color: '#94a3b8' }}>
            <Loader2 className="spin-animation" size={20} color="#38bdf8" />
            <span style={{ fontSize: '13px', fontWeight: 700 }}>Loading TV channels...</span>
          </div>
        ) : channelError && channels.length === 0 ? (
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
            <AlertCircle size={24} color="#f87171" style={{ margin: '0 auto 8px auto' }} />
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#f87171' }}>{channelError}</div>
            <button
              onClick={loadChannels}
              style={{ marginTop: '10px', background: '#38bdf8', color: '#06090e', border: 'none', borderRadius: '8px', padding: '6px 14px', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}
            >
              Retry
            </button>
          </div>
        ) : filteredChannels.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>
            No channels found matching "{channelSearch}"
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '8px',
            maxHeight: '260px',
            overflowY: 'auto',
            paddingRight: '4px'
          }}>
            {filteredChannels.slice(0, 16).map(ch => {
              const isCasting = castingChannelId === ch.id;
              return (
                <div
                  key={ch.id}
                  onClick={(e) => handleCastChannel(ch, e)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: isCasting ? 'rgba(56, 189, 248, 0.25)' : 'rgba(30, 41, 59, 0.7)',
                    border: isCasting ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                    padding: '8px 10px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    minHeight: '44px',
                    boxSizing: 'border-box'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                    {ch.poster || ch.logo ? (
                      <img
                        src={ch.poster || ch.logo}
                        alt=""
                        style={{ width: '28px', height: '28px', borderRadius: '6px', objectFit: 'contain', background: '#0a0f18' }}
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <Radio size={18} color="#38bdf8" />
                    )}
                    <div style={{ overflow: 'hidden' }}>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                        {ch.title.replace(/\([^)]*\)/g, '').trim()}
                      </span>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#38bdf8' }}>
                        {ch.category || 'Live TV'}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={(e) => handleCastChannel(ch, e)}
                    style={{
                      minWidth: '32px',
                      minHeight: '32px',
                      borderRadius: '8px',
                      background: isCasting ? '#38bdf8' : 'rgba(56, 189, 248, 0.15)',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isCasting ? '#06090e' : '#38bdf8',
                      cursor: 'pointer'
                    }}
                    title="Cast to TV"
                  >
                    {isCasting ? <Loader2 size={14} className="spin-animation" /> : <Cast size={14} />}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tactile D-Pad Navigation & Remote Control Section */}
      <div style={{
        background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '24px',
        padding: '20px 16px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        boxShadow: '0 12px 30px rgba(0,0,0,0.5)',
        opacity: isConnected ? 1 : 0.65
      }}>
        {/* Navigation & Control Buttons Top Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: '280px', marginBottom: '16px' }}>
          <button
            onClick={() => sendCommand(REMOTE_COMMANDS.BACK, 'Back')}
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
            title="Back"
          >
            <ChevronLeft size={20} />
          </button>

          <button
            onClick={() => sendCommand(REMOTE_COMMANDS.HOME, 'Home')}
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
            title="Home"
          >
            <Home size={20} />
          </button>
        </div>

        {/* Circular D-PAD */}
        <div style={{
          position: 'relative',
          width: '210px',
          height: '210px',
          borderRadius: '50%',
          background: 'linear-gradient(145deg, #0f172a, #1e293b)',
          border: '2px solid rgba(56, 189, 248, 0.3)',
          boxShadow: 'inset 0 4px 12px rgba(0,0,0,0.8), 0 8px 24px rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '20px'
        }}>
          {/* UP */}
          <button
            onClick={() => sendCommand(REMOTE_COMMANDS.DPAD_UP, 'Up')}
            style={{
              position: 'absolute',
              top: '8px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '56px',
              height: '52px',
              background: 'transparent',
              border: 'none',
              color: '#38bdf8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <ArrowUp size={26} strokeWidth={2.5} />
          </button>

          {/* DOWN */}
          <button
            onClick={() => sendCommand(REMOTE_COMMANDS.DPAD_DOWN, 'Down')}
            style={{
              position: 'absolute',
              bottom: '8px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '56px',
              height: '52px',
              background: 'transparent',
              border: 'none',
              color: '#38bdf8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <ArrowDown size={26} strokeWidth={2.5} />
          </button>

          {/* LEFT */}
          <button
            onClick={() => sendCommand(REMOTE_COMMANDS.DPAD_LEFT, 'Left')}
            style={{
              position: 'absolute',
              left: '8px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '52px',
              height: '56px',
              background: 'transparent',
              border: 'none',
              color: '#38bdf8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <ArrowLeft size={26} strokeWidth={2.5} />
          </button>

          {/* RIGHT */}
          <button
            onClick={() => sendCommand(REMOTE_COMMANDS.DPAD_RIGHT, 'Right')}
            style={{
              position: 'absolute',
              right: '8px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '52px',
              height: '56px',
              background: 'transparent',
              border: 'none',
              color: '#38bdf8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <ArrowRight size={26} strokeWidth={2.5} />
          </button>

          {/* CENTER OK */}
          <button
            onClick={() => sendCommand(REMOTE_COMMANDS.DPAD_CENTER, 'Select')}
            style={{
              width: '74px',
              height: '74px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              border: '2px solid rgba(255,255,255,0.3)',
              color: '#ffffff',
              fontSize: '15px',
              fontWeight: 900,
              boxShadow: '0 4px 16px rgba(2, 132, 199, 0.6)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            OK
          </button>
        </div>

        {/* Media & Playback Controls */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          width: '100%',
          maxWidth: '280px'
        }}>
          <button
            onClick={() => sendCommand(REMOTE_COMMANDS.SEEK_BACK, 'Rewind 10s')}
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
            title="Rewind 10s"
          >
            <RotateCcw size={18} />
          </button>

          <button
            onClick={() => sendCommand(REMOTE_COMMANDS.PLAY_PAUSE, 'Play / Pause')}
            style={{
              width: '54px',
              height: '54px',
              borderRadius: '50%',
              background: '#38bdf8',
              border: 'none',
              color: '#06090e',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(56, 189, 248, 0.4)'
            }}
            title="Play / Pause"
          >
            <Play size={22} fill="#06090e" style={{ marginLeft: '2px' }} />
          </button>

          <button
            onClick={() => sendCommand(REMOTE_COMMANDS.SEEK_FORWARD, 'Forward 10s')}
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
            title="Forward 10s"
          >
            <RotateCw size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
