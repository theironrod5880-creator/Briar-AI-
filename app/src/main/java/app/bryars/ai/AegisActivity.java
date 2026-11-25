package app.bryars.ai;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JsResult;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

/**
 * Bryars A.I. 0.4.2 — AEGIS Watch screen (2026-11-21 merge, the man's ruling:
 * "AEGIS as a separate screen").
 * Separate Android screen hosting the cyber-watch AEGIS SEC-HUD page
 * (assets/web/aegis/index.html). Opened from Bryars Settings via
 * AndroidBridge.openAegis(). Android back returns to Bryars.
 * The AEGIS page loads its styling from CDNs (Tailwind, Font Awesome,
 * Google Fonts), so this screen needs an internet connection to look right;
 * its own logic is all in-page.
 * 0.4.2 fix (2026-11-21): the screen had NO WebChromeClient, so every
 * file button (IMPORT LEDGER JSON, MOUNT DIR, OPEN FILE) did nothing —
 * a WebView only opens a file picker through onShowFileChooser — and the
 * page's alert() calls were silently swallowed for the same reason. This
 * version adds the file chooser (same pattern as MainActivity 0.2) and
 * real dialogs for JS alert()/confirm().
 */
public class AegisActivity extends Activity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String AEGIS_URL = "https://" + HOST + "/assets/web/aegis/index.html";
    private static final int REQ_FILE = 1;

    private WebView web;
    private ValueCallback<Uri[]> filePathCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain(HOST)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true); // AEGIS Local Storage tab uses localStorage
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }
        });

        // 0.4.2: without a WebChromeClient a WebView never opens a file
        // picker (IMPORT LEDGER JSON, MOUNT DIR, OPEN FILE all dead) and
        // silently drops the page's alert() calls. Same file-chooser
        // pattern as MainActivity 0.2.
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), REQ_FILE);
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
                return true;
            }

            @Override
            public boolean onJsAlert(WebView view, String url, String message, final JsResult result) {
                new AlertDialog.Builder(AegisActivity.this)
                        .setMessage(message)
                        .setPositiveButton(android.R.string.ok, new DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(DialogInterface dialog, int which) {
                                result.confirm();
                            }
                        })
                        .setCancelable(false)
                        .show();
                return true;
            }

            @Override
            public boolean onJsConfirm(WebView view, String url, String message, final JsResult result) {
                new AlertDialog.Builder(AegisActivity.this)
                        .setMessage(message)
                        .setPositiveButton(android.R.string.ok, new DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(DialogInterface dialog, int which) {
                                result.confirm();
                            }
                        })
                        .setNegativeButton(android.R.string.cancel, new DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(DialogInterface dialog, int which) {
                                result.cancel();
                            }
                        })
                        .show();
                return true;
            }
        });

        web.loadUrl(AEGIS_URL);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FILE && filePathCallback != null) {
            filePathCallback.onReceiveValue(
                    WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            filePathCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        // AEGIS has no in-page way back; Android back returns to Bryars.
        finish();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
        }
        super.onDestroy();
    }
}
