package de.dino.zaneweckruf;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.database.Cursor;
import android.provider.ContactsContract;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ListView;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

/** Mehrfachauswahl der Kontakte, denen Jarvis im Schlafmodus antworten darf (Namen aus den Handy-Kontakten, wie sie auch in WhatsApp stehen). */
final class KontaktWahl {
    private KontaktWahl() { }

    static void zeigen(final Activity act) {
        final List<String> alle = new ArrayList<>();
        try (Cursor c = act.getContentResolver().query(ContactsContract.Contacts.CONTENT_URI,
                new String[]{ContactsContract.Contacts.DISPLAY_NAME}, ContactsContract.Contacts.HAS_PHONE_NUMBER + "=1", null,
                ContactsContract.Contacts.DISPLAY_NAME + " COLLATE LOCALIZED ASC")) {
            Set<String> da = new TreeSet<>();
            while (c != null && c.moveToNext()) {
                String n = c.getString(0);
                if (n != null && !n.trim().isEmpty() && da.add(n.trim().toLowerCase())) alle.add(n.trim());
            }
        } catch (Throwable e) { return; }

        final Set<String> gewaehlt = new LinkedHashSet<>();   // Anzeigenamen
        final List<String> bisher = new ArrayList<>();         // bereits erlaubte Namen (normalisiert)
        for (String a : Prefs.erlaubt(act).split("\n")) if (!NachrichtenService.norm(a).isEmpty()) bisher.add(NachrichtenService.norm(a));
        for (String n : alle) if (NachrichtenService.erlaubtName(act, n)) gewaehlt.add(n);

        final List<String> gezeigt = new ArrayList<>(alle);
        final ArrayAdapter<String> ad = new ArrayAdapter<>(act, android.R.layout.simple_list_item_1, new ArrayList<String>());
        final Runnable fuellen = () -> {
            ad.clear();
            for (String n : gezeigt) ad.add((gewaehlt.contains(n) ? "☑  " : "☐  ") + n);
            ad.notifyDataSetChanged();
        };
        fuellen.run();

        LinearLayout box = new LinearLayout(act);
        box.setOrientation(LinearLayout.VERTICAL);
        int p = (int) (16 * act.getResources().getDisplayMetrics().density);
        box.setPadding(p, p / 2, p, 0);
        final EditText suche = new EditText(act);
        suche.setHint("Suchen");
        suche.setSingleLine(true);
        box.addView(suche);
        final ListView lv = new ListView(act);
        lv.setAdapter(ad);
        box.addView(lv, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, (int) (360 * act.getResources().getDisplayMetrics().density)));
        lv.setOnItemClickListener((parent, view, pos, id) -> {
            if (pos < 0 || pos >= gezeigt.size()) return;
            String n = gezeigt.get(pos);
            if (!gewaehlt.remove(n)) gewaehlt.add(n);
            fuellen.run();
        });
        suche.addTextChangedListener(new TextWatcher() {
            public void beforeTextChanged(CharSequence s, int a, int b, int c) { }
            public void onTextChanged(CharSequence s, int a, int b, int c) { }
            public void afterTextChanged(Editable e) {
                String q = NachrichtenService.norm(e.toString());
                gezeigt.clear();
                for (String n : alle) if (q.isEmpty() || NachrichtenService.norm(n).contains(q)) gezeigt.add(n);
                fuellen.run();
            }
        });

        new AlertDialog.Builder(act, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle("Antworten im Schlafmodus")
                .setView(box)
                .setPositiveButton("Fertig", (d, w) -> {
                    Set<String> neu = new LinkedHashSet<>();
                    for (String n : gewaehlt) neu.add(NachrichtenService.norm(n));
                    for (String b : bisher) {   // von Hand genannte Namen, die in den Kontakten nicht vorkommen, bleiben erhalten
                        boolean inKontakten = false;
                        for (String n : alle) if ((" " + NachrichtenService.norm(n) + " ").contains(" " + b + " ")) { inKontakten = true; break; }
                        if (!inKontakten) neu.add(b);
                    }
                    Prefs.setErlaubt(act, android.text.TextUtils.join("\n", neu));
                })
                .setNegativeButton("Abbrechen", null)
                .show();
    }
}
