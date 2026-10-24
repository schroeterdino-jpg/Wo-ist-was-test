package de.dino.zaneweckruf;

import android.app.AlarmManager;
import android.app.KeyguardManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import org.json.JSONArray;
import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;
import org.vosk.android.RecognitionListener;
import org.vosk.android.SpeechService;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Locale;

/** Lauscht im Hintergrund auf "Hey Jarvis" (Vosk) und weckt Jarvis. Pausiert, solange Jarvis spricht oder zuhört. */
public class WakeService extends Service implements RecognitionListener {

    private static final String CH_LISTEN = "zane_listen";
    private static final String CH_WAKE = "zane_wake";

    // Zustand, den Jarvis (Seite) und die Spracherkennung melden
    static volatile boolean pageBusy = false;
    static volatile boolean recActive = false;
    static volatile boolean activityResumed = false;
    static volatile long holdUntil = 0;
    static volatile long recSince = 0;
    static volatile long busySince = 0;
    static volatile boolean sprechen = false;   // Jarvis spricht gerade (die Seite meldet es), für das Unterbrechen per Sprache
    static WakeService inst;

    private final Handler main = new Handler(Looper.getMainLooper());
    private Model model;
    private GatedSpeech speech;
    private OwwEngine oww;           // openWakeWord (Engine 1), sonst bleibt Vosk (Engine 0) im Einsatz
    private OwwVad vad;              // Sprach-Schranke (Silero VAD); fehlt sie, gilt nur die Lautstärke
    private OwwSpeech owwSpeech;
    private PowerManager.WakeLock wakeLock;
    private boolean loading = false;
    private boolean alive = false;
    private boolean startPending = false;
    private long lastTrigger = 0;
    private long speechSince = 0;
    private boolean watchdogOn = false;
    private CarWatcher car;          // Bluetooth des Autos: Parkplatz automatisch merken

    // Wächter: startet das Lauschen neu, wenn es still gestorben ist, und frischt es alle paar Minuten auf
    private final Runnable watchdog = new Runnable() {
        @Override public void run() {
            if (!alive) return;
            try {
                // Hängt gebliebene Meldungen lösen (sonst bleibt das Weckwort für immer auf Pause)
                if (nachtAktiv() != letzteNacht) nachtWechsel();   // Nachtruhe hat gerade begonnen oder geendet
                long jetzt = System.currentTimeMillis();
                boolean geloest = false;
                if (recActive && jetzt - recSince > 45000) { recActive = false; geloest = true; }
                if (pageBusy && jetzt - busySince > 600000) { pageBusy = false; geloest = true; }
                if (geloest) evalVosk();
                if (want()) {
                    if (!listening() && !startPending) evalVosk();
                    else if (speech != null && System.currentTimeMillis() - speechSince > 240000) {
                        stopSpeech();
                        evalVosk();
                    }
                }
            } catch (Throwable ignored) { }
            main.postDelayed(this, 15000);
        }
    };

    static void setPageBusy(boolean b) { if (pageBusy != b) { pageBusy = b; if (b) busySince = System.currentTimeMillis(); poke(); } }
    static void setSprechen(boolean b) {
        if (sprechen == b) return;
        sprechen = b;
        final WakeService s = inst;
        // Unterbrechen per Sprache: beim Beginn und Ende des Sprechens neu starten, damit die passende Schwelle gilt
        if (s != null && Prefs.unterbrechen(s) && s.useOww()) s.main.post(() -> { s.stopSpeech(); s.evalVosk(); });
    }
    /** Von den Einstellungen: Unterbrechen an/aus geändert. */
    static void neuStarten() {
        final WakeService s = inst;
        if (s != null) s.main.post(() -> { s.stopSpeech(); s.evalVosk(); });
    }
    private boolean unterbrechenMoeglich() { return sprechen && !recActive && Prefs.unterbrechen(this) && useOww(); }
    static void setRecActive(boolean b) { if (b && !recActive) recSince = System.currentTimeMillis(); recActive = b; poke(); }
    static void setActivityResumed(boolean b) { activityResumed = b; poke(); }

    static long hold(long ms) { long v = System.currentTimeMillis() + ms; holdUntil = v; poke(); return v; }
    static void release(long was) { if (was != 0 && holdUntil == was) { holdUntil = 0; poke(); } }

