/* ============================================================
   SPRÜCHE: Jarvis soll überall frecher und lustiger sein, nicht nur dort, wo die KI selbst formuliert.
   1) Antworten, die die App selbst aus echten Daten baut (Stau, Fahrzeit, Bahn, Sprit, Restaurants, Foto-Bestätigungen und die neuen Funktionen
      wie Mond, Feiertage, Weltzeit, Filmtipps), bekommen NACH der Information einen kurzen Spruch angehängt, passend zur Lage
      ("Da würde ich nicht hinfahren" bei Stau, "Freie Fahrt" ohne Stau, "Popcorn nicht vergessen" bei Filmtipps).
      Technik: speak() aus voice.js wird umhüllt; erkannt wird der Anlass am gesprochenen Text.
   2) Antworten der KI: Die Anweisung (prompt.js) bekommt einen Zusatz, der bei fast jeder Antwort einen frechen Kommentar verlangt.
   Regeln: Die Information kommt immer zuerst. Kein Spruch bei Warnungen, Fehlern, Problemen, Erinnerungen, Gesundheit, Medikamenten, E-Mails und Geld.
   Der Frechheitsgrad zählt (Einstellungen > Charakter oder "Sei frecher" / "Sei höflicher" / "Keine Sprüche mehr"):
   Stufe 0 = nie, 1 = selten, 2 = meistens, 3 = immer. Kein Spruch wird innerhalb von acht Anlässen derselben Art wiederholt.
   Nur Necken, nie verletzen: nichts über Aussehen, Familie, Herkunft, Religion oder Politik, kein Fluchen.
   Braucht: speak (voice.js), optional sassLevel (persona.js), buildSystemPrompt (prompt.js). Muss nach diesen Dateien geladen werden.
   ============================================================ */
