import test from 'node:test';
import assert from 'node:assert/strict';
import { detectStreamType, generateUniversalServers, isSafeHttpUrl } from '../src/utils/streamingEngines.js';

test('detects common stream types', () => {
  assert.equal(detectStreamType('https://cdn.test/master.m3u8'), 'hls');
  assert.equal(detectStreamType('https://cdn.test/movie.mp4'), 'video');
  assert.equal(detectStreamType('https://cdn.test/manifest.mpd'), 'dash');
});

test('rejects unsafe and duplicate sources', () => {
  assert.equal(isSafeHttpUrl('javascript:alert(1)'), false);
  const sources = generateUniversalServers({ players: [{ url: 'https://cdn.test/a.m3u8' }, { url: 'https://cdn.test/a.m3u8' }, { url: 'file:///tmp/a.mp4' }] });
  assert.equal(sources.length, 1);
  assert.equal(sources[0].source, 'hls');
});
