import test from 'node:test';
import assert from 'node:assert/strict';
import { detectStreamType, generateUniversalServers } from '../src/utils/streamingEngines.js';

test('detects HLS without treating every HTTP URL as HLS', () => {
  assert.equal(detectStreamType('https://cdn.test/master.m3u8'), 'hls');
  assert.equal(detectStreamType('https://cdn.test/movie.mp4'), 'video');
  assert.equal(detectStreamType('https://cdn.test/resource'), 'unknown');
});

test('keeps only valid unique sources', () => {
  const sources = generateUniversalServers({ url: 'https://cdn.test/master.m3u8', players: [{ url: 'https://cdn.test/master.m3u8' }] });
  assert.equal(sources.length, 1);
});
