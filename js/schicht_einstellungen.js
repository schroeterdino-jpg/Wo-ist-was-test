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
    /* Der Zeitwähler des Handys hat in den Einstellungen keine OK-Taste (Samsung): die Felder sind normale Zahlenfelder. "1345", "13.45", "13:45" und "13" werden zu 13:45 bzw. 13:00. */
    function norm(v) {
        const d = String(v || '').trim().replace(/[.,:\s]/g, '');
        if (!/^\d{1,4}$/.test(d)) return null;
        const h = d.length <= 2 ? +d : +d.slice(0, d.length - 2), m = d.length <= 2 ? 0 : +d.slice(-2);
        return h <= 23 && m <= 59 ? pad(h) + ':' + pad(m) : null;
    }
    function lesen(id) { const el = $(id); const t = el && norm(el.value); const m = t && /^(\d{2}):(\d{2})$/.exec(t); return m ? (+m[1]) * 60 + (+m[2]) : null; }
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
        if ([fb, fe, sb, se].some(x => x == null) || !Number.isFinite(v) || v < 0 || v > 90) { if (msg) { msg.style.color = '#ff7b7b'; msg.textContent = 'Bitte alle Zeiten ausfüllen, zum Beispiel 13:45. Die Ankunft darf 0 bis 90 Minuten vor Beginn liegen.'; } return; }
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
        ['szFruehBeginn', 'szFruehEnde', 'szSpaetBeginn', 'szSpaetEnde', 'szVorher', 'szStau'].forEach(function (id) { const el = $(id); if (!el) return; el.addEventListener('change', speichern); el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { try { el.blur(); } catch (x) { } } }); });   // jede Änderung wird sofort gespeichert (beim Verlassen des Feldes oder mit Enter)
        const d = $('schichtzeitenDetails'); if (d) d.addEventListener('toggle', function () { if (d.open) fuellen(); });
        fuellen();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
    setTimeout(fuellen, 1500);
    window.jvSchichtEinstellungen = { fuellen, speichern };
})();
