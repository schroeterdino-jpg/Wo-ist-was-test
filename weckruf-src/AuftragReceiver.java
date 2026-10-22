package de.dino.zaneweckruf;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Meldungen vom Server (Erinnerungen, Abfahrt, Diesel, Regen, Mail, Briefing, Beobachtungsaufträge): Web-Push gibt es im WebView
 * dieser App nicht. Darum fragt die App beim Server nach (api/sync, Aktion push_native):
 *  - jede Minute im Weckwort-Dienst (WakeService), solange er läuft,
 *  - zusätzlich alle 5 Minuten über den Wecker des Handys (auch wenn der Dienst aus ist oder schläft).
 * Normale Meldungen erscheinen als Android-Benachrichtigung (bei Erinnerungen mit "Erledigt"). Erfüllte Aufträge spricht Jarvis
 * wie eine geplante Ansage (AnsageReceiver.feuer: Bildschirm an, Jarvis spricht).
 * Die Seite übergibt den App-Code über ZaneBridge.auftraege(); ohne ihn fragt die App nicht.
 */
public class AuftragReceiver extends BroadcastReceiver {

    static final String ACTION_POLL = "de.dino.zaneweckruf.AUFTRAG_POLL";
    static final String ACTION_DONE = "de.dino.zaneweckruf.MELDUNG_ERLEDIGT";
    private static final String PREFS = "jarvis_auftrag";
    private static final String CH = "jarvis_meldungen";
    private static final long INTERVALL_MS = 5 * 60 * 1000L;
    private static volatile long letzte = 0;   // Zeit der letzten Abfrage (Dienst und Wecker nicht doppelt kurz hintereinander)

    @Override
    public void onReceive(final Context c, Intent i) {
        String a = i == null ? null : i.getAction();
        if (ACTION_POLL.equals(a)) {
            final PendingResult pr = goAsync();
            new Thread(() -> {
                try { abfragen(c); } catch (Throwable ignored) { }
                try { planen(c); } catch (Throwable ignored) { }
                pr.finish();
            }).start();
        } else if (ACTION_DONE.equals(a)) {
            final String url = i.getStringExtra("url");
            final int nid = i.getIntExtra("nid", 0);
            final PendingResult pr = goAsync();
            new Thread(() -> {
                try { erledigt(c, url); } catch (Throwable ignored) { }
                try { ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(nid); } catch (Throwable ignored) { }
                pr.finish();
            }).start();
        } else if (Intent.ACTION_BOOT_COMPLETED.equals(a) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) {
            planen(c);
        }
    }

