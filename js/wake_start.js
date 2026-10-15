/* Zane Weckruf: Die kleine Android-App "Zane Weckruf" öffnet Zane mit ?wake=1.
   Dann sagt Zane "Ja?" und hört direkt zu - ohne Knopfdruck. */
(function () {
    try {
        var u = new URL(location.href);
        if (u.searchParams.get('wake') !== '1') return;
        u.searchParams.delete('wake');
        history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch (e) { return; }

    var started = false;
    function los() {
        if (started) return;
        started = true;
        try {
            if (typeof isRecording !== 'undefined' && isRecording) return;
            speakAck('Ja?', function () {
                try { startListening(false); } catch (e) {}
            });
        } catch (e) {
            try { startListening(false); } catch (e2) {}
        }
    }
    function warten() {
        if (typeof speakAck === 'function' && typeof startListening === 'function') {
            setTimeout(los, 600);
        } else {
            setTimeout(warten, 300);
        }
    }
    if (document.readyState === 'complete') warten();
    else window.addEventListener('load', warten);
})();
