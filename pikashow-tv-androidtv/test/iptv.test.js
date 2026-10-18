import test from 'node:test';
import assert from 'node:assert/strict';
import { parseM3U } from '../src/api/iptv.js';

test('parses valid HTTP playlist entries', () => {
  const value = '#EXTM3U\n#EXTINF:-1 tvg-id="news" tvg-logo="https://img.test/news.png" group-title="News",News HD\nhttps://cdn.test/news/master.m3u8\n';
  const items = parseM3U(value);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'news');
  assert.equal(items[0].title, 'News HD');
  assert.equal(items[0].category, 'News');
});

test('ignores non-http playlist targets', () => {
  const value = '#EXTM3U\n#EXTINF:-1,Bad\nfile:///tmp/video.mp4\n';
  assert.equal(parseM3U(value).length, 0);
});
