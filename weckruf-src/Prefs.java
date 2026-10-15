package de.dino.zaneweckruf;

import android.content.Context;
import android.content.SharedPreferences;

final class Prefs {
    private static SharedPreferences sp(Context c) {
        return c.getSharedPreferences("zane", Context.MODE_PRIVATE);
    }
    static int level(Context c) { return sp(c).getInt("level2", 2); }
    static void setLevel(Context c, int v) { sp(c).edit().putInt("level2", v).apply(); }
    static boolean enabled(Context c) { return sp(c).getBoolean("enabled", true); }
    static void setEnabled(Context c, boolean v) { sp(c).edit().putBoolean("enabled", v).apply(); }
    static boolean muted(Context c) { return sp(c).getBoolean("muted", false); }
    static void setMuted(Context c, boolean v) { sp(c).edit().putBoolean("muted", v).apply(); }
    // Nachtruhe: das Weckwort schläft zwischen zwei Uhrzeiten (Minuten seit Mitternacht), Standard 23:00 bis 04:00
    static boolean nightOn(Context c) { return sp(c).getBoolean("nightOn", true); }
    static void setNightOn(Context c, boolean v) { sp(c).edit().putBoolean("nightOn", v).apply(); }
    static int nightFrom(Context c) { return sp(c).getInt("nightFrom", 23 * 60); }
    static void setNightFrom(Context c, int v) { sp(c).edit().putInt("nightFrom", v).apply(); }
    static int nightTo(Context c) { return sp(c).getInt("nightTo", 4 * 60); }
    static void setNightTo(Context c, int v) { sp(c).edit().putInt("nightTo", v).apply(); }
    // "Einschalten" mitten in der Nachtruhe: bis zu diesem Zeitpunkt (Millisekunden) bleibt das Weckwort trotzdem an
    static long nightOver(Context c) { return sp(c).getLong("nightOver", 0L); }
    static void setNightOver(Context c, long v) { sp(c).edit().putLong("nightOver", v).apply(); }
    static String hhmm(int minuten) { return String.format(java.util.Locale.GERMANY, "%02d:%02d", minuten / 60, minuten % 60); }
    static String status(Context c) { return sp(c).getString("status", "aus"); }
    static void setStatus(Context c, String s) { sp(c).edit().putString("status", s).apply(); }
    static String last(Context c) { return sp(c).getString("last", "-"); }
    static void setLast(Context c, String s) { sp(c).edit().putString("last", s).apply(); }
    static int hits(Context c) { return sp(c).getInt("hits", 0); }
    static void addHit(Context c) { sp(c).edit().putInt("hits", hits(c) + 1).apply(); }
}
