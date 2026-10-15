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
        title.setText("Nova Einstellungen");
        title.setTextSize(24);
        root.addView(title);

        info = new TextView(this);
        info.setTextSize(16);
        info.setPadding(0, p, 0, p);
        root.addView(info);

        btn(root, "Nova öffnen", v -> startActivity(new Intent(this, MainActivity.class)));
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
                + "\nÜber anderen Apps einblenden: " + (overlay ? "erlaubt" : "NICHT erlaubt")
                + "\nVollbild-Benachrichtigung: " + fullScreenOk());
    }

    @Override protected void onResume() { super.onResume(); h.post(tick); }
    @Override protected void onPause() { super.onPause(); h.removeCallbacks(tick); }
}
