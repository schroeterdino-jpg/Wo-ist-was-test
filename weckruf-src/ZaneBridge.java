package de.dino.zaneweckruf;

import android.webkit.JavascriptInterface;

/** Brücke von Zane (Webseite) zur App. Wird in der Seite als window.ZaneNative sichtbar. */
class ZaneBridge {
    private final MainActivity act;

    ZaneBridge(MainActivity a) { act = a; }

    @JavascriptInterface
    public void recStart(String lang, boolean continuous, int maxAlt) { act.nativeRecStart(lang, maxAlt); }

    @JavascriptInterface
    public void recStop() { act.nativeRecStop(); }

    @JavascriptInterface
    public void recAbort() { act.nativeRecAbort(); }

    @JavascriptInterface
    public void setBusy(boolean busy) { WakeService.setPageBusy(busy); }

    /** Jarvis spricht gerade (true) oder nicht: nur dann darf das Weckwort zum Unterbrechen mithören (wenn in den Einstellungen an). */
    @JavascriptInterface
    public void setSprechen(boolean sprechen) { WakeService.setSprechen(sprechen); }

    /** Parkplatz, der beim Trennen vom Auto vorgemerkt wurde (JSON mit lat, lon, acc, at), sonst leer. Wird dabei gelöscht. */
    @JavascriptInterface
    public String holeParkplatz() {
        String s = Prefs.parkPending(act);
        if (!s.isEmpty()) Prefs.setParkPending(act, "");
        return s;
    }

    @JavascriptInterface
    public void printHtml(String title, String html) { act.printHtml(title, html); }

    /** Foto (JPEG als Datenadresse) an WhatsApp übergeben. Gibt true zurück, wenn es geklappt hat. */
    @JavascriptInterface
    public boolean shareImage(String dataUrl, String text) { return act.shareImage(dataUrl, text); }

    /** Geplante Ansagen (JSON-Liste mit id, at in Millisekunden, text) an die App übergeben. */
    @JavascriptInterface
    public boolean planAnsagen(String json) { return AnsageReceiver.setzen(act, json); }

    /** Eine wartende, von der App ausgelöste Ansage abholen (leer, wenn keine wartet). */
    @JavascriptInterface
    public String holeAnsage() { return act.holeAnsage(); }

    /** Wecker in der Uhr-App des Handys stellen. */
    @JavascriptInterface
    public boolean weckerStellen(int stunde, int minute, String text) { return act.weckerStellen(stunde, minute, text); }

    /** "Hey Jarvis" ausschalten: Lauschen beenden (wie "Lauschen beenden" in den Einstellungen). Wieder an per Hand (Einstellungen: Lauschen starten). */
    @JavascriptInterface
    public boolean lauschenAus() { return act.lauschenAus(); }

    /** Nächster gestellter Wecker des Handys (Zeitpunkt in Millisekunden), 0 = keiner, -1 = nicht lesbar. */
    @JavascriptInterface
    public double naechsterWecker() { return act.naechsterWecker(); }

    /** Den nächsten Wecker in der Uhr-App ausschalten/löschen lassen (Antwort kommt nicht zurück; danach mit naechsterWecker() prüfen). */
    @JavascriptInterface
    public boolean weckerAus() { return act.weckerAus(); }

    /** Wurde Jarvis gerade vom Auto-Bluetooth geöffnet, damit die Autoansicht startet? (true, einmalig) */
    @JavascriptInterface
    public boolean holeAutoansicht() { boolean a = MainActivity.pendingAuto; MainActivity.pendingAuto = false; return a; }

    /** Fahrmodus (Autoansicht) an/aus: nur dann gibt die App WhatsApp-Nachrichten erlaubter Kontakte an die Seite zum Vorlesen weiter. */
    @JavascriptInterface
    public void setFahrmodus(boolean an) { Prefs.setFahren(act, an); }

