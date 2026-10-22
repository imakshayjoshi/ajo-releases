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

test('generates universal streaming servers for movies and TV shows', () => {
  const movie = { id: 980431, tmdb_id: 980431, title: 'Test Movie', type: 'movie', url: 'https://cdn.test/movie.m3u8' };
  const sources = generateUniversalServers(movie);
  const embedServer = sources.find(s => s.source === 'embed');
  assert.ok(embedServer, 'Embed server should be generated');
  assert.ok(embedServer.url.includes('980431'), 'Server URL should contain TMDb ID');
  assert.equal(embedServer.source, 'embed');
});

test('rejects unsafe and duplicate sources', () => {
  assert.equal(isSafeHttpUrl('javascript:alert(1)'), false);
  const sources = generateUniversalServers({ players: [{ url: 'https://cdn.test/a.m3u8' }, { url: 'https://cdn.test/a.m3u8' }, { url: 'file:///tmp/a.mp4' }] });
  assert.equal(sources.length, 1);
  assert.equal(sources[0].source, 'hls');
});

// v3.12.50: episode binding — the "every episode streams episode 1" bugs.
test('v3.12.50: tmdb-ep episode id uses the SERIES tmdb id, not the trailing episode digit', () => {
  const ep = { id: 'tmdb-ep-205753-1-8', type: 'series', title: 'Episode 8' };
  const servers = generateUniversalServers(ep);
  assert.ok(servers.length > 0, 'Servers must be generated');
  assert.ok(servers.some(s => s.url.includes('/tv/205753/1/8') || s.url.includes('205753-1-8')),
    'Mirrors must target series 205753 S1 E8');
  assert.ok(!servers.some(s => /\/tv\/8\/1\/1(?:\/|\?|$)/.test(s.url)),
    'The trailing episode digit must never be mistaken for the series id');
});

test('v3.12.50: episode item with season_number/episode_number binds without episodeInfo', () => {
  const panchayatEp = { id: 'tmdb-ep-101416-2-3', tmdb_id: 101416, season_number: 2, episode_number: 3, title: 'Kranti', type: 'series' };
  const servers = generateUniversalServers(panchayatEp);
  // v3.9.14: autoembed removed (dead blank shell); vidy leads and carries S/E.
  const vidy = servers.find(s => s.url.includes('vidy.st'));
  assert.ok(vidy && vidy.url.includes('/tv/101416/2/3'), `Vidy must carry S2E3: ${vidy?.url}`);
  const vidsrc = servers.find(s => s.url.includes('vidsrc.pm'));
  assert.ok(vidsrc && vidsrc.url.includes('/tv/101416/2/3'), `VidSrc must carry S2E3: ${vidsrc?.url}`);
});

test('v3.12.50: PIKASHOW-style string season/episode fields are honored', () => {
  const ep = { id: 'pik-42', tmdb_id: 4867, category: 'serials', season: '3', episode: '11' };
  const servers = generateUniversalServers(ep);
  assert.ok(servers.some(s => s.url.includes('/tv/4867/3/11') || s.url.includes('4867-3-11')),
    'String S/E fields from the API must bind mirrors to S3 E11');
});

test('v3.9.14: Vidy leads the embed mirrors (autoembed removed — blank shell)', () => {
  const movieServers = generateUniversalServers({ tmdb_id: 550, type: 'movie' });
  assert.ok(!movieServers.some(s => s.url.includes('autoembed.co')), 'autoembed must be gone from the movie chain');
  const firstMovieEmbed = movieServers.find(s => s.source === 'embed');
  assert.ok(firstMovieEmbed.url.includes('vidy.st'), `Movie Server 1 must be Vidy, got ${firstMovieEmbed.url}`);
  assert.ok(movieServers.findIndex(s => s.url.includes('vidsrc.pm')) > movieServers.findIndex(s => s.url.includes('vidy.st')),
    'VidSrc PM must sort after Vidy for movies');

  const epServers = generateUniversalServers({ tmdb_id: 101416, type: 'series', season_number: 2, episode_number: 3 });
  assert.ok(!epServers.some(s => s.url.includes('autoembed.co')), 'autoembed must be gone from the episode chain');
  const firstEpEmbed = epServers.find(s => s.source === 'embed');
  assert.ok(firstEpEmbed.url.includes('vidy.st'), `Episode Server 1 must be Vidy, got ${firstEpEmbed.url}`);
});

