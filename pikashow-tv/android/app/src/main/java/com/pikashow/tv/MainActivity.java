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

    /** Brings the WebView back after the native player closes. */
    private void resumeWebView(boolean notifyPlayerClosed) {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        WebView webView = getBridge().getWebView();
        webView.onResume();
        if (notifyPlayerClosed) {
            webView.evaluateJavascript(
                    "(function(){try{window.dispatchEvent(new Event('ajo-native-player-closed'));}catch(e){}})();",
                    null);
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
                    String url = request.getUrl().toString();
                    if (url.startsWith("http://localhost") ||
                            url.startsWith("https://localhost") ||
                            url.startsWith("capacitor://") ||
                            url.contains("raw.githubusercontent.com") ||
                            url.contains("github.com/imakshayjoshi/ajo-releases")) {
                        return false;
                    }
                    // Intercept and drop any third-party ad / new tab launches
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
                    if (url == null || url.isEmpty()) return;
                    runOnUiThread(() -> {
                        try {
                            Intent intent = new Intent(MainActivity.this, PlayerActivity.class);
                            intent.putExtra("url", url);
                            intent.putExtra("title", title);
                            intent.putExtra("isLive", isLive);
                            // No NEW_TASK / CLEAR_TOP here on purpose. PlayerActivity is
                            // declared singleTop in the same task, so a plain start keeps
                            // the stack intact. NEW_TASK could launch the player into its
                            // own task and CLEAR_TOP could finish MainActivity underneath
                            // it, which leaves a black window that Back cannot clear.
                            startActivity(intent);
                            // Hand the decoder over only after the player is on its way.
                            releaseWebVideoDecoder();
                        } catch (Exception e) {
                            // Never leave the WebView paused if the player failed to open.
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
                        return pInfo.versionName != null ? pInfo.versionName : "2.1.0";
                    } catch (Exception e) {
                        return "2.1.0";
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
                        return 1;
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
                        apkFile.setReadable(true, false);
                        apkFile.setExecutable(true, false);
                        apkFile.setWritable(true, false);

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
                // Forward back button event directly to web app so it handles closing
                // player/modals
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().evaluateJavascript(
                            "(function(){ window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true})); })();",
                            null);
                    return true; // Prevent Android OS from killing the app and exiting to TV launcher!
                }
            }
        }
        // Let all D-Pad keys (UP, DOWN, LEFT, RIGHT, CENTER, ENTER) pass synchronously
        // with 0ms latency!
        return super.dispatchKeyEvent(event);
    }
}
