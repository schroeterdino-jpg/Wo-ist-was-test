/* ============================================================
   SATZTEST: Sprachbefehl "Satztest". Prüft typische Sätze und zeigt ✓/✗ im Fenster:
   - Namen-Korrektur (Alicia -> Alyssa, Neu-Galliner-Ring ...): rein rechnerisch, löst nichts aus
   - "Lagebild" öffnen/schließen: läuft wirklich durch die Befehlsliste, das Lagebild geht kurz auf und wieder zu
   Hinweis: Sätze wie "Route zu Alyssa" gehen an die KI; die kann der Test nicht gefahrlos auslösen, hier wird nur der Name geprüft.
   ============================================================ */
(function () {
    'use strict';
    const FAELLE = [
        ['Route zu Alicia', 'Route zu Alyssa'],
        ['Wo wohnt Alicia', 'Wo wohnt Alyssa'],
        ['Route zum Neu Galina Ring 6', 'Route zum Neu-Galliner-Ring 6'],
        ['Neugarliner Ring', 'Neu-Galliner-Ring'],
        ['Penny in Schwarzenbeck', 'Penny in Schwarzenbek'],
        ['Familie Schröter', 'Familie Schroeter'],
        ['Route zu Alyssa', 'Route zu Alyssa']
    ];
    const pause = ms => new Promise(r => setTimeout(r, ms));

    async function lauf() {
        const z = [];
        try {
            const fest = window.jvFestnamen;
            if (typeof fest !== 'function') z.push({ ok: false, text: 'Namen-Liste fehlt (festnamen.js)' });
            else FAELLE.forEach(([ein, soll]) => {
                const aus = fest(ein);
                z.push({ ok: aus === soll, text: ein + (aus === soll ? '' : ' → ' + aus) });
            });
        } catch (e) { z.push({ ok: false, text: 'Namen-Test Fehler' }); }
        try {
            const h = window.handleLocalCommand;
            if (typeof h !== 'function' || !window.jvLage) z.push({ ok: false, text: 'Lagebild-Befehl: nicht geladen' });
            else {
                const a = !!h('Lagebild');
                await pause(400);
                const offen = !!(window.jvLage.isOpen && window.jvLage.isOpen());
                z.push({ ok: a && offen, text: '„Lagebild“ öffnet' + (a && offen ? '' : ' NICHT') });
                const b = !!h('Lagebild schließen');
                await pause(300);
                const zu = !(window.jvLage.isOpen && window.jvLage.isOpen());
                z.push({ ok: b && zu, text: '„Lagebild schließen“' + (b && zu ? '' : ' geht NICHT') });
                try { if (window.jvLage.isOpen()) window.jvLage.close(); window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {}
            }
        } catch (e) { z.push({ ok: false, text: 'Befehls-Test Fehler' }); }
        return z;
    }

    async function zeigeTest() {
        const z = await lauf();
        const bad = z.filter(r => !r.ok);
        if (window.jvPanel) window.jvPanel.zeigen({ titel: 'SATZTEST', zeit: bad.length ? bad.length + ' FEHLER' : 'ALLES OK', zeilen: z.map(r => ({ ok: r.ok, text: r.text })), sek: 20 });
        try {
            const s = bad.length ? 'Satztest: ' + bad.length + (bad.length === 1 ? ' Fehler' : ' Fehler') + ', die Einzelheiten stehen im Fenster.' : 'Satztest bestanden. Alle ' + z.length + ' Prüfungen in Ordnung.';
            speak(s, typeof continueConversation === 'function' ? continueConversation : undefined);
        } catch (e) {}
    }
    window.runSatztest = zeigeTest;

    if (window.jvCommands) {
        window.jvCommands.use('satztest', function (text, next) {
            const t = String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
            if (t.length < 40 && /^(?:jarvis )?(?:(?:mach|starte|führe)\w* )?(?:den |einen )?(?:satztest|sätze testen|satz test)(?: durch| bitte)*$/.test(t)) { zeigeTest(); return true; }
            return next(text);
        }, 20);
    }
})();
