# AJO stability work

This branch changes playback and catalog behavior to favor correct content over title count.

## Rules

- A title without a checked stream is not assigned a shared fallback video.
- HLS, DASH, and direct video URLs are handled as different source types.
- Player retries and source changes have fixed limits.
- IPTV and catalog calls use timeouts and cached last-known data.
- Provider and quality labels must come from source data.
- Phone and TV use separate Android application IDs.
- Production WebViews reject cleartext and mixed-content traffic.
- APK updates are accepted only from this repository's release path.
- Casting uses a random pairing room rather than a public default room.

## Required device checks before release

1. Build signed Phone and TV APKs.
2. Install AJO Phone and AJO TV on separate target devices.
3. Test HLS master playlists, direct video, broken URLs, timeouts, and source fallback.
4. Test Fire TV remote focus, Back, play, pause, seek, and quality selection.
5. Test app background and resume during playback.
6. Test poor Wi-Fi and mobile-data conditions.
7. Confirm every published title resolves to the expected content.
8. Confirm update package ID and signing certificate before installation.
