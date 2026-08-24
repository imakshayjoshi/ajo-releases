import React, { useMemo, useState } from 'react';
import { getCatchupWindows, buildCatchupUrl, parseXtreamFromUrl, buildXtreamTimeshiftUrl } from '../api/catchup';

/**
 * Catch-up picker for live channels: pick a day, pick an hour, play.
 * Only shown when the channel advertises catch-up support (M3U attrs)
 * or is an Xtream portal stream.
 */
export function CatchupDrawer({ channel, onClose, onPlay }) {
  const [selectedDay, setSelectedDay] = useState(null);

  const xtream = useMemo(() => parseXtreamFromUrl(channel?.url || ''), [channel?.url]);
  const supported = Boolean(channel?.catchup || xtream);

  const windows = useMemo(() => {
    if (!supported) return [];
    return getCatchupWindows({ ...channel, catchupDays: channel?.catchupDays || 7 });
  }, [channel, supported]);

  if (!supported) {
    return (
      <div style={{
        marginTop: '14px',
        padding: '14px',
        background: 'rgba(15, 23, 42, 0.98)',
        border: '1px solid rgba(148, 163, 184, 0.4)',
        borderRadius: '16px'
      }}>
        <div style={{ fontSize: '12px', fontWeight: 900, color: '#94a3b8', marginBottom: '6px' }}>
          CATCH-UP TV
        </div>
        <div style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: 1.5 }}>
          This channel doesn't advertise catch-up support. Channels from Xtream portals or playlists with <code>catchup="1"</code> support replaying up to 7 days of past broadcasts.
        </div>
        <button onClick={onClose} style={{ marginTop: '10px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', color: '#fff', padding: '6px 14px', fontWeight: 800, fontSize: '12px' }}>
          Close
        </button>
      </div>
    );
  }

  const slots = selectedDay ? windows.find(w => w.label === selectedDay)?.slots || [] : [];

  const play = (start) => {
    let url = null;
    if (xtream) {
      url = buildXtreamTimeshiftUrl(xtream, start, 120);
    } else {
      url = buildCatchupUrl(channel, start, 120);
    }
    if (url) onPlay(url);
  };

  return (
    <div style={{
      marginTop: '14px',
      padding: '14px',
      background: 'rgba(15, 23, 42, 0.98)',
      border: '1px solid rgba(56, 189, 248, 0.4)',
      borderRadius: '16px',
      maxHeight: '300px',
      overflowY: 'auto'
    }}>
      <div style={{ fontSize: '12px', fontWeight: 900, color: '#38bdf8', marginBottom: '10px', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between' }}>
        <span>Catch-Up TV — {channel.catchupDays || 7} days available</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontWeight: 900 }}>✕</button>
      </div>

      {!selectedDay ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {windows.map(w => (
            <button key={w.label} onClick={() => setSelectedDay(w.label)} style={{
              padding: '8px 14px', borderRadius: '10px',
              background: 'rgba(255,255,255,0.08)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.15)', fontWeight: 800, fontSize: '12px', cursor: 'pointer'
            }}>
              {w.label}
            </button>
          ))}
        </div>
      ) : (
        <>
          <button onClick={() => setSelectedDay(null)} style={{ background: 'none', border: 'none', color: '#38bdf8', fontWeight: 800, fontSize: '12px', marginBottom: '8px', cursor: 'pointer' }}>
            ← {selectedDay}
          </button>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
            {slots.map(s => (
              <button key={s.label} onClick={() => play(s.start)} style={{
                padding: '8px 4px', borderRadius: '8px',
                background: 'rgba(56, 189, 248, 0.12)', color: '#e2e8f0',
                border: '1px solid rgba(56, 189, 248, 0.3)', fontWeight: 800, fontSize: '12px', cursor: 'pointer'
              }}>
                {s.label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '8px' }}>
            Tap a time to start watching from then (2-hour window).
          </div>
        </>
      )}
    </div>
  );
}
