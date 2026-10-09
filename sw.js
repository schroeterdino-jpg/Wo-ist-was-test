/* Hintergrund-Datei der App: zeigt Push-Nachrichten an, auch wenn die App geschlossen ist.
   Speichert nichts offline und greift nicht in das Laden der Seiten ein (kein fetch-Handler). */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (event) {
    var d = {};
    try { d = event.data ? event.data.json() : {}; } catch (e) { try { d = { body: event.data.text() }; } catch (e2) {} }
    var title = d.title || 'Jarvis';
    var alarm = d.alarm ? { stufe: d.alarm === 'orange' ? 'orange' : 'rot', titel: title, text: d.body || '' } : null;   // Warnung: auch die offene App färbt sich (js/alarm.js)
    var tellApp = !alarm ? Promise.resolve() : self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
        list.forEach(function (c) { try { c.postMessage({ jvAlarm: alarm }); } catch (e) {} });
    }).catch(function () {});
    event.waitUntil(tellApp.then(function () { return self.registration.showNotification(title, {
        body: d.body || '',
        icon: './icon-192.png',
        badge: './icon-192.png',
        tag: d.tag || undefined,
        actions: d.actions || undefined,
        data: { url: (alarm && (!d.url || d.url === './')) ? './?alarm=' + alarm.stufe + '&t=' + encodeURIComponent(alarm.titel) + '&b=' + encodeURIComponent(alarm.text) : (d.url || './'), doneUrl: d.doneUrl || '' }
    }); }));
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    if (event.action === 'done') {   // "Erledigt" am Sperrbildschirm: App bleibt zu
        var du = event.notification.data && event.notification.data.doneUrl;
        if (du) event.waitUntil(fetch(du, { method: 'POST' }).catch(function () {}));
        return;
    }
    var url = (event.notification.data && event.notification.data.url) || './';
    event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
        for (var i = 0; i < list.length; i++) { if ('focus' in list[i]) return list[i].focus(); }   // offene App: hat die Warnung beim Eintreffen schon gezeigt
        return self.clients.openWindow(url);
    }));
});

