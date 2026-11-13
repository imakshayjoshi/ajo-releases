package com.pikashow.tv;

import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.SurfaceTexture;
import android.graphics.drawable.ColorDrawable;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.Surface;
import android.view.TextureView;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageView;

/** Local, bounded cold-start branding; leaves MainActivity and its original intent underneath. */
public class StartupActivity extends Activity implements TextureView.SurfaceTextureListener {
    private static final String TAG = "StartupActivity";
    private static final long PLAYBACK_START_TIMEOUT_MS = 2500L;
    private static final long OVERALL_TIMEOUT_MS = 8000L;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Runnable startTimeout = () -> showFallback("first-frame timeout");
    private final Runnable overallTimeout = () -> showFallback("overall timeout");
    private TextureView playerView;
    private ImageView logoView;
    private MediaPlayer player;
    private Surface videoSurface;
    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;
    private boolean hasAudioFocus;
    private boolean finished;
    private boolean fallbackShown;
    private int videoWidth;
    private int videoHeight;
    private int introResource;
    private final AudioManager.OnAudioFocusChangeListener focusListener = change -> {
        if (change < 0) mainHandler.post(this::finishIntro);
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureWindow();
        buildUi();
        // A recreated activity must not restart the movie. MainActivity's gate is process-local.
        if (savedInstanceState != null) {
            finishIntro();
            return;
        }
        Configuration config = getResources().getConfiguration();
        boolean television = getPackageManager().hasSystemFeature(PackageManager.FEATURE_LEANBACK)
                || (config.uiMode & Configuration.UI_MODE_TYPE_MASK) == Configuration.UI_MODE_TYPE_TELEVISION;
        boolean landscape = config.orientation == Configuration.ORIENTATION_LANDSCAPE;
        String asset = television || landscape ? "ajo_tv_intro" : "ajo_mobile_intro";
        introResource = getResources().getIdentifier(asset, "raw", getPackageName());
        Log.i(TAG, "intro selected: " + asset + ", television=" + television);
        mainHandler.postDelayed(startTimeout, PLAYBACK_START_TIMEOUT_MS);
        mainHandler.postDelayed(overallTimeout, OVERALL_TIMEOUT_MS);
        if (introResource == 0) showFallback("missing local asset");
        else if (playerView.isAvailable()) onSurfaceTextureAvailable(playerView.getSurfaceTexture(), playerView.getWidth(), playerView.getHeight());
    }

