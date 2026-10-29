/* ============================================================
   SPRACHE-SICHERHEITSNETZ (Phase 4, Schritt 1). Start: node tests/sprache.js        (Soll neu schreiben: node tests/sprache.js --schreiben)
   Friert den HEUTIGEN Zustand der Sprachausgabe ein, BEVOR jemand sie umbaut. Ändert keine Produktdatei. Soll: tests/sprache_soll.json.
   Anders als tests/reihenfolge.js (dort steht unten in der Kette ein Aufzeichner statt voice.js) läuft hier der ECHTE Code von voice.js bis zu den Attrappen:
     SpeechSynthesis (Handy-Stimme), Audio (Cloud-Stimme), Netz (Cloud-Anfrage /api/stau?tts=1), Töne (audio.js), Anzeige (setHudSubtitle, updateTerminalStream, setIdleUi).
   Festgehalten wird je Probe, in der Reihenfolge des Auftretens: endgültiger Text an der Stimme, Tempo, Cloud-Anfrage-Text, Töne, Abbruch, Anzeige, onComplete, Rückgabe, Fehler.
   A. Inventar: welche Dateien greifen in speak/speakBrowser/speakAck/speakAckBrowser/fetchCloudSpeechBlob/getTtsEngine/speechSynthesis/Audio ein (neue, unbekannte Eingriffe machen den Test rot).
   B. Wirkung: die Proben sind eingefroren (Soll). Randomness und Uhr sind fest.
   C. Vertauschungen: Paare von Skripten werden in der Ladereihenfolge getauscht; das Ergebnis (identisch / verändert / bricht) ist ebenfalls eingefroren.
   D. mehrfach.js: der vorübergehende Austausch von window.speak (Erfolg, Fehler, später Sprecher, Rückgabewert Promise, fremder Austausch im Fenster).
   E. Gegenproben im Speicher (nie auf der Platte): Wrapper entfernt, Text manipuliert, Rückbau in mehrfach.js zerstört, Unterdrückung verändert.
   Hinweis zur Treue: In einem echten Browser läuft pronunciation.js erst bei DOMContentLoaded (nach ALLEN Skripten, also ganz außen für speakBrowser, speakAckBrowser,
   fetchCloudSpeechBlob). Die Attrappen-Seite kennt dieses Ereignis nicht; hier wird der Rückruf von pronunciation.js deshalb gezielt nach dem Laden ausgelöst (nur dieser eine).
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path');
const { starte, lies } = require('./umgebung.js');

const SOLL_DATEI = path.join(__dirname, 'sprache_soll.json');
const SCHREIBEN = process.argv.includes('--schreiben');
let ok = 0, fehler = 0;
function check(name, bedingung, info) { if (bedingung) ok++; else { fehler++; console.log('FEHLER: ' + name + (info ? '  → ' + info : '')); } }
const JS = x => JSON.stringify(x);
const kurz = (s, n) => String(s == null ? '' : s).replace(/⁣/g, '<MARKE>').replace(/\n/g, '\\n').slice(0, n || 120);
const tausche = (a, b) => l => { const x = l.indexOf(a), y = l.indexOf(b); if (x < 0 || y < 0) return l; l[x] = b; l[y] = a; return l; };

/* Die dauerhaften Eingriffe in die Sprachausgabe. Wer hier fehlt oder dazukommt, macht Teil A rot. */
const ERWARTETE_EINGRIFFE = {
    'speak': ['voice.js (Basis)', 'voicefix.js', 'sprueche.js', 'toene.js', 'fish.js', 'kontext_lokal.js', 'teilen.js', 'mehrfach.js (nur vorübergehend)'],
    'speakBrowser': ['voice.js (Basis)', 'fish.js', 'pronunciation.js'],
    'speakAck': ['voice.js (Basis)', 'voicefix.js', 'fish.js'],
    'speakAckBrowser': ['voice.js (Basis)', 'pronunciation.js'],
    'fetchCloudSpeechBlob': ['voice.js (Basis)', 'fish.js', 'pronunciation.js'],
    'getTtsEngine': ['voice.js (Basis)', 'fish.js'],
    'startThinkingSound': ['audio.js (Basis)', 'voicefix.js'],
    'speechSynthesis.speak': ['speechrate.js'],
    'Audio': ['speechrate.js']
};

