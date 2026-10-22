package de.dino.zaneweckruf;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.text.style.RelativeSizeSpan;
import android.text.style.StyleSpan;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.CompoundButton;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;

import java.util.ArrayList;

public class SetupActivity extends Activity {

    private static final int BG = Color.parseColor("#030810");
    private static final int FILL = Color.parseColor("#0a1a28");
    private static final int LINE = Color.parseColor("#1f6b85");
    private static final int CYAN = Color.parseColor("#49d7ff");
    private static final int TEXT = Color.parseColor("#d8f3ff");
    private static final int DIM = Color.parseColor("#8fb4c8");
    private static final int GREEN = Color.parseColor("#4cffb0");
    private static final int ORANGE = Color.parseColor("#ffb347");

    private TextView info;
    private TextView ovVal, fsVal, bgVal, autoVal;
    private final Handler h = new Handler(Looper.getMainLooper());
    private final Runnable tick = new Runnable() {
        @Override public void run() { refresh(); h.postDelayed(this, 1500); }
    };

    private int dp(int v) { return (int) (v * getResources().getDisplayMetrics().density + 0.5f); }

    private TextView tv(String t, float sp, int color, boolean bold) {
        TextView x = new TextView(this);
        x.setText(t);
        x.setTextSize(sp);
        x.setTextColor(color);
        x.setTypeface(Typeface.MONOSPACE, bold ? Typeface.BOLD : Typeface.NORMAL);
        return x;
    }

