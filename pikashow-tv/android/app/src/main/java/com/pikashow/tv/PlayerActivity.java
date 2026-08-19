package com.pikashow.tv;

import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.util.Log;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.SurfaceView;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
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
import androidx.media3.ui.PlayerView;

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
 * <p>Why this exists: on legacy Fire OS builds the Chromium/Silk WebView does not
 * hole-punch the hardware video plane for inline {@code <video>} + MSE (Hls.js)
 * playback. The decoded surface sits behind the WebView while the WebView paints
 * an opaque black layer over it — audio plays, video is pitch black.
 *
 * <p>The fix is to render outside the WebView entirely: AndroidX Media3 / ExoPlayer
 * decoding onto a real {@link SurfaceView}, which composites directly with the
 * hardware video plane.
 *
 * <p>Also replaces {@code android.widget.VideoView}, whose NuPlayer/MediaPlayer
 * backend cannot reliably parse modern chunked HLS manifests, tokenized TS
 * segments, or requests needing custom headers on old MediaTek/Amlogic chipsets.
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

    @Nullable private ExoPlayer player;
    @Nullable private PlayerView playerView;
    @Nullable private SurfaceView fallbackSurfaceView;

    private RelativeLayout osdOverlay;
    private ProgressBar bufferSpinner;
    private TextView titleView;
    private TextView timeView;
    private TextView statusBadge;
    private TextView hintView;

    private boolean isLive = false;
    private String streamUrl = "";
    private String streamTitle = "";

    /** Set once we have already retried with software decoders, to avoid a retry loop. */
    private boolean softwareDecoderRetryDone = false;
    private long resumePositionMs = C.TIME_UNSET;

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

    // ---------------------------------------------------------------- lifecycle

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Title bar is already suppressed by AppTheme.Player (windowNoTitle=true);
        // calling requestWindowFeature() on an AppCompatActivity throws.
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
    protected void onStop() {
        super.onStop();
        // Fire TV can background the activity (Home button); release the decoder so
        // the next app gets the hardware codec back on 1GB devices.
        if (player != null) {
            resumePositionMs = player.getCurrentPosition();
            player.setPlayWhenReady(false);
        }
    }

    @Override
    protected void onStart() {
        super.onStart();
        if (player != null && !player.isPlaying() && player.getPlaybackState() != Player.STATE_ENDED) {
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
        root.setBackgroundColor(Color.BLACK);
        root.setLayoutParams(new RelativeLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        RelativeLayout.LayoutParams fill = new RelativeLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);

        // Media3 PlayerView defaults to a SurfaceView output, which is exactly the
        // hardware-composited path we need. If inflating it fails on an unusual
        // legacy theme, drop to a bare SurfaceView rather than dying.
        try {
            PlayerView view = new PlayerView(this);
            view.setUseController(false);           // we draw our own 10-foot OSD
            view.setKeepContentOnPlayerReset(true);
            view.setShutterBackgroundColor(Color.BLACK);
            view.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FIT);
            view.setLayoutParams(fill);
            playerView = view;
            root.addView(view);
        } catch (Throwable t) {
            Log.w(TAG, "PlayerView unavailable, falling back to raw SurfaceView", t);
            SurfaceView surface = new SurfaceView(this);
            surface.setLayoutParams(fill);
            fallbackSurfaceView = surface;
            root.addView(surface);
        }

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
        osdOverlay.setBackgroundColor(Color.parseColor("#66000000"));
        osdOverlay.setPadding(48, 36, 48, 36);

        // --- top bar: LIVE/HD badge + title ---
        LinearLayout topBar = new LinearLayout(this);
        topBar.setOrientation(LinearLayout.HORIZONTAL);
        topBar.setGravity(Gravity.CENTER_VERTICAL);
        RelativeLayout.LayoutParams topParams = new RelativeLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        topParams.addRule(RelativeLayout.ALIGN_PARENT_TOP);
        topBar.setLayoutParams(topParams);

        statusBadge = new TextView(this);
        statusBadge.setText(isLive ? "\u25CF LIVE" : "HD");
        statusBadge.setTextColor(Color.BLACK);
        statusBadge.setTextSize(14);
        statusBadge.setTypeface(Typeface.DEFAULT_BOLD);
        statusBadge.setPadding(16, 6, 16, 6);
        statusBadge.setBackgroundColor(isLive ? Color.parseColor("#ef4444") : Color.parseColor("#38bdf8"));
        topBar.addView(statusBadge);

        titleView = new TextView(this);
        titleView.setText("  " + streamTitle);
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
        RelativeLayout.LayoutParams bottomParams = new RelativeLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        bottomParams.addRule(RelativeLayout.ALIGN_PARENT_BOTTOM);
        bottomBar.setLayoutParams(bottomParams);

        timeView = new TextView(this);
        timeView.setText(isLive ? "Live broadcast" : "00:00 / 00:00");
        timeView.setTextColor(Color.parseColor("#cbd5e1"));
        timeView.setTextSize(16);
        bottomBar.addView(timeView);

        hintView = new TextView(this);
        hintView.setText(isLive
                ? "Remote: [OK] Play/Pause  \u2022  [\u25B2/\u25BC] Info  \u2022  [Back] Return to AJO TV"
                : "Remote: [OK] Play/Pause  \u2022  [\u25C4/\u25BA] Seek 10s  \u2022  [Back] Return to AJO TV");
        hintView.setTextColor(Color.parseColor("#94a3b8"));
        hintView.setTextSize(14);
        hintView.setPadding(0, 12, 0, 0);
        bottomBar.addView(hintView);

        osdOverlay.addView(bottomBar);
        root.addView(osdOverlay);

        return root;
    }

    // -------------------------------------------------------------- the player

    private void initializePlayer() {
        releasePlayer();

        // Prefer bundled software extension decoders when a hardware decoder is
        // unavailable, and allow ExoPlayer to fall back through the decoder list
        // when a Fire TV MediaCodec instance fails to configure or init.
        DefaultRenderersFactory renderersFactory = new DefaultRenderersFactory(this)
                .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_PREFER)
                .setEnableDecoderFallback(true)
                .setMediaCodecSelector(
                        softwareDecoderRetryDone
                                // Second attempt: skip hardware decoders entirely.
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
                // 32" 720p/1080p panel on ~1GB RAM: don't let ABR climb into 4K and
                // blow the decoder budget.
                .setMaxVideoSize(1920, 1080)
                .setMaxVideoBitrate(8_000_000)
                .setForceLowestBitrate(false));

        DefaultLoadControl loadControl = new DefaultLoadControl.Builder()
                .setBufferDurationsMs(
                        /* minBufferMs= */ isLive ? 5000 : 15000,
                        /* maxBufferMs= */ isLive ? 20000 : 50000,
                        /* bufferForPlaybackMs= */ 1500,
                        /* bufferForPlaybackAfterRebufferMs= */ 3000)
                .build();

        ExoPlayer exo = new ExoPlayer.Builder(this, renderersFactory)
                .setTrackSelector(trackSelector)
                .setLoadControl(loadControl)
                .setMediaSourceFactory(new DefaultMediaSourceFactory(buildDataSourceFactory()))
                .build();

        exo.setHandleAudioBecomingNoisy(true);
        exo.addListener(new PlayerEventListener());

        if (playerView != null) {
            playerView.setPlayer(exo);
        } else if (fallbackSurfaceView != null) {
            exo.setVideoSurfaceView(fallbackSurfaceView);
        }

        exo.setMediaSource(buildMediaSource(streamUrl));
        if (resumePositionMs != C.TIME_UNSET && !isLive) {
            exo.seekTo(resumePositionMs);
        }
        exo.prepare();
        exo.setPlayWhenReady(true);

        player = exo;
        uiHandler.post(progressRunnable);
    }

    /**
     * HLS gets an explicit {@link HlsMediaSource} with permissive TS parsing —
     * IPTV playlists routinely start mid-GOP or omit access-unit boundaries, which
     * the strict defaults reject (and which is one way a stream ends up audio-only).
     */
    private MediaSource buildMediaSource(String url) {
        DataSource.Factory dataSourceFactory = buildDataSourceFactory();
        Uri uri = Uri.parse(url);

        MediaItem.Builder itemBuilder = new MediaItem.Builder().setUri(uri);
        if (isLive) {
            itemBuilder.setLiveConfiguration(
                    new MediaItem.LiveConfiguration.Builder().setMaxPlaybackSpeed(1.02f).build());
        }

        String lower = url.toLowerCase(java.util.Locale.US);
        boolean looksLikeHls = lower.contains(".m3u8") || lower.contains("/getm3u8/")
                || lower.contains("m3u8") || isLive;

        if (looksLikeHls) {
            itemBuilder.setMimeType(MimeTypes.APPLICATION_M3U8);
            DefaultHlsExtractorFactory hlsExtractorFactory = new DefaultHlsExtractorFactory(
                    DefaultTsPayloadReaderFactory.FLAG_ALLOW_NON_IDR_KEYFRAMES
                            | DefaultTsPayloadReaderFactory.FLAG_DETECT_ACCESS_UNITS,
                    /* exposeCea608WhenMissingDeclarations= */ true);
            return new HlsMediaSource.Factory(dataSourceFactory)
                    .setExtractorFactory(hlsExtractorFactory)
                    // Read the first segment instead of trusting the playlist's
                    // CODECS attribute — legacy IPTV manifests lie about it.
                    .setAllowChunklessPreparation(false)
                    .createMediaSource(itemBuilder.build());
        }

        DefaultExtractorsFactory extractorsFactory = new DefaultExtractorsFactory()
                .setTsExtractorFlags(
                        DefaultTsPayloadReaderFactory.FLAG_ALLOW_NON_IDR_KEYFRAMES
                                | DefaultTsPayloadReaderFactory.FLAG_DETECT_ACCESS_UNITS)
                .setConstantBitrateSeekingEnabled(true);

        return new ProgressiveMediaSource.Factory(dataSourceFactory, extractorsFactory)
                .createMediaSource(itemBuilder.build());
    }

    /**
     * HTTP stack for stream loading. Prefers OkHttp (better redirect + keep-alive
     * behaviour on old Android) with a permissive TLS trust manager, because these
     * 2014-2016 panels ship root CA stores that expired years ago and would
     * otherwise abort the handshake on perfectly good HTTPS CDNs.
     */
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

        // DefaultDataSource wraps the HTTP factory so file:// and content:// URIs
        // (local downloads) keep working through the same player.
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
        SSLSocketFactory socketFactory = sslContext.getSocketFactory();

        return new OkHttpClient.Builder()
                .connectTimeout(CONNECT_TIMEOUT_MS, TimeUnit.MILLISECONDS)
                .readTimeout(READ_TIMEOUT_MS, TimeUnit.MILLISECONDS)
                .writeTimeout(READ_TIMEOUT_MS, TimeUnit.MILLISECONDS)
                .followRedirects(true)
                .followSslRedirects(true)   // allow http -> https and back
                .retryOnConnectionFailure(true)
                .sslSocketFactory(socketFactory, trustAll)
                .hostnameVerifier((hostname, session) -> true)
                .connectionSpecs(Arrays.asList(
                        ConnectionSpec.MODERN_TLS,
                        ConnectionSpec.COMPATIBLE_TLS,
                        ConnectionSpec.CLEARTEXT))
                .build();
    }

    private void releasePlayer() {
        if (player != null) {
            player.removeMediaItems(0, player.getMediaItemCount());
            player.release();
            player = null;
        }
        if (playerView != null) {
            playerView.setPlayer(null);
        }
    }

    private final class PlayerEventListener implements Player.Listener {

        @Override
        public void onPlaybackStateChanged(int state) {
            switch (state) {
                case Player.STATE_BUFFERING:
                    bufferSpinner.setVisibility(View.VISIBLE);
                    break;
                case Player.STATE_READY:
                    bufferSpinner.setVisibility(View.GONE);
                    scheduleHideOsd();
                    break;
                case Player.STATE_ENDED:
                    finish();
                    break;
                case Player.STATE_IDLE:
                default:
                    break;
            }
        }

        @Override
        public void onPlayerError(@NonNull PlaybackException error) {
            Log.e(TAG, "Playback error: " + error.getErrorCodeName(), error);
            bufferSpinner.setVisibility(View.GONE);

            int code = error.errorCode;
            boolean decoderProblem =
                    code == PlaybackException.ERROR_CODE_DECODER_INIT_FAILED
                            || code == PlaybackException.ERROR_CODE_DECODER_QUERY_FAILED
                            || code == PlaybackException.ERROR_CODE_DECODING_FAILED
                            || code == PlaybackException.ERROR_CODE_DECODING_FORMAT_UNSUPPORTED
                            || code == PlaybackException.ERROR_CODE_DECODING_FORMAT_EXCEEDS_CAPABILITIES;

            if (decoderProblem && !softwareDecoderRetryDone) {
                // Hardware decoder refused the stream: rebuild the pipeline forcing
                // software H.264/AAC. This is the real-world Fire TV failure mode.
                softwareDecoderRetryDone = true;
                Toast.makeText(PlayerActivity.this,
                        "Switching to software decoder...", Toast.LENGTH_SHORT).show();
                if (player != null) {
                    resumePositionMs = player.getCurrentPosition();
                }
                showOsd();
                initializePlayer();
                return;
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

        /**
         * Fires the moment a decoded frame actually reaches the output surface.
         * This is the signal that distinguishes a working player from the
         * audio-only black screen, so it is logged for on-device diagnosis
         * (`adb logcat -s AJOPlayer`).
         */
        @Override
        public void onRenderedFirstFrame() {
            Log.i(TAG, "RENDERED_FIRST_FRAME: hardware surface is receiving decoded video");
            bufferSpinner.setVisibility(View.GONE);
        }

        @Override
        public void onVideoSizeChanged(@NonNull androidx.media3.common.VideoSize videoSize) {
            Log.i(TAG, "VIDEO_SIZE: " + videoSize.width + "x" + videoSize.height);
        }

        @Override
        public void onTracksChanged(@NonNull androidx.media3.common.Tracks tracks) {
            int videoTracks = 0;
            int audioTracks = 0;
            for (androidx.media3.common.Tracks.Group group : tracks.getGroups()) {
                if (group.getType() == C.TRACK_TYPE_VIDEO) videoTracks += group.length;
                if (group.getType() == C.TRACK_TYPE_AUDIO) audioTracks += group.length;
            }
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
                // Tear the decoder down before finishing so the WebView UI gets a
                // clean, unblocked hardware codec and focus back immediately.
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