/* ---------------- Welt mit echter Sprachkette und Attrappen unten ---------------- */
function welt(extra) {
    extra = extra || {};
    const log = [], st = { sb: null, datei: '', dom: [], spricht: false, wirft: false, cloud: 'aus', haengt: false };
    const L = o => log.push(o);
    const stimme = { name: 'Testfrau', lang: 'de-DE', voiceURI: 'test-de', localService: true, default: true };
    function installiere(sb) {
        sb.SpeechSynthesisUtterance = function (text) { this.text = String(text); this.addEventListener = function () { }; };
        sb.speechSynthesis = {
            get speaking() { return st.spricht; }, pending: false, onvoiceschanged: null, getVoices: () => [stimme],
            speak(u) {
                if (st.wirft) throw new Error('Stimme kaputt (Attrappe)');
                L({ a: 'tts', t: u.text, rate: u.rate, pitch: u.pitch, lang: u.lang, stimme: u.voice && u.voice.name, z: st.w ? st.w.uhr.ms : 0 });
                if (!st.haengt) sb.setTimeout(() => { try { u.onend && u.onend(); } catch (e) { } }, 5);
            },
            cancel() { L({ a: 'abbruch' }); },
            addEventListener() { }
        };
        sb.Audio = function (src) {
            const o = { src: String(src || '').slice(0, 40), playbackRate: 1, defaultPlaybackRate: 1, paused: false, ended: false, preservesPitch: true,
                pause() { L({ a: 'audio-pause' }); }, play() { L({ a: 'audio-play', r: o.playbackRate }); sb.setTimeout(() => { try { o.onended && o.onended(); } catch (e) { } }, 5); return Promise.resolve(); },
                addEventListener() { }, removeEventListener() { }, load() { } };
            L({ a: 'audio-neu', s: o.src.replace(/blob:.*/, 'blob:…') });
            return o;
        };
        const orig = sb.document.addEventListener;
        sb.document.addEventListener = function (t, fn) { if (st.datei === 'pronunciation.js' && t === 'DOMContentLoaded') { st.dom.push(fn); return; } return orig.apply(this, arguments); };
    }
    const opt = Object.assign({
        festerZufall: true, echtesSpeak: true,
        fetch: async (u) => {
            const s = String(u);
            if (!/[?&]tts=1/.test(s)) return { ok: false, status: 503, async blob() { return null; }, async json() { return {}; }, async text() { return ''; } };   // Hintergrund-Abrufe der App (Gedächtnis, Seite) gehören nicht zur Sprache
            const m = /[?&]text=([^&]*)/.exec(s), v = /[?&]voice=([^&]*)/.exec(s), e = /[?&]engine=([^&]*)/.exec(s);
            L({ a: 'cloud', t: m ? decodeURIComponent(m[1]) : s.slice(0, 60), voice: v ? decodeURIComponent(v[1]).slice(0, 20) : '', engine: e ? e[1] : '' });
            if (st.cloud === 'ok') return { ok: true, status: 200, async blob() { return new Blob(['stimme']); } };
            return { ok: false, status: 503, async blob() { return null; }, async json() { return {}; }, async text() { return ''; } };
        },
        quelleAendern: (f, q) => { st.datei = f; if (f === 'pronunciation.js' && st.sb) st.sb.document.readyState = 'loading'; return extra.quelleAendern ? extra.quelleAendern(f, q) : q; },
        nachSkript: (f, sb) => {
            if (!st.sb) { st.sb = sb; installiere(sb); }
            if (f === 'pronunciation.js') sb.document.readyState = undefined;
            if (extra.nachSkript) extra.nachSkript(f, sb);
        }
    }, extra.opt || {});
    const w = starte(opt);
    w.st = st; st.w = w; w.log = log; w.L = L;
    const sb = w.sb;
    // Töne und Anzeige aufzeichnen (rufen die Originale weiter auf)
    sb.playSuccessSound = () => L({ a: 'ton', k: 'erfolg' }); sb.playErrorSound = () => L({ a: 'ton', k: 'fehler' }); sb.playAlertSound = () => L({ a: 'ton', k: 'warnung' });
    ['setHudSubtitle', 'updateTerminalStream', 'setIdleUi'].forEach(n => {
        const o = sb[n]; if (typeof o !== 'function') return;
        sb[n] = function () { L({ a: 'anzeige', f: n, x: kurz(arguments[0], 50) }); return o.apply(this, arguments); };
    });
    if (!extra.ohneDom) st.dom.forEach(fn => { try { fn(); } catch (e) { w.ladefehler.push('pronunciation DOMContentLoaded: ' + e.message); } });
    return w;
}

function fmt(e, t0) {
    switch (e.a) {
        case 'tts': return 'TTS "' + kurz(e.t, 160) + '" rate=' + (e.rate == null ? '-' : +(+e.rate).toFixed(2)) + ' lang=' + e.lang + (t0 != null ? ' @+' + (e.z - t0) + 'ms' : '');
        case 'cloud': return 'CLOUD "' + kurz(e.t, 160) + '" ' + (e.engine ? 'engine=' + e.engine : '');
        case 'ton': return 'TON ' + e.k;
        case 'abbruch': return 'ABBRUCH';
        case 'anzeige': return 'ANZEIGE ' + e.f + '(' + e.x + ')';
        case 'audio-neu': return 'AUDIO neu ' + e.s;
        case 'audio-play': return 'AUDIO play rate=' + e.r;
        case 'audio-pause': return 'AUDIO pause';
        default: return e.a + ' ' + JS(e);
    }
}

