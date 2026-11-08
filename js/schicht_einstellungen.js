/* ============================================================
   SCHICHTZEITEN IN DEN EINSTELLUNGEN: Beginn und Ende von Früh- und Spätschicht, gewünschte Ankunft vor Beginn, Stauwarnungen.
   Die Werte liegen zentral in plan_ansagen.js (window.jvPlan) und werden dort dauerhaft gespeichert. Hier ist nur die Oberfläche.
   Ein Ende nach Mitternacht (z. B. 00:30) wird als Folgetag gerechnet. Speichern stellt die geplanten Meldungen sofort neu.
   ============================================================ */
(function () {
    'use strict';
    if (window.jvSchichtEinstellungen) return;
    const $ = id => document.getElementById(id);
    const pad = n => String(n).padStart(2, '0');
    const hm = min => pad(Math.floor(((min % 1440) + 1440) % 1440 / 60)) + ':' + pad(((min % 60) + 60) % 60);
    function lesen(id) { const el = $(id); const m = el && /^(\d{1,2}):(\d{2})$/.exec(el.value || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; }
    function fuellen() {
        const P = window.jvPlan; if (!P || !$('szFruehBeginn')) return false;
        $('szFruehBeginn').value = hm(P.beginn('frueh')); $('szFruehEnde').value = hm(P.ende('frueh'));
        $('szSpaetBeginn').value = hm(P.beginn('spaet')); $('szSpaetEnde').value = hm(P.ende('spaet'));
        $('szVorher').value = String(P.vorherStd()); $('szStau').checked = !!P.stauAn();
        return true;
    }
    function speichern() {
        const P = window.jvPlan, msg = $('szMeldung'); if (!P) return;
        const fb = lesen('szFruehBeginn'), fe = lesen('szFruehEnde'), sb = lesen('szSpaetBeginn'), se = lesen('szSpaetEnde');
        const v = Number($('szVorher').value);
        if ([fb, fe, sb, se].some(x => x == null) || !Number.isFinite(v) || v < 0 || v > 90) { if (msg) { msg.style.color = '#ff7b7b'; msg.textContent = 'Bitte alle Zeiten ausfüllen. Die Ankunft darf 0 bis 90 Minuten vor Beginn liegen.'; } return; }
        P.setBeginn('frueh', fb); P.setBeginn('spaet', sb);
        P.setEnde('frueh', fe); P.setEnde('spaet', se);
        P.setVorher(v); P.setStauAn($('szStau').checked);
        try { P.planSenden(true); } catch (e) { }
        fuellen();
        if (msg) { msg.style.color = '#4cffb0'; msg.textContent = 'Gespeichert. Früh ' + P.uhrHM(fb) + ' bis ' + P.uhrHM(fe % 1440) + ', Spät ' + P.uhrHM(sb) + ' bis ' + P.uhrHM(se % 1440) + ', Ankunft ' + v + ' Minuten vor Beginn.'; }
    }
    function start() {
        const b = $('szSpeichern'); if (!b) return;
        b.addEventListener('click', speichern);
        ['szFruehBeginn', 'szFruehEnde', 'szSpaetBeginn', 'szSpaetEnde', 'szVorher', 'szStau'].forEach(function (id) { const el = $(id); if (el) el.addEventListener('change', speichern); });   // der Handy-Zeitwähler hat keine OK-Taste: jede Änderung wird sofort gespeichert
        const d = $('schichtzeitenDetails'); if (d) d.addEventListener('toggle', function () { if (d.open) fuellen(); });
        fuellen();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
    setTimeout(fuellen, 1500);
    window.jvSchichtEinstellungen = { fuellen, speichern };
})();
