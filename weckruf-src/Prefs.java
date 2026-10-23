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
    // Erkennung: 0 = Vosk (Hey Jarvis, wie bisher), 1 = openWakeWord (Test mit "Hey Jarvis", spart Strom)
    static int engine(Context c) { return sp(c).getInt("engine", 1); }
    static void setEngine(Context c, int v) { sp(c).edit().putInt("engine", v).apply(); }
    static String stat(Context c) { return sp(c).getString("stat", "noch keine Messung"); }
    static void setStat(Context c, String s) { sp(c).edit().putString("stat", s).apply(); }
    // Unterbrechen per Sprache (Test): Jarvis hört beim Sprechen weiter auf "Hey Jarvis" (strengere Schwelle)
    static boolean unterbrechen(Context c) { return sp(c).getBoolean("unterbrechen", false); }
    static void setUnterbrechen(Context c, boolean v) { sp(c).edit().putBoolean("unterbrechen", v).apply(); }
    // Auto (Bluetooth) für den automatischen Parkplatz
    static String carAddr(Context c) { return sp(c).getString("carAddr", ""); }
    static String carName(Context c) { return sp(c).getString("carName", ""); }
    static void setCar(Context c, String addr, String name) { sp(c).edit().putString("carAddr", addr == null ? "" : addr).putString("carName", name == null ? "" : name).apply(); }
    // Autoansicht von selbst öffnen, wenn das Handy sich mit dem Auto verbindet (Standard: an)
    static boolean autoEinsteigen(Context c) { return sp(c).getBoolean("autoEinsteigen", true); }
    static void setAutoEinsteigen(Context c, boolean v) { sp(c).edit().putBoolean("autoEinsteigen", v).apply(); }
    static long autoZuletzt(Context c) { return sp(c).getLong("autoZuletzt", 0); }
    static void setAutoZuletzt(Context c, long t) { sp(c).edit().putLong("autoZuletzt", t).apply(); }
    static String autoInfo(Context c) { return sp(c).getString("autoInfo", "noch nichts"); }
    static void setAutoInfo(Context c, String s) { sp(c).edit().putString("autoInfo", s).apply(); }
    static String parkPending(Context c) { return sp(c).getString("parkPending", ""); }
    static void setParkPending(Context c, String s) { sp(c).edit().putString("parkPending", s == null ? "" : s).apply(); }
    static String parkInfo(Context c) { return sp(c).getString("parkInfo", "noch nichts"); }
    static void setParkInfo(Context c, String s) { sp(c).edit().putString("parkInfo", s).apply(); }
    static int hits(Context c) { return sp(c).getInt("hits", 0); }
    static void addHit(Context c) { sp(c).edit().putInt("hits", hits(c) + 1).apply(); }
}
