import test from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, isAllowedApkUrl } from '../src/api/otaUpdate.js';

test('compares version numbers', () => {
  assert.equal(compareVersions('2.4.8', '2.4.7'), 1);
  assert.equal(compareVersions('2.4.8', '2.4.8'), 0);
  assert.equal(compareVersions('2.4.7', '2.4.8'), -1);
});

test('allows only AJO GitHub release APKs', () => {
  assert.equal(isAllowedApkUrl('https://github.com/imakshayjoshi/ajo-releases/releases/download/v2.4.8/AJO_PHONE.apk'), true);
  assert.equal(isAllowedApkUrl('https://example.com/AJO_PHONE.apk'), false);
  assert.equal(isAllowedApkUrl('javascript:alert(1)'), false);
});
