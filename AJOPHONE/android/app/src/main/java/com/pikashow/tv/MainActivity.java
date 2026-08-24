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
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends BridgeActivity {

    // ---- v3.3.1 (ported from TV app 3.10.1): embed preflight ----
    // Server-side error pages (Vercel "Application error", Cloudflare 52x,
    // provider 502/503/504) fire iframe onLoad, so the WebView layer can't
    // tell a dead player page from a working one. The React player preflights
    // every embed mirror through this native fetch (no CORS limits) and skips
    // mirrors that return a broken page.
    private static final String[] EMBED_ERROR_MARKERS = {
        "Application error", "server-side exception", "Digest: ",
        "Error code 522", "Error code 520", "Error code 524",
        "502 Bad Gateway", "503 Service Unavailable", "504 Gateway Timeout",
        "Just a moment..."
    };

    private static boolean embedPageLooksBroken(String body) {
        if (body == null || body.isEmpty()) return true;
        String lower = body.toLowerCase();
        for (String marker : EMBED_ERROR_MARKERS) {
            if (lower.contains(marker.toLowerCase())) return true;
        }
        return false;
    }

    private static String base64UrlString(String raw) {
        return android.util.Base64.encodeToString(
                raw.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                android.util.Base64.NO_WRAP | android.util.Base64.URL_SAFE);
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // --- FULLSCREEN IMMERSIVE MODE & PURE BLACK BACKGROUND ---
        enableImmersiveMode();
        getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(android.graphics.Color.BLACK));
        getWindow().getDecorView().setBackgroundColor(android.graphics.Color.BLACK);

        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            webView.setBackgroundColor(android.graphics.Color.BLACK);
            webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
            webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
            webView.setVerticalScrollBarEnabled(false);
            webView.setHorizontalScrollBarEnabled(false);
            
            WebSettings settings = webView.getSettings();
            settings.setSupportMultipleWindows(false);
            settings.setJavaScriptCanOpenWindowsAutomatically(false);
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);

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

            // 1.5. Native-compatible interface (phone edition). Phones play in
            // the WebView, so preferNative() is false; the interface exists so
            // the shared nativePlayer.js preflight logic works on this app too.
            webView.addJavascriptInterface(new Object() {
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
                            ok = false;
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

                @JavascriptInterface
                public boolean preferNative() {
                    return false; // phones play in the WebView (hls.js + embeds)
                }

                @JavascriptInterface
                public boolean isFireTv() {
                    return false;
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

                // v3.2.0 keystore cutover: lets the web app detect whether THIS
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
                        runOnUiThread(() -> Toast.makeText(MainActivity.this, "Invalid APK URL", Toast.LENGTH_SHORT).show());
                        return;
                    }

                    // Check install permission on Android 8.0+
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        if (!getPackageManager().canRequestPackageInstalls()) {
                            try {
                                Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName()));
                                startActivity(intent);
                                runOnUiThread(() -> Toast.makeText(MainActivity.this, "Please allow 'Install unknown apps' to update AJO", Toast.LENGTH_LONG).show());
                            } catch (Exception ignored) {}
                        }
                    }

                    // Run download in background thread
                    new Thread(() -> {
                        try {
                            runOnUiThread(() -> {
                                webView.evaluateJavascript("window.onAJOUpdateStatus && window.onAJOUpdateStatus('DOWNLOADING', 0);", null);
                            });

                            URL url = new URL(apkUrl);
                            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                            conn.setConnectTimeout(15000);
                            conn.setReadTimeout(30000);
                            conn.setInstanceFollowRedirects(true);
                            conn.connect();

                            int responseCode = conn.getResponseCode();
                            // Handle HTTP 301/302/307/308 redirects
                            if (responseCode == HttpURLConnection.HTTP_MOVED_TEMP || responseCode == HttpURLConnection.HTTP_MOVED_PERM || responseCode == 307 || responseCode == 308) {
                                String newUrl = conn.getHeaderField("Location");
                                if (newUrl != null && !newUrl.isEmpty()) {
                                    conn = (HttpURLConnection) new URL(newUrl).openConnection();
                                    conn.setConnectTimeout(15000);
                                    conn.setReadTimeout(30000);
                                    conn.connect();
                                }
                            }

                            int fileLength = conn.getContentLength();
                            InputStream input = conn.getInputStream();

                            File outputDir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                            if (outputDir == null) {
                                outputDir = getCacheDir();
                            }
                            if (!outputDir.exists()) outputDir.mkdirs();

                            File apkFile = new File(outputDir, "update_ajo.apk");
                            if (apkFile.exists()) apkFile.delete();

                            FileOutputStream output = new FileOutputStream(apkFile);
                            byte[] data = new byte[4096];
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
                                            webView.evaluateJavascript("window.onAJOUpdateProgress && window.onAJOUpdateProgress(" + p + ", " + tot + ", " + len + ");", null);
                                        });
                                    }
                                }
                            }

                            output.flush();
                            output.close();
                            input.close();

                            runOnUiThread(() -> {
                                webView.evaluateJavascript("window.onAJOUpdateStatus && window.onAJOUpdateStatus('READY_TO_INSTALL', 100);", null);
                            });

                            // Launch Android Package Installer
                            installApk(apkFile);

                        } catch (final Exception e) {
                            runOnUiThread(() -> {
                                webView.evaluateJavascript("window.onAJOUpdateError && window.onAJOUpdateError('" + e.getMessage() + "');", null);
                                Toast.makeText(MainActivity.this, "Download failed: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                            });
                        }
                    }).start();
                }

                private void installApk(File apkFile) {
                    try {
                        Uri apkUri;
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                            apkUri = FileProvider.getUriForFile(
                                MainActivity.this,
                                getPackageName() + ".fileprovider",
                                apkFile
                            );
                        } else {
                            apkUri = Uri.fromFile(apkFile);
                        }

                        Intent intent = new Intent(Intent.ACTION_VIEW);
                        intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
                        startActivity(intent);
                    } catch (Exception e) {
                        runOnUiThread(() -> Toast.makeText(MainActivity.this, "Install failed: " + e.getMessage(), Toast.LENGTH_LONG).show());
                    }
                }
            }, "AndroidUpdater");

            // 3. Suppress All Popups, New Tabs & Ad Redirects natively
            webView.setWebChromeClient(new BridgeWebChromeClient(getBridge()) {
                @Override
                public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                    return false; // Drop all popup windows and ad redirects completely!
                }
            });

            webView.setWebViewClient(new com.getcapacitor.BridgeWebViewClient(getBridge()) {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {
                    if (request == null || request.getUrl() == null) return true;
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
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
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
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            );
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            enableImmersiveMode();
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            int keyCode = event.getKeyCode();
            if (keyCode == KeyEvent.KEYCODE_BACK || keyCode == KeyEvent.KEYCODE_ESCAPE) {
                // Forward back button event directly to web app so it handles closing player/modals
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().evaluateJavascript(
                        "(function(){ window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true})); })();",
                        null
                    );
                    return true; // Prevent Android OS from killing the app and exiting to TV home!
                }
            }
        }
        return super.dispatchKeyEvent(event);
    }
}
