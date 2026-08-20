# Antigravity prompt: check for new code and sync local with GitHub

Paste everything inside the fence into Antigravity while the `ajo-releases` folder is
open. It is written to be safe: it never discards local work without asking.

---

```
You are working in the local clone of the GitHub repo imakshayjoshi/ajo-releases.
The app source lives in the pikashow-tv/ subfolder. It is a Vite + React app wrapped
with Capacitor, shipped as an Android APK for Fire TV OS and Android TV.

GOAL
Find every change that exists on GitHub but not in my local folder, reconcile the two
without losing any of my local work, then rebuild the app so I can install it.

STEP 1. Report the current state before touching anything.
Run and show me the raw output of:
  git remote -v
  git branch --show-current
  git status --porcelain=v1
  git stash list
  git fetch origin --prune
  git log --oneline -12 origin/main
  git log --oneline -12 HEAD
  git rev-list --left-right --count HEAD...origin/main
Then tell me in plain language: how many commits I am behind, how many I am ahead,
and whether my working tree is dirty.

STEP 2. Show me exactly what is new on the remote.
  git diff HEAD origin/main --stat
  git diff HEAD origin/main --name-status
For every file listed, show the actual diff and summarize what changed in one line.
Do not skip files. Pay attention to these four, which contain recent Fire TV
black-screen fixes:
  pikashow-tv/android/app/src/main/java/com/pikashow/tv/MainActivity.java
  pikashow-tv/android/app/src/main/java/com/pikashow/tv/PlayerActivity.java
  pikashow-tv/src/components/TVPlayer.jsx
  pikashow-tv/src/components/TVPlayer.css   (new file)

STEP 3. Protect my local work, then sync.
If the working tree is dirty:
  a. List every modified file and show me the diff of each one.
  b. For each file, tell me whether my local version is newer work or just a stale
     copy of an older commit. Files whose only difference is that they are missing
     the remote fixes are stale, and should be replaced by the remote version.
  c. Ask me before discarding anything. If I confirm, run:
       git stash push -u -m "pre-sync local state"
     so the work is recoverable, then continue.
Then sync:
  git pull --rebase origin main
If the rebase conflicts, do not take either side blindly. Resolve each conflict by
keeping BOTH intents, and verify the invariants in Step 4 still hold afterwards.
If I had a stash from step (c), run `git stash pop` and resolve conflicts the same way.
Never run `git reset --hard`, `git checkout .`, `git clean -fd` or `git push --force`
without asking me first and explaining what will be lost.

STEP 4. Verify the Fire TV fixes survived the merge.
These are the reasons video was playing as a black screen with working audio. Check
each one in the actual file and report PASS or FAIL with the line number. If any FAIL,
restore it from origin/main and tell me.

MainActivity.java
  1. AndroidNativePlayer.playStream does NOT add FLAG_ACTIVITY_NEW_TASK or
     FLAG_ACTIVITY_CLEAR_TOP to the PlayerActivity intent.
  2. startActivity(intent) runs BEFORE releaseWebVideoDecoder(). The order matters.
  3. releaseWebVideoDecoder() exists, pauses every <video>, clears its src, calls
     webView.onPause(), and does NOT call pauseTimers().
  4. onResume() exists and calls webView.onResume(), requestFocus(),
     enableImmersiveMode(), and dispatches the ajo-native-player-closed JS event.

PlayerActivity.java
  5. osdOverlay background is Color.TRANSPARENT. It must never be a flat scrim such
     as #66000000, which reads as a black film over the whole picture.
  6. onStop() saves the position and calls releasePlayer(). onStart() rebuilds with
     initializePlayer() when player == null.
  7. onNewIntent() exists, re-reads the url/title/isLive extras, resets
     softwareDecoderRetryDone, and re-initializes. The activity is singleTop, so
     channel switches arrive here.
  8. The first-frame watchdog exists (FIRST_FRAME_TIMEOUT_MS) and is cancelled in
     onRenderedFirstFrame().

TVPlayer.jsx
  9. import './TVPlayer.css' is present.
  10. teardownWebPlayback() destroys the Hls instance and clears the <video> src, and
      handOffToNative() calls it BEFORE playInNativePlayer().
  11. The Hls.js pipeline effect returns early when nativeActiveRef.current is true.
  12. handOffToNative() refuses URLs that fail isNativePlayableUrl().
  13. The root, video, OSD and drawer still carry their inline geometry styles, and
      the OSD background is transparent.

TVPlayer.css
  14. .tv-player-osd forces a transparent background, and .tv-player-video forces
      filter: none, mix-blend-mode: normal and opacity: 1.

STEP 5. Look for anything that would re-break the picture.
Search pikashow-tv/src for rules that paint over the video plane or force GPU
compositing of the video element:
  grep -rn "tv-player-osd\|tv-player-video\|tv-player-fullscreen" pikashow-tv/src --include=*.css
  grep -rn "backdrop-filter\|mix-blend-mode\|opacity\|filter:" pikashow-tv/src/index.css
Report any rule in index.css that sets a non-transparent background, a filter, a blend
mode or an opacity below 1 on the player container, the OSD or the video element.
Do not edit index.css yet. Show me the rule and wait for my decision.

STEP 6. Build.
  cd pikashow-tv
  npm install          (only if node_modules is missing or package.json changed)
  npm run build
  npx cap sync android
  cd android && ./gradlew assembleRelease
Report the APK path and its size. If the build fails, show the first real error, not
just the last line of Gradle output.

HARD RULES
- Do NOT modify the root version.json. It drives the in-app update prompt, and
  bumping it before a new APK is published tells every user to download something
  that does not exist. I bump it myself after the release is live.
- Do NOT revert or "simplify" any of the 14 checks in Step 4. Every one of them is
  there because of a real Fire TV failure, not style preference.
- Do NOT add a full-screen dark overlay, scrim, backdrop-filter or CSS filter
  anywhere over the video. Use gradients on the top and bottom bars only.
- Do NOT start web playback and native playback at the same time. Fire TV boxes have
  a very small MediaCodec budget, and two players fighting over it is the original
  black-screen bug.
- Do not commit or push anything until I have seen your report and said go.

FINAL REPORT
Give me: commits pulled, files changed, any conflicts and how you resolved them,
the PASS/FAIL table from Step 4, anything suspicious from Step 5, and the APK path.
```

---

## After the build: on-device check

```
adb connect <firetv-ip>:5555
adb install -r pikashow-tv/android/app/build/outputs/apk/release/app-release.apk
adb logcat -c && adb logcat -s AJOPlayer
```

Play a live channel. A healthy stream logs, in order:

```
TRACKS: video=1 audio=1
VIDEO_SIZE: 1920x1080
RENDERED_FIRST_FRAME: hardware surface is receiving decoded video
```

If `TRACKS` shows a video track but `RENDERED_FIRST_FRAME` never appears, the
first-frame watchdog will switch to software decoding after 9 seconds and log it.
If that also fails, the decoder on that box cannot handle the stream profile.

## Release order

1. Build and test the APK.
2. Upload it and publish the GitHub release.
3. Only then bump `version.json`, so the update prompt points at an APK that exists.
