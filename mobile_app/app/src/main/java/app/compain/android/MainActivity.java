package app.compain.android;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;

/**
 * Compain as an Android app: one full-screen WebView that opens the user's own Compain server.
 *
 * - First start: assets/setup.html asks for the server address (stored on the device, changeable in the
 *   app's Settings → App, or from the offline page).
 * - Full screen: status and navigation bar are hidden (swipe from the edge shows them for a moment).
 *   The keyboard and the camera cut-out are kept clear by padding the page (see applyInsets).
 * - Everything the browser does keeps working: file pickers (pictures, imports), downloads into the
 *   Downloads folder (exports, cards, backups), live updates, sound, login that stays.
 * - Links to other sites open in the normal browser; the back gesture goes back inside the app.
 * - window.CompainApp (Bridge) lets the web app show the "App" card in Settings.
 */
public class MainActivity extends Activity {
    private static final String PREFS = "compain";
    private static final String KEY_SERVER = "server";
    private static final String SETUP_PAGE = "file:///android_asset/setup.html";
    private static final String OFFLINE_PAGE = "file:///android_asset/offline.html";
    private static final int PICK_FILES = 1;
    private static final int NIGHT = 0xFF0E0B12;

    private FrameLayout root;
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        root = new FrameLayout(this);
        root.setBackgroundColor(NIGHT);
        web = new WebView(this);
        web.setBackgroundColor(NIGHT);
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }
        enterFullscreen();
        applyInsets();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setAllowFileAccess(false);           // the app's own pages come from assets, which stays allowed
        s.setAllowContentAccess(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setUserAgentString(s.getUserAgentString() + " CompainApp/" + appVersion());

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(web, true);

        web.addJavascriptInterface(new Bridge(), "CompainApp");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        web.setDownloadListener(this::download);

        if (state != null && web.restoreState(state) != null) return;
        String server = server();
        web.loadUrl(server.isEmpty() ? SETUP_PAGE : server);
    }

    // ---------- full screen ----------

    private void enterFullscreen() {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    /** Keep the page clear of the keyboard and the camera cut-out; hidden bars take no room. */
    private void applyInsets() {
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int left, top, right, bottom;
            if (Build.VERSION.SDK_INT >= 30) {
                Insets cut = insets.getInsets(WindowInsets.Type.displayCutout());
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                Insets ime = insets.getInsets(WindowInsets.Type.ime());
                left = Math.max(cut.left, bars.left);
                top = Math.max(cut.top, bars.top);
                right = Math.max(cut.right, bars.right);
                bottom = Math.max(ime.bottom, bars.bottom);
            } else {
                left = insets.getSystemWindowInsetLeft();
                top = insets.getSystemWindowInsetTop();
                right = insets.getSystemWindowInsetRight();
                bottom = insets.getSystemWindowInsetBottom();
                if (Build.VERSION.SDK_INT >= 28 && insets.getDisplayCutout() != null) {
                    top = Math.max(top, insets.getDisplayCutout().getSafeInsetTop());
                }
            }
            root.setPadding(left, top, right, bottom);
            return Build.VERSION.SDK_INT >= 30 ? WindowInsets.CONSUMED : insets.consumeSystemWindowInsets();
        });
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enterFullscreen();
    }

    // ---------- server address ----------

    private SharedPreferences prefs() { return getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    private String server() { return prefs().getString(KEY_SERVER, ""); }

    /** "compain.example.org" → "https://compain.example.org/"; only http and https. Empty when not usable. */
    static String normalise(String raw) {
        String url = raw == null ? "" : raw.trim();
        if (url.isEmpty()) return "";
        if (!url.contains("://")) url = "https://" + url;
        Uri u = Uri.parse(url);
        String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase();
        if (!(scheme.equals("http") || scheme.equals("https")) || u.getHost() == null || u.getHost().isEmpty()) return "";
        String port = u.getPort() > 0 ? ":" + u.getPort() : "";
        return scheme + "://" + u.getHost() + port + "/";
    }

    private boolean onServer(Uri u) {
        Uri s = Uri.parse(server());
        return s.getHost() != null && s.getHost().equalsIgnoreCase(u.getHost()) && port(s) == port(u)
                && s.getScheme() != null && s.getScheme().equalsIgnoreCase(u.getScheme());
    }

    private static int port(Uri u) {
        if (u.getPort() > 0) return u.getPort();
        return "http".equalsIgnoreCase(u.getScheme()) ? 80 : 443;
    }

    private String appVersion() {
        try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; }
        catch (PackageManager.NameNotFoundException e) { return "?"; }
    }

    /** window.CompainApp in the page. Only the user's own server and the app's own pages are ever loaded. */
    private class Bridge {
        @JavascriptInterface public String serverUrl() { return server(); }
        @JavascriptInterface public String version() { return appVersion(); }

        @JavascriptInterface public boolean setServer(String raw) {
            String url = normalise(raw);
            if (url.isEmpty()) return false;
            prefs().edit().putString(KEY_SERVER, url).apply();
            runOnUiThread(() -> { web.clearHistory(); web.loadUrl(url); });
            return true;
        }

        @JavascriptInterface public void changeServer() { runOnUiThread(() -> web.loadUrl(SETUP_PAGE)); }

        @JavascriptInterface public void retry() {
            runOnUiThread(() -> { String s = server(); web.loadUrl(s.isEmpty() ? SETUP_PAGE : s); });
        }
    }

    // ---------- pages, links and errors ----------

    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            String scheme = u.getScheme() == null ? "" : u.getScheme();
            if (scheme.equals("file") && u.toString().startsWith("file:///android_asset/")) return false;
            if ((scheme.equals("http") || scheme.equals("https")) && onServer(u)) return false;
            // Everything else (other sites, mailto:, tel:) opens outside the app.
            try { startActivity(new Intent(Intent.ACTION_VIEW, u)); }
            catch (ActivityNotFoundException e) { Toast.makeText(MainActivity.this, u.toString(), Toast.LENGTH_SHORT).show(); }
            return true;
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) view.loadUrl(OFFLINE_PAGE);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            CookieManager.getInstance().flush(); // keep the login when the app is closed
        }
    }

    // ---------- file picker (pictures, card and chat imports, backgrounds) ----------

    private class Chrome extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
            pick.addCategory(Intent.CATEGORY_OPENABLE);
            pick.setType("*/*");
            List<String> mimes = new ArrayList<>();
            for (String t : params.getAcceptTypes()) {
                for (String part : t.split(",")) {
                    String p = part.trim().toLowerCase();
                    if (p.contains("/")) mimes.add(p);
                    else if (p.equals(".json")) mimes.add("application/json");
                    else if (p.equals(".png")) mimes.add("image/png");
                    else if (p.equals(".jpg") || p.equals(".jpeg")) mimes.add("image/jpeg");
                    else if (p.equals(".webp")) mimes.add("image/webp");
                    else if (p.equals(".txt") || p.equals(".md")) mimes.add("text/plain");
                }
            }
            // JSON files often come without a proper type on phones: only narrow the picker for pictures.
            boolean onlyPictures = !mimes.isEmpty();
            for (String m : mimes) if (!m.startsWith("image/")) onlyPictures = false;
            if (onlyPictures) pick.putExtra(Intent.EXTRA_MIME_TYPES, mimes.toArray(new String[0]));
            pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
            try {
                startActivityForResult(Intent.createChooser(pick, null), PICK_FILES);
            } catch (ActivityNotFoundException e) {
                fileCallback = null;
                return false;
            }
            return true;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != PICK_FILES || fileCallback == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                int n = data.getClipData().getItemCount();
                result = new Uri[n];
                for (int i = 0; i < n; i++) result[i] = data.getClipData().getItemAt(i).getUri();
            } else if (data.getData() != null) {
                result = new Uri[]{data.getData()};
            }
        }
        fileCallback.onReceiveValue(result);
        fileCallback = null;
    }

    // ---------- downloads (exports, character cards, backups) ----------

    private void download(String url, String userAgent, String disposition, String mime, long length) {
        if (Build.VERSION.SDK_INT < 29 && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, 2);
            Toast.makeText(this, "Allow storage, then tap the download again", Toast.LENGTH_LONG).show();
            return;
        }
        String name = URLUtil.guessFileName(url, disposition, mime);
        DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
        String cookie = CookieManager.getInstance().getCookie(url);
        if (cookie != null) r.addRequestHeader("Cookie", cookie); // the download needs the login
        r.addRequestHeader("User-Agent", userAgent);
        if (mime != null) r.setMimeType(mime);
        r.setTitle(name);
        r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
        DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
        dm.enqueue(r);
        Toast.makeText(this, "↓ " + name, Toast.LENGTH_SHORT).show();
    }

    // ---------- back gesture and lifecycle ----------

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
