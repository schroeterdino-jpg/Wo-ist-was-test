package de.dino.zaneweckruf;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Kommt 10 Sekunden nach dem Trennen vom Auto an und merkt den Parkplatz (läuft auch ohne Lauschen). */
public class ParkReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) { CarWatcher.geparkt(c, goAsync()); }
}
