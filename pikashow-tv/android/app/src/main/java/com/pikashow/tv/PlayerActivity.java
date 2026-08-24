package com.pikashow.tv;

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
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.RelativeLayout;
import android.widget.TextView;
import android.widget.Toast;

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

    private static final String USER_AGENT =
            "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) "
                    + "Chrome/120.0.0.0 Safari/537.36 AJO-TV";

    // v3.8.2 buffering: generous read windows. A short read timeout on a slow
    // origin (not the user's pipe — 40mbps is plenty) aborts segment reads
    // mid-flight and causes repeated rebuffers on Fire TV.
    private static final int CONNECT_TIMEOUT_MS = 8000;
    private static final int READ_TIMEOUT_MS = 15000;
    private static final long SEEK_STEP_MS = 10000L;
    private static final long OSD_HIDE_DELAY_MS = 4000L;
    private static final long FIRST_FRAME_TIMEOUT_MS = 8000L;
    private static final int FREEZE_STALL_SECONDS = 4;
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
        showOsd();
    }

    @Nullable private ExoPlayer player;
    @Nullable private AspectRatioFrameLayout aspectRatioFrameLayout;
    @Nullable private SurfaceView surfaceView;
    @Nullable private TextureView textureView;
    @Nullable private WebView webVideoView;

    private RelativeLayout osdOverlay;
    private ProgressBar bufferSpinner;
    private TextView titleView;
    private TextView timeView;
    private TextView statusBadge;
    private TextView hintView;

    private boolean isLive = false;
    private String streamUrl = "";
    private String streamTitle = "";
    private final List<String> serverQueue = new ArrayList<>();
    private int currentServerIdx = 0;
    private boolean isWebEmbedMode = false;

    private boolean useTextureViewFallback = false;
    private boolean softwareDecoderRetryDone = false;
    private long resumePositionMs = C.TIME_UNSET;

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

    private final Runnable hideOsdRunnable = this::hideOsd;

    private final Runnable progressRunnable = new Runnable() {
        @Override
        public void run() {
            updateProgressText();
            checkVideoFreeze();
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

        // Video-frame counter frozen for 4s while state says "playing" = the video
        // decoder stalled (audio renderer is a separate pipeline, so sound keeps
        // going — this is exactly the field symptom). v3.8.0: detector now watches
        // real rendered-frame counts instead of the audio-driven position clock,
        // which is why previous hardening never caught these freezes.
        if (freezeStableSeconds >= FREEZE_STALL_SECONDS && freezeRecoveryAttempts < MAX_FREEZE_RECOVERY_ATTEMPTS) {
            freezeRecoveryAttempts++;
            freezeStableSeconds = 0;
            Log.w(TAG, "VIDEO_FREEZE_DETECTED (attempt " + freezeRecoveryAttempts + "/"
                    + MAX_FREEZE_RECOVERY_ATTEMPTS + "): position stalled while playing.");
            Toast.makeText(this, "Fixing video playback...", Toast.LENGTH_SHORT).show();
            resumePositionMs = isLive ? C.TIME_UNSET : player.getCurrentPosition();
            useTextureViewFallback = true;
            softwareDecoderRetryDone = true; // go straight to software decode
            showOsd();
            initializeExoPlayer();
        } else if (freezeStableSeconds >= FREEZE_STALL_SECONDS) {
            // Already recovered once and it froze again — this mirror is bad.
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
            if (firstFrameRendered || player == null || isWebEmbedMode) return;
            if (!hasVideoTrack) return;

            Log.w(TAG, "NO_FIRST_FRAME after " + FIRST_FRAME_TIMEOUT_MS
                    + "ms with a video track present. Retrying with software decoder/texture.");

            if (!softwareDecoderRetryDone) {
                softwareDecoderRetryDone = true;
                useTextureViewFallback = true;
                resumePositionMs = isLive ? C.TIME_UNSET : player.getCurrentPosition();
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

        getWindow().setFlags(
                WindowManager.LayoutParams.FLAG_FULLSCREEN | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
                WindowManager.LayoutParams.FLAG_FULLSCREEN | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED);
        enableImmersiveMode();

        parseIntentData(getIntent());

        if (serverQueue.isEmpty()) {
            Toast.makeText(this, "No video URL provided", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }

        setContentView(buildUi());
        playCurrentStream();
        showOsd();
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

        if (!serverQueue.isEmpty()) {
            streamUrl = serverQueue.get(0);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        // Just pause — don't release the decoder. This handles transient system
        // overlays (volume panel, remote menu, Fire TV settings popup) without
        // the expensive codec teardown+rebuild cycle that onStop/onStart does.
        if (player != null && !isWebEmbedMode) {
            resumePositionMs = isLive ? C.TIME_UNSET : player.getCurrentPosition();
            player.setPlayWhenReady(false);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Resume playback if the player is still alive (onStop wasn't called).
        if (player != null && !isWebEmbedMode) {
            player.setPlayWhenReady(true);
        }
    }

    @Override
    protected void onStop() {
        super.onStop();
        // Fully release the decoder — app is now truly invisible (Home pressed,
        // task switched, etc.). Free the hardware codec for other apps.
        if (player != null) {
            resumePositionMs = isLive ? C.TIME_UNSET : player.getCurrentPosition();
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
        uiHandler.removeCallbacksAndMessages(null);
        releasePlayer();
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

    private View buildUi() {
        RelativeLayout root = new RelativeLayout(this);
        root.setLayoutParams(new RelativeLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // 1. Fullscreen Web Video Engine (for iframe/embed mirrors)
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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            ws.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        webVideoView.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.proceed();
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                Log.w(TAG, "Web video onReceivedError (" + errorCode + "): " + description);
                failoverToNextServer();
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                bufferSpinner.setVisibility(View.GONE);
                view.evaluateJavascript(
                        "(function(){"
                                + "if(document.body && (document.body.innerText.includes('Error code 522') || document.body.innerText.includes('Error code 520') || document.title.includes('502') || document.title.includes('504'))){"
                                + "  return 'ERROR_PAGE';"
                                + "}"
                                + "try{"
                                + "  if(window.ppl && typeof window.ppl.api === 'function'){ window.ppl.api('play'); }"
                                + "  if(window.player && typeof window.player.api === 'function'){ window.player.api('play'); }"
                                + "  var v=document.querySelector('video'); if(v){v.play();}"
                                + "  var btn=document.querySelector('.play,.play-btn,.jw-display-icon-container,[aria-label=\"Play\"],pjsdiv'); if(btn){btn.click();}"
                                + "}catch(e){}"
                                + "return 'OK';"
                                + "})();",
                        value -> {
                            if (value != null && value.contains("ERROR_PAGE")) {
                                Log.w(TAG, "Detected Cloudflare/host error page in WebView embed");
                                failoverToNextServer();
                            }
                        });
            }
        });
        webVideoView.setWebChromeClient(new WebChromeClient());
        root.addView(webVideoView);

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
        surfaceView.setZOrderMediaOverlay(true);
        surfaceView.getHolder().addCallback(new SurfaceHolder.Callback() {
            @Override
            public void surfaceCreated(@NonNull SurfaceHolder holder) {
                if (player != null && !useTextureViewFallback) {
                    player.setVideoSurface(holder.getSurface());
                }
            }

            @Override
            public void surfaceChanged(@NonNull SurfaceHolder holder, int format, int width, int height) { }

            @Override
            public void surfaceDestroyed(@NonNull SurfaceHolder holder) {
                if (player != null && !useTextureViewFallback) {
                    player.setVideoSurface(null);
                }
            }
        });
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
                new int[]{Color.parseColor("#CC000000"), Color.TRANSPARENT}));
        RelativeLayout.LayoutParams bottomParams = new RelativeLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        bottomParams.addRule(RelativeLayout.ALIGN_PARENT_BOTTOM);
        bottomBar.setLayoutParams(bottomParams);

        timeView = new TextView(this);
        timeView.setTextColor(Color.parseColor("#cbd5e1"));
        timeView.setTextSize(16);
        bottomBar.addView(timeView);

        hintView = new TextView(this);
        hintView.setTextColor(Color.parseColor("#94a3b8"));
        hintView.setTextSize(14);
        hintView.setPadding(0, 12, 0, 0);
        bottomBar.addView(hintView);

        osdOverlay.addView(bottomBar);
        root.addView(osdOverlay);

        applyStreamMetadataToUi();
        return root;
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
        if (hintView != null) {
            hintView.setText(isLive
                    ? "Remote: [OK] Play/Pause  \u2022  [\u25B2/\u25BC] Info  \u2022  [Back] Return to AJO TV"
                    : "Remote: [OK] Play/Pause  \u2022  [\u25C4/\u25BA] Seek 10s  \u2022  [Back] Return to AJO TV");
        }
    }

    // --------------------------------------------------------- stream dispatcher

    private boolean isWebEmbedUrl(String url) {
        if (TextUtils.isEmpty(url)) return false;
        String lower = url.toLowerCase(java.util.Locale.US);
        return lower.contains("/embed/") || lower.contains("/play/") || lower.contains("apiplayer.ru")
                || lower.contains("vidlink.pro") || lower.contains("vidsrc") || lower.contains("autoembed.co")
                || lower.contains("smashy.stream") || lower.contains("multiembed.mov") || lower.contains("rasta428jem.com")
                || lower.contains("2embed.cc") || lower.contains("embed.su") || lower.contains("v2.vidsrc.me");
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
            } else if (lower.contains("embed.su")) {
                headers.put("Referer", "https://embed.su/");
                headers.put("Origin", "https://embed.su");
            } else if (lower.contains("humma429gix.com")) {
                headers.put("Referer", "https://allmovielandapp.app/");
                headers.put("Origin", "https://allmovielandapp.app");
            } else if (lower.contains("autoembed.co")) {
                headers.put("Referer", "https://autoembed.co/");
                headers.put("Origin", "https://autoembed.co");
            } else if (lower.contains("2embed.cc")) {
                headers.put("Referer", "https://www.2embed.cc/");
                headers.put("Origin", "https://www.2embed.cc");
            } else if (lower.contains("vidsrc")) {
                headers.put("Referer", "https://vidsrc.cc/");
                headers.put("Origin", "https://vidsrc.cc");
            } else if (lower.contains("multiembed.mov")) {
                headers.put("Referer", "https://multiembed.mov/");
                headers.put("Origin", "https://multiembed.mov");
            } else if (lower.contains("smashy.stream")) {
                headers.put("Referer", "https://smashy.stream/");
                headers.put("Origin", "https://smashy.stream");
            } else if (lower.contains("apiplayer.ru")) {
                headers.put("Referer", "https://apiplayer.ru/");
                headers.put("Origin", "https://apiplayer.ru");
            } else if (lower.contains("v2.vidsrc.me") || lower.contains("vidsrc.me") || lower.contains("vidsrc.cc") || lower.contains("vidsrc.to")) {
                headers.put("Referer", "https://vidsrc.cc/");
                headers.put("Origin", "https://vidsrc.cc");
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
        if (webVideoView != null) {
            webVideoView.setVisibility(View.VISIBLE);
            Map<String, String> headers = buildEmbedHeaders(url);
            webVideoView.loadUrl(url, headers);
            webVideoView.requestFocus();
        }

        bufferSpinner.setVisibility(View.VISIBLE);
        // Hide spinner on page-finished, not after a fixed delay — embed pages
        // regularly take >3.5s to resolve the Cloudflare interstitial.
    }

    private void playInNativeExoPlayer(String url) {
        isWebEmbedMode = false;
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
        releasePlayer();

        firstFrameRendered = false;
        hasVideoTrack = false;

        DefaultRenderersFactory renderersFactory = new DefaultRenderersFactory(this) {
            @Override
            protected void buildVideoRenderers(
                    android.content.Context context,
                    @DefaultRenderersFactory.ExtensionRendererMode int extensionRendererMode,
                    androidx.media3.exoplayer.mediacodec.MediaCodecSelector mediaCodecSelector,
                    boolean enableDecoderFallback,
                    Handler eventHandler,
                    androidx.media3.exoplayer.video.VideoRendererEventListener eventListener,
                    long allowedVideoJoiningTimeMs,
                    java.util.ArrayList<androidx.media3.exoplayer.Renderer> out) {
                androidx.media3.exoplayer.video.MediaCodecVideoRenderer videoRenderer =
                        new androidx.media3.exoplayer.video.MediaCodecVideoRenderer(
                                context,
                                getCodecAdapterFactory(),
                                mediaCodecSelector,
                                allowedVideoJoiningTimeMs,
                                enableDecoderFallback,
                                eventHandler,
                                eventListener,
                                50) {
                            @Override
                            protected boolean shouldDropBuffersToKeyframe(long earlyUs, long elapsedRealtimeUs, boolean isLastBuffer) {
                                return false;
                            }

                            @Override
                            protected boolean shouldDropOutputBuffer(long earlyUs, long elapsedRealtimeUs, boolean isLastBuffer) {
                                return earlyUs < -1000000L;
                            }
                        };
                out.add(videoRenderer);
            }
        }
                .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_PREFER)
                .setEnableDecoderFallback(true)
                .setAllowedVideoJoiningTimeMs(15000L)
                .setMediaCodecSelector(
                        softwareDecoderRetryDone
                                ? (mimeType, requiresSecureDecoder, requiresTunnelingDecoder) -> {
                                    java.util.List<androidx.media3.exoplayer.mediacodec.MediaCodecInfo> all =
                                            androidx.media3.exoplayer.mediacodec.MediaCodecUtil.getDecoderInfos(
                                                    mimeType, requiresSecureDecoder, requiresTunnelingDecoder);
                                    java.util.List<androidx.media3.exoplayer.mediacodec.MediaCodecInfo> software =
                                            new java.util.ArrayList<>();
                                    for (androidx.media3.exoplayer.mediacodec.MediaCodecInfo info : all) {
                                        if (!info.hardwareAccelerated) software.add(info);
                                    }
                                    return software.isEmpty() ? all : software;
                                }
                                : androidx.media3.exoplayer.mediacodec.MediaCodecSelector.DEFAULT);

        androidx.media3.exoplayer.upstream.DefaultBandwidthMeter bandwidthMeter =
                new androidx.media3.exoplayer.upstream.DefaultBandwidthMeter.Builder(this)
                        .setInitialBitrateEstimate(4_000_000L)
                        .build();

        androidx.media3.exoplayer.trackselection.AdaptiveTrackSelection.Factory adaptiveFactory =
                new androidx.media3.exoplayer.trackselection.AdaptiveTrackSelection.Factory(
                        /* minDurationForQualityIncreaseMs= */ 5000,
                        /* maxDurationForQualityDecreaseMs= */ 10000,
                        /* minDurationToRetainAfterDiscardMs= */
                                25000,
                        /* bandwidthFraction= */ 0.7f);

        DefaultTrackSelector trackSelector = new DefaultTrackSelector(this, adaptiveFactory);
        trackSelector.setParameters(trackSelector.buildUponParameters()
                .setPreferredVideoMimeType(MimeTypes.VIDEO_H264)
                .setMaxVideoSize(3840, 2160)
                .setMaxVideoFrameRate(60)
                .setExceedVideoConstraintsIfNecessary(true)
                .setTunnelingEnabled(false)
                .setForceLowestBitrate(false));

        // Nuvio-style RAM-adaptive buffering: FireTV Stick 4K (1.5GB) gets
        // right-sized buffers instead of one-size-fits-all. Bigger target on
        // bigger TVs eliminates mid-stream rebuffering.
        int totalMemMb;
        android.app.ActivityManager.MemoryInfo mi = new android.app.ActivityManager.MemoryInfo();
        ((android.app.ActivityManager) getSystemService(ACTIVITY_SERVICE)).getMemoryInfo(mi);
        long gb = 1024L * 1024L * 1024L;
        if (mi.totalMem <= 0) {
            totalMemMb = 250;
        } else if (mi.totalMem < 1.15 * gb) {
            totalMemMb = 150;   // 1GB-class sticks
        } else if (mi.totalMem < 1.45 * gb) {
            totalMemMb = 200;   // FireTV Stick 4K (1.5GB)
        } else if (mi.totalMem < 2.3 * gb) {
            totalMemMb = 250;
        } else if (mi.totalMem < 3.2 * gb) {
            totalMemMb = 500;
        } else if (mi.totalMem < 4.8 * gb) {
            totalMemMb = 1000;
        } else {
            totalMemMb = 1600;  // high-end TVs
        }
        int targetBufferBytes = Math.min(totalMemMb * 1024 * 1024, Integer.MAX_VALUE);

        DefaultLoadControl loadControl = new DefaultLoadControl.Builder()
                .setAllocator(new androidx.media3.exoplayer.upstream.DefaultAllocator(true, 256 * 1024))
                .setBufferDurationsMs(
                        /* minBufferMs= */ isLive ? 6000 : 30000,
                        /* maxBufferMs= */ isLive ? 25000 : 90000,
                        /* bufferForPlaybackMs= */ isLive ? 1000 : 2500,
                        /* bufferForPlaybackAfterRebufferMs= */ isLive ? 2500 : 5000)
                .setTargetBufferBytes(targetBufferBytes)
                .setPrioritizeTimeOverSizeThresholds(false)
                .setBackBuffer(12000, true)
                .build();

        ExoPlayer exo = new ExoPlayer.Builder(this, renderersFactory)
                .setTrackSelector(trackSelector)
                .setLoadControl(loadControl)
                .setBandwidthMeter(bandwidthMeter)
                .setMediaSourceFactory(new DefaultMediaSourceFactory(buildDataSourceFactory()))
                .build();

        exo.setHandleAudioBecomingNoisy(true);
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
    }

    private MediaSource buildMediaSource(String url) {
        DataSource.Factory dataSourceFactory = buildDataSourceFactory();
        Uri uri = Uri.parse(url);

        MediaItem.Builder itemBuilder = new MediaItem.Builder().setUri(uri);
        if (isLive) {
            itemBuilder.setLiveConfiguration(
                    new MediaItem.LiveConfiguration.Builder()
                            .setMinPlaybackSpeed(0.95f)
                            .setMaxPlaybackSpeed(1.05f)
                            .setTargetOffsetMs(8000L)
                            .build());
        }

        String lower = url.toLowerCase(java.util.Locale.US);
        boolean looksLikeHls = lower.contains(".m3u8") || lower.contains("/getm3u8/")
                || lower.contains("m3u8") || isLive;

        if (looksLikeHls) {
            itemBuilder.setMimeType(MimeTypes.APPLICATION_M3U8);
            DefaultHlsExtractorFactory hlsExtractorFactory = new DefaultHlsExtractorFactory(
                    DefaultTsPayloadReaderFactory.FLAG_ALLOW_NON_IDR_KEYFRAMES
                            | DefaultTsPayloadReaderFactory.FLAG_DETECT_ACCESS_UNITS
                            | DefaultTsPayloadReaderFactory.FLAG_IGNORE_SPLICE_INFO_STREAM,
                    /* exposeCea608WhenMissingDeclarations= */ true);
            return new HlsMediaSource.Factory(dataSourceFactory)
                    .setExtractorFactory(hlsExtractorFactory)
                    .setAllowChunklessPreparation(false)
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

    private DataSource.Factory buildDataSourceFactory() {
        Map<String, String> defaultHeaders = new HashMap<>();
        defaultHeaders.put("Accept", "*/*");
        defaultHeaders.put("Referer", "https://ajo.co.in/");

        HttpDataSource.Factory httpFactory;
        try {
            OkHttpClient client = buildPermissiveOkHttpClient();
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

        return new DefaultDataSource.Factory(this, httpFactory);
    }

    private OkHttpClient buildPermissiveOkHttpClient() throws Exception {
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
                // v3.9.0: reduced from 120s — a dead segment was hanging the
                // player for 2 full minutes before failover could trigger.
                .callTimeout(15, TimeUnit.SECONDS)
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
        if (currentServerIdx + 1 < serverQueue.size()) {
            currentServerIdx++;
            uiHandler.post(() -> {
                Toast.makeText(PlayerActivity.this, "Switching to next mirror (" + (currentServerIdx + 1) + "/" + serverQueue.size() + ")...", Toast.LENGTH_SHORT).show();
                playCurrentStream();
            });
        } else {
            uiHandler.post(() -> {
                Toast.makeText(PlayerActivity.this, "Stream unavailable across all mirrors. Returning...", Toast.LENGTH_LONG).show();
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
                    finish();
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

            // Failover to next stream server in queue
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

            if (isLive && code == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW) {
                if (player != null) {
                    player.seekToDefaultPosition();
                    player.prepare();
                }
                return;
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
        else showOsd();
    }

    private void updateProgressText() {
        if (timeView == null) return;
        if (isLive || isWebEmbedMode) {
            timeView.setText("LIVE HD BROADCAST");
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
                    "(function(){var v=document.querySelector('video'); if(v){if(v.paused)v.play();else v.pause();}else{var btn=document.querySelector('.play,.play-btn,.jw-display-icon-container,[aria-label=\"Play\"]'); if(btn)btn.click();}})();",
                    null);
            showOsd();
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
    public boolean onKeyLongPress(int keyCode, KeyEvent event) {
        // Long-press D-pad Up = cycle display/zoom mode
        if (keyCode == KeyEvent.KEYCODE_DPAD_UP) {
            cycleZoomMode();
            return true;
        }
        return super.onKeyLongPress(keyCode, event);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        // PROG_UP / PROG_DOWN / channel keys also cycle zoom modes
        if (keyCode == KeyEvent.KEYCODE_PROG_RED || keyCode == KeyEvent.KEYCODE_PROG_GREEN
                || keyCode == KeyEvent.KEYCODE_CHANNEL_UP || keyCode == KeyEvent.KEYCODE_CHANNEL_DOWN) {
            cycleZoomMode();
            return true;
        }
        // Use KEYCODE_DPAD_UP long-press; short press handled below (OSD)
        switch (keyCode) {
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_NUMPAD_ENTER:
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                togglePlayPause();
                return true;

            case KeyEvent.KEYCODE_MEDIA_PLAY:
                if (isWebEmbedMode && webVideoView != null) {
                    webVideoView.evaluateJavascript("(function(){var v=document.querySelector('video'); if(v)v.play();})();", null);
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
                if (isLive) showOsd();
                else seekRelative(-SEEK_STEP_MS);
                return true;

            case KeyEvent.KEYCODE_DPAD_RIGHT:
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
                if (isLive) showOsd();
                else seekRelative(SEEK_STEP_MS);
                return true;

            case KeyEvent.KEYCODE_DPAD_UP:
            case KeyEvent.KEYCODE_DPAD_DOWN:
            case KeyEvent.KEYCODE_MENU:
            case KeyEvent.KEYCODE_INFO:
                toggleOsd();
                return true;

            case KeyEvent.KEYCODE_BACK:
            case KeyEvent.KEYCODE_ESCAPE:
                uiHandler.removeCallbacksAndMessages(null);
                releasePlayer();
                finish();
                return true;

            default:
                return super.onKeyDown(keyCode, event);
        }
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
        View decorView = getWindow().getDecorView();
        decorView.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enableImmersiveMode();
    }
}
