import React, { useState, useEffect } from 'react';
import { 
  Tv, 
  Cast, 
  Volume2, 
  VolumeX, 
  Volume1,
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
  Settings
} from 'lucide-react';
import { castEngine, getPairingRoom, setPairingRoom } from '../api/castSync';
import { CURATED_HD_CHANNELS } from '../api/iptv';

export function TVRemoteControlView({ onTuneChannelLocally }) {
  const [roomId, setRoomId] = useState(getPairingRoom());
  const [isEditingRoom, setIsEditingRoom] = useState(false);
  const [customRoomInput, setCustomRoomInput] = useState(roomId);
  const [lastActionToast, setLastActionToast] = useState(null);

  const triggerToast = (msg) => {
    setLastActionToast(msg);
    setTimeout(() => {
      setLastActionToast(null);
    }, 2500);
  };

  const handleSaveRoom = (e) => {
    e.preventDefault();
    const updated = setPairingRoom(customRoomInput);
    setRoomId(updated);
    castEngine.updateRoom(updated);
    setIsEditingRoom(false);
    triggerToast(`Paired with TV Room: ${updated}`);
  };

  // Send Remote D-Pad / Action Commands to TV
  const sendKey = (keyName, label) => {
    castEngine.sendToTV({
      type: 'DPAD_EVENT',
      key: keyName
    });
    triggerToast(`Sent: ${label || keyName}`);
    if (navigator.vibrate) {
      try { navigator.vibrate(25); } catch (e) {}
    }
  };

  // Send Tab Navigation to TV
  const sendNavTab = (tabName, label) => {
    castEngine.sendToTV({
      type: 'NAV_TAB',
      tab: tabName
    });
    triggerToast(`TV Navigated to ${label}`);
    if (navigator.vibrate) {
      try { navigator.vibrate(35); } catch (e) {}
    }
  };

  // Direct Cast & Play Channel on TV
  const castChannelToTV = (channel) => {
    castEngine.sendToTV({
      type: 'PLAY_MEDIA',
      item: channel
    });
    triggerToast(`Now Playing on TV: ${channel.title}`);
    if (navigator.vibrate) {
      try { navigator.vibrate([40, 30, 40]); } catch (e) {}
    }
  };

  return (
    <div style={{
      padding: '16px 14px 100px 14px',
      color: '#ffffff',
      maxWidth: '480px',
      margin: '0 auto',
      boxSizing: 'border-box'
    }}>
      {/* Action Toast Alert */}
      {lastActionToast && (
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
          zIndex: 99999,
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <Cast size={16} color="#38bdf8" />
          <span>{lastActionToast}</span>
        </div>
      )}

      {/* Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.95) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
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
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(2, 132, 199, 0.5)'
            }}>
              <Tv size={24} color="#ffffff" />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 900, margin: 0, letterSpacing: '-0.3px' }}>
                AJO Smart TV Remote & Cast
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
                <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700 }}>
                  Connected to TV Room: <b style={{ color: '#38bdf8' }}>{roomId}</b>
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={() => setIsEditingRoom(!isEditingRoom)}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#38bdf8',
              padding: '6px 12px',
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            Pair Code
          </button>
        </div>

        {/* Pair Code Form */}
        {isEditingRoom && (
          <form onSubmit={handleSaveRoom} style={{ marginTop: '14px', display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={customRoomInput}
              onChange={(e) => setCustomRoomInput(e.target.value.toUpperCase())}
              placeholder="e.g. AJO-7788"
              style={{
                flex: 1,
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1.5px solid #38bdf8',
                borderRadius: '10px',
                padding: '8px 12px',
                color: '#fff',
                fontWeight: 800,
                fontSize: '14px',
                outline: 'none'
              }}
            />
            <button
              type="submit"
              style={{
                background: '#38bdf8',
                color: '#06090e',
                border: 'none',
                borderRadius: '10px',
                padding: '8px 16px',
                fontWeight: 900,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              Save
            </button>
          </form>
        )}
      </div>

      {/* 1-Tap Quick Cast Channels Launcher (The killer feature) */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Zap size={16} color="#38bdf8" />
            <span style={{ fontSize: '13px', fontWeight: 900, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              1-Tap Instant TV Channel Cast
            </span>
          </div>
          <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>Tap to play on TV</span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '8px'
        }}>
          {CURATED_HD_CHANNELS.slice(0, 8).map(ch => (
            <div
              key={ch.id}
              onClick={() => castChannelToTV(ch)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: 'rgba(30, 41, 59, 0.7)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '8px 10px',
                borderRadius: '12px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {ch.poster ? (
                <img
                  src={ch.poster}
                  alt=""
                  style={{ width: '32px', height: '32px', borderRadius: '8px', objectFit: 'contain', background: '#000' }}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <Radio size={20} color="#38bdf8" />
              )}
              <div style={{ overflow: 'hidden' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                  {ch.title.replace(/\([^)]*\)/g, '').trim()}
                </span>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#38bdf8' }}>
                  {ch.category}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tactile D-Pad Navigation & OK Button */}
      <div style={{
        background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '24px',
        padding: '24px 16px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        boxShadow: '0 12px 30px rgba(0,0,0,0.5)',
        marginBottom: '20px'
      }}>
        <div style={{
          width: '210px',
          height: '210px',
          borderRadius: '50%',
          background: 'linear-gradient(145deg, #1e293b, #0f172a)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.6), inset 0 2px 4px rgba(255,255,255,0.1)',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {/* UP BUTTON */}
          <button
            onClick={() => sendKey('ArrowUp', 'UP')}
            style={{
              position: 'absolute',
              top: '8px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '60px',
              height: '50px',
              background: 'none',
              border: 'none',
              color: '#ffffff',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              cursor: 'pointer'
            }}
          >
            <ArrowUp size={24} />
          </button>

          {/* DOWN BUTTON */}
          <button
            onClick={() => sendKey('ArrowDown', 'DOWN')}
            style={{
              position: 'absolute',
              bottom: '8px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '60px',
              height: '50px',
              background: 'none',
              border: 'none',
              color: '#ffffff',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              cursor: 'pointer'
            }}
          >
            <ArrowDown size={24} />
          </button>

          {/* LEFT BUTTON */}
          <button
            onClick={() => sendKey('ArrowLeft', 'LEFT')}
            style={{
              position: 'absolute',
              left: '8px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '50px',
              height: '60px',
              background: 'none',
              border: 'none',
              color: '#ffffff',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              cursor: 'pointer'
            }}
          >
            <ArrowLeft size={24} />
          </button>

          {/* RIGHT BUTTON */}
          <button
            onClick={() => sendKey('ArrowRight', 'RIGHT')}
            style={{
              position: 'absolute',
              right: '8px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '50px',
              height: '60px',
              background: 'none',
              border: 'none',
              color: '#ffffff',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              cursor: 'pointer'
            }}
          >
            <ArrowRight size={24} />
          </button>

          {/* CENTER OK / SELECT BUTTON */}
          <button
            onClick={() => sendKey('Enter', 'SELECT / OK')}
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)',
              border: 'none',
              color: '#06090e',
              fontSize: '16px',
              fontWeight: 900,
              boxShadow: '0 4px 16px rgba(56, 189, 248, 0.4)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            OK
          </button>
        </div>

        {/* Back, Home & Search Remote Control Bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          width: '100%',
          marginTop: '20px',
          padding: '0 10px'
        }}>
          <button
            onClick={() => sendKey('Escape', 'BACK')}
            style={{
              flex: 1,
              margin: '0 4px',
              padding: '12px',
              borderRadius: '14px',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#ffffff',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer'
            }}
          >
            <ChevronLeft size={20} />
            <span style={{ fontSize: '11px', fontWeight: 800 }}>Back</span>
          </button>

          <button
            onClick={() => sendNavTab('home', 'Home')}
            style={{
              flex: 1,
              margin: '0 4px',
              padding: '12px',
              borderRadius: '14px',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#ffffff',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer'
            }}
          >
            <Home size={20} />
            <span style={{ fontSize: '11px', fontWeight: 800 }}>Home</span>
          </button>

          <button
            onClick={() => sendNavTab('search', 'Search')}
            style={{
              flex: 1,
              margin: '0 4px',
              padding: '12px',
              borderRadius: '14px',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#ffffff',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer'
            }}
          >
            <Search size={20} />
            <span style={{ fontSize: '11px', fontWeight: 800 }}>Search</span>
          </button>
        </div>
      </div>

      {/* Playback & Volume Remote Controls */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '8px'
      }}>
        <button
          onClick={() => sendKey('MediaPlayPause', 'PLAY / PAUSE')}
          style={{
            padding: '14px 8px',
            borderRadius: '14px',
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer'
          }}
        >
          <Play size={18} fill="currentColor" />
          <span style={{ fontSize: '10px', fontWeight: 800 }}>Play/Pause</span>
        </button>

        <button
          onClick={() => sendKey('MediaRewind', 'REWIND 10s')}
          style={{
            padding: '14px 8px',
            borderRadius: '14px',
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer'
          }}
        >
          <RotateCcw size={18} />
          <span style={{ fontSize: '10px', fontWeight: 800 }}>-10s</span>
        </button>

        <button
          onClick={() => sendKey('MediaFastForward', 'FORWARD 10s')}
          style={{
            padding: '14px 8px',
            borderRadius: '14px',
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer'
          }}
        >
          <RotateCw size={18} />
          <span style={{ fontSize: '10px', fontWeight: 800 }}>+10s</span>
        </button>

        <button
          onClick={() => sendKey('AudioVolumeMute', 'MUTE')}
          style={{
            padding: '14px 8px',
            borderRadius: '14px',
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer'
          }}
        >
          <VolumeX size={18} />
          <span style={{ fontSize: '10px', fontWeight: 800 }}>Mute</span>
        </button>
      </div>
    </div>
  );
}
