import test from 'node:test';
import assert from 'node:assert/strict';
import { detectStreamType, generateUniversalServers, isEmbedUrl, isSafeHttpUrl, isDeadHost as isDeadHostUrl } from '../src/utils/streamingEngines.js';

test('detects common stream types', () => {
  assert.equal(detectStreamType('https://cdn.test/master.m3u8'), 'hls');
  assert.equal(detectStreamType('https://cdn.test/movie.mp4'), 'video');
  assert.equal(detectStreamType('https://cdn.test/manifest.mpd'), 'dash');
  assert.equal(detectStreamType('https://apiplayer.ru/embed/movie/980431?color=38bdf8'), 'embed');
  assert.equal(isEmbedUrl('https://apiplayer.ru/embed/tv/279471/1/2'), true);
});

test('apiplayer.ru mirror is filtered out of the server list (host is dead)', () => {
  // v3.12.35 FIX: the old test asserted the apiplayer mirror exists, but
  // apiplayer.ru is on the DEAD_HOSTS list (502 Bad Gateway, Aug 2026), so
  // generateUniversalServers always filters the mirror it just built. The
  // buildApiPlayerMirror helper is now a no-op for this host — the honest
  // assertion is that NO apiplayer server reaches the user.
  const movie = { id: 980431, tmdb_id: 980431, title: 'Test Movie', type: 'movie', url: 'https://cdn.test/movie.m3u8' };
  const sources = generateUniversalServers(movie);
  const apiPlayer = sources.find(s => s.provider === 'apiplayer');
  assert.equal(apiPlayer, undefined, 'dead apiplayer.ru mirror must not be offered');
  // And the rest of the mirror list is still generated.
  assert.ok(sources.length >= 8, 'confirmed-alive mirrors still generated');
  assert.ok(sources.every(s => !isDeadHostUrl(s.url)), 'no dead hosts in the final list');
});

test('rejects unsafe and duplicate sources', () => {
  assert.equal(isSafeHttpUrl('javascript:alert(1)'), false);
  const sources = generateUniversalServers({ players: [{ url: 'https://cdn.test/a.m3u8' }, { url: 'https://cdn.test/a.m3u8' }, { url: 'file:///tmp/a.mp4' }] });
  assert.equal(sources.length, 1);
  assert.equal(sources[0].source, 'hls');
});
