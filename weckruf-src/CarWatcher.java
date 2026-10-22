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
 * Läuft nur, solange der WakeService läuft (Bluetooth-Meldungen kommen nur an Empfänger, die im laufenden Programm angemeldet sind).
 */
final class CarWatcher extends BroadcastReceiver {
    private static final String CH_PARK = "zane_park";
    private static final long ENTPRELLEN_MS = 10000;   // Bluetooth flackert manchmal kurz: erst nach 10 Sekunden gilt das Auto als getrennt

    private final Context ctx;
    private final Handler main = new Handler(Looper.getMainLooper());
    private Runnable offen;
    private volatile boolean arbeitet = false;

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
        main.removeCallbacksAndMessages(null);
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onReceive(Context c, Intent i) {
        try {
            String car = Prefs.carAddr(ctx);
            if (car.isEmpty() || i == null) return;
            BluetoothDevice d = i.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
            if (d == null || !car.equalsIgnoreCase(d.getAddress())) return;
            if (BluetoothDevice.ACTION_ACL_CONNECTED.equals(i.getAction())) {
                if (offen != null) { main.removeCallbacks(offen); offen = null; }
                Prefs.setParkInfo(ctx, "Auto verbunden (" + Prefs.carName(ctx) + ")");
            } else if (BluetoothDevice.ACTION_ACL_DISCONNECTED.equals(i.getAction())) {
                if (offen != null) main.removeCallbacks(offen);
                offen = this::geparkt;
                main.postDelayed(offen, ENTPRELLEN_MS);
            }
        } catch (Throwable ignored) { }
    }

    private void geparkt() {
        offen = null;
        if (arbeitet) return;
        arbeitet = true;
        new Thread(() -> {
            try {
                Location l = standort();
                if (l == null) { Prefs.setParkInfo(ctx, "Auto getrennt, aber kein Standort (Standort „Immer zulassen“ und GPS an?)"); return; }
                JSONObject o = new JSONObject();
                o.put("lat", l.getLatitude());
                o.put("lon", l.getLongitude());
                o.put("acc", Math.round(l.getAccuracy()));
                o.put("at", System.currentTimeMillis());
                Prefs.setParkPending(ctx, o.toString());
                Prefs.setParkInfo(ctx, "Parkplatz vorgemerkt um " + new java.text.SimpleDateFormat("HH:mm", Locale.GERMANY).format(new java.util.Date()) + " Uhr (Genauigkeit " + Math.round(l.getAccuracy()) + " m)");
                melden();
            } catch (Throwable e) {
                Prefs.setParkInfo(ctx, "Parkplatz: Fehler " + e);
            } finally {
                arbeitet = false;
            }
        }, "zane-park").start();
    }

    /** Frische GPS-Ortung (bis 25 Sekunden), sonst der letzte bekannte Standort, wenn er höchstens 10 Minuten alt ist. */
    @SuppressWarnings("MissingPermission")
    private Location standort() throws Exception {
        if (ctx.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return null;
        LocationManager lm = (LocationManager) ctx.getSystemService(Context.LOCATION_SERVICE);
        if (lm == null) return null;
        Location best = null;
        if (Build.VERSION.SDK_INT >= 30 && lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
            final Location[] res = new Location[1];
            final CountDownLatch latch = new CountDownLatch(1);
            lm.getCurrentLocation(LocationManager.GPS_PROVIDER, null, ctx.getMainExecutor(), loc -> { res[0] = loc; latch.countDown(); });
            latch.await(25, TimeUnit.SECONDS);
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

    private void melden() {
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
                    .setContentIntent(pi)
                    .build();
            nm.notify(3, n);
            main.postDelayed(() -> { try { nm.cancel(3); } catch (Throwable ignored) { } }, 6 * 3600000L);
        } catch (Throwable ignored) { }
    }
}