    private void configureWindow() {
        Window window = getWindow();
        window.setBackgroundDrawable(new ColorDrawable(Color.BLACK));
        window.getDecorView().setBackgroundColor(Color.BLACK);
        window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams params = window.getAttributes();
            params.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(params);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.systemBars());
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            window.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
    }

    private void buildUi() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        // TextureView is composited into the window, unlike the TV's uncapturable hardware overlay.
        // Playback is only the packaged short intro, never the long-form content player.
        playerView = new TextureView(this);
        playerView.setOpaque(false);
        playerView.setSurfaceTextureListener(this);
        root.addView(playerView, new FrameLayout.LayoutParams(-1, -1, Gravity.CENTER));
        logoView = new ImageView(this);
        logoView.setImageResource(R.drawable.ajo_brand_logo);
        logoView.setScaleType(ImageView.ScaleType.FIT_CENTER);
        logoView.setContentDescription("AJO TV");
        root.addView(logoView, new FrameLayout.LayoutParams(1, 1, Gravity.CENTER));
        root.addOnLayoutChangeListener((v, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) -> {
            int side = Math.max(1, Math.round(Math.min(right - left, bottom - top) * 0.50f));
            FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) logoView.getLayoutParams();
            if (params.width != side || params.height != side) {
                params.width = side;
                params.height = side;
                logoView.setLayoutParams(params);
            }
            fitVideo();
        });
        setContentView(root);
    }

    private boolean requestIntroAudioFocus() {
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        if (audioManager == null) return false;
        int result;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                    .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_MOVIE).build())
                    .setOnAudioFocusChangeListener(focusListener, mainHandler).build();
            result = audioManager.requestAudioFocus(audioFocusRequest);
        } else {
            result = audioManager.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
        }
        hasAudioFocus = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        return hasAudioFocus;
    }

    private void initPlayer(SurfaceTexture texture) {
        if (finished || fallbackShown || introResource == 0 || player != null) return;
        try {
            videoSurface = new Surface(texture);
            player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MOVIE).build());
            player.setSurface(videoSurface);
            player.setOnVideoSizeChangedListener((mp, width, height) -> {
                videoWidth = width;
                videoHeight = height;
                fitVideo();
            });
            player.setOnPreparedListener(mp -> {
                if (finished || fallbackShown || mp != player) return;
                if (!requestIntroAudioFocus()) mp.setVolume(0f, 0f); // Stream-only mute; never changes device volume.
                Log.i(TAG, "intro prepared: " + mp.getDuration() + "ms");
                mp.start();
            });
            player.setOnInfoListener((mp, what, extra) -> {
                if (what == MediaPlayer.MEDIA_INFO_VIDEO_RENDERING_START && !finished && !fallbackShown) {
                    mainHandler.removeCallbacks(startTimeout);
                    logoView.setVisibility(View.GONE);
                    Log.i(TAG, "intro first frame rendered");
                }
                return false;
            });
            player.setOnCompletionListener(mp -> {
                Log.i(TAG, "intro completed");
                finishIntro();
            });
            player.setOnErrorListener((mp, what, extra) -> {
                showFallback("decoder error " + what + "/" + extra);
                return true;
            });
            player.setDataSource(this, Uri.parse("android.resource://" + getPackageName() + "/" + introResource));
            player.prepareAsync();
        } catch (Exception error) {
            Log.w(TAG, "intro initialization failed", error);
            showFallback("initialization failed");
        }
    }

    private void fitVideo() {
        if (playerView == null || videoWidth <= 0 || videoHeight <= 0) return;
        int width = playerView.getWidth(), height = playerView.getHeight();
        if (width == 0 || height == 0) return;
        float scale = Math.min((float) width / videoWidth, (float) height / videoHeight);
        Matrix matrix = new Matrix();
        matrix.setScale(videoWidth * scale / width, videoHeight * scale / height, width / 2f, height / 2f);
        playerView.setTransform(matrix);
    }

    private void showFallback(String reason) {
        if (finished || fallbackShown) return;
        fallbackShown = true;
        Log.w(TAG, "intro fallback: " + reason);
        mainHandler.removeCallbacks(startTimeout);
        mainHandler.removeCallbacks(overallTimeout);
        releasePlayer();
        playerView.setVisibility(View.INVISIBLE);
        logoView.setVisibility(View.VISIBLE);
        mainHandler.postDelayed(this::finishIntro, 500L);
    }

    private void releasePlayer() {
        MediaPlayer oldPlayer = player;
        player = null;
        if (oldPlayer != null) {
            oldPlayer.setOnPreparedListener(null);
            oldPlayer.setOnCompletionListener(null);
            oldPlayer.setOnErrorListener(null);
            oldPlayer.setOnInfoListener(null);
            oldPlayer.setOnVideoSizeChangedListener(null);
            try { oldPlayer.release(); } catch (RuntimeException error) { Log.w(TAG, "intro release failed", error); }
        }
        if (videoSurface != null) {
            videoSurface.release();
            videoSurface = null;
        }
        if (hasAudioFocus && audioManager != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) audioManager.abandonAudioFocusRequest(audioFocusRequest);
            else audioManager.abandonAudioFocus(focusListener);
            hasAudioFocus = false;
        }
    }

    private void finishIntro() {
        if (finished) return;
        finished = true;
        mainHandler.removeCallbacksAndMessages(null);
        releasePlayer();
        finish();
        overridePendingTransition(0, 0);
    }

    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        int key = event.getKeyCode();
        if (key == KeyEvent.KEYCODE_DPAD_CENTER || key == KeyEvent.KEYCODE_ENTER
                || key == KeyEvent.KEYCODE_NUMPAD_ENTER || key == KeyEvent.KEYCODE_BACK) {
            if (event.getAction() == KeyEvent.ACTION_DOWN) finishIntro();
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    @Override public boolean dispatchTouchEvent(MotionEvent event) {
        if (event.getActionMasked() == MotionEvent.ACTION_UP) finishIntro();
        return true;
    }
    @Override protected void onStop() { super.onStop(); finishIntro(); }
    @Override protected void onDestroy() { mainHandler.removeCallbacksAndMessages(null); releasePlayer(); super.onDestroy(); }
    @Override public void onConfigurationChanged(Configuration config) { super.onConfigurationChanged(config); fitVideo(); }
    @Override public void onSurfaceTextureAvailable(SurfaceTexture texture, int width, int height) { initPlayer(texture); }
    @Override public void onSurfaceTextureSizeChanged(SurfaceTexture texture, int width, int height) { fitVideo(); }
    @Override public boolean onSurfaceTextureDestroyed(SurfaceTexture texture) { finishIntro(); return true; }
    @Override public void onSurfaceTextureUpdated(SurfaceTexture texture) { }
}
