package com.routinetracker.app;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/** Shows the Routine Tracker web app from files inside the app. No internet is used or allowed. */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final int PICK_FILE = 1;

    private WebView web;
    private ValueCallback<Uri[]> chooser;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);

        web.addJavascriptInterface(new Bridge(), "AndroidBridge");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return serve(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !HOST.equals(request.getUrl().getHost());
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (chooser != null) chooser.onReceiveValue(null);
                chooser = callback;
                try {
                    Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType("*/*");
                    startActivityForResult(Intent.createChooser(i, "Choose your backup file"), PICK_FILE);
                } catch (Exception e) {
                    chooser = null;
                    callback.onReceiveValue(null);
                }
                return true;
            }
        });

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl("https://" + HOST + "/index.html");
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PICK_FILE && chooser != null) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                result = new Uri[]{data.getData()};
            }
            chooser.onReceiveValue(result);
            chooser = null;
        }
    }

    private static final Map<String, String> MIME = new HashMap<>();
    static {
        MIME.put("html", "text/html");
        MIME.put("css", "text/css");
        MIME.put("js", "application/javascript");
        MIME.put("json", "application/json");
        MIME.put("webmanifest", "application/manifest+json");
        MIME.put("png", "image/png");
        MIME.put("svg", "image/svg+xml");
        MIME.put("ico", "image/x-icon");
    }

    /** Serves files from the app's own assets/www folder. Any other address gets an empty refusal. */
    private WebResourceResponse serve(Uri uri) {
        if (!HOST.equals(uri.getHost())) return reply(403, "Blocked");
        String path = uri.getPath();
        if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
        if (path.contains("..")) return reply(403, "Blocked");
        path = path.substring(1);
        try {
            InputStream in = getAssets().open("www/" + path);
            int dot = path.lastIndexOf('.');
            String ext = dot >= 0 ? path.substring(dot + 1).toLowerCase() : "";
            String type = MIME.containsKey(ext) ? MIME.get(ext) : "application/octet-stream";
            return new WebResourceResponse(type, "utf-8", in);
        } catch (Exception e) {
            return reply(404, "Not found");
        }
    }

    private WebResourceResponse reply(int code, String text) {
        return new WebResourceResponse("text/plain", "utf-8", code, text, new HashMap<String, String>(),
                new ByteArrayInputStream(text.getBytes(StandardCharsets.UTF_8)));
    }

    /** Lets the web app save backup, CSV and calendar files into the Downloads folder. */
    private class Bridge {
        @JavascriptInterface
        public boolean saveFile(String name, String mime, String text) {
            try {
                String safe = name.replaceAll("[^A-Za-z0-9._-]", "_");
                ContentValues v = new ContentValues();
                v.put(MediaStore.Downloads.DISPLAY_NAME, safe);
                v.put(MediaStore.Downloads.MIME_TYPE, mime);
                v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                v.put(MediaStore.Downloads.IS_PENDING, 1);
                Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (uri == null) return false;
                OutputStream out = getContentResolver().openOutputStream(uri);
                if (out == null) return false;
                out.write(text.getBytes(StandardCharsets.UTF_8));
                out.close();
                ContentValues done = new ContentValues();
                done.put(MediaStore.Downloads.IS_PENDING, 0);
                getContentResolver().update(uri, done, null, null);
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        Toast.makeText(MainActivity.this, "Saved to your Downloads folder", Toast.LENGTH_LONG).show();
                    }
                });
                return true;
            } catch (Exception e) {
                return false;
            }
        }
    }
}
