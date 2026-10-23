package de.dino.zaneweckruf;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.util.Base64;
import android.widget.Toast;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;

/** Zeigt Zane (die Webseite) im eigenen Fenster. Ton ohne Berührung erlaubt, Spracherkennung nativ. */
public class MainActivity extends Activity {

    static final String ZANE_URL = "https://wo-ist-was-test.vercel.app/";
    static MainActivity current;
    static boolean pendingWake = false;
    static volatile boolean pendingAuto = false;   // Auto per Bluetooth verbunden: die Seite soll die Autoansicht öffnen
    static volatile String pendingAnsage = null;   // geplante Ansage (aus AnsageReceiver), wartet darauf, dass die Seite sie abholt

    private WebView web;
    private final Handler h = new Handler(Looper.getMainLooper());
    private SpeechRecognizer recognizer;
    private boolean recRunning = false;
    private boolean recAborted = false;
    private int recSession = 0;
    private ValueCallback<Uri[]> fileCallback;
    private Uri camUri;   // Zieladresse des gerade aufgenommenen Fotos
    private boolean chooserStale = false;   // Seite wurde neu geladen, solange der Ordner offen war
    static volatile long pickerUntil = 0;
    private long pickerHold = 0;

    @Override
    protected void onCreate(Bundle s) {
        super.onCreate(s);
        current = this;
        web = new WebView(this);
        try { web.resumeTimers(); } catch (Throwable ignored) { }
        web.setBackgroundColor(Color.BLACK);
        setContentView(web, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        configure(web);

        web.addJavascriptInterface(new ZaneBridge(this), "ZaneNative");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                return handleUrl(r.getUrl());
            }

            @Override
            public void onPageStarted(WebView v, String url, Bitmap b) {
                if (fileCallback != null) chooserStale = true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                request.grant(request.getResources());
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {
                cb.invoke(origin, true, false);
            }

            @Override
            public boolean onCreateWindow(WebView v, boolean dialog, boolean userGesture, Message resultMsg) {
                // Popups (z. B. die Google-Anmeldung) bleiben ein echtes Popup mit Verbindung zu Zane.
                // Alles andere (Karten, Telefon, andere Webseiten) geht an die passende Android-App.
                final WebView popup = makeWebView();
                final android.app.Dialog dlg = new android.app.Dialog(MainActivity.this, android.R.style.Theme_DeviceDefault_Light_NoActionBar);
                dlg.setContentView(popup, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                dlg.setOnDismissListener(d -> { try { popup.destroy(); } catch (Throwable ignored) { } });
                popup.setWebViewClient(new WebViewClient() {
                    private boolean pruefen(Uri u) {
                        if (u == null) return true;
                        String url = u.toString();
                        if (url.equals("about:blank")) return true;
                        if (popupHostErlaubt(u)) {
                            if (!dlg.isShowing()) { try { dlg.show(); } catch (Throwable ignored) { } }
                            return true;
                        }
                        openExternal(u);
                        try { dlg.dismiss(); } catch (Throwable ignored) { }
                        return false;
                    }

                    @Override
                    public boolean shouldOverrideUrlLoading(WebView v2, WebResourceRequest r) {
                        return !pruefen(r.getUrl());
                    }

                    @Override
                    public void onPageStarted(WebView v2, String url, android.graphics.Bitmap b) {
                        if (url != null) pruefen(Uri.parse(url));
                    }
                });
                popup.setWebChromeClient(new WebChromeClient() {
                    @Override
                    public void onCloseWindow(WebView w) {
                        try { dlg.dismiss(); } catch (Throwable ignored) { }
                    }
                });
                WebView.WebViewTransport t = (WebView.WebViewTransport) resultMsg.obj;
                t.setWebView(popup);
                resultMsg.sendToTarget();
                return true;
            }

            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                chooserStale = false;
                pickerUntil = System.currentTimeMillis() + 120000;
                pickerHold = WakeService.hold(120000);     // solange der Ordner offen ist, hört das Weckwort nicht mit
                // Kamera-Knopf der Seite (capture): direkt die Handy-Kamera starten, das Foto geht an die Seite zurück
                try {
                    if (params != null && params.isCaptureEnabled()) {
                        android.content.ContentValues cv = new android.content.ContentValues();
                        cv.put(android.provider.MediaStore.Images.Media.DISPLAY_NAME, "nova_" + System.currentTimeMillis() + ".jpg");
                        cv.put(android.provider.MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                        if (Build.VERSION.SDK_INT >= 29) cv.put(android.provider.MediaStore.Images.Media.RELATIVE_PATH, "Pictures/Jarvis");
                        camUri = getContentResolver().insert(android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv);
                        if (camUri != null) {
                            Intent ci = new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE);
                            ci.putExtra(android.provider.MediaStore.EXTRA_OUTPUT, camUri);
                            ci.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                            startActivityForResult(ci, 77);
                            return true;
                        }
                    }
                } catch (Throwable e) {
                    try { if (camUri != null) getContentResolver().delete(camUri, null, null); } catch (Throwable ignored) { }
                    camUri = null;     // Kamera ließ sich nicht starten: weiter mit der normalen Dateiauswahl
                }
                try {
                    startActivityForResult(params.createIntent(), 77);
                } catch (Throwable e) {
                    fileCallback = null;
                    pickerUntil = 0;
                    WakeService.release(pickerHold);
                    return false;
                }
                return true;
            }
        });

