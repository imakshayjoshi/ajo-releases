package com.pikashow.tv;

import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.util.Log;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.TextureView;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.app.PictureInPictureParams;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.util.Rational;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.RelativeLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.HashSet;
import java.util.Set;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.annotation.OptIn;
import androidx.appcompat.app.AppCompatActivity;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.VideoSize;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DataSource;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.HttpDataSource;
import androidx.media3.datasource.okhttp.OkHttpDataSource;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.hls.DefaultHlsExtractorFactory;
import androidx.media3.exoplayer.hls.HlsMediaSource;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.exoplayer.source.MediaSource;
import androidx.media3.exoplayer.source.ProgressiveMediaSource;
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector;
import androidx.media3.extractor.DefaultExtractorsFactory;
import androidx.media3.extractor.ts.DefaultTsPayloadReaderFactory;
import androidx.media3.ui.AspectRatioFrameLayout;

import org.json.JSONArray;

import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

import okhttp3.ConnectionSpec;
import okhttp3.OkHttpClient;

/**
 * Dedicated native video player for Fire TV OS / Android TV.
 *
 * <p>Supports:
 * 1. Hardware-direct SurfaceView with setZOrderMediaOverlay(true) for 4K UHD / 60fps Live TV & direct HLS/MP4.
 * 2. Fullscreen hardware-accelerated Web Video Engine for rich multi-audio embed streams (VidSrc, SuperStream, AutoEmbed, SmashyStream).
 * 3. Automatic multi-server failover across all provided stream mirrors with in-app DNS-over-HTTPS (DoH).
 */
@OptIn(markerClass = UnstableApi.class)
public class PlayerActivity extends AppCompatActivity {

    private static final String TAG = "AJOPlayer";

    // v3.11.1: remote command bridge. The phone's cast remote drives the
    // native ExoPlayer via MainActivity (JS -> Java interface); during native
    // playback the WebView <video> element isn't playing, so the JS remote
    // handler routes commands here when the native player is active.
    private static volatile PlayerActivity activeInstance = null;

    public static void dispatchRemoteCommand(String cmd, double arg) {
        PlayerActivity act = activeInstance;
        if (act == null) return;
        act.runOnUiThread(() -> act.executeRemoteCommand(cmd, arg));
    }

    private void executeRemoteCommand(String cmd, double arg) {
        if (player == null) return;
        String c = cmd == null ? "" : cmd.toUpperCase();
        switch (c) {
            case "PLAY":
                player.setPlayWhenReady(true);
                showOsd();
                break;
            case "PAUSE":
                player.setPlayWhenReady(false);
                showOsd();
                break;
            case "PLAY_PAUSE":
                player.setPlayWhenReady(!player.getPlayWhenReady());
                showOsd();
                break;
            case "SEEK_FORWARD":
                seekBy(SEEK_STEP_MS);
                break;
            case "SEEK_BACK":
                seekBy(-SEEK_STEP_MS);
                break;
            case "SEEK":
                if (!isLive) player.seekTo(Math.max(0L, (long) arg));
                break;
            case "STOP":
                finish();
                break;
            default:
                break;
        }
    }

    private void seekBy(long deltaMs) {
        if (isLive || player.getDuration() <= 0) return;
        long target = Math.max(0L, Math.min(player.getDuration(), player.getCurrentPosition() + deltaMs));
        player.seekTo(target);
    }

    private static final String USER_AGENT =
            // v3.9.1 FIX: removed 'AJO-TV' suffix. Cloudflare Bot Management and
            // Turnstile detect non-standard UA suffixes in ~50ms and immediately
            // serve a captcha challenge. Use a vanilla Chrome Mobile UA that passes
            // as a real Android phone.
            "Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 "
                    + "(KHTML, like Gecko) Chrome/120.0.6099.210 Mobile Safari/537.36";

    // v3.8.2 buffering: generous read windows. A short read timeout on a slow
    // origin (not the user's pipe — 40mbps is plenty) aborts segment reads
    // mid-flight and causes repeated rebuffers on Fire TV.
    private static final int CONNECT_TIMEOUT_MS = 8000;
    private static final int READ_TIMEOUT_MS = 15000;
    private static final long SEEK_STEP_MS = 10000L;
    private static final long OSD_HIDE_DELAY_MS = 6000L;
    private static final long FIRST_FRAME_TIMEOUT_MS = 20000L;
    private static final int FREEZE_STALL_SECONDS = 8;
    private static final int MAX_FREEZE_RECOVERY_ATTEMPTS = 2;

    // Zoom modes cycled by remote (D-pad Up long-press / PROG+ keys)
    private int currentResizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT;
    private int zoomModeIndex = 0;
    private static final int[] ZOOM_MODES = {
            AspectRatioFrameLayout.RESIZE_MODE_FIT,        // 0: Fit (default)
            AspectRatioFrameLayout.RESIZE_MODE_ZOOM,       // 1: Zoom (crop to fill)
            AspectRatioFrameLayout.RESIZE_MODE_FILL,       // 2: Stretch
            AspectRatioFrameLayout.RESIZE_MODE_FIXED_WIDTH,// 3: Fill width
            AspectRatioFrameLayout.RESIZE_MODE_FIXED_HEIGHT// 4: Fill height
    };
    private static final String[] ZOOM_NAMES = { "Fit", "Zoom", "Stretch", "Fill Width", "Fill Height" };

    private void cycleZoomMode() {
        zoomModeIndex = (zoomModeIndex + 1) % ZOOM_MODES.length;
        currentResizeMode = ZOOM_MODES[zoomModeIndex];
        if (aspectRatioFrameLayout != null) {
            aspectRatioFrameLayout.setResizeMode(currentResizeMode);
        }
        Toast.makeText(this, "Display: " + ZOOM_NAMES[zoomModeIndex], Toast.LENGTH_SHORT).show();
        updateControlButtons();
        showOsd();
    }

    @Nullable private ExoPlayer player;
    @Nullable private AspectRatioFrameLayout aspectRatioFrameLayout;
    @Nullable private SurfaceView surfaceView;
    @Nullable private TextureView textureView;
    @Nullable private WebView webVideoView;
    @Nullable private RelativeLayout rootLayout;

    private RelativeLayout osdOverlay;
    private ProgressBar bufferSpinner;
    private TextView titleView;
    private TextView timeView;
    private TextView statusBadge;
    private TextView hintView;
    private TextView btnPlayPause;
    private TextView btnUnmute;
    private TextView btnRewind;
    private TextView btnForward;
    private TextView btnServer;
    private TextView btnFit;
    private TextView btnSafeColor;
    private TextView btnAudioBoost;
    private TextView btnAudioTrack;
    private TextView btnBack;
    private TextView btnPrevChannel;
    private TextView btnNextChannel;
    private TextView btnRecallChannel;
    private TextView btnFavoriteChannel;
    private TextView btnChannelDrawer;
    private TextView btnPip;

    private RelativeLayout channelDrawerLayout;
    private LinearLayout channelListContainer;
    private TextView drawerFilterBtn;
    private boolean isChannelDrawerOpen = false;
    private boolean isDrawerFavoritesOnly = false;
    private static final long DRAWER_AUTO_HIDE_MS = 8000L;
    private final Runnable hideChannelDrawerRunnable = this::hideChannelDrawer;

    private static final String PREFS_NAME = "ajo_tv_prefs";
    private static final String PREF_FAV_CHANNELS = "fav_channels";
    private final Set<String> favoriteChannels = new HashSet<>();
    private boolean isFavoritesSurfingOnly = false;

    private LinearLayout channelBannerView;
    private TextView bannerChannelNumber;
    private TextView bannerChannelTitle;
    private TextView bannerCategory;
    private TextView bannerCounter;
    private TextView bannerHint;
    private TextView numberInputOverlayView;
    private final StringBuilder numberInputBuffer = new StringBuilder();
    private final Runnable numberInputTuningRunnable = this::executeNumberKeyTuning;
    private final Runnable tuneLiveChannelRunnable = this::tuneToCurrentLiveChannel;
    private static final long CHANNEL_SWITCH_DEBOUNCE_MS = 250L;
    private static final long CHANNEL_BANNER_TIMEOUT_MS = 3500L;
    private final Runnable hideChannelBannerRunnable = () -> {
        if (channelBannerView != null) {
            channelBannerView.animate().alpha(0f).setDuration(250).withEndAction(() -> {
                if (channelBannerView != null) channelBannerView.setVisibility(View.GONE);
            }).start();
        }
        if (numberInputOverlayView != null) {
            numberInputOverlayView.setVisibility(View.GONE);
        }
    };

    public static class LiveChannelItem {
        public String title;
        public String url;
        public List<String> fallbacks = new ArrayList<>();
        public String logo;
        public String category;
        public int channelNumber;

        public LiveChannelItem(String title, String url, List<String> fallbacks, String logo, String category, int channelNumber) {
            this.title = title != null ? title : "Live Channel";
            this.url = url != null ? url : "";
            if (fallbacks != null) this.fallbacks.addAll(fallbacks);
            this.logo = logo != null ? logo : "";
            this.category = category != null ? category : "";
            this.channelNumber = channelNumber > 0 ? channelNumber : 1;
        }
    }

    private static final List<LiveChannelItem> liveChannelsList = new ArrayList<>();
    private static int currentLiveChannelIndex = 0;
    private static int previousLiveChannelIndex = -1;

    public static void setLiveChannelsData(String json, int initialIndex) {
        synchronized (liveChannelsList) {
            liveChannelsList.clear();
            try {
                if (json != null && !json.trim().isEmpty()) {
                    JSONArray arr = new JSONArray(json);
                    for (int i = 0; i < arr.length(); i++) {
                        JSONObject obj = arr.getJSONObject(i);
                        String t = obj.optString("title", "Channel " + (i + 1));
                        String u = obj.optString("url", "");
                        String logo = obj.optString("logo", "");
                        String cat = obj.optString("category", "");
                        int chNum = obj.optInt("channelNumber", i + 1);
                        List<String> fbs = new ArrayList<>();
                        JSONArray fbArr = obj.optJSONArray("fallbacks");
                        if (fbArr != null) {
                            for (int j = 0; j < fbArr.length(); j++) {
                                String fb = fbArr.optString(j);
                                if (!TextUtils.isEmpty(fb)) fbs.add(fb);
                            }
                        }
                        if (!TextUtils.isEmpty(u)) {
                            liveChannelsList.add(new LiveChannelItem(t, u, fbs, logo, cat, chNum));
                        }
                    }
                }
            } catch (Exception e) {
                Log.w("PlayerActivity", "Failed to parse live channels JSON: " + e.getMessage());
            }
            currentLiveChannelIndex = (initialIndex >= 0 && initialIndex < liveChannelsList.size()) ? initialIndex : 0;
            previousLiveChannelIndex = -1;
        }
    }

    public static void clearLiveChannelsData() {
        synchronized (liveChannelsList) {
            liveChannelsList.clear();
            currentLiveChannelIndex = 0;
            previousLiveChannelIndex = -1;
        }
    }

    private LinearLayout controlsRow;
    private boolean isSafeColorMode = false;
    private int audioBoostLevel = 2; // Default to 200% loud audio for dialogue clarity
    private int currentAudioTrackIndex = 0;

    private boolean isLive = false;
    private String streamUrl = "";
    private String streamTitle = "";
    private final List<String> serverQueue = new ArrayList<>();
    private int currentServerIdx = 0;
    private boolean isWebEmbedMode = false;

    private boolean useTextureViewFallback = false;
    private boolean softwareDecoderRetryDone = false;
    // v3.10.0: web-engine (iframe/embed) load watchdog. A dead mirror or a
    // hung Cloudflare interstitial never finishes loading, so the spinner
    // used to spin forever. After WEB_LOAD_TIMEOUT_MS we fail over.
    private static final long WEB_LOAD_TIMEOUT_MS = 15000L;
    private final Runnable webLoadWatchdog = new Runnable() {
        @Override
        public void run() {
            if (!isWebEmbedMode) return;
            Log.w(TAG, "WEB_EMBED_TIMEOUT: embed taking long to load, dismissing spinner.");
            bufferSpinner.setVisibility(View.GONE);
        }
    };
    private long resumePositionMs = C.TIME_UNSET;
    private Runnable autoPlayAttemptRunnable = null;

    // ---- FREEZE DETECTION (fix): audio-plays-but-picture-frozen on Fire OS.
    // The first-frame watchdog cannot catch this because the first frame DOES
    // render — the hardware decoder just stops delivering subsequent frames.
    // We track ExoPlayer's rendered-video-buffer counter: if playback is
    // READY+playing yet the counter stops growing for FREEZE_STALL_SECONDS,
    // rebuild the pipeline with software decoding + TextureView.
    private long lastRenderedOutputBuffers = -1L;
    private int freezeStableSeconds = 0;
    private int freezeRecoveryAttempts = 0;
    // Real rendered-VIDEO-frame counter for the freeze detector. The playback
    // position clock is driven by the AUDIO pipeline, so during the reported
    // "picture frozen, sound continues" stall getCurrentPosition() keeps
    // advancing and a position-based detector never fires. We capture the
    // video renderer's DecoderCounters instance at enable-time and poll its
    // renderedOutputBufferCount — it only grows when frames actually render.
    private androidx.media3.exoplayer.DecoderCounters activeVideoCounters = null;
    private final androidx.media3.exoplayer.analytics.AnalyticsListener frameCounterListener =
            new androidx.media3.exoplayer.analytics.AnalyticsListener() {
                @Override
                public void onVideoEnabled(
                        androidx.media3.exoplayer.analytics.AnalyticsListener.EventTime eventTime,
                        androidx.media3.exoplayer.DecoderCounters counters) {
                    activeVideoCounters = counters;
                    lastRenderedOutputBuffers = -1L;
                    freezeStableSeconds = 0;
                }

                @Override
                public void onVideoDisabled(
                        androidx.media3.exoplayer.analytics.AnalyticsListener.EventTime eventTime,
                        androidx.media3.exoplayer.DecoderCounters counters) {
                    if (activeVideoCounters == counters) {
                        activeVideoCounters = null;
                    }
                }
            };
    private final boolean isFireTvDevice = detectFireTv();

    private boolean firstFrameRendered = false;
    private boolean hasVideoTrack = false;

    private final Handler uiHandler = new Handler(Looper.getMainLooper());
    private boolean isOsdVisible = true;
    private long lastWebCurrentTimeSec = 0;
    private long lastWebDurationSec = 0;

    private final Runnable hideOsdRunnable = this::hideOsd;

    private final Runnable progressRunnable = new Runnable() {
        @Override
        public void run() {
            updateProgressText();
            checkVideoFreeze();
            if (isWebEmbedMode && webVideoView != null) {
                try {
                    webVideoView.evaluateJavascript(
                        "(function(){try{var vs=document.querySelectorAll('video');for(var i=0;i<vs.length;i++){if(vs[i].duration>0&&vs[i].currentTime>0){return Math.floor(vs[i].currentTime)+':'+Math.floor(vs[i].duration);}}}catch(e){}return '';})();",
                        res -> {
                            if (res != null && res.contains(":")) {
                                String clean = res.replace("\"", "").trim();
                                String[] p = clean.split(":");
                                if (p.length == 2) {
                                    try {
                                        long c = Long.parseLong(p[0]);
                                        long d = Long.parseLong(p[1]);
                                        if (c > 0 && d > 0) {
                                            lastWebCurrentTimeSec = c;
                                            lastWebDurationSec = d;
                                            if (c > 5 && !isLive) {
                                                MainActivity.setLastNativePlayback(c, d);
                                            }
                                        }
                                    } catch (Exception ignored) {}
                                }
                            }
                        }
                    );
                } catch (Exception ignored) {}
            }
            uiHandler.postDelayed(this, 1000L);
        }
    };

