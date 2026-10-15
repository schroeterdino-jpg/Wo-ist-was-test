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

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Locale;

/** Lauscht im Hintergrund auf "Hey Nova" (Vosk) und weckt Nova. Pausiert, solange Nova spricht oder zuhört. */
public class WakeService extends Service implements RecognitionListener {

    private static final String CH_LISTEN = "zane_listen";
    private static final String CH_WAKE = "zane_wake";

    // Zustand, den Nova (Seite) und die Spracherkennung melden
    static volatile boolean pageBusy = false;
    static volatile boolean recActive = false;
    static volatile boolean activityResumed = false;
    static volatile long holdUntil = 0;
    static volatile long recSince = 0;
    static volatile long busySince = 0;
    static WakeService inst;

    private final Handler main = new Handler(Looper.getMainLooper());
    private Model model;
    private SpeechService speech;
    private PowerManager.WakeLock wakeLock;
    private boolean loading = false;
    private boolean alive = false;
    private boolean startPending = false;
    private long lastTrigger = 0;
    private long speechSince = 0;
    private boolean watchdogOn = false;

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
                    if (speech == null && !startPending) evalVosk();
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
        nm.createNotificationChannel(new NotificationChannel(CH_LISTEN, "Nova hört zu", NotificationManager.IMPORTANCE_LOW));
        nm.createNotificationChannel(new NotificationChannel(CH_WAKE, "Hey Nova erkannt", NotificationManager.IMPORTANCE_HIGH));
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
                .setContentTitle(manuell ? "Nova ist aus" : aus ? "Nova schläft (Nachtruhe)" : "Nova hört zu")
                .setContentText(manuell ? "„Hey Nova“ ist ausgeschaltet" : aus ? "Nachtruhe bis " + Prefs.hhmm(Prefs.nightTo(this)) + " Uhr" : "Sag „Hey Nova“")
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
        wakeLockAnpassen();
        if (model == null) {
            loadModel();
        } else {
            stopSpeech();   // z. B. nach Änderung der Empfindlichkeit: mit neuer Wortliste neu starten
            evalVosk();
        }
        return START_STICKY;
    }

    private void loadModel() {
        if (loading) return;
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
                    if (!alive) { m.close(); return; }
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

    // ---- Wann lauschen wir? Nicht, wenn Nova spricht/zuhört oder die Spracherkennung läuft ----
    private boolean want() {
        if (!alive || model == null) return false;
        if (ausgeschaltet()) return false;
        if (recActive) return false;
        if (System.currentTimeMillis() < holdUntil) return false;
        if (activityResumed && pageBusy) return false;
        return true;
    }

    private final Runnable startRun = () -> {
        startPending = false;
        if (want() && speech == null) startSpeech();
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
            if (speech != null) {
                stopSpeech();
                Prefs.setStatus(this, "Pause (" + (recActive ? "Spracherkennung läuft" : System.currentTimeMillis() < holdUntil ? "Ordner oder Kamera offen, oder Nova gerade geweckt" : "Nova spricht oder hört zu") + ")");
            }
            if (alive && model != null && System.currentTimeMillis() < holdUntil) {
                main.postDelayed(this::evalVosk, holdUntil - System.currentTimeMillis() + 100);
            }
            return;
        }
        if (speech == null && !startPending) {
            startPending = true;
            main.postDelayed(startRun, 1500);   // kurz warten, damit Nova-Ton nicht ins Weckwort fällt
        }
    }

    // ---- Weckwort-Erkennung ----
    private static final String[][] NAMEN = {
            {"nova"},
            {"nova", "novo"},
            {"nova", "novo", "noah", "nover"}
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

    private void startSpeech() {
        stopSpeech();
        if (model == null || !alive) return;
        try {
            Recognizer rec = new Recognizer(model, 16000.0f, grammar());
            rec.setWords(true);
            speech = new SpeechService(rec, 16000.0f);
            speech.startListening(this);
            speechSince = System.currentTimeMillis();
            Prefs.setStatus(this, "lauscht auf „Hey Nova“");
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
        holdUntil = now + 8000;   // Nova braucht einen Moment, bis er "Ja?" sagt und als beschäftigt gilt
        stopSpeech();
        Prefs.setStatus(this, "Hey Nova erkannt");
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
            if (activityResumed) return;   // Nova ist schon offen: keine Meldung nötig
            // Notlösung: Ohne "Über anderen Apps einblenden" darf Android Nova nicht von selbst nach vorn holen
            try {
                Intent i = new Intent(this, MainActivity.class).putExtra("wake", true)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                PendingIntent pi = PendingIntent.getActivity(this, 1, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
                Notification n = new Notification.Builder(this, CH_WAKE)
                        .setContentTitle("Hey Nova erkannt")
                        .setContentText("Tippen, um Nova zu öffnen")
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
            meldung.run();   // gesperrter Bildschirm: sofort, nur so geht Nova über dem Sperrbildschirm auf
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

    @Override
    public void onDestroy() {
        alive = false;
        inst = null;
        main.removeCallbacksAndMessages(null);
        stopSpeech();
        if (model != null) { model.close(); model = null; }
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
        Prefs.setStatus(this, "aus");
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
