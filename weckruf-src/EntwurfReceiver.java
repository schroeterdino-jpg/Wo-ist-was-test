package de.dino.zaneweckruf;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Knöpfe "Senden" und "Verwerfen" in der Entwurfs-Meldung von Jarvis. */
public class EntwurfReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(final Context c, Intent i) {
        final int id = i == null ? -1 : i.getIntExtra("id", -1);
        final boolean senden = i != null && i.getBooleanExtra("senden", false);
        final PendingResult pr = goAsync();
        new Thread(() -> {
            try { NachrichtenService.entwurfAktion(c.getApplicationContext(), id, senden); } catch (Throwable ignored) { } finally { try { pr.finish(); } catch (Throwable ignored) { } }
        }, "zane-entwurf").start();
    }
}
