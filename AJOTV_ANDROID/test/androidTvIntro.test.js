import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// The approved Android TV clip is kept byte-for-byte, including its original audio.
// Update this pin only when the user supplies a replacement Android TV intro.
test('Android TV packages the exact approved 4K startup clip', () => {
  const clip = readFileSync(new URL('../android/app/src/main/res/raw/ajo_tv_intro.mp4', import.meta.url));
  assert.equal(createHash('sha256').update(clip).digest('hex'),
    '5781a390fa1e36a549a3b502c480ae572c7077a31c472e2ea7a9e7f01d5801c0');
});
