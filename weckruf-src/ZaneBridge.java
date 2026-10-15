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

    @JavascriptInterface
    public void openSetup() { act.runOnUiThread(() -> act.startActivity(new android.content.Intent(act, SetupActivity.class))); }
}
