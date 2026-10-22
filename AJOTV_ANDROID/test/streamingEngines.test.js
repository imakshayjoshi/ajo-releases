import test from 'node:test';
import assert from 'node:assert/strict';
import { detectStreamType, generateUniversalServers, isEmbedUrl, isSafeHttpUrl } from '../src/utils/streamingEngines.js';

test('detects common stream types', () => {
  assert.equal(detectStreamType('https://cdn.test/master.m3u8'), 'hls');
  assert.equal(detectStreamType('https://cdn.test/movie.mp4'), 'video');
  assert.equal(detectStreamType('https://cdn.test/manifest.mpd'), 'dash');
  assert.equal(detectStreamType('https://apiplayer.ru/embed/movie/980431?color=38bdf8'), 'embed');
  assert.equal(isEmbedUrl('https://apiplayer.ru/embed/tv/279471/1/2'), true);
});

test('v3.14.2: apiplayer.ru mirror is never generated (dead 12th server)', () => {
  const movie = { id: 980431, tmdb_id: 980431, title: 'Test Movie', type: 'movie', url: 'https://cdn.test/movie.m3u8' };
  const sources = generateUniversalServers(movie);
  assert.ok(!sources.some(s => s.provider === 'apiplayer' || /apiplayer\.ru/.test(s.url)),
    'apiplayer.ru must never enter the chain — Cloudflare interstitial, never plays');
});

test('rejects unsafe and duplicate sources', () => {
  assert.equal(isSafeHttpUrl('javascript:alert(1)'), false);
  const sources = generateUniversalServers({ players: [{ url: 'https://cdn.test/a.m3u8' }, { url: 'https://cdn.test/a.m3u8' }, { url: 'file:///tmp/a.mp4' }] });
  assert.equal(sources.length, 1);
  assert.equal(sources[0].source, 'hls');
});