    /**
     * FREEZE DETECTOR — runs once per second alongside the progress ticker.
     * If ExoPlayer reports READY + playing but the count of rendered video
     * buffers hasn't increased for several consecutive seconds, the hardware
     * decoder has stalled (audio renderer is a separate pipeline, which is why
     * sound keeps going). Recovery: rebuild with software decode + TextureView,
     * or fail over to the next mirror if that was already tried.
     */
    private void checkVideoFreeze() {
        if (player == null || isWebEmbedMode || !firstFrameRendered) return;
        if (player.getPlaybackState() != Player.STATE_READY || !player.isPlaying()) {
            freezeStableSeconds = 0;
            lastRenderedOutputBuffers = -1L;
            return;
        }

        androidx.media3.exoplayer.DecoderCounters counters = activeVideoCounters;
        long rendered = counters != null ? counters.renderedOutputBufferCount : -1L;
        if (counters == null || rendered == 0) {
            // No video renderer yet, OR decoder attached but first frame not
            // rendered yet (normal on channel start: manifest fetch + codec
            // init can take several seconds). v3.8.2: grace period — do NOT
            // accumulate stall time before the first frame, otherwise the
            // detector fires "Fixing video playback..." a second into every
            // live stream and needlessly rebuilds the pipeline.
            freezeStableSeconds = 0;
            lastRenderedOutputBuffers = -1L;
            return;
        }
        if (lastRenderedOutputBuffers >= 0 && rendered == lastRenderedOutputBuffers) {
            freezeStableSeconds++;
        } else {
            freezeStableSeconds = 0;
            lastRenderedOutputBuffers = rendered;
        }

        if (isLive) {
            // Live HLS streams: do not tear down the pipeline.
            // If stalled for 5 seconds, gently re-sync to the live edge and re-prepare.
            if (freezeStableSeconds >= 5) {
                freezeStableSeconds = 0;
                Log.w(TAG, "LIVE_STREAM_STALL: resyncing to live broadcast edge.");
                try {
                    if (player != null) {
                        player.seekToDefaultPosition();
                        player.prepare();
                        player.play();
                    }
                } catch (Exception ignored) {}
            }
            return;
        }

        // VOD streams: Video-frame counter frozen for FREEZE_STALL_SECONDS while state says "playing"
        if (freezeStableSeconds >= FREEZE_STALL_SECONDS && freezeRecoveryAttempts < MAX_FREEZE_RECOVERY_ATTEMPTS) {
            freezeRecoveryAttempts++;
            freezeStableSeconds = 0;
            Log.w(TAG, "VIDEO_FREEZE_DETECTED (attempt " + freezeRecoveryAttempts + "/"
                    + MAX_FREEZE_RECOVERY_ATTEMPTS + "): decoder stalled while playing.");
            Toast.makeText(this, "Optimizing playback stream...", Toast.LENGTH_SHORT).show();
            resumePositionMs = player.getCurrentPosition();
            showOsd();
            initializeExoPlayer();
        } else if (freezeStableSeconds >= FREEZE_STALL_SECONDS) {
            // Video freeze persists after recovery — failover to next mirror.
            Log.w(TAG, "VIDEO_FREEZE persists after recovery. Failing over to next mirror.");
            freezeStableSeconds = 0;
            failoverToNextServer();
        }
    }
    private static boolean detectFireTv() {
        try {
            String manufacturer = String.valueOf(android.os.Build.MANUFACTURER).toLowerCase(java.util.Locale.US);
            String model = String.valueOf(android.os.Build.MODEL).toLowerCase(java.util.Locale.US);
            return manufacturer.contains("amazon") || model.contains("aft") || model.contains("fire");
        } catch (Exception e) {
            return false;
        }
    }

    private final Runnable firstFrameWatchdog = new Runnable() {
        @Override
        public void run() {
            if (firstFrameRendered || isWebEmbedMode) return;

            Log.w(TAG, "NO_FIRST_FRAME after " + FIRST_FRAME_TIMEOUT_MS
                    + "ms on server " + (currentServerIdx + 1) + "/" + serverQueue.size());

            if (isLive) {
                // For live channels, re-sync to live edge once before any failover
                if (player != null) {
                    try {
                        player.seekToDefaultPosition();
                        player.prepare();
                    } catch (Exception ignored) {}
                }
                return;
            }

            if (currentServerIdx + 1 < serverQueue.size()) {
                failoverToNextServer();
            } else if (!softwareDecoderRetryDone && hasVideoTrack) {
                softwareDecoderRetryDone = true;
                useTextureViewFallback = true;
                resumePositionMs = isLive ? C.TIME_UNSET : (player != null ? player.getCurrentPosition() : C.TIME_UNSET);
                Toast.makeText(PlayerActivity.this,
                        "Optimizing live video stream...",
                        Toast.LENGTH_SHORT).show();
                showOsd();
                initializeExoPlayer();
            }
        }
    };

    // ---------------------------------------------------------------- lifecycle

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        activeInstance = this;

        try {
            getWindow().setFlags(
                    WindowManager.LayoutParams.FLAG_FULLSCREEN | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
                    WindowManager.LayoutParams.FLAG_FULLSCREEN | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED);

            parseIntentData(getIntent());
            loadFavoriteChannels();

            if (serverQueue.isEmpty()) {
                Toast.makeText(this, "No video URL provided", Toast.LENGTH_SHORT).show();
                finish();
                return;
            }

            setContentView(buildUi());
            enableImmersiveMode();
            playCurrentStream();
            showOsd();
        } catch (Throwable t) {
            Log.e(TAG, "Fatal error in PlayerActivity.onCreate: ", t);
            Toast.makeText(this, "Playback launch error: " + t.getMessage(), Toast.LENGTH_LONG).show();
            finish();
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent == null) return;
        setIntent(intent);

        parseIntentData(intent);
        if (serverQueue.isEmpty()) return;

        softwareDecoderRetryDone = false;
        resumePositionMs = C.TIME_UNSET;
        freezeRecoveryAttempts = 0;