    private static void poke() {
        final WakeService s = inst;
        if (s != null) s.main.post(s::evalVosk);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        inst = this;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        nm.createNotificationChannel(new NotificationChannel(CH_LISTEN, "Jarvis hört zu", NotificationManager.IMPORTANCE_LOW));
        nm.createNotificationChannel(new NotificationChannel(CH_WAKE, "Hey Jarvis erkannt", NotificationManager.IMPORTANCE_HIGH));
        try { car = CarWatcher.registrieren(this); } catch (Throwable ignored) { }   // Parkplatz automatisch merken (Auto-Bluetooth)
        audioBeobachten();
    }

    // ---- Mikrofon im Auto: Wechselt das Audio-Gerät (Bluetooth, Android Auto) oder nimmt eine andere App das Mikrofon weg, lauscht das Weckwort sonst stumm weiter ----
    private final Runnable audioNeu = () -> {
        if (!alive || !want()) return;
        stopSpeech();
        evalVosk();
    };
    private android.media.AudioDeviceCallback audioGeraete;
    private android.media.AudioManager.AudioRecordingCallback audioAufnahme;
    private long letzteStumm = 0;

    void audioNeuPlanen(long ms) {
        main.removeCallbacks(audioNeu);
        main.postDelayed(audioNeu, ms);
    }

    /** Vom CarWatcher: Auto per Bluetooth verbunden. Android Auto und das Mikrofon brauchen einige Sekunden, daher zweimal neu starten. */
    static void audioNeuNachAuto() {
        final WakeService s = inst;
        if (s == null) return;
        s.main.post(() -> {
            s.audioNeuPlanen(6000);
            s.main.postDelayed(s::audioNeuPlanenSpaet, 20000);
        });
    }
    private void audioNeuPlanenSpaet() { audioNeuPlanen(500); }

    private void audioBeobachten() {
        try {
            AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (am == null) return;
            audioGeraete = new android.media.AudioDeviceCallback() {
                @Override public void onAudioDevicesAdded(android.media.AudioDeviceInfo[] a) { audioNeuPlanen(3000); }
                @Override public void onAudioDevicesRemoved(android.media.AudioDeviceInfo[] a) { audioNeuPlanen(3000); }
            };
            am.registerAudioDeviceCallback(audioGeraete, main);
            audioAufnahme = new android.media.AudioManager.AudioRecordingCallback() {
                @Override public void onRecordingConfigChanged(java.util.List<android.media.AudioRecordingConfiguration> l) {
                    try {
                        if (Build.VERSION.SDK_INT < 29 || l == null || !listening()) return;
                        for (android.media.AudioRecordingConfiguration c : l) {
                            if (c.isClientSilenced()) {   // Android hat unser Mikrofon stumm geschaltet (andere App hat es): später neu starten, höchstens alle 20 s
                                long now = System.currentTimeMillis();
                                if (now - letzteStumm > 20000) { letzteStumm = now; audioNeuPlanen(4000); }
                                return;
                            }
                        }
                    } catch (Throwable ignored) { }
                }
            };
            am.registerAudioRecordingCallback(audioAufnahme, main);
        } catch (Throwable ignored) { }
    }
    private void audioNichtMehr() {
        try {
            AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (am == null) return;
            if (audioGeraete != null) am.unregisterAudioDeviceCallback(audioGeraete);
            if (audioAufnahme != null) am.unregisterAudioRecordingCallback(audioAufnahme);
        } catch (Throwable ignored) { }
        audioGeraete = null; audioAufnahme = null;
    }

    static final String ACTION_TOGGLE = "de.dino.zaneweckruf.TOGGLE";
    static final String ACTION_NACHT = "de.dino.zaneweckruf.NACHT";

    // ---- Nachtruhe: zwischen zwei Uhrzeiten schläft das Weckwort (Handy-Zeit) ----
    private boolean letzteNacht = false;

    private static boolean inNacht(int von, int bis) {
        java.util.Calendar c = java.util.Calendar.getInstance();
        int m = c.get(java.util.Calendar.HOUR_OF_DAY) * 60 + c.get(java.util.Calendar.MINUTE);
        if (von == bis) return false;
        return von < bis ? (m >= von && m < bis) : (m >= von || m < bis);
    }

