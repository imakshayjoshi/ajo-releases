import test from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, isAllowedApkUrl, APP_TARGETS } from '../src/api/otaUpdate.js';

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

// v3.17.53: each manifest key must map to the APK of ITS OWN package. The old
// ternaries collapsed `fire_tv` into the phone branch and the GitHub-API
// fallback grabbed the first asset containing "TV", so a Fire TV device could
// download an Android-TV or phone APK — guaranteed
// INSTALL_FAILED_UPDATE_INCOMPATIBLE.
test('v3.17.53: every appType maps to its own package and APK name', () => {
  assert.equal(APP_TARGETS.android_tv.packageId, 'com.ajo.androidtv');
  assert.equal(APP_TARGETS.android_tv.assetName, 'AJO_ANDROID_TV.apk');
  assert.equal(APP_TARGETS.fire_tv.packageId, 'com.ajo.tv');
  assert.equal(APP_TARGETS.fire_tv.assetName, 'AJO_TV_FIRE.apk');
  assert.equal(APP_TARGETS.phone.packageId, 'com.ajo.phone');
  assert.equal(APP_TARGETS.phone.assetName, 'AJO_PHONE.apk');
  // AJO_TV.apk has shipped as com.ajo.androidtv for every release on record.
  assert.equal(APP_TARGETS.tv.packageId, 'com.ajo.androidtv');
  assert.equal(APP_TARGETS.tv.assetName, 'AJO_TV.apk');
});

test('v3.17.53: fire_tv must not resolve to the phone APK', () => {
  assert.notEqual(APP_TARGETS.fire_tv.assetName, APP_TARGETS.phone.assetName);
  assert.notEqual(APP_TARGETS.fire_tv.packageId, APP_TARGETS.phone.packageId);
});
