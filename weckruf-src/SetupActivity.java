package de.dino.zaneweckruf;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.ArrayList;

public class SetupActivity extends Activity {

    private TextView info;
    private final Handler h = new Handler(Looper.getMainLooper());
    private final Runnable tick = new Runnable() {
        @Override public void run() { refresh(); h.postDelayed(this, 1500); }
    };

    private void btn(LinearLayout root, String text, View.OnClickListener l) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        b.setOnClickListener(l);
        root.addView(b);
    }

    @Override
    protected void onCreate(Bundle s) {
        super.onCreate(s);
        ScrollView sv = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int p = (int) (16 * getResources().getDisplayMetrics().density);
        root.setPadding(p, p * 2, p, p);
        sv.addView(root);
        setContentView(sv);

        TextView title = new TextView(this);
        title.setText("Jarvis Einstellungen");
        title.setTextSize(24);
        root.addView(title);

        info = new TextView(this);
        info.setTextSize(16);
        info.setPadding(0, p, 0, p);
        root.addView(info);

        btn(root, "Jarvis öffnen", v -> startActivity(new Intent(this, MainActivity.class)));
        btn(root, "Lauschen starten", v -> { Prefs.setEnabled(this, true); Prefs.setMuted(this, false); startAll(); });
        btn(root, "Lauschen beenden", v -> {
            Prefs.setEnabled(this, false);
            stopService(new Intent(this, WakeService.class));
            refresh();
        });
        btn(root, "„Über anderen Apps einblenden“ erlauben", v ->
                startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName()))));
        btn(root, "„Vollbild-Benachrichtigungen“ erlauben (für gesperrten Bildschirm)", v -> {
            try {
                if (android.os.Build.VERSION.SDK_INT >= 34)
                    startActivity(new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + getPackageName())));
                else
                    startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName()));
            } catch (Throwable e) {
                startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName())));
            }
        });
        btn(root, "Akku-Optimierung ausschalten", v ->
                startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)));

        TextView sens = new TextView(this);
        sens.setText("\nEmpfindlichkeit:");
        root.addView(sens);
        RadioGroup rg = new RadioGroup(this);
        String[] names = {"streng (wenige Fehlalarme)", "normal", "empfindlich (auch ähnliche Wörter)"};
        for (int i = 0; i < names.length; i++) {
            RadioButton rb = new RadioButton(this);
            rb.setText(names[i]);
            rb.setId(100 + i);
            rg.addView(rb);
        }
        rg.check(100 + Prefs.level(this));
        rg.setOnCheckedChangeListener((g, id) -> {
            Prefs.setLevel(this, id - 100);
            if (Prefs.enabled(this) && WakeService.inst != null) startAll();
        });
        root.addView(rg);

        // Erkennung: neue, stromsparende Erkennung (Test) oder die bisherige
        TextView eng = new TextView(this);
        eng.setText("\nErkennung:");
        root.addView(eng);
        RadioGroup rge = new RadioGroup(this);
        String[] engNames = {"bisher (Vosk, Weckwort „Hey Jarvis“)", "neu (openWakeWord, Test mit „Hey Jarvis“, spart Strom)"};
        for (int i = 0; i < engNames.length; i++) {
            RadioButton rb = new RadioButton(this);
            rb.setText(engNames[i]);
            rb.setId(200 + i);
            rge.addView(rb);
        }
        rge.check(200 + Prefs.engine(this));
        rge.setOnCheckedChangeListener((g, id) -> {
            Prefs.setEngine(this, id - 200);
            if (Prefs.enabled(this) && WakeService.inst != null) startAll();
        });
        root.addView(rge);

        // Nachtruhe: das Weckwort schläft zwischen zwei Uhrzeiten
        TextView nacht = new TextView(this);
        nacht.setText("\nNachtruhe (Weckwort schläft):");
        root.addView(nacht);
        android.widget.CheckBox cb = new android.widget.CheckBox(this);
        cb.setText("Nachtruhe benutzen");
        cb.setChecked(Prefs.nightOn(this));
        root.addView(cb);
        final Button von = new Button(this);
        final Button bis = new Button(this);
        von.setAllCaps(false);
        bis.setAllCaps(false);
        von.setText("Von: " + Prefs.hhmm(Prefs.nightFrom(this)) + " Uhr");
        bis.setText("Bis: " + Prefs.hhmm(Prefs.nightTo(this)) + " Uhr");
        cb.setOnCheckedChangeListener((b, an) -> { Prefs.setNightOn(this, an); WakeService.nachtGeaendert(); });
        von.setOnClickListener(v -> {
            int m = Prefs.nightFrom(this);
            new android.app.TimePickerDialog(this, (tp, hh, mm) -> {
                Prefs.setNightFrom(this, hh * 60 + mm);
                von.setText("Von: " + Prefs.hhmm(hh * 60 + mm) + " Uhr");
                WakeService.nachtGeaendert();
            }, m / 60, m % 60, true).show();
        });
        bis.setOnClickListener(v -> {
            int m = Prefs.nightTo(this);
            new android.app.TimePickerDialog(this, (tp, hh, mm) -> {
                Prefs.setNightTo(this, hh * 60 + mm);
                bis.setText("Bis: " + Prefs.hhmm(hh * 60 + mm) + " Uhr");
                WakeService.nachtGeaendert();
            }, m / 60, m % 60, true).show();
        });
        root.addView(von);
        root.addView(bis);

        // Unterbrechen per Sprache (Test)
        TextView unt = new TextView(this);
        unt.setText("\nUnterbrechen:");
        root.addView(unt);
        android.widget.CheckBox cbu = new android.widget.CheckBox(this);
        cbu.setText("Jarvis beim Sprechen mit „Hey Jarvis“ unterbrechen (Test, nur neue Erkennung)");
        cbu.setChecked(Prefs.unterbrechen(this));
        cbu.setOnCheckedChangeListener((b, an) -> { Prefs.setUnterbrechen(this, an); WakeService.neuStarten(); });
        root.addView(cbu);

        // Auto (Bluetooth) für den automatischen Parkplatz
        TextView auto = new TextView(this);
        auto.setText("\nAuto (Parkplatz automatisch merken):");
        root.addView(auto);
        btn(root, "Auto per Bluetooth wählen", v -> autoWaehlen());
        btn(root, "Standort „Immer zulassen“ einstellen", v ->
                startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()))));
    }

    /** Liste der gekoppelten Bluetooth-Geräte zeigen; das gewählte gilt als Auto. */
    private void autoWaehlen() {
        try {
            if (Build.VERSION.SDK_INT >= 31 && checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.BLUETOOTH_CONNECT}, 3);
                return;
            }
            android.bluetooth.BluetoothManager bm = (android.bluetooth.BluetoothManager) getSystemService(BLUETOOTH_SERVICE);
            android.bluetooth.BluetoothAdapter ad = bm == null ? null : bm.getAdapter();
            if (ad == null) { info.setText("Dieses Handy hat kein Bluetooth."); return; }
            final ArrayList<String> namen = new ArrayList<>();
            final ArrayList<String> adressen = new ArrayList<>();
            namen.add("Kein Auto (aus)");
            adressen.add("");
            for (android.bluetooth.BluetoothDevice d : ad.getBondedDevices()) {
                String n = d.getName();
                namen.add(n == null || n.isEmpty() ? d.getAddress() : n);
                adressen.add(d.getAddress());
            }
            new android.app.AlertDialog.Builder(this)
                    .setTitle("Welches Gerät ist dein Auto?")
                    .setItems(namen.toArray(new String[0]), (dlg, which) -> {
                        Prefs.setCar(this, adressen.get(which), which == 0 ? "" : namen.get(which));
                        refresh();
                    })
                    .show();
        } catch (Throwable e) {
            info.setText("Bluetooth-Liste nicht verfügbar: " + e);
        }
    }

    private void startAll() {
        ArrayList<String> need = new ArrayList<>();
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED)
            need.add(Manifest.permission.RECORD_AUDIO);
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            need.add(Manifest.permission.POST_NOTIFICATIONS);
        if (!need.isEmpty()) {
            requestPermissions(need.toArray(new String[0]), 1);
            return;
        }
        startForegroundService(new Intent(this, WakeService.class));
        refresh();
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        super.onRequestPermissionsResult(code, perms, res);
        if (code == 3) {   // Bluetooth-Erlaubnis für die Auto-Wahl
            if (Build.VERSION.SDK_INT < 31 || checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED) autoWaehlen();
            else info.setText("Ohne Bluetooth-Erlaubnis kann ich das Auto nicht erkennen.");
            return;
        }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) startAll();
        else info.setText("Ohne Mikrofon-Erlaubnis geht es nicht.");
    }

    private String fullScreenOk() {
        try {
            if (android.os.Build.VERSION.SDK_INT >= 34) {
                android.app.NotificationManager nm = (android.app.NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                return nm.canUseFullScreenIntent() ? "erlaubt" : "NICHT erlaubt";
            }
        } catch (Throwable ignored) { }
        return "erlaubt";
    }

    private void refresh() {
        boolean overlay = Settings.canDrawOverlays(this);
        info.setText("Status: " + Prefs.status(this)
                + "\nZuletzt gehört: " + Prefs.last(this)
                + "\nErkennungen: " + Prefs.hits(this)
                + "\nRechenzeit der Erkennung: " + Prefs.stat(this)
                + "\nÜber anderen Apps einblenden: " + (overlay ? "erlaubt" : "NICHT erlaubt")
                + "\nVollbild-Benachrichtigung: " + fullScreenOk()
                + "\nAuto (Bluetooth): " + (Prefs.carAddr(this).isEmpty() ? "keins gewählt" : Prefs.carName(this))
                + "\nParkplatz: " + Prefs.parkInfo(this));
    }

    @Override protected void onResume() { super.onResume(); h.post(tick); }
    @Override protected void onPause() { super.onPause(); h.removeCallbacks(tick); }
}