    /** Nächster Zeitpunkt (Millisekunden), an dem die angegebene Uhrzeit (Minuten seit Mitternacht) erreicht wird. */
    private static long naechste(int minuten) {
        java.util.Calendar c = java.util.Calendar.getInstance();
        c.set(java.util.Calendar.HOUR_OF_DAY, minuten / 60);
        c.set(java.util.Calendar.MINUTE, minuten % 60);
        c.set(java.util.Calendar.SECOND, 0);
        c.set(java.util.Calendar.MILLISECOND, 0);
        if (c.getTimeInMillis() <= System.currentTimeMillis() + 1000) c.add(java.util.Calendar.DAY_OF_YEAR, 1);
        return c.getTimeInMillis();
    }

    /** Ist gerade Nachtruhe (und nicht per "Einschalten" übersteuert)? */
    private boolean nachtAktiv() {
        if (!Prefs.nightOn(this)) return false;
        if (System.currentTimeMillis() < Prefs.nightOver(this)) return false;
        return inNacht(Prefs.nightFrom(this), Prefs.nightTo(this));
    }

    /** Aus per Knopf oder wegen Nachtruhe. */
    private boolean ausgeschaltet() {
        return Prefs.muted(this) || nachtAktiv();
    }

    private void wakeLockAnpassen() {
        if (ausgeschaltet()) {
            // ausgeschaltet: kein Dauer-Wachhalten, das spart Akku
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
            wakeLock = null;
        } else if (wakeLock == null) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "zane:lauschen");
            wakeLock.acquire();
        }
    }

    /** Weckt den Dienst zur nächsten Grenze der Nachtruhe, auch wenn das Handy schläft (ohne Wachhalten). */
    private void nachtPlanen() {
        try {
            AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            Intent i = new Intent(this, WakeService.class);
            i.setAction(ACTION_NACHT);
            PendingIntent pi = PendingIntent.getService(this, 3, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            if (!Prefs.nightOn(this)) { am.cancel(pi); return; }
            long t = Math.min(naechste(Prefs.nightFrom(this)), naechste(Prefs.nightTo(this)));
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, t, pi);
        } catch (Throwable ignored) { }
    }

    /** Nachtruhe hat begonnen/geendet oder wurde in den Einstellungen geändert: alles anpassen. */
    void nachtWechsel() {
        try {
            letzteNacht = nachtAktiv();
            ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).notify(1, baueBenachrichtigung());
            wakeLockAnpassen();
            nachtPlanen();
            evalVosk();
        } catch (Throwable ignored) { }
    }

    static void nachtGeaendert() {
        final WakeService s = inst;
        if (s != null) s.main.post(s::nachtWechsel);
    }

    // Benachrichtigung mit Knopf: Weckwort ein- oder ausschalten (der Dienst bleibt dabei bestehen)
    private Notification baueBenachrichtigung() {
        boolean manuell = Prefs.muted(this);
        boolean aus = ausgeschaltet();
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE);
        Intent tog = new Intent(this, WakeService.class);
        tog.setAction(ACTION_TOGGLE);
        PendingIntent togPi = PendingIntent.getService(this, 2, tog, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Builder(this, CH_LISTEN)
                .setContentTitle(manuell ? "Jarvis ist aus" : aus ? "Jarvis schläft (Nachtruhe)" : "Jarvis hört zu")
                .setContentText(manuell ? "„" + weckwort() + "“ ist ausgeschaltet" : aus ? "Nachtruhe bis " + Prefs.hhmm(Prefs.nightTo(this)) + " Uhr" : "Sag „" + weckwort() + "“")
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setOngoing(true)
                .setContentIntent(pi)
                .addAction(android.R.drawable.ic_media_pause, aus ? "Einschalten" : "Ausschalten", togPi)
                .build();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_TOGGLE.equals(intent.getAction())) {
            if (ausgeschaltet()) {
                // Einschalten; mitten in der Nachtruhe gilt das bis zu ihrem Ende
                Prefs.setMuted(this, false);
                if (nachtAktiv()) Prefs.setNightOver(this, naechste(Prefs.nightTo(this)));
                Prefs.setStatus(this, "lädt …");
            } else {
                Prefs.setMuted(this, true);
                Prefs.setNightOver(this, 0L);
                Prefs.setStatus(this, "aus (Knopf in der Benachrichtigung)");
            }
        }
        letzteNacht = nachtAktiv();
        nachtPlanen();
        Notification n = baueBenachrichtigung();
        if (Build.VERSION.SDK_INT >= 30) {
            startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        } else {
            startForeground(1, n);
        }
        alive = true;
        if (!watchdogOn) { watchdogOn = true; main.postDelayed(watchdog, 15000); }
        if (!gespraechOn) { gespraechOn = true; main.postDelayed(gespraechPruefen, 2000); }   // Telefonat erkennen: Mikrofon freigeben
        if (!meldungenOn) { meldungenOn = true; main.postDelayed(meldungenRun, 20000); }   // jede Minute nach Meldungen vom Server fragen (statt Web-Push)
        wakeLockAnpassen();
        if (!ready()) {
            stopSpeech();   // z. B. nach Wechsel der Erkennung: die alte hört nicht weiter zu, bis die neue geladen ist
            loadModel();
        } else {
            stopSpeech();   // z. B. nach Änderung der Empfindlichkeit: mit neuer Wortliste neu starten
            evalVosk();
        }
        return START_STICKY;
    }

    // Meldungen vom Server (Erinnerungen, Abfahrt, Diesel, Aufträge ...): im WebView der App gibt es kein Web-Push, darum fragt der Dienst
    // jede Minute nach (eine kleine Abfrage; AuftragReceiver macht daraus Meldungen). Nur wenn die Seite der App den App-Code übergeben hat.
    private boolean meldungenOn = false;
    private final Runnable meldungenRun = new Runnable() {
        @Override public void run() {
            try { AuftragReceiver.abfragenAsync(WakeService.this); } catch (Throwable ignored) { }
            if (alive) main.postDelayed(this, 60000);
            else meldungenOn = false;
        }
    };

    private boolean useOww() { return Prefs.engine(this) == 1; }

    /** Name des Weckworts für Anzeigen; im openWakeWord-Test ist es das fertige Modell "Hey Jarvis". */
    private String weckwort() { return useOww() ? "Hey Jarvis" : "Hey Jarvis"; }

    /** Ist die gewählte Erkennung geladen? */
    private boolean ready() { return useOww() ? oww != null : model != null; }

    private boolean listening() { return speech != null || owwSpeech != null; }

    private byte[] assetBytes(String name) throws Exception {
        try (InputStream in = getAssets().open(name); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[65536];
            int r;
            while ((r = in.read(buf)) > 0) out.write(buf, 0, r);
            return out.toByteArray();
        }
    }

    private void loadOww() {
        loading = true;
        Prefs.setStatus(this, "lädt openWakeWord …");
        new Thread(() -> {
            try {
                OwwEngine e = new OwwEngine(assetBytes("oww/melspectrogram.onnx"), assetBytes("oww/embedding_model.onnx"), assetBytes("oww/wake.onnx"));
                OwwVad v0 = null;
                try { v0 = new OwwVad(assetBytes("oww/vad.onnx")); } catch (Throwable ignored) { }   // ohne Sprach-Modell läuft es wie bisher
                final OwwVad v = v0;
                main.post(() -> {
                    loading = false;
                    if (!alive || !useOww()) { e.close(); if (v != null) v.close(); return; }
                    if (vad != null) { vad.close(); vad = null; }
                    vad = v;
                    if (model != null) { model.close(); model = null; }   // Vosk wird in diesem Modus nicht gebraucht, das spart Speicher
                    oww = e;
                    evalVosk();
                });
            } catch (Throwable e) {
                loading = false;
                Prefs.setStatus(this, "Fehler beim Laden (openWakeWord): " + e);
            }
        }).start();
    }

    private void loadModel() {
        if (loading) return;
        if (useOww()) { loadOww(); return; }
        loading = true;
        Prefs.setStatus(this, "lädt Sprachmodell …");
        new Thread(() -> {
            try {
                File dir = new File(getFilesDir(), "model");
                File marker = new File(dir, ".fertig");
                if (!marker.exists()) {
                    deleteRec(dir);
                    copyAssets("model", dir);
                    new FileOutputStream(marker).close();
                }
                Model m = new Model(dir.getAbsolutePath());
                main.post(() -> {
                    loading = false;
                    if (!alive || useOww()) { m.close(); return; }
                    if (oww != null) { oww.close(); oww = null; }
                    if (vad != null) { vad.close(); vad = null; }
                    model = m;
                    evalVosk();
                });
            } catch (Throwable e) {
                loading = false;
                Prefs.setStatus(this, "Fehler beim Laden: " + e);
            }
        }).start();
    }

    private void copyAssets(String assetPath, File target) throws Exception {
        String[] kids = getAssets().list(assetPath);
        if (kids == null || kids.length == 0) {
            target.getParentFile().mkdirs();
            try (InputStream in = getAssets().open(assetPath); OutputStream out = new FileOutputStream(target)) {
                byte[] buf = new byte[65536];
                int r;
                while ((r = in.read(buf)) > 0) out.write(buf, 0, r);
            }
        } else {
            target.mkdirs();
            for (String k : kids) copyAssets(assetPath + "/" + k, new File(target, k));
        }
    }

    private void deleteRec(File f) {
        if (!f.exists()) return;
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteRec(k);
        f.delete();
    }

    // ---- Wann lauschen wir? Nicht, wenn Jarvis spricht/zuhört oder die Spracherkennung läuft ----
    /** Läuft gerade ein Telefonat (auch über Bluetooth/Auto)? Dann gibt Jarvis das Mikrofon frei, sonst stört er das Gespräch. */
    private boolean inGespraech() {
        try {
            AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (am == null) return false;
            int m = am.getMode();
            return m == AudioManager.MODE_IN_CALL || m == AudioManager.MODE_IN_COMMUNICATION || m == AudioManager.MODE_RINGTONE;
        } catch (Throwable e) { return false; }
    }
    private boolean letzteGespraech = false, gespraechOn = false;
    private final Runnable gespraechPruefen = new Runnable() {
        @Override public void run() {
            if (!alive) return;
            try {
                boolean jetzt = inGespraech();
                if (jetzt != letzteGespraech) {
                    letzteGespraech = jetzt;
                    if (jetzt) { stopSpeech(); Prefs.setStatus(WakeService.this, "Pause (Telefonat läuft)"); }
                    else audioNeuPlanen(2500);   // Gespräch zu Ende: Weckwort kurz danach wieder an
                }
            } catch (Throwable ignored) { }
            main.postDelayed(this, 2000);
        }
    };

    private boolean want() {
        if (!alive || !ready()) return false;
        if (ausgeschaltet()) return false;
        if (inGespraech()) return false;
        if (recActive) return false;
        if (System.currentTimeMillis() < holdUntil) return false;
        if (activityResumed && pageBusy && !unterbrechenMoeglich()) return false;   // Jarvis spricht/hört zu: Pause (außer er darf unterbrochen werden)
        return true;
    }

    private final Runnable startRun = () -> {
        startPending = false;
        if (want() && !listening()) startSpeech();
    };

    void evalVosk() {
        if (!want()) {
            main.removeCallbacks(startRun);
            startPending = false;
            if (ausgeschaltet()) {
                stopSpeech();
                Prefs.setStatus(this, Prefs.muted(this) ? "aus (Knopf in der Benachrichtigung)" : "Nachtruhe bis " + Prefs.hhmm(Prefs.nightTo(this)) + " Uhr");
                return;
            }
            if (listening()) {
                stopSpeech();
                Prefs.setStatus(this, "Pause (" + (recActive ? "Spracherkennung läuft" : System.currentTimeMillis() < holdUntil ? "Ordner oder Kamera offen, oder Jarvis gerade geweckt" : "Jarvis spricht oder hört zu") + ")");
            }
            if (alive && ready() && System.currentTimeMillis() < holdUntil) {
                main.postDelayed(this::evalVosk, holdUntil - System.currentTimeMillis() + 100);
            }
            return;
        }
        if (!listening() && !startPending) {
            startPending = true;
            main.postDelayed(startRun, 1500);   // kurz warten, damit Jarvis-Ton nicht ins Weckwort fällt
        }
    }

    // ---- Weckwort-Erkennung ----
    private static final String[][] NAMEN = {
            {"jarvis"},
            {"jarvis", "jarvas"},
            {"jarvis", "jarvas", "jarvus", "service"}
    };
    private static final String[] ABLENKER = {"hey", "hey there", "hey you", "hey man", "hey guys", "hey john", "hey jay",
            "hey siri", "hey google", "hey alexa", "hey sam", "hey dan", "hey ben", "hey jack", "hey mate", "okay", "hello", "hi there"};

    private String grammar() {
        StringBuilder g = new StringBuilder("[");
        for (String n : NAMEN[Prefs.level(this)]) g.append("\"hey ").append(n).append("\", ");
        for (String d : ABLENKER) g.append("\"").append(d).append("\", ");
        g.append("\"[unk]\"]");
        return g.toString();
    }

    // ---- openWakeWord: Schwelle je nach Empfindlichkeit (0 streng, 1 normal, 2 empfindlich) ----
    private float owwSchwelle() {
        int l = Prefs.level(this);
        return l == 0 ? 0.75f : (l == 1 ? 0.5f : 0.35f);
    }

    private void startOww() {
        try {
            float schwelle = owwSchwelle();
            if (unterbrechenMoeglich()) schwelle = Math.min(0.9f, schwelle + 0.25f);   // Jarvis' eigene Stimme soll das Weckwort nicht auslösen: strenger
            owwSpeech = new OwwSpeech(this, oww, schwelle, vad);
            owwSpeech.startListening(new OwwSpeech.Listener() {
                @Override public void onWake(float score) {
                    if (owwSpeech == null) return;   // inzwischen pausiert: Treffer verwerfen
                    trigger();
                }
                @Override public void onError(Exception e) {
                    Prefs.setStatus(WakeService.this, "Fehler: " + e);
                    stopSpeech();
                    main.postDelayed(WakeService.this::evalVosk, 2000);
                }
            });
            speechSince = System.currentTimeMillis();
            Prefs.setStatus(this, "lauscht auf „" + weckwort() + "“ (openWakeWord)");
        } catch (Throwable e) {
            if (owwSpeech != null) { try { owwSpeech.shutdown(); } catch (Throwable ignored) { } }
            owwSpeech = null;
            Prefs.setStatus(this, "Fehler beim Lauschen: " + e);
        }
    }

    private void startSpeech() {
        stopSpeech();
        if (!alive || !ready()) return;
        if (useOww()) { startOww(); return; }
        try {
            Recognizer rec = new Recognizer(model, 16000.0f, grammar());
            rec.setWords(true);
            speech = new GatedSpeech(this, rec, 16000.0f);
            speech.startListening(this);
            speechSince = System.currentTimeMillis();
            Prefs.setStatus(this, "lauscht auf „Hey Jarvis“");
        } catch (Throwable e) {
            speech = null;
            Prefs.setStatus(this, "Fehler beim Lauschen: " + e);
        }
    }

    private void stopSpeech() {
        if (speech != null) {
            try { speech.stop(); speech.shutdown(); } catch (Throwable ignored) { }
            speech = null;
        }
        if (owwSpeech != null) {
            OwwSpeech o = owwSpeech;
            owwSpeech = null;
            try { o.stop(); o.shutdown(); } catch (Throwable ignored) { }
        }
    }

    private void check(String json) {
        try {
            JSONObject o = new JSONObject(json);
            String text = o.optString("text", "").toLowerCase(Locale.ROOT).trim();
            if (text.isEmpty() || text.equals("[unk]")) return;
            double min = 1.0;
            JSONArray ws = o.optJSONArray("result");
            if (ws != null) {
                for (int k = 0; k < ws.length(); k++) min = Math.min(min, ws.getJSONObject(k).optDouble("conf", 1.0));
            }
            int level = Prefs.level(this);
            String[] teile = text.split("\\s+");
            boolean passt = false;
            if (teile.length == 2 && teile[0].equals("hey")) {
                for (String n : NAMEN[level]) if (n.equals(teile[1])) passt = true;
            }
            double noetig = level == 0 ? 0.8 : (level == 1 ? 0.6 : 0.4);
            String info = text + " (" + String.format(Locale.US, "%.2f", min) + ")";
            if (passt && min >= noetig) {
                Prefs.setLast(this, "erkannt: " + info);
                trigger();
            } else {
                Prefs.setLast(this, "abgelehnt: " + info);
            }
        } catch (Throwable ignored) { }
    }

    private void trigger() {
        long now = System.currentTimeMillis();
        if (now - lastTrigger < 5000) return;
        lastTrigger = now;
        Prefs.addHit(this);
        holdUntil = now + 8000;   // Jarvis braucht einen Moment, bis er "Ja?" sagt und als beschäftigt gilt
        stopSpeech();
        Prefs.setStatus(this, "Hey Jarvis erkannt");
        try {
            new ToneGenerator(AudioManager.STREAM_NOTIFICATION, 80).startTone(ToneGenerator.TONE_PROP_BEEP, 150);
        } catch (Throwable ignored) { }
        boolean gesperrt = false;
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            gesperrt = !pm.isInteractive() || km.isKeyguardLocked();
            if (gesperrt) {   // Bildschirm einschalten
                @SuppressWarnings("deprecation")
                PowerManager.WakeLock w = pm.newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK
                        | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE, "zane:wach");
                w.acquire(15000);
            }
        } catch (Throwable ignored) { }
        final Runnable meldung = () -> {
            if (activityResumed) return;   // Jarvis ist schon offen: keine Meldung nötig
            // Notlösung: Ohne "Über anderen Apps einblenden" darf Android Jarvis nicht von selbst nach vorn holen
            try {
                Intent i = new Intent(this, MainActivity.class).putExtra("wake", true)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                PendingIntent pi = PendingIntent.getActivity(this, 1, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
                Notification n = new Notification.Builder(this, CH_WAKE)
                        .setContentTitle("Hey Jarvis erkannt")
                        .setContentText("Tippen, um Jarvis zu öffnen")
                        .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                        .setCategory(Notification.CATEGORY_ALARM)
                        .setAutoCancel(true)
                        .setContentIntent(pi)
                        .setFullScreenIntent(pi, true)
                        .build();
                NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                nm.notify(2, n);
                main.postDelayed(() -> nm.cancel(2), 30000);
            } catch (Throwable ignored) { }
        };
        if (gesperrt) {
            meldung.run();   // gesperrter Bildschirm: sofort, nur so geht Jarvis über dem Sperrbildschirm auf
        } else if (!android.provider.Settings.canDrawOverlays(this)) {
            main.postDelayed(meldung, 3000);
        }
        MainActivity.wakeFromService(this);
        main.postDelayed(this::evalVosk, 8200);
    }

    @Override public void onPartialResult(String hypothesis) { }
    @Override public void onResult(String hypothesis) { check(hypothesis); }
    @Override public void onFinalResult(String hypothesis) { }
    @Override public void onError(Exception exception) {
        Prefs.setStatus(this, "Fehler: " + exception);
        main.post(() -> { stopSpeech(); main.postDelayed(this::evalVosk, 2000); });
    }
    @Override public void onTimeout() { }

    /** App wurde aus der Übersicht weggewischt: Musik, die Jarvis gestartet hat, anhalten. */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        try {
            if (Prefs.musikVonJarvis(this)) {
                Prefs.setMusikVonJarvis(this, false);
                AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
                if (am != null) {
                    am.dispatchMediaKeyEvent(new android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN, android.view.KeyEvent.KEYCODE_MEDIA_PAUSE));
                    am.dispatchMediaKeyEvent(new android.view.KeyEvent(android.view.KeyEvent.ACTION_UP, android.view.KeyEvent.KEYCODE_MEDIA_PAUSE));
                }
            }
        } catch (Throwable e) { }
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        alive = false;
        meldungenOn = false;
        inst = null;
        if (car != null) { car.beenden(); car = null; }
        audioNichtMehr();
        main.removeCallbacksAndMessages(null);
        stopSpeech();
        if (model != null) { model.close(); model = null; }
        if (oww != null) { oww.close(); oww = null; }
        if (vad != null) { vad.close(); vad = null; }
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
        Prefs.setStatus(this, "aus");
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
