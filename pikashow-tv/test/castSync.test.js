import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeCastItem } from '../src/api/castSync.js';

test('sanitizes cast item and preserves valid stream sources', () => {
  const raw = {
    id: 101,
    title: 'Interstellar',
    type: 'movie',
    year: 2014,
    players: [
      { url: 'https://cdn.example.com/interstellar.m3u8', translator: 'Hindi UHD', type: 'hls' },
      { url: 'javascript:alert(1)', name: 'Malicious' }
    ]
  };

  const clean = sanitizeCastItem(raw);
  assert.equal(clean.id, 101);
  assert.equal(clean.title, 'Interstellar');
  assert.equal(clean.type, 'movie');
  assert.equal(clean.players.length, 1);
  assert.equal(clean.players[0].url, 'https://cdn.example.com/interstellar.m3u8');
});

test('returns null for empty or null cast item', () => {
  assert.equal(sanitizeCastItem(null), null);
  assert.equal(sanitizeCastItem(undefined), null);
});
