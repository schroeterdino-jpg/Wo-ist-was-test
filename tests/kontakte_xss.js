'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'lists.js'), 'utf8');

// Regression: Kontakt-Schlüssel dürfen nicht mehr roh in ein einfach-quotiertes onclick-Argument geraten.
assert(!src.includes("deleteContact('${k}')"), 'Kontakt-Key wird noch roh in onclick eingebettet');
assert(src.includes('const keyArg = escapeHtml(JSON.stringify(k));'), 'Sichere Serialisierung des Kontakt-Keys fehlt');
assert(src.includes('deleteContact(${keyArg})'), 'Löschen-Button nutzt den sicheren Key nicht');

// Auch die Telefonnummer landet in innerHTML und muss deshalb escaped werden.
assert(src.includes('📞 ${escapeHtml(c.phone)}'), 'Telefonnummer wird nicht HTML-escaped');

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

for (const key of [
    'max muster',
    "o'connor",
    `x'); alert('xss');//`,
    `x\" onclick=\"alert(1)`
]) {
    const keyArg = escapeHtml(JSON.stringify(key));
    const html = `<button onclick="playUiBeep(); deleteContact(${keyArg})">Löschen</button>`;
    assert(html.startsWith('<button onclick="playUiBeep(); deleteContact(&quot;'), `Key nicht als geschütztes JSON-Stringliteral: ${key}`);
    assert(!html.includes("deleteContact('"), `Einfach-quotierter JS-Kontext wieder eingeführt: ${key}`);
}

console.log('kontakte_xss: OK');