    /** Audio-Ausgänge des Handys als Text (zur Kontrolle und für die Mund-Verzögerung), z. B. "Lautsprecher, Bluetooth". */
    @JavascriptInterface
    public String audioAusgang() {
        try {
            android.media.AudioManager am = (android.media.AudioManager) act.getSystemService(android.content.Context.AUDIO_SERVICE);
            android.media.AudioDeviceInfo[] d = am.getDevices(android.media.AudioManager.GET_DEVICES_OUTPUTS);
            StringBuilder sb = new StringBuilder();
            for (android.media.AudioDeviceInfo x : d) {
                if (sb.length() > 0) sb.append(", ");
                sb.append(audioName(x.getType()));
            }
            return sb.toString();
        } catch (Throwable e) { return ""; }
    }

    /** Läuft der Ton (auch) über etwas Externes (Bluetooth, USB, HDMI, Kopfhörer, Stick)? Dann kommt er etwas später an als das Bild. */
    @JavascriptInterface
    public boolean audioExtern() {
        try {
            android.media.AudioManager am = (android.media.AudioManager) act.getSystemService(android.content.Context.AUDIO_SERVICE);
            for (android.media.AudioDeviceInfo x : am.getDevices(android.media.AudioManager.GET_DEVICES_OUTPUTS)) {
                int t = x.getType();
                if (t != 1 && t != 2 && t != 18 && t != 24 && t != 25) return true;   // nicht: Hörmuschel, Lautsprecher, Telefon, Lautsprecher (sicher), Bildschirmaufnahme
            }
        } catch (Throwable ignored) { }
        return false;
    }

    private static String audioName(int t) {
        switch (t) {
            case 1: return "Hörmuschel";
            case 2: return "Lautsprecher";
            case 3: return "Kabel-Headset";
            case 4: return "Kabel-Kopfhörer";
            case 7: return "Bluetooth (Telefon)";
            case 8: return "Bluetooth (Musik)";
            case 9: return "HDMI";
            case 11: return "USB-Gerät";
            case 18: return "Telefon";
            case 21: return "Bus";
            case 22: return "USB-Headset";
            case 23: return "Hörgerät";
            case 24: return "Lautsprecher (sicher)";
            case 25: return "Bildschirmaufnahme";
            case 26: return "Bluetooth LE Headset";
            case 27: return "Bluetooth LE Lautsprecher";
            default: return "Typ " + t;
        }
    }

    /** Ist der Fahrmodus in der APK gerade an? (zur Kontrolle in der Autoansicht) */
    @JavascriptInterface
    public boolean fahrAn() { return Prefs.fahren(act); }

    /** Antwort auf eine vorgelesene WhatsApp senden (id aus der Meldung an die Seite); true, wenn WhatsApp sie angenommen hat. */
    @JavascriptInterface
    public boolean fahrSenden(String id, String text) { return NachrichtenService.fahrSenden(act, id, text); }

    /** Vorgelesene WhatsApp ohne Antwort abhaken. */
    @JavascriptInterface
    public void fahrVerwerfen(String id) { NachrichtenService.fahrVerwerfen(id); }

    /** Medien-Lautstärke ändern (Prozent-Schritt, negativ = leiser); gibt die neue Stufe in Prozent zurück, -1 bei Fehler. */
    @JavascriptInterface
    public int musikLautstaerke(int delta) { return act.musikLautstaerke(delta); }

    /** Spotify-App öffnen (für Sprachbefehle "Spiel ... auf Spotify"). */
    @JavascriptInterface
    public boolean spotifyOeffnen() { return act.spotifyOeffnen(); }

    /** Nummer direkt anrufen (fragt beim ersten Mal nach der Telefon-Erlaubnis). */
    @JavascriptInterface
    public boolean anrufen(String nummer) { return act.anrufen(nummer); }

