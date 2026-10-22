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
}
