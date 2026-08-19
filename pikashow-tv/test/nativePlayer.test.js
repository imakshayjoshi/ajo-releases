import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Tests for the native ExoPlayer bridge helpers. These guard the Fire TV
 * black-screen fix: the web layer must hand playback to the native player when
 * the device reports it should, and must degrade cleanly to the web player when
 * no bridge exists (desktop browsers, phone builds without PlayerActivity).
 */

const MODULE = '../src/utils/nativePlayer.js';

/** Import the module fresh so each test sees its own window/navigator stubs. */
async function loadModule() {
  return import(`${MODULE}?t=${Date.now()}${Math.random()}`);
}

function setWindow(androidNativePlayer, userAgent = 'Mozilla/5.0') {
  globalThis.window = androidNativePlayer === undefined
    ? {}
    : { AndroidNativePlayer: androidNativePlayer };
  // Node >=21 exposes a getter-only globalThis.navigator, so plain assignment
  // throws; redefine the property instead.
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent },
    configurable: true,
    writable: true
  });
}

function clearWindow() {
  delete globalThis.window;
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: '' },
    configurable: true,
    writable: true
  });
}

test('no bridge: reports unavailable and never claims a launch', async () => {
  setWindow(undefined);
  const { hasNativePlayer, shouldPreferNativePlayer, playInNativePlayer } = await loadModule();

  assert.equal(hasNativePlayer(), false);
  assert.equal(shouldPreferNativePlayer(), false);
  assert.equal(playInNativePlayer('https://cdn.test/a.m3u8', 'Test', false), false);
  clearWindow();
});

test('bridge present: playStream receives coerced url/title/isLive', async () => {
  const calls = [];
  setWindow({
    playStream: (url, title, isLive) => calls.push([url, title, isLive])
  });
  const { hasNativePlayer, playInNativePlayer } = await loadModule();

  assert.equal(hasNativePlayer(), true);
  assert.equal(playInNativePlayer('https://cdn.test/live.m3u8', 'Star Sports', true), true);
  assert.deepEqual(calls[0], ['https://cdn.test/live.m3u8', 'Star Sports', true]);

  // Missing title falls back to a sensible label rather than "undefined".
  playInNativePlayer('https://cdn.test/movie.m3u8', '', false);
  assert.deepEqual(calls[1], ['https://cdn.test/movie.m3u8', 'Video Stream', false]);
  clearWindow();
});

test('empty url is refused so we never open a blank player', async () => {
  let called = false;
  setWindow({ playStream: () => { called = true; } });
  const { playInNativePlayer } = await loadModule();

  assert.equal(playInNativePlayer('', 'Test', false), false);
  assert.equal(called, false);
  clearWindow();
});

test('preferNative() from the bridge decides the handoff', async () => {
  setWindow({ playStream: () => {}, preferNative: () => true });
  let mod = await loadModule();
  assert.equal(mod.shouldPreferNativePlayer(), true);

  setWindow({ playStream: () => {}, preferNative: () => false });
  mod = await loadModule();
  assert.equal(mod.shouldPreferNativePlayer(), false);
  clearWindow();
});

test('older bridges without preferNative fall back to isFireTv, then UA sniff', async () => {
  // isFireTv only
  setWindow({ playStream: () => {}, isFireTv: () => true });
  let mod = await loadModule();
  assert.equal(mod.shouldPreferNativePlayer(), true);

  // Neither hook: Fire TV user agent still triggers the handoff.
  setWindow({ playStream: () => {} }, 'Mozilla/5.0 (Linux; Android 7.1.2; AFTMM Build/NS6301)');
  mod = await loadModule();
  assert.equal(mod.shouldPreferNativePlayer(), true);

  // Neither hook, ordinary phone UA: stay on the web pipeline.
  setWindow({ playStream: () => {} }, 'Mozilla/5.0 (Linux; Android 13; Pixel 7)');
  mod = await loadModule();
  assert.equal(mod.shouldPreferNativePlayer(), false);
  clearWindow();
});

test('embed/iframe mirrors are never sent to the native player', async () => {
  const calls = [];
  setWindow({ playStream: (u) => calls.push(u) });
  const { playInNativePlayer, isNativePlayableUrl } = await loadModule();

  // ExoPlayer decodes media, not HTML pages.
  assert.equal(isNativePlayableUrl('https://apiplayer.ru/embed/movie/980431?auto=1'), false);
  assert.equal(playInNativePlayer('https://apiplayer.ru/embed/movie/980431', 'X', false), false);
  assert.equal(playInNativePlayer('https://vidsrc.to/embed/movie/123', 'X', false), false);

  // Direct streams still go through.
  assert.equal(isNativePlayableUrl('https://cdn.test/live/37.m3u8'), true);
  assert.equal(playInNativePlayer('https://cdn.test/live/37.m3u8', 'X', true), true);
  assert.deepEqual(calls, ['https://cdn.test/live/37.m3u8']);
  clearWindow();
});

test('a throwing bridge never crashes the player UI', async () => {
  setWindow({
    playStream: () => { throw new Error('bridge died'); },
    preferNative: () => { throw new Error('bridge died'); },
    isFireTv: () => { throw new Error('bridge died'); },
    getDeviceInfo: () => { throw new Error('bridge died'); }
  }, 'Mozilla/5.0 (Linux; Android 13; Pixel 7)');
  const { playInNativePlayer, shouldPreferNativePlayer, nativeDeviceInfo } = await loadModule();

  assert.equal(playInNativePlayer('https://cdn.test/a.m3u8', 'Test', false), false);
  assert.equal(shouldPreferNativePlayer(), false);
  assert.equal(nativeDeviceInfo(), '');
  clearWindow();
});