    /** Orte und Einkaufsliste für die Orts-Erinnerungen übergeben (JSON). */
    @JavascriptInterface
    public boolean planOrte(String json) { return OrtReceiver.setzen(act, json); }

    /** Zustand der Orts-Erinnerungen (JSON mit fein, immer, aktiv, orte, letzte). */
    @JavascriptInterface
    public String ortStatus() { return OrtReceiver.status(act); }

    /** Standort-Erlaubnis "Immer zulassen": fragt nach oder öffnet die App-Einstellungen. */
    @JavascriptInterface
    public void ortRechte() { act.ortRechte(); }

    /** Beobachtungsaufträge: App-Code und Anzahl der Aufträge melden; die App fragt dann regelmäßig beim Server nach (0 = aus). */
    @JavascriptInterface
    public boolean auftraege(String schluessel, int anzahl) { return AuftragReceiver.setzen(act, schluessel, anzahl); }

    @JavascriptInterface
    public void openSetup() { act.runOnUiThread(() -> act.startActivity(new android.content.Intent(act, SetupActivity.class))); }

    // ---- Schlafmodus (WhatsApp beantworten, solange du schläfst) ----
    /** Ist der Benachrichtigungszugriff für Jarvis in Android erlaubt? */
    @JavascriptInterface
    public boolean schlafZugriff() { return NachrichtenService.zugriff(act); }

    /** Öffnet die Android-Seite, auf der man den Benachrichtigungszugriff für Jarvis erlaubt. */
    @JavascriptInterface
    public boolean schlafZugriffOeffnen() { return act.nachrichtenZugriffOeffnen(); }

    @JavascriptInterface
    public void schlafSetzen(boolean an) { Prefs.setSchlaf(act, an); if (!an) NachrichtenService.alarmAus(); }

    /** Zustand als JSON: an, zugriff, erlaubt (Liste), text. */
    @JavascriptInterface
    public String schlafStand() {
        try {
            org.json.JSONObject o = new org.json.JSONObject();
            o.put("an", Prefs.schlaf(act));
            o.put("zugriff", NachrichtenService.zugriff(act));
            org.json.JSONArray a = new org.json.JSONArray();
            for (String n : Prefs.erlaubt(act).split("\n")) if (!n.trim().isEmpty()) a.put(n.trim());
            o.put("erlaubt", a);
            o.put("text", Prefs.schlafText(act));
            o.put("ki", Prefs.schlafKi(act));
            o.put("vertretung", Prefs.vertretung(act));
            o.put("minuten", Prefs.vertrMin(act));
            o.put("anrufe", Prefs.anrufe(act));
            o.put("sms", act.checkSelfPermission(android.Manifest.permission.SEND_SMS) == android.content.pm.PackageManager.PERMISSION_GRANTED);
            return o.toString();
        } catch (Throwable e) { return "{}"; }
    }

    /** Kontakt (Name wie in WhatsApp gespeichert) für Antworten erlauben oder wieder entfernen. */
    @JavascriptInterface
    public void schlafKontakt(String name, boolean erlauben) {
        String n = NachrichtenService.norm(name);
        if (n.isEmpty()) return;
        java.util.LinkedHashSet<String> l = new java.util.LinkedHashSet<>();
        for (String x : Prefs.erlaubt(act).split("\n")) if (!x.trim().isEmpty()) l.add(x.trim());
        if (erlauben) l.add(n); else l.remove(n);
        Prefs.setErlaubt(act, android.text.TextUtils.join("\n", l));
    }

    @JavascriptInterface
    public void schlafText(String text) { Prefs.setSchlafText(act, text); }

    /** Gemerkte Nachrichten (JSON-Liste mit n, t, at, a); mit loeschen=true werden sie danach gelöscht. */
    @JavascriptInterface
    public String schlafNachrichten(boolean loeschen) {
        String s = Prefs.nachrichten(act);
        if (loeschen) Prefs.setNachrichten(act, "[]");
        return s;
    }

