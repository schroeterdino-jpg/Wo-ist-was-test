package de.dino.zaneweckruf;

import android.Manifest;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;

/**
 * Orts-Erinnerungen: Nova meldet der App eine Liste von Orten (zum Beispiel Supermärkte) und die Einkaufsliste.
 * Die App lässt sich vom Handy über Standortänderungen wecken (auch bei gesperrtem Handy, ohne dass Nova läuft).
 * Kommst du an einem Ort an, löst sie eine Ansage aus (wie die geplanten Ansagen): Bildschirm an, Meldung, Nova spricht.
 * Dafür braucht die App die Standort-Erlaubnis "Immer zulassen".
 */
public class OrtReceiver extends BroadcastReceiver {

    static final String ACTION_ORT = "de.dino.zaneweckruf.ORT";
    private static final String PREFS = "nova_orte";
    private static final String K_PLAN = "plan";
    private static final String STATE = "nova_orte_status";
    private static final long PAUSE_MS = 3L * 60 * 60 * 1000;   // pro Ort höchstens alle 3 Stunden
    private static final int VON_H = 8, BIS_H = 21;               // nur tagsüber melden

    @Override
    public void onReceive(Context c, Intent i) {
        String a = i == null ? null : i.getAction();
        try {
            if (Intent.ACTION_BOOT_COMPLETED.equals(a) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) {
                anmelden(c);
                return;
            }
            if (!ACTION_ORT.equals(a)) return;
            Location l = null;
            try {
                if (i.hasExtra(LocationManager.KEY_LOCATION_CHANGED)) {
                    @SuppressWarnings("deprecation")
                    Location x = (Location) i.getParcelableExtra(LocationManager.KEY_LOCATION_CHANGED);
                    l = x;
                }
            } catch (Throwable ignored) { }
            if (l != null) pruefe(c, l);
        } catch (Throwable ignored) { }
    }

    // ---------- Plan von der Seite ----------
    static boolean setzen(Context c, String json) {
        try {
            JSONObject o = new JSONObject(json == null ? "{}" : json);
            c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(K_PLAN, o.toString()).apply();
            anmelden(c);
            return true;
        } catch (Throwable e) {
            return false;
        }
    }

    private static JSONObject plan(Context c) {
        try {
            return new JSONObject(c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(K_PLAN, "{}"));
        } catch (Throwable e) {
            return new JSONObject();
        }
    }

    private static boolean recht(Context c, String p) {
        return Build.VERSION.SDK_INT < 23 || c.checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED;
    }

    static boolean feinErlaubt(Context c) { return recht(c, Manifest.permission.ACCESS_FINE_LOCATION); }

    static boolean immerErlaubt(Context c) {
        return Build.VERSION.SDK_INT < 29 || recht(c, "android.permission.ACCESS_BACKGROUND_LOCATION");
    }

    private static PendingIntent pi(Context c) {
        Intent i = new Intent(c, OrtReceiver.class).setAction(ACTION_ORT);
        int fl = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
        return PendingIntent.getBroadcast(c, 77, i, fl);
    }

    /** Standort-Updates beim Handy an- oder abmelden, je nach Plan und Erlaubnis. */
    static void anmelden(Context c) {
        try {
            LocationManager lm = (LocationManager) c.getSystemService(Context.LOCATION_SERVICE);
            if (lm == null) return;
            PendingIntent p = pi(c);
            try { lm.removeUpdates(p); } catch (Throwable ignored) { }
            JSONObject pl = plan(c);
            JSONArray orte = pl.optJSONArray("orte");
            boolean an = pl.optBoolean("an", true) && orte != null && orte.length() > 0;
            boolean ok = feinErlaubt(c) && immerErlaubt(c);
            String anbieter = "";
            if (an && ok) {
                String[] wahl = Build.VERSION.SDK_INT >= 31
                        ? new String[]{LocationManager.FUSED_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER}
                        : new String[]{LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER};
                for (String s : wahl) {
                    try {
                        if (lm.isProviderEnabled(s)) {
                            lm.requestLocationUpdates(s, 90000L, 40f, p);
                            anbieter = s;
                            break;
                        }
                    } catch (Throwable ignored) { }
                }
            }
            c.getSharedPreferences(STATE, Context.MODE_PRIVATE).edit().putString("anbieter", anbieter).apply();
        } catch (Throwable ignored) { }
    }

    /** Zustand für die Seite: {"fein":..,"immer":..,"aktiv":..,"orte":n,"letzte":ms} */
    static String status(Context c) {
        try {
            JSONObject pl = plan(c);
            JSONArray orte = pl.optJSONArray("orte");
            SharedPreferences s = c.getSharedPreferences(STATE, Context.MODE_PRIVATE);
            JSONObject o = new JSONObject();
            o.put("fein", feinErlaubt(c));
            o.put("immer", immerErlaubt(c));
            o.put("aktiv", !s.getString("anbieter", "").isEmpty());
            o.put("orte", orte == null ? 0 : orte.length());
            o.put("letzte", s.getLong("letzte", 0));
            return o.toString();
        } catch (Throwable e) {
            return "{}";
        }
    }

    // ---------- Auswerten ----------
    private static void pruefe(Context c, Location l) throws Exception {
        SharedPreferences st = c.getSharedPreferences(STATE, Context.MODE_PRIVATE);
        st.edit().putLong("letzte", System.currentTimeMillis()).apply();
        if (l.hasAccuracy() && l.getAccuracy() > 200f) return;   // zu ungenau, nichts entscheiden
        JSONObject pl = plan(c);
        if (!pl.optBoolean("an", true)) return;
        JSONArray orte = pl.optJSONArray("orte");
        JSONArray einkauf = pl.optJSONArray("einkauf");
        if (orte == null) return;
        long jetzt = System.currentTimeMillis();
        int h = Calendar.getInstance().get(Calendar.HOUR_OF_DAY);
        SharedPreferences.Editor ed = st.edit();
        String treffer = null;
        for (int k = 0; k < orte.length(); k++) {
            JSONObject o = orte.optJSONObject(k);
            if (o == null) continue;
            String id = o.optString("id", "");
            if (id.isEmpty()) continue;
            float[] d = new float[1];
            Location.distanceBetween(l.getLatitude(), l.getLongitude(), o.optDouble("lat"), o.optDouble("lon"), d);
            double r = o.optDouble("r", 90);
            boolean drin = st.getBoolean("in_" + id, false);
            if (!drin && d[0] <= r) {
                ed.putBoolean("in_" + id, true);
                boolean pause = jetzt - st.getLong("t_" + id, 0) < PAUSE_MS;
                boolean liste = einkauf != null && einkauf.length() > 0;
                boolean zeit = h >= VON_H && h < BIS_H;
                if (!pause && liste && zeit && treffer == null) {
                    treffer = o.optString("name", "Supermarkt");
                    ed.putLong("t_" + id, jetzt);
                }
            } else if (drin && d[0] > r * 1.8) {
                ed.putBoolean("in_" + id, false);
            }
        }
        ed.apply();
        if (treffer != null) {
            StringBuilder sb = new StringBuilder();
            int n = einkauf.length();
            for (int k = 0; k < n && k < 8; k++) {
                if (k > 0) sb.append(", ");
                sb.append(einkauf.optString(k));
            }
            if (n > 8) sb.append(" und ").append(n - 8).append(" weitere");
            String text = "Du bist bei " + treffer + ". Auf deiner Einkaufsliste " + (n == 1 ? "steht: " : "stehen: ") + sb + ".";
            AnsageReceiver.feuer(c, "ort|" + jetzt + "|" + treffer, text);
        }
    }
}
