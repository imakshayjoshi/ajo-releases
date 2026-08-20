package com.pikashow.tv;

import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.util.Log;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.SurfaceView;
import android.view.TextureView;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
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

import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.util.Arrays;
import java.util.HashMap;
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
 * <p>Uses hardware-accelerated SurfaceView with setZOrderMediaOverlay(true)
 * inside an AspectRatioFrameLayout. This gives 0% CPU/GPU overhead for 60fps Live TV,
 * eliminates still-image freezing, and avoids hardware hole-punch occlusion bugs.
 */
@OptIn(markerClass = UnstableApi.class)
public class PlayerActivity extends AppCompatActivity {

    private static final String TAG = "AJOPlayer";

    private static final String USER_AGENT =
            "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) "
                    + "Chrome/120.0.0.0 Safari/537.36 AJO-TV";

    private static final int CONNECT_TIMEOUT_MS = 20000;
    private static final int READ_TIMEOUT_MS = 30000;
    private static final long SEEK_STEP_MS = 10000L;
    private static final long OSD_HIDE_DELAY_MS = 4000L;

    /**
     * How long to wait for a decoded frame to reach the surface before retrying with
     * software decoders if hardware decoder hangs.
     */
    private static final long FIRST_FRAME_TIMEOUT_MS = 8000L;

    @Nullable private ExoPlayer player;
    @Nullable private AspectRatioFrameLayout aspectRatioFrameLayout;
    @Nullable private SurfaceView surfaceView;
    @Nullable private TextureView textureView;

    private RelativeLayout osdOverlay;
    private ProgressBar bufferSpinner;
    private TextView titleView;
    private TextView timeView;
    private TextView statusBadge;
    private TextView hintView;

    private boolean isLive = false;
    private String streamUrl = "";
    private String streamTitle = "";

    private boolean useTextureViewFallback = false;
    private boolean softwareDecoderRetryDone = false;
    private long resumePositionMs = C.TIME_UNSET;

    private boolean firstFrameRendered = false;
    private boolean hasVideoTrack = false;

    private final Handler uiHandler = new Handler(Looper.getMainLooper());
    private boolean isOsdVisible = true;

    private final Runnable hideOsdRunnable = this::hideOsd;

    private final Runnable progressRunnable = new Runnable() {
        @Override
        public void run() {
            updateProgressText();
            uiHandler.postDelayed(this, 1000L);
        }
    };

