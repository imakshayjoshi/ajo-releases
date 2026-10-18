import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMediaItem, getFallbackCatalog, getFallbackLiveChannels } from '../src/api/pikashow.js';

test('normalizeMediaItem marks items with valid streams as playable', () => {
  const item = {
    id: 500,
    title: 'Valid Stream Title',
    players: [{ url: 'https://cdn.example.com/stream.m3u8' }]
  };
  const normalized = normalizeMediaItem(item, 'bollywood');
  assert.equal(normalized.playable, true);
  assert.equal(normalized.url, 'https://cdn.example.com/stream.m3u8');
  assert.equal(normalized.category, 'bollywood');
});

test('normalizeMediaItem marks items without valid streams as not playable', () => {
  const item = {
    id: 501,
    title: 'No Stream Title',
    players: []
  };
  const normalized = normalizeMediaItem(item, 'hollywood');
  assert.equal(normalized.playable, false);
  assert.equal(normalized.url, '');
});

test('ensures zero fake fallback video injection', () => {
  assert.deepEqual(getFallbackCatalog(), []);
  assert.deepEqual(getFallbackLiveChannels(), []);
});
