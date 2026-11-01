/* ============================================================
   TESTS: "Finde etwas Ähnliches" / "Such das mit Google Lens": das Foto geht an Google Lens (Jarvis-App, ZaneNative.lensSuchen).
   Start: node tests/foto_lens.js. Echte Module (fotosenden.js, photo.js, die ganze Befehls-Kette), Attrappe für die Handy-App-Brücke.
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('FEHLER: ' + name + (info ? '  → ' + info : '')); }
const pause = ms => new Promise(r => setTimeout(r, ms));

/* native: 'neu' = Brücke mit lensSuchen, 'alt' = Brücke ohne lensSuchen (alte APK), 'fehler' = lensSuchen liefert false, 'browser' = keine Brücke */
function neu(native, o) {
    o = o || {};
    const aufrufe = [];
    let brueke;
    if (native === 'neu') brueke = { lensSuchen: d => { aufrufe.push(d); return true; }, shareImage: () => true };
    else if (native === 'fehler') brueke = { lensSuchen: d => { aufrufe.push(d); return false; }, shareImage: () => true };
    else if (native === 'alt') brueke = { shareImage: () => true };
    const A = starte({ jetzt: '2026-10-28T10:00:00+01:00', festerZufall: true, native: brueke || false, fetch: async u => { throw new Error('offline (Attrappe): ' + u); } });
    A.lens = aufrufe;
    if (o.foto !== false) A.vm.runInContext("lastPhoto = { dataUrl: 'data:image/jpeg;base64,QUJD', at: Date.now() - " + (o.alterMs || 0) + ", text: '' };", A.sb);
    A.sag = async t => { const g1 = A.gesagt.length; const x = await A.satz(t); await pause(80); return { x, text: A.gesagt.slice(g1).join(' | ') }; };
    return A;
}

(async () => {
    for (const s of ['Finde etwas Ähnliches', 'Such mir was Ähnliches', 'Finde ähnliche Produkte', 'Such das mit Google Lens', 'Google Lens', 'Zeig mir etwas Ähnliches dazu']) {
        const A = neu('neu'); const a = await A.sag(s);
        check('1 "' + s + '" → Foto geht an Google Lens', A.lens.length === 1 && A.lens[0] === 'data:image/jpeg;base64,QUJD' && /Google Lens öffnet sich/.test(a.text), JSON.stringify(A.lens) + ' | ' + a.text + ' | ' + a.x.modul);
    }
    {   const A = neu('neu', { foto: false }); const a = await A.sag('Finde etwas Ähnliches');
        check('2a ohne Foto: Lens wird nicht aufgerufen', A.lens.length === 0, a.text); }
    {   const A = neu('neu', { alterMs: 11 * 60000 }); const a = await A.sag('Finde etwas Ähnliches');
        check('2b Foto älter als 10 Minuten: "Finde etwas Ähnliches" geht nicht an Lens', A.lens.length === 0, a.text + ' | ' + a.x.modul); }
    {   const A = neu('neu'); 
        for (const s of ['Such ähnliche Lieder wie Helene Fischer', 'Finde ähnliche Filme wie Matrix', 'Such mir ein ähnliches Rezept']) {
            const a = await A.sag(s);
            check('3 "' + s + '" ist keine Foto-Suche', A.lens.length === 0, a.text + ' | ' + a.x.modul);
        } }
    {   const A = neu('alt'); const a = await A.sag('Finde etwas Ähnliches');
        check('4 alte APK ohne lensSuchen: ehrlicher Hinweis auf die neue Version', /neue Jarvis-App/.test(a.text), a.text); }
    {   const A = neu('fehler'); const a = await A.sag('Finde etwas Ähnliches');
        check('5 Übergabe schlägt fehl: keine falsche Erfolgsmeldung', A.lens.length === 1 && /nicht an Google Lens übergeben/.test(a.text) && !/öffnet sich/.test(a.text), a.text); }
    {   const A = neu('browser'); const a = await A.sag('Finde etwas Ähnliches');
        check('6 Browser ohne App: sagt, dass es nur in der Jarvis-App geht', /nur aus der Jarvis-App/.test(a.text), a.text); }
    /* Karte in der Foto-Auswahl, WhatsApp bleibt */
    {   const A = neu('neu');
        let karten = null;
        A.sb.__spion = c => { karten = c; };
        // innerste Stufe der Kette ersetzen: alle Karten, die ankommen, merken
        const kette = A.sb.jvFotoKette;
        A.vm.runInContext("window.__orig = window.showActionCards;", A.sb);
        A.vm.runInContext("window.showActionCards({ length: 0 });", A.sb);
        A.vm.runInContext("window.showActionCards([{ icon: 'x', title: 'Beschreiben', onclick: \"runLastPhotoTask('describe')\" }])", A.sb);
        const vorhanden = A.vm.runInContext("typeof jvFotoSenden === 'object' && typeof jvFotoSenden.lens === 'function'", A.sb);
        check('7a jvFotoSenden.lens ist da', vorhanden);
    }
    /* WhatsApp-Senden und die übrigen Foto-Sätze bleiben */
    {   const A = neu('neu'); const a = await A.sag('Schick das Foto per WhatsApp');
        check('8 "Schick das Foto per WhatsApp" geht weiter an WhatsApp, nicht an Lens', A.lens.length === 0 && /WhatsApp öffnet sich/.test(a.text), a.text); }
    {   const A = neu('neu'); const a = await A.sag('Beschreibe das');
        check('9 "Beschreibe das" ist keine Lens-Suche', A.lens.length === 0, a.text); }
    console.log(`FOTO-LENS: ${ok} Prüfungen in Ordnung, ${fehler} Fehler`);
    process.exit(fehler ? 1 : 0);
})();