        applyStreamMetadataToUi();
        playCurrentStream();
        showOsd();
    }

    private void parseIntentData(Intent intent) {
        if (intent == null) return;
        String url = intent.getStringExtra("url");
        streamTitle = intent.getStringExtra("title");
        isLive = intent.getBooleanExtra("isLive", false);

        if (intent.hasExtra("channelIndex")) {
            int chIdx = intent.getIntExtra("channelIndex", currentLiveChannelIndex);
            synchronized (liveChannelsList) {
                if (chIdx >= 0 && chIdx < liveChannelsList.size()) {
                    currentLiveChannelIndex = chIdx;
                }
            }
        }

        if (TextUtils.isEmpty(streamTitle)) {
            streamTitle = isLive ? "Live Channel" : "Video Stream";
        }

        serverQueue.clear();
        currentServerIdx = 0;
        if (!TextUtils.isEmpty(url)) {
            serverQueue.add(url);
        }

        String fallbacksJson = intent.getStringExtra("fallbacks");
        if (!TextUtils.isEmpty(fallbacksJson)) {
            try {
                JSONArray arr = new JSONArray(fallbacksJson);
                for (int i = 0; i < arr.length(); i++) {
                    String u = arr.optString(i);
                    if (!TextUtils.isEmpty(u) && !serverQueue.contains(u)) {
                        serverQueue.add(u);
                    }
                }
            } catch (Exception e) {
                Log.w(TAG, "Failed parsing fallbacks: " + e.getMessage());
            }
        }

        synchronized (liveChannelsList) {
            if (isLive && !liveChannelsList.isEmpty() && currentLiveChannelIndex >= 0 && currentLiveChannelIndex < liveChannelsList.size()) {
                LiveChannelItem item = liveChannelsList.get(currentLiveChannelIndex);
                if (!TextUtils.isEmpty(item.title)) {
                    streamTitle = item.title;
                }
                if (serverQueue.isEmpty() && !TextUtils.isEmpty(item.url)) {
                    serverQueue.add(item.url);
                }
                if (item.fallbacks != null) {
                    for (String fb : item.fallbacks) {
                        if (!serverQueue.contains(fb)) serverQueue.add(fb);
                    }
                }
            }
        }

        long startPos = intent.getLongExtra("startPositionMs", 0L);
        if (startPos > 0 && !isLive) {
            resumePositionMs = startPos;
        }

        if (!serverQueue.isEmpty()) {
            streamUrl = serverQueue.get(0);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && isInPictureInPictureMode()) {
            // Keep playing without pausing in PiP mode
            return;
        }
        if (player != null && !isWebEmbedMode) {
            long curPos = player.getCurrentPosition();
            long dur = player.getDuration();
            if (curPos > 5000 && dur > 0 && !isLive) {
                MainActivity.setLastNativePlayback(curPos / 1000, dur / 1000);
            }
            resumePositionMs = isLive ? C.TIME_UNSET : curPos;
            player.setPlayWhenReady(false);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Resume playback if the player is still alive (onStop wasn't called).
        // If onStop DID run, onStart rebuilt the player and set playWhenReady.
        if (player != null && !isWebEmbedMode && !player.isPlaying()
                && player.getPlaybackState() != Player.STATE_ENDED) {
            player.setPlayWhenReady(true);
        }
    }

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            boolean isPlaying = (player != null && player.isPlaying()) || isWebEmbedMode;
            if (isPlaying && getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)) {
                enterPipMode();
            }
        }
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        if (isInPictureInPictureMode) {
            if (osdOverlay != null) osdOverlay.setVisibility(View.GONE);
            if (channelBannerView != null) channelBannerView.setVisibility(View.GONE);
            if (channelDrawerLayout != null) channelDrawerLayout.setVisibility(View.GONE);
            if (bufferSpinner != null) bufferSpinner.setVisibility(View.GONE);
            if (numberInputOverlayView != null) numberInputOverlayView.setVisibility(View.GONE);
        } else {
            if (player != null && !player.isPlaying() && !isWebEmbedMode) {
                showOsd();
            }
        }
    }

    private void saveLastPlaybackPosition() {
        if (player != null && !isLive) {
            long curPos = player.getCurrentPosition();
            long dur = player.getDuration();
            if (curPos > 5000 && dur > 0) {
                MainActivity.setLastNativePlayback(curPos / 1000, dur / 1000);
            }
        } else if (isWebEmbedMode && lastWebCurrentTimeSec > 5 && lastWebDurationSec > 0 && !isLive) {
            MainActivity.setLastNativePlayback(lastWebCurrentTimeSec, lastWebDurationSec);
        }
    }

    @Override
    protected void onStop() {
        super.onStop();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && isInPictureInPictureMode()) {
            return;
        }
        saveLastPlaybackPosition();
        if (player != null && !isLive) {
            resumePositionMs = player.getCurrentPosition();
        }
        uiHandler.removeCallbacks(progressRunnable);
        uiHandler.removeCallbacks(firstFrameWatchdog);
        releasePlayer();
    }

    @Override
    protected void onStart() {
        super.onStart();
        if (!isWebEmbedMode && player == null && !TextUtils.isEmpty(streamUrl)) {
            initializeExoPlayer();
            showOsd();
        } else if (player != null && !player.isPlaying()
                && player.getPlaybackState() != Player.STATE_ENDED) {
            player.setPlayWhenReady(true);
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (activeInstance == this) activeInstance = null;
        saveLastPlaybackPosition();
        uiHandler.removeCallbacksAndMessages(null);
        if (autoPlayAttemptRunnable != null) {
            uiHandler.removeCallbacks(autoPlayAttemptRunnable);
            autoPlayAttemptRunnable = null;
        }
        releasePlayer();
        uiHandler.removeCallbacks(webLoadWatchdog);
        if (webVideoView != null) {
            try {
                webVideoView.stopLoading();
                webVideoView.loadUrl("about:blank");
                webVideoView.destroy();
            } catch (Exception ignored) {}
            webVideoView = null;
        }
    }

    // ------------------------------------------------------------------- the UI

    private boolean ensureWebVideoView() {
        if (webVideoView != null) return true;
        try {
            webVideoView = new WebView(this);
            webVideoView.setLayoutParams(new RelativeLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            webVideoView.setBackgroundColor(Color.BLACK);
            webVideoView.setVisibility(View.GONE);

            WebSettings ws = webVideoView.getSettings();
            ws.setJavaScriptEnabled(true);
            ws.setDomStorageEnabled(true);
            ws.setDatabaseEnabled(true);
            ws.setAllowFileAccess(true);
            ws.setAllowContentAccess(true);
            ws.setAllowFileAccessFromFileURLs(true);
            ws.setAllowUniversalAccessFromFileURLs(true);
            ws.setLoadWithOverviewMode(true);
            ws.setUseWideViewPort(true);
            ws.setMediaPlaybackRequiresUserGesture(false);
            ws.setUserAgentString(USER_AGENT);

            try {
                android.webkit.CookieManager cm = android.webkit.CookieManager.getInstance();
                cm.setAcceptCookie(true);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    cm.setAcceptThirdPartyCookies(webVideoView, true);
                }
            } catch (Exception ignored) {}
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                ws.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            }

            webVideoView.setWebViewClient(new WebViewClient() {
                private final String[] AD_DOMAINS = {
                    "doubleclick.net", "googlesyndication.com", "googleadservices.com",
                    "popads.net", "popcash.net", "popunder.net", "juicyads.com",
                    "exoclick.com", "exosrv.com", "adsterra.com", "monetag.com",
                    "propellerads.com", "disableSelection", "adskeeper.co.uk",
                    "adcash.com", "hilltopads.net", "trafficjunky.com",
                    "pushno.com", "clksite.com", "betterads.org",
                    "a-ads.com", "revenuecpmnetwork.com", "adf.ly",
                    "richpush.co", "ero-advertising.com", "clickadu.com",
                    "cpm.bz", "bongacash.com", "tsyndicate.com",
                    "bidvertiser.com", "ad-maven.com", "admaven.com",
                    "realsrv.com", "onclicka.com", "onclicksuper.com",
                    "sssmaster.com", "sureads.com", "adserverplus.com"
                };

                private boolean isAdUrl(String url) {
                    if (url == null) return false;
                    String lower = url.toLowerCase(java.util.Locale.US);
                    for (String domain : AD_DOMAINS) {
                        if (lower.contains(domain)) return true;
                    }
                    if (lower.contains("/popunder") || lower.contains("/pop_under")
                            || lower.contains("/clickunder") || lower.contains("/adserve")
                            || lower.contains("ads.php") || lower.contains("/ad/click")
                            || lower.contains("track.php?")) {
                        return true;
                    }
                    return false;
                }

                @Override
                public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {
                    if (request == null || request.getUrl() == null) return false;
                    if (!request.isForMainFrame()) {
                        return false;
                    }
                    return shouldOverrideUrlLoading(view, request.getUrl().toString());
                }

                @Override
                public boolean shouldOverrideUrlLoading(WebView view, String url) {
                    if (url == null) return true;
                    if (!url.startsWith("http://") && !url.startsWith("https://")) {
                        return true;
                    }
                    if (isAdUrl(url)) {
                        Log.d(TAG, "AD_BLOCK: blocked navigation to " + url);
                        return true;
                    }
                    return false;
                }

                @Override
                public android.webkit.WebResourceResponse shouldInterceptRequest(
                        WebView view, android.webkit.WebResourceRequest request) {
                    String url = request.getUrl() != null ? request.getUrl().toString() : "";
                    if (isAdUrl(url)) {
                        Log.d(TAG, "AD_BLOCK: blocked resource " + url);
                        return new android.webkit.WebResourceResponse(
                                "text/plain", "utf-8",
                                new java.io.ByteArrayInputStream(new byte[0]));
                    }
                    return super.shouldInterceptRequest(view, request);
                }

                @Override
                public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                    handler.proceed();
                }

                @Override
                public void onReceivedError(WebView view, android.webkit.WebResourceRequest request, android.webkit.WebResourceError error) {
                    if (request != null && !request.isForMainFrame()) return;
                    uiHandler.removeCallbacks(webLoadWatchdog);
                    Log.w(TAG, "Web video onReceivedError (main frame): " + (error != null ? error.getDescription() : "unknown"));
                }

                @Override
                public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                    if (failingUrl != null && view.getUrl() != null && !failingUrl.equals(view.getUrl())) {
                        return;
                    }
                    uiHandler.removeCallbacks(webLoadWatchdog);
                    Log.w(TAG, "Web video onReceivedError (" + errorCode + "): " + description);
                }

                @Override
                public void onPageFinished(WebView view, String url) {
                    uiHandler.removeCallbacks(webLoadWatchdog);
                    bufferSpinner.setVisibility(View.GONE);

                    String adHideCss =
                            "[class*='pop'],[id*='pop'],[class*='overlay-ad'],"
                            + "[class*='ad-overlay'],[id*='ad-overlay'],"
                            + "[class*='banner-ad'],[id*='banner'],"
                            + "div[onclick*='window.open'],a[target='_blank'][onclick],"
                            + "iframe[src*='ads'],iframe[src*='pop'],"
                            + "[class*='close-btn-ad'],[class*='adcontainer'],"
                            + "div[style*='z-index: 99999'],div[style*='z-index:99999'],"
                            + "div[style*='z-index: 999999'],div[style*='z-index:999999'] {"
                            + "  display:none!important;visibility:hidden!important;"
                            + "  pointer-events:none!important;opacity:0!important;"
                            + "  width:0!important;height:0!important;"
                            + "}"
                            + "video {"
                            + "  background:#000!important;"
                            + "  image-rendering:auto!important;"
                            + "}";
                    view.evaluateJavascript(
                            "(function(){var s=document.createElement('style');"
                            + "s.textContent='" + adHideCss.replace("'", "\\'") + "';"
                            + "document.head.appendChild(s);"
                            + "window.open=function(){return null;};"
                            + "window.alert=function(){};"
                            + "window.confirm=function(){return true;};"
                            + "window.prompt=function(){return null;};"
                            + "window.onbeforeunload=null;"
                            + "try{"
                            + "  var allV=document.querySelectorAll('video,audio');"
                            + "  for(var i=0;i<allV.length;i++){ allV[i].muted=false; allV[i].defaultMuted=false; allV[i].volume=1.0; }"
                            + "}catch(e){}"
                            + "})();", null);

                    unmuteWebVideo(false);

                    view.evaluateJavascript(
                            "(function(){"
                            + "try{"
                            + "  if(window.ppl && typeof window.ppl.api === 'function'){ window.ppl.api('play'); }"
                            + "  if(window.player && typeof window.player.api === 'function'){ window.player.api('play'); }"
                            + "  var v=document.querySelector('video'); if(v){ v.muted=false; v.defaultMuted=false; v.volume=1.0; v.play(); }"
                            + "  var btn=document.querySelector('.play,.play-btn,.jw-display-icon-container,[aria-label=\"Play\"],.vjs-big-play-button,.plyr__control--overlaid,button.play-button,pjsdiv,.jw-icon-display'); if(btn){btn.click();}"
                            + "}catch(e){}"
                            + "return 'OK';"
                            + "})();", null);

                    if (autoPlayAttemptRunnable != null) {
                        uiHandler.removeCallbacks(autoPlayAttemptRunnable);
                    }
                    autoPlayAttemptRunnable = new Runnable() {
                        int attempts = 0;
                        @Override
                        public void run() {
                            if (!isWebEmbedMode || webVideoView == null) return;
                            webVideoView.evaluateJavascript(
                                "(function(){"
                                + "try{"
                                + "  var vs=document.querySelectorAll('video');"
                                + "  for(var i=0;i<vs.length;i++){"
                                + "    try{ vs[i].muted=false; vs[i].defaultMuted=false; vs[i].volume=1.0; if(vs[i].paused){ vs[i].play(); } }catch(e){}"
                                + "  }"
                                + "  var selectors=['.play','.play-btn','.jw-display-icon-container',"
                                + "    '[aria-label=\"Play\"]','.vjs-big-play-button','.plyr__control--overlaid',"
                                + "    'button.play-button','.jw-icon-display','.jw-controlbar .jw-icon-playback',"
                                + "    '.video-js .vjs-play-control','.fp-play','.mejs__play button',"
                                + "    '[data-plyr=\"play\"]','button[title=\"Play\"]','button[aria-label=\"play\"]',"
                                + "    '.btn-play','.play-icon','.player-play','div[class*=\"play\"]','div[id*=\"play\"]'];"
                                + "  for(var i=0;i<selectors.length;i++){"
                                + "    var btns=document.querySelectorAll(selectors[i]);"
                                + "    for(var j=0;j<btns.length;j++){"
                                + "      try{ btns[j].click(); }catch(e){}"
                                + "    }"
                                + "  }"
                                + "  if(typeof jwplayer==='function'){ try{jwplayer().play(); jwplayer().setMute(false);}catch(e){} }"
                                + "  if(typeof videojs==='function'){ try{var vjsEl=document.querySelector('.video-js'); if(vjsEl){var p=videojs(vjsEl); p.play(); p.muted(false);} }catch(e){} }"
                                + "  if(window.player && typeof window.player.play==='function'){ window.player.play(); }"
                                + "  if(window.ppl && typeof window.ppl.api==='function'){ window.ppl.api('play'); }"
                                + "  var ce=new MouseEvent('click',{bubbles:true,cancelable:true,clientX:window.innerWidth/2,clientY:window.innerHeight/2});"
                                + "  var el=document.elementFromPoint(window.innerWidth/2,window.innerHeight/2);"
                                + "  if(el && el.tagName!=='A'){ el.dispatchEvent(ce); }"
                                + "}catch(e){}"
                                + "return 'OK';"
                                + "})();", null);
                            attempts++;
                            if (attempts % 2 == 1) {
                                unmuteWebVideo(false);
                            }
                            if (attempts < 12) {
                                uiHandler.postDelayed(this, 500L);
                            }
                        }
                    };
                    uiHandler.postDelayed(autoPlayAttemptRunnable, 400L);

                    view.evaluateJavascript(
                            "(function(){"
                            + "try{"
                            + "  var obs=new MutationObserver(function(muts){"
                            + "    var v=document.querySelector('video');"
                            + "    if(v && v.paused){ v.muted=false; v.play(); }"
                            + "    var btn=document.querySelector('.jw-display-icon-container,.vjs-big-play-button,.plyr__control--overlaid,.jw-icon-display');"
                            + "    if(btn){ btn.click(); obs.disconnect(); }"
                            + "  });"
                            + "  obs.observe(document.body,{childList:true,subtree:true});"
                            + "  setTimeout(function(){obs.disconnect();},15000);"
                            + "}catch(e){}"
                            + "})();", null);
                }
            });

            webVideoView.setWebChromeClient(new WebChromeClient() {
                @Override
                public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, android.os.Message resultMsg) {
                    Log.d(TAG, "AD_BLOCK: blocked popup window creation");
                    return false;
                }
            });

            if (rootLayout != null) {
                rootLayout.addView(webVideoView, 0);
            }
            return true;
        } catch (Throwable t) {
            Log.e(TAG, "Failed to initialize webVideoView: ", t);
            webVideoView = null;
            return false;
        }
    }

    private View buildUi() {
        RelativeLayout root = new RelativeLayout(this);
        root.setLayoutParams(new RelativeLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        rootLayout = root;

        // 2. Hardware Video ExoPlayer Surface
        RelativeLayout.LayoutParams fill = new RelativeLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        fill.addRule(RelativeLayout.CENTER_IN_PARENT);

        aspectRatioFrameLayout = new AspectRatioFrameLayout(this);
        aspectRatioFrameLayout.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FIT);
        aspectRatioFrameLayout.setLayoutParams(fill);

        // ---- ZOOM MODES (new): D-pad long-press-up or PROG keys cycle
        // Fit → Zoom → Stretch → Fill → 16:9 → back to Fit.
        currentResizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT;

        surfaceView = new SurfaceView(this);
        FrameLayout.LayoutParams surfaceParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.CENTER);
        surfaceView.setLayoutParams(surfaceParams);
        aspectRatioFrameLayout.addView(surfaceView);

        textureView = new TextureView(this);
        textureView.setOpaque(true);
        textureView.setVisibility(View.GONE);
        textureView.setLayoutParams(surfaceParams);
        aspectRatioFrameLayout.addView(textureView);

        root.addView(aspectRatioFrameLayout);

        // 3. Buffer Spinner
        bufferSpinner = new ProgressBar(this);
        bufferSpinner.setIndeterminate(true);
        RelativeLayout.LayoutParams spinnerParams = new RelativeLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        spinnerParams.addRule(RelativeLayout.CENTER_IN_PARENT);
        bufferSpinner.setLayoutParams(spinnerParams);
        root.addView(bufferSpinner);

        // 4. OSD Overlay
        osdOverlay = new RelativeLayout(this);
        osdOverlay.setLayoutParams(new RelativeLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        osdOverlay.setBackgroundColor(Color.TRANSPARENT);
        osdOverlay.setClickable(false);
        osdOverlay.setFocusable(false);

        LinearLayout topBar = new LinearLayout(this);
        topBar.setOrientation(LinearLayout.HORIZONTAL);
        topBar.setGravity(Gravity.CENTER_VERTICAL);
        topBar.setPadding(48, 36, 48, 48);
        topBar.setBackground(new GradientDrawable(
                GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{Color.parseColor("#CC000000"), Color.TRANSPARENT}));
        RelativeLayout.LayoutParams topParams = new RelativeLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        topParams.addRule(RelativeLayout.ALIGN_PARENT_TOP);
        topBar.setLayoutParams(topParams);

        statusBadge = new TextView(this);
        statusBadge.setTextColor(Color.BLACK);
        statusBadge.setTextSize(14);
        statusBadge.setTypeface(Typeface.DEFAULT_BOLD);
        statusBadge.setPadding(16, 6, 16, 6);
        topBar.addView(statusBadge);

        titleView = new TextView(this);
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(22);
        titleView.setTypeface(Typeface.DEFAULT_BOLD);
        titleView.setSingleLine(true);
        titleView.setEllipsize(TextUtils.TruncateAt.END);
        titleView.setPadding(24, 0, 0, 0);
        topBar.addView(titleView);

        osdOverlay.addView(topBar);

        LinearLayout bottomBar = new LinearLayout(this);
        bottomBar.setOrientation(LinearLayout.VERTICAL);
        bottomBar.setPadding(48, 48, 48, 36);
        bottomBar.setBackground(new GradientDrawable(
                GradientDrawable.Orientation.BOTTOM_TOP,
                new int[]{Color.parseColor("#EE000000"), Color.parseColor("#CC000000"), Color.TRANSPARENT}));
        RelativeLayout.LayoutParams bottomParams = new RelativeLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        bottomParams.addRule(RelativeLayout.ALIGN_PARENT_BOTTOM);
        bottomBar.setLayoutParams(bottomParams);

        timeView = new TextView(this);
        timeView.setTextColor(Color.parseColor("#cbd5e1"));
        timeView.setTextSize(16);
        timeView.setTypeface(Typeface.DEFAULT_BOLD);
        bottomBar.addView(timeView);

        // TV Remote Focusable Controls Row
        HorizontalScrollView hsv = new HorizontalScrollView(this);
        hsv.setHorizontalScrollBarEnabled(false);
        hsv.setOverScrollMode(View.OVER_SCROLL_NEVER);
        LinearLayout.LayoutParams hsvParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        hsvParams.setMargins(0, 16, 0, 12);
        hsv.setLayoutParams(hsvParams);

        controlsRow = new LinearLayout(this);
        controlsRow.setOrientation(LinearLayout.HORIZONTAL);
        controlsRow.setGravity(Gravity.CENTER_VERTICAL);
        controlsRow.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        btnPlayPause = createTvButton("⏸ Pause", v -> togglePlayPause());
        btnUnmute = createTvButton("🔊 Unmute", v -> unmuteWebVideo(true));
        btnRewind = createTvButton("↺ -10s", v -> seekRelative(-SEEK_STEP_MS));
        btnForward = createTvButton("↻ +10s", v -> seekRelative(SEEK_STEP_MS));
        if (isLive) {
            btnChannelDrawer = createTvButton("☰ Channels", v -> showChannelDrawer());
            btnPrevChannel = createTvButton("▲ Prev Ch", v -> switchLiveChannel(-1));
            btnNextChannel = createTvButton("▼ Next Ch", v -> switchLiveChannel(1));
            btnRecallChannel = createTvButton("⟲ Last Ch", v -> recallPreviousChannel());
            btnFavoriteChannel = createTvButton(isCurrentChannelFavorite() ? "★ Favorited" : "⭐ Favorite", v -> toggleCurrentChannelFavorite());
        }
        btnServer = createTvButton("⚡ Server 1", v -> switchServerNext());
        btnFit = createTvButton("⛶ Fit: Fit", v -> cycleZoomMode());
        btnPip = createTvButton("🔲 PiP", v -> enterPipMode());
        btnAudioBoost = createTvButton("🔊 Audio: 200%", v -> cycleAudioBoost());
        btnAudioTrack = createTvButton("🌐 Audio: Auto", v -> cycleAudioTrack());
        btnSafeColor = createTvButton("🎨 Safe Color: OFF", v -> toggleSafeColorMode());
        btnBack = createTvButton("← Exit Player", v -> exitPlayer());

        controlsRow.addView(btnPlayPause);
        controlsRow.addView(btnUnmute);
        if (!isLive) {
            controlsRow.addView(btnRewind);
            controlsRow.addView(btnForward);
        } else {
            controlsRow.addView(btnChannelDrawer);
            controlsRow.addView(btnPrevChannel);
            controlsRow.addView(btnNextChannel);
            controlsRow.addView(btnRecallChannel);
            controlsRow.addView(btnFavoriteChannel);
        }
        controlsRow.addView(btnServer);
        controlsRow.addView(btnFit);
        controlsRow.addView(btnPip);
        controlsRow.addView(btnAudioBoost);
        controlsRow.addView(btnAudioTrack);
        controlsRow.addView(btnSafeColor);
        controlsRow.addView(btnBack);

        hsv.addView(controlsRow);
        bottomBar.addView(hsv);

        hintView = new TextView(this);
        hintView.setTextColor(Color.parseColor("#94a3b8"));
        hintView.setTextSize(13);
        hintView.setPadding(0, 4, 0, 0);
        bottomBar.addView(hintView);

        osdOverlay.addView(bottomBar);
        root.addView(osdOverlay);

        // 5. Channel Zap Banner HUD (Floating glassmorphic TV channel info card)
        channelBannerView = new LinearLayout(this);
        channelBannerView.setOrientation(LinearLayout.VERTICAL);
        channelBannerView.setPadding(36, 24, 36, 24);

        GradientDrawable bannerBg = new GradientDrawable();
        bannerBg.setCornerRadius(20);
        bannerBg.setColor(Color.parseColor("#E60B132B")); // Deep premium navy glass
        bannerBg.setStroke(2, Color.parseColor("#38BDF8")); // Cyan border highlight
        channelBannerView.setBackground(bannerBg);
        channelBannerView.setElevation(16f);
        channelBannerView.setVisibility(View.GONE);
        channelBannerView.setClickable(false);
        channelBannerView.setFocusable(false);

        RelativeLayout.LayoutParams bannerParams = new RelativeLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        bannerParams.addRule(RelativeLayout.ALIGN_PARENT_TOP);
        bannerParams.addRule(RelativeLayout.ALIGN_PARENT_LEFT);
        bannerParams.setMargins(48, 48, 0, 0);
        channelBannerView.setLayoutParams(bannerParams);

        // Header Row: CH number badge + Category pill + Counter
        LinearLayout bannerHeader = new LinearLayout(this);
        bannerHeader.setOrientation(LinearLayout.HORIZONTAL);
        bannerHeader.setGravity(Gravity.CENTER_VERTICAL);

        bannerChannelNumber = new TextView(this);
        bannerChannelNumber.setTextColor(Color.parseColor("#0F172A"));
        bannerChannelNumber.setTextSize(14);
        bannerChannelNumber.setTypeface(Typeface.DEFAULT_BOLD);
        bannerChannelNumber.setPadding(16, 6, 16, 6);
        GradientDrawable chNumBg = new GradientDrawable();
        chNumBg.setCornerRadius(10);
        chNumBg.setColor(Color.parseColor("#38BDF8")); // Electric Cyan
        bannerChannelNumber.setBackground(chNumBg);
        bannerHeader.addView(bannerChannelNumber);

        bannerCategory = new TextView(this);
        bannerCategory.setTextColor(Color.parseColor("#94A3B8"));
        bannerCategory.setTextSize(13);
        bannerCategory.setTypeface(Typeface.DEFAULT_BOLD);
        bannerCategory.setPadding(20, 0, 0, 0);
        bannerHeader.addView(bannerCategory);

        bannerCounter = new TextView(this);
        bannerCounter.setTextColor(Color.parseColor("#64748B"));
        bannerCounter.setTextSize(13);
        bannerCounter.setPadding(24, 0, 0, 0);
        bannerHeader.addView(bannerCounter);

        channelBannerView.addView(bannerHeader);

        // Channel Title
        bannerChannelTitle = new TextView(this);
        bannerChannelTitle.setTextColor(Color.WHITE);
        bannerChannelTitle.setTextSize(24);
        bannerChannelTitle.setTypeface(Typeface.DEFAULT_BOLD);
        bannerChannelTitle.setSingleLine(true);
        bannerChannelTitle.setEllipsize(TextUtils.TruncateAt.END);
        bannerChannelTitle.setPadding(0, 14, 0, 6);
        channelBannerView.addView(bannerChannelTitle);

        // Zap Hint
        bannerHint = new TextView(this);
        bannerHint.setTextColor(Color.parseColor("#38BDF8"));
        bannerHint.setTextSize(12);
        bannerHint.setText("▲ / ▼ Channel Switcher  •  [OK] Controls");
        channelBannerView.addView(bannerHint);

        root.addView(channelBannerView);

        // 6. Direct Number Tuning Overlay
        numberInputOverlayView = new TextView(this);
        numberInputOverlayView.setTextColor(Color.WHITE);
        numberInputOverlayView.setTextSize(28);
        numberInputOverlayView.setTypeface(Typeface.DEFAULT_BOLD);
        numberInputOverlayView.setPadding(32, 20, 32, 20);
        GradientDrawable numBg = new GradientDrawable();
        numBg.setCornerRadius(16);
        numBg.setColor(Color.parseColor("#D90284C7"));
        numberInputOverlayView.setBackground(numBg);
        numberInputOverlayView.setElevation(20f);
        numberInputOverlayView.setVisibility(View.GONE);
        numberInputOverlayView.setClickable(false);
        numberInputOverlayView.setFocusable(false);

        RelativeLayout.LayoutParams numParams = new RelativeLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        numParams.addRule(RelativeLayout.ALIGN_PARENT_TOP);
        numParams.addRule(RelativeLayout.ALIGN_PARENT_RIGHT);
        numParams.setMargins(0, 48, 48, 0);
        numberInputOverlayView.setLayoutParams(numParams);

        root.addView(numberInputOverlayView);

        // 7. Quick Channel Guide Side Drawer
        channelDrawerLayout = new RelativeLayout(this);
        int drawerWidthPx = (int) (340 * getResources().getDisplayMetrics().density);
        RelativeLayout.LayoutParams drawerParams = new RelativeLayout.LayoutParams(
                drawerWidthPx, ViewGroup.LayoutParams.MATCH_PARENT);
        drawerParams.addRule(RelativeLayout.ALIGN_PARENT_LEFT);
        channelDrawerLayout.setLayoutParams(drawerParams);

        GradientDrawable drawerBg = new GradientDrawable();
        drawerBg.setColor(Color.parseColor("#F2070D1A"));
        drawerBg.setCornerRadii(new float[]{0, 0, 24, 24, 24, 24, 0, 0});
        drawerBg.setStroke(2, Color.parseColor("#1E293B"));
        channelDrawerLayout.setBackground(drawerBg);
        channelDrawerLayout.setElevation(24f);
        channelDrawerLayout.setPadding(28, 36, 20, 32);
        channelDrawerLayout.setVisibility(View.GONE);

        LinearLayout drawerContent = new LinearLayout(this);
        drawerContent.setOrientation(LinearLayout.VERTICAL);
        drawerContent.setLayoutParams(new RelativeLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // Drawer Header
        LinearLayout drawerHeader = new LinearLayout(this);
        drawerHeader.setOrientation(LinearLayout.VERTICAL);
        drawerHeader.setPadding(0, 0, 0, 16);

        TextView drawerTitle = new TextView(this);
        drawerTitle.setText("📺 Channel Guide");
        drawerTitle.setTextColor(Color.WHITE);
        drawerTitle.setTextSize(20);
        drawerTitle.setTypeface(Typeface.DEFAULT_BOLD);
        drawerHeader.addView(drawerTitle);

        TextView drawerSub = new TextView(this);
        drawerSub.setText("Press [OK] to Tune • [▶] / [Back] to Close");
        drawerSub.setTextColor(Color.parseColor("#64748B"));
        drawerSub.setTextSize(12);
        drawerSub.setPadding(0, 4, 0, 12);
        drawerHeader.addView(drawerSub);

        drawerFilterBtn = createTvButton("Filter: All Channels", v -> toggleDrawerFavoritesFilter());
        drawerFilterBtn.setTextSize(12);
        drawerFilterBtn.setPadding(16, 8, 16, 8);
        drawerHeader.addView(drawerFilterBtn);

        drawerContent.addView(drawerHeader);

        // Scrollable channel list
        ScrollView channelScrollView = new ScrollView(this);
        channelScrollView.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        channelScrollView.setVerticalScrollBarEnabled(false);

        channelListContainer = new LinearLayout(this);
        channelListContainer.setOrientation(LinearLayout.VERTICAL);
        channelListContainer.setLayoutParams(new ScrollView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        channelScrollView.addView(channelListContainer);
        drawerContent.addView(channelScrollView);
        channelDrawerLayout.addView(drawerContent);

        root.addView(channelDrawerLayout);

        applyStreamMetadataToUi();
        updateControlButtons();
        return root;
    }

    private TextView createTvButton(String text, View.OnClickListener onClick) {
        TextView btn = new TextView(this);
        btn.setText(text);
        btn.setTextColor(Color.WHITE);
        btn.setTextSize(14);
        btn.setTypeface(Typeface.DEFAULT_BOLD);
        btn.setGravity(Gravity.CENTER);
        btn.setFocusable(true);
        btn.setFocusableInTouchMode(true);
        btn.setClickable(true);
        btn.setPadding(26, 14, 26, 14);

        GradientDrawable normalBg = new GradientDrawable();
        normalBg.setColor(Color.parseColor("#441e293b"));
        normalBg.setCornerRadius(14);
        normalBg.setStroke(2, Color.parseColor("#44ffffff"));

        GradientDrawable focusedBg = new GradientDrawable();
        focusedBg.setColor(Color.parseColor("#38bdf8"));
        focusedBg.setCornerRadius(14);
        focusedBg.setStroke(3, Color.WHITE);

        btn.setBackground(normalBg);
        btn.setOnFocusChangeListener((v, hasFocus) -> {
            if (hasFocus) {
                btn.setBackground(focusedBg);
                btn.setTextColor(Color.BLACK);
                btn.animate().scaleX(1.06f).scaleY(1.06f).setDuration(120).start();
                showOsd();
            } else {
                btn.setBackground(normalBg);
                btn.setTextColor(Color.WHITE);
                btn.animate().scaleX(1.0f).scaleY(1.0f).setDuration(120).start();
            }
        });

        btn.setOnClickListener(v -> {
            showOsd();
            if (onClick != null) onClick.onClick(v);
        });

        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.setMargins(0, 0, 14, 0);
        btn.setLayoutParams(lp);
        return btn;
    }

    private String getServerDisplayName(String url, int idx) {
        if (url == null) return "Server " + (idx + 1);
        String lower = url.toLowerCase(java.util.Locale.US);
        boolean isHindi = lower.contains("lang=hi") || lower.contains("audio=hi");
        String badge = isHindi ? " (🇮🇳 Hindi Audio)" : "";
        if (lower.contains("videasy.net")) return "Server " + (idx + 1) + ": Videasy" + (isHindi ? " (🇮🇳 Hindi/Multi)" : " (Ad-Free)");
        if (lower.contains("autoembed.co")) return "Server " + (idx + 1) + ": AutoEmbed" + badge;
        if (lower.contains("vidlink.pro")) return "Server " + (idx + 1) + ": VidLink" + badge;
        if (lower.contains("nontongo.win")) return "Server " + (idx + 1) + ": NontonGo" + badge;
        if (lower.contains("vidsrc.pm")) return "Server " + (idx + 1) + ": VidSrc PM";
        if (lower.contains("vidjoy.pro")) return "Server " + (idx + 1) + ": VidJoy Pro";
        if (lower.contains("2embed.skin") || lower.contains("2embed.cc")) return "Server " + (idx + 1) + ": 2Embed";
        if (lower.contains("vidsrc.pro")) return "Server " + (idx + 1) + ": VidSrc Pro";
        return "Server " + (idx + 1) + badge;
    }

    private void updateControlButtons() {
        if (btnPlayPause != null) {
            boolean playing = (player != null && player.isPlaying()) || isWebEmbedMode;
            btnPlayPause.setText(playing ? "⏸ Pause" : "▶ Play");
        }
        if (btnServer != null) {
            String name = getServerDisplayName(streamUrl, currentServerIdx);
            btnServer.setText("⚡ " + name);
        }
        if (btnFit != null) {
            btnFit.setText("⛶ Fit: " + ZOOM_NAMES[zoomModeIndex]);
        }
        if (btnAudioBoost != null) {
            btnAudioBoost.setText(audioBoostLevel == 1 ? "🔊 Audio: 100%" : audioBoostLevel == 2 ? "🔊 Audio: 200%" : "🔊 Audio: 300% (Max)");
        }
        if (btnSafeColor != null) {
            btnSafeColor.setText(isSafeColorMode ? "🎨 Safe Color: ON" : "🎨 Safe Color: OFF");
        }
        if (btnFavoriteChannel != null) {
            btnFavoriteChannel.setText(isCurrentChannelFavorite() ? "★ Favorited" : "⭐ Favorite");
        }
    }

    private void switchServerNext() {
        if (serverQueue.size() <= 1) {
            Toast.makeText(this, "Only 1 server configured", Toast.LENGTH_SHORT).show();
            return;
        }
        currentServerIdx = (currentServerIdx + 1) % serverQueue.size();
        String nextUrl = serverQueue.get(currentServerIdx);
        String name = getServerDisplayName(nextUrl, currentServerIdx);
        Toast.makeText(this, "Switching to " + name + "...", Toast.LENGTH_SHORT).show();
        playCurrentStream();
        updateControlButtons();
        showOsd();
    }

    private void loadFavoriteChannels() {
        try {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            Set<String> saved = prefs.getStringSet(PREF_FAV_CHANNELS, null);
            favoriteChannels.clear();
            if (saved != null) {
                favoriteChannels.addAll(saved);
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed loading favorites: " + e.getMessage());
        }
    }

    private void saveFavoriteChannels() {
        try {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().putStringSet(PREF_FAV_CHANNELS, new HashSet<>(favoriteChannels)).apply();
        } catch (Exception e) {
            Log.w(TAG, "Failed saving favorites: " + e.getMessage());
        }
    }

    private boolean isCurrentChannelFavorite() {
        synchronized (liveChannelsList) {
            if (liveChannelsList.isEmpty() || currentLiveChannelIndex < 0 || currentLiveChannelIndex >= liveChannelsList.size()) {
                return false;
            }
            LiveChannelItem item = liveChannelsList.get(currentLiveChannelIndex);
            String key = !TextUtils.isEmpty(item.title) ? item.title : item.url;
            return favoriteChannels.contains(key);
        }
    }

    private void toggleCurrentChannelFavorite() {
        synchronized (liveChannelsList) {
            if (liveChannelsList.isEmpty() || currentLiveChannelIndex < 0 || currentLiveChannelIndex >= liveChannelsList.size()) {
                return;
            }
            LiveChannelItem item = liveChannelsList.get(currentLiveChannelIndex);
            String key = !TextUtils.isEmpty(item.title) ? item.title : item.url;
            if (favoriteChannels.contains(key)) {
                favoriteChannels.remove(key);
                Toast.makeText(this, "Removed from Favorites: " + item.title, Toast.LENGTH_SHORT).show();
            } else {
                favoriteChannels.add(key);
                Toast.makeText(this, "⭐ Added to Favorites: " + item.title, Toast.LENGTH_SHORT).show();
            }
            saveFavoriteChannels();
            updateControlButtons();
            if (isChannelDrawerOpen) {
                populateChannelDrawer();
            }
        }
    }

    private void enterPipMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                if (getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)) {
                    Rational rational = new Rational(16, 9);
                    PictureInPictureParams.Builder pipBuilder = new PictureInPictureParams.Builder();
                    pipBuilder.setAspectRatio(rational);
                    hideOsd();
                    hideChannelDrawer();
                    if (channelBannerView != null) channelBannerView.setVisibility(View.GONE);
                    enterPictureInPictureMode(pipBuilder.build());
                } else {
                    Toast.makeText(this, "Picture-in-Picture not supported on this TV device", Toast.LENGTH_SHORT).show();
                }
            } catch (Exception e) {
                Log.w(TAG, "Failed to enter PiP: " + e.getMessage());
            }
        } else {
            Toast.makeText(this, "Picture-in-Picture requires Android 8.0+", Toast.LENGTH_SHORT).show();
        }
    }

    private void showChannelDrawer() {
        if (!isLive || channelDrawerLayout == null) return;
        hideOsd();
        populateChannelDrawer();
        channelDrawerLayout.setVisibility(View.VISIBLE);
        channelDrawerLayout.setTranslationX(-channelDrawerLayout.getWidth() > 0 ? -channelDrawerLayout.getWidth() : -800f);
        channelDrawerLayout.animate().translationX(0f).setDuration(220).start();
        isChannelDrawerOpen = true;

        uiHandler.removeCallbacks(hideChannelDrawerRunnable);
        uiHandler.postDelayed(hideChannelDrawerRunnable, DRAWER_AUTO_HIDE_MS);

        uiHandler.postDelayed(() -> {
            View target = channelListContainer != null && channelListContainer.getChildCount() > 0
                    ? channelListContainer.findViewWithTag("ch_" + currentLiveChannelIndex)
                    : null;
            if (target != null) {
                target.requestFocus();
            } else if (drawerFilterBtn != null) {
                drawerFilterBtn.requestFocus();
            }
        }, 120);
    }

    private void hideChannelDrawer() {
        if (channelDrawerLayout == null || !isChannelDrawerOpen) return;
        uiHandler.removeCallbacks(hideChannelDrawerRunnable);
        channelDrawerLayout.animate().translationX(-channelDrawerLayout.getWidth()).setDuration(180).withEndAction(() -> {
            if (channelDrawerLayout != null) channelDrawerLayout.setVisibility(View.GONE);
            isChannelDrawerOpen = false;
        }).start();
    }

    private void toggleDrawerFavoritesFilter() {
        isDrawerFavoritesOnly = !isDrawerFavoritesOnly;
        isFavoritesSurfingOnly = isDrawerFavoritesOnly;
        if (drawerFilterBtn != null) {
            drawerFilterBtn.setText(isDrawerFavoritesOnly ? "Filter: ⭐ Favorites Only" : "Filter: All Channels");
        }
        populateChannelDrawer();
        uiHandler.removeCallbacks(hideChannelDrawerRunnable);
        uiHandler.postDelayed(hideChannelDrawerRunnable, DRAWER_AUTO_HIDE_MS);
    }

    private void populateChannelDrawer() {
        if (channelListContainer == null) return;
        channelListContainer.removeAllViews();

        synchronized (liveChannelsList) {
            if (liveChannelsList.isEmpty()) {
                TextView empty = new TextView(this);
                empty.setText("No channels available");
                empty.setTextColor(Color.parseColor("#94A3B8"));
                empty.setPadding(16, 24, 16, 24);
                channelListContainer.addView(empty);
                return;
            }

            int count = 0;
            for (int i = 0; i < liveChannelsList.size(); i++) {
                LiveChannelItem item = liveChannelsList.get(i);
                final int channelIdx = i;
                String key = !TextUtils.isEmpty(item.title) ? item.title : item.url;
                boolean isFav = favoriteChannels.contains(key);

                if (isDrawerFavoritesOnly && !isFav) {
                    continue;
                }
                count++;

                LinearLayout row = new LinearLayout(this);
                row.setOrientation(LinearLayout.HORIZONTAL);
                row.setGravity(Gravity.CENTER_VERTICAL);
                row.setFocusable(true);
                row.setClickable(true);
                row.setTag("ch_" + channelIdx);
                row.setPadding(16, 14, 16, 14);

                LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
                rowParams.setMargins(0, 4, 0, 4);
                row.setLayoutParams(rowParams);

                boolean isCurrent = (channelIdx == currentLiveChannelIndex);

                GradientDrawable normalBg = new GradientDrawable();
                normalBg.setCornerRadius(10);
                normalBg.setColor(isCurrent ? Color.parseColor("#1E293B") : Color.TRANSPARENT);
                if (isCurrent) {
                    normalBg.setStroke(1, Color.parseColor("#38BDF8"));
                }
                row.setBackground(normalBg);

                TextView numView = new TextView(this);
                numView.setText("CH " + item.channelNumber);
                numView.setTextSize(12);
                numView.setTypeface(Typeface.DEFAULT_BOLD);
                numView.setTextColor(Color.parseColor("#38BDF8"));
                numView.setPadding(0, 0, 16, 0);
                row.addView(numView);

                TextView titleTv = new TextView(this);
                titleTv.setText(item.title);
                titleTv.setTextSize(14);
                titleTv.setTypeface(Typeface.DEFAULT_BOLD);
                titleTv.setTextColor(isCurrent ? Color.parseColor("#38BDF8") : Color.WHITE);
                titleTv.setSingleLine(true);
                titleTv.setEllipsize(TextUtils.TruncateAt.END);
                LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
                titleTv.setLayoutParams(titleParams);
                row.addView(titleTv);

                if (isFav) {
                    TextView favTv = new TextView(this);
                    favTv.setText("⭐");
                    favTv.setTextSize(12);
                    favTv.setPadding(8, 0, 0, 0);
                    row.addView(favTv);
                }

                // Focus styling
                row.setOnFocusChangeListener((v, hasFocus) -> {
                    uiHandler.removeCallbacks(hideChannelDrawerRunnable);
                    uiHandler.postDelayed(hideChannelDrawerRunnable, DRAWER_AUTO_HIDE_MS);

                    GradientDrawable focusedBg = new GradientDrawable();
                    focusedBg.setCornerRadius(10);
                    if (hasFocus) {
                        focusedBg.setColor(Color.parseColor("#38BDF8"));
                        row.setBackground(focusedBg);
                        numView.setTextColor(Color.parseColor("#0F172A"));
                        titleTv.setTextColor(Color.parseColor("#0F172A"));
                    } else {
                        focusedBg.setColor(channelIdx == currentLiveChannelIndex ? Color.parseColor("#1E293B") : Color.TRANSPARENT);
                        if (channelIdx == currentLiveChannelIndex) {
                            focusedBg.setStroke(1, Color.parseColor("#38BDF8"));
                        }
                        row.setBackground(focusedBg);
                        numView.setTextColor(Color.parseColor("#38BDF8"));
                        titleTv.setTextColor(channelIdx == currentLiveChannelIndex ? Color.parseColor("#38BDF8") : Color.WHITE);
                    }
                });

                row.setOnClickListener(v -> {
                    hideChannelDrawer();
                    if (channelIdx != currentLiveChannelIndex) {
                        previousLiveChannelIndex = currentLiveChannelIndex;
                        currentLiveChannelIndex = channelIdx;
                        showChannelZapBanner();
                        tuneToCurrentLiveChannel();
                    }
                });

                row.setOnKeyListener((v, keyCode, event) -> {
                    if (event.getAction() == KeyEvent.ACTION_DOWN) {
                        if (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT || keyCode == KeyEvent.KEYCODE_BACK) {
                            hideChannelDrawer();
                            return true;
                        }
                    }
                    return false;
                });

                channelListContainer.addView(row);
            }

            if (count == 0) {
                TextView empty = new TextView(this);
                empty.setText("No favorite channels yet.\nPress [Blue] key to favorite any channel!");
                empty.setTextColor(Color.parseColor("#94A3B8"));
                empty.setPadding(16, 24, 16, 24);
                empty.setGravity(Gravity.CENTER);
                channelListContainer.addView(empty);
            }
        }
    }

    private void switchLiveChannel(int delta) {
        synchronized (liveChannelsList) {
            if (liveChannelsList.isEmpty()) {
                Toast.makeText(this, "No channel list available", Toast.LENGTH_SHORT).show();
                return;
            }
            int total = liveChannelsList.size();
            int newIndex;

            if (isFavoritesSurfingOnly && !favoriteChannels.isEmpty()) {
                int searchIndex = currentLiveChannelIndex;
                int found = -1;
                for (int step = 1; step <= total; step++) {
                    int candidate = (searchIndex + (delta * step)) % total;
                    if (candidate < 0) candidate += total;
                    LiveChannelItem candidateItem = liveChannelsList.get(candidate);
                    String key = !TextUtils.isEmpty(candidateItem.title) ? candidateItem.title : candidateItem.url;
                    if (favoriteChannels.contains(key)) {
                        found = candidate;
                        break;
                    }
                }
                newIndex = (found != -1) ? found : (currentLiveChannelIndex + delta) % total;
            } else {
                newIndex = (currentLiveChannelIndex + delta) % total;
            }

            if (newIndex < 0) newIndex += total;
            if (newIndex == currentLiveChannelIndex && total > 1) {
                return;
            }
            if (currentLiveChannelIndex >= 0 && currentLiveChannelIndex != newIndex) {
                previousLiveChannelIndex = currentLiveChannelIndex;
            }
            currentLiveChannelIndex = newIndex;
        }

        // Immediately update HUD / zap banner for snappy TV feedback
        showChannelZapBanner();

        // Debounce actual stream tune so rapid UP/DOWN presses don't crash decoder
        uiHandler.removeCallbacks(tuneLiveChannelRunnable);
        uiHandler.postDelayed(tuneLiveChannelRunnable, CHANNEL_SWITCH_DEBOUNCE_MS);
    }

    private void recallPreviousChannel() {
        synchronized (liveChannelsList) {
            if (liveChannelsList.isEmpty() || previousLiveChannelIndex < 0 || previousLiveChannelIndex >= liveChannelsList.size()) {
                Toast.makeText(this, "No previous channel to recall", Toast.LENGTH_SHORT).show();
                return;
            }
            int targetIndex = previousLiveChannelIndex;
            previousLiveChannelIndex = currentLiveChannelIndex;
            currentLiveChannelIndex = targetIndex;
        }

        showChannelZapBanner();
        uiHandler.removeCallbacks(tuneLiveChannelRunnable);
        uiHandler.post(tuneLiveChannelRunnable);
    }

    private void tuneToCurrentLiveChannel() {
        LiveChannelItem item;
        synchronized (liveChannelsList) {
            if (liveChannelsList.isEmpty() || currentLiveChannelIndex < 0 || currentLiveChannelIndex >= liveChannelsList.size()) {
                return;
            }
            item = liveChannelsList.get(currentLiveChannelIndex);
        }

        Log.i(TAG, "Tuning to live channel [" + (currentLiveChannelIndex + 1) + "]: " + item.title + " -> " + item.url);
        streamTitle = item.title;
        serverQueue.clear();
        serverQueue.add(item.url);
        if (item.fallbacks != null) {
            for (String fb : item.fallbacks) {
                if (!TextUtils.isEmpty(fb) && !serverQueue.contains(fb)) {
                    serverQueue.add(fb);
                }
            }
        }
        currentServerIdx = 0;
        applyStreamMetadataToUi();
        playCurrentStream();
    }

    private void showChannelZapBanner() {
        LiveChannelItem item;
        int index;
        int total;
        synchronized (liveChannelsList) {
            total = liveChannelsList.size();
            if (total == 0) return;
            index = (currentLiveChannelIndex >= 0 && currentLiveChannelIndex < total) ? currentLiveChannelIndex : 0;
            item = liveChannelsList.get(index);
        }

        if (channelBannerView == null) return;

        if (bannerChannelNumber != null) {
            bannerChannelNumber.setText("CH " + item.channelNumber);
        }
        if (bannerChannelTitle != null) {
            bannerChannelTitle.setText(item.title);
        }
        if (bannerCategory != null) {
            String cat = TextUtils.isEmpty(item.category) ? "Live TV" : item.category;
            bannerCategory.setText(cat.toUpperCase());
        }
        if (bannerCounter != null) {
            bannerCounter.setText((index + 1) + " / " + total);
        }
        if (bannerHint != null) {
            bannerHint.setText("▲ / ▼ Switch Channel  •  [OK] Controls");
        }

        uiHandler.removeCallbacks(hideChannelBannerRunnable);
        channelBannerView.setAlpha(1f);
        channelBannerView.setVisibility(View.VISIBLE);
        uiHandler.postDelayed(hideChannelBannerRunnable, CHANNEL_BANNER_TIMEOUT_MS);
    }

    private void handleNumberKeyTuning(int digit) {
        if (!isLive) return;
        uiHandler.removeCallbacks(numberInputTuningRunnable);
        if (numberInputBuffer.length() >= 4) {
            numberInputBuffer.setLength(0);
        }
        numberInputBuffer.append(digit);

        if (numberInputOverlayView != null) {
            numberInputOverlayView.setText("Channel: " + numberInputBuffer.toString() + " _");
            numberInputOverlayView.setVisibility(View.VISIBLE);
        }
        uiHandler.removeCallbacks(hideChannelBannerRunnable);
        uiHandler.postDelayed(numberInputTuningRunnable, 1500L);
    }

    private void executeNumberKeyTuning() {
        if (numberInputBuffer.length() == 0) return;
        try {
            int inputNum = Integer.parseInt(numberInputBuffer.toString());
            numberInputBuffer.setLength(0);
            if (numberInputOverlayView != null) {
                numberInputOverlayView.setVisibility(View.GONE);
            }
            synchronized (liveChannelsList) {
                if (liveChannelsList.isEmpty()) return;
                int foundIndex = -1;
                for (int i = 0; i < liveChannelsList.size(); i++) {
                    LiveChannelItem item = liveChannelsList.get(i);
                    if (item.channelNumber == inputNum) {
                        foundIndex = i;
                        break;
                    }
                }
                if (foundIndex == -1 && inputNum >= 1 && inputNum <= liveChannelsList.size()) {
                    foundIndex = inputNum - 1;
                }
                if (foundIndex != -1) {
                    if (foundIndex != currentLiveChannelIndex) {
                        previousLiveChannelIndex = currentLiveChannelIndex;
                        currentLiveChannelIndex = foundIndex;
                    }
                    showChannelZapBanner();
                    uiHandler.removeCallbacks(tuneLiveChannelRunnable);
                    uiHandler.post(tuneLiveChannelRunnable);
                } else {
                    Toast.makeText(this, "Channel " + inputNum + " not found", Toast.LENGTH_SHORT).show();
                }
            }
        } catch (Exception ignored) {
            numberInputBuffer.setLength(0);
        }
    }

    private void simulateTouchToUnmute() {
        if (webVideoView == null) return;
        try {
            int w = webVideoView.getWidth();
            int h = webVideoView.getHeight();
            if (w <= 0 || h <= 0) {
                w = 1920;
                h = 1080;
            }
            long downTime = android.os.SystemClock.uptimeMillis();
            // Center tap to trigger Chromium user activation
            float cx = w * 0.5f;
            float cy = h * 0.5f;
            android.view.MotionEvent down = android.view.MotionEvent.obtain(downTime, downTime, android.view.MotionEvent.ACTION_DOWN, cx, cy, 0);
            android.view.MotionEvent up = android.view.MotionEvent.obtain(downTime, downTime + 50, android.view.MotionEvent.ACTION_UP, cx, cy, 0);
            webVideoView.dispatchTouchEvent(down);
            webVideoView.dispatchTouchEvent(up);
            down.recycle();
            up.recycle();

            // Bottom-left tap (~8% from left, ~92% from top) where player unmute icons commonly reside
            long downTime2 = android.os.SystemClock.uptimeMillis() + 60;
            float lx = w * 0.08f;
            float ly = h * 0.92f;
            android.view.MotionEvent down2 = android.view.MotionEvent.obtain(downTime2, downTime2, android.view.MotionEvent.ACTION_DOWN, lx, ly, 0);
            android.view.MotionEvent up2 = android.view.MotionEvent.obtain(downTime2, downTime2 + 50, android.view.MotionEvent.ACTION_UP, lx, ly, 0);
            webVideoView.dispatchTouchEvent(down2);
            webVideoView.dispatchTouchEvent(up2);
            down2.recycle();
            up2.recycle();
        } catch (Throwable t) {
            Log.w(TAG, "simulateTouchToUnmute error: " + t.getMessage());
        }
    }

    private void unmuteWebVideo(boolean showFeedback) {
        if (isWebEmbedMode && webVideoView != null) {
            simulateTouchToUnmute();
            webVideoView.evaluateJavascript(
                "(function(){"
                + "try{"
                + "  function unmuteDoc(doc){"
                + "    if(!doc) return;"
                + "    try{"
                + "      var meds = doc.querySelectorAll('video, audio');"
                + "      for(var i=0; i<meds.length; i++){"
                + "        meds[i].muted = false;"
                + "        meds[i].defaultMuted = false;"
                + "        meds[i].volume = 1.0;"
                + "        if(meds[i].paused){ meds[i].play().catch(function(){}); }"
                + "      }"
                + "    }catch(e){}"
                + "    try{"
                + "      var selectors = ["
                + "        '[aria-label*=\"unmute\" i]', '[title*=\"unmute\" i]',"
                + "        '[aria-label*=\"mute\" i]', '[title*=\"mute\" i]',"
                + "        '[aria-label*=\"sound\" i]', '[title*=\"sound\" i]',"
                + "        '[aria-label*=\"volume\" i]',"
                + "        '.jw-icon-volume', '.jw-off', '.vjs-mute-control',"
                + "        '.plyr__control--mute', '.unmute-btn', '.sound-btn',"
                + "        'button[class*=\"mute\" i]', 'div[class*=\"unmute\" i]',"
                + "        'div[class*=\"volume\" i]', 'span[class*=\"volume\" i]',"
                + "        'button[class*=\"volume\" i]', '.video-unmute', '#unmute'"
                + "      ];"
                + "      for(var s=0; s<selectors.length; s++){"
                + "        var els = doc.querySelectorAll(selectors[s]);"
                + "        for(var j=0; j<els.length; j++){"
                + "          try{"
                + "            var txt = ((els[j].getAttribute('aria-label')||'') + ' ' + (els[j].title||'') + ' ' + (els[j].className||'')).toLowerCase();"
                + "            if(txt.indexOf('unmute') !== -1 || txt.indexOf('off') !== -1 || txt.indexOf('mute') !== -1 || txt.indexOf('volume') !== -1){"
                + "              els[j].click();"
                + "            }"
                + "          }catch(e){}"
                + "        }"
                + "      }"
                + "    }catch(e){}"
                + "    try{"
                + "      var ifrs = doc.querySelectorAll('iframe');"
                + "      for(var f=0; f<ifrs.length; f++){"
                + "        try{ unmuteDoc(ifrs[f].contentDocument || ifrs[f].contentWindow.document); }catch(e){}"
                + "        try{"
                + "          ifrs[f].contentWindow.postMessage({type:'unmute',command:'unmute',event:'unmute',action:'unmute'}, '*');"
                + "          ifrs[f].contentWindow.postMessage('{\"event\":\"command\",\"func\":\"unMute\",\"args\":\"\"}', '*');"
                + "        }catch(e){}"
                + "      }"
                + "    }catch(e){}"
                + "  }"
                + "  unmuteDoc(document);"
                + "  if(typeof jwplayer === 'function'){"
                + "    try{ var jw = jwplayer(); if(jw){ if(typeof jw.setMute === 'function') jw.setMute(false); if(typeof jw.setVolume === 'function') jw.setVolume(100); } }catch(e){}"
                + "  }"
                + "  if(typeof videojs === 'function'){"
                + "    try{"
                + "      var vjsList = document.querySelectorAll('.video-js');"
                + "      for(var k=0; k<vjsList.length; k++){"
                + "        var p = videojs(vjsList[k]);"
                + "        if(p){ if(typeof p.muted === 'function') p.muted(false); if(typeof p.volume === 'function') p.volume(1.0); }"
                + "      }"
                + "    }catch(e){}"
                + "  }"
                + "  if(window.player){"
                + "    try{"
                + "      if(typeof window.player.unmute === 'function') window.player.unmute();"
                + "      if(typeof window.player.setMute === 'function') window.player.setMute(false);"
                + "      if(typeof window.player.setVolume === 'function') window.player.setVolume(100);"
                + "    }catch(e){}"
                + "  }"
                + "  if(window.ppl && typeof window.ppl.api === 'function'){ try{ window.ppl.api('unmute'); }catch(e){} }"
                + "}catch(e){}"
                + "return 'OK';"
                + "})();",
                val -> applyAudioBoost());
            if (showFeedback) {
                Toast.makeText(this, "🔊 Audio Unmuted", Toast.LENGTH_SHORT).show();
            }
        } else if (player != null) {
            player.setVolume(audioBoostLevel == 1 ? 1.0f : audioBoostLevel == 2 ? 1.5f : 2.0f);
            if (showFeedback) {
                Toast.makeText(this, "🔊 Audio Unmuted", Toast.LENGTH_SHORT).show();
            }
        }
    }

    public void applyAudioBoost() {
        if (player != null) {
            float exoVol = audioBoostLevel == 1 ? 1.0f : audioBoostLevel == 2 ? 1.5f : 2.0f;
            player.setVolume(exoVol);
        }
        if (isWebEmbedMode && webVideoView != null) {
            webVideoView.evaluateJavascript(
                "(function(){"
                + "try{"
                + "  var vids = document.querySelectorAll('video, audio');"
                + "  for(var i=0; i<vids.length; i++){"
                + "    var v = vids[i];"
                + "    if(!v) continue;"
                + "    v.muted = false;"
                + "    v.defaultMuted = false;"
                + "    v.volume = 1.0;"
                + "  }"
                + "}catch(e){}"
                + "})();", null);
        }
        // System TV hardware master volume is intentionally left untouched under user remote control.
    }

    private void cycleAudioBoost() {
        audioBoostLevel = (audioBoostLevel % 3) + 1;
        applyAudioBoost();
        updateControlButtons();
        String desc = audioBoostLevel == 1 ? "Normal (100%)" : audioBoostLevel == 2 ? "Dialogue Boosted (200%)" : "Max Boost (300%)";
        Toast.makeText(this, "🔊 Audio Boost: " + desc, Toast.LENGTH_SHORT).show();
        showOsd();
    }

    private void toggleSafeColorMode() {
        isSafeColorMode = !isSafeColorMode;
        if (webVideoView != null) {
            if (isSafeColorMode) {
                webVideoView.setLayerType(View.LAYER_TYPE_SOFTWARE, null);
                webVideoView.evaluateJavascript(
                        "(function(){"
                        + "try{"
                        + "  var style = document.getElementById('ajo-safe-color');"
                        + "  if(!style){"
                        + "    style = document.createElement('style');"
                        + "    style.id = 'ajo-safe-color';"
                        + "    (document.head || document.documentElement).appendChild(style);"
                        + "  }"
                        + "  style.textContent = 'video, iframe, embed, object { filter: none !important; -webkit-filter: none !important; transform: none !important; -webkit-transform: none !important; image-rendering: auto !important; -webkit-backface-visibility: visible !important; backface-visibility: visible !important; background-color: #000000 !important; }';"
                        + "  var v=document.querySelector('video');"
                        + "  if(v){"
                        + "    v.style.setProperty('filter', 'none', 'important');"
                        + "    v.style.setProperty('transform', 'none', 'important');"
                        + "    v.style.setProperty('-webkit-transform', 'none', 'important');"
                        + "    v.style.setProperty('background-color', '#000000', 'important');"
                        + "  }"
                        + "}catch(e){}"
                        + "})();", null);
                Toast.makeText(this, "🎨 Safe Color Mode: ON (Software Chroma Fix)", Toast.LENGTH_SHORT).show();
            } else {
                webVideoView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
                webVideoView.evaluateJavascript(
                        "(function(){"
                        + "try{"
                        + "  var style = document.getElementById('ajo-safe-color');"
                        + "  if(style) style.remove();"
                        + "}catch(e){}"
                        + "})();", null);
                Toast.makeText(this, "🎨 Safe Color Mode: OFF (GPU Hardware)", Toast.LENGTH_SHORT).show();
            }
        } else if (player != null) {
            softwareDecoderRetryDone = isSafeColorMode;
            useTextureViewFallback = isSafeColorMode;
            Toast.makeText(this, isSafeColorMode ? "Software Video Decoder: ON" : "Hardware Video Decoder: ON", Toast.LENGTH_SHORT).show();
            initializeExoPlayer();
        }
        updateControlButtons();
        showOsd();
    }

    private String getLiveEpgInfo(String title) {
        if (title == null) return "";
        String t = title.toLowerCase(java.util.Locale.US);
        java.util.Calendar cal = java.util.Calendar.getInstance();
        int hour = cal.get(java.util.Calendar.HOUR_OF_DAY);
        
        String nowTitle = "Live Primetime Broadcast";
        String nextTitle = "Prime Show";
        
        if (t.contains("sab") || t.contains("sub")) {
            if (hour >= 20 && hour < 21) {
                nowTitle = "Taarak Mehta Ka Ooltah Chashmah";
                nextTitle = "Wagle Ki Duniya";
            } else if (hour >= 21 && hour < 22) {
                nowTitle = "Wagle Ki Duniya - Nayi Peedhi";
                nextTitle = "Pushpa Impossible";
            } else if (hour >= 22 && hour < 23) {
                nowTitle = "Pushpa Impossible";
                nextTitle = "Taarak Mehta (Repeat)";
            } else {
                nowTitle = "Taarak Mehta Ka Ooltah Chashmah";
                nextTitle = "SAB TV Hit Comedy Special";
            }
        } else if (t.contains("sport") || t.contains("cricket") || t.contains("ten")) {
            nowTitle = "Live Match Center & Ball-by-Ball Analysis";
            nextTitle = "Post Match Presentation & Highlights";
        } else if (t.contains("news") || t.contains("tak") || t.contains("24")) {
            nowTitle = "National Prime Debate & 100 Non-Stop Headlines";
            nextTitle = "Special Ground Investigation";
        } else if (t.contains("star plus")) {
            nowTitle = "Anupamaa (Primetime)";
            nextTitle = "Ghum Hai Kisikey Pyaar Meiin";
        } else if (t.contains("colors")) {
            nowTitle = "Shiv Shakti (Mega Drama)";
            nextTitle = "Parineetii";
        } else if (t.contains("zee")) {
            nowTitle = "Kundali Bhagya";
            nextTitle = "Kumkum Bhagya";
        } else if (t.contains("cinema") || t.contains("gold") || t.contains("max") || t.contains("pix")) {
            nowTitle = "Superhit Blockbuster Movie";
            nextTitle = "Grand Action Cinema Night";
        }
        return "🔴 NOW: " + nowTitle + "  •  ⏩ NEXT: " + nextTitle;
    }

    private void applyStreamMetadataToUi() {
        if (titleView != null) {
            titleView.setText(streamTitle);
        }
        if (statusBadge != null) {
            GradientDrawable badgeBg = new GradientDrawable();
            badgeBg.setCornerRadius(8);
            if (isLive) {
                badgeBg.setColor(Color.parseColor("#ef4444"));
                statusBadge.setBackground(badgeBg);
                statusBadge.setText("LIVE BROADCAST");
            } else {
                badgeBg.setColor(Color.parseColor("#38bdf8"));
                statusBadge.setBackground(badgeBg);
                statusBadge.setText("HD STREAM");
            }
        }
        if (isLive && timeView != null) {
            timeView.setText(getLiveEpgInfo(streamTitle));
        }
        if (hintView != null) {
            hintView.setText(isLive
                    ? "Remote: [▲/▼] Change Channel  •  [◀] Channel Guide  •  [Blue] Favorite  •  [OK] Controls"
                    : "Remote: [D-Pad Left/Right] Seek ±10s  •  [OK] Play/Pause  •  [Back] Exit");
        }
        updateControlButtons();
    }

    // --------------------------------------------------------- stream dispatcher

    private boolean isWebEmbedUrl(String url) {
        if (TextUtils.isEmpty(url)) return false;
        String lower = url.toLowerCase(java.util.Locale.US);
        // Direct media streams must always be decoded by ExoPlayer
        if (lower.contains(".m3u8") || lower.contains(".mp4") || lower.contains(".mpd")
                || lower.contains("/getm3u8/") || lower.contains("/playlist") || lower.contains("master.m3u8")) {
            return false;
        }
        // v3.9.1: added vidsrc.xyz and superembed.stream; kept in sync with
        // EMBED_HOST_PATTERNS in nativePlayer.js and EMBED_PATTERNS in streamingEngines.js.
        return lower.contains("/embed/") || lower.contains("apiplayer.ru")
                || lower.contains("vidlink.pro") || lower.contains("vidsrc") || lower.contains("autoembed")
                || lower.contains("smashy") || lower.contains("multiembed") || lower.contains("vidjoy")
                || lower.contains("2embed") || lower.contains("nontongo") || lower.contains("embed.su")
                || lower.contains("superembed") || lower.contains("moviesapi") || lower.contains("videasy");
    }

    private void playCurrentStream() {
        if (serverQueue.isEmpty()) {
            Toast.makeText(this, "No video stream available", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }

        if (currentServerIdx < 0 || currentServerIdx >= serverQueue.size()) {
            currentServerIdx = 0;
        }

        streamUrl = serverQueue.get(currentServerIdx);
        Log.i(TAG, "playCurrentStream [" + (currentServerIdx + 1) + "/" + serverQueue.size() + "]: " + streamUrl);

        if (isWebEmbedUrl(streamUrl)) {
            playInWebEngine(streamUrl);
        } else {
            playInNativeExoPlayer(streamUrl);
        }
    }

    /**
     * Returns Referer/Origin headers each mirror wants to see. Bare requests
     * get blocked by every embed provider, so a hard-coded Referer to the
     * mirror's own origin fixes most "loads but plays nothing" cases.
     */
    private Map<String, String> buildEmbedHeaders(String url) {
        Map<String, String> headers = new HashMap<>();
        headers.put("User-Agent", USER_AGENT);
        try {
            String host = Uri.parse(url).getHost();
            if (host == null) return headers;
            String lower = host.toLowerCase(java.util.Locale.US);
            // Mirror-specific origins. Keep in sync with EMBED_PATTERNS in
            // streamingEngines.js so any new provider added there gets a header
            // here too.
            if (lower.contains("vidlink.pro")) {
                headers.put("Referer", "https://vidlink.pro/");
                headers.put("Origin", "https://vidlink.pro");
            } else if (lower.contains("vidjoy.pro")) {
                headers.put("Referer", "https://vidjoy.pro/");
                headers.put("Origin", "https://vidjoy.pro");
            } else if (lower.contains("nontongo.win")) {
                headers.put("Referer", "https://www.nontongo.win/");
                headers.put("Origin", "https://www.nontongo.win");
            } else if (lower.contains("embed.su")) {
                headers.put("Referer", "https://embed.su/");
                headers.put("Origin", "https://embed.su");
            } else if (lower.contains("humma429gix.com")) {
                headers.put("Referer", "https://allmovielandapp.app/");
                headers.put("Origin", "https://allmovielandapp.app");
            } else if (lower.contains("autoembed")) {
                headers.put("Referer", "https://autoembed.co/");
                headers.put("Origin", "https://autoembed.co");
            } else if (lower.contains("2embed.cc") || lower.contains("2embed.skin")) {
                headers.put("Referer", "https://www.2embed.cc/");
                headers.put("Origin", "https://www.2embed.cc");
            } else if (lower.contains("moviesapi.club")) {
                headers.put("Referer", "https://moviesapi.club/");
                headers.put("Origin", "https://moviesapi.club");
            } else if (lower.contains("multiembed.mov")) {
                headers.put("Referer", "https://multiembed.mov/");
                headers.put("Origin", "https://multiembed.mov");
            } else if (lower.contains("superembed.stream")) {
                headers.put("Referer", "https://superembed.stream/");
                headers.put("Origin", "https://superembed.stream");
            } else if (lower.contains("smashy.stream")) {
                headers.put("Referer", "https://smashy.stream/");
                headers.put("Origin", "https://smashy.stream");
            } else if (lower.contains("apiplayer.ru")) {
                headers.put("Referer", "https://apiplayer.ru/");
                headers.put("Origin", "https://apiplayer.ru");
            } else if (lower.contains("vidsrc.in")) {
                headers.put("Referer", "https://vidsrc.in/");
                headers.put("Origin", "https://vidsrc.in");
            } else if (lower.contains("vidsrc.pm")) {
                headers.put("Referer", "https://vidsrc.pm/");
                headers.put("Origin", "https://vidsrc.pm");
            } else if (lower.contains("vidsrc.pro")) {
                headers.put("Referer", "https://vidsrc.pro/");
                headers.put("Origin", "https://vidsrc.pro");
            } else if (lower.contains("vidsrc")) {
                headers.put("Referer", "https://vidsrc.cc/");
                headers.put("Origin", "https://vidsrc.cc");
            } else if (lower.contains("videasy")) {
                headers.put("Referer", "https://player.videasy.to/");
                headers.put("Origin", "https://player.videasy.to");
            } else {
                // Generic fallback: referer = the host itself so providers that
                // require same-origin referers still get a valid value.
                headers.put("Referer", "https://" + host + "/");
            }
        } catch (Exception ignored) {}
        return headers;
    }

    private void playInWebEngine(String url) {
        isWebEmbedMode = true;
        releasePlayer();

        if (aspectRatioFrameLayout != null) {
            aspectRatioFrameLayout.setVisibility(View.GONE);
        }
        if (!ensureWebVideoView()) {
            Toast.makeText(this, "Web engine unavailable, trying next server", Toast.LENGTH_SHORT).show();
            failoverToNextServer();
            return;
        }
        if (webVideoView != null) {
            webVideoView.setVisibility(View.VISIBLE);
            Map<String, String> headers = buildEmbedHeaders(url);
            webVideoView.loadUrl(url, headers);
            webVideoView.requestFocus();
        }

        bufferSpinner.setVisibility(View.VISIBLE);
        uiHandler.removeCallbacks(progressRunnable);
        uiHandler.post(progressRunnable);
        uiHandler.removeCallbacks(webLoadWatchdog);
        uiHandler.postDelayed(webLoadWatchdog, WEB_LOAD_TIMEOUT_MS);
        // Hide spinner on page-finished, not after a fixed delay — embed pages
        // regularly take >3.5s to resolve the Cloudflare interstitial.
    }

    private void playInNativeExoPlayer(String url) {
        isWebEmbedMode = false;
        uiHandler.removeCallbacks(webLoadWatchdog);
        if (webVideoView != null) {
            webVideoView.stopLoading();
            webVideoView.loadUrl("about:blank");
            webVideoView.setVisibility(View.GONE);
        }
        if (aspectRatioFrameLayout != null) {
            aspectRatioFrameLayout.setVisibility(View.VISIBLE);
        }
        initializeExoPlayer();
    }

    // -------------------------------------------------------------- ExoPlayer

    private void initializeExoPlayer() {
        try {
            releasePlayer();

            firstFrameRendered = false;
            hasVideoTrack = false;

            DefaultRenderersFactory renderersFactory = new DefaultRenderersFactory(getApplicationContext())
                    .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_OFF)
                    .setEnableDecoderFallback(true)
                    .setAllowedVideoJoiningTimeMs(15000L)
                    .setMediaCodecSelector(androidx.media3.exoplayer.mediacodec.MediaCodecSelector.DEFAULT);

            androidx.media3.exoplayer.upstream.DefaultBandwidthMeter bandwidthMeter =
                    new androidx.media3.exoplayer.upstream.DefaultBandwidthMeter.Builder(getApplicationContext())
                            .setInitialBitrateEstimate(2_000_000L)
                            .build();

            DefaultTrackSelector trackSelector = new DefaultTrackSelector(getApplicationContext());
            trackSelector.setParameters(trackSelector.buildUponParameters()
                    .setPreferredVideoMimeType(MimeTypes.VIDEO_H264)
                    .setMaxVideoSize(1920, 1080)
                    .setMaxVideoFrameRate(60)
                    .setExceedVideoConstraintsIfNecessary(true)
                    .setTunnelingEnabled(false)
                    .setForceLowestBitrate(false));

            DefaultLoadControl loadControl = new DefaultLoadControl.Builder()
                    .setAllocator(new androidx.media3.exoplayer.upstream.DefaultAllocator(true, 64 * 1024))
                    .setBufferDurationsMs(
                            /* minBufferMs= */ isLive ? 3500 : 25000,
                            /* maxBufferMs= */ isLive ? 15000 : 50000,
                            /* bufferForPlaybackMs= */ isLive ? 1000 : 2500,
                            /* bufferForPlaybackAfterRebufferMs= */ isLive ? 2000 : 5000)
                    // v3.12.49 FIX (the whole-stick freeze): cap the buffer to
                    // the device's RAM class. Uncapped default target can exceed
                    // 200MB on 1080p streams; with the resident WebView +
                    // largeHeap on a 1GB/1.5GB Fire TV stick that triggers
                    // kernel OOM — the entire device freezes and only a power
                    // cycle recovers.
                    .setTargetBufferBytes(deviceClassTargetBufferBytes())
                    .setPrioritizeTimeOverSizeThresholds(true)
                    .setBackBuffer(isLive ? 2000 : 10000, false)
                    .build();

            ExoPlayer exo = new ExoPlayer.Builder(getApplicationContext(), renderersFactory)
                    .setTrackSelector(trackSelector)
                    .setLoadControl(loadControl)
                    .setBandwidthMeter(bandwidthMeter)
                    .setMediaSourceFactory(new DefaultMediaSourceFactory(buildDataSourceFactory(streamUrl)))
                    .setAudioAttributes(
                            new androidx.media3.common.AudioAttributes.Builder()
                                    .setUsage(C.USAGE_MEDIA)
                                    .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
                                    .build(),
                            true /* handleAudioFocus */
                    )
                    .build();

            // NOTE: Do NOT call exo.setHandleAudioBecomingNoisy(true) on Android TV!
            // It registers a BroadcastReceiver without RECEIVER_EXPORTED/NOT_EXPORTED flags
            // causing java.lang.SecurityException on Android 14 TV OS, and is not needed for TV speakers.

            exo.addListener(new PlayerEventListener());
            // Feed the freeze detector with real rendered-video-frame counts.
            exo.addAnalyticsListener(frameCounterListener);

            if (useTextureViewFallback && textureView != null) {
                if (surfaceView != null) surfaceView.setVisibility(View.GONE);
                textureView.setVisibility(View.VISIBLE);
                exo.setVideoTextureView(textureView);
            } else if (surfaceView != null) {
                surfaceView.setVisibility(View.VISIBLE);
                if (textureView != null) textureView.setVisibility(View.GONE);
                exo.setVideoSurfaceView(surfaceView);
            }
            exo.setVideoScalingMode(C.VIDEO_SCALING_MODE_SCALE_TO_FIT);

            exo.setMediaSource(buildMediaSource(streamUrl));
            if (resumePositionMs != C.TIME_UNSET && !isLive) {
                exo.seekTo(resumePositionMs);
            }
            exo.prepare();
            exo.setPlayWhenReady(true);

            player = exo;

            uiHandler.removeCallbacks(progressRunnable);
            uiHandler.post(progressRunnable);
            uiHandler.removeCallbacks(firstFrameWatchdog);
            uiHandler.postDelayed(firstFrameWatchdog, FIRST_FRAME_TIMEOUT_MS);
        } catch (Throwable t) {
            Log.e(TAG, "initializeExoPlayer failed: ", t);
            Toast.makeText(this, "Player error: " + t.getMessage(), Toast.LENGTH_SHORT).show();
            if (currentServerIdx + 1 < serverQueue.size()) {
                failoverToNextServer();
            }
        }
    }

    /**
     * v3.12.49: RAM-class-aware buffer budget (whole-stick freeze fix).
     * 32MB on 1GB sticks, 48MB on FireTV Stick 4K (1.5GB), up to 96MB on
     * real TVs. See the note in initializeExoPlayer().
     */
    private int deviceClassTargetBufferBytes() {
        try {
            android.app.ActivityManager.MemoryInfo mi = new android.app.ActivityManager.MemoryInfo();
            android.app.ActivityManager am = (android.app.ActivityManager) getSystemService(ACTIVITY_SERVICE);
            if (am == null) return 48 * 1024 * 1024;
            am.getMemoryInfo(mi);
            long gb = 1024L * 1024L * 1024L;
            long total = mi.totalMem > 0 ? mi.totalMem : gb;
            if (total < 1.15 * gb) return 32 * 1024 * 1024;
            if (total < 1.45 * gb) return 48 * 1024 * 1024;
            if (total < 2.3 * gb) return 64 * 1024 * 1024;
            return 96 * 1024 * 1024;
        } catch (Throwable t) {
            return 48 * 1024 * 1024;
        }
    }

    private MediaSource buildMediaSource(String url) {
        DataSource.Factory dataSourceFactory = buildDataSourceFactory(url);
        Uri uri = Uri.parse(url);

        MediaItem.Builder itemBuilder = new MediaItem.Builder().setUri(uri);
        if (isLive) {
            itemBuilder.setLiveConfiguration(
                    new MediaItem.LiveConfiguration.Builder()
                            .setMinPlaybackSpeed(1.0f)
                            .setMaxPlaybackSpeed(1.0f)
                            .build());
        }

        String lower = url.toLowerCase(java.util.Locale.US);
        boolean looksLikeHls = lower.contains(".m3u8") || lower.contains("/getm3u8/")
                || lower.contains("m3u8") || isLive;

        if (looksLikeHls) {
            itemBuilder.setMimeType(MimeTypes.APPLICATION_M3U8);
            DefaultHlsExtractorFactory hlsExtractorFactory = new DefaultHlsExtractorFactory(
                    DefaultTsPayloadReaderFactory.FLAG_ALLOW_NON_IDR_KEYFRAMES
                            | DefaultTsPayloadReaderFactory.FLAG_IGNORE_SPLICE_INFO_STREAM,
                    /* exposeCea608WhenMissingDeclarations= */ true);
            return new HlsMediaSource.Factory(dataSourceFactory)
                    .setExtractorFactory(hlsExtractorFactory)
                    .setAllowChunklessPreparation(true)
                    .createMediaSource(itemBuilder.build());
        }

        boolean looksLikeDash = lower.contains(".mpd") || lower.contains("/dash/");
        if (looksLikeDash) {
            itemBuilder.setMimeType(MimeTypes.APPLICATION_MPD);
            return new androidx.media3.exoplayer.dash.DashMediaSource.Factory(dataSourceFactory)
                    .createMediaSource(itemBuilder.build());
        }

        DefaultExtractorsFactory extractorsFactory = new DefaultExtractorsFactory()
                .setTsExtractorFlags(
                        DefaultTsPayloadReaderFactory.FLAG_ALLOW_NON_IDR_KEYFRAMES
                                | DefaultTsPayloadReaderFactory.FLAG_DETECT_ACCESS_UNITS
                                | DefaultTsPayloadReaderFactory.FLAG_IGNORE_SPLICE_INFO_STREAM)
                .setConstantBitrateSeekingEnabled(true);

        return new ProgressiveMediaSource.Factory(dataSourceFactory, extractorsFactory)
                .createMediaSource(itemBuilder.build());
    }

    private static volatile OkHttpClient sharedOkHttpClient = null;

    private static synchronized OkHttpClient getSharedOkHttpClient() throws Exception {
        if (sharedOkHttpClient == null) {
            sharedOkHttpClient = buildPermissiveOkHttpClient();
        }
        return sharedOkHttpClient;
    }

    private DataSource.Factory buildDataSourceFactory() {
        return buildDataSourceFactory(null);
    }

    /**
     * v3.12.73 FIX (movies/series not streaming): merge the mirror Referer/UA
     * map (buildEmbedHeaders) into the ExoPlayer DataSource. Without it the
     * movibox direct-MP4 CDN 429s every native request (no Referer) and VOD
     * dies into slow embed failovers. Live channel playback untouched.
     */
    private DataSource.Factory buildDataSourceFactory(String url) {
        Map<String, String> defaultHeaders = new HashMap<>();
        defaultHeaders.put("Accept", "*/*");
        if (url != null && !url.isEmpty()) {
            try {
                for (Map.Entry<String, String> e : buildEmbedHeaders(url).entrySet()) {
                    if (e.getKey() != null && e.getValue() != null) defaultHeaders.put(e.getKey(), e.getValue());
                }
            } catch (Throwable ignored) {}
        }

        HttpDataSource.Factory httpFactory;
        try {
            OkHttpClient client = getSharedOkHttpClient();
            httpFactory = new OkHttpDataSource.Factory(client)
                    .setUserAgent(USER_AGENT)
                    .setDefaultRequestProperties(defaultHeaders);
        } catch (Throwable t) {
            Log.w(TAG, "OkHttp data source unavailable, using DefaultHttpDataSource", t);
            httpFactory = new DefaultHttpDataSource.Factory()
                    .setUserAgent(USER_AGENT)
                    .setAllowCrossProtocolRedirects(true)
                    .setConnectTimeoutMs(CONNECT_TIMEOUT_MS)
                    .setReadTimeoutMs(READ_TIMEOUT_MS)
                    .setKeepPostFor302Redirects(true)
                    .setDefaultRequestProperties(defaultHeaders);
        }

        return new DefaultDataSource.Factory(getApplicationContext(), httpFactory);
    }

    private static OkHttpClient buildPermissiveOkHttpClient() throws Exception {
        final X509TrustManager trustAll = new X509TrustManager() {
            @Override
            public void checkClientTrusted(X509Certificate[] chain, String authType) { }

            @Override
            public void checkServerTrusted(X509Certificate[] chain, String authType) { }

            @Override
            public X509Certificate[] getAcceptedIssuers() {
                return new X509Certificate[0];
            }
        };

        SSLContext sslContext = SSLContext.getInstance("TLS");
        sslContext.init(null, new TrustManager[]{trustAll}, new SecureRandom());
        SSLSocketFactory sslSocketFactory = sslContext.getSocketFactory();

        okhttp3.Dns bypassDns = hostname -> {
            try {
                java.util.List<java.net.InetAddress> addresses =
                        java.util.Arrays.asList(java.net.InetAddress.getAllByName(hostname));
                boolean hasValid = false;
                for (java.net.InetAddress a : addresses) {
                    if (!a.isAnyLocalAddress() && !a.isLoopbackAddress()) {
                        hasValid = true;
                        break;
                    }
                }
                if (hasValid) return addresses;
            } catch (Exception ignored) {}

            // Bypass ISP DNS blocks (Jio/Airtel/ACT) via DNS-over-HTTPS (Google & Cloudflare)
            try {
                java.net.URL dohUrl = new java.net.URL("https://dns.google/resolve?name=" + hostname + "&type=A");
                java.net.HttpURLConnection conn = (java.net.HttpURLConnection) dohUrl.openConnection();
                conn.setConnectTimeout(2500);
                conn.setReadTimeout(2500);
                conn.setRequestProperty("Accept", "application/json");
                if (conn.getResponseCode() == 200) {
                    java.io.BufferedReader reader = new java.io.BufferedReader(new java.io.InputStreamReader(conn.getInputStream()));
                    java.lang.StringBuilder sb = new java.lang.StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) sb.append(line);
                    reader.close();
                    org.json.JSONObject json = new org.json.JSONObject(sb.toString());
                    org.json.JSONArray answers = json.optJSONArray("Answer");
                    if (answers != null && answers.length() > 0) {
                        java.util.List<java.net.InetAddress> list = new java.util.ArrayList<>();
                        for (int i = 0; i < answers.length(); i++) {
                            org.json.JSONObject ans = answers.getJSONObject(i);
                            String ip = ans.optString("data");
                            if (ip != null && !ip.isEmpty() && !ip.contains(":")) {
                                list.add(java.net.InetAddress.getByName(ip));
                            }
                        }
                        if (!list.isEmpty()) return list;
                    }
                }
            } catch (Exception ignored) {}

            return okhttp3.Dns.SYSTEM.lookup(hostname);
        };

        return new OkHttpClient.Builder()
                .dns(bypassDns)
                .connectionPool(new okhttp3.ConnectionPool(16, 5, TimeUnit.MINUTES))
                .sslSocketFactory(sslSocketFactory, trustAll)
                .hostnameVerifier((hostname, session) -> true)
                .connectionSpecs(Arrays.asList(
                        ConnectionSpec.MODERN_TLS,
                        ConnectionSpec.COMPATIBLE_TLS,
                        ConnectionSpec.CLEARTEXT))
                .connectTimeout(CONNECT_TIMEOUT_MS, TimeUnit.MILLISECONDS)
                .readTimeout(READ_TIMEOUT_MS, TimeUnit.MILLISECONDS)
                // v3.9.0: reduced from 120s; v3.10.0: 15s was aborting
                // legitimately large 4K segments mid-read on slower pipes
                // (callTimeout covers the whole body read, not just connect),
                // causing repeated rebuffers. 30s still fails over briskly.
                .callTimeout(30, TimeUnit.SECONDS)
                .followRedirects(true)
                .followSslRedirects(true)
                .retryOnConnectionFailure(true)
                .build();
    }

    private void releasePlayer() {
        if (player != null) {
            try {
                player.stop();
                player.release();
            } catch (Exception e) {
                Log.w(TAG, "Error releasing ExoPlayer", e);
            }
            player = null;
        }
    }

    private void failoverToNextServer() {
        if (autoPlayAttemptRunnable != null) {
            uiHandler.removeCallbacks(autoPlayAttemptRunnable);
            autoPlayAttemptRunnable = null;
        }
        uiHandler.removeCallbacks(webLoadWatchdog);
        uiHandler.removeCallbacks(firstFrameWatchdog);
        if (currentServerIdx + 1 < serverQueue.size()) {
            currentServerIdx++;
            uiHandler.post(() -> {
                String name = getServerDisplayName(serverQueue.get(currentServerIdx), currentServerIdx);
                Toast.makeText(PlayerActivity.this, "Auto-switching to " + name + "...", Toast.LENGTH_SHORT).show();
                playCurrentStream();
                updateControlButtons();
                showOsd();
            });
        } else {
            uiHandler.post(() -> {
                Toast.makeText(PlayerActivity.this, "Content not yet indexed on free servers. Please try again later.", Toast.LENGTH_LONG).show();
                finish();
            });
        }
    }

    private class PlayerEventListener implements Player.Listener {
        @Override
        public void onPlaybackStateChanged(int playbackState) {
            switch (playbackState) {
                case Player.STATE_BUFFERING:
                    bufferSpinner.setVisibility(View.VISIBLE);
                    break;
                case Player.STATE_READY:
                    bufferSpinner.setVisibility(View.GONE);
                    updateProgressText();
                    break;
                case Player.STATE_ENDED:
                    bufferSpinner.setVisibility(View.GONE);
                    if (isLive) {
                        Log.i(TAG, "Live stream reached end of playlist window, resyncing to live edge...");
                        if (player != null) {
                            try {
                                player.seekToDefaultPosition();
                                player.prepare();
                                player.play();
                            } catch (Exception ignored) {}
                        }
                    } else {
                        finish();
                    }
                    break;
                case Player.STATE_IDLE:
                default:
                    break;
            }
        }

        @Override
        public void onPlayerError(@NonNull PlaybackException error) {
            Log.e(TAG, "PLAYER_ERROR on server " + (currentServerIdx + 1) + ": " + error.getMessage() + " (code " + error.errorCode + ")", error);
            bufferSpinner.setVisibility(View.GONE);

            if (isLive) {
                // Live channels: re-sync to live broadcast edge without burning through server queue
                Log.w(TAG, "Live channel error (" + error.errorCode + "), resyncing to live broadcast...");
                if (player != null) {
                    try {
                        player.seekToDefaultPosition();
                        player.prepare();
                        player.play();
                    } catch (Exception ignored) {}
                }
                return;
            }

            // Failover to next stream server in queue for VOD
            if (currentServerIdx + 1 < serverQueue.size()) {
                failoverToNextServer();
                return;
            }

            int code = error.errorCode;
            if (code == PlaybackException.ERROR_CODE_DECODER_INIT_FAILED
                    || code == PlaybackException.ERROR_CODE_DECODING_FAILED
                    || code == PlaybackException.ERROR_CODE_DECODING_FORMAT_UNSUPPORTED) {
                if (!softwareDecoderRetryDone) {
                    softwareDecoderRetryDone = true;
                    useTextureViewFallback = true;
                    Toast.makeText(PlayerActivity.this,
                            "Switching to compatible video engine...",
                            Toast.LENGTH_SHORT).show();
                    showOsd();
                    initializeExoPlayer();
                    return;
                }
            }

            Toast.makeText(PlayerActivity.this,
                    "Stream playback error. Returning...", Toast.LENGTH_LONG).show();
            finish();
        }

        @Override
        public void onIsPlayingChanged(boolean playing) {
            if (playing) {
                bufferSpinner.setVisibility(View.GONE);
            }
        }

        @Override
        public void onRenderedFirstFrame() {
            Log.i(TAG, "RENDERED_FIRST_FRAME: hardware surface is receiving decoded video");
            firstFrameRendered = true;
            uiHandler.removeCallbacks(firstFrameWatchdog);
            bufferSpinner.setVisibility(View.GONE);
        }

        @Override
        public void onVideoSizeChanged(@NonNull VideoSize videoSize) {
            Log.i(TAG, "VIDEO_SIZE: " + videoSize.width + "x" + videoSize.height);
            if (videoSize.width > 0 && videoSize.height > 0 && aspectRatioFrameLayout != null) {
                aspectRatioFrameLayout.setAspectRatio((float) videoSize.width / videoSize.height);
            }
        }

        @Override
        public void onTracksChanged(@NonNull androidx.media3.common.Tracks tracks) {
            int videoTracks = 0;
            int audioTracks = 0;
            for (androidx.media3.common.Tracks.Group group : tracks.getGroups()) {
                if (group.getType() == C.TRACK_TYPE_VIDEO) videoTracks += group.length;
                if (group.getType() == C.TRACK_TYPE_AUDIO) audioTracks += group.length;
            }
            hasVideoTrack = videoTracks > 0;
            Log.i(TAG, "TRACKS_CHANGED: video=" + videoTracks + ", audio=" + audioTracks);
        }
    }

    // ------------------------------------------------------------- OSD and D-Pad controls

    private void showOsd() {
        if (osdOverlay == null) return;
        isOsdVisible = true;
        osdOverlay.setVisibility(View.VISIBLE);
        updateControlButtons();
        uiHandler.removeCallbacks(hideOsdRunnable);
        uiHandler.postDelayed(hideOsdRunnable, OSD_HIDE_DELAY_MS);
    }

    private void hideOsd() {
        if (osdOverlay == null) return;
        isOsdVisible = false;
        osdOverlay.setVisibility(View.GONE);
    }

    private void toggleOsd() {
        if (isOsdVisible) hideOsd();
        else {
            showOsd();
            if (btnPlayPause != null) btnPlayPause.requestFocus();
        }
    }

    private void cycleAudioTrack() {
        if (player == null || isWebEmbedMode) return;
        try {
            androidx.media3.common.Tracks tracks = player.getCurrentTracks();
            List<androidx.media3.common.Tracks.Group> audioGroups = new ArrayList<>();
            for (androidx.media3.common.Tracks.Group group : tracks.getGroups()) {
                if (group.getType() == C.TRACK_TYPE_AUDIO) {
                    audioGroups.add(group);
                }
            }
            if (audioGroups.isEmpty()) {
                Toast.makeText(this, "Single Audio Stream", Toast.LENGTH_SHORT).show();
                return;
            }
            currentAudioTrackIndex = (currentAudioTrackIndex + 1) % audioGroups.size();
            androidx.media3.common.Tracks.Group selectedGroup = audioGroups.get(currentAudioTrackIndex);
            String lang = "Audio " + (currentAudioTrackIndex + 1);
            if (selectedGroup.length > 0) {
                androidx.media3.common.Format format = selectedGroup.getTrackFormat(0);
                if (format.language != null && !format.language.isEmpty()) {
                    String raw = format.language.toUpperCase(java.util.Locale.US);
                    if (raw.equals("HIN") || raw.equals("HI")) lang = "Hindi";
                    else if (raw.equals("ENG") || raw.equals("EN")) lang = "English";
                    else if (raw.equals("TAM") || raw.equals("TA")) lang = "Tamil";
                    else if (raw.equals("TEL") || raw.equals("TE")) lang = "Telugu";
                    else if (raw.equals("MAR") || raw.equals("MR")) lang = "Marathi";
                    else lang = raw;
                }
            }
            player.setTrackSelectionParameters(
                    player.getTrackSelectionParameters()
                            .buildUpon()
                            .setOverrideForType(
                                    new androidx.media3.common.TrackSelectionOverride(
                                            selectedGroup.getMediaTrackGroup(), 0))
                            .build()
            );
            Toast.makeText(this, "Audio Track: " + lang, Toast.LENGTH_SHORT).show();
            if (btnAudioTrack != null) {
                btnAudioTrack.setText("🌐 " + lang);
            }
        } catch (Exception e) {
            Log.w(TAG, "Audio track switch exception: " + e.getMessage());
        }
        showOsd();
    }

    private void updateProgressText() {
        if (timeView == null) return;
        if (isLive) {
            timeView.setText(getLiveEpgInfo(streamTitle));
            return;
        }
        if (isWebEmbedMode) {
            timeView.setText("HD STREAM");
            return;
        }
        if (player == null || player.getDuration() == C.TIME_UNSET) {
            timeView.setText("--:-- / --:--");
            return;
        }
        timeView.setText(formatTime(player.getCurrentPosition())
                + " / " + formatTime(player.getDuration()));
    }

    private void togglePlayPause() {
        if (isWebEmbedMode && webVideoView != null) {
            webVideoView.evaluateJavascript(
                    "(function(){"
                    + "try{"
                    + "  var vs = document.querySelectorAll('video');"
                    + "  for(var i=0; i<vs.length; i++){"
                    + "    var v = vs[i];"
                    + "    if(v.muted){"
                    + "      v.muted = false; v.defaultMuted = false; v.volume = 1.0;"
                    + "      if(v.paused) v.play().catch(function(){});"
                    + "      return 'UNMUTED';"
                    + "    }"
                    + "  }"
                    + "  var v0 = document.querySelector('video');"
                    + "  if(v0){"
                    + "    if(v0.paused){ v0.muted = false; v0.defaultMuted = false; v0.volume = 1.0; v0.play().catch(function(){}); return 'PLAYING'; }"
                    + "    else { v0.pause(); return 'PAUSED'; }"
                    + "  }"
                    + "  var btn = document.querySelector('.play,.play-btn,.jw-display-icon-container,[aria-label=\"Play\"],.vjs-big-play-button,.plyr__control--overlaid,button.play-button');"
                    + "  if(btn){ btn.click(); return 'BTN_CLICKED'; }"
                    + "}catch(e){}"
                    + "return 'NONE';"
                    + "})();",
                    val -> {
                        if (val != null && val.contains("UNMUTED")) {
                            simulateTouchToUnmute();
                            Toast.makeText(this, "🔊 Audio Unmuted", Toast.LENGTH_SHORT).show();
                        } else if (val == null || val.contains("NONE")) {
                            simulateTouchToUnmute();
                        }
                        updateControlButtons();
                        showOsd();
                    });
            return;
        }
        if (player == null) return;
        if (player.isPlaying()) {
            player.pause();
            Toast.makeText(this, "Paused", Toast.LENGTH_SHORT).show();
        } else {
            player.play();
            Toast.makeText(this, "Playing", Toast.LENGTH_SHORT).show();
        }
        updateControlButtons();
        showOsd();
    }

    private void seekRelative(long deltaMs) {
        if (isWebEmbedMode && webVideoView != null) {
            if (deltaMs > 0) {
                webVideoView.evaluateJavascript(
                        "(function(){var v=document.querySelector('video'); if(v){v.currentTime=Math.min(v.duration||99999, v.currentTime+10);}})();",
                        null);
            } else {
                webVideoView.evaluateJavascript(
                        "(function(){var v=document.querySelector('video'); if(v){v.currentTime=Math.max(0, v.currentTime-10);}})();",
                        null);
            }
            showOsd();
            return;
        }
        if (player == null || isLive || !player.isCurrentMediaItemSeekable()) return;
        long duration = player.getDuration();
        long target = player.getCurrentPosition() + deltaMs;
        if (target < 0) target = 0;
        if (duration != C.TIME_UNSET && target > duration) target = duration;
        player.seekTo(target);
        showOsd();
        updateProgressText();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int keyCode = event.getKeyCode();
        if (keyCode == KeyEvent.KEYCODE_BACK || keyCode == KeyEvent.KEYCODE_ESCAPE) {
            if (event.getAction() == KeyEvent.ACTION_DOWN) {
                exitPlayer();
            }
            return true;
        }

        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            // Intercept media and navigation keys so WebView cannot consume or block them
            if (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER
                    || keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER || keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
                    || keyCode == KeyEvent.KEYCODE_MEDIA_PLAY || keyCode == KeyEvent.KEYCODE_MEDIA_PAUSE
                    || keyCode == KeyEvent.KEYCODE_DPAD_LEFT || keyCode == KeyEvent.KEYCODE_DPAD_RIGHT
                    || keyCode == KeyEvent.KEYCODE_DPAD_UP || keyCode == KeyEvent.KEYCODE_DPAD_DOWN
                    || keyCode == KeyEvent.KEYCODE_MENU || keyCode == KeyEvent.KEYCODE_INFO
                    || keyCode == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD || keyCode == KeyEvent.KEYCODE_MEDIA_REWIND
                    || keyCode == KeyEvent.KEYCODE_PROG_RED || keyCode == KeyEvent.KEYCODE_PROG_GREEN
                    || keyCode == KeyEvent.KEYCODE_CHANNEL_UP || keyCode == KeyEvent.KEYCODE_CHANNEL_DOWN) {
                if (onKeyDown(keyCode, event)) {
                    return true;
                }
            }
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    public boolean onKeyLongPress(int keyCode, KeyEvent event) {
        // Long-press D-pad Up = cycle display/zoom mode (or switch channel on live)
        if (keyCode == KeyEvent.KEYCODE_DPAD_UP) {
            if (isLive) {
                switchLiveChannel(-1);
                return true;
            }
            cycleZoomMode();
            return true;
        }
        return super.onKeyLongPress(keyCode, event);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (isChannelDrawerOpen) {
            if (keyCode == KeyEvent.KEYCODE_BACK || keyCode == KeyEvent.KEYCODE_ESCAPE
                    || keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) {
                hideChannelDrawer();
                return true;
            }
            uiHandler.removeCallbacks(hideChannelDrawerRunnable);
            uiHandler.postDelayed(hideChannelDrawerRunnable, DRAWER_AUTO_HIDE_MS);
            return super.onKeyDown(keyCode, event);
        }

        // PROG_RED / PROG_GREEN cycle zoom modes (Channel keys reserved for channel switching)
        if (keyCode == KeyEvent.KEYCODE_PROG_RED || keyCode == KeyEvent.KEYCODE_PROG_GREEN) {
            cycleZoomMode();
            return true;
        }

        if (isLive) {
            // Dedicated remote channel switching keys (Ch+, Ch-, PageUp, PageDown)
            if (keyCode == KeyEvent.KEYCODE_CHANNEL_UP || keyCode == KeyEvent.KEYCODE_PAGE_UP) {
                switchLiveChannel(1);
                return true;
            }
            if (keyCode == KeyEvent.KEYCODE_CHANNEL_DOWN || keyCode == KeyEvent.KEYCODE_PAGE_DOWN) {
                switchLiveChannel(-1);
                return true;
            }
            // Recall previous channel (Last Ch / Yellow button)
            if (keyCode == KeyEvent.KEYCODE_LAST_CHANNEL || keyCode == KeyEvent.KEYCODE_PROG_YELLOW) {
                recallPreviousChannel();
                return true;
            }
            // Toggle Favorite for playing channel (Blue key)
            if (keyCode == KeyEvent.KEYCODE_PROG_BLUE) {
                toggleCurrentChannelFavorite();
                return true;
            }
            // Direct channel number tuning via remote digits (0-9)
            if (keyCode >= KeyEvent.KEYCODE_0 && keyCode <= KeyEvent.KEYCODE_9) {
                handleNumberKeyTuning(keyCode - KeyEvent.KEYCODE_0);
                return true;
            }
            if (keyCode >= KeyEvent.KEYCODE_NUMPAD_0 && keyCode <= KeyEvent.KEYCODE_NUMPAD_9) {
                handleNumberKeyTuning(keyCode - KeyEvent.KEYCODE_NUMPAD_0);
                return true;
            }
            // UP arrow = previous channel, DOWN arrow = next channel
            if (keyCode == KeyEvent.KEYCODE_DPAD_UP) {
                hideOsd();
                switchLiveChannel(-1);
                return true;
            }
            if (keyCode == KeyEvent.KEYCODE_DPAD_DOWN) {
                hideOsd();
                switchLiveChannel(1);
                return true;
            }
            // LEFT arrow = open Quick Channel Guide
            if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT) {
                showChannelDrawer();
                return true;
            }
        }

        View currentFocus = getCurrentFocus();
        boolean hasButtonFocus = currentFocus instanceof TextView
                && currentFocus != titleView && currentFocus != timeView
                && currentFocus != statusBadge && currentFocus != hintView;

        if (isOsdVisible && hasButtonFocus) {
            showOsd();

            if (keyCode == KeyEvent.KEYCODE_DPAD_DOWN) {
                hideOsd();
                return true;
            }
            if (keyCode == KeyEvent.KEYCODE_DPAD_UP || keyCode == KeyEvent.KEYCODE_MENU || keyCode == KeyEvent.KEYCODE_INFO) {
                hideOsd();
                return true;
            }
            if (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER || keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER) {
                currentFocus.performClick();
                return true;
            }
            // Allow focus to navigate left/right
            return super.onKeyDown(keyCode, event);
        }

        switch (keyCode) {
            case KeyEvent.KEYCODE_VOLUME_MUTE:
            case KeyEvent.KEYCODE_MUTE:
                unmuteWebVideo(true);
                return true;

            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_NUMPAD_ENTER:
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                togglePlayPause();
                return true;

            case KeyEvent.KEYCODE_MEDIA_PLAY:
                if (isWebEmbedMode && webVideoView != null) {
                    webVideoView.evaluateJavascript("(function(){var v=document.querySelector('video'); if(v){v.muted=false;v.play();}})();", null);
                } else if (player != null) {
                    player.play();
                }
                showOsd();
                return true;

            case KeyEvent.KEYCODE_MEDIA_PAUSE:
                if (isWebEmbedMode && webVideoView != null) {
                    webVideoView.evaluateJavascript("(function(){var v=document.querySelector('video'); if(v)v.pause();})();", null);
                } else if (player != null) {
                    player.pause();
                }
                showOsd();
                return true;

            case KeyEvent.KEYCODE_DPAD_LEFT:
            case KeyEvent.KEYCODE_MEDIA_REWIND:
                if (isLive) {
                    showOsd();
                    if (btnServer != null) btnServer.requestFocus();
                } else {
                    seekRelative(-SEEK_STEP_MS);
                }
                return true;

            case KeyEvent.KEYCODE_DPAD_RIGHT:
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
                if (isLive) {
                    showOsd();
                    if (btnServer != null) btnServer.requestFocus();
                } else {
                    seekRelative(SEEK_STEP_MS);
                }
                return true;

            case KeyEvent.KEYCODE_DPAD_UP:
            case KeyEvent.KEYCODE_DPAD_DOWN:
            case KeyEvent.KEYCODE_MENU:
            case KeyEvent.KEYCODE_INFO:
                if (!isOsdVisible) {
                    showOsd();
                    if (btnPlayPause != null) btnPlayPause.requestFocus();
                } else {
                    hideOsd();
                }
                return true;

            case KeyEvent.KEYCODE_BACK:
            case KeyEvent.KEYCODE_ESCAPE:
                exitPlayer();
                return true;

            default:
                return super.onKeyDown(keyCode, event);
        }
    }

    @Override
    public void onBackPressed() {
        if (isChannelDrawerOpen) {
            hideChannelDrawer();
            return;
        }
        exitPlayer();
    }

    private void exitPlayer() {
        saveLastPlaybackPosition();
        uiHandler.removeCallbacksAndMessages(null);
        if (autoPlayAttemptRunnable != null) {
            uiHandler.removeCallbacks(autoPlayAttemptRunnable);
            autoPlayAttemptRunnable = null;
        }
        releasePlayer();
        if (webVideoView != null) {
            try {
                webVideoView.stopLoading();
                webVideoView.loadUrl("about:blank");
                webVideoView.destroy();
            } catch (Exception ignored) {}
            webVideoView = null;
        }
        finish();
    }

    private String formatTime(long ms) {
        if (ms < 0) ms = 0;
        long totalSeconds = ms / 1000L;
        long seconds = totalSeconds % 60;
        long minutes = (totalSeconds / 60) % 60;
        long hours = totalSeconds / 3600;
        if (hours > 0) {
            return String.format(java.util.Locale.US, "%02d:%02d:%02d", hours, minutes, seconds);
        }
        return String.format(java.util.Locale.US, "%02d:%02d", minutes, seconds);
    }

    private void enableImmersiveMode() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                getWindow().setDecorFitsSystemWindows(false);
                android.view.WindowInsetsController controller =
                        getWindow().getInsetsController();
                if (controller != null) {
                    controller.hide(android.view.WindowInsets.Type.systemBars());
                    controller.setSystemBarsBehavior(
                            android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                }
            } else {
                View decorView = getWindow().getDecorView();
                if (decorView != null) {
                    decorView.setSystemUiVisibility(
                            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                                    | View.SYSTEM_UI_FLAG_FULLSCREEN);
                }
            }
        } catch (Throwable t) {
            Log.w(TAG, "enableImmersiveMode ignored error: " + t.getMessage());
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enableImmersiveMode();
    }

    @Override
    public void onTrimMemory(int level) {
        super.onTrimMemory(level);
        if (webVideoView != null) {
            try {
                webVideoView.clearCache(false);
            } catch (Exception ignored) {}
        }
    }

    @Override
    public void onLowMemory() {
        super.onLowMemory();
        if (webVideoView != null) {
            try {
                webVideoView.clearCache(true);
            } catch (Exception ignored) {}
        }
    }
}