(function () {
    const CHUCKLE_MARK = '\u2063';   // unsichtbares Zeichen, steht vor dem angehängten Spruch (siehe fish.js)
    window.JV_CHUCKLE_MARK = CHUCKLE_MARK;
    const LEVEL_CHANCE = { 0: 0, 1: 0.35, 2: 0.85, 3: 1 };
    const MAX_LEN = 430;   // längere Texte (Listen, Briefing, Protokolle) bekommen keinen Spruch
    const recent = {};     // Anlass -> zuletzt benutzte Sprüche

    /* ---------- Sprüche ---------- */
    const Q = {
        stau_viel: [
            'Da würde ich nicht hinfahren.', 'Stau. Eine Autobahn ist heute leider ein sehr langer Parkplatz.', 'Vielleicht ist Zuhausebleiben auch eine Route.',
            'Nehmen Sie Proviant mit, oder wahlweise Geduld.', 'Ich würde ja Alternativen vorschlagen, aber Fliegen ist keine.', 'Hörbuch an, tief durchatmen, durch.',
            'Das Navi nennt es Verkehrsaufkommen, ich nenne es Lebenszeitverschwendung.', 'Mit Ihnen reist heute offenbar halb Norddeutschland.',
            'Bis Sie dort sind, haben Sie Ihr Lieblingslied dreimal gehört.'],
        stau_lang: ['Das ist kein Stau mehr, das ist ein Wohnprojekt mit Auspuff.', 'Bei der Dauer können Sie dort fast einziehen.', 'Ich würde einen Campingstuhl einpacken.'],
        stau_frei: [
            'Freie Fahrt. Genießen Sie es, das kommt selten genug vor.', 'Kein Stau. Das Universum ist heute ausnahmsweise auf Ihrer Seite.', 'Alles frei. Verdächtig gut, ehrlich gesagt.',
            'Gas geben Sie bitte nur im Rahmen der Gesetze, die Blitzer schlafen nie.', 'Keine Meldungen. Der Verkehr hat heute anscheinend frei.', 'Sieht gut aus. Fast zu gut, ich bleibe misstrauisch.'],
        fahrt_kurz: ['Das ist ja praktisch um die Ecke.', 'Da sind Sie schneller als Ihr Kaffee kalt wird.'],
        fahrt_mittel: ['Genug Zeit für einen halben Podcast.', 'Reicht für ein paar gute Lieder und einen schlechten Gedanken.', 'Eine gemütliche Strecke. Ich würde sagen: Radio an.'],
        fahrt_lang: ['Packen Sie Snacks ein, das ist praktisch eine Expedition.', 'Das ist weniger eine Fahrt als ein Ausflug.', 'Auf der Strecke wachsen Ihnen fast Wurzeln.', 'Tanken Sie lieber vorher, ich kann Sie leider nicht abschleppen.'],
        bahn: ['Ich drücke der Bahn die Daumen. Ich habe zwar keine, aber die Absicht zählt.', 'Pünktlich ist bei der Bahn eher eine Anregung.', 'Planen Sie vorsichtshalber einen Puffer und gute Laune ein.', 'Möge das Gleis mit Ihnen sein.'],
        sprit: ['Tanken: die moderne Form von Geld verbrennen.', 'Der Preis tut weh, aber das Auto kann nichts dafür.', 'Man sagt ja, Geld macht nicht glücklich. Sprit auch nicht, aber er bringt Sie hin.', 'Ich würde ja Alternativen vorschlagen, aber Laufen dauert.'],
        ort_nah: ['Näher geht es kaum. Wenn Sie ihn verfehlen, liegt es nicht an der Entfernung.', 'Das ist praktisch um die Ecke.', 'Da brauchen Sie kaum Schuhe, aber nehmen Sie trotzdem welche.'],
        ort_weit: ['Das ist weniger um die Ecke als um die Welt.', 'Eine kleine Expedition, aber Sie schaffen das.', 'Tanken Sie lieber vorher, ich kann Sie leider nicht abschleppen.'],
        essen: ['Mahlzeit! Beim Essen kann ich leider nur beim Aussuchen helfen.', 'Hunger ist der beste Koch, und die haben auch einen.', 'Guten Appetit. Ich nehme nur Strom, falls es jemand wissen will.', 'Ein hungriger Mensch ist ein gefährlicher Mensch. Gehen Sie los.'],
        eingetragen: ['Eingetragen. Jetzt müssen Sie nur noch hingehen.', 'Der Kalender ist beeindruckt von Ihrer Voraussicht.', 'Notiert. Ausreden gelten ab sofort nicht mehr.', 'Erledigt. Ich war dabei fast ein bisschen stolz.'],
        liste: ['Hoffentlich vergessen Sie die Liste nicht im Auto.', 'Einkaufen: die Kunst, mit drei Artikeln und sieben Extras zurückzukommen.', 'Stehen drauf. Ob sie auch im Wagen landen, liegt bei Ihnen.'],
        kontakt: ['Ein Kontakt mehr. Hoffentlich hebt er auch mal ab.', 'Gespeichert. Ihr Telefonbuch wird langsam gesellig.'],
        vollmond: ['Heulen ist erlaubt, bitte aber leise, wegen der Nachbarn.', 'Werwölfe bitte vorher Bescheid sagen.', 'Perfekt für Romantiker und für alles mit Fell und Zähnen.', 'Schlafen Sie in der Nacht gut, falls der Mond Sie lässt.'],
        neumond: ['Stockdunkel dann. Taschenlampe nicht vergessen.', 'Der Mond macht eine kleine Pause, auch er hat Anspruch auf freie Tage.', 'Nachts sieht dann nur noch die Straßenlaterne gut aus.'],
        mond: ['Der Mond arbeitet zuverlässiger als mancher Mensch.', 'Himmlisch pünktlich, wie immer.', 'Ein sehr verlässlicher Kollege da oben.'],
        sonne_unter: ['Danach regiert die Dunkelheit, wie es sich gehört.', 'Dann bitte rechtzeitig das Licht einschalten.', 'Die Sonne macht Feierabend. Beneidenswert.'],
        sonne_auf: ['Früh aufstehen ist eine Entscheidung. Eine mutige.', 'Die Sonne ist bei der Arbeit, Sie müssen nicht gleich nachziehen.'],
        sonne_hell: ['Die Zeit läuft, die Sonne auch.', 'Nutzen Sie das Licht, solange es gratis ist.'],
        feiertag: ['Endlich wieder ein Tag, an dem Arbeit offiziell verboten ist.', 'Ich hoffe, Sie planen etwas Anstrengendes, nämlich Nichtstun.', 'Der Kalender gönnt Ihnen etwas, wie großzügig.'],
        bruecke: ['Ein Urlaubstag, vier freie Tage: Mathematik, die ich mag.', 'Das nenne ich Rendite.', 'Ein cleverer Plan. Der Chef wird es Zufall nennen.'],
        zeit_nacht: ['Ich würde dort um diese Uhrzeit nicht anrufen.', 'Bei denen ist tiefste Nacht, dort schläft man hoffentlich.'],
        zeit: ['Zeitzonen: damit nie jemand weiß, wie spät es wirklich ist.', 'Falls Sie jemanden anrufen wollen: vorher rechnen, nicht hinterher entschuldigen.', 'Die Erde dreht sich eben, wie sie will.'],
        film: ['Popcorn nicht vergessen.', 'Ich kann den Film leider nicht mitschauen, ich bin der Ton.', 'Licht aus, Handy weg, Decke her.', 'Bei Spannung bitte nicht dem Nachbarn in den Arm krallen.'],
        film_horror: ['Schlafen Sie danach lieber bei Licht.', 'Nach dem Film bitte nicht die Treppe in den Keller nehmen.', 'Ich bleibe an, falls etwas aus dem Schrank kommt.'],
        kino: ['Popcorn nicht vergessen, aber bitte keine Chips-Tüte im ruhigen Moment.', 'Und bitte das Handy ausschalten, nicht nur leise stellen.']
    };

    /* ---------- Hilfen ---------- */
    function level() { try { return typeof sassLevel === 'function' ? Number(sassLevel()) : 2; } catch (e) { return 2; } }
    function pick(cat) {
        const all = Q[cat]; if (!all || !all.length) return '';
        const used = recent[cat] || (recent[cat] = []);
        let pool = all.filter(q => used.indexOf(q) === -1);
        if (!pool.length) { used.length = 0; pool = all; }
        const q = pool[Math.floor(Math.random() * pool.length)];
        used.push(q);
        if (used.length > 8) used.shift();
        return q;
    }
    function minutesIn(t) {
        let m = 0, found = false;
        const h = t.match(/(\d+)\s*(?:stunden?|std\b)/); if (h) { m += Number(h[1]) * 60; found = true; }
        const mi = t.match(/(\d+)\s*(?:minuten|min\b)/); if (mi) { m += Number(mi[1]); found = true; }
        return found ? m : null;
    }

    /* Dinge, bei denen es nie einen Spruch gibt: Warnungen, Fehler, Probleme, Erinnerungen, Gesundheit, E-Mails, Geld, Notfälle */
    const DENY = /(achtung|warnung|unwetter|fehler|problem|störung|nicht eingerichtet|antwortet gerade nicht|konnte ich|kann ich nicht|leider|nicht verbunden|nur in der app|abgelaufen|zur erinnerung|erinnerung|letzte erinnerung|das wird knapp|sollten sie|es wird zeit|tablette|medikament|arzt|apotheke|krankenhaus|notruf|notfall|verletzt|geisterfahrer|lebensgefahr|e-mail|e-mails|postfach|rechnung|konto|überweisung|schulden|beerdigung|trauer)/;

    /* Welcher Anlass steckt im gesprochenen Text? Gibt { cat } oder null zurück. */
    function classify(text) {
        const t = String(text || '').toLowerCase();
        if (!t || t.length > MAX_LEN || DENY.test(t)) return null;

        // Stau und Fahrzeit (rechnet die App aus echten Daten)
        const stauWord = /\b(stau|staus|staumeldung\w*|stockender verkehr|stockend|zähflüssig|verkehrsbehinderung\w*|baustelle\w*|sperrung\w*)\b/.test(t);
        const free = /(kein(?:e|en|em)?\s+(?:\w+\s+)?(?:stau|staus|staumeldung\w*|verkehrsmeldung\w*|verkehrsbehinderung\w*|behinderung\w*)|ohne\s+(?:stau|behinderung\w*)|freie fahrt|nichts gemeldet|\bfließt\b|\bflüssig)/.test(t);
        const jam = /(zähflüssig|stockend|stau (?:auf|vor|zwischen|bei)|\d+\s*km stau)/.test(t);
        if (/(strecke|route|fahrt|verkehr|stau)/.test(t) && (stauWord || free)) {
            if (free && !jam) return { cat: 'stau_frei' };
            const mins = minutesIn(t);
            return { cat: mins !== null && mins >= 40 ? 'stau_lang' : 'stau_viel' };
        }
        if (/(fahrt|fahrzeit|weg)\b.*\b(dauert|dauern|beträgt)\b|\bdauert\b.*\bminuten\b|\bfahrzeit\b/.test(t)) {
            const m = minutesIn(t);
            if (m !== null) return { cat: m <= 15 ? 'fahrt_kurz' : m <= 60 ? 'fahrt_mittel' : 'fahrt_lang' };
        }

        // Bahn und Bus
        if (/(nächste[rn]?\s+(?:zug|bus|verbindung)|abfahrt|gleis|umstieg\w*|verbindung\w*)/.test(t) && /(uhr|\d{1,2}[:.]\d{2})/.test(t)) return { cat: 'bahn' };

        // Sprit entlang der Strecke
        if (/\b(diesel|benzin|e10|super e5|e5)\b/.test(t) && /(euro|cent|\d[,.]\d{2,3})/.test(t) && /(tankstelle|günstig|billig|entlang|strecke|am günstigsten)/.test(t)) return { cat: 'sprit' };

        // Ortssuche (ortsuche.js): "Am nächsten ist ..., rund 200 Meter entfernt"
        const ort = t.match(/am nächsten ist .*?(?:rund )?(\d+(?:,\d+)?) (meter|kilometer) entfernt/);
        if (ort) { const v = Number(ort[1].replace(',', '.')); const km = ort[2] === 'kilometer' ? v : v / 1000; return { cat: km <= 0.6 ? 'ort_nah' : km >= 3 ? 'ort_weit' : null }; }

        // Restaurants in der Nähe
        if (/(restaurant|pizzeria|imbiss|döner|chinesisch|italienisch|burger|bistro|gasthaus)/.test(t) && /(meter|km|entfernt|geöffnet|bewertung|sterne)/.test(t)) return { cat: 'essen' };

        // Bestätigungen aus der Foto-Funktion
        if (/(\d+\s+termine?\s+eingetragen\.|ist eingetragen, \S+)/.test(t)) return { cat: 'eingetragen' };
        if (/artikel\s+(?:stehen|steht)\s+auf der einkaufsliste/.test(t)) return { cat: 'liste' };
        if (/ist in ihren kontakten gespeichert/.test(t)) return { cat: 'kontakt' };

        // Neue Funktionen: Mond, Sonne, Feiertage, Weltzeit, Filme
        if (/(nächste vollmond|gerade ist vollmond)/.test(t)) return { cat: 'vollmond' };
        if (/nächste neumond/.test(t)) return { cat: 'neumond' };
        if (/der mond (?:geht|ist|ist gerade)/.test(t)) return { cat: 'mond' };
        if (/die sonne (?:geht|ist) .*(?:untergegangen|unter)\b/.test(t)) return { cat: 'sonne_unter' };
        if (/die sonne (?:geht|ist) .*(?:aufgegangen|auf)\b/.test(t)) return { cat: 'sonne_auf' };
        if (/es bleibt noch etwa .* hell/.test(t)) return { cat: 'sonne_hell' };
        if (/brückentage/.test(t) && /(urlaub|frei|tage am stück)/.test(t)) return { cat: 'bruecke' };
        if (/(der nächste feiertag ist|^ja, (?:heute|morgen|übermorgen) ist|hier sind die feiertage|feiertage? gibt es|ist am .*, also (?:heute|morgen|übermorgen|in \d+ tagen)\.?$)/.test(t)) return { cat: 'feiertag' };
        if (/ist es jetzt (\d{1,2}) uhr/.test(t) || /(?:mehr|weniger) als bei ihnen|dieselbe zeit wie bei ihnen|mehrere zeitzonen/.test(t)) {
            const m = t.match(/ist es(?: jetzt)? (\d{1,2}) uhr/);
            return { cat: m && (Number(m[1]) < 6) ? 'zeit_nacht' : 'zeit' };
        }
        if (/laufen in den deutschen kinos/.test(t)) return { cat: 'kino' };
        if (/(-tipps?:|drei tipps:)/.test(t) && /von 10/.test(t)) return { cat: /^horror/.test(t) ? 'film_horror' : 'film' };
        if (/läuft in deutschland im abo bei|gibt es in deutschland nicht im abo/.test(t)) return { cat: 'film' };
        return null;
    }

    /* Hängt einen Spruch an, wenn Anlass, Frechheitsgrad und Zufall es erlauben */
    function addQuip(text) {
        if (typeof text !== 'string') return text;
        const chance = LEVEL_CHANCE[level()];
        if (!chance || Math.random() > chance) return text;
        const hit = classify(text);
        if (!hit) return text;
        const q = pick(hit.cat);
        if (!q) return text;
        const sep = /[.!?…]["“”)]?\s*$/.test(text) ? ' ' : '. ';
        return text + sep + CHUCKLE_MARK + q;   // unsichtbare Marke: fish.js macht daraus bei Fish Audio ein leichtes Kichern, sonst wird sie entfernt
    }

    /* ---------- 1) speak() umhüllen ---------- */
    if (typeof window.speak === 'function' && !window.speak._quipped) {
        const original = window.speak;
        let lastIn = '', lastAt = 0;
        const wrapped = function (text) {
            const args = Array.prototype.slice.call(arguments);
            try {
                // Wird derselbe Text kurz hintereinander noch einmal gesprochen (Wiederholung, Nachspielen), bleibt er unverändert
                if (typeof text === 'string' && !(text === lastIn && Date.now() - lastAt < 3000)) {
                    lastIn = text; lastAt = Date.now();
                    args[0] = addQuip(text);
                }
            } catch (e) { /* bei jedem Problem bleibt der Text, wie er ist */ }
            return original.apply(this, args);
        };
        wrapped._quipped = true;
        window.speak = wrapped;
    }

    /* ---------- 2) KI-Anweisung ergänzen ---------- */
    if (typeof window.buildSystemPrompt === 'function' && !window.buildSystemPrompt._quipped) {
        const originalPrompt = window.buildSystemPrompt;
        const extra = '\n\nWICHTIG - Humor (ausdrücklicher Wunsch des Users): Er möchte, dass die Arbeit mit dir Spaß macht und du nicht wie ein steifes Vorlesegerät klingst. ' +
            'Gib bei fast jeder Antwort nach der eigentlichen Information einen kurzen, frechen, lustigen Kommentar ab (ein Satz, trockener britischer Butler-Humor, gern mit Übertreibung oder gespielter Empörung), ' +
            'auch bei Smalltalk, Wetter, Uhrzeit, Listen, Terminen, Bestätigungen und Auskünften aller Art. Diese Vorgabe hat Vorrang vor der „Stilvorgabe für diese Antwort“, ' +
            'gilt aber nie bei den TABU-Themen (Gesundheit, Tabletten und Medikamente, wichtige Erinnerungen, Fehler und Störungen, Geld und Rechtliches, Trauer, Sorgen, Notfälle, Vorlesen von E-Mails und Nachrichten). ' +
            'Variiere stark, wiederhole keinen Spruch und keine Struktur, sei einfallsreich statt platt, und neck nie bei Aussehen, Familie, Herkunft, Religion oder Politik. ' +
            'Bleibe knapp: ein bis zwei Sätze Information plus ein kurzer Spruch.';
        const wrappedPrompt = function () {
            const base = originalPrompt.apply(this, arguments);
            return level() === 0 ? base : base + extra;
        };
        wrappedPrompt._quipped = true;
        window.buildSystemPrompt = wrappedPrompt;
    }

    window.jarvisQuip = addQuip;
    window.jvClassify = classify;                                              // für fish.js: Anlass eines Textes (Stau, Sprit, ...)
    window.jvIsSerious = (t) => DENY.test(String(t || '').toLowerCase());     // ernste Themen: keine Laute, keine Sprüche
    window._spruecheTest = { classify, addQuip };   // nur zum Testen
})();
