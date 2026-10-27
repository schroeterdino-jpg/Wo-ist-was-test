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
    // Musik wurde von Jarvis gestartet: beim Wegwischen der App wird sie angehalten
    static boolean musikVonJarvis(Context c) { return sp(c).getBoolean("musikVonJarvis", false); }
    static void setMusikVonJarvis(Context c, boolean v) { sp(c).edit().putBoolean("musikVonJarvis", v).apply(); }
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
    // Schlafmodus: Jarvis antwortet erlaubten WhatsApp-Kontakten (nur 1:1) mit einem festen Text und merkt sich alle Nachrichten fürs Vorlesen am Morgen
    static boolean schlaf(Context c) { return sp(c).getBoolean("schlaf", false); }
    static long schlafSeit(Context c) { return sp(c).getLong("schlafSeit", 0L); }
    static void setSchlaf(Context c, boolean v) {
        SharedPreferences.Editor e = sp(c).edit().putBoolean("schlaf", v).putLong("schlafSeit", v ? System.currentTimeMillis() : 0L);
        if (v) e.putString("schlafAntworten", "");   // pro Schlafphase höchstens eine Antwort je Kontakt
        e.apply();
    }
    static String erlaubt(Context c) { return sp(c).getString("schlafErlaubt", ""); }       // Namen, getrennt durch Zeilenumbruch (klein, ohne Umlaute)
    static void setErlaubt(Context c, String s) { sp(c).edit().putString("schlafErlaubt", s == null ? "" : s).apply(); }
    static String nachrichten(Context c) { return sp(c).getString("schlafNachrichten", "[]"); }
    static void setNachrichten(Context c, String s) { sp(c).edit().putString("schlafNachrichten", s == null ? "[]" : s).apply(); }
    static String schlafAntworten(Context c) { return sp(c).getString("schlafAntworten", ""); }
    static void setSchlafAntworten(Context c, String s) { sp(c).edit().putString("schlafAntworten", s == null ? "" : s).apply(); }
    static String schlafText(Context c) { return sp(c).getString("schlafText", "Hallo, hier ist Jarvis, der KI-Assistent von Dino. Dino schläft gerade und meldet sich bei dir, sobald er wach ist."); }
    static void setSchlafText(Context c, String s) { sp(c).edit().putString("schlafText", s == null ? "" : s).apply(); }
    static String schlafKey(Context c) { return sp(c).getString("schlafKey", ""); }
    static void setSchlafKey(Context c, String s) { if (s != null && !s.isEmpty()) sp(c).edit().putString("schlafKey", s).apply(); }
    static boolean schlafKi(Context c) { return sp(c).getBoolean("schlafKi", true); }       // true: Jarvis formuliert kurze Antworten selbst (KI), false: immer der feste Text
    static void setSchlafKi(Context c, boolean v) { sp(c).edit().putBoolean("schlafKi", v).apply(); }
    // Vertretung: antwortet ein erlaubter Kontakt-Chat nach N Minuten ungelesen noch steht, springt Jarvis ein
    static boolean vertretung(Context c) { return sp(c).getBoolean("vertretung", false); }
    static void setVertretung(Context c, boolean v) { sp(c).edit().putBoolean("vertretung", v).apply(); }
    static int vertrMin(Context c) {
        SharedPreferences p = sp(c);
        if (!p.getBoolean("vertrMin5", false)) { p.edit().putInt("vertrMin", 5).putBoolean("vertrMin5", true).apply(); return 5; }   // einmalig: Standard 5 Minuten (27.10.2026)
        return p.getInt("vertrMin", 5);
    }
    static void setVertrMin(Context c, int m) { sp(c).edit().putInt("vertrMin", Math.max(5, Math.min(120, m))).apply(); }
    // Fahrmodus (Autoansicht offen): WhatsApp von erlaubten Kontakten wird vorgelesen; der Merker verfällt nach 12 Stunden von selbst
    static boolean fahren(Context c) { long s = sp(c).getLong("fahrenSeit", 0); return s > 0 && System.currentTimeMillis() - s < 12L * 3600000L; }
    static void setFahren(Context c, boolean v) { sp(c).edit().putLong("fahrenSeit", v ? System.currentTimeMillis() : 0).apply(); }
    static String vertrZeiten(Context c) { return sp(c).getString("vertrZeiten", ""); }         // Zeilen "name=ts,ts,ts" (Zeitpunkte der Vertretungs-Antworten)
    static void setVertrZeiten(Context c, String s) { sp(c).edit().putString("vertrZeiten", s == null ? "" : s).apply(); }
    static String kontextTag(Context c) { return sp(c).getString("kontextTag", ""); }
    static String kontextText(Context c) { return sp(c).getString("kontextText", ""); }
    static void setKontext(Context c, String tag, String text) { sp(c).edit().putString("kontextTag", tag == null ? "" : tag).putString("kontextText", text == null ? "" : text).apply(); }
    // Wissensblatt: Aussagen, die Jarvis über Dino machen darf (eine pro Zeile); Arbeitszeit von heute (Millisekunden) für "ist bei der Arbeit"
    static String wissen(Context c) { return sp(c).getString("wissen", "Dino fährt vielleicht gerade und meldet sich nach der Fahrt."); }   // Vorgabe, bis Dino das Wissensblatt selbst ändert
    static void setWissen(Context c, String s) { sp(c).edit().putString("wissen", s == null ? "" : s).apply(); }
    static long arbeitVon(Context c) { return sp(c).getLong("arbeitVon", 0L); }
    static long arbeitBis(Context c) { return sp(c).getLong("arbeitBis", 0L); }
    static void setArbeit(Context c, long von, long bis) { sp(c).edit().putLong("arbeitVon", von).putLong("arbeitBis", bis).apply(); }
    static String vertrLog(Context c) { return sp(c).getString("vertrLog", ""); }
    static void setVertrLog(Context c, String s) { sp(c).edit().putString("vertrLog", s == null ? "" : s).apply(); }
    // Wie sich Jarvis bei wem vorstellt: Zeilen "name=papa" oder "name=mann" (sonst Dino). Standard: Töchter Papa, Schatz Mann.
    static String anrede(Context c) { return sp(c).getString("anrede", "alyssa=papa\njulia=papa\nisabel=papa\nschatz=mann"); }
    static void setAnrede(Context c, String s) { sp(c).edit().putString("anrede", s == null ? "" : s).apply(); }
    // Verpasste Anrufe: Jarvis schreibt Kontakten aus der Auswahl eine SMS (höchstens eine je Person in 30 Minuten), Familie bekommt einen kurzen Alarm
    static boolean anrufe(Context c) { return sp(c).getBoolean("anrufe", false); }
    static void setAnrufe(Context c, boolean v) { sp(c).edit().putBoolean("anrufe", v).apply(); }
    static String anrufZeiten(Context c) { return sp(c).getString("anrufZeiten", ""); }
    static void setAnrufZeiten(Context c, String s) { sp(c).edit().putString("anrufZeiten", s == null ? "" : s).apply(); }
}
