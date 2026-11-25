package app.bryars.ai;

import android.Manifest;
import android.app.Activity;
import android.app.PendingIntent;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbManager;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;

/**
 * Bryars A.I. 0.2 — hosts the web app (assets/web) in a WebView.
 * Includes AndroidBridge for Mic, USB OTG, USB Debugging Port, Contacts, Bluetooth & Wi-Fi.
 */
public class MainActivity extends Activity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/assets/web/index.html";
    private static final String ACTION_USB_PERMISSION = "app.bryars.ai.USB_PERMISSION";
    private static final int REQ_FILE = 1;
    private static final int REQ_PERM = 2;
    private static final int REQ_BRIDGE_PERM = 3;
    private static final int REQ_OTG_TREE = 4;

    private WebView web;
    private ValueCallback<Uri[]> filePathCallback;
    private PermissionRequest pendingPermission;
    private String[] pendingAndroidPerms;
    private String pendingBridgeFeature;

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
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);

        web.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (HOST.equals(u.getHost())) {
                    return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Exception ignored) {
                }
                return true;
            }
        });

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
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        handleWebPermission(request);
                    }
                });
            }
        });

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(START_URL);
        }
    }

    public class AndroidBridge {

        @JavascriptInterface
        public String getPermissionStates() {
            JSONObject obj = new JSONObject();
            try {
                boolean mic = checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
                boolean contacts = checkSelfPermission(Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED;

                boolean btPerm;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    btPerm = checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
                } else {
                    btPerm = checkSelfPermission(Manifest.permission.BLUETOOTH) == PackageManager.PERMISSION_GRANTED;
                }
                BluetoothManager bm = (BluetoothManager) getSystemService(Context.BLUETOOTH_SERVICE);
                BluetoothAdapter ba = (bm != null) ? bm.getAdapter() : null;
                boolean btOn = (ba != null && btPerm && ba.isEnabled());

                boolean wifiPerm = checkSelfPermission(Manifest.permission.ACCESS_WIFI_STATE) == PackageManager.PERMISSION_GRANTED;
                WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                boolean wifiOn = (wm != null && wm.isWifiEnabled());

                UsbManager um = (UsbManager) getSystemService(Context.USB_SERVICE);
                HashMap<String, UsbDevice> devs = (um != null) ? um.getDeviceList() : new HashMap<>();
                int usbCount = devs.size();
                boolean usbHasPerm = false;
                for (UsbDevice d : devs.values()) {
                    if (um.hasPermission(d)) {
                        usbHasPerm = true;
                        break;
                    }
                }

                int adbEnabled = Settings.Global.getInt(getContentResolver(), Settings.Global.ADB_ENABLED, 0);

                obj.put("mic", mic ? "GRANTED" : "PROMPT");
                obj.put("contacts", contacts ? "GRANTED" : "PROMPT");
                obj.put("bluetooth", btPerm ? (btOn ? "GRANTED (ON)" : "GRANTED (OFF)") : "PROMPT");
                obj.put("wifi", wifiPerm ? (wifiOn ? "GRANTED (ON)" : "GRANTED (OFF)") : "PROMPT");
                obj.put("usb_otg", usbCount > 0 ? (usbHasPerm ? "GRANTED (" + usbCount + " dev)" : "DEVICE FOUND (" + usbCount + ")") : "NO OTG / SAF READY");
                obj.put("usb_debug", adbEnabled == 1 ? "ADB PORT ENABLED" : "ADB DISABLED");
            } catch (Exception e) {
                try { obj.put("error", e.getMessage()); } catch (Exception ignored) {}
            }
            return obj.toString();
        }

        @JavascriptInterface
        public void requestFeature(final String feature) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    handleBridgeRequest(feature);
                }
            });
        }

        @JavascriptInterface
        public void openAegis() {
            // 2026-11-21 merge: open the AEGIS Watch screen (separate activity).
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        startActivity(new Intent(MainActivity.this, AegisActivity.class));
                    } catch (Exception ignored) {}
                }
            });
        }

        @JavascriptInterface
        public void openVideoStudio() {
            // 2026-11-21 merge: open the Video Studio screen (separate activity).
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        startActivity(new Intent(MainActivity.this, VideoActivity.class));
                    } catch (Exception ignored) {}
                }
            });
        }

        @JavascriptInterface
        public void openMusic() {
            // 2026-11-21 merge: open the Music screen (separate activity).
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        startActivity(new Intent(MainActivity.this, MusicActivity.class));
                    } catch (Exception ignored) {}
                }
            });
        }
    }

    private void handleBridgeRequest(String feature) {
        pendingBridgeFeature = feature;
        if ("mic".equals(feature)) {
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_BRIDGE_PERM);
            } else {
                notifyWebPermissions();
            }
        } else if ("contacts".equals(feature)) {
            if (checkSelfPermission(Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.READ_CONTACTS}, REQ_BRIDGE_PERM);
            } else {
                notifyWebPermissions();
            }
        } else if ("bluetooth".equals(feature)) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                List<String> perms = new ArrayList<>();
                if (checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                    perms.add(Manifest.permission.BLUETOOTH_CONNECT);
                }
                if (checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED) {
                    perms.add(Manifest.permission.BLUETOOTH_SCAN);
                }
                if (!perms.isEmpty()) {
                    requestPermissions(perms.toArray(new String[0]), REQ_BRIDGE_PERM);
                    return;
                }
            }
            try {
                startActivity(new Intent(Settings.ACTION_BLUETOOTH_SETTINGS));
            } catch (Exception ignored) {}
            notifyWebPermissions();
        } else if ("wifi".equals(feature)) {
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_WIFI_STATE,
                        Manifest.permission.CHANGE_WIFI_STATE
                }, REQ_BRIDGE_PERM);
                return;
            }
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    startActivity(new Intent(Settings.Panel.ACTION_WIFI));
                } else {
                    startActivity(new Intent(Settings.ACTION_WIFI_SETTINGS));
                }
            } catch (Exception ignored) {}
            notifyWebPermissions();
        } else if ("usb_otg".equals(feature)) {
            UsbManager um = (UsbManager) getSystemService(Context.USB_SERVICE);
            HashMap<String, UsbDevice> devs = (um != null) ? um.getDeviceList() : new HashMap<>();
            if (!devs.isEmpty()) {
                UsbDevice first = devs.values().iterator().next();
                int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0;
                PendingIntent pi = PendingIntent.getBroadcast(this, 0, new Intent(ACTION_USB_PERMISSION), flags);
                um.requestPermission(first, pi);
            } else {
                try {
                    Intent treeIntent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
                    startActivityForResult(treeIntent, REQ_OTG_TREE);
                } catch (Exception ignored) {}
            }
            notifyWebPermissions();
        } else if ("usb_debug".equals(feature)) {
            try {
                startActivity(new Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS));
            } catch (Exception e) {
                try {
                    startActivity(new Intent(Settings.ACTION_DEVICE_INFO_SETTINGS));
                } catch (Exception ignored) {}
            }
            notifyWebPermissions();
        }
    }

    private void notifyWebPermissions() {
        if (web != null) {
            web.evaluateJavascript("if(window.refreshBryarsPermissions){window.refreshBryarsPermissions();}", null);
        }
    }

    private void handleWebPermission(PermissionRequest request) {
        if (!HOST.equals(request.getOrigin().getHost())) {
            request.deny();
            return;
        }
        List<String> need = new ArrayList<>();
        for (String r : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)
                    && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                need.add(Manifest.permission.RECORD_AUDIO);
            }
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)
                    && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                need.add(Manifest.permission.CAMERA);
            }
        }
        if (need.isEmpty()) {
            request.grant(request.getResources());
            return;
        }
        pendingPermission = request;
        pendingAndroidPerms = need.toArray(new String[0]);
        requestPermissions(pendingAndroidPerms, REQ_PERM);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_BRIDGE_PERM) {
            notifyWebPermissions();
            return;
        }
        if (requestCode != REQ_PERM || pendingPermission == null) {
            return;
        }
        boolean allGranted = grantResults.length > 0;
        for (int g : grantResults) {
            if (g != PackageManager.PERMISSION_GRANTED) {
                allGranted = false;
            }
        }
        if (allGranted) {
            pendingPermission.grant(pendingPermission.getResources());
        } else {
            pendingPermission.deny();
        }
        pendingPermission = null;
        pendingAndroidPerms = null;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FILE && filePathCallback != null) {
            filePathCallback.onReceiveValue(
                    WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            filePathCallback = null;
        } else if (requestCode == REQ_OTG_TREE) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                try {
                    getContentResolver().takePersistableUriPermission(
                            data.getData(),
                            Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                } catch (Exception ignored) {}
            }
            notifyWebPermissions();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        notifyWebPermissions();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null) {
            web.saveState(outState);
        }
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
        }
        super.onDestroy();
    }
}
