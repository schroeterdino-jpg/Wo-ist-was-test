/* ============================================================
   DIAGNOSE: Ein kleines Fenster unten im Bild, das zeigt, was bei einer Anfrage an die KI wirklich passiert:
   - Wie groß die Anweisung an die KI ist (Zeichen) und ob die Verbindung zur KI einen Fehler meldet (zum Beispiel Mengenlimit)
   - Was die KI geantwortet hat und welche AKTIONEN sie angelegt hat ("list_edit", "show_panel", ...) oder ob KEINE
   - Fehlermeldungen, die sonst nur als "Die Verbindung ist mir weggebrochen" zu hören sind
   Ein-/Ausschalten per Sprache: "Diagnose an" / "Diagnose aus". Im Normalbetrieb ist es aus und kostet nichts.
   Hängt an drei Stellen in assistant.js (sendToGroqSmart). Braucht: storage.js (getPersistentData/setPersistentData).
   ============================================================ */

const DIAG_KEY = 'helfer_diag';
let diagLines = [];
let diagEl = null;

function diagEnabled() { return getPersistentData(DIAG_KEY, '0') === '1'; }

function diagRender() {
    if (!diagEnabled()) { diagClose(); return; }
    try {
        if (!diagEl) {
            diagEl = document.createElement('div');
            diagEl.id = 'diagBox';
            diagEl.style.cssText = 'position:fixed;left:6px;right:6px;bottom:6px;z-index:2147483600;max-height:42vh;overflow:auto;background:rgba(2,8,14,.95);border:1px solid #3ddc97;border-radius:10px;color:#bff5dc;font:11px/1.45 monospace;padding:8px 10px;white-space:pre-wrap;word-break:break-word';
            const close = document.createElement('button');
            close.textContent = '✕ Diagnose';
            close.style.cssText = 'position:sticky;top:0;float:right;margin:0 0 4px 8px;border:1px solid #3ddc97;border-radius:6px;background:#02130c;color:#3ddc97;font:700 11px monospace;padding:2px 8px';
            close.addEventListener('click', () => { diagClose(); });
            diagEl.appendChild(close);
            const body = document.createElement('div');
            body.id = 'diagBody';
            diagEl.appendChild(body);
            document.body.appendChild(diagEl);
        }
        const body = diagEl.querySelector ? diagEl.querySelector('#diagBody') : null;
        if (body) body.textContent = diagLines.join('\n');
    } catch (e) {}
}

function diagClose() {
    if (diagEl) { try { diagEl.remove(); } catch (e) {} diagEl = null; }
}

function diagStart(text) {
    if (!diagEnabled()) return;
    diagLines = [`▶ ${new Date().toLocaleTimeString('de-DE')}  Sie: ${String(text || '').slice(0, 120)}`];
    diagRender();
}

function diagAdd(line) {
    if (!diagEnabled()) return;
    diagLines.push(line);
    diagRender();
}

/* Größe der Anweisung (grobe Schätzung der Token: etwa 3,5 Zeichen je Token) */
function diagPromptSize(systemPrompt) {
    if (!diagEnabled()) return;
    const n = String(systemPrompt || '').length;
    diagAdd(`Anweisung an die KI: ${n} Zeichen (etwa ${Math.round(n / 3.5)} Token)`);
}

/* Antwort der KI-Verbindung: Status und eine eventuelle Fehlermeldung (zum Beispiel Mengenlimit) */
function diagApi(res, data) {
    if (!diagEnabled()) return;
    const status = res && typeof res.status !== 'undefined' ? res.status : '?';
    const err = data && data.error ? (typeof data.error === 'string' ? data.error : (data.error.message || JSON.stringify(data.error))) : '';
    const usage = data && data.usage ? ` | Token: ${data.usage.prompt_tokens || '?'} + ${data.usage.completion_tokens || '?'}` : '';
    diagAdd(`KI-Verbindung: Status ${status}${usage}${err ? '\n  FEHLER der KI-Verbindung: ' + String(err).slice(0, 300) : ''}`);
}

/* Was die KI daraus gemacht hat */
function diagShow(text, ai) {
    if (!diagEnabled()) return;
    const acts = (ai && Array.isArray(ai.actions)) ? ai.actions : (ai ? [ai] : []);
    const describe = (a) => {
        if (!a || typeof a !== 'object') return '?';
        const bits = [a.type || 'chat'];
        ['list_name', 'list_op', 'panel', 'calendar_text', 'shopping_item', 'shopping_items', 'todo_item'].forEach(k => { if (a[k] !== undefined && a[k] !== null && a[k] !== '') bits.push(`${k}=${JSON.stringify(a[k]).slice(0, 40)}`); });
        return bits.join(' ');
    };
    const real = acts.filter(a => a && a.type && a.type !== 'chat');
    diagAdd(`KI-Antwort: „${String((ai && ai.reply) || '').slice(0, 160)}“`);
    diagAdd(real.length ? `Aktionen (${real.length}): ${real.map(describe).join('  |  ')}` : 'Aktionen: KEINE (die KI hat nur geantwortet, nichts ausgeführt)');
}

function diagError(e) {
    if (!diagEnabled()) return;
    const msg = (e && e.message) ? e.message : String(e);
    const where = (e && e.stack) ? String(e.stack).split('\n').slice(1, 3).map(s => s.trim().replace(/https?:\/\/[^\s)]*\//, '')).join(' < ') : '';
    diagAdd(`FEHLER: ${msg.slice(0, 240)}${where ? '\n  ' + where.slice(0, 260) : ''}`);
}

function handleDiagCommand(text) {
    const t = String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 40) return false;
    const say = (m) => speak(m, typeof continueConversation === 'function' ? continueConversation : undefined);
    if (/^(?:diagnose|diagnosemodus|diagnose-?fenster) (?:an|ein|einschalten|aktivieren)$/.test(t) || /^schalte? (?:die )?diagnose (?:an|ein)$/.test(t)) {
        setPersistentData(DIAG_KEY, '1');
        say('Die Diagnose ist an. Unten im Bild sehen Sie jetzt, was bei jeder Anfrage an die KI passiert.');
        return true;
    }
    if (/^(?:diagnose|diagnosemodus|diagnose-?fenster) (?:aus|ab|ausschalten|deaktivieren)$/.test(t) || /^schalte? (?:die )?diagnose aus$/.test(t)) {
        setPersistentData(DIAG_KEY, '0');
        diagClose();
        say('Die Diagnose ist aus.');
        return true;
    }
    return false;
}