    private final Runnable firstFrameWatchdog = new Runnable() {
        @Override
        public void run() {
            if (firstFrameRendered || player == null) return;
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
                initializePlayer();
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

        streamUrl = getIntent().getStringExtra("url");
        streamTitle = getIntent().getStringExtra("title");
        isLive = getIntent().getBooleanExtra("isLive", false);

        if (TextUtils.isEmpty(streamUrl)) {
            Toast.makeText(this, "No video URL provided", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }
        if (TextUtils.isEmpty(streamTitle)) {
            streamTitle = isLive ? "Live Channel" : "Video Stream";
        }

        setContentView(buildUi());
        initializePlayer();
        showOsd();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent == null) return;
        setIntent(intent);

        String newUrl = intent.getStringExtra("url");
        if (TextUtils.isEmpty(newUrl)) return;

        streamUrl = newUrl;
        isLive = intent.getBooleanExtra("isLive", false);
        streamTitle = intent.getStringExtra("title");
        if (TextUtils.isEmpty(streamTitle)) {
            streamTitle = isLive ? "Live Channel" : "Video Stream";
        }

        softwareDecoderRetryDone = false;
        resumePositionMs = C.TIME_UNSET;

        applyStreamMetadataToUi();
        initializePlayer();
        showOsd();
    }

    @Override
    protected void onStop() {
        super.onStop();
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
        if (player == null && !TextUtils.isEmpty(streamUrl)) {
            initializePlayer();
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
    }

    // ------------------------------------------------------------------- the UI

    private View buildUi() {
        RelativeLayout root = new RelativeLayout(this);
        root.setLayoutParams(new RelativeLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        RelativeLayout.LayoutParams fill = new RelativeLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        fill.addRule(RelativeLayout.CENTER_IN_PARENT);

        aspectRatioFrameLayout = new AspectRatioFrameLayout(this);
        aspectRatioFrameLayout.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FIT);
        aspectRatioFrameLayout.setLayoutParams(fill);

        // Hardware-direct SurfaceView with Z-Order Media Overlay (Netflix/YouTube pattern)
        surfaceView = new SurfaceView(this);
        surfaceView.setZOrderMediaOverlay(true);
        FrameLayout.LayoutParams surfaceParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.CENTER);
        surfaceView.setLayoutParams(surfaceParams);
        aspectRatioFrameLayout.addView(surfaceView);

        // Fallback TextureView
        textureView = new TextureView(this);
        textureView.setOpaque(true);
        textureView.setVisibility(View.GONE);
        textureView.setLayoutParams(surfaceParams);
        aspectRatioFrameLayout.addView(textureView);

        root.addView(aspectRatioFrameLayout);

        bufferSpinner = new ProgressBar(this);
        bufferSpinner.setIndeterminate(true);
        RelativeLayout.LayoutParams spinnerParams = new RelativeLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        spinnerParams.addRule(RelativeLayout.CENTER_IN_PARENT);
        bufferSpinner.setLayoutParams(spinnerParams);
        root.addView(bufferSpinner);

        osdOverlay = new RelativeLayout(this);
        osdOverlay.setLayoutParams(new RelativeLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        osdOverlay.setBackgroundColor(Color.TRANSPARENT);
        osdOverlay.setClickable(false);
        osdOverlay.setFocusable(false);

        // --- top bar: LIVE/HD badge + title ---
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
        topBar.addView(titleView);

        osdOverlay.addView(topBar);

        // --- bottom bar: elapsed/duration + remote hint ---
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

    // -------------------------------------------------------------- the player

    private void initializePlayer() {
        releasePlayer();

        firstFrameRendered = false;
        hasVideoTrack = false;

        DefaultRenderersFactory renderersFactory = new DefaultRenderersFactory(this)
                .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_PREFER)
                .setEnableDecoderFallback(true)
                .setAllowedVideoJoiningTimeMs(10000L)
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

        DefaultTrackSelector trackSelector = new DefaultTrackSelector(this);
        trackSelector.setParameters(trackSelector.buildUponParameters()
                .setMaxVideoSize(1920, 1080)
                .setMaxVideoBitrate(8_000_000)
                .setTunnelingEnabled(false)
                .setForceLowestBitrate(false));

        DefaultLoadControl loadControl = new DefaultLoadControl.Builder()
                .setBufferDurationsMs(
                        /* minBufferMs= */ isLive ? 8000 : 15000,
                        /* maxBufferMs= */ isLive ? 30000 : 50000,
                        /* bufferForPlaybackMs= */ isLive ? 2000 : 1500,
                        /* bufferForPlaybackAfterRebufferMs= */ isLive ? 3500 : 3000)
                .setPrioritizeTimeOverSizeThresholds(true)
                .build();

        ExoPlayer exo = new ExoPlayer.Builder(this, renderersFactory)
                .setTrackSelector(trackSelector)
                .setLoadControl(loadControl)
                .setMediaSourceFactory(new DefaultMediaSourceFactory(buildDataSourceFactory()))
                .build();

        exo.setHandleAudioBecomingNoisy(true);
        exo.addListener(new PlayerEventListener());

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

        return new OkHttpClient.Builder()
                .sslSocketFactory(sslSocketFactory, trustAll)
                .hostnameVerifier((hostname, session) -> true)
                .connectionSpecs(Arrays.asList(
                        ConnectionSpec.MODERN_TLS,
                        ConnectionSpec.COMPATIBLE_TLS,
                        ConnectionSpec.CLEARTEXT))
                .connectTimeout(CONNECT_TIMEOUT_MS, TimeUnit.MILLISECONDS)
                .readTimeout(READ_TIMEOUT_MS, TimeUnit.MILLISECONDS)
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
            Log.e(TAG, "PLAYER_ERROR: " + error.getMessage() + " (code " + error.errorCode + ")", error);
            bufferSpinner.setVisibility(View.GONE);

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
                    initializePlayer();
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
            Log.i(TAG, "TRACKS: video=" + videoTracks + " audio=" + audioTracks);
        }
    }

    // ---------------------------------------------------------------- OSD + keys

    private void showOsd() {
        osdOverlay.setVisibility(View.VISIBLE);
        isOsdVisible = true;
        scheduleHideOsd();
    }

    private void hideOsd() {
        osdOverlay.setVisibility(View.GONE);
        isOsdVisible = false;
    }

    private void scheduleHideOsd() {
        uiHandler.removeCallbacks(hideOsdRunnable);
        uiHandler.postDelayed(hideOsdRunnable, OSD_HIDE_DELAY_MS);
    }

    private void updateProgressText() {
        if (player == null || timeView == null) return;
        if (isLive || player.getDuration() == C.TIME_UNSET) {
            timeView.setText("Live broadcast");
            return;
        }
        timeView.setText(formatTime(player.getCurrentPosition())
                + " / " + formatTime(player.getDuration()));
    }

    private void togglePlayPause() {
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
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_NUMPAD_ENTER:
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                togglePlayPause();
                return true;

            case KeyEvent.KEYCODE_MEDIA_PLAY:
                if (player != null) player.play();
                showOsd();
                return true;

            case KeyEvent.KEYCODE_MEDIA_PAUSE:
                if (player != null) player.pause();
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
                if (isOsdVisible) hideOsd();
                else showOsd();
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