    private static SharedPreferences sp(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    private static PendingIntent pi(Context c) {
        Intent i = new Intent(c, AuftragReceiver.class).setAction(ACTION_POLL);
        return PendingIntent.getBroadcast(c, 77, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** Von der Seite: App-Code merken (die Anzahl der Aufträge spielt keine Rolle mehr). */
    static boolean setzen(Context c, String schluessel, int anzahl) {
        try {
            if (schluessel != null && !schluessel.isEmpty()) sp(c).edit().putString("key", schluessel).apply();
            planen(c);
            return true;
        } catch (Throwable e) {
            return false;
        }
    }

    /** Nächste Abfrage über den Wecker des Handys einplanen (nur mit App-Code). */
    static void planen(Context c) {
        try {
            AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
            PendingIntent p = pi(c);
            am.cancel(p);
            if (!sp(c).getString("key", "").isEmpty()) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + INTERVALL_MS, p);
            }
        } catch (Throwable ignored) { }
    }

    /** Vom Weckwort-Dienst: im Hintergrund nachfragen. */
    static void abfragenAsync(final Context c) {
        new Thread(() -> { try { abfragen(c); } catch (Throwable ignored) { } }).start();
    }

    private static void abfragen(Context c) throws Exception {
        String key = sp(c).getString("key", "");
        if (key.isEmpty()) return;
        long jetzt = System.currentTimeMillis();
        synchronized (AuftragReceiver.class) {
            if (jetzt - letzte < 20000) return;
            letzte = jetzt;
        }
        HttpURLConnection h = (HttpURLConnection) new URL(MainActivity.ZANE_URL + "api/sync?action=push_native").openConnection();
        try {
            h.setRequestMethod("POST");
            h.setConnectTimeout(10000);
            h.setReadTimeout(15000);
            h.setDoOutput(true);
            h.setRequestProperty("x-app-key", key);
            h.setRequestProperty("Content-Type", "application/json");
            try (OutputStream o = h.getOutputStream()) { o.write("{}".getBytes("UTF-8")); }
            if (h.getResponseCode() != 200) return;
            StringBuilder sb = new StringBuilder();
            try (InputStream in = h.getInputStream()) {
                byte[] buf = new byte[4096];
                int n;
                while ((n = in.read(buf)) > 0) sb.append(new String(buf, 0, n, "UTF-8"));
            }
            JSONObject j = new JSONObject(sb.toString());
            JSONArray sprechen = j.optJSONArray("msgs");   // erfüllte Aufträge: Jarvis spricht sie
            if (sprechen != null) {
                for (int k = 0; k < sprechen.length(); k++) {
                    JSONObject m = sprechen.optJSONObject(k);
                    if (m == null) continue;
                    String body = m.optString("body", "");
                    if (body.isEmpty()) continue;
                    // wie eine geplante Ansage: Notiz, Bildschirm an, Jarvis spricht (js/plan_ansagen.js, Art "auftrag")
                    AnsageReceiver.feuer(c, "auftrag|" + m.optString("id", "x") + "|" + body, body);
                }
            }
            JSONArray still = j.optJSONArray("meldungen");   // alle anderen: Benachrichtigung
            if (still != null) {
                for (int k = 0; k < still.length(); k++) {
                    JSONObject m = still.optJSONObject(k);
                    if (m != null) zeigen(c, m);
                }
            }
        } finally {
            h.disconnect();
        }
    }

    private static void zeigen(Context c, JSONObject m) {
        try {
            String title = m.optString("title", "Jarvis");
            String body = m.optString("body", "");
            String tag = m.optString("tag", m.optString("id", "m"));
            String done = m.optString("doneUrl", "");
            int nid = tag.hashCode();
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            nm.createNotificationChannel(new NotificationChannel(CH, "Jarvis Meldungen", NotificationManager.IMPORTANCE_HIGH));
            Intent open = new Intent(c, MainActivity.class)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            PendingIntent opi = PendingIntent.getActivity(c, 5, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            Notification.Builder b = new Notification.Builder(c, CH)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setStyle(new Notification.BigTextStyle().bigText(body))
                    .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                    .setAutoCancel(true)
                    .setContentIntent(opi);
            if (!done.isEmpty()) {
                Intent d = new Intent(c, AuftragReceiver.class).setAction(ACTION_DONE).putExtra("url", done).putExtra("nid", nid);
                PendingIntent dpi = PendingIntent.getBroadcast(c, nid, d, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
                b.addAction(new Notification.Action.Builder(null, "Erledigt", dpi).build());
            }
            nm.notify(nid, b.build());
        } catch (Throwable ignored) { }
    }

    /** "Erledigt" in der Meldung: Adresse beim Server aufrufen (sie enthält schon ihre Prüfsumme). */
    private static void erledigt(Context c, String url) throws Exception {
        if (url == null || !url.startsWith("/api/")) return;
        String base = MainActivity.ZANE_URL;
        if (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        HttpURLConnection h = (HttpURLConnection) new URL(base + url).openConnection();
        try {
            h.setRequestMethod("GET");
            h.setConnectTimeout(10000);
            h.setReadTimeout(15000);
            h.getResponseCode();
        } finally {
            h.disconnect();
        }
    }
}