    /** App-Code für die KI-Antworten des Schlafmodus (wird von der Seite beim Einschalten übergeben). */
    @JavascriptInterface
    public void schlafSchluessel(String key) { Prefs.setSchlafKey(act, key); }

    /** true: Jarvis formuliert kurze Antworten selbst (KI), false: immer der feste Text. */
    @JavascriptInterface
    public void schlafKi(boolean an) { Prefs.setSchlafKi(act, an); }

    /** Zeigt die Mehrfachauswahl der Kontakte (fragt beim ersten Mal nach der Kontakte-Erlaubnis). */
    @JavascriptInterface
    public boolean schlafKontakteWaehlen() { return act.kontakteWaehlen(); }

    // ---- Vertretung: nach der Wartezeit antwortet Jarvis auf ungelesene WhatsApp-Nachrichten erlaubter Kontakte ----
    @JavascriptInterface
    public void vertretungSetzen(boolean an) { Prefs.setVertretung(act, an); }

    @JavascriptInterface
    public void vertretungMinuten(int minuten) { Prefs.setVertrMin(act, minuten); }

    /** Was Jarvis über Dinos heutigen Tag sagen darf (z. B. "Dino arbeitet heute Frühschicht bis 14:37 Uhr."), mit Tag (yyyy-MM-dd). */
    @JavascriptInterface
    public void schlafKontext(String tag, String text) { Prefs.setKontext(act, tag, text); }

    /** Wissensblatt: Aussagen, die Jarvis über Dino machen darf (eine pro Zeile). */
    @JavascriptInterface
    public String wissenListe() { return Prefs.wissen(act); }

    @JavascriptInterface
    public void wissenSetzen(String zeilen) { Prefs.setWissen(act, zeilen); }

    /** Arbeitszeit von heute (Beginn und Ende in Millisekunden, 0/0 = keine Schicht): damit weiß Jarvis, ob du bei der Arbeit bist. */
    @JavascriptInterface
    public void schlafArbeit(double von, double bis) { Prefs.setArbeit(act, (long) von, (long) bis); }

    /** Eine wartende Meldung von Jarvis (JSON mit titel, text, nurText) abholen, leer wenn keine wartet. */
    @JavascriptInterface
    public String holeMeldung() { String s = MainActivity.pendingMeldung; MainActivity.pendingMeldung = null; return s == null ? "" : s; }

    /** Protokoll der Vertretung: warum Jarvis geantwortet hat oder nicht (die letzten Einträge, ein Eintrag pro Zeile). */
    @JavascriptInterface
    public String vertretungProtokoll() { return Prefs.vertrLog(act); }

    /** Anrede je Kontakt: "name=papa" / "name=mann" / "name=dino" (eine Zeile pro Person). */
    @JavascriptInterface
    public String anredeListe() { return Prefs.anrede(act); }

    @JavascriptInterface
    public void anredeSetzen(String name, String rolle) {
        String k = NachrichtenService.norm2(name), r = rolle == null ? "dino" : rolle.trim().toLowerCase(java.util.Locale.GERMANY);
        if (k.isEmpty()) return;
        StringBuilder sb = new StringBuilder();
        for (String z : Prefs.anrede(act).split("\n")) {
            int e = z.indexOf('=');
            if (e <= 0 || NachrichtenService.norm2(z.substring(0, e)).equals(k)) continue;
            sb.append(z).append('\n');
        }
        if (!"dino".equals(r)) sb.append(k).append('=').append(r);
        Prefs.setAnrede(act, sb.toString().trim());
    }

    /** Verpasste Anrufe beantworten (SMS) an oder aus; beim Einschalten fragt Android einmal nach der Erlaubnis für SMS. */
    @JavascriptInterface
    public void anrufeSetzen(boolean an) {
        Prefs.setAnrufe(act, an);
        if (an) act.smsErlaubnis();
    }
}
