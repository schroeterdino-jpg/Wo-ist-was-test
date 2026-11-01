/* ============================================================
   WEBSITE-BAUER, TEIL 1: DIE VORLAGEN (js/webbau.js benutzt sie)
   window.jvWebSeite(daten) -> eine fertige, in sich geschlossene HTML-Seite (eine Datei, kein Netz nötig, mit Handy- und Laptop-Layout).
   Drei gestaltete Vorlagen: friseur (Strähnen), cafe (Dampf), handwerk (Zeichenraster). Jede hat eigene Farben, Schrift und eigene Bewegung im Hintergrund.
   Klickbar: Anrufen (tel:), WhatsApp (nur bei Handynummern), Route (Karten-Link), Öffnungszeiten, Leistungen. Keine fremden Dateien, keine Bilder aus dem Netz.
   Alle Texte werden entschärft (kein HTML aus der KI oder aus Google-Daten kommt ungeprüft in die Seite).
   daten: { art, name, ort, strasse, plz, tel, zeiten:[[tag, zeit]], kopf:'Zeile|Zeile', unter, szenen:[{klein, titel, text}] (3), leistungen:[[name, preis]], schluss:'Zeile|Zeile' }
   ============================================================ */
(function () {
    'use strict';
    const FARBEN = {
        friseur: { nacht: '#1A0F1C', akzent: '#D9885B', zart: '#F2BFC9', licht: '#F6EFE6', muster: 'str', schrift: '"Bitstream Charter",Charter,Georgia,serif', titel: '"Inter Display",Inter,"Segoe UI",system-ui,sans-serif' },
        cafe: { nacht: '#1E130C', akzent: '#E0A458', zart: '#F1D9B5', licht: '#F7EFE2', muster: 'dampf', schrift: 'Georgia,"Times New Roman",serif', titel: '"Inter Display",Inter,"Segoe UI",system-ui,sans-serif' },
        handwerk: { nacht: '#111B24', akzent: '#F2A33A', zart: '#9FC3DC', licht: '#EEF2F4', muster: 'raster', schrift: 'Inter,"Segoe UI",system-ui,sans-serif', titel: '"Inter Display",Inter,"Segoe UI",system-ui,sans-serif' }
    };
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const zeilen = s => esc(s).split('|').map(x => x.trim()).filter(Boolean).join('<br>');
    const nurZiffern = s => String(s || '').replace(/[^\d+]/g, '');
    function telLink(tel) { const z = nurZiffern(tel); return z ? 'tel:' + z.replace(/^\+?/, z[0] === '+' ? '+' : '') : ''; }
    function waLink(tel) {
        let z = nurZiffern(tel).replace(/^\+/, '');
        if (/^0(15|16|17)/.test(z)) z = '49' + z.slice(1); else if (!/^49(15|16|17)/.test(z)) return '';
        return 'https://wa.me/' + z;
    }
    function routeLink(d) { const a = [d.name, d.strasse, d.plz, d.ort].filter(Boolean).join(', '); return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(a); }

    function seite(d) {
        d = d || {};
        const f = FARBEN[d.art] || FARBEN.friseur;
        const name = esc(d.name || 'Ihr Betrieb');
        const tel = telLink(d.tel), wa = waLink(d.tel);
        const adresse = [d.strasse, [d.plz, d.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ');
        const sz = (Array.isArray(d.szenen) ? d.szenen : []).slice(0, 3);
        const szenen = sz.map(s => '<section class="szene"><small>' + esc(s.klein) + '</small><h2>' + zeilen(s.titel) + '</h2><p>' + esc(s.text) + '</p></section>').join('');
        const leist = (Array.isArray(d.leistungen) ? d.leistungen : []).slice(0, 8);
        const leistHtml = leist.length ? '<section class="szene kurz"><small>Das machen wir</small><div class="liste">' + leist.map(l => '<div><span>' + esc(l[0]) + '</span><b>' + esc(l[1]) + '</b></div>').join('') + '</div></section>' : '';
        const zeiten = (Array.isArray(d.zeiten) ? d.zeiten : []).slice(0, 8);
        const zeitHtml = zeiten.length ? '<div class="liste">' + zeiten.map(z => '<div><span>' + esc(z[0]) + '</span><b>' + esc(z[1]) + '</b></div>').join('') + '</div>' : '';
        const knoepfe = (tel ? '<a class="btn k1" href="' + esc(tel) + '">' + esc(d.tel) + '</a>' : '') + (wa ? '<a class="btn k2" href="' + esc(wa) + '">WhatsApp</a>' : '') + '<a class="btn ' + (wa || !tel ? 'k2' : 'k2') + '" href="' + esc(routeLink(d)) + '">Route</a>';
        const css = ':root{--nacht:' + f.nacht + ';--akzent:' + f.akzent + ';--zart:' + f.zart + ';--licht:' + f.licht + '}' +
            '*{box-sizing:border-box;margin:0}html{background:var(--nacht);scroll-behavior:smooth}' +
            'body{background:transparent;color:var(--licht);font:19px/1.55 ' + f.schrift + '}' +
            'canvas{position:fixed;inset:0;width:100%;height:100%;z-index:-1;background:var(--nacht)}' +
            '.nav{position:fixed;top:0;left:0;right:0;z-index:4;display:flex;justify-content:space-between;align-items:center;padding:14px 20px;font:600 15px ' + f.titel + '}' +
            '.nav b{font:900 19px ' + f.titel + ';letter-spacing:-.02em}' +
            '.nav a{color:var(--nacht);background:var(--zart);padding:9px 15px;border-radius:999px;text-decoration:none;font-weight:700}' +
            '.nav a:focus-visible,.btn:focus-visible{outline:3px solid var(--licht);outline-offset:2px}' +
            '.szene{min-height:100vh;display:flex;flex-direction:column;justify-content:flex-end;padding:90px max(22px,6vw) 64px;max-width:1100px}' +
            '.szene.kurz{min-height:0;padding-top:48px;justify-content:flex-start}' +
            'h1,h2{font:900 clamp(52px,15vw,104px)/.9 ' + f.titel + ';letter-spacing:-.05em;overflow-wrap:anywhere}' +
            'h2{font-size:clamp(46px,13vw,88px)}' +
            '.szene p{margin-top:20px;max-width:30ch;font-size:20px;opacity:.92}' +
            '.szene small{display:block;margin-bottom:16px;font:500 14px ' + f.titel + ';opacity:.7}' +
            '.hand{display:flex;gap:10px;margin-top:26px;flex-wrap:wrap}' +
            '.btn{flex:1 1 140px;text-align:center;padding:16px 12px;border-radius:14px;font:700 16px ' + f.titel + ';text-decoration:none}' +
            '.k1{background:var(--zart);color:var(--nacht)}.k2{border:1.5px solid var(--licht);color:var(--licht)}' +
            '.liste{margin-top:22px;max-width:560px;font:500 17px ' + f.titel + '}' +
            '.liste div{display:flex;justify-content:space-between;gap:14px;padding:11px 0;border-bottom:1px solid rgba(255,255,255,.22)}' +
            '.liste b{color:var(--zart);text-align:right}' +
            '.adr{margin-top:20px;font:500 16px ' + f.titel + ';opacity:.8}' +
            'footer{padding:20px max(22px,6vw) 40px;font:500 12px ' + f.titel + ';opacity:.55}' +
            '@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}';
        const js = '(function(){var M="' + f.muster + '",cv=document.getElementById("c"),cx=cv.getContext("2d"),W,H,D=window.devicePixelRatio||1,t=0,p=0,s=7;' +
            'function r(){s=(s*16807)%2147483647;return s/2147483647}' +
            'var N=M==="raster"?0:(M==="dampf"?26:140),a=[];for(var i=0;i<N;i++)a.push({x:r(),ph:r()*6.28,fr:.6+r()*1.4,am:10+r()*38,len:.78+r()*.22,w:.5+r()*1.1,c:r()});' +
            'function gr(){W=innerWidth;H=innerHeight;cv.width=W*D;cv.height=H*D;cx.setTransform(D,0,0,D,0,0);z()}' +
            'function z(){cx.clearRect(0,0,W,H);' +
            'if(M==="raster"){var g=40,o=(p*H*.6)%g;cx.lineWidth=1;for(var x=0;x<=W;x+=g){cx.strokeStyle="rgba(159,195,220,"+(.06+.05*Math.sin(x*.03+t))+")";cx.beginPath();cx.moveTo(x,0);cx.lineTo(x,H);cx.stroke()}' +
            'for(var y=-g;y<=H;y+=g){cx.strokeStyle="rgba(159,195,220,.07)";cx.beginPath();cx.moveTo(0,y+o);cx.lineTo(W,y+o);cx.stroke()}' +
            'var m=(Math.sin(t*.5)*.5+.5)*W;cx.strokeStyle="rgba(242,163,58,.55)";cx.lineWidth=1.5;cx.beginPath();cx.moveTo(m,0);cx.lineTo(m,H);cx.stroke();return}' +
            'for(var k=0;k<a.length;k++){var q=a[k],x0=(q.x*1.2-.1)*W,e=H*q.len*(M==="dampf"?.9:1);cx.beginPath();' +
            'for(var y=M==="dampf"?H:-10;M==="dampf"?y>=H-e:y<=e;y+=M==="dampf"?-10:10){var f=M==="dampf"?(H-y)/H:y/H,xx=x0+Math.sin(f*q.fr*5+q.ph+t*.6)*q.am*(.4+f)+Math.sin(f*2.1+q.ph*2+p*3)*18;y===(M==="dampf"?H:-10)?cx.moveTo(xx,y):cx.lineTo(xx,y)}' +
            'cx.strokeStyle=q.c>.5?"rgba(224,164,88,"+(M==="dampf"?.22:.4)+")":"rgba(242,191,201,"+(M==="dampf"?.16:.34)+")";cx.lineWidth=q.w*(M==="dampf"?3:1);cx.stroke()}}' +
            'addEventListener("scroll",function(){p=scrollY/Math.max(1,document.documentElement.scrollHeight-innerHeight);z()},{passive:true});addEventListener("resize",gr);' +
            'var ruhig=matchMedia("(prefers-reduced-motion: reduce)").matches;function l(){t+=.016;if(!document.hidden&&!ruhig)z();requestAnimationFrame(l)}gr();if(!ruhig)l()})();';
        return '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + name + '</title><style>' + css + '</style></head><body>' +
            '<canvas id="c" aria-hidden="true"></canvas>' +
            '<div class="nav"><b>' + name + '</b>' + (tel ? '<a href="' + esc(tel) + '">Anrufen</a>' : '<a href="#besuch">Besuch</a>') + '</div>' +
            '<section class="szene"><h1>' + zeilen(d.kopf || name) + '</h1><p>' + esc(d.unter || '') + '</p></section>' +
            szenen + leistHtml +
            '<section class="szene" id="besuch"><small>Vorbeikommen</small><h2>' + zeilen(d.schluss || 'Wir freuen|uns auf dich.') + '</h2>' + zeitHtml +
            '<div class="hand">' + knoepfe + '</div>' + (adresse ? '<div class="adr">' + esc(d.name) + ' · ' + esc(adresse) + '</div>' : '') + '</section>' +
            '<footer>Entwurf, erstellt mit Jarvis. Impressum und Datenschutzerklärung fehlen noch und müssen vor der Veröffentlichung ergänzt werden.</footer>' +
            '<script>' + js + '<\/script></body></html>';
    }
    window.jvWebSeite = seite;
    window.jvWebVorlagen = { arten: Object.keys(FARBEN), farben: FARBEN };
})();
