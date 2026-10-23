package de.dino.zaneweckruf;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Bluetooth-Meldungen des Autos: im Manifest angemeldet, damit es auch ohne Lauschen klappt. */
public class CarReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) { CarWatcher.ereignis(c, i); }
}
