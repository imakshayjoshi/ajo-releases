import React, { useEffect, useRef, useState } from 'react';
import { X, CameraOff, ScanLine } from 'lucide-react';
import jsQR from 'jsqr';

/**
 * QRScannerSheet — full-screen camera sheet that scans the AJO TV pairing QR.
 *
 * The TV's Settings card shows a QR encoding `ajo://pair?code=AJO-XXXX`.
 * This sheet opens the rear camera, decodes with jsQR (pure JS, no native
 * plugin), extracts the room code and hands it to onCode(code).
 *
 * Accepts: ajoapp://pair?code=AJO-XXXX, an https pair URL with a code param
 * (legacy QRs from TV builds <= 3.12.89), or a bare AJO-XXXX code.
 */
export function extractRoomCode(text) {
  if (!text) return null;
  // Canonical payload first: ajoapp://pair?code=AJO-XXXX (or legacy https
  // pair URLs). NB: the scheme 'ajoapp' itself matches /AJO[-\s]?[A-Z0-9]+/
  // ('AJO-APP'), so the bare-pattern fallback must run only after code=
  // fails — proven by the decode test that returned AJO-APP for a real QR.
  const param = String(text).match(/[?&]code=([A-Za-z0-9][A-Za-z0-9-]*)/);
  if (param) {
    const bare = param[1].match(/^AJO[-\s]?([A-Z0-9]{3,8})$/i);
    if (bare) return 'AJO-' + bare[1].toUpperCase();
    if (/^[A-Z0-9]{3,8}$/i.test(param[1])) return 'AJO-' + param[1].toUpperCase();
  }
  const m = String(text).match(/\bAJO[-\s]([A-Z0-9]{3,8})\b/i);
  if (m) return 'AJO-' + m[1].toUpperCase();
  return null;
}

export function QRScannerSheet({ onCode, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(0);
  const canvasRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const stop = () => {
      cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => { try { t.stop(); } catch {} });
        streamRef.current = null;
      }
    };

    const tick = () => {
      if (cancelled) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (w && h) {
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(video, 0, 0, w, h);
          try {
            const imageData = ctx.getImageData(0, 0, w, h);
            const code = jsQR(imageData.data, w, h, { inversionAttempts: 'dontInvert' });
            if (code && code.data) {
              const room = extractRoomCode(code.data);
              if (room) {
                stop();
                onCode(room);
                return;
              }
            }
          } catch {}
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          await videoRef.current.play().catch(() => {});
        }
        rafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        setError(
          e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')
            ? 'Camera permission denied. Allow camera access for AJO Phone, or type the code instead.'
            : 'Could not open the camera. Type the code instead.'
        );
      }
    })();

    return () => { cancelled = true; stop(); };
  }, []);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#000', display: 'flex', flexDirection: 'column'
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px', color: '#fff'
      }}>
        <div style={{ fontWeight: 800, fontSize: '15px' }}>Scan TV QR Code</div>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%',
            width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', cursor: 'pointer'
          }}
          aria-label="Close scanner"
        >
          <X size={18} />
        </button>
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {error ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#cbd5e1', fontSize: 14, lineHeight: 1.6, maxWidth: 320 }}>
            <CameraOff size={40} style={{ margin: '0 auto 12px', display: 'block', color: '#64748b' }} />
            {error}
          </div>
        ) : (
          <>
            <video ref={videoRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} muted playsInline />
            {/* scan frame guide */}
            <div style={{
              position: 'relative', width: 220, height: 220, borderRadius: 18,
              border: '2.5px solid rgba(45,212,191,0.9)',
              boxShadow: '0 0 0 2000px rgba(0,0,0,0.45)',
              pointerEvents: 'none'
            }}>
              <ScanLine size={26} color="#2DD4BF" style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)' }} />
            </div>
          </>
        )}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>

      <div style={{ padding: '16px 24px 28px', textAlign: 'center', color: '#94a3b8', fontSize: 13, lineHeight: 1.5 }}>
        Point your camera at the QR code on your TV<br />
        (TV → Settings → Connect Your Phone)
      </div>
    </div>
  );
}

export default QRScannerSheet;
