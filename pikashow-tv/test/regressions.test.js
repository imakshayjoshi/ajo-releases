/**
 * Regression tests for the v3.2.1 audit fixes. Each test maps directly to a
 * numbered bug in /Users/akshay/Desktop/apks/BUG_REPORT.md.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateUniversalServers, isSafeHttpUrl } from '../src/utils/streamingEngines.js';
import { isNativePlayableUrl, shouldPreferNativePlayer, playInNativePlayer } from '../src/utils/nativePlayer.js';
import { getPairingRoom, setPairingRoom } from '../src/api/castSync.js';

// --- BUG H2: autoembed.co TV URL must use query string, not dash -----------
test('Bug H2: autoembed.co series URL uses query string', () => {
  const sources = generateUniversalServers(
    {
      id: 'tt1234567',
      title: 'Test Series',
      type: 'series',
      category: 'serials'
    },
    { season: 2, episode: 5 }
  );
  const autoembed = sources.find((s) => /autoembed\.co/.test(s.url));
  assert.ok(autoembed, 'autoembed mirror should be present');
  assert.equal(
    autoembed.url,
    'https://autoembed.co/tv/imdb/tt1234567?s=2&e=5',
    'autoembed.co TV path must use ?s= and ?e= query params'
  );
});

// --- BUG H3: 2embed.cc TV URL must use ?s= and ?e= -------------------------
test('Bug H3: 2embed.cc series URL uses query string', () => {
  const sources = generateUniversalServers(
    { id: 'tt7654321', title: 'Other Series', type: 'series', category: 'serials' },
    { season: 1, episode: 3 }
  );
  const twoembed = sources.find((s) => /2embed\.cc/.test(s.url));
  assert.ok(twoembed, '2embed mirror should be present');
  assert.equal(
    twoembed.url,
    'https://www.2embed.cc/embedtv/tt7654321?s=1&e=3',
    '2embed.cc TV path must use ?s= and ?e= query params'
  );
});

// --- BUG C1: isNativePlayableUrl must reject every known embed host --------
test('Bug C1: native playable gate rejects all known embed hosts', () => {
  const samples = [
    'https://apiplayer.ru/embed/movie/980431?auto=1',
    'https://vidsrc.to/embed/movie/12345',
    'https://vidsrc.cc/v2/embed/movie/tt9999',
    'https://www.2embed.cc/embed/tt9999',
    'https://autoembed.co/movie/imdb/tt9999',
    'https://multiembed.mov/?video_id=tt9999',
    'https://humma429gix.com/play/ftt9999',
    'https://rasta428jem.com/play/xyz',
    'https://smashy.stream/embed/123',
    'https://example.com/embed/whatever',
    'https://example.com/play/whatever'
  ];
  for (const url of samples) {
    assert.equal(isNativePlayableUrl(url), false, `should reject ${url}`);
  }
  // And keep accepting real media URLs.
  assert.equal(isNativePlayableUrl('https://cdn.example.com/master.m3u8'), true);
  assert.equal(isNativePlayableUrl('https://cdn.example.com/movie.mp4'), true);
});

// --- BUG C1: playInNativePlayer refuses to call the bridge for embeds ------
test('Bug C1: playInNativePlayer short-circuits on embed URLs', () => {
  const calls = [];
  globalThis.window = {
    AndroidNativePlayer: {
      playStreamWithFallbacks: (u, t, l, f) => calls.push({ u, t, l, f })
    }
  };
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7)' },
    configurable: true,
    writable: true
  });

  assert.equal(playInNativePlayer('https://apiplayer.ru/embed/movie/1', 'X', false), false);
  assert.equal(playInNativePlayer('https://vidsrc.to/embed/movie/2', 'X', false), false);
  assert.equal(calls.length, 0, 'bridge must never be called with an embed URL');

  delete globalThis.window;
});

// --- BUG M14: JioTV host must be RFC1918 / localhost ------------------------
test('Bug M14: only RFC1918 / localhost hosts accepted for JioTV fetch', async () => {
  const iptv = await import('../src/api/iptv.js');
  // Public host must return [] without making a fetch.
  let publicResult = await iptv.getJioTVServerChannels('https://evil.example.com');
  assert.deepEqual(publicResult, [], 'public host must be rejected');

  // Invalid URL must return [].
  assert.deepEqual(await iptv.getJioTVServerChannels('not-a-url'), []);

  // Localhost and 192.168.x.x are accepted (we don't actually fetch in unit test).
  // Just ensure they pass validation and attempt a fetch (which will fail in
  // node but the function must not reject the host).
  let localTried = false;
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => { localTried = true; throw new Error('netfail'); };
  await iptv.getJioTVServerChannels('http://192.168.1.50:5001');
  assert.equal(localTried, true, '192.168.1.50 should reach fetch');
  globalThis.fetch = origFetch;
});

// --- BUG C2: getPairingRoom / setPairingRoom round-trip ---------------------
test('Bug C2: getPairingRoom / setPairingRoom persist correctly', () => {
  // castSync.js uses localStorage by default; provide an in-memory shim.
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  };

  assert.equal(getPairingRoom(), '');
  const clean = setPairingRoom('abc-1234');
  assert.match(clean, /^AJO-[A-Z0-9-]+$/, 'setPairingRoom normalizes and prefixes');
  assert.equal(getPairingRoom(), clean);

  // Lower-case input is normalized to upper.
  setPairingRoom('lower-case');
  const reRead = getPairingRoom();
  assert.equal(reRead, reRead.toUpperCase(), 'room code must be uppercase');
});
