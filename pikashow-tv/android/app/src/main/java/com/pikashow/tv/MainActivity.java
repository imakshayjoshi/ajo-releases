package com.pikashow.tv;

import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Message;
import android.provider.Settings;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.net.http.SslError;
import android.webkit.SslErrorHandler;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.BridgeWebViewClient;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends BridgeActivity {

    /**
     * Stops WebView media and frees the hardware decoder. Runs before the native
     * player opens.
     *
     * <p>Fire TV boxes have a very small MediaCodec budget. If Hls.js keeps its
     * {@code <video>} element alive while ExoPlayer asks for a second decoder, the
     * second request either fails or gets a surface it cannot draw to. The result
     * is the exact symptom users report: audio plays, picture stays black.
     */

    // v3.10.1: embed preflight — server-side error pages (Vercel "Application
    // error", Cloudflare 52x, provider 502/503/504) load fine as far as the
    // iframe is concerned (onLoad fires), so the WebView layer can't tell a
    // dead player page from a working one. The React player preflights every
    // embed URL here BEFORE mounting the iframe; an error page is skipped
    // instantly and failover moves to the next mirror.
    private static final String[] EMBED_ERROR_MARKERS = {
        "Application error",          // Vercel 500 page (screenshot: "Digest: ...")
        "server-side exception",      // Vercel body text
        "Digest: ",                   // Vercel error digest id
        "Error code 522",
        "Error code 520",
        "Error code 524",
        "502 Bad Gateway",
        "503 Service Unavailable",
        "504 Gateway Timeout",
        "Just a moment..."           // Cloudflare interstitial = bot-check loop
    };

    private static boolean embedPageLooksBroken(String body) {
        if (body == null) return false;
        for (String marker : EMBED_ERROR_MARKERS) {
            if (body.contains(marker)) return true;
        }
        return false;
    }

    private static String base64UrlString(String raw) {
        return android.util.Base64.encodeToString(
                raw.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                android.util.Base64.NO_WRAP | android.util.Base64.URL_SAFE);
    }

    private void releaseWebVideoDecoder() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        WebView webView = getBridge().getWebView();
        webView.evaluateJavascript(
                "(function(){try{"
                        + "var vs=document.querySelectorAll('video');"
                        + "for(var i=0;i<vs.length;i++){try{vs[i].pause();vs[i].removeAttribute('src');vs[i].load();}catch(e){}}"
                        + "if(window.__ajoStopWebPlayback){try{window.__ajoStopWebPlayback();}catch(e){}}"
                        + "window.dispatchEvent(new Event('ajo-native-player-open'));"
                        + "}catch(e){}})();",
                null);
        // Best-effort pause of WebView compositing and media. This does not stop
        // JavaScript, so the React app keeps its state while playback is native.
        webView.onPause();
    }

    private static volatile long lastNativePositionSeconds = 0;
    private static volatile long lastNativeDurationSeconds = 0;

    public static void setLastNativePlayback(long posSec, long durSec) {
        lastNativePositionSeconds = posSec;
        lastNativeDurationSeconds = durSec;
    }

    /** Brings the WebView back after the native player closes. */
    private void resumeWebView(boolean notifyPlayerClosed) {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        WebView webView = getBridge().getWebView();
        webView.onResume();
        if (notifyPlayerClosed) {
            final long pos = lastNativePositionSeconds;
            final long dur = lastNativeDurationSeconds;
            lastNativePositionSeconds = 0;
            lastNativeDurationSeconds = 0;
            String js = String.format(
                java.util.Locale.US,
                "(function(){try{window.dispatchEvent(new CustomEvent('ajo-native-player-closed',{detail:{currentTime:%d,duration:%d}}));}catch(e){}})();",
                pos, dur
            );
            webView.evaluateJavascript(js, null);
        }
        webView.requestFocus();
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // --- FULLSCREEN IMMERSIVE MODE & HARDWARE ACCELERATED VIDEO ---
        enableImmersiveMode();
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
        );
        getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(android.graphics.Color.BLACK));
        getWindow().getDecorView().setBackgroundColor(android.graphics.Color.BLACK);

        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            webView.setBackgroundColor(android.graphics.Color.BLACK);
            webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
            webView.setVerticalScrollBarEnabled(false);
            webView.setHorizontalScrollBarEnabled(false);

            webView.setWebViewClient(new BridgeWebViewClient(getBridge()) {
                @Override
                public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                    // 2014-2016 Smart TV panels ship root CA stores that expired years
                    // ago; without this, HTTPS stream CDNs abort the handshake.
                    handler.proceed();
                }

                @Override
                public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {
                    if (request == null || request.getUrl() == null)
                        return true;
                    android.net.Uri uri = request.getUrl();
                    String scheme = uri.getScheme();
                    String host = uri.getHost();
                    String path = uri.getPath() == null ? "" : uri.getPath();

                    // Allow the Capacitor local origin (https://localhost)
                    if ("localhost".equalsIgnoreCase(host) && ("https".equals(scheme) || "http".equals(scheme))) {
                        return false;
                    }
                    // Allow capacitor:// scheme used internally
                    if ("capacitor".equals(scheme)) {
                        return false;
                    }
                    // Allow OTA update manifests: only the exact releases repo, with optional path.
                    if ("raw.githubusercontent.com".equalsIgnoreCase(host) &&
                            path.startsWith("/imakshayjoshi/ajo-releases/")) {
                        return false;
                    }
                    if ("github.com".equalsIgnoreCase(host) &&
                            path.startsWith("/imakshayjoshi/ajo-releases/")) {
                        return false;
                    }
                    if ("api.github.com".equalsIgnoreCase(host) &&
                            path.startsWith("/repos/imakshayjoshi/ajo-releases/")) {
                        return false;
                    }
                    // Drop everything else (ads, popups, third-party navigations).
                    return true;
                }
            });

            // Enable fullscreen video and autoplay permission for Fire TV, and drop
            // all popup windows / ad redirects.
            webView.setWebChromeClient(new BridgeWebChromeClient(getBridge()) {
                @Override
                public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture,
                        Message resultMsg) {
                    return false;
                }
            });

            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setSupportMultipleWindows(false);
            settings.setJavaScriptCanOpenWindowsAutomatically(false);
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            }
            settings.setAllowFileAccess(true);
            settings.setAllowContentAccess(true);
            settings.setAllowFileAccessFromFileURLs(true);
            settings.setAllowUniversalAccessFromFileURLs(true);
            settings.setLoadWithOverviewMode(true);
            settings.setUseWideViewPort(true);
            // Ensure the cache mode allows media segments to load reliably
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);

            // 1. Android Native Orientation Interface
            webView.addJavascriptInterface(new Object() {
                @JavascriptInterface
                public void setLandscape() {
                    runOnUiThread(() -> {
                        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
                    });
                }

                @JavascriptInterface
                public void setPortrait() {
                    runOnUiThread(() -> {
                        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
                    });
                }

                @JavascriptInterface
                public void setAuto() {
                    runOnUiThread(() -> {
                        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_FULL_USER);
                    });
                }
            }, "AndroidOrientation");

            // 1.5. Android Dedicated Hardware Native Player Interface (Zero Black Screen Guarantee)
            webView.addJavascriptInterface(new Object() {
                @JavascriptInterface
                public void playStream(final String url, final String title, final boolean isLive) {
                    playStreamWithFallbacks(url, title, isLive, null);
                }

                @JavascriptInterface
                public void playStreamWithFallbacks(final String url, final String title, final boolean isLive, final String fallbacksJson) {
                    playStreamWithFallbacksAndPosition(url, title, isLive, fallbacksJson, 0L);
                }

                @JavascriptInterface
                public void playStreamWithFallbacksAndPosition(final String url, final String title, final boolean isLive, final String fallbacksJson, final long startPositionMs) {
                    if (url == null || url.isEmpty()) return;
                    runOnUiThread(() -> {
                        try {
                            Intent intent = new Intent(MainActivity.this, PlayerActivity.class);
                            intent.putExtra("url", url);
                            intent.putExtra("title", title);
                            intent.putExtra("isLive", isLive);
                            if (fallbacksJson != null && !fallbacksJson.isEmpty()) {
                                intent.putExtra("fallbacks", fallbacksJson);
                            }
                            if (startPositionMs > 0) {
                                intent.putExtra("startPositionMs", startPositionMs);
                            }
                            startActivity(intent);
                            releaseWebVideoDecoder();
                        } catch (Exception e) {
                            resumeWebView(true);
                            Toast.makeText(MainActivity.this, "Native Player error: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                        }
                    });
                }

                /**
                 * Lets the web layer know a hardware ExoPlayer surface is available so it
                 * can skip the WebView video pipeline entirely instead of waiting for the
                 * black-screen watchdog to trip.
                 */
                @JavascriptInterface
                public boolean isAvailable() {
                    return true;
                }

                /**
                 * v3.10.1: fetch an embed page's HTML (native side, no CORS
                 * limits) and report whether it is a broken server-error page.
                 * Result is delivered to window.__ajoEmbedPreflightResult(urlB64,
                 * ok). React skips mirrors that come back broken and the next
                 * server is tried instantly — no more frozen Vercel error
                 * screens during movie streaming.
                 */
                @JavascriptInterface
                public void preflightEmbed(final String url) {
                    if (url == null || url.isEmpty()) return;
                    new Thread(() -> {
                        boolean ok = true;
                        java.net.HttpURLConnection conn = null;
                        try {
                            java.net.URL u = new java.net.URL(url);
                            conn = (java.net.HttpURLConnection) u.openConnection();
                            conn.setConnectTimeout(8000);
                            conn.setReadTimeout(8000);
                            conn.setInstanceFollowRedirects(true);
                            conn.setRequestProperty("User-Agent",
                                    "Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 "
                                            + "(KHTML, like Gecko) Chrome/120.0.6099.210 Mobile Safari/537.36");
                            conn.setRequestProperty("Referer", "https://ajo.co.in/");
                            conn.setRequestProperty("Accept", "text/html,*/*");
                            int code = conn.getResponseCode();
                            if (code >= 400) {
                                ok = false;
                            } else {
                                java.io.InputStream in = conn.getInputStream();
                                java.io.ByteArrayOutputStream buf = new java.io.ByteArrayOutputStream();
                                byte[] chunk = new byte[8192];
                                int n;
                                int total = 0;
                                while ((n = in.read(chunk)) != -1 && total < 200 * 1024) {
                                    buf.write(chunk, 0, n);
                                    total += n;
                                }
                                in.close();
                                ok = !embedPageLooksBroken(buf.toString("UTF-8"));
                            }
                        } catch (Throwable t) {
                            ok = false; // unreachable host = broken mirror
                        } finally {
                            if (conn != null) { try { conn.disconnect(); } catch (Exception ignored) {} }
                        }
                        final boolean okFinal = ok;
                        runOnUiThread(() -> {
                            try {
                                if (getBridge() != null && getBridge().getWebView() != null) {
                                    getBridge().getWebView().evaluateJavascript(
                                            "window.__ajoEmbedPreflightResult && window.__ajoEmbedPreflightResult('"
                                                    + base64UrlString(url) + "'," + okFinal + ");",
                                            null);
                                }
                            } catch (Exception ignored) {}
                        });
                    }).start();
                }

                /** True on Fire TV / Fire OS devices, where WebView video is unreliable. */
                @JavascriptInterface
                public boolean isFireTv() {
                    try {
                        String manufacturer = String.valueOf(Build.MANUFACTURER).toLowerCase();
                        String model = String.valueOf(Build.MODEL).toLowerCase();
                        boolean amazon = manufacturer.contains("amazon");
                        boolean fireModel = model.contains("aft") || model.contains("fire");
                        boolean fireTvFeature =
                                getPackageManager().hasSystemFeature("amazon.hardware.fire_tv");
                        return amazon || fireModel || fireTvFeature;
                    } catch (Exception e) {
                        return false;
                    }
                }

                /**
                 * True when the device should always route playback through the native
                 * player: Fire TV, or any leanback/TV device on an older WebView where
                 * MSE compositing is known to break.
                 */
                @JavascriptInterface
                public boolean preferNative() {
                    return true;
                }

                // v3.11.1: cast remote control — forwards play/pause/seek/stop
                // from the phone to the active native ExoPlayer surface.
                @JavascriptInterface
                public void nativePlayerCommand(final String cmd, final double arg) {
                    PlayerActivity.dispatchRemoteCommand(cmd, arg);
                }

                @JavascriptInterface
                public String getDeviceInfo() {
                    return Build.MANUFACTURER + " " + Build.MODEL + " (Android API " + Build.VERSION.SDK_INT + ")";
                }
            }, "AndroidNativePlayer");

            // 2. Android On-Device OTA Updater Interface
            webView.addJavascriptInterface(new Object() {
                @JavascriptInterface
                public String getAppVersionName() {
                    try {
                        PackageInfo pInfo = getPackageManager().getPackageInfo(getPackageName(), 0);
                        return pInfo.versionName != null ? pInfo.versionName : "3.1.3";
                    } catch (Exception e) {
                        return "3.1.3";
                    }
                }

                @JavascriptInterface
                public int getAppVersionCode() {
                    try {
                        PackageInfo pInfo = getPackageManager().getPackageInfo(getPackageName(), 0);
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                            return (int) pInfo.getLongVersionCode();
                        } else {
                            return pInfo.versionCode;
                        }
                    } catch (Exception e) {
                        return 50;
                    }
                }

                // v3.8.0 keystore cutover: lets the web app detect whether THIS
                // install is signed with the release key. Debug-signed installs
                // cannot update in place to release-signed builds (Android
                // INSTALL_FAILED_UPDATE_INCOMPATIBLE), so they are routed to a
                // guided one-time reinstall instead of a broken silent update.
                @JavascriptInterface
                public boolean isReleaseSigned() {
                    try {
                        PackageInfo pInfo = getPackageManager().getPackageInfo(
                                getPackageName(), android.content.pm.PackageManager.GET_SIGNATURES);
                        if (pInfo.signatures == null || pInfo.signatures.length == 0) return false;
                        java.security.MessageDigest md =
                                java.security.MessageDigest.getInstance("SHA-256");
                        byte[] digest = md.digest(pInfo.signatures[0].toByteArray());
                        StringBuilder hex = new StringBuilder();
                        for (byte b : digest) hex.append(String.format("%02X", b));
                        // SHA-256 of the ajo-release.keystore certificate (keytool-verified)
                        return "354DE313E697EA83D73E89D09CF14CBF533BFFBE4563ADFC2790BBCA29D4FEE6"
                                .equals(hex.toString());
                    } catch (Exception e) {
                        return false;
                    }
                }

                @JavascriptInterface
                public void downloadAndInstall(final String apkUrl) {
                    if (apkUrl == null || apkUrl.isEmpty()) {
                        runOnUiThread(
                                () -> Toast.makeText(MainActivity.this, "Invalid APK URL", Toast.LENGTH_SHORT).show());
                        return;
                    }

                    // Check install permission on Android 8.0+
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        if (!getPackageManager().canRequestPackageInstalls()) {
                            try {
                                Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                        Uri.parse("package:" + getPackageName()));
                                startActivity(intent);
                                runOnUiThread(() -> Toast
                                        .makeText(MainActivity.this,
                                                "Please allow 'Install unknown apps' to update AJO", Toast.LENGTH_LONG)
                                        .show());
                            } catch (Exception ignored) {
                            }
                        }
                    }

                    // Run download in background thread
                    new Thread(() -> {
                        try {
                            runOnUiThread(() -> {
                                webView.evaluateJavascript(
                                        "window.onAJOUpdateStatus && window.onAJOUpdateStatus('DOWNLOADING', 0);",
                                        null);
                            });

                            // Trust all SSL certificates for legacy 2014-2016 Smart TVs with expired root
                            // CAs
                            javax.net.ssl.TrustManager[] trustAllCerts = new javax.net.ssl.TrustManager[] {
                                    new javax.net.ssl.X509TrustManager() {
                                        public java.security.cert.X509Certificate[] getAcceptedIssuers() {
                                            return new java.security.cert.X509Certificate[0];
                                        }

                                        public void checkClientTrusted(java.security.cert.X509Certificate[] certs,
                                                String authType) {
                                        }

                                        public void checkServerTrusted(java.security.cert.X509Certificate[] certs,
                                                String authType) {
                                        }
                                    }
                            };
                            javax.net.ssl.SSLContext sc = javax.net.ssl.SSLContext.getInstance("TLS");
                            sc.init(null, trustAllCerts, new java.security.SecureRandom());
                            javax.net.ssl.HttpsURLConnection.setDefaultSSLSocketFactory(sc.getSocketFactory());
                            javax.net.ssl.HttpsURLConnection.setDefaultHostnameVerifier((hostname, session) -> true);

                            String currentUrl = apkUrl;
                            HttpURLConnection conn = null;
                            int redirects = 0;

                            while (redirects < 8) {
                                URL u = new URL(currentUrl);
                                conn = (HttpURLConnection) u.openConnection();
                                conn.setConnectTimeout(20000);
                                conn.setReadTimeout(45000);
                                conn.setInstanceFollowRedirects(true);
                                conn.setRequestProperty("User-Agent",
                                        "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 AJO-TV-Updater");
                                conn.setRequestProperty("Accept", "*/*");
                                conn.connect();

                                int code = conn.getResponseCode();
                                if (code == HttpURLConnection.HTTP_MOVED_TEMP
                                        || code == HttpURLConnection.HTTP_MOVED_PERM || code == 307 || code == 308) {
                                    String location = conn.getHeaderField("Location");
                                    if (location != null && !location.isEmpty()) {
                                        currentUrl = location;
                                        redirects++;
                                        continue;
                                    }
                                }
                                break;
                            }

                            if (conn == null)
                                throw new java.io.IOException("Failed to establish connection");
                            int responseCode = conn.getResponseCode();
                            if (responseCode != HttpURLConnection.HTTP_OK) {
                                throw new java.io.IOException("Server returned HTTP " + responseCode + " ("
                                        + conn.getResponseMessage() + ")");
                            }

                            int fileLength = conn.getContentLength();
                            InputStream input = conn.getInputStream();

                            File outputDir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                            if (outputDir == null) {
                                outputDir = getCacheDir();
                            }
                            if (!outputDir.exists())
                                outputDir.mkdirs();

                            File apkFile = new File(outputDir, "update_ajo.apk");
                            if (apkFile.exists())
                                apkFile.delete();

                            FileOutputStream output = new FileOutputStream(apkFile);
                            byte[] data = new byte[8192];
                            long total = 0;
                            int count;
                            int lastProgress = -1;

                            while ((count = input.read(data)) != -1) {
                                total += count;
                                output.write(data, 0, count);
                                if (fileLength > 0) {
                                    int progress = (int) (total * 100 / fileLength);
                                    if (progress != lastProgress) {
                                        lastProgress = progress;
                                        final int p = progress;
                                        final long tot = total;
                                        final long len = fileLength;
                                        runOnUiThread(() -> {
                                            webView.evaluateJavascript(
                                                    "window.onAJOUpdateProgress && window.onAJOUpdateProgress(" + p
                                                            + ", " + tot + ", " + len + ");",
                                                    null);
                                        });
                                    }
                                }
                            }

                            output.flush();
                            output.close();
                            input.close();

                            runOnUiThread(() -> {
                                webView.evaluateJavascript(
                                        "window.onAJOUpdateStatus && window.onAJOUpdateStatus('READY_TO_INSTALL', 100);",
                                        null);
                            });

                            // Launch Android Package Installer
                            installApk(apkFile);

                        } catch (final Exception e) {
                            final String errStr = e.getMessage() != null ? e.getMessage() : e.toString();
                            final String quoted = org.json.JSONObject.quote(errStr);
                            runOnUiThread(() -> {
                                webView.evaluateJavascript(
                                        "window.onAJOUpdateError && window.onAJOUpdateError(" + quoted + ");", null);
                                Toast.makeText(MainActivity.this, "Download failed: " + errStr, Toast.LENGTH_SHORT)
                                        .show();
                            });
                        }
                    }).start();
                }

                private void installApk(File apkFile) {
                    try {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            if (!getPackageManager().canRequestPackageInstalls()) {
                                Intent settingsIntent = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES)
                                        .setData(Uri.parse("package:" + getPackageName()))
                                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                                startActivity(settingsIntent);
                                runOnUiThread(() -> Toast.makeText(MainActivity.this,
                                        "Please allow 'Install unknown apps' for AJO TV, then tap update again.",
                                        Toast.LENGTH_LONG).show());
                                return;
                            }
                        }

                        apkFile.setReadable(true, false);
                        apkFile.setExecutable(true, false);
                        apkFile.setWritable(true, false);
                        try {
                            Runtime.getRuntime().exec("chmod 644 " + apkFile.getAbsolutePath());
                        } catch (Exception ignored) {}

                        Uri apkUri;
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                            apkUri = FileProvider.getUriForFile(
                                    MainActivity.this,
                                    getPackageName() + ".fileprovider",
                                    apkFile);
                        } else {
                            apkUri = Uri.fromFile(apkFile);
                        }

                        Intent intent = new Intent(Intent.ACTION_VIEW);
                        intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);

                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                            android.content.pm.PackageManager pm = getPackageManager();
                            java.util.List<android.content.pm.ResolveInfo> resInfoList = pm.queryIntentActivities(intent, android.content.pm.PackageManager.MATCH_DEFAULT_ONLY);
                            for (android.content.pm.ResolveInfo resolveInfo : resInfoList) {
                                String packageName = resolveInfo.activityInfo.packageName;
                                grantUriPermission(packageName, apkUri, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                            }
                        }

                        startActivity(intent);
                    } catch (Exception e) {
                        runOnUiThread(() -> Toast
                                .makeText(MainActivity.this, "Install failed: " + e.getMessage(), Toast.LENGTH_LONG)
                                .show());
                    }
                }
            }, "AndroidUpdater");

            webView.setFocusable(true);
            webView.setFocusableInTouchMode(true);
            webView.requestFocus();
        }
    }

    private void enableImmersiveMode() {
        Window window = getWindow();

        // Extend content into cutout/notch areas
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = window.getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(lp);
        }

        // Use modern WindowInsetsController API (Android 11+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(
                        WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            // Fallback for older Android versions
            View decorView = window.getDecorView();
            decorView.setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        // Coming back from PlayerActivity: repaint the WebView, tell the web layer
        // the native player closed so it can reset its own player state, and take
        // focus back for the D-pad.
        resumeWebView(true);
        enableImmersiveMode();
    }

    @Override
    public void onPause() {
        super.onPause();
        // Pause the WebView when the app is backgrounded so Hls.js stops holding
        // a hardware decoder. Without this, returning from background can race
        // the native player for the decoder and produce the black-picture /
        // working-audio symptom that v3.2.1 was supposed to eliminate.
        if (getBridge() != null && getBridge().getWebView() != null) {
            try {
                getBridge().getWebView().onPause();
            } catch (Exception ignored) {}
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            enableImmersiveMode();
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().requestFocus();
            }
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            int keyCode = event.getKeyCode();
            if (keyCode == KeyEvent.KEYCODE_BACK || keyCode == KeyEvent.KEYCODE_ESCAPE) {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().evaluateJavascript(
                            "(function(){ window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true})); })();",
                            null);
                    return true;
                }
            }

            // Direct 0ms D-Pad & Selection keys for Fire TV Mobile Remote App & Physical Remotes
            String jsKey = null;
            int jsCode = 0;
            switch (keyCode) {
                case KeyEvent.KEYCODE_DPAD_UP:
                    jsKey = "ArrowUp";
                    jsCode = 38;
                    break;
                case KeyEvent.KEYCODE_DPAD_DOWN:
                    jsKey = "ArrowDown";
                    jsCode = 40;
                    break;
                case KeyEvent.KEYCODE_DPAD_LEFT:
                    jsKey = "ArrowLeft";
                    jsCode = 37;
                    break;
                case KeyEvent.KEYCODE_DPAD_RIGHT:
                    jsKey = "ArrowRight";
                    jsCode = 39;
                    break;
                case KeyEvent.KEYCODE_DPAD_CENTER:
                case KeyEvent.KEYCODE_ENTER:
                case KeyEvent.KEYCODE_NUMPAD_ENTER:
                    jsKey = "Enter";
                    jsCode = 13;
                    break;
            }

            if (jsKey != null && getBridge() != null && getBridge().getWebView() != null) {
                final String key = jsKey;
                final int code = jsCode;
                getBridge().getWebView().evaluateJavascript(
                        "(function(){" +
                        "var e = new KeyboardEvent('keydown', {key: '" + key + "', code: '" + key + "', keyCode: " + code + ", which: " + code + ", bubbles: true, cancelable: true});" +
                        "window.dispatchEvent(e);" +
                        "if(document.activeElement && '" + key + "' === 'Enter'){try{document.activeElement.click();}catch(err){}}" +
                        "})();",
                        null);
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }
}
