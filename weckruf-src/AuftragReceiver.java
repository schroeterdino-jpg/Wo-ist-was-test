package de.dino.zaneweckruf;

import android.app.AlarmManager;
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
 * Beobachtungsaufträge ("Sag Bescheid, wenn der Diesel unter 1,65 fällt"): Web-Push gibt es im WebView dieser App nicht.
 * Darum fragt die App, solange es Aufträge gibt, alle paar Minuten beim Server nach erfüllten Aufträgen
 * (api/sync, Aktion push_watch_native) und meldet sie wie eine geplante Ansage: Meldung, Bildschirm an, Jarvis spricht.
 * Die Seite sagt der App über ZaneBridge.auftraege(), wie viele Aufträge es gibt (0 = nicht mehr fragen) und gibt den App-Code mit.
 */
public class AuftragReceiver extends BroadcastReceiver {

    static final String ACTION_POLL = "de.dino.zaneweckruf.AUFTRAG_POLL";
    private static final String PREFS = "jarvis_auftrag";
    private static final long INTERVALL_MS = 5 * 60 * 1000L;

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
        } else if (Intent.ACTION_BOOT_COMPLETED.equals(a) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) {
            planen(c);
        }
    }

    private static SharedPreferences sp(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    private static PendingIntent pi(Context c) {
        Intent i = new Intent(c, AuftragReceiver.class).setAction(ACTION_POLL);
        return PendingIntent.getBroadcast(c, 77, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** Von der Seite: App-Code und Anzahl der Aufträge merken, Abruf an- oder abschalten. */
    static boolean setzen(Context c, String schluessel, int anzahl) {
        try {
            SharedPreferences.Editor ed = sp(c).edit();
            if (schluessel != null && !schluessel.isEmpty()) ed.putString("key", schluessel);
            ed.putInt("n", Math.max(0, anzahl));
            ed.apply();
            planen(c);
            return true;
        } catch (Throwable e) {
            return false;
        }
    }

    /** Nächsten Abruf einplanen (nur, wenn es Aufträge gibt), sonst den Abruf abschalten. */
    static void planen(Context c) {
        try {
            AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
            PendingIntent p = pi(c);
            am.cancel(p);
            SharedPreferences s = sp(c);
            if (s.getInt("n", 0) > 0 && !s.getString("key", "").isEmpty()) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + INTERVALL_MS, p);
            }
        } catch (Throwable ignored) { }
    }

    private static void abfragen(Context c) throws Exception {
        SharedPreferences s = sp(c);
        String key = s.getString("key", "");
        if (key.isEmpty() || s.getInt("n", 0) <= 0) return;
        HttpURLConnection h = (HttpURLConnection) new URL(MainActivity.ZANE_URL + "api/sync?action=push_watch_native").openConnection();
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
            if (j.has("n")) s.edit().putInt("n", Math.max(0, j.optInt("n", 0))).apply();   // alle Aufträge erledigt: nicht mehr fragen
            JSONArray msgs = j.optJSONArray("msgs");
            if (msgs == null) return;
            for (int k = 0; k < msgs.length(); k++) {
                JSONObject m = msgs.optJSONObject(k);
                if (m == null) continue;
                String body = m.optString("body", "");
                if (body.isEmpty()) continue;
                // gleiche Meldung wie eine geplante Ansage: Notiz, Bildschirm an, Jarvis spricht (js/plan_ansagen.js, Art "auftrag")
                AnsageReceiver.feuer(c, "auftrag|" + m.optString("id", "x") + "|" + body, body);
            }
        } finally {
            h.disconnect();
        }
    }
}
