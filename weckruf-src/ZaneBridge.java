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

    /** Orte und Einkaufsliste für die Orts-Erinnerungen übergeben (JSON). */
    @JavascriptInterface
    public boolean planOrte(String json) { return OrtReceiver.setzen(act, json); }

    /** Zustand der Orts-Erinnerungen (JSON mit fein, immer, aktiv, orte, letzte). */
    @JavascriptInterface
    public String ortStatus() { return OrtReceiver.status(act); }

    /** Standort-Erlaubnis "Immer zulassen": fragt nach oder öffnet die App-Einstellungen. */
    @JavascriptInterface
    public void ortRechte() { act.ortRechte(); }

    @JavascriptInterface
    public void openSetup() { act.runOnUiThread(() -> act.startActivity(new android.content.Intent(act, SetupActivity.class))); }
}
