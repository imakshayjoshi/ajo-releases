import test from 'node:test';
import assert from 'node:assert/strict';
import { parseM3U } from '../src/api/iptv.js';

test('parses a TV playlist entry', () => {
  const value = '#EXTM3U\n#EXTINF:-1 tvg-id="one" group-title="Live",Channel One\nhttps://cdn.test/one.m3u8\n';
  const items = parseM3U(value);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Channel One');
});