async function zuruecksetzen(w, engine) {
    const sb = w.sb;
    w.setze('ttsCloudFailCount', 0); w.setze('ackActive', false); w.setze('currentUtterance', null); w.setze('currentAudio', null); w.setze('currentAckAudio', null);
    w.st.spricht = false; w.st.wirft = false; w.st.haengt = false; w.st.cloud = 'aus';
    sb.setTtsEngine(engine || 'browser');
    w.uhr.ms += 4000;   // virtuelle Zeit weiter: Wiederholungs-Sperren (3 s) und Ton-Sperren (1,5 s) laufen ab
}

/* ---------------- Proben ---------------- */
function mitZufall(w, wert, fn) { const alt = w.sb.Math.random; w.sb.Math.random = () => wert; return Promise.resolve().then(fn).finally(() => { w.sb.Math.random = alt; }); }
const SP = (w, ...a) => { try { const r = w.sb.speak(...a); return 'ret=' + (r === undefined ? 'undefined' : typeof r); } catch (e) { return 'FEHLER ' + e.constructor.name + ': ' + kurz(e.message, 60); } };

const PROBEN = [
    ['kurz', 'browser', async w => SP(w, 'Okay.')],
    ['preis+gedankenstrich', 'browser', async w => SP(w, 'Das kostet 12,99 € – ein günstiger Preis')],
    ['dezimalpreis tanken', 'browser', async w => SP(w, 'Diesel kostet aktuell 2,183 bei Aral, das ist günstig.')],
    ['strassen-grammatik', 'browser', async w => SP(w, 'Du wohnst in der Hans-Dewitz-Ring und gehst in die Gartenweg.')],
    ['alyssa+datum+abkuerzung', 'browser', async w => SP(w, 'Alyssa hat am 3.11.2026 Geburtstag, z.B. mit 50 Gästen im Jahr 2026.')],
    ['markdown-zeichen', 'browser', async w => SP(w, 'Das ist **fett** und `Code` und #Titel')],
    ['ton erfolg', 'browser', async w => SP(w, 'Das hat geklappt!')],
    ['ton fehler', 'browser', async w => SP(w, 'Das hat leider nicht geklappt.')],
    ['ton warnung', 'browser', async w => SP(w, 'Achtung, das ist ein Alarm: der Akku ist fast leer.')],
    ['ton nicht bei fremdsprache', 'browser', async w => SP(w, 'Das hat geklappt!', undefined, 'tr-TR')],
    ['dolmetscher', 'browser', async w => SP(w, 'Merhaba, nasılsın?', undefined, 'tr-TR')],
    ['onComplete+rueckgabe', 'browser', async w => { let n = 0; const r = SP(w, 'Fertig gesprochen.', () => { n++; w.L({ a: 'oncomplete' }); }); await w.vorspulen(100); return r + ' onComplete=' + n; }],
    ['spruch (zufall 0.01)', 'browser', async w => mitZufall(w, 0.01, async () => SP(w, 'Das hat geklappt, ich habe es eingetragen.'))],
    ['spruch wiederholt (zufall 0.01)', 'browser', async w => mitZufall(w, 0.01, async () => { SP(w, 'Das hat geklappt, ich habe es eingetragen.'); w.uhr.ms += 500; return SP(w, 'Das hat geklappt, ich habe es eingetragen.'); })],
    ['teilen merkt lange antwort', 'browser', async w => { SP(w, 'Das ist eine längere Antwort mit mehr als vierzig Zeichen für das Teilen.'); return 'teilen=' + kurz(w.sb.jvTeilen.letzte(), 90); }],
    ['teilen merkt kurze nicht', 'browser', async w => { SP(w, 'Das ist eine längere Antwort mit mehr als vierzig Zeichen für das Teilen.'); SP(w, 'Okay.'); return 'teilen=' + kurz(w.sb.jvTeilen.letzte(), 90); }],
    ['kontext_lokal verlauf', 'browser', async w => {
        const vor = (w.lese('chatHistory') || []).length;
        await w.lassLaufen(() => w.sb.handleLocalCommand('Wie spät ist es in Tokio?'));
        const h = w.lese('chatHistory') || [];
        return 'verlauf+' + (h.length - vor) + (h.length > vor ? ' letzter=' + kurz(h[h.length - 1].content, 80) : '');
    }],
    ['teilen sieht text mit korrektur', 'browser', async w => { SP(w, 'Du wohnst in der Hans-Dewitz-Ring und das kostet 12,99 € – ein guter Preis für dich.'); return 'teilen=' + kurz(w.sb.jvTeilen.letzte(), 120); }],
    ['kontext_lokal sieht text der antwort', 'browser', async w => {
        w.sb.jvCommands.use('zz_test_antwort', (t, next) => /zz kontext test/.test(String(t).toLowerCase()) ? (w.sb.speak('Der Preis liegt bei 12,99 € – wirklich günstig, ganz ehrlich.'), true) : next(t), 1000);
        const vor = (w.lese('chatHistory') || []).length;
        await w.lassLaufen(() => w.sb.handleLocalCommand('zz kontext test'));
        const h = w.lese('chatHistory') || [];
        w.sb.jvCommands.remove && w.sb.jvCommands.remove('zz_test_antwort');
        return 'verlauf+' + (h.length - vor) + (h.length > vor ? ' letzter=' + kurz(h[h.length - 1].content, 110) : '');
    }],
    ['zwischenansage fish-engine', 'fish', async w => { w.sb.speakAck('Einen Moment.'); return 'ack'; }],
    ['cloud fish mit spruch (zufall 0.01)', 'fish', async w => mitZufall(w, 0.01, async () => SP(w, '2 Termine eingetragen.'))],
    ['cloud edge mit spruch (zufall 0.01)', 'edge', async w => mitZufall(w, 0.01, async () => SP(w, '2 Termine eingetragen.'))],
    ['browser mit spruch (zufall 0.01)', 'browser', async w => mitZufall(w, 0.01, async () => SP(w, '2 Termine eingetragen.'))],
    ['cloud edge: anfrage dann ersatzstimme', 'edge', async w => SP(w, 'Das kostet 12,99 € – ein günstiger Preis.')],
    ['cloud edge: zweimal gescheitert, dann ohne cloud', 'edge', async w => { SP(w, 'Erste Antwort.'); await w.vorspulen(200); SP(w, 'Zweite Antwort.'); await w.vorspulen(200); return SP(w, 'Dritte Antwort.') + ' fail=' + w.lese('ttsCloudFailCount'); }],
    ['cloud fish: anfrage dann ersatzstimme', 'fish', async w => SP(w, 'Es ist 21 Uhr 40. Das kostet 2,18 Euro.')],
    ['cloud ok edge: audio statt stimme', 'edge', async w => { w.st.cloud = 'ok'; return SP(w, 'Cloud-Stimme klappt.'); }],
    ['cloud ok fish: audio statt stimme', 'fish', async w => { w.st.cloud = 'ok'; return SP(w, 'Cloud-Stimme klappt.'); }],
    ['zwischenansage browser', 'browser', async w => { w.sb.speakAck('Einen Moment, Sir. Das kostet 2,5 Grad.'); return 'ack'; }],
    ['zwischenansage unterdrueckt waehrend sprechen', 'browser', async w => { w.st.haengt = true; SP(w, 'Ich rede gerade.'); w.sb.speakAck('Einen Moment.'); return 'ack unterdrückt, speaking=' + w.sb.isSpeaking(); }],
    ['zwischenansage + onComplete unterdrueckt', 'browser', async w => { w.st.haengt = true; SP(w, 'Ich rede gerade.'); let n = 0; w.sb.speakAck('Einen Moment.', () => { n++; }); return 'onComplete=' + n; }],
    ['antwort nach zwischenansage (wartet bis 2 s)', 'browser', async w => {
        w.setze('ackActive', true); w.st.spricht = true;
        const r = SP(w, 'Hier die eigentliche Antwort.');
        return r + ' (Zwischenansage läuft, Stimme meldet speaking=true)';
    }],
    ['antwort ohne zwischenansage (wartet nicht)', 'browser', async w => { w.st.spricht = true; return SP(w, 'Sofort sprechen.'); }],
    ['neue ansage bricht laufende ab', 'browser', async w => { w.st.haengt = true; SP(w, 'Erste lange Ansage.'); w.st.spricht = true; return SP(w, 'Zweite Ansage.'); }],
    ['nicht-text: undefined', 'browser', async w => SP(w, undefined)],
    ['nicht-text: zahl', 'browser', async w => SP(w, 12345)],
    ['stimme wirft', 'browser', async w => { w.st.wirft = true; return SP(w, 'Das geht schief.'); }],
    ['interruptSpeaking', 'browser', async w => { w.st.haengt = true; SP(w, 'Lange Ansage.'); w.sb.interruptSpeaking(); return 'spricht=' + w.sb.isSpeaking(); }]
];

