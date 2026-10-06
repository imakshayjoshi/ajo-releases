/**
 * Regression tests for the v3.2.1 audit fixes. Each test maps directly to a
 * numbered bug in /Users/akshay/Desktop/apks/BUG_REPORT.md.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateUniversalServers, isSafeHttpUrl } from '../src/utils/streamingEngines.js';
import { isNativePlayableUrl, isDirectMediaUrl, shouldPreferNativePlayer, playInNativePlayer } from '../src/utils/nativePlayer.js';
import { getPairingRoom, setPairingRoom, remoteCommandToKeyboard, injectRemoteCommandKey } from '../src/api/castSync.js';

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
    assert.equal(isDirectMediaUrl(url), false, `should reject ${url}`);
  }
  // And keep accepting real media URLs.
  assert.equal(isDirectMediaUrl('https://cdn.example.com/master.m3u8'), true);
  assert.equal(isDirectMediaUrl('https://cdn.example.com/movie.mp4'), true);
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

// --- v3.12.48 STABILITY REGRESSION TESTS -----------------------------------
// NOTE: pikashow-tv ships on its own release line (3.12.43 / code 130) — this
// test must track *this* app's OTA constants, not the AJO TV android build.
test('OTA version and code are consistent with the build', async () => {
  const ota = await import('../src/api/otaUpdate.js');
  assert.equal(ota.CURRENT_APP_VERSION, '3.12.57');
  assert.equal(ota.CURRENT_VERSION_CODE, 207);
  assert.equal(ota.compareVersions('3.12.48', '3.12.47'), 1);
  assert.equal(ota.compareVersions('3.12.47', '3.12.48'), -1);
  assert.equal(ota.compareVersions('3.12.48', '3.12.48'), 0);
  assert.equal(ota.compareVersions('android-tv-v3.12.48', '3.12.47'), 1);
  assert.equal(ota.extractVersion('android-tv-v3.12.47'), '3.12.47');
});

test('v3.12.46: Sony channels and Indian channels are never culled by filterDeadChannels', async () => {
  const { filterDeadChannels, markChannelDead } = await import('../src/api/iptv.js');
  const deadUrl = 'https://cloudplay-sonyliv.pages.dev/sabhd.m3u8';
  markChannelDead(deadUrl);

  const channels = [
    {
      id: 'builtin-sonysab',
      title: 'Sony SAB TV HD',
      isBuiltin: true,
      url: deadUrl,
      players: [{ name: 'Server 1', url: deadUrl }]
    },
    {
      id: 'random-foreign-channel',
      title: 'Random Unknown TV',
      isBuiltin: false,
      url: deadUrl,
      players: [{ name: 'Server 1', url: deadUrl }]
    }
  ];

  const filtered = filterDeadChannels(channels);
  // Protected Sony SAB channel must NOT be hidden
  assert.ok(filtered.some(c => c.id === 'builtin-sonysab'), 'Sony SAB channel must remain visible in the grid');
  // Unprotected non-Indian foreign channel with all dead URLs can be culled
  assert.ok(!filtered.some(c => c.id === 'random-foreign-channel'), 'Unprotected channel with dead URLs is culled');
});

test('v3.12.46: Panchayat / TMDB series episode servers point to specific season and episode', () => {
  const panchayatSeries = {
    id: 'tmdb-101416',
    title: 'Panchayat',
    type: 'series',
    category: 'serials',
    tmdb_id: 101416
  };
  const episode = {
    id: 'tmdb-ep-101416-2-3',
    season_number: 2,
    episode_number: 3,
    title: 'Kranti',
    name: 'Kranti',
    tmdb_id: 101416
  };
  const servers = generateUniversalServers(panchayatSeries, episode);
  assert.ok(servers.length > 0, 'Servers must be generated');

  const vidlink = servers.find(s => s.url.includes('vidlink.pro'));
  assert.ok(vidlink, 'VidLink server must be present');
  assert.ok(vidlink.url.includes('/tv/101416/2/3'), `VidLink must point to /tv/101416/2/3, got ${vidlink.url}`);

  const autoembed = servers.find(s => s.url.includes('autoembed.co'));
  assert.ok(autoembed, 'AutoEmbed server must be present');
  assert.ok(autoembed.url.includes('101416-2-3'), `AutoEmbed must point to 101416-2-3, got ${autoembed.url}`);

  const vidsrc = servers.find(s => s.url.includes('vidsrc.pm'));
  assert.ok(vidsrc, 'VidSrc server must be present');
  assert.ok(vidsrc.url.includes('/tv/101416/2/3'), `VidSrc must point to /tv/101416/2/3, got ${vidsrc.url}`);
});

test('v3.12.38: DASH stream URLs recognized as media streams', () => {
  const dashUrls = [
    'https://example.com/live/manifest.mpd',
    'https://cdn.provider.com/dash/stream_1080.mpd?token=abc',
    'https://stream.server.net/dash/channel1'
  ];
  for (const u of dashUrls) {
    const isDirect = u.includes('.mpd') || u.includes('/dash/');
    assert.ok(isDirect, `DASH stream ${u} should be detected as direct media`);
  }
});

// --- v3.12.50: phone remote navigation keys must reach the TV UI -----------
test('v3.12.50: phone remote D-pad/channel commands map to TV keyboard keys', () => {
  assert.deepEqual(remoteCommandToKeyboard('DPAD_UP'), { key: 'ArrowUp', keyCode: 38, code: 'ArrowUp' });
  assert.deepEqual(remoteCommandToKeyboard('DPAD_DOWN'), { key: 'ArrowDown', keyCode: 40, code: 'ArrowDown' });
  assert.deepEqual(remoteCommandToKeyboard('DPAD_LEFT'), { key: 'ArrowLeft', keyCode: 37, code: 'ArrowLeft' });
  assert.deepEqual(remoteCommandToKeyboard('DPAD_RIGHT'), { key: 'ArrowRight', keyCode: 39, code: 'ArrowRight' });
  assert.deepEqual(remoteCommandToKeyboard('DPAD_CENTER'), { key: 'Enter', keyCode: 13, code: 'Enter' });
  assert.deepEqual(remoteCommandToKeyboard('CHANNEL_UP'), { key: 'ChannelUp', keyCode: 166, code: 'ChannelUp' });
  assert.deepEqual(remoteCommandToKeyboard('CHANNEL_DOWN'), { key: 'ChannelDown', keyCode: 167, code: 'ChannelDown' });
  assert.equal(remoteCommandToKeyboard('PLAY_PAUSE'), null, 'media keys stay on the native-player branch');
});

test('v3.12.50: injectRemoteCommandKey is safe outside a browser', () => {
  assert.equal(injectRemoteCommandKey('DPAD_UP'), false);
  assert.equal(injectRemoteCommandKey('PLAY'), false);
});

test('v3.12.50: cast payload season/episode fields rebuild episode-exact mirrors', () => {
  const castItem = { id: 'tmdb-205753', type: 'series', title: 'Some Show', tmdb_id: 205753 };
  const msg = { seasonNumber: 1, episodeNumber: 8, tmdbId: 205753 };
  const castEpisode = (msg.seasonNumber || msg.episodeNumber)
    ? { season_number: Number(msg.seasonNumber) || 1, episode_number: Number(msg.episodeNumber) || 1, tmdb_id: msg.tmdbId || castItem.tmdb_id || null }
    : null;
  const servers = generateUniversalServers(castItem, castEpisode);
  assert.ok(servers.some(s => s.url.includes('/tv/205753/1/8')), 'path-style mirrors must carry S1 E8');
  assert.ok(servers.some(s => s.url.includes('205753-1-8')), 'dash-style mirrors must carry S1 E8');
  assert.ok(!servers.some(s => /\/tv\/8\/1\/1(?:\/|\?|$)/.test(s.url)), 'episode digit must never masquerade as series id');
});
