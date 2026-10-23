package de.dino.zaneweckruf;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Kommt nach der Wartezeit an (10 Minuten nach einer WhatsApp eines erlaubten Kontakts): Jarvis springt ein, falls die Nachricht noch ungelesen dasteht. */
public class VertretungReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(final Context c, Intent i) {
        final String key = i == null ? null : i.getStringExtra("key");
        final PendingResult pr = goAsync();
        new Thread(() -> {
            try { NachrichtenService.vertreten(c.getApplicationContext(), key); } catch (Throwable ignored) { } finally { try { pr.finish(); } catch (Throwable ignored) { } }
        }, "zane-vertretung").start();
    }
}
