package de.dino.zaneweckruf;

import android.app.AlarmManager;
import android.app.KeyguardManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.PowerManager;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Geplante Ansagen: Die Seite (Nova) meldet eine Liste [{id, at, text}], die App löst sie zur Uhrzeit selbst aus,
 * auch bei gesperrtem Handy. Sie schaltet den Bildschirm ein, zeigt eine Meldung mit dem Text und holt Nova nach vorn;
 * Nova spricht die Ansage dann (und rechnet sie vorher frisch aus, zum Beispiel mit der aktuellen Verkehrslage).
 * Nach einem Neustart des Handys werden die Ansagen aus dem Speicher neu geplant.
 */
public class AnsageReceiver extends BroadcastReceiver {

    static final String ACTION_FIRE = "de.dino.zaneweckruf.ANSAGE";
    private static final String PREFS = "nova_ansagen";
    private static final String KEY = "plan";
    private static final String CH = "nova_ansage";
    private static final int MAX = 24;

    @Override
    public void onReceive(Context c, Intent i) {
        String a = i == null ? null : i.getAction();
        if (ACTION_FIRE.equals(a)) {
            feuer(c, i.getStringExtra("id"), i.getStringExtra("text"));
        } else if (Intent.ACTION_BOOT_COMPLETED.equals(a) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) {
            planen(c);
        }
    }

    // ---------- Speicher ----------
    private static JSONArray lesen(Context c) {
        try {
            String s = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "[]");
            return new JSONArray(s);
        } catch (Throwable e) {
            return new JSONArray();
        }
    }

    private static void speichern(Context c, JSONArray a) {
        SharedPreferences.Editor ed = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        ed.putString(KEY, a.toString());
        ed.apply();
    }

    private static PendingIntent pi(Context c, String id, String text) {
        Intent i = new Intent(c, AnsageReceiver.class).setAction(ACTION_FIRE)
                .putExtra("id", id).putExtra("text", text == null ? "" : text);
        return PendingIntent.getBroadcast(c, id.hashCode(), i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static void abbrechen(Context c, JSONArray alt) {
        try {
            AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
            for (int k = 0; k < alt.length(); k++) {
                JSONObject o = alt.optJSONObject(k);
                if (o == null) continue;
                String id = o.optString("id", "");
                if (id.isEmpty()) continue;
                am.cancel(pi(c, id, o.optString("text", "")));
            }
        } catch (Throwable ignored) { }
    }

    private static void stellen(Context c, String id, String text, long at) {
        try {
            AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
            PendingIntent p = pi(c, id, text);
            try {
                if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) {
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p);
                } else {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p);
                }
            } catch (SecurityException e) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p);
            }
        } catch (Throwable ignored) { }
    }

    /** Neuen Plan von der Seite übernehmen (JSON-Liste). Gibt true zurück, wenn er angenommen wurde. */
    static boolean setzen(Context c, String json) {
        try {
            JSONArray neu = new JSONArray(json == null ? "[]" : json);
            abbrechen(c, lesen(c));
            long jetzt = System.currentTimeMillis();
            JSONArray behalten = new JSONArray();
            for (int k = 0; k < neu.length() && behalten.length() < MAX; k++) {
                JSONObject o = neu.optJSONObject(k);
                if (o == null) continue;
                String id = o.optString("id", "");
                long at = o.optLong("at", 0);
                if (id.isEmpty() || at <= jetzt + 5000) continue;
                JSONObject e = new JSONObject();
                e.put("id", id);
                e.put("at", at);
                e.put("text", o.optString("text", ""));
                behalten.put(e);
            }
            speichern(c, behalten);
            planen(c);
            return true;
        } catch (Throwable e) {
            return false;
        }
    }

    /** Alle gespeicherten Ansagen (neu) beim Wecker-Dienst des Handys anmelden. */
    static void planen(Context c) {
        JSONArray a = lesen(c);
        JSONArray rest = new JSONArray();
        long jetzt = System.currentTimeMillis();
        for (int k = 0; k < a.length(); k++) {
            JSONObject o = a.optJSONObject(k);
            if (o == null) continue;
            long at = o.optLong("at", 0);
            if (at <= jetzt) continue;
            stellen(c, o.optString("id", ""), o.optString("text", ""), at);
            rest.put(o);
        }
        speichern(c, rest);
    }

    private static void entfernen(Context c, String id) {
        JSONArray a = lesen(c);
        JSONArray rest = new JSONArray();
        for (int k = 0; k < a.length(); k++) {
            JSONObject o = a.optJSONObject(k);
            if (o != null && !id.equals(o.optString("id", ""))) rest.put(o);
        }
        speichern(c, rest);
    }

    private static String titel(String id) {
        if (id.startsWith("wochen")) return "Nova: Dein Wochenüberblick";
        if (id.startsWith("aufbruch")) return "Nova: Zeit zum Losfahren";
        if (id.startsWith("wecker")) return "Nova: Wecker für morgen?";
        if (id.startsWith("ort|")) return "Nova: Einkaufsliste";
        return "Nova";
    }

    // ---------- Auslösen ----------
    static void feuer(Context c, String id, String text) {
        if (id == null || id.isEmpty()) return;
        entfernen(c, id);
        boolean gesperrt = false;
        try {
            PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
            KeyguardManager km = (KeyguardManager) c.getSystemService(Context.KEYGUARD_SERVICE);
            gesperrt = !pm.isInteractive() || km.isKeyguardLocked();
            if (gesperrt) {   // Bildschirm einschalten
                @SuppressWarnings("deprecation")
                PowerManager.WakeLock w = pm.newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK
                        | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE, "nova:ansage");
                w.acquire(20000);
            }
        } catch (Throwable ignored) { }

        MainActivity.pendingAnsage = id;
        Intent open = new Intent(c, MainActivity.class).putExtra("ansage", id)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        try {
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            nm.createNotificationChannel(new NotificationChannel(CH, "Nova Ansagen", NotificationManager.IMPORTANCE_HIGH));
            PendingIntent opi = PendingIntent.getActivity(c, 3, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            String t = text == null ? "" : text;
            Notification.Builder b = new Notification.Builder(c, CH)
                    .setContentTitle(titel(id))
                    .setContentText(t)
                    .setStyle(new Notification.BigTextStyle().bigText(t))
                    .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                    .setCategory(Notification.CATEGORY_REMINDER)
                    .setAutoCancel(true)
                    .setContentIntent(opi);
            if (gesperrt) b.setFullScreenIntent(opi, true);
            nm.notify(id.hashCode(), b.build());
        } catch (Throwable ignored) { }
        // Mit der Erlaubnis "Über anderen Apps einblenden" darf die App Nova sofort selbst nach vorn holen
        try { c.startActivity(open); } catch (Throwable ignored) { }
    }
}
