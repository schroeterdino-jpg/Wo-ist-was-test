package de.dino.zaneweckruf;

import android.app.Notification;
import android.app.RemoteInput;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Locale;

/**
 * Schlafmodus: Solange er an ist, liest Jarvis eingehende WhatsApp-Einzelchats (keine Gruppen) aus den Meldungen,
 * merkt sie sich fürs Vorlesen am Morgen und antwortet erlaubten Kontakten EINMAL pro Schlafphase mit einem festen Text
 * (über die Antworten-Funktion der Meldung). Nichts davon geht ins Internet, keine KI schreibt hier etwas.
 * Braucht in Android: Einstellungen > Benachrichtigungen > Benachrichtigungszugriff > Jarvis.
 */
public class NachrichtenService extends NotificationListenerService {
    private static final long MAX_SCHLAF_MS = 14L * 3600000L;   // Sicherung: nach 14 Stunden schaltet sich der Schlafmodus von selbst aus

    static String norm(String s) {
        if (s == null) return "";
        String t = s.toLowerCase(Locale.GERMANY).replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss");
        return t.replaceAll("[^a-z0-9 ]", " ").replaceAll("\\s+", " ").trim();
    }

    static boolean zugriff(Context c) {
        try {
            String s = android.provider.Settings.Secure.getString(c.getContentResolver(), "enabled_notification_listeners");
            return s != null && s.contains(c.getPackageName());
        } catch (Throwable e) { return false; }
    }

    static boolean erlaubtName(Context c, String titel) {
        String t = " " + norm(titel) + " ";
        for (String a : Prefs.erlaubt(c).split("\n")) {
            a = norm(a);
            if (!a.isEmpty() && t.contains(" " + a + " ")) return true;
        }
        return false;
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try { verarbeite(sbn); } catch (Throwable ignored) { }
    }

    private void verarbeite(StatusBarNotification sbn) throws Exception {
        if (sbn == null || !Prefs.schlaf(this)) return;
        long seit = Prefs.schlafSeit(this);
        if (seit > 0 && System.currentTimeMillis() - seit > MAX_SCHLAF_MS) { Prefs.setSchlaf(this, false); return; }
        String pkg = sbn.getPackageName();
        if (!"com.whatsapp".equals(pkg) && !"com.whatsapp.w4b".equals(pkg)) return;
        Notification n = sbn.getNotification();
        if (n == null || (n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
        Bundle ex = n.extras;
        if (ex == null) return;
        if (ex.getBoolean("android.isGroupConversation", false) || ex.getCharSequence("android.conversationTitle") != null) return;   // Gruppen nie
        CharSequence ti = ex.getCharSequence("android.title"), tx = ex.getCharSequence("android.text");
        if (ti == null || tx == null) return;
        String name = ti.toString().trim(), text = tx.toString().trim();
        if (name.isEmpty() || text.isEmpty() || "WhatsApp".equalsIgnoreCase(name)) return;
        if (text.matches("(?s).*\\d+ (neue )?(Nachrichten|messages).*") && text.length() < 40) return;   // Sammelmeldung

        JSONArray log = new JSONArray(Prefs.nachrichten(this));
        if (log.length() > 0) {   // WhatsApp meldet dieselbe Nachricht gern mehrfach
            JSONObject l = log.getJSONObject(log.length() - 1);
            if (name.equals(l.optString("n")) && text.equals(l.optString("t"))) return;
        }
        boolean geantwortet = false;
        if (erlaubtName(this, name)) {
            String key = norm(name);
            String schon = Prefs.schlafAntworten(this);
            if (!("\n" + schon + "\n").contains("\n" + key + "\n")) geantwortet = antworten(n, Prefs.schlafText(this));
            if (geantwortet) Prefs.setSchlafAntworten(this, schon.isEmpty() ? key : schon + "\n" + key);
        }
        JSONObject o = new JSONObject();
        o.put("n", name); o.put("t", text); o.put("at", System.currentTimeMillis()); o.put("a", geantwortet);
        log.put(o);
        if (log.length() > 40) { JSONArray neu = new JSONArray(); for (int i = log.length() - 40; i < log.length(); i++) neu.put(log.get(i)); log = neu; }
        Prefs.setNachrichten(this, log.toString());
    }

    private boolean antworten(Notification n, String antwort) {
        try {
            if (n.actions == null || antwort == null || antwort.trim().isEmpty()) return false;
            for (Notification.Action a : n.actions) {
                RemoteInput[] ris = a.getRemoteInputs();
                if (ris == null || ris.length == 0) continue;
                Intent i = new Intent();
                Bundle b = new Bundle();
                for (RemoteInput ri : ris) b.putCharSequence(ri.getResultKey(), antwort);
                RemoteInput.addResultsToIntent(ris, i, b);
                a.actionIntent.send(this, 0, i);
                return true;
            }
        } catch (Throwable ignored) { }
        return false;
    }
}
