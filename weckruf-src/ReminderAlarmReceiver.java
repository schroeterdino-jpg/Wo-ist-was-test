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
import android.os.Build;
import android.os.PowerManager;
import org.json.JSONArray;
import org.json.JSONObject;

/** Lokale Erinnerungen: WebView uebergibt die vollstaendige Liste; Android plant unabhaengig vom WebView. */
public class ReminderAlarmReceiver extends BroadcastReceiver {
    static final String FIRE = "de.dino.zaneweckruf.REMINDER_FIRE";
    private static final String PREF = "jarvis_native_reminders";
    private static final String KEY = "entries";
    private static final String CHANNEL = "jarvis_reminder_alarm";
    // Neue Kanal-ID: Android behaelt alte Kanal-Einstellungen auch nach App-Updates.
    private static final String VISIBLE_CHANNEL = "jarvis_reminder_lockscreen_v2";

    private static PendingIntent intent(Context c, String id) {
        Intent i = new Intent(c, ReminderAlarmReceiver.class).setAction(FIRE).putExtra("id", id);
        return PendingIntent.getBroadcast(c, id.hashCode(), i,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static JSONArray lesen(Context c) {
        try { return new JSONArray(c.getSharedPreferences(PREF, Context.MODE_PRIVATE).getString(KEY, "[]")); }
        catch (Exception e) { return new JSONArray(); }
    }

    /** true nur wenn alle zukuenftigen Erinnerungen erfolgreich beim AlarmManager registriert wurden. */
    static synchronized boolean setzen(Context c, String json) {
        try {
            JSONArray neu = new JSONArray(json);
            if (neu.length() > 500) return false;
            JSONArray sauber = new JSONArray();
            long now = System.currentTimeMillis();
            for (int k = 0; k < neu.length(); k++) {
                JSONObject x = neu.optJSONObject(k);
                if (x == null) return false;
                String id = x.optString("id", "");
                String text = x.optString("text", "");
                long at = x.optLong("at", 0);
                if (id.isEmpty() || id.length() > 120 || text.isEmpty() || text.length() > 1000) return false;
                if (at <= now) continue;
                JSONObject o = new JSONObject();
                o.put("id", id); o.put("text", text); o.put("at", at);
                sauber.put(o);
            }
            AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return false;
            if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) return false;
            // Zuerst neue Alarme registrieren, dann alte entfernen: Fehler duerfen alte Planung nicht zerstoeren.
            JSONArray alt = lesen(c);
            for (int k = 0; k < sauber.length(); k++) {
                JSONObject o = sauber.getJSONObject(k);
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, o.getLong("at"), intent(c, o.getString("id")));
            }
            for (int k = 0; k < alt.length(); k++) {
                JSONObject o = alt.optJSONObject(k);
                if (o == null) continue;
                String id = o.optString("id", "");
                boolean behalten = false;
                for (int j = 0; j < sauber.length(); j++) {
                    if (id.equals(sauber.getJSONObject(j).optString("id", ""))) { behalten = true; break; }
                }
                if (!behalten) am.cancel(intent(c, id));
            }
            c.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().putString(KEY, sauber.toString()).apply();
            return true;
        } catch (Exception e) { return false; }
    }

    static synchronized void wiederherstellen(Context c) {
        JSONArray old = lesen(c);
        try { setzen(c, old.toString()); } catch (Throwable ignored) {}
    }

    @Override public void onReceive(Context c, Intent i) {
        if (i == null) return;
        String action = i.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            wiederherstellen(c); return;
        }
        if (!FIRE.equals(action)) return;
        String id = i.getStringExtra("id");
        if (id == null) return;
        synchronized (ReminderAlarmReceiver.class) {
            JSONArray all = lesen(c), rest = new JSONArray();
            String text = null;
            for (int k = 0; k < all.length(); k++) {
                JSONObject o = all.optJSONObject(k);
                if (o == null) continue;
                if (id.equals(o.optString("id", ""))) text = o.optString("text", "");
                else rest.put(o);
            }
            if (text == null) return;
            c.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().putString(KEY, rest.toString()).apply();
            try {
                NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm == null) return;
                if (Build.VERSION.SDK_INT >= 26) {
                    NotificationChannel channel = new NotificationChannel(
                            VISIBLE_CHANNEL, "Jarvis Erinnerungen (Sperrbildschirm)",
                            NotificationManager.IMPORTANCE_HIGH);
                    channel.setDescription("Zeitgesteuerte Erinnerungen auf dem Sperrbildschirm anzeigen");
                    channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                    channel.enableVibration(true);
                    nm.createNotificationChannel(channel);
                }
                Intent open = new Intent(c, MainActivity.class);
                open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                PendingIntent pi = PendingIntent.getActivity(c, 23, open,
                        PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
                Notification.Builder b = Build.VERSION.SDK_INT >= 26
                        ? new Notification.Builder(c, VISIBLE_CHANNEL) : new Notification.Builder(c);
                b.setSmallIcon(android.R.drawable.ic_dialog_info)
                 .setContentTitle("Jarvis Erinnerung")
                 .setContentText(text)
                 .setStyle(new Notification.BigTextStyle().bigText(text))
                 .setCategory(Notification.CATEGORY_REMINDER)
                 .setVisibility(Notification.VISIBILITY_PUBLIC)
                 .setPriority(Notification.PRIORITY_HIGH)
                 .setDefaults(Notification.DEFAULT_ALL)
                 .setAutoCancel(true).setContentIntent(pi);
                // Weckt nur das Display fuer die Sperrbildschirm-Benachrichtigung.
                // Kein automatisches Entsperren und kein erzwungener Start der WebView.
                // Der bestehende AlarmManager und der Benachrichtigungston bleiben unveraendert.
                try {
                    PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
                    boolean displayAus = pm != null && !pm.isInteractive();
                    if (displayAus) {
                        @SuppressWarnings("deprecation")
                        PowerManager.WakeLock wake = pm.newWakeLock(
                                PowerManager.SCREEN_BRIGHT_WAKE_LOCK |
                                PowerManager.ACQUIRE_CAUSES_WAKEUP |
                                PowerManager.ON_AFTER_RELEASE, "jarvis:reminder-screen");
                        wake.acquire(5000);
                    }
                } catch (Throwable ignored) { }
                nm.notify(id.hashCode(), b.build());
            } catch (Throwable ignored) {}
        }
    }
}
