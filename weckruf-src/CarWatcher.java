package de.dino.zaneweckruf;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.bluetooth.BluetoothDevice;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONObject;

import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * Parkplatz automatisch merken: Trennt sich das Handy vom gewählten Auto (Bluetooth), wird der Standort als Parkplatz vorgemerkt.
 * Die Seite holt ihn danach ab (ZaneBridge.holeParkplatz), schlägt die Adresse nach und speichert ihn wie "Merk dir, wo ich geparkt habe".
 * Läuft auch ohne Lauschen: CarReceiver (Manifest) nimmt die Bluetooth-Meldungen an, ParkReceiver merkt den Parkplatz 10 Sekunden nach dem Trennen (per Wecker-Dienst).
 * Der Empfänger im WakeService bleibt als Reserve.
 */
final class CarWatcher extends BroadcastReceiver {
    private static final String CH_PARK = "zane_park";
    private static final long ENTPRELLEN_MS = 10000;   // Bluetooth flackert manchmal kurz: erst nach 10 Sekunden gilt das Auto als getrennt

    private final Context ctx;

    private CarWatcher(Context c) { ctx = c.getApplicationContext(); }

    static CarWatcher registrieren(Context c) {
        CarWatcher w = new CarWatcher(c);
        IntentFilter f = new IntentFilter();
        f.addAction(BluetoothDevice.ACTION_ACL_CONNECTED);
        f.addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED);
        if (Build.VERSION.SDK_INT >= 33) c.registerReceiver(w, f, Context.RECEIVER_EXPORTED);
        else c.registerReceiver(w, f);
        return w;
    }

    void beenden() {
        try { ctx.unregisterReceiver(this); } catch (Throwable ignored) { }
    }

    @Override
    public void onReceive(Context c, Intent i) { ereignis(c, i); }

    /** Gemeinsam für den Empfänger im Manifest (läuft auch ohne Lauschen) und den im WakeService (Reserve). */
    @SuppressWarnings("deprecation")
    static void ereignis(Context c, Intent i) {
        try {
            Context ctx = c.getApplicationContext();
            String car = Prefs.carAddr(ctx);
            if (car.isEmpty() || i == null) return;
            BluetoothDevice d = i.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
            if (d == null || !car.equalsIgnoreCase(d.getAddress())) return;
            if (BluetoothDevice.ACTION_ACL_CONNECTED.equals(i.getAction())) {
                parkAbbrechen(ctx);
                try { WakeService.audioNeuNachAuto(); } catch (Throwable ignored) { }   // Weckwort-Mikrofon neu starten, sobald das Auto da ist
                Prefs.setParkInfo(ctx, "Auto verbunden (" + Prefs.carName(ctx) + ")");
                autoOeffnen(ctx);
            } else if (BluetoothDevice.ACTION_ACL_DISCONNECTED.equals(i.getAction())) {
                parkPlanen(ctx);
            }
        } catch (Throwable ignored) { }
    }

    private static PendingIntent parkIntent(Context ctx) {
        Intent p = new Intent(ctx, ParkReceiver.class).setAction("de.dino.zaneweckruf.PARK");
        return PendingIntent.getBroadcast(ctx, 5, p, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** Erst nach 10 Sekunden gilt das Auto als getrennt (Bluetooth flackert); der Wecker-Dienst weckt dafür auch ein schlafendes Programm. */
    private static void parkPlanen(Context ctx) {
        android.app.AlarmManager am = (android.app.AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        long at = System.currentTimeMillis() + ENTPRELLEN_MS;
        try { am.setExactAndAllowWhileIdle(android.app.AlarmManager.RTC_WAKEUP, at, parkIntent(ctx)); }
        catch (Throwable e) { am.setAndAllowWhileIdle(android.app.AlarmManager.RTC_WAKEUP, at, parkIntent(ctx)); }
    }

    private static void parkAbbrechen(Context ctx) {
        try { ((android.app.AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE)).cancel(parkIntent(ctx)); } catch (Throwable ignored) { }
    }

    /** Beim Einsteigen (Bluetooth verbunden) Jarvis nach vorn holen und die Autoansicht öffnen lassen. Höchstens einmal pro Minute (Bluetooth flackert gern). */
    private static void autoOeffnen(Context ctx) {
        try {
            String zeit = new java.text.SimpleDateFormat("HH:mm:ss", Locale.GERMANY).format(new java.util.Date());
            if (!Prefs.autoEinsteigen(ctx)) { Prefs.setAutoInfo(ctx, zeit + " verbunden, aber Schalter „Autoansicht beim Einsteigen“ ist aus"); return; }
            long jetzt = System.currentTimeMillis();
            long vor = (jetzt - Prefs.autoZuletzt(ctx)) / 1000;
            if (vor < 5) return;   // zweiter Empfänger (Manifest + Lauschdienst) meldet dasselbe
            if (vor < 60) { Prefs.setAutoInfo(ctx, zeit + " verbunden, übersprungen (letzter Start erst vor " + vor + " s)"); return; }
            Prefs.setAutoZuletzt(ctx, jetzt);
            boolean ueber = android.provider.Settings.canDrawOverlays(ctx);
            Prefs.setAutoInfo(ctx, zeit + " verbunden, Start angefordert (Über anderen Apps einblenden: " + (ueber ? "ja" : "NEIN") + ")");
            try {   // Bildschirm einschalten, falls das Handy gesperrt in der Tasche liegt
                android.os.PowerManager pm = (android.os.PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
                @SuppressWarnings("deprecation")
                android.os.PowerManager.WakeLock w = pm.newWakeLock(android.os.PowerManager.SCREEN_BRIGHT_WAKE_LOCK
                        | android.os.PowerManager.ACQUIRE_CAUSES_WAKEUP | android.os.PowerManager.ON_AFTER_RELEASE, "nova:auto");
                w.acquire(15000);
            } catch (Throwable ignored) { }
            MainActivity.pendingAuto = true;
            Intent open = new Intent(ctx, MainActivity.class).putExtra("auto", true)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            try {   // Meldung als Notlösung (falls Android das Öffnen von selbst nicht erlaubt): Tippen öffnet die Autoansicht
                NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
                nm.createNotificationChannel(new NotificationChannel("zane_auto", "Autoansicht", NotificationManager.IMPORTANCE_HIGH));
                PendingIntent pi = PendingIntent.getActivity(ctx, 4, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
                Notification n = new Notification.Builder(ctx, "zane_auto")
                        .setContentTitle("Autoansicht")
                        .setContentText("Auto verbunden. Tippen, um die Autoansicht zu öffnen.")
                        .setSmallIcon(android.R.drawable.ic_dialog_map)
                        .setAutoCancel(true)
                        .setTimeoutAfter(60000L)
                        .setContentIntent(pi)
                        .setFullScreenIntent(pi, true)
                        .build();
                nm.notify(4, n);
                
            } catch (Throwable ignored) { }
            try { ctx.startActivity(open); } catch (Throwable e) { Prefs.setAutoInfo(ctx, Prefs.autoInfo(ctx) + " – Öffnen gescheitert: " + e); }
        } catch (Throwable e) { Prefs.setAutoInfo(ctx, "Fehler beim Autoansicht-Start: " + e); }
    }

    /** Aufgerufen vom ParkReceiver, 10 Sekunden nach dem Trennen. Muss schnell gehen (Empfänger darf nur kurz laufen). */
    static void geparkt(Context c, BroadcastReceiver.PendingResult pr) {
        final Context ctx = c.getApplicationContext();
        new Thread(() -> {
            try {
                if (Prefs.carAddr(ctx).isEmpty()) return;
                try {   // Auto ist weg: Fahrmodus (WhatsApp vorlesen) aus und Autoansicht schließen
                    Prefs.setFahren(ctx, false);
                    MainActivity.jsAus("window.jvAutoansicht&&window.jvAutoansicht.offen()&&window.jvAutoansicht.schliessen();");
                } catch (Throwable ignored) { }
                Location l = standort(ctx);
                if (l == null) { Prefs.setParkInfo(ctx, "Auto getrennt, aber kein Standort (Standort „Immer zulassen“ und GPS an?)"); return; }
                JSONObject o = new JSONObject();
                o.put("lat", l.getLatitude());
                o.put("lon", l.getLongitude());
                o.put("acc", Math.round(l.getAccuracy()));
                o.put("at", System.currentTimeMillis());
                Prefs.setParkPending(ctx, o.toString());
                Prefs.setParkInfo(ctx, "Parkplatz vorgemerkt um " + new java.text.SimpleDateFormat("HH:mm", Locale.GERMANY).format(new java.util.Date()) + " Uhr (Genauigkeit " + Math.round(l.getAccuracy()) + " m)");
                melden(ctx);
            } catch (Throwable e) {
                Prefs.setParkInfo(ctx, "Parkplatz: Fehler " + e);
            } finally {
                try { if (pr != null) pr.finish(); } catch (Throwable ignored) { }
            }
        }, "zane-park").start();
    }

    /** Frische GPS-Ortung (bis 7 Sekunden), sonst der letzte bekannte Standort, wenn er höchstens 10 Minuten alt ist. */
    @SuppressWarnings("MissingPermission")
    private static Location standort(Context ctx) throws Exception {
        if (ctx.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return null;
        LocationManager lm = (LocationManager) ctx.getSystemService(Context.LOCATION_SERVICE);
        if (lm == null) return null;
        Location best = null;
        if (Build.VERSION.SDK_INT >= 30 && lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
            final Location[] res = new Location[1];
            final CountDownLatch latch = new CountDownLatch(1);
            lm.getCurrentLocation(LocationManager.GPS_PROVIDER, null, ctx.getMainExecutor(), loc -> { res[0] = loc; latch.countDown(); });
            latch.await(7, TimeUnit.SECONDS);
            best = res[0];
        }
        if (best == null) {
            for (String p : lm.getProviders(true)) {
                Location x = lm.getLastKnownLocation(p);
                if (x == null || System.currentTimeMillis() - x.getTime() > 10 * 60000) continue;
                if (best == null || x.getAccuracy() < best.getAccuracy()) best = x;
            }
        }
        return best;
    }

    private static void melden(Context ctx) {
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            nm.createNotificationChannel(new NotificationChannel(CH_PARK, "Parkplatz", NotificationManager.IMPORTANCE_LOW));
            Intent i = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent pi = PendingIntent.getActivity(ctx, 3, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            Notification n = new Notification.Builder(ctx, CH_PARK)
                    .setContentTitle("Parkplatz gemerkt")
                    .setContentText("Du hast dein Auto verlassen. Tippen, um Jarvis zu öffnen.")
                    .setSmallIcon(android.R.drawable.ic_dialog_map)
                    .setAutoCancel(true)
                    .setTimeoutAfter(6 * 3600000L)
                    .setContentIntent(pi)
                    .build();
            nm.notify(3, n);
        } catch (Throwable ignored) { }
    }
}
