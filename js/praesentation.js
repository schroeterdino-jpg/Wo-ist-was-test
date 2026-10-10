/* ============================================================
   praesentation.js – Jarvis stellt sich selbst vor
   ============================================================
   Start per Sprache: "Präsentation starten", "Stell dich vor" (Abbrechen: ✕ unten oder "Präsentation beenden").
   Ablauf: Jarvis spricht zu jeder Folie, Stichpunkte erscheinen nacheinander, das Hologramm gestikuliert dazu.
   Live-Vorführungen (Wetter, Apotheke in der Nähe, Mond, Währung) laufen mit den echten Funktionen der App.
   Private Dinge (Mail, Kalender, Gedächtnis, Konto) werden nur als Folie gezeigt, nie live.
   Während der Präsentation hört Jarvis nicht zu (Gesprächsmodus ist aus) und ein Tippen auf die Figur startet nichts.
   Braucht: voice.js (speak), commands.js, hologramm.js (optional, für Gesten).
   ============================================================ */
(function () {
    'use strict';
    let running = false, aborted = false, card = null, cap = null, savedConv = null, savedHolo = null, runId = 0, wake = 0;

    const SZENEN = [
        { t: 'JARVIS', k: 'Persönlicher Sprachassistent', ic: '🎙️', emo: 'greet',
          say: 'Hallo zusammen! Ich bin Jarvis, der persönliche Sprachassistent von Dino. Er hat mich selbst gebaut, Schritt für Schritt. Darf ich mich kurz vorstellen?',
          items: ['🎙️ Sprache', '🧠 Gedächtnis', '🚗 Unterwegs', '📅 Termine', '📷 Kamera'] },
        { t: 'REDEN WIE MIT EINEM MENSCHEN', k: 'Keine festen Kommandos', ic: '💬',
          say: 'Zuerst das Wichtigste: Man redet einfach ganz normal mit mir. Ohne feste Kommandos, und gern auch mehrere Wünsche in einem Satz. Zum Beispiel: Erinnere mich morgen an den Zahnarzt und setz Milch auf die Einkaufsliste.',
          items: ['„Erinnere mich morgen an den Zahnarzt“', '„Setz Milch auf die Einkaufsliste“', '„Wo ist der nächste Penny?“', '„Zeig mir meine Termine“'] },
        { t: 'DER TAG AUF EINEN BLICK', k: 'Briefing und Schicht', ic: '🌅',
          say: 'Morgens fasse ich den Tag zusammen: Termine, Wetter, Erinnerungen und wichtige Dinge. Ich richte mich nach seiner Schicht, Früh oder Spät, und der Wechsel läuft ganz von allein.',
          items: ['📅 Termine von heute', '🌦️ Wetter mit Jacken-Tipp', '⏰ Erinnerungen', '🔁 Schichtplan, Wechsel automatisch'] },
        { t: 'ALLTAG ORGANISIERT', k: 'Listen, Protokolle, Kontakte', ic: '🗂️',
          say: 'Im Alltag halte ich den Kopf frei. Einkaufsliste und Aufgaben pflege ich per Sprache. Erinnerungen wiederhole ich auf Wunsch, jeden Montag oder alle zwei Wochen, und bei wichtigen frage ich so lange nach, bis sie erledigt sind. Mit einem Wort wie Feierabend starte ich gleich mehrere Aktionen auf einmal. Und anrufen oder navigieren kann ich auch.',
          items: ['🛒 Einkaufsliste und Aufgaben', '🔁 Erinnerungen mit Wiederholung', '⚡ Protokolle: „Feierabend“ erledigt alles auf einmal', '📞 Anrufen, WhatsApp, Navigation'] },
        { t: 'WETTER WELTWEIT', k: 'Live-Vorführung', ic: '🌍', say: 'Das Wetter kann ich auch weltweit. Ich zeige es euch live: Istanbul.',
          items: ['🌍 Jeder Ort der Welt', '🛰️ Wetterkarte mit Vorhersage'],
          demo: { cmd: 'Zeig mir das Wetter in Istanbul', max: 14000, dwell: 2500 } },
        { t: 'UNTERWEGS', k: 'Lagebild: Fahrt, Stau, Orte', ic: '🚗',
          say: 'Unterwegs wird es richtig praktisch. Ich rechne aus, wann man losfahren muss, mit Stau auf der Strecke und Regen am Ziel. Und ich finde alles in der Nähe. Live: die nächste Apotheke.',
          items: ['⏱️ Abfahrtszeit mit Stau', '🌧️ Wetter am Ziel', '📍 Orte in der Nähe und auf dem Weg', '⛽ Tankstellen und Dieselpreis'],
          demo: { cmd: 'Wo ist die nächste Apotheke', max: 22000, dwell: 3500 } },
        { t: 'MOND UND STERNE', k: 'Live-Vorführung', ic: '🌕', say: 'Etwas fürs Auge: Wann ist der nächste Vollmond?',
          items: ['🌕 Mondphase', '🌅 Sonnenauf- und -untergang'],
          demo: { cmd: 'Wann ist der nächste Vollmond', max: 14000, dwell: 2500 } },
        { t: 'UMRECHNEN', k: 'Währungen', ic: '💶', say: 'Und wer viel unterwegs ist, braucht Währungen. Fünfzig Euro in Lira?',
          items: ['💶 Euro, Lira, Dollar und mehr'],
          demo: { cmd: 'Was sind 50 Euro in Lira', max: 12000, dwell: 1500 } },
        { t: 'UNTERWEGS PLUS', k: 'Sprit, Unwetter, Feiertage', ic: '⛽',
          say: 'Dazu kommt einiges rund ums Fahren. Ich zeige die günstigsten Tankstellen in der Nähe und entlang der Strecke, und warne vor dem Diesel-Hoch. Bei Unwettern gebe ich Bescheid. Außerdem kenne ich Feiertage, Brückentage und die Schulferien in allen Bundesländern.',
          items: ['⛽ Spritpreise in der Nähe und auf der Strecke', '🌩️ Unwetterwarnungen', '🏖️ Feiertage, Brückentage, Schulferien', '📦 Paketverfolgung'] },
        { t: 'GEDÄCHTNIS', k: 'Merkt sich, was wichtig ist', ic: '🧠',
          say: 'Ich habe ein Gedächtnis. Wo steht das Auto? Wo liegt die Brille? Ich weiß es. Im Langzeitgedächtnis merke ich mir auch Pläne, Erlebnisse und Vorlieben, und frage später nach, wie es war.',
          items: ['🅿️ Parkplatz vom Auto', '🔑 Gegenstände und Orte', '🧠 Langzeitgedächtnis', '💭 „Wie war das Schwimmen?“'] },
        { t: 'POST UND TERMINE', k: 'Mail, Kalender, Fristen', ic: '✉️',
          say: 'Ich lese E-Mails vor, erkenne Fristen auf Rechnungen und Mahnungen und erinnere rechtzeitig daran. Termine trage ich direkt in den Google Kalender ein.',
          items: ['✉️ E-Mails vorlesen', '⚠️ Fristen erkennen', '📆 Google Kalender', '📝 Kündigungsschreiben'] },
        { t: 'MIT DER KAMERA', k: 'Foto-Funktionen', ic: '📷',
          say: 'Mit der Kamera lese ich Briefe, übersetze Schilder, erkläre Warnleuchten im Auto und mache aus einem Plakat gleich einen Termin.',
          items: ['📄 Briefe lesen und einordnen', '🔤 Schilder übersetzen', '🚨 Warnleuchten erklären', '📍 Adresse im Foto: Navigation'] },
        { t: 'SPRACHEN UND WELT', k: 'Dolmetscher, Weltkugel', ic: '🗣️',
          say: 'Ich dolmetsche auf Englisch, Türkisch, Rumänisch, Polnisch und Russisch. Und ich zeige die Welt: eine Weltkugel mit Nachrichten, und Live-Kameras aus großen Städten.',
          items: ['🗣️ 5 Sprachen', '🌐 Weltkugel mit Nachrichten', '📹 Live-Kameras'] },
        { t: 'FREIZEIT', k: 'Filme, Fernsehen, Fußball', ic: '🎬',
          say: 'Auch für den Feierabend habe ich etwas. Ich gebe Filmtipps nach seinem Geschmack, suche im Fernsehprogramm passende Sendungen, sage, was im Kino läuft, und kenne die Bundesliga-Tabelle.',
          items: ['🎬 Filmtipps nach Vorlieben', '📺 Fernsehprogramm', '🍿 Kino in der Nähe', '⚽ Bundesliga-Tabelle'] },
        { t: 'AUCH BEI GESCHLOSSENER APP', k: 'Push-Nachrichten', ic: '🔔', emo: 'warn',
          say: 'Und das Beste: Ich melde mich auch, wenn die App zu ist. Erinnerungen, die Abfahrtszeit mit Stau, Glatteis auf dem Arbeitsweg und wenn der Diesel günstig ist. Achtung: Bei wichtigen Dingen bin ich ziemlich hartnäckig.',
          items: ['⏰ Erinnerungen mit Nachfassen', '🚗 Abfahrt inklusive Stau', '❄️ Glatteis und Regen', '⛽ Dieselpreis-Alarm'] },
        { t: 'CHARAKTER', k: 'Frech, trocken, lebendig', ic: '😏',
          say: 'Ich habe auch Charakter: frech, trocken, und auf Wunsch sogar genervt oder beleidigt. Nur Kaffee kochen kann ich leider noch nicht.',
          items: ['😏 Trockener Humor', '🎭 Stimmungen und Stile', '🙂 Hologramm mit Mimik und Gesten'] },
        { t: 'DAS WAR\'S', k: 'Danke fürs Zuhören', ic: '✨', emo: 'question',
          say: 'Das war\'s von mir. Gebaut mit viel Geduld und noch mehr Ideen. Gibt es Fragen?',
          items: ['✨ Danke!'] }
    ];

    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const alive = id => running && !aborted && id === runId;
    const idleNow = () => {
        try { const b = document.getElementById('recordBtn'); if (b && (b.classList.contains('speaking') || b.classList.contains('recording'))) return false; } catch (e) {}
        try { if (typeof isProcessing !== 'undefined' && isProcessing) return false; } catch (e) {}
        return true;
    };
    function cutSpeech() {
        try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {}
        try { if (typeof currentAudio !== 'undefined' && currentAudio) { currentAudio.pause(); currentAudio = null; } } catch (e) {}
        try { if (typeof currentUtterance !== 'undefined') currentUtterance = null; } catch (e) {}
        try { if (typeof setIdleUi === 'function') setIdleUi(); } catch (e) {}
    }

    function css() {
        if (document.getElementById('praesiCss')) return;
        const st = document.createElement('style'); st.id = 'praesiCss';
        st.textContent =
            '#praesiCard{position:fixed;left:50%;bottom:max(12px,env(safe-area-inset-bottom));width:min(94vw,560px);transform:translate(-50%,24px);opacity:0;z-index:9000;box-sizing:border-box;padding:14px 16px 12px;border:1px solid rgba(93,209,255,.45);border-radius:14px;background:linear-gradient(180deg,rgba(6,18,30,.88),rgba(3,10,18,.94));box-shadow:0 0 28px rgba(0,190,255,.18),inset 0 0 22px rgba(0,160,220,.07);color:#cfefff;transition:transform .5s ease,opacity .5s ease;font-family:Rajdhani,system-ui,sans-serif}' +
            '#praesiCard.on{transform:translate(-50%,0);opacity:1}' +
            '#praesiCard .pk{font:600 11px/1 Orbitron,system-ui,sans-serif;letter-spacing:.2em;color:#6fe7ff;opacity:.85;margin-bottom:6px}' +
            '#praesiCard .pt{font:700 19px/1.2 Orbitron,system-ui,sans-serif;letter-spacing:.1em;color:#fff;text-shadow:0 0 14px rgba(70,210,255,.7);margin-bottom:10px;display:flex;gap:10px;align-items:center}' +
            '#praesiCard .pi{font-size:24px}' +
            '#praesiCard ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;min-height:20px}' +
            '#praesiCard li{font-size:16px;line-height:1.25;padding:6px 10px;border-left:2px solid #ffa24a;background:rgba(80,180,255,.08);border-radius:0 8px 8px 0;opacity:0;transform:translateX(-14px);transition:opacity .45s ease,transform .45s ease}' +
            '#praesiCard li.on{opacity:1;transform:none}' +
            '#praesiCard .pf{display:flex;align-items:center;justify-content:space-between;margin-top:10px;gap:10px}' +
            '#praesiCard .pd{display:flex;gap:5px;flex-wrap:wrap}' +
            '#praesiCard .pd i{width:7px;height:7px;border-radius:50%;background:rgba(93,209,255,.25)}' +
            '#praesiCard .pd i.on{background:#ffa24a;box-shadow:0 0 8px #ffa24a}' +
            '#praesiCard .pd i.done{background:#49d7ff}' +
            '#praesiCard button{font:600 12px Orbitron,system-ui,sans-serif;letter-spacing:.08em;color:#49d7ff;background:rgba(10,22,33,.8);border:1px solid rgba(93,209,255,.45);border-radius:8px;padding:7px 11px;cursor:pointer}' +
            '#praesiCap{position:fixed;left:50%;top:max(10px,env(safe-area-inset-top));transform:translateX(-50%);z-index:9100;padding:6px 14px;border-radius:999px;border:1px solid rgba(255,162,74,.7);background:rgba(20,10,2,.82);color:#ffb866;font:700 11px Orbitron,system-ui,sans-serif;letter-spacing:.18em;display:none;white-space:nowrap}' +
            '#praesiCap.on{display:block}' +
            '';
        document.head.appendChild(st);
    }

    function build() {
        css();
        card = document.createElement('div'); card.id = 'praesiCard'; card.setAttribute('role', 'status');
        card.innerHTML = '<div class="pk"></div><div class="pt"><span class="pi"></span><span class="px"></span></div><ul></ul><div class="pf"><div class="pd"></div><div><button type="button" data-a="skip">WEITER ▶</button> <button type="button" data-a="stop">✕</button></div></div>';
        card.addEventListener('click', e => {
            const b = e.target.closest && e.target.closest('button'); if (!b) return;
            e.stopPropagation();
            if (b.dataset.a === 'stop') stop(true); else if (b.dataset.a === 'skip') { skipFlag = true; cutSpeech(); }
        });
        document.body.appendChild(card);
        cap = document.createElement('div'); cap.id = 'praesiCap'; cap.textContent = '● LIVE-VORFÜHRUNG'; document.body.appendChild(cap);
        const dots = card.querySelector('.pd'); dots.innerHTML = SZENEN.map(() => '<i></i>').join('');
    }
    let skipFlag = false;

    function show(i) {
        const s = SZENEN[i];
        card.querySelector('.pk').textContent = s.k.toUpperCase();
        card.querySelector('.pi').textContent = s.ic;
        card.querySelector('.px').textContent = s.t;
        const ul = card.querySelector('ul'); ul.innerHTML = s.items.map(x => '<li></li>').join('');
        ul.querySelectorAll('li').forEach((li, n) => { li.textContent = s.items[n]; });
        card.querySelectorAll('.pd i').forEach((d, n) => { d.className = n < i ? 'done' : n === i ? 'on' : ''; });
        card.classList.add('on');
    }
    function reveal(i, durMs, id) {
        const lis = card.querySelectorAll('li'), n = lis.length; if (!n) return;
        const step = Math.max(700, Math.min(2200, (durMs - 800) / n));
        lis.forEach((li, k) => setTimeout(() => { if (alive(id)) li.classList.add('on'); }, 600 + k * step));
        setTimeout(() => { if (alive(id)) lis.forEach(li => li.classList.add('on')); }, Math.max(2500, durMs));
    }

    function sag(text, id) {
        return new Promise(res => {
            let done = false; const fin = () => { if (!done) { done = true; res(); } };
            const est = text.length * 70 + 3000;
            try { speak(text, fin); } catch (e) { setTimeout(fin, est); return; }
            // Sicherheitsnetz: falls die Sprachausgabe nie "fertig" meldet
            const t0 = Date.now();
            const iv = setInterval(() => {
                if (done || !alive(id) || skipFlag) { clearInterval(iv); fin(); return; }
                if (Date.now() - t0 > est * 2.2 + 8000) { clearInterval(iv); fin(); }
            }, 400);
        });
    }

    async function warteBisRuhig(id, maxMs) {
        const t0 = Date.now(); await sleep(1800);
        while (alive(id) && !skipFlag && Date.now() - t0 < maxMs) { if (idleNow()) { await sleep(600); if (idleNow()) return; } await sleep(300); }
    }

    /* Schließt ALLES, was eine Vorführung geöffnet haben kann (Lagebild, Wetterkarte, Mond-/Extrafenster, normale Fenster).
       Bewusst ohne "ist eins offen?"-Prüfung: Wetterkarte und Extrafenster laufen nicht über das normale Fenster-System. */
    function schliesseFenster() {
        try { if (window.jvLage && window.jvLage.isOpen && window.jvLage.isOpen()) window.jvLage.close(); } catch (e) {}
        try { if (typeof closeWeatherMap === 'function') closeWeatherMap(); } catch (e) {}
        try { if (typeof window.closeExtraWindow === 'function') window.closeExtraWindow(); } catch (e) {}
        try { if (typeof closePanel === 'function') closePanel(); } catch (e) {}
        try { const x = document.getElementById('extraFenster'); if (x && x.parentNode) x.parentNode.parentNode ? x.parentNode.remove() : x.remove(); } catch (e) {}
    }

    async function demo(d, id) {
        card.classList.remove('on'); cap.classList.add('on');
        await sleep(500);
        if (!alive(id)) return;
        let ok = false;
        try { ok = typeof handleLocalCommand === 'function' && handleLocalCommand(d.cmd); } catch (e) { ok = false; }
        if (!ok) { try { sendToGroqSmart(d.cmd); } catch (e) {} }
        await warteBisRuhig(id, d.max);
        if (alive(id) && !skipFlag) await sleep(d.dwell);
        cutSpeech(); schliesseFenster(); cap.classList.remove('on');
        await sleep(900);
    }

    async function run(id) {
        for (let i = 0; i < SZENEN.length && alive(id); i++) {
            const s = SZENEN[i]; skipFlag = false;
            schliesseFenster();
            show(i);
            const est = s.say.length * 70;
            reveal(i, est, id);
            const p = sag(s.say, id);
            if (s.emo && window.jvHolo) { setTimeout(() => { try { window.jvHolo.emo(s.emo); } catch (e) {} }, 400); }
            await p;
            if (!alive(id)) break;
            if (s.demo && !skipFlag) await demo(s.demo, id);
            else await sleep(i === SZENEN.length - 1 ? 2500 : 700);
        }
        if (alive(id)) stop(false);
    }

    function start() {
        if (running) return;
        running = true; aborted = false; runId++; skipFlag = false;
        try { savedConv = typeof conversationMode !== 'undefined' ? conversationMode : null; if (savedConv !== null) conversationMode = false; } catch (e) {}
        try { savedHolo = window.jvHolo ? window.jvHolo.on() : null; if (window.jvHolo && !savedHolo) window.jvHolo.set(true); } catch (e) {}
        document.body.classList.add('jv-praesi');
        try { schliesseFenster(); } catch (e) {}
        if (!card) build();
        try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(l => { wake = l; }).catch(() => {}); } catch (e) {}
        const id = runId;
        setTimeout(() => { if (alive(id)) run(id); }, 600);
    }

    function stop(userCut) {
        if (!running) return;
        aborted = true; running = false; runId++;
        cutSpeech(); schliesseFenster();
        try { if (savedConv !== null) conversationMode = savedConv; } catch (e) {}
        try { if (window.jvHolo && savedHolo === false) window.jvHolo.set(false); } catch (e) {}
        try { if (wake && wake.release) wake.release(); wake = 0; } catch (e) {}
        document.body.classList.remove('jv-praesi');
        if (card) card.classList.remove('on'); if (cap) cap.classList.remove('on');
        if (userCut) { try { typeWriterStatus('Klicken zum Sprechen...'); } catch (e) {} }
    }

    /* ---------- Sprachbefehle ---------- */
    const START_RX = /^(?:bitte\s+)?(?:(?:starte|beginne|mach(?:e)?|zeig(?:e)?(?:\s+mir)?)\s+(?:bitte\s+)?(?:die\s+|deine\s+|eine\s+)?(?:pr[äa]sentation|vorstellung)(?:\s+(?:starten|an))?|pr[äa]sentation(?:\s+(?:starten|an|los))?|stell\s+dich\s+(?:bitte\s+)?(?:mal\s+)?(?:kurz\s+)?vor|(?:kannst|könntest)\s+du\s+dich\s+(?:mal\s+)?(?:kurz\s+)?vorstellen)$/;
    const STOP_RX = /^(?:bitte\s+)?(?:pr[äa]sentation\s+(?:beenden|abbrechen|stoppen|stopp|aus)|(?:beende|stoppe|brich)\s+(?:die\s+)?pr[äa]sentation(?:\s+ab)?|stopp?|abbrechen|danke\s+das\s+reicht)$/;
    function handle(text) {
        const t = String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 60) return false;
        if (running && STOP_RX.test(t)) { stop(true); return true; }
        if (START_RX.test(t)) { start(); return true; }
        return false;
    }
    document.addEventListener('click', function (e) { if (running && !(e.target.closest && e.target.closest('#praesiCard'))) { e.stopPropagation(); e.preventDefault(); } }, true);   // während der Präsentation startet kein Tippen das Zuhören
    window.jvPraesentation = { start, stop: () => stop(true), isRunning: () => running };
    if (window.jvCommands) {
        window.jvCommands.use('praesentation', function (text, next) {
            try { if (handle(text)) return true; } catch (e) { console.error('Präsentation', e); }
            return next(text);
        }, 90);
    }
})();
