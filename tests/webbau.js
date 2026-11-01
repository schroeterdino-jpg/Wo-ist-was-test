/* ============================================================
   WEBSITE-BAUER (Start: node tests/webbau.js)
   Prüft ohne Browser: Satz-Erkennung (Suche / Name), Öffnungszeiten-Umwandlung, Vorlagen (alle 3 Arten, Links tel/WhatsApp/Route, Entschärfung von HTML),
   Server liefert "website" (Feld in der Google-Abfrage, neuer Zwischenspeicher-Schlüssel), Skripte in index.html in richtiger Reihenfolge, Tour- und Hilfe-Eintrag.
   Es werden keine Dateien verändert.
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
let ok = 0, fehler = 0;
function check(n, c, extra) { if (c) ok++; else { fehler++; console.log('FEHLER: ' + n + (extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 300) : '')); } }
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const win = { jvCommands: { use() { } }, addEventListener() { } };
const ctx = vm.createContext({ window: win, document: { getElementById: () => null, createElement: () => ({}), head: {}, body: {} }, navigator: {}, console, setTimeout, clearTimeout, speak() { }, apiFetch() { }, Date });
vm.runInContext(rd('js/webbau_vorlagen.js'), ctx);
vm.runInContext(rd('js/webbau.js'), ctx);
const W = win.jvWebbau, seite = win.jvWebSeite;

/* 1 Erkennung */
const e = t => W.erkenne(t);
check('Suche: Friseur ohne Website', (e('Finde einen Friseur ohne Website') || {}).modus === 'suche' && e('Finde einen Friseur ohne Website').art === 'friseur');
check('Suche: Café ohne Homepage', (e('Such ein Café ohne Homepage und bau ihm eine') || {}).art === 'cafe');
check('Suche: Elektriker ohne Webseite = handwerk', (e('Finde einen Elektriker ohne Webseite') || {}).art === 'handwerk');
const n = e('Bau eine Website für Haarwerk Linde');
check('Name: Bau eine Website für Haarwerk Linde', n && n.modus === 'name' && n.name === 'Haarwerk Linde', n);
check('Kein Treffer ohne Website-Wort', e('Finde einen Friseur') === null && e('Wie wird das Wetter') === null);
check('Kein Treffer: nur Frage nach Website', e('Hat der Friseur eine Website') === null);

/* 2 Zeiten */
const z = W.zeiten('Mo-Fr 09:00-18:00; Sa 08:00-13:00; So off');
check('Zeiten: Montag bis Freitag 9 – 18 Uhr', z[0][0] === 'Montag bis Freitag' && z[0][1] === '9 – 18 Uhr', z);
check('Zeiten: Samstag, Sonntag geschlossen', z[1][0] === 'Samstag' && z[2][1] === 'geschlossen', z);
check('Zeiten: leer bleibt leer', W.zeiten('').length === 0);

/* 3 Vorlagen */
for (const art of ['friseur', 'cafe', 'handwerk']) {
    const h = seite({ art, name: 'Test <b>X</b>', ort: 'Ort', tel: '04151 123456', kopf: 'A|B', unter: '<script>alert(1)</script>', szenen: [{ klein: 'k', titel: 'T|U', text: 't' }, { klein: 'k', titel: 'T', text: 't' }, { klein: 'k', titel: 'T', text: 't' }], leistungen: [['L', 'auf Anfrage']], zeiten: [['Montag', '9 – 18 Uhr']] });
    check(art + ': eine vollständige Seite mit tel:-Link und Route', /^<!doctype html>/.test(h) && h.includes('href="tel:04151123456"') && h.includes('google.com/maps/search'), h.slice(0, 80));
    check(art + ': HTML aus Texten wird entschärft', !h.includes('<b>X</b>') && !h.includes('<script>alert') && h.includes('&lt;b&gt;X'));
    check(art + ': genau ein eigenes Skript, kein fremdes Netz', (h.match(/<script/g) || []).length === 1 && !/https?:\/\/(?!www\.google\.com\/maps|wa\.me)/.test(h.replace(/<style>.*<\/style>/s, '')));
}
check('WhatsApp nur bei Handynummer', seite({ art: 'cafe', name: 'A', tel: '0171 1234567' }).includes('wa.me/491711234567') && !seite({ art: 'cafe', name: 'A', tel: '04151 123456' }).includes('wa.me'));
check('Ohne Telefon: kein tel:-Link, Seite trotzdem fertig', !seite({ art: 'handwerk', name: 'A' }).includes('tel:'));
check('Entwurf-Hinweis (Impressum fehlt) steht in der Seite', seite({ art: 'friseur', name: 'A' }).includes('Impressum und Datenschutzerklärung fehlen'));

/* 4 Server + Einbindung + Doku */
const maps = rd('api/maps.js');
check('Server: Feld places.websiteUri, Ausgabe "website", neuer Zwischenspeicher-Schlüssel (alte Treffer hatten kein Feld)', maps.includes('places.websiteUri') && /o\.website = p\.websiteUri/.test(maps) && maps.includes("'gmaps:places2:'"));
const idx = rd('index.html');
const i1 = idx.indexOf('js/webbau_vorlagen.js'), i2 = idx.indexOf('js/webbau.js');
check('index.html: Vorlagen vor webbau.js, je einmal', i1 > 0 && i2 > i1 && idx.split('js/webbau.js').length === 2);
check('Tour (anleitung.js) und Hilfe (help.js) haben den Eintrag webbau', /h: "webbau"/.test(rd('js/anleitung.js')) && /key: 'webbau'/.test(rd('js/help.js')));
check('Ohne Veröffentlichung: webbau.js ruft kein Hosting und keinen Versand', !/\/api\/(deploy|mail|send)/.test(rd('js/webbau.js')));

console.log(fehler ? fehler + ' Fehler, ' + ok + ' ok' : 'webbau: alle ' + ok + ' Prüfungen ok');
process.exit(fehler ? 1 : 0);