    private GradientDrawable box(int fill, int stroke, int radiusDp) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(fill);
        g.setStroke(dp(1), stroke);
        g.setCornerRadius(dp(radiusDp));
        return g;
    }

    /** Eine Karte mit kleiner Überschrift. */
    private LinearLayout card(LinearLayout root, String label, int stroke) {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.setBackground(box(FILL, stroke, 6));
        c.setPadding(dp(14), dp(10), dp(14), dp(10));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(12);
        c.setLayoutParams(lp);
        if (label != null) {
            TextView l = tv(label.toUpperCase(), 11, CYAN, true);
            l.setLetterSpacing(0.18f);
            l.setPadding(0, 0, 0, dp(4));
            c.addView(l);
        }
        root.addView(c);
        return c;
    }

    private void trenner(LinearLayout card) {
        View v = new View(this);
        v.setBackgroundColor(Color.parseColor("#143447"));
        card.addView(v, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1)));
    }

    /** Zeile mit Schalter rechts. */
    private Switch schalter(LinearLayout card, String text, boolean an, CompoundButton.OnCheckedChangeListener l) {
        Switch sw = new Switch(this);
        sw.setText(text);
        sw.setTextSize(14);
        sw.setTextColor(TEXT);
        sw.setTypeface(Typeface.MONOSPACE);
        sw.setPadding(0, dp(10), 0, dp(10));
        int[][] st = {{android.R.attr.state_checked}, {}};
        sw.setThumbTintList(new ColorStateList(st, new int[]{CYAN, Color.parseColor("#6a8a99")}));
        sw.setTrackTintList(new ColorStateList(st, new int[]{Color.parseColor("#1d5f78"), Color.parseColor("#1a2a36")}));
        sw.setChecked(an);
        sw.setOnCheckedChangeListener(l);
        card.addView(sw, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        return sw;
    }

    /** Zeile mit Text links und Wert rechts, antippbar. Gibt den Wert-Text zurück. */
    private TextView zeile(LinearLayout card, String label, String wert, int wertFarbe, View.OnClickListener l) {
        LinearLayout r = new LinearLayout(this);
        r.setOrientation(LinearLayout.HORIZONTAL);
        r.setGravity(Gravity.CENTER_VERTICAL);
        r.setPadding(0, dp(11), 0, dp(11));
        TextView a = tv(label, 14, TEXT, false);
        r.addView(a, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        TextView w = tv(wert, 14, wertFarbe, false);
        w.setGravity(Gravity.END);
        r.addView(w);
        if (l != null) r.setOnClickListener(l);
        card.addView(r, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        return w;
    }

    private Button knopf(LinearLayout parent, String text, boolean voll, View.OnClickListener l) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        b.setTextSize(13);
        b.setTypeface(Typeface.MONOSPACE);
        b.setTextColor(voll ? BG : CYAN);
        b.setBackground(box(voll ? CYAN : FILL, CYAN, 6));
        b.setOnClickListener(l);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        lp.setMargins(dp(3), dp(6), dp(3), 0);
        parent.addView(b, lp);
        return b;
    }

    private LinearLayout reihe(LinearLayout card) {
        LinearLayout r = new LinearLayout(this);
        r.setOrientation(LinearLayout.HORIZONTAL);
        card.addView(r, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        return r;
    }

    private boolean hintergrundOrtOk() {
        try {
            return Build.VERSION.SDK_INT < 29 || checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED;
        } catch (Throwable e) { return false; }
    }

    @Override
    protected void onCreate(Bundle s) {
        super.onCreate(s);
        try {
            getWindow().setStatusBarColor(BG);
            getWindow().setNavigationBarColor(BG);
        } catch (Throwable ignored) { }
        ScrollView sv = new ScrollView(this);
        sv.setBackgroundColor(BG);
        sv.setFillViewport(true);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(16), dp(40), dp(16), dp(24));
        sv.addView(root);
        setContentView(sv);

        TextView title = tv("EINSTELLUNGEN", 22, CYAN, true);
        title.setLetterSpacing(0.14f);
        root.addView(title);

        // Status
        LinearLayout stc = card(root, null, GREEN);
        info = tv("", 12, DIM, false);
        info.setLineSpacing(0, 1.25f);
        stc.addView(info);
        LinearLayout r1 = reihe(stc);
        knopf(r1, "Jarvis öffnen", true, v -> startActivity(new Intent(this, MainActivity.class)));
        LinearLayout r2 = reihe(stc);
        knopf(r2, "Lauschen starten", false, v -> { Prefs.setEnabled(this, true); Prefs.setMuted(this, false); startAll(); });
        knopf(r2, "Lauschen beenden", false, v -> {
            Prefs.setEnabled(this, false);
            stopService(new Intent(this, WakeService.class));
            refresh();
        });

        // Weckwort
        LinearLayout wc = card(root, "Weckwort", LINE);
        LinearLayout seg = new LinearLayout(this);
        seg.setOrientation(LinearLayout.HORIZONTAL);
        final TextView[] segTv = new TextView[3];
        String[] names = {"streng", "normal", "empfindlich"};
        for (int i = 0; i < names.length; i++) {
            final int idx = i;
            TextView t = tv(names[i], 13, TEXT, false);
            t.setGravity(Gravity.CENTER);
            t.setPadding(0, dp(10), 0, dp(10));
            segTv[i] = t;
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
            lp.setMargins(dp(i == 0 ? 0 : 4), 0, 0, 0);
            seg.addView(t, lp);
        }
        final Runnable segZeichnen = () -> {
            int sel = Prefs.level(this);
            for (int i = 0; i < segTv.length; i++) {
                boolean on = i == sel;
                segTv[i].setBackground(box(on ? CYAN : FILL, on ? CYAN : LINE, 4));
                segTv[i].setTextColor(on ? BG : TEXT);
                segTv[i].setTypeface(Typeface.MONOSPACE, on ? Typeface.BOLD : Typeface.NORMAL);
            }
        };
        for (int i = 0; i < segTv.length; i++) {
            final int idx = i;
            segTv[i].setOnClickListener(v -> {
                Prefs.setLevel(this, idx);
                segZeichnen.run();
                if (Prefs.enabled(this) && WakeService.inst != null) startAll();
            });
        }
        segZeichnen.run();
        wc.addView(seg, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        schalter(wc, "Neue Erkennung (spart Strom)", Prefs.engine(this) == 1, (b, an) -> {
            Prefs.setEngine(this, an ? 1 : 0);
            if (Prefs.enabled(this) && WakeService.inst != null) startAll();
        });
        trenner(wc);
        schalter(wc, "Jarvis beim Sprechen unterbrechen", Prefs.unterbrechen(this), (b, an) -> { Prefs.setUnterbrechen(this, an); WakeService.neuStarten(); });

        // Nachtruhe
        LinearLayout nc = card(root, "Nachtruhe", LINE);
        final Switch nsw = schalter(nc, "Weckwort schläft", Prefs.nightOn(this), (b, an) -> { Prefs.setNightOn(this, an); WakeService.nachtGeaendert(); });
        trenner(nc);
        final TextView[] von = new TextView[1];
        final TextView[] bis = new TextView[1];
        von[0] = zeile(nc, "Von", Prefs.hhmm(Prefs.nightFrom(this)) + " Uhr  ›", CYAN, v -> {
            int m = Prefs.nightFrom(this);
            new android.app.TimePickerDialog(this, (tp, hh, mm) -> {
                Prefs.setNightFrom(this, hh * 60 + mm);
                von[0].setText(Prefs.hhmm(hh * 60 + mm) + " Uhr  ›");
                WakeService.nachtGeaendert();
            }, m / 60, m % 60, true).show();
        });
        trenner(nc);
        bis[0] = zeile(nc, "Bis", Prefs.hhmm(Prefs.nightTo(this)) + " Uhr  ›", CYAN, v -> {
            int m = Prefs.nightTo(this);
            new android.app.TimePickerDialog(this, (tp, hh, mm) -> {
                Prefs.setNightTo(this, hh * 60 + mm);
                bis[0].setText(Prefs.hhmm(hh * 60 + mm) + " Uhr  ›");
                WakeService.nachtGeaendert();
            }, m / 60, m % 60, true).show();
        });

        // Auto und Parkplatz
        LinearLayout ac = card(root, "Auto & Parkplatz", LINE);
        autoVal = zeile(ac, "Auto (Bluetooth)", "wählen  ›", CYAN, v -> autoWaehlen());
        trenner(ac);
        bgVal = zeile(ac, "Standort „Immer zulassen“", "", GREEN, v ->
                startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()))));

        // Berechtigungen
        LinearLayout pc = card(root, "Berechtigungen", LINE);
        ovVal = zeile(pc, "Über anderen Apps einblenden", "", GREEN, v ->
                startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName()))));
        trenner(pc);
        fsVal = zeile(pc, "Vollbild-Benachrichtigung", "", GREEN, v -> {
            try {
                if (android.os.Build.VERSION.SDK_INT >= 34)
                    startActivity(new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + getPackageName())));
                else
                    startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName()));
            } catch (Throwable e) {
                startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName())));
            }
        });
        trenner(pc);
        zeile(pc, "Akku-Optimierung ausschalten", "›", CYAN, v ->
                startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)));

        refresh();
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
        String st = String.valueOf(Prefs.status(this));
        boolean ok = st.toLowerCase().contains("lauscht");
        SpannableStringBuilder sb = new SpannableStringBuilder();
        int a0 = sb.length();
        sb.append("● ");
        sb.setSpan(new ForegroundColorSpan(ok ? GREEN : ORANGE), a0, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        a0 = sb.length();
        sb.append(st).append("\n");
        sb.setSpan(new ForegroundColorSpan(TEXT), a0, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        sb.setSpan(new RelativeSizeSpan(1.3f), a0, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        sb.setSpan(new StyleSpan(Typeface.BOLD), a0, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        sb.append("Zuletzt gehört: ").append(String.valueOf(Prefs.last(this)))
          .append("\nErkennungen: ").append(String.valueOf(Prefs.hits(this)))
          .append("\nRechenzeit: ").append(String.valueOf(Prefs.stat(this)))
          .append("\nAuto: ").append(Prefs.carAddr(this).isEmpty() ? "keins gewählt" : Prefs.carName(this))
          .append("\nParkplatz: ").append(String.valueOf(Prefs.parkInfo(this)));
        info.setText(sb);
        setzeWert(ovVal, overlay);
        String fs = fullScreenOk();
        setzeWert(fsVal, "erlaubt".equals(fs));
        setzeWert(bgVal, hintergrundOrtOk());
        if (autoVal != null) {
            boolean hat = !Prefs.carAddr(this).isEmpty();
            autoVal.setText(hat ? Prefs.carName(this) + "  ›" : "wählen  ›");
            autoVal.setTextColor(hat ? GREEN : CYAN);
        }
    }

    private void setzeWert(TextView t, boolean ok) {
        if (t == null) return;
        t.setText(ok ? "✓ erlaubt" : "nicht erlaubt  ›");
        t.setTextColor(ok ? GREEN : ORANGE);
    }

    @Override protected void onResume() { super.onResume(); h.post(tick); }
    @Override protected void onPause() { super.onPause(); h.removeCallbacks(tick); }
}