async function messeProben(w) {
    const erg = [];
    for (const [label, engine, fn] of PROBEN) {
        await zuruecksetzen(w, engine);
        w.log.length = 0;
        const t0 = w.uhr.ms;
        let r; try { r = await fn(w); } catch (e) { r = 'HARNESS-FEHLER ' + kurz(e.message, 80); }
        await w.vorspulen(3000);
        erg.push(label + ' | ' + kurz(r, 160) + ' || ' + w.log.map(e => fmt(e, /wartet/.test(label) ? t0 : null)).join(' ; '));
    }
    return erg;
}

/* ---------------- Inventar (A) ---------------- */
function inventar() {
    const dateien = fs.readdirSync(path.join(__dirname, '..', 'js')).filter(f => f.endsWith('.js'));
    const treffer = {};
    const add = (k, f) => { (treffer[k] = treffer[k] || new Set()).add(f); };
    const muster = [
        ['speak', /^\s*(?:window\.)?speak\s*=(?!=)/m],
        ['speakBrowser', /^\s*(?:window\.)?speakBrowser\s*=(?!=)/m],
        ['speakAck', /^\s*(?:window\.)?speakAck\s*=(?!=)/m],
        ['speakAckBrowser', /^\s*(?:window\.)?speakAckBrowser\s*=(?!=)/m],
        ['fetchCloudSpeechBlob', /^\s*(?:window\.)?fetchCloudSpeechBlob\s*=(?!=)/m],
        ['getTtsEngine', /^\s*(?:window\.)?getTtsEngine\s*=(?!=)/m],
        ['startThinkingSound', /^\s*(?:if \([^)]*\) )?(?:window\.)?startThinkingSound\s*=(?!=)/m],
        ['speechSynthesis.speak', /\b(?:synth|speechSynthesis)\.speak\s*=(?!=)/],
        ['Audio', /window\.Audio\s*=(?!=)/]
    ];
    const basis = { 'speak': /function speak\(/, 'speakBrowser': /function speakBrowser\(/, 'speakAck': /function speakAck\(/, 'speakAckBrowser': /function speakAckBrowser\(/, 'fetchCloudSpeechBlob': /function fetchCloudSpeechBlob\(/, 'getTtsEngine': /function getTtsEngine\(/, 'startThinkingSound': /function startThinkingSound\(/ };
    for (const f of dateien) {
        const q = lies('js/' + f).split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
        for (const [k, re] of muster) if (re.test(q)) add(k, f);
        for (const k of Object.keys(basis)) if (basis[k].test(q)) add(k, f + ' (Basis)');
    }
    const aus = {};
    for (const k of Object.keys(ERWARTETE_EINGRIFFE)) aus[k] = [...(treffer[k] || [])].map(f => f === 'mehrfach.js' ? 'mehrfach.js (nur vorübergehend)' : f).sort();
    return aus;
}
/* mehrfach.js ersetzt window.speak vorübergehend (kein dauerhafter Eingriff): gesondert aufgeführt */
function temporaer() { return lies('js/mehrfach.js').split('\n').filter(l => /window\.speak\s*=/.test(l)).length; }

const SPEAK_KETTE_DATEIEN = ['voicefix.js', 'sprueche.js', 'toene.js', 'fish.js', 'kontext_lokal.js', 'teilen.js'];
const WEITERE_DATEIEN = ['pronunciation.js', 'speechrate.js'];

(async () => {
    let soll = fs.existsSync(SOLL_DATEI) && !SCHREIBEN ? JSON.parse(fs.readFileSync(SOLL_DATEI, 'utf8')) : null;
    const ist = {};

    console.log('A. Inventar der Eingriffe in die Sprachausgabe');
    ist.inventar = inventar();
    ist.temporaer = temporaer();

    console.log('B. Wirkung (echter Code von voice.js bis zu den Attrappen)');
    const w0 = welt();
    ist.ladefehler = w0.ladefehler.slice();
    ist.proben = await messeProben(w0);
    ist.reihenfolge = ['voice.js', 'pronunciation.js', 'voicefix.js', 'speechrate.js', 'sprueche.js', 'toene.js', 'fish.js', 'kontext_lokal.js', 'teilen.js', 'mehrfach.js'].map(f => f + '@' + (w0.reihenfolge.indexOf(f) + 1));

    console.log('C. Vertauschungen in der Ladereihenfolge');
    ist.vertauschung = {};
    const paare = [];
    const ketteMitVoice = ['voice.js'].concat(SPEAK_KETTE_DATEIEN);
    for (let i = 0; i < ketteMitVoice.length; i++) for (let j = i + 1; j < ketteMitVoice.length; j++) paare.push([ketteMitVoice[i], ketteMitVoice[j]]);
    WEITERE_DATEIEN.forEach(a => ['voicefix.js', 'fish.js', 'voice.js'].forEach(b => paare.push([a, b])));
    paare.push(['pronunciation.js', 'speechrate.js']);
    for (const [a, b] of paare) {
        const w = welt({ opt: { skriptReihenfolge: tausche(a, b) } });
        const r = { ladefehler: w.ladefehler.slice() };
        r.proben = await messeProben(w);
        const geaendert = [];
        r.proben.forEach((p, i) => { if (p !== ist.proben[i]) geaendert.push(p.split(' | ')[0]); });
        ist.vertauschung[a + ' <-> ' + b] = { ergebnis: r.ladefehler.length ? 'bricht' : (geaendert.length ? 'verändert' : 'identisch'), ladefehler: r.ladefehler.map(x => kurz(x, 90)), geaendert, beispiel: geaendert.length ? kurz(r.proben[ist.proben.findIndex(p => p.split(' | ')[0] === geaendert[0])], 400) : '' };
    }

    console.log('D. mehrfach.js: vorübergehender Austausch von window.speak');
    ist.mehrfach = {};
    const FRAGE = 'Wie wird morgen das Wetter und wann ist der nächste Vollmond?';
    async function mehrfachProbe(label, nurErsatz) {
        const w = welt();
        await zuruecksetzen(w, 'browser');
        const sb = w.sb, vor = sb.speak, info = { fenster: [] };
        const echtNur = sb.jvCommands.nur;
        sb.jvCommands.nur = function () { info.fenster.push('speak ersetzt=' + (sb.speak !== vor)); return nurErsatz ? nurErsatz(w, info, vor) : echtNur.apply(this, arguments); };
        w.log.length = 0;
        let ret; try { ret = await w.lassLaufen(() => sb.handleLocalCommand(FRAGE)); } catch (e) { ret = { fehler: kurz(e.message, 60) }; }
        await w.vorspulen(3000);
        ist.mehrfach[label] = { speakDanachGleich: sb.speak === vor, speakDanachIstAndere: sb.speak !== vor && typeof sb.speak === 'function', ret: ret && ret.wert === true ? true : (ret && ret.fehler ? 'FEHLER ' + ret.fehler : (ret && ret.haengt ? 'hängt' : false)), fenster: info.fenster, ereignisse: w.log.filter(e => e.a === 'tts' || e.a === 'abbruch').map(e => fmt(e)) };
        return { w, info, vor };
    }
    await mehrfachProbe('erfolg (echte Teilfragen)', null);
    await mehrfachProbe('fehler im Fenster (nur wirft)', (w, info) => { throw new Error('kaputt (Attrappe)'); });
    await mehrfachProbe('später Sprecher (setTimeout im Fenster)', (w) => { w.sb.speak('sofort gesagt'); w.sb.setTimeout(() => w.sb.speak('Später Sprecher meldet sich.'), 1); return true; });
    await mehrfachProbe('nur gibt Promise zurück', (w) => Promise.resolve(true));
    await mehrfachProbe('fremder Austausch im Fenster', (w, info, vor) => { w.sb.speak = function fremd() { }; return true; });
    const mf = ist.mehrfach;
    check('mehrfach: im Fenster ist window.speak ersetzt', mf['erfolg (echte Teilfragen)'].fenster.length > 0 && mf['erfolg (echte Teilfragen)'].fenster.every(x => x === 'speak ersetzt=true'));
    check('mehrfach: nach Erfolg ist window.speak exakt wieder die alte Funktion', mf['erfolg (echte Teilfragen)'].speakDanachGleich === true);
    check('mehrfach: nach einem Fehler im Fenster ist window.speak exakt wieder die alte Funktion (finally)', mf['fehler im Fenster (nur wirft)'].speakDanachGleich === true);
    check('mehrfach: nach einem späten Sprecher ist window.speak wieder die alte Funktion, der späte Satz wird NICHT gefangen sondern gesprochen', mf['später Sprecher (setTimeout im Fenster)'].speakDanachGleich === true && mf['später Sprecher (setTimeout im Fenster)'].ereignisse.some(x => /Später Sprecher/.test(x)));
    check('mehrfach: ein Promise von nur() gilt als Erfolg mit leerem Fang, window.speak ist wieder da', mf['nur gibt Promise zurück'].speakDanachGleich === true);
    check('mehrfach: ein fremder Austausch von window.speak im Fenster wird beim Rückbau ÜBERSCHRIEBEN (bekannte Eigenschaft: es gewinnt der alte Stand)', mf['fremder Austausch im Fenster'].speakDanachGleich === true);
    check('mehrfach: im Fenster erreicht kein Satz die Stimme (der Fang schluckt sie); das Ergebnis wird danach als EIN Satz gesprochen', mf['erfolg (echte Teilfragen)'].ereignisse.filter(x => /^TTS/.test(x)).length === 1, JS(mf['erfolg (echte Teilfragen)'].ereignisse));
    check('mehrfach: Tests liefen deterministisch ohne Ladefehler', ist.ladefehler.length === 0);

    console.log('E. Gegenproben im Speicher (Produktdateien bleiben unverändert)');
    const ohneRauschen = a => a.map(p => p.split(' | ')[0] + ' | ' + p.split(' | ').slice(1).join(' | '));
    async function gegenprobe(name, extra, erwarteGeaendert) {
        const w = welt(extra);
        const pr = await messeProben(w);
        const geaendert = pr.map((p, i) => p !== ist.proben[i] ? p.split(' | ')[0] : null).filter(Boolean);
        check('Gegenprobe "' + name + '": wird erkannt (Proben weichen ab)', geaendert.length > 0, 'keine Abweichung');
        for (const e of erwarteGeaendert || []) check('Gegenprobe "' + name + '": Probe "' + e + '" weicht ab', geaendert.indexOf(e) >= 0, geaendert.join(' / '));
        console.log('  · ' + name + ' → ' + geaendert.length + ' Probe(n) weichen ab');
        return w;
    }
    await gegenprobe('A: Reihenfolge teilen.js und voicefix.js vertauscht', { opt: { skriptReihenfolge: tausche('teilen.js', 'voicefix.js') } }, ['teilen sieht text mit korrektur']);
    await gegenprobe('A2: Reihenfolge fish.js und kontext_lokal.js vertauscht', { opt: { skriptReihenfolge: tausche('fish.js', 'kontext_lokal.js') } }, ['kontext_lokal sieht text der antwort']);
    await gegenprobe('B: toene.js entfernt', { opt: { ohneSkripte: ['toene.js'] } }, ['ton fehler', 'ton warnung']);
    await gegenprobe('B2: voicefix.js entfernt', { opt: { ohneSkripte: ['voicefix.js'] } }, ['strassen-grammatik', 'zwischenansage unterdrueckt waehrend sprechen']);
    await gegenprobe('B3: fish.js entfernt', { opt: { ohneSkripte: ['fish.js'] } }, ['preis+gedankenstrich']);
    await gegenprobe('B4: teilen.js entfernt', { opt: { ohneSkripte: ['teilen.js'] } }, ['teilen merkt lange antwort']);
    await gegenprobe('C: Text manipuliert (sprueche.js hängt " ZUSATZ" an)', { quelleAendern: (f, q) => f === 'sprueche.js' ? q.replace('return original.apply(this, args);', "if (typeof args[0] === 'string') args[0] += ' ZUSATZ'; return original.apply(this, args);") : q }, ['kurz', 'ton erfolg']);
    await gegenprobe('C2: Text manipuliert (voicefix.js ändert fixStreetGrammar)', { quelleAendern: (f, q) => f === 'voicefix.js' ? q.replace("if (typeof text === 'string') text = fixStreetGrammar(text);", "if (typeof text === 'string') text = fixStreetGrammar(text).replace(/Okay/, 'Gut');") : q }, ['kurz']);
    {
        const w = welt({ quelleAendern: (f, q) => f === 'mehrfach.js' ? q.replace('finally { window.speak = orig; }', 'finally { }') : q });
        const vor = w.sb.speak; await zuruecksetzen(w, 'browser');
        await w.lassLaufen(() => w.sb.handleLocalCommand(FRAGE));
        check('Gegenprobe "D": mit zerstörtem Rückbau bleibt window.speak der Fang (das Sicherheitsnetz erkennt es über speakDanachGleich)', w.sb.speak !== vor);
        check('Gegenprobe "D": die Quell-Ersetzung hat wirklich gegriffen', lies('js/mehrfach.js').indexOf('finally { window.speak = orig; }') >= 0);
    }
    await gegenprobe('E: Unterdrückung verändert (voicefix.js lässt Zwischenansage trotz Sprechen zu)', { quelleAendern: (f, q) => f === 'voicefix.js' ? q.replace("if (typeof isSpeaking === 'function' && isSpeaking()) { if (onComplete) onComplete(); return; }", '') : q }, ['zwischenansage unterdrueckt waehrend sprechen']);
    await gegenprobe('E2: Unterdrückung verändert (toene.js: Ton nie)', { quelleAendern: (f, q) => f === 'toene.js' ? q.replace("typeof getSoundEnabled === 'function' && getSoundEnabled()", 'false') : q }, ['ton fehler']);

    console.log('Prüfungen gegen den eingefrorenen Soll');
    check('Soll-Datei vorhanden (node tests/sprache.js --schreiben legt sie an)', !!soll);
    if (soll) {
        check('Inventar der Eingriffe wie eingefroren', JS(ist.inventar) === JS(soll.inventar), JS(ist.inventar));
        check('Inventar entspricht der erwarteten Liste (neue unbekannte Eingriffe in speak & Co. würden hier auffallen)', JS(ist.inventar) === JS(Object.fromEntries(Object.keys(ERWARTETE_EINGRIFFE).map(k => [k, ERWARTETE_EINGRIFFE[k].slice().sort()]))), JS(ist.inventar));
        check('Ladeposition der Sprach-Dateien wie eingefroren', JS(ist.reihenfolge) === JS(soll.reihenfolge), JS(ist.reihenfolge));
        check('Keine Ladefehler in der Sprach-Welt', ist.ladefehler.length === 0 && soll.ladefehler.length === 0);
        check('Anzahl der Proben wie eingefroren (' + soll.proben.length + ')', ist.proben.length === soll.proben.length);
        ist.proben.forEach((p, i) => check('Probe "' + p.split(' | ')[0] + '" wie eingefroren', p === soll.proben[i], 'ist: ' + kurz(p, 300) + '  soll: ' + kurz(soll.proben[i], 300)));
        Object.keys(soll.vertauschung).forEach(k => {
            const a = ist.vertauschung[k], b = soll.vertauschung[k];
            check('Vertauschung ' + k + ': ' + b.ergebnis + (b.geaendert.length ? ' (' + b.geaendert.length + ' Proben)' : '') + ' wie eingefroren', !!a && a.ergebnis === b.ergebnis && JS(a.geaendert) === JS(b.geaendert) && a.beispiel === b.beispiel, a ? a.ergebnis + ' ' + JS(a.geaendert) : 'fehlt');
        });
        check('Anzahl der Vertauschungen wie eingefroren (' + Object.keys(soll.vertauschung).length + ')', Object.keys(ist.vertauschung).length === Object.keys(soll.vertauschung).length);
        check('mehrfach.js: alle Messungen wie eingefroren', JS(ist.mehrfach) === JS(soll.mehrfach), JS(ist.mehrfach).slice(0, 200));
        check('Zahl der vorübergehenden window.speak-Zuweisungen in mehrfach.js wie eingefroren (' + soll.temporaer + ')', ist.temporaer === soll.temporaer);
    }
    // Fachliche Zusicherungen, unabhängig vom Einfrieren (die wichtigsten Eigenschaften der heutigen Kette)
    const V = ist.vertauschung, ident = k => V[k] && V[k].ergebnis === 'identisch', veraendert = k => V[k] && V[k].ergebnis === 'verändert';
    check('Zusicherung: voicefix, sprueche, toene und fish dürfen in der Ladereihenfolge untereinander getauscht werden (Wirkung identisch)',
        ['voicefix.js <-> sprueche.js', 'voicefix.js <-> toene.js', 'voicefix.js <-> fish.js', 'sprueche.js <-> toene.js', 'sprueche.js <-> fish.js', 'toene.js <-> fish.js'].every(ident));
    check('Zusicherung: kontext_lokal und teilen sehen den Text so, wie er bei ihnen ankommt; wer weiter außen steht, sieht den unveränderten Text (Tausch mit text-ändernden Wrappern verändert Verlauf bzw. Teilen-Text)',
        ['voicefix.js <-> teilen.js', 'sprueche.js <-> teilen.js', 'fish.js <-> teilen.js', 'toene.js <-> teilen.js', 'voicefix.js <-> kontext_lokal.js', 'sprueche.js <-> kontext_lokal.js', 'fish.js <-> kontext_lokal.js', 'toene.js <-> kontext_lokal.js'].every(veraendert));
    check('Zusicherung: pronunciation.js und speechrate.js sind von der Ladereihenfolge gegenüber voicefix und fish unabhängig', ['pronunciation.js <-> voicefix.js', 'pronunciation.js <-> fish.js', 'speechrate.js <-> voicefix.js', 'speechrate.js <-> fish.js', 'pronunciation.js <-> speechrate.js'].every(ident));
    check('Zusicherung: voice.js muss vor allen Wrappern stehen (ein späteres voice.js überschreibt sie)', ['voice.js <-> voicefix.js', 'voice.js <-> sprueche.js', 'voice.js <-> fish.js', 'voice.js <-> teilen.js'].every(veraendert));

    if (SCHREIBEN) { fs.writeFileSync(SOLL_DATEI, JSON.stringify(ist, null, 1) + '\n'); console.log('Soll geschrieben: ' + SOLL_DATEI); soll = JSON.parse(fs.readFileSync(SOLL_DATEI, 'utf8')); }
    if (process.env.SPRACHE_TMP) fs.writeFileSync(process.env.SPRACHE_TMP, JSON.stringify(ist, null, 1));
    console.log('SPRACHE: ' + ok + ' Prüfungen in Ordnung, ' + fehler + ' Fehler (' + ist.proben.length + ' Proben, ' + Object.keys(ist.vertauschung).length + ' Vertauschungen)');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('ABBRUCH: ' + (e && e.stack || e)); process.exit(2); });