        handleIntent(getIntent());   // zuerst: Wurde die App durch das Weckwort gestartet? Dann muss schon der erste Seitenaufruf das wissen
        // Von "Hey ..." geweckt: Seite ohne Startanimation laden (Schalter ?nostart=1 kennt die Seite schon), Jarvis sagt sofort "Ja?"
        web.loadUrl(pendingWake ? ZANE_URL + "?nostart=1" : ZANE_URL);
        askPermissions();
    }

    private WebView makeWebView() {
        WebView w = new WebView(this);
        configure(w);
        return w;
    }

    private void configure(WebView w) {
        WebSettings st = w.getSettings();
        st.setJavaScriptEnabled(true);
        st.setDomStorageEnabled(true);
        st.setDatabaseEnabled(true);
        st.setMediaPlaybackRequiresUserGesture(false);
        st.setGeolocationEnabled(true);
        st.setJavaScriptCanOpenWindowsAutomatically(true);
        st.setSupportMultipleWindows(true);
        st.setAllowFileAccess(false);
        // Google lässt die Anmeldung in einem "WebView" nicht zu - darum gibt sich das Fenster als normaler Browser aus.
        String ua = st.getUserAgentString();
        if (ua != null) st.setUserAgentString(ua.replace("; wv", "").replace(" Version/4.0", ""));
        android.webkit.CookieManager cm = android.webkit.CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(w, true);
    }

    private boolean popupHostErlaubt(Uri u) {
        String scheme = u.getScheme();
        String host = u.getHost();
        if (host == null || scheme == null || !(scheme.equals("https") || scheme.equals("http"))) return false;
        if (host.endsWith("vercel.app")) return true;
        return host.equals("accounts.google.com") || host.equals("accounts.youtube.com")
                || host.equals("myaccount.google.com") || host.endsWith(".gstatic.com") || host.equals("www.gstatic.com")
                || host.equals("oauth2.googleapis.com");
    }

    private boolean handleUrl(Uri u) {
        String host = u.getHost();
        if (host != null && host.endsWith("vercel.app") && "https".equals(u.getScheme())) return false;
        openExternal(u);
        return true;
    }

    /** Google-Kalender-Link (…/calendar/…/day/J/M/T): direkt in der Kalender-App öffnen statt im Browser (z. B. Brave). */
    private boolean openKalenderApp(Uri u) {
        try {
            String host = u.getHost();
            if (host == null || !host.equals("calendar.google.com")) return false;
            long millis = System.currentTimeMillis();
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("/day/(\\d{4})/(\\d{1,2})/(\\d{1,2})").matcher(String.valueOf(u.getPath()));
            if (m.find()) {
                java.util.Calendar c = java.util.Calendar.getInstance();
                c.clear();
                c.set(Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2)) - 1, Integer.parseInt(m.group(3)), 12, 0, 0);
                millis = c.getTimeInMillis();
            }
            Uri zeit = Uri.parse("content://com.android.calendar/time/" + millis);
            String[] pakete = {"com.google.android.calendar", null};
            for (String p : pakete) {
                try {
                    Intent i = new Intent(Intent.ACTION_VIEW, zeit).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    if (p != null) i.setPackage(p);
                    startActivity(i);
                    return true;
                } catch (Throwable ignored) { }
            }
        } catch (Throwable ignored) { }
        return false;
    }

    private Uri letzterShare = null;

    /** Foto (JPEG als Datenadresse) in einen eigenen Bilderordner "Jarvis" legen und an WhatsApp übergeben (sonst Android-Auswahl). */
    boolean shareImage(String dataUrl, String text) {
        try {
            if (Build.VERSION.SDK_INT < 29 || dataUrl == null) return false;
            int komma = dataUrl.indexOf(',');
            if (komma < 0) return false;
            byte[] bytes = Base64.decode(dataUrl.substring(komma + 1), Base64.DEFAULT);
            android.content.ContentResolver cr = getContentResolver();
            if (letzterShare != null) {   // das vorige gesendete Foto wieder aus der Galerie nehmen
                try { cr.delete(letzterShare, null, null); } catch (Throwable ignored) { }
                letzterShare = null;
            }
            android.content.ContentValues v = new android.content.ContentValues();
            v.put(android.provider.MediaStore.Images.Media.DISPLAY_NAME, "Jarvis_" + System.currentTimeMillis() + ".jpg");
            v.put(android.provider.MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
            v.put(android.provider.MediaStore.Images.Media.RELATIVE_PATH, "Pictures/Jarvis");
            final Uri uri = cr.insert(android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
            if (uri == null) return false;
            java.io.OutputStream out = cr.openOutputStream(uri);
            if (out == null) return false;
            try { out.write(bytes); } finally { out.close(); }
            letzterShare = uri;
            final String caption = text == null ? "" : text;
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("image/jpeg");
                i.putExtra(Intent.EXTRA_STREAM, uri);
                if (!caption.isEmpty()) i.putExtra(Intent.EXTRA_TEXT, caption);
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try {
                    Intent w = new Intent(i);
                    w.setPackage("com.whatsapp");
                    startActivity(w);
                } catch (Throwable e) {
                    try { startActivity(Intent.createChooser(i, "Foto senden")); } catch (Throwable ignored) { }
                }
            });
            return true;
        } catch (Throwable e) {
            return false;
        }
    }

    private void openExternal(Uri u) {
        if (openKalenderApp(u)) return;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Throwable ignored) { }
    }

    private void askPermissions() {
        ArrayList<String> need = new ArrayList<>();
        String[] all = {Manifest.permission.RECORD_AUDIO, Manifest.permission.ACCESS_FINE_LOCATION};
        for (String p : all) if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) need.add(p);
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            need.add(Manifest.permission.POST_NOTIFICATIONS);
        if (need.isEmpty()) startWake();
        else requestPermissions(need.toArray(new String[0]), 1);
    }

    private boolean kontakteWartet = false;
    /** Mehrfachauswahl der Schlafmodus-Kontakte; fragt bei Bedarf zuerst nach der Kontakte-Erlaubnis. */
    boolean kontakteWaehlen() {
        runOnUiThread(() -> {
            try {
                if (checkSelfPermission(Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
                    kontakteWartet = true;
                    requestPermissions(new String[]{Manifest.permission.READ_CONTACTS}, 4);
                } else {
                    KontaktWahl.zeigen(this);
                }
            } catch (Throwable ignored) { }
        });
        return true;
    }

    /** Öffnet die Android-Seite für den Benachrichtigungszugriff (Schlafmodus: WhatsApp-Nachrichten lesen und beantworten). */
    boolean nachrichtenZugriffOeffnen() {
        try {
            startActivity(new Intent(android.provider.Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            return true;
        } catch (Throwable e) {
            return false;
        }
    }

    /** Dauerhaftes Lauschen auf "Hey Jarvis" beenden (Einstellung aus, Dienst stoppen). */
    boolean lauschenAus() {
        try {
            Prefs.setEnabled(this, false);
            stopService(new Intent(this, WakeService.class));
            return true;
        } catch (Throwable e) {
            return false;
        }
    }

    /** Bittet die Uhr-App, den nächsten Wecker zu löschen (Android 12+) oder zumindest auszuschalten. Ob es geklappt hat, prüft die Seite danach. */
    boolean weckerAus() {
        String[] aktionen = {"android.intent.action.DELETE_ALARM", android.provider.AlarmClock.ACTION_DISMISS_ALARM};
        for (String a : aktionen) {
            try {
                Intent i = new Intent(a)
                        .putExtra(android.provider.AlarmClock.EXTRA_ALARM_SEARCH_MODE, android.provider.AlarmClock.ALARM_SEARCH_MODE_NEXT)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
                return true;
            } catch (Throwable ignored) { }
        }
        return false;
    }

    /** Zeitpunkt des nächsten Weckers in der Uhr-App (egal wer ihn gestellt hat); 0 = keiner, -1 = nicht lesbar. */
    double naechsterWecker() {
        try {
            android.app.AlarmManager am = (android.app.AlarmManager) getSystemService(ALARM_SERVICE);
            android.app.AlarmManager.AlarmClockInfo i = am == null ? null : am.getNextAlarmClock();
            return i == null ? 0 : (double) i.getTriggerTime();
        } catch (Throwable e) {
            return -1;
        }
    }

    private String anrufWartet = null;

    /** Nummer direkt wählen. Fehlt die Telefon-Erlaubnis, wird einmal gefragt und danach gewählt. */
    boolean anrufen(String nummer) {
        String n = nummer == null ? "" : nummer.replaceAll("[^0-9+*#]", "");
        if (n.length() < 3) return false;
        try {
            if (checkSelfPermission(Manifest.permission.CALL_PHONE) != PackageManager.PERMISSION_GRANTED) {
                anrufWartet = n;
                runOnUiThread(() -> requestPermissions(new String[]{Manifest.permission.CALL_PHONE}, 3));
                return true;
            }
            Intent i = new Intent(Intent.ACTION_CALL, Uri.parse("tel:" + Uri.encode(n))).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
            return true;
        } catch (Throwable e) {
            return false;
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        super.onRequestPermissionsResult(code, perms, res);
        if (code == 4) {
            boolean w = kontakteWartet; kontakteWartet = false;
            if (w && res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED) { try { KontaktWahl.zeigen(this); } catch (Throwable ignored) { } }
            return;
        }
        if (code == 3) {
            String n = anrufWartet; anrufWartet = null;
            if (n != null) {
                try {
                    boolean ok = res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED;
                    startActivity(new Intent(ok ? Intent.ACTION_CALL : Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(n))).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                } catch (Throwable ignored) { }
            }
            return;
        }
        try { OrtReceiver.anmelden(this); } catch (Throwable ignored) { }
        startWake();
    }

    private void startWake() {
        if (!Prefs.enabled(this)) return;
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return;
        try {
            startForegroundService(new Intent(this, WakeService.class));
        } catch (Throwable ignored) { }
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        setIntent(i);
        handleIntent(i);
        if (pendingAnsage != null) {   // Jarvis ist schon offen (onResume kommt dann nicht noch einmal): Seite sofort anstoßen
            h.postDelayed(() -> js("if(window.jvPlan&&window.jvPlan.pruefe)window.jvPlan.pruefe();"), 500);
        }
        if (pendingAuto) {
            h.postDelayed(() -> js("if(window.jvAutoansicht&&window.jvAutoansicht.start)window.jvAutoansicht.start();"), 500);
        }
    }

    private void handleIntent(Intent i) {
        if (i != null && i.getBooleanExtra("wake", false)) pendingWake = true;
        if (i != null && i.getBooleanExtra("auto", false)) pendingAuto = true;
        if (i != null) {
            String an = i.getStringExtra("ansage");
            if (an != null && !an.isEmpty()) pendingAnsage = an;
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        current = this;
        try { if (web != null) { web.resumeTimers(); web.onResume(); } } catch (Throwable ignored) { }   // nie eingefroren starten
        freezeHandler.removeCallbacks(freezeRun);
        WakeService.setActivityResumed(true);
        try {
            ((android.app.NotificationManager) getSystemService(NOTIFICATION_SERVICE)).cancel(2);   // "Hey Zane erkannt"-Meldung wegräumen
        } catch (Throwable ignored) { }
        if (pendingWake) {
            pendingWake = false;
            runWake();
        }
        if (pendingAnsage != null) {   // geplante Ansage: die Seite holt sie ab (bei frisch gestarteter Seite macht sie das selbst nach dem Laden)
            h.postDelayed(() -> js("if(window.jvPlan&&window.jvPlan.pruefe)window.jvPlan.pruefe();"), 700);
        }
        if (pendingAuto) {
            h.postDelayed(() -> js("if(window.jvAutoansicht&&window.jvAutoansicht.start)window.jvAutoansicht.start();"), 900);
        }
    }

    /** Standort-Erlaubnis für die Orts-Erinnerungen: erst genau, dann "Immer zulassen" in den App-Einstellungen. */
    void ortRechte() {
        runOnUiThread(() -> {
            try {
                if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION}, 2);
                    return;
                }
                Intent i = new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        android.net.Uri.parse("package:" + getPackageName()));
                startActivity(i);
            } catch (Throwable ignored) { }
        });
    }

    /** Von der Seite aufgerufen: die wartende Ansage abholen (und löschen). */
    String holeAnsage() {
        String a = pendingAnsage;
        pendingAnsage = null;
        return a == null ? "" : a;
    }

    /** Wecker in der Uhr-App des Handys anlegen (ohne die Uhr-App anzuzeigen). */
    boolean weckerStellen(int stunde, int minute, String text) {
        try {
            Intent i = new Intent(android.provider.AlarmClock.ACTION_SET_ALARM)
                    .putExtra(android.provider.AlarmClock.EXTRA_HOUR, stunde)
                    .putExtra(android.provider.AlarmClock.EXTRA_MINUTES, minute)
                    .putExtra(android.provider.AlarmClock.EXTRA_MESSAGE, text == null ? "Jarvis" : text)
                    .putExtra(android.provider.AlarmClock.EXTRA_SKIP_UI, true);
            startActivity(i);
            return true;
        } catch (Throwable e) {
            return false;
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        WakeService.setActivityResumed(false);
        // Strom sparen: ist Jarvis eine Weile nicht sichtbar und nichts los (kein Sprechen, kein Zuhören), wird die Seite angehalten.
        // onResume weckt sie sofort wieder auf (resumeTimers/onResume), geplante Ansagen und "Hey Jarvis" starten Jarvis ohnehin neu nach vorn.
        freezeHandler.removeCallbacks(freezeRun);
        freezeHandler.postDelayed(freezeRun, 45000);
    }

    private final android.os.Handler freezeHandler = new android.os.Handler(android.os.Looper.getMainLooper());
    private final Runnable freezeRun = new Runnable() {
        @Override public void run() {
            try {
                if (WakeService.activityResumed || WakeService.pageBusy || WakeService.recActive) {
                    freezeHandler.postDelayed(this, 30000);   // gerade etwas los: später noch einmal prüfen
                    return;
                }
                if (web != null) { web.onPause(); web.pauseTimers(); }
            } catch (Throwable ignored) { }
        }
    };

    @Override
    protected void onDestroy() {
        if (current == this) current = null;
        freezeHandler.removeCallbacks(freezeRun);
        if (recognizer != null) { try { recognizer.destroy(); } catch (Throwable ignored) { } recognizer = null; }
        WakeService.setRecActive(false);
        WakeService.setPageBusy(false);
        // Fenster weggewischt: Seite und Sprachausgabe sofort beenden, sonst redet Jarvis im Hintergrund weiter
        if (web != null) {
            try { web.stopLoading(); web.loadUrl("about:blank"); web.removeAllViews(); web.destroy(); } catch (Throwable ignored) { }
            web = null;
        }
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else moveTaskToBack(true);
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == 77) {
            pickerUntil = 0;
            WakeService.release(pickerHold);
            Uri[] u0 = null;
            final Uri cu = camUri; camUri = null;
            if (cu != null) {
                if (res == RESULT_OK) {
                    u0 = new Uri[]{cu};
                    h.postDelayed(() -> { try { getContentResolver().delete(cu, null, null); } catch (Throwable ignored) { } }, 180000);   // Foto nach 3 Minuten wieder aus der Galerie nehmen
                } else {
                    try { getContentResolver().delete(cu, null, null); } catch (Throwable ignored) { }
                }
            } else if (res == RESULT_OK) {
                u0 = urisAus(data);
                if (u0 == null || u0.length == 0) {
                    try { u0 = WebChromeClient.FileChooserParams.parseResult(res, data); } catch (Throwable ignored) { }
                }
            }
            final Uri[] uris = u0;
            final int n = uris == null ? 0 : uris.length;
            if (res == RESULT_OK && n == 0) {
                String info = "Fenster gibt zurück: ";
                try {
                    if (data == null) info += "keine Daten";
                    else {
                        android.content.ClipData cd = data.getClipData();
                        info += "clip=" + (cd == null ? "keine" : cd.getItemCount()) + ", data=" + data.getData() + ", extras=" + (data.getExtras() == null ? "keine" : data.getExtras().keySet());
                    }
                } catch (Throwable e) { info += "?"; }
                Toast.makeText(this, info, Toast.LENGTH_LONG).show();
            }
            final boolean ohne = fileCallback == null || chooserStale;
            ValueCallback<Uri[]> cb = fileCallback;
            fileCallback = null;
            if (cb != null && !chooserStale) {
                final long t0 = System.currentTimeMillis();
                cb.onReceiveValue(uris);
                if (n > 0) {
                    // Kommt die Auswahl bei der Seite nicht an, geben wir die Bilder selbst weiter.
                    h.postDelayed(() -> {
                        if (web != null) web.evaluateJavascript("(window.__zaneChange||0)", v -> {
                            long seen = 0;
                            try { seen = Long.parseLong(v.replace("\"", "").trim()); } catch (Throwable ignored) { }
                            if (seen < t0) injectFiles(uris);
                        });
                    }, 2500);
                }
            } else if (n > 0) {
                injectFiles(uris);
            }
            chooserStale = false;
            return;
        }
        super.onActivityResult(req, res, data);
    }

    // ---- Weckwort erkannt: Zane sagt "Ja?" und hört zu ----
    void runWake() {
        h.postDelayed(() -> js("window.__zaneWakePending=true;if(window.zaneWake)window.zaneWake();"), 400);
    }

    static void wakeFromService(android.content.Context c) {
        MainActivity a = current;
        if (a != null && WakeService.activityResumed) {
            a.runOnUiThread(a::runWake);
            return;
        }
        if (System.currentTimeMillis() < pickerUntil) return;   // Ordner/Kamera ist gerade offen: nicht dazwischenfunken
        pendingWake = true;
        Intent i = new Intent(c, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        i.putExtra("wake", true);
        try {
            c.startActivity(i);
        } catch (Throwable ignored) { }
    }

    private Uri[] urisAus(Intent data) {
        ArrayList<Uri> l = new ArrayList<>();
        try {
            if (data != null) {
                android.content.ClipData cd = data.getClipData();
                if (cd != null) for (int k = 0; k < cd.getItemCount(); k++) {
                    Uri u = cd.getItemAt(k).getUri();
                    if (u != null) l.add(u);
                }
                if (l.isEmpty() && data.getData() != null) l.add(data.getData());
            }
        } catch (Throwable ignored) { }
        return l.toArray(new Uri[0]);
    }

    // ---- Bilder aus dem Ordner selbst an die Seite geben (Notweg) ----
    private void injectFiles(final Uri[] uris) {
        new Thread(() -> {
            try {
                JSONArray arr = new JSONArray();
                for (int k = 0; k < uris.length && k < 6; k++) {
                    String d = bildAlsDatenUrl(uris[k]);
                    if (d != null) arr.put(d);
                }
                if (arr.length() == 0) return;
                final String code = "window.__zaneFiles&&window.__zaneFiles(" + arr.toString() + ");";
                runOnUiThread(() -> js(code));
            } catch (Throwable ignored) { }
        }).start();
    }

    private String bildAlsDatenUrl(Uri u) {
        try {
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inJustDecodeBounds = true;
            try (InputStream in = getContentResolver().openInputStream(u)) { BitmapFactory.decodeStream(in, null, o); }
            int max = Math.max(o.outWidth, o.outHeight);
            if (max <= 0) return null;
            int sample = 1;
            while (max / sample > 2400) sample *= 2;
            BitmapFactory.Options o2 = new BitmapFactory.Options();
            o2.inSampleSize = sample;
            Bitmap bm;
            try (InputStream in = getContentResolver().openInputStream(u)) { bm = BitmapFactory.decodeStream(in, null, o2); }
            if (bm == null) return null;
            int m2 = Math.max(bm.getWidth(), bm.getHeight());
            if (m2 > 1800) {
                float f = 1800f / m2;
                bm = Bitmap.createScaledBitmap(bm, Math.round(bm.getWidth() * f), Math.round(bm.getHeight() * f), true);
            }
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            bm.compress(Bitmap.CompressFormat.JPEG, 88, bo);
            return "data:image/jpeg;base64," + Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP);
        } catch (Throwable e) {
            return null;
        }
    }

    // ---- Drucken (Rezepte): Android-Druckdialog, dort geht auch "Als PDF speichern" ----
    private WebView printWeb;

    void printHtml(final String title, final String html) {
        runOnUiThread(() -> {
            try {
                final WebView w = new WebView(this);
                final boolean[] done = { false };
                w.setWebViewClient(new WebViewClient() {
                    @Override public void onPageFinished(WebView v, String u) {
                        if (done[0]) return;
                        done[0] = true;
                        try {
                            PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
                            PrintDocumentAdapter ad = v.createPrintDocumentAdapter(title);
                            pm.print(title, ad, new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
                        } catch (Throwable ignored) { }
                    }
                });
                printWeb = w;   // festhalten, bis der Druckdialog fertig ist
                w.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
            } catch (Throwable ignored) { }
        });
    }

    private void js(String code) {
        if (web != null) web.evaluateJavascript(code, null);
    }

    private void send(String type, String json) {
        js("window.__zaneRec&&window.__zaneRec(" + JSONObject.quote(type) + "," + (json == null ? "null" : json) + ");");
    }

    // ---- Spracherkennung (ersetzt webkitSpeechRecognition) ----
    void nativeRecStart(String lang, int maxAlt) {
        runOnUiThread(() -> {
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                send("error", "{\"error\":\"not-allowed\"}");
                send("end", null);
                return;
            }
            if (recognizer == null) {
                recognizer = SpeechRecognizer.createSpeechRecognizer(this);
                recognizer.setRecognitionListener(listener);
            }
            recAborted = false;
            recRunning = true;
            final int sess = ++recSession;
            WakeService.setRecActive(true);
            final Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang == null ? "de-DE" : lang);
            i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, Math.max(1, maxAlt));
            i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
            i.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName());
            h.postDelayed(() -> {
                if (!recRunning) return;
                try { recognizer.startListening(i); } catch (Throwable e) { finishRec("audio-capture"); return; }
                // Meldet sich die Android-Spracherkennung nie zurück, nach 40 Sekunden selbst beenden
                h.postDelayed(() -> {
                    if (recRunning && recSession == sess) {
                        try { recognizer.cancel(); } catch (Throwable ignored) { }
                        finishRec("no-speech");
                    }
                }, 40000);
            }, 250);
        });
    }

    void nativeRecStop() {
        runOnUiThread(() -> { if (recognizer != null && recRunning) { try { recognizer.stopListening(); } catch (Throwable ignored) { } } });
    }

    void nativeRecAbort() {
        runOnUiThread(() -> {
            if (recognizer != null && recRunning) {
                recAborted = true;
                try { recognizer.cancel(); } catch (Throwable ignored) { }
                finishRec(null);
            }
        });
    }

    private void finishRec(String error) {
        recRunning = false;
        WakeService.setRecActive(false);
        if (error != null) send("error", "{\"error\":" + JSONObject.quote(error) + "}");
        send("end", null);
    }

    private final RecognitionListener listener = new RecognitionListener() {
        @Override public void onReadyForSpeech(Bundle b) { send("start", null); send("audiostart", null); }
        @Override public void onBeginningOfSpeech() { send("soundstart", null); send("speechstart", null); }
        @Override public void onRmsChanged(float v) { }
        @Override public void onBufferReceived(byte[] b) { }
        @Override public void onEndOfSpeech() { send("speechend", null); send("soundend", null); send("audioend", null); }
        @Override public void onPartialResults(Bundle b) { }
        @Override public void onEvent(int t, Bundle b) { }

        @Override
        public void onError(int code) {
            if (!recRunning) return;
            String e;
            switch (code) {
                case SpeechRecognizer.ERROR_NO_MATCH:
                case SpeechRecognizer.ERROR_SPEECH_TIMEOUT: e = "no-speech"; break;
                case SpeechRecognizer.ERROR_AUDIO: e = "audio-capture"; break;
                case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: e = "not-allowed"; break;
                case SpeechRecognizer.ERROR_NETWORK:
                case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
                case SpeechRecognizer.ERROR_SERVER: e = "network"; break;
                case SpeechRecognizer.ERROR_CLIENT:
                case SpeechRecognizer.ERROR_RECOGNIZER_BUSY: e = "aborted"; break;
                default: e = "no-speech";
            }
            finishRec(e);
        }

        @Override
        public void onResults(Bundle b) {
            if (!recRunning) return;
            try {
                ArrayList<String> t = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                float[] c = b.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES);
                if (t == null || t.isEmpty()) { finishRec("no-speech"); return; }
                JSONArray alts = new JSONArray();
                for (int k = 0; k < t.size(); k++) {
                    JSONObject o = new JSONObject();
                    o.put("t", t.get(k));
                    o.put("c", (c != null && k < c.length) ? c[k] : 0.9);
                    alts.put(o);
                }
                send("result", alts.toString());
                finishRec(null);
            } catch (Throwable e) {
                finishRec("no-speech");
            }
        }
    };
}
