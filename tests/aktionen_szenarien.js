/* Szenarien für das Messnetz tests/aktionen.js (Golden Master der Aktions-Kette).
   Jedes Szenario startet eine frische App (Uhr: Mi 28.10.2026 10:00 Berlin, Math.random = 0.5).
   Felder: name, wrapper (welche Umhüllungen hier etwas bewirken sollen), typen (Aktionstypen), netz ('aus' | 'ok' | 'google_fehler'),
           native (Handy-Brücke da), lage (Lagebild-Attrappe 'ok' | 'leer'), vorher(app) (Vorbereitung, zählt nicht zur Wirkung), schritte[].
   Schritt: { a: Aktion, text } = executeAction mit gemeinsamem ctx | { satz } = gesprochener Satz | { antworte: true/false } = Knopf der Löschfrage | { vor: ms } = Zeit läuft. */
'use strict';

const MORGEN = '2026-10-29T14:00:00+01:00';
const A = (a, text) => ({ a, text });
const S = [];
const sz = (name, o) => { S.push(Object.assign({ name, wrapper: [], typen: [], netz: 'aus', schritte: [] }, o)); };

/* Vorbereitungen (direkt über die Grundfunktionen, nicht über die Kette) */
const termin = (titel, zeit) => async app => { await app.sb.addGoogleCalendarEvent(titel, zeit || MORGEN, ''); };
const erinnerung = (titel, zeit) => async app => { await app.sb.addGoogleCalendarReminder(titel, zeit || '2026-10-28T18:00:00+01:00', null, false); };
const kontakte = async app => { app.setze('savedContacts', { mama: { originalName: 'Mama', phone: '030 1234567' } }); };
const standort = async app => { app.sb.navigator.geolocation.getCurrentPosition = ok => ok({ coords: { latitude: 52.52, longitude: 13.405, accuracy: 80 }, timestamp: app.uhr.ms }); };
const mehrere = (...f) => async app => { for (const x of f) await x(app); };

/* ===== 1. Grund-Aktionen (laufen durch die ganze Kette, bis zur Basis in actions.js) ===== */
sz('basis name_change', { typen: ['name_change'], schritte: [A({ type: 'name_change', new_name: 'Dino' }, 'Nenn mich Dino')] });
sz('basis shopping hinzufügen', { wrapper: ['routinen'], typen: ['shopping'], schritte: [A({ type: 'shopping', shopping_items: ['Milch', 'Brot'] }, 'Füge Milch und Brot hinzu')] });
sz('basis shopping nur fragen', { typen: ['shopping'], schritte: [A({ type: 'shopping', shopping_item: 'Milch' }, 'Was steht auf der Einkaufsliste')] });
sz('basis todo heute', { wrapper: ['routinen'], typen: ['todo'], schritte: [A({ type: 'todo', todo_items: ['Müll rausbringen'] }, 'Ich muss heute den Müll rausbringen')] });
sz('basis memory_store', { wrapper: ['gedaechtnis'], typen: ['memory_store'], netz: 'ok', schritte: [A({ type: 'memory_store', memory_key: 'Wlan Passwort', memory_value: 'blau42' }, 'Merk dir das Wlan Passwort ist blau42')] });
sz('basis memory_store ohne Schlüssel', { typen: ['memory_store'], schritte: [A({ type: 'memory_store', memory_value: 'x' }, 'Merk dir x')] });
sz('basis memory_search', { typen: ['memory_search'], schritte: [A({ type: 'memory_search', memory_key: 'wlan' }, 'Wie ist das Wlan Passwort')] });
sz('basis reminder', { wrapper: ['routinen'], typen: ['reminder'], schritte: [A({ type: 'reminder', reminder_text: 'Tabletten nehmen', reminder_time: '2026-10-28T18:00:00+01:00' }, 'Erinnere mich heute um 18 Uhr an Tabletten')] });
sz('basis reminder Google', { wrapper: ['routinen'], typen: ['reminder'], netz: 'ok', schritte: [A({ type: 'reminder', reminder_text: 'Tabletten nehmen', reminder_time: '2026-10-28T18:00:00+01:00' }, 'Erinnere mich heute um 18 Uhr an Tabletten')] });
sz('basis reminder Wiederholung wichtig', { wrapper: ['routinen'], typen: ['reminder'], netz: 'ok', schritte: [A({ type: 'reminder', reminder_text: 'Rechnung zahlen', reminder_time: '2026-10-30T09:00:00+01:00', reminder_recurrence_unit: 'WOCHE', reminder_recurrence_interval: 1, reminder_important: true }, 'Erinnere mich jeden Freitag an die Rechnung')] });
sz('basis calendar_update gefunden', { wrapper: ['langzeit_erinnern'], typen: ['calendar_update'], vorher: termin('Zahnarzt'), schritte: [A({ type: 'calendar_update', calendar_query: 'zahnarzt', calendar_time: '2026-10-29T16:00:00+01:00' }, 'Verschiebe den Zahnarzt auf 16 Uhr')] });
sz('basis calendar_update Google', { wrapper: ['langzeit_erinnern'], typen: ['calendar_update'], netz: 'ok', vorher: termin('Zahnarzt'), schritte: [A({ type: 'calendar_update', calendar_query: 'zahnarzt', calendar_text: 'Zahnarzt Dr. Weiß', calendar_time: '2026-10-29T16:00:00+01:00', calendar_location: 'Hauptstraße 1' }, 'Zahnarzt neuer Name')] });
sz('basis calendar_update nichts gefunden', { typen: ['calendar_update'], schritte: [A({ type: 'calendar_update', calendar_query: 'friseur', calendar_time: MORGEN }, 'Verschiebe den Friseur')] });
sz('basis parking_save', { wrapper: ['routinen'], typen: ['parking_save'], netz: 'ok', vorher: standort, schritte: [A({ type: 'parking_save', parking_note: 'Ebene 2' }, 'Merk dir meinen Parkplatz')] });
sz('basis home_save work_save', { typen: ['home_save', 'work_save'], schritte: [A({ type: 'home_save', home_address: 'Musterweg 5, 10115 Berlin' }, 'Ich wohne Musterweg 5'), A({ type: 'work_save', work_address: 'Arbeitsstraße 9, 10115 Berlin' }, 'Ich arbeite Arbeitsstraße 9')] });
sz('basis world_live', { typen: ['world_live'], schritte: [A({ type: 'world_live', live_type: 'kamera', news_place: 'Venedig' }, 'Zeig mir Venedig live'), A({ type: 'world_live', live_type: 'erdbeben' }, 'Erdbeben'), A({ type: 'world_live', live_type: 'iss' }, 'ISS')] });
sz('basis world_news', { typen: ['world_news'], schritte: [A({ type: 'world_news', news_place: 'Rom' }, 'Nachrichten aus Rom')] });
sz('basis protocol_save und delete', { typen: ['protocol_save', 'protocol_delete'], schritte: [
    A({ type: 'protocol_save', protocol_name: 'Feierabend', protocol_steps: ['Licht aus', 'Tür zu'] }, 'Protokoll Feierabend'),
    A({ type: 'protocol_delete', protocol_name: 'Feierabend' }, 'Lösche Protokoll Feierabend'),
    A({ type: 'protocol_delete', protocol_name: 'gibtsnicht' }, 'Lösche Protokoll gibtsnicht')] });
sz('basis protocol_save Fehler', { typen: ['protocol_save'], schritte: [A({ type: 'protocol_save', protocol_name: '', protocol_steps: [] }, 'Protokoll')] });
sz('basis backup_export', { typen: ['backup_export'], schritte: [A({ type: 'backup_export' }, 'Sichere meine Daten')] });
sz('basis parking_save ohne Standort', { wrapper: ['routinen'], typen: ['parking_save'], schritte: [A({ type: 'parking_save', parking_note: 'Ebene 2' }, 'Merk dir meinen Parkplatz')] });
sz('basis parking_clear ohne und mit Parkplatz', { typen: ['parking_clear', 'parking_save'], wrapper: ['routinen'], netz: 'ok', vorher: standort, schritte: [A({ type: 'parking_clear' }, 'Parkplatz löschen'), A({ type: 'parking_save', parking_note: '' }, 'Parke hier'), A({ type: 'parking_clear' }, 'Parkplatz löschen')] });
sz('basis navigate normal (Fußweg)', { typen: ['navigate'], schritte: [A({ type: 'navigate', nav_to: 'Alexanderplatz', nav_mode: 'walking' }, 'Navigiere zu Fuß zum Alexanderplatz')] });
sz('basis navigate mit Start', { typen: ['navigate'], wrapper: ['lagebild'], lage: 'ok', schritte: [A({ type: 'navigate', nav_to: 'Hamburg', nav_from: 'Berlin' }, 'Route von Berlin nach Hamburg')] });
sz('basis call mit Anrufwunsch (Handy)', { typen: ['call'], native: true, vorher: kontakte, schritte: [A({ type: 'call', contact_name: 'Mama' }, 'Ruf Mama an'), { vor: 4000 }] });
sz('basis call ohne Anrufwunsch', { typen: ['call'], native: true, vorher: kontakte, schritte: [A({ type: 'call', contact_name: 'Mama' }, 'Zeig mir die Nummer von Mama')] });
sz('basis call ohne Kontaktname', { typen: ['call'], schritte: [A({ type: 'call' }, 'Ruf an')] });
sz('basis call im Browser', { typen: ['call'], vorher: kontakte, schritte: [A({ type: 'call', contact_name: 'Mama' }, 'Ruf Mama an')] });
sz('basis whatsapp', { typen: ['whatsapp'], vorher: kontakte, schritte: [A({ type: 'whatsapp', contact_name: 'Mama', message_text: 'Bin gleich da' }, 'Schreib Mama bin gleich da')] });
sz('basis show_panel gültig und ungültig', { typen: ['show_panel'], schritte: [A({ type: 'show_panel', panel: 'termine', panel_range: 'woche' }, 'Zeig die Termine'), A({ type: 'show_panel', panel: 'gibtsnicht' }, 'Zeig das'), A({ type: 'show_panel', panel: 'menu' }, 'Zeig das Menü')] });
sz('basis list_edit', { typen: ['list_edit'], schritte: [A({ type: 'list_edit', list_name: 'einkauf', list_op: 'add', list_items: ['Milch', 'Brot'] }, 'Setz Milch und Brot auf die Liste'), A({ type: 'list_edit', list_name: 'einkauf', list_op: 'remove', list_items: ['Milch'] }, 'Streich Milch'), A({ type: 'list_edit', list_name: 'unsinn', list_op: 'add' }, 'Unsinn'), A({ type: 'list_edit', list_name: 'aufgaben', list_op: 'kaputt' }, 'Unsinn')] });
sz('basis calendar_search (ohne Wirkung)', { typen: ['calendar_search'], schritte: [A({ type: 'calendar_search', calendar_query: 'zahnarzt' }, 'Wann ist der Zahnarzt')] });
sz('basis briefing_add und delete', { typen: ['briefing_add', 'briefing_delete'], schritte: [
    A({ type: 'briefing_add', briefing_text: 'Sag mir morgens das Wetter' }, 'Im Briefing das Wetter'),
    A({ type: 'briefing_add', briefing_item: 'Schlüssel' }, 'Denk an den Schlüssel'),
    A({ type: 'briefing_add' }, 'Briefing leer'),
    A({ type: 'briefing_delete', briefing_query: 'wetter' }, 'Streich das Wetter'),
    A({ type: 'briefing_delete', briefing_query: 'nichtda' }, 'Streich nichtda')] });
sz('basis calendar normal ohne Google', { wrapper: ['routinen', 'langzeit_erinnern'], typen: ['calendar'], schritte: [A({ type: 'calendar', calendar_text: 'Zahnarzt', calendar_time: MORGEN }, 'Zahnarzttermin morgen um 14 Uhr')] });
sz('basis calendar normal mit Google', { wrapper: ['routinen', 'langzeit_erinnern'], typen: ['calendar'], netz: 'ok', schritte: [A({ type: 'calendar', calendar_text: 'Zahnarzt', calendar_time: MORGEN, calendar_location: 'Hauptstraße 1' }, 'Zahnarzttermin morgen um 14 Uhr in Berlin')] });
sz('basis calendar Google lehnt ab', { wrapper: ['routinen', 'langzeit_erinnern'], typen: ['calendar'], netz: 'google_fehler', schritte: [A({ type: 'calendar', calendar_text: 'Zahnarzt', calendar_time: MORGEN }, 'Zahnarzttermin morgen um 14 Uhr')] });
sz('basis calendar Serie', { wrapper: ['routinen', 'langzeit_erinnern'], typen: ['calendar'], netz: 'ok', schritte: [A({ type: 'calendar', calendar_text: 'Yoga', calendar_time: MORGEN, calendar_recurrence_unit: 'WOCHE', calendar_recurrence_interval: 1 }, 'Jeden Donnerstag Yoga um 14 Uhr')] });
sz('basis calendar nur calendar_text (ohne type)', { wrapper: ['routinen'], typen: ['calendar'], netz: 'ok', schritte: [A({ type: 'chat', calendar_text: 'Friseur', calendar_time: '2026-11-03T10:00:00+01:00' }, 'Friseur am Dienstag um 10 Uhr')] });

/* ===== 2. Formulierungen (formulierungen.js) ===== */
sz('formulierungen phrase_save mit Wunschwort', { wrapper: ['formulierungen'], typen: ['phrase_save'], schritte: [A({ type: 'phrase_save', phrase_old: 'Guten Tag', phrase_new: 'Moin' }, 'Sag in Zukunft Moin statt Guten Tag')] });
sz('formulierungen phrase_save ohne Wunschwort', { wrapper: ['formulierungen'], typen: ['phrase_save'], schritte: [A({ type: 'phrase_save', phrase_old: 'Guten Tag', phrase_new: 'Moin' }, 'Was kannst du alles')] });
sz('formulierungen phrase_save unvollständig', { wrapper: ['formulierungen'], typen: ['phrase_save'], schritte: [A({ type: 'phrase_save', phrase_old: 'Guten Tag' }, 'Sag ab jetzt etwas anderes')] });
sz('formulierungen phrase_delete', { wrapper: ['formulierungen'], typen: ['phrase_save', 'phrase_delete'], schritte: [
    A({ type: 'phrase_delete', phrase_query: 'moin' }, 'Vergiss das mit Moin'),
    A({ type: 'phrase_save', phrase_old: 'Guten Tag', phrase_new: 'Moin' }, 'Sag in Zukunft Moin statt Guten Tag'),
    A({ type: 'phrase_delete', phrase_query: 'nichtda' }, 'Vergiss das'),
    A({ type: 'phrase_delete', phrase_query: 'moin' }, 'Vergiss das mit Moin'),
    A({ type: 'phrase_delete', phrase_query: 'alle' }, 'Vergiss alle')] });

/* ===== 3. Langzeitgedächtnis (langzeit.js) ===== */
sz('langzeit episode_store ohne Termin', { wrapper: ['langzeit', 'langzeit_erinnern'], typen: ['episode_store'], netz: 'ok', schritte: [A({ type: 'episode_store', episode_text: 'Der User war gestern beim Arzt', episode_datum: '2026-10-27' }, 'Ich war gestern beim Arzt')] });
sz('langzeit episode_store mit Termin (Stundenfrage)', { wrapper: ['langzeit', 'langzeit_erinnern'], typen: ['episode_store'], netz: 'ok', schritte: [A({ type: 'episode_store', episode_text: 'Der User hat morgen ein Treffen mit Anna', episode_datum: '2026-10-29', episode_uhrzeit: '15:00' }, 'Ich treffe morgen um 15 Uhr Anna')] });
sz('langzeit episode_store offline', { wrapper: ['langzeit'], typen: ['episode_store'], schritte: [A({ type: 'episode_store', episode_text: 'Der User mag Tee', episode_datum: '2026-10-28' }, 'Ich mag Tee')] });
sz('langzeit episode_asked', { wrapper: ['langzeit'], typen: ['episode_asked'], netz: 'ok', schritte: [A({ type: 'episode_asked', episode_id: 'e1', episode_art: 'nachfrage' }, 'Danke fürs Fragen')] });
sz('langzeit episode_nicht_fragen', { wrapper: ['langzeit'], typen: ['episode_nicht_fragen'], netz: 'ok', schritte: [A({ type: 'episode_nicht_fragen', episode_query: 'arzt' }, 'Frag nicht mehr nach dem Arzt')] });
sz('langzeit Tageslog bei normaler Aktion', { wrapper: ['langzeit'], typen: ['shopping', 'todo'], schritte: [A({ type: 'shopping', shopping_item: 'Käse' }, 'Füge Käse hinzu'), A({ type: 'todo', todo_items: ['Post holen'] }, 'Aufgabe Post holen')] });

/* ===== 4. Löschfrage (loeschen_fragen.js) ===== */
sz('loeschen episode_forget Frage dann Ja (Satz)', { wrapper: ['loeschen_fragen', 'langzeit'], typen: ['episode_forget'], netz: 'ok', schritte: [A({ type: 'episode_forget', episode_query: 'arzt' }, 'Vergiss das mit dem Arzt'), { satz: 'Ja' }] });
sz('loeschen episode_forget ohne Suchwort', { wrapper: ['langzeit'], typen: ['episode_forget'], netz: 'ok', schritte: [A({ type: 'episode_forget' }, 'Vergiss das')] });
sz('loeschen episode_forget bestätigt direkt', { wrapper: ['langzeit'], typen: ['episode_forget'], netz: 'ok', schritte: [A({ type: 'episode_forget', episode_query: 'arzt', _bestaetigt: true }, 'Vergiss das mit dem Arzt')] });
sz('loeschen calendar_delete Frage dann Ja (Knopf)', { wrapper: ['loeschen_fragen'], typen: ['calendar_delete'], vorher: termin('Zahnarzt'), schritte: [A({ type: 'calendar_delete', calendar_query: 'zahnarzt' }, 'Lösche den Zahnarzt'), { antworte: true }] });
sz('loeschen calendar_delete Google Frage dann Ja', { wrapper: ['loeschen_fragen', 'langzeit_erinnern'], typen: ['calendar_delete'], netz: 'ok', vorher: termin('Zahnarzt'), schritte: [A({ type: 'calendar_delete', calendar_query: 'zahnarzt' }, 'Lösche den Zahnarzt'), { satz: 'ja bitte' }] });
sz('loeschen calendar_delete Frage dann Nein (Satz)', { wrapper: ['loeschen_fragen'], typen: ['calendar_delete'], vorher: termin('Zahnarzt'), schritte: [A({ type: 'calendar_delete', calendar_query: 'zahnarzt' }, 'Lösche den Zahnarzt'), { satz: 'Nein lass es' }] });
sz('loeschen calendar_delete Frage dann Nein (Knopf)', { wrapper: ['loeschen_fragen'], typen: ['calendar_delete'], vorher: termin('Zahnarzt'), schritte: [A({ type: 'calendar_delete', calendar_query: 'zahnarzt' }, 'Lösche den Zahnarzt'), { antworte: false }] });
sz('loeschen reminder_delete Frage dann Ja', { wrapper: ['loeschen_fragen'], typen: ['reminder_delete'], vorher: erinnerung('Tabletten nehmen'), schritte: [A({ type: 'reminder_delete', reminder_query: 'tabletten' }, 'Lösche die Erinnerung Tabletten'), { satz: 'Ja' }] });
sz('loeschen reminder_delete alle', { wrapper: ['loeschen_fragen'], typen: ['reminder_delete'], vorher: mehrere(erinnerung('Tabletten nehmen'), erinnerung('Müll raus', '2026-10-28T19:00:00+01:00')), schritte: [A({ type: 'reminder_delete', reminder_delete_all: true }, 'Lösche alle Erinnerungen'), { antworte: true }] });
sz('loeschen mehrere Löschwünsche in einer Runde', { wrapper: ['loeschen_fragen'], typen: ['calendar_delete', 'reminder_delete', 'episode_forget'], netz: 'ok', vorher: mehrere(termin('Zahnarzt'), erinnerung('Tabletten nehmen')), schritte: [
    A({ type: 'calendar_delete', calendar_query: 'zahnarzt' }, 'Lösche Zahnarzt und die Erinnerung'),
    A({ type: 'reminder_delete', reminder_query: 'tabletten' }, 'Lösche Zahnarzt und die Erinnerung'),
    A({ type: 'episode_forget', episode_query: 'arzt' }, 'Lösche Zahnarzt und die Erinnerung'),
    { satz: 'Ja' }] });
sz('loeschen zweite Frage nach Ablauf der Runde', { wrapper: ['loeschen_fragen'], typen: ['calendar_delete', 'reminder_delete'], vorher: mehrere(termin('Zahnarzt'), erinnerung('Tabletten nehmen')), schritte: [
    A({ type: 'calendar_delete', calendar_query: 'zahnarzt' }, 'Lösche den Zahnarzt'), { vor: 5000 },
    A({ type: 'reminder_delete', reminder_query: 'tabletten' }, 'Lösche die Erinnerung'), { satz: 'Ja' }] });
sz('loeschen Antwort auf etwas anderes', { wrapper: ['loeschen_fragen'], typen: ['calendar_delete'], vorher: termin('Zahnarzt'), schritte: [A({ type: 'calendar_delete', calendar_query: 'zahnarzt' }, 'Lösche den Zahnarzt'), { satz: 'Wie spät ist es eigentlich jetzt gerade' }, { satz: 'Ja' }] });
sz('loeschen Frage verfällt nach 2 Minuten', { wrapper: ['loeschen_fragen'], typen: ['calendar_delete'], vorher: termin('Zahnarzt'), schritte: [A({ type: 'calendar_delete', calendar_query: 'zahnarzt' }, 'Lösche den Zahnarzt'), { vor: 125000 }, { satz: 'Ja' }] });
sz('loeschen nichts zu löschen', { wrapper: ['loeschen_fragen'], typen: ['calendar_delete', 'reminder_delete'], schritte: [A({ type: 'calendar_delete', calendar_query: 'zahnarzt' }, 'Lösche den Zahnarzt'), A({ type: 'reminder_delete', reminder_query: 'x' }, 'Lösche Erinnerung x')] });

/* ===== 5. Geburtstag / Ganztag (geburtstag_ganztag.js) ===== */
sz('ganztag Geburtstag über Text', { wrapper: ['geburtstag_ganztag'], typen: ['calendar'], netz: 'ok', schritte: [A({ type: 'calendar', calendar_text: 'Alyssas Geburtstag', calendar_time: '2026-10-30T00:00:00+01:00' }, 'Trag Alyssas Geburtstag am 30. Oktober ein')] });
sz('ganztag Geburtstag ohne Google', { wrapper: ['geburtstag_ganztag'], typen: ['calendar'], schritte: [A({ type: 'calendar', calendar_text: 'Alyssas Geburtstag', calendar_time: '2026-10-30' }, 'Trag Alyssas Geburtstag am 30. Oktober ein')] });
sz('ganztag calendar_allday ohne Festwort', { wrapper: ['geburtstag_ganztag'], typen: ['calendar_allday'], netz: 'ok', schritte: [A({ type: 'calendar', calendar_text: 'Betriebsausflug', calendar_time: '2026-11-05T00:00:00+01:00', calendar_allday: true }, 'Am 5. November ist Betriebsausflug ganztägig')] });
sz('ganztag allday als Text "true"', { wrapper: ['geburtstag_ganztag'], typen: ['calendar_allday'], netz: 'ok', schritte: [A({ type: 'calendar', calendar_text: 'Urlaubstag', calendar_time: '2026-11-06', calendar_allday: 'true' }, 'Am 6. November Urlaubstag')] });
sz('ganztag doppelt eingetragen', { wrapper: ['geburtstag_ganztag'], typen: ['calendar'], vorher: async app => { await app.sb.addGoogleCalendarEvent('Alyssas Geburtstag', '2026-10-30T12:00:00+01:00', '', null, true); }, schritte: [A({ type: 'calendar', calendar_text: 'Alyssas Geburtstag', calendar_time: '2026-10-30T00:00:00+01:00' }, 'Trag Alyssas Geburtstag am 30. Oktober ein')] });
sz('ganztag Geburtstag ohne Tag fällt durch', { wrapper: ['geburtstag_ganztag'], typen: ['calendar'], schritte: [A({ type: 'calendar', calendar_text: 'Geburtstag', calendar_time: '' }, 'Geburtstag eintragen')] });
sz('ganztag Termin mit Uhrzeit bleibt normal', { wrapper: ['geburtstag_ganztag', 'langzeit_erinnern'], typen: ['calendar'], netz: 'ok', schritte: [A({ type: 'calendar', calendar_text: 'Arzt', calendar_time: MORGEN }, 'Arzt morgen um 14 Uhr')] });

/* ===== 6. Termin-Erinnerung (langzeit_erinnern.js) ===== */
sz('erinnern Stundenfrage und Antwort mit Zusatz-Erinnerung', { wrapper: ['langzeit_erinnern'], typen: ['calendar'], netz: 'ok', schritte: [A({ type: 'calendar', calendar_text: 'Zahnarzt', calendar_time: MORGEN }, 'Zahnarzttermin morgen um 14 Uhr'), { satz: '2 Stunden' }] });
sz('erinnern calendar_update nimmt Zusatz-Erinnerung mit', { wrapper: ['langzeit_erinnern'], typen: ['calendar_update'], netz: 'ok', schritte: [
    A({ type: 'calendar', calendar_text: 'Zahnarzt', calendar_time: MORGEN }, 'Zahnarzttermin morgen um 14 Uhr'), { satz: '2 Stunden' },
    A({ type: 'calendar_update', calendar_query: 'zahnarzt', calendar_time: '2026-10-29T16:00:00+01:00' }, 'Verschiebe den Zahnarzt auf 16 Uhr')] });
sz('erinnern calendar_delete löscht Zusatz-Erinnerung (nach Ja)', { wrapper: ['langzeit_erinnern', 'loeschen_fragen'], typen: ['calendar_delete'], netz: 'ok', schritte: [
    A({ type: 'calendar', calendar_text: 'Zahnarzt', calendar_time: MORGEN }, 'Zahnarzttermin morgen um 14 Uhr'), { satz: '2 Stunden' },
    A({ type: 'calendar_delete', calendar_query: 'zahnarzt' }, 'Lösche den Zahnarzt'), { satz: 'Ja' }] });
sz('erinnern calendar_delete bestätigt direkt (mit Zusatz-Erinnerung)', { wrapper: ['langzeit_erinnern'], typen: ['calendar_delete'], netz: 'ok', schritte: [
    A({ type: 'calendar', calendar_text: 'Zahnarzt', calendar_time: MORGEN }, 'Zahnarzttermin morgen um 14 Uhr'), { satz: '2 Stunden' },
    A({ type: 'calendar_delete', calendar_query: 'zahnarzt', _bestaetigt: true }, 'Lösche den Zahnarzt')] });
sz('erinnern Aufgabe mit "muss" erkennt Termin', { wrapper: ['langzeit_erinnern'], typen: ['todo'], schritte: [A({ type: 'todo', todo_items: ['Zum Amt'] }, 'Ich muss morgen um 9 Uhr zum Amt')] });
sz('erinnern Anfrage selbst erinnert (keine Frage)', { wrapper: ['langzeit_erinnern'], typen: ['calendar'], netz: 'ok', schritte: [A({ type: 'calendar', calendar_text: 'Zahnarzt', calendar_time: MORGEN }, 'Zahnarzt morgen um 14 Uhr und erinnere mich zwei Stunden vorher')] });
sz('erinnern Termin ausgeschaltet', { wrapper: ['langzeit_erinnern'], typen: ['calendar'], netz: 'ok', vorher: async app => { app.store['jv_termin_erinnern'] = '0'; }, schritte: [A({ type: 'calendar', calendar_text: 'Zahnarzt', calendar_time: MORGEN }, 'Zahnarzttermin morgen um 14 Uhr')] });
sz('erinnern Termin zu nah (unter 30 Minuten)', { wrapper: ['langzeit_erinnern'], typen: ['calendar'], netz: 'ok', schritte: [A({ type: 'calendar', calendar_text: 'Anruf', calendar_time: '2026-10-28T10:20:00+01:00' }, 'Anruf heute um 10:20')] });

/* ===== 7. Lagebild (lagebild.js) ===== */
sz('lagebild navigate mit Lagebild', { wrapper: ['lagebild'], typen: ['navigate'], lage: 'ok', schritte: [A({ type: 'navigate', nav_to: 'Flughafen BER' }, 'Route zum Flughafen BER')] });
sz('lagebild navigate driving ausdrücklich', { wrapper: ['lagebild'], typen: ['navigate'], lage: 'ok', schritte: [A({ type: 'navigate', nav_to: 'Hamburg', nav_mode: 'driving' }, 'Fahr mich nach Hamburg')] });
sz('lagebild ohne Antwort fällt auf Maps zurück', { wrapper: ['lagebild'], typen: ['navigate'], lage: 'leer', schritte: [A({ type: 'navigate', nav_to: 'Flughafen BER' }, 'Route zum Flughafen BER')] });
sz('lagebild Parkplatz-Navigation', { wrapper: ['lagebild'], typen: ['navigate'], lage: 'ok', schritte: [A({ type: 'navigate', nav_to: 'Mein Parkplatz' }, 'Bring mich zu meinem Parkplatz'), A({ type: 'navigate', nav_to: 'Auto' }, 'Zum Auto')] });
sz('lagebild navigate Fahrrad bleibt Maps', { wrapper: ['lagebild'], typen: ['navigate'], lage: 'ok', schritte: [A({ type: 'navigate', nav_to: 'Park', nav_mode: 'bicycling' }, 'Mit dem Rad zum Park')] });
sz('lagebild Navigation mit Tageslog (Route geöffnet)', { wrapper: ['lagebild', 'langzeit'], typen: ['navigate'], lage: 'ok', schritte: [A({ type: 'navigate', nav_to: 'Flughafen BER' }, 'Route zum Flughafen BER')] });

/* ===== 8. Routinen (routinen.js) ===== */
sz('routinen zählt jede Art', { wrapper: ['routinen'], typen: ['shopping', 'todo', 'reminder', 'calendar', 'parking_save', 'calendar_allday'], netz: 'ok', schritte: [
    A({ type: 'shopping', shopping_item: 'Eier' }, 'Füge Eier hinzu'), A({ type: 'todo', todo_items: ['Wäsche'] }, 'Aufgabe Wäsche'),
    A({ type: 'reminder', reminder_text: 'Anruf', reminder_time: '2026-10-28T18:00:00+01:00' }, 'Erinnere mich'),
    A({ type: 'calendar', calendar_text: 'Zahnarzt', calendar_time: MORGEN }, 'Zahnarzt morgen um 14 Uhr und erinnere mich'),
    A({ type: 'parking_save', parking_note: '' }, 'Parke hier'),
    A({ type: 'calendar', calendar_text: 'Geburtstag Oma', calendar_time: '2026-11-02' }, 'Omas Geburtstag')] });
sz('routinen zählt nicht bei Löschfrage-Ausnahme und unbekannter Art', { wrapper: ['routinen'], typen: ['calendar_delete', 'memory_search', 'world_news'], vorher: termin('Zahnarzt'), schritte: [
    A({ type: 'calendar_delete', calendar_query: 'zahnarzt' }, 'Lösche den Zahnarzt'), A({ type: 'memory_search', memory_key: 'x' }, 'Wo ist x'), A({ type: 'world_news', news_place: 'Rom' }, 'News')] });
sz('routinen mehrfach gleiche Art', { wrapper: ['routinen'], typen: ['shopping'], schritte: [A({ type: 'shopping', shopping_item: 'a' }, 'Füge a hinzu'), A({ type: 'shopping', shopping_item: 'b' }, 'Füge b hinzu'), A({ type: 'shopping', shopping_item: 'c' }, 'Füge c hinzu')] });

/* ===== 9. Gedächtnis (gedaechtnis.js) ===== */
sz('gedaechtnis memory_store zweimal schnell', { wrapper: ['gedaechtnis'], typen: ['memory_store'], netz: 'ok', schritte: [A({ type: 'memory_store', memory_key: 'katze', memory_value: 'Minka' }, 'Merk dir meine Katze heißt Minka'), A({ type: 'memory_store', memory_key: 'katze', memory_value: 'Minka' }, 'Merk dir meine Katze heißt Minka')] });
sz('gedaechtnis andere Aktion kein Eintrag', { wrapper: ['gedaechtnis'], typen: ['todo'], netz: 'ok', schritte: [A({ type: 'todo', todo_items: ['x'] }, 'Merk dir Aufgabe x')] });

/* ===== 10. Unbekanntes, mehrere Aktionen, Fehler ===== */
sz('unbekannte Aktion', { typen: ['(unbekannt)'], schritte: [A({ type: 'gibtsnicht', foo: 1 }, 'Mach etwas Seltsames')] });
sz('Aktion chat ohne Wirkung', { typen: ['chat'], schritte: [A({ type: 'chat' }, 'Hallo')] });
sz('Aktion ohne Typ', { typen: ['(ohne Typ)'], schritte: [A({}, 'Hallo')] });
sz('Aktion null (Fehlerfall)', { typen: ['(null)'], schritte: [A(null, 'Hallo')] });
sz('Aktion ohne Text', { typen: ['shopping'], schritte: [A({ type: 'shopping', shopping_item: 'Salz' }, undefined), A({ type: 'phrase_save', phrase_old: 'a', phrase_new: 'b' }, undefined)] });
sz('mehrere Aktionen in einer Äußerung', { wrapper: ['routinen', 'langzeit'], typen: ['shopping', 'todo', 'reminder', 'calendar'], netz: 'ok', schritte: [
    A({ type: 'shopping', shopping_items: ['Milch', 'Brot'] }, 'Füge Milch und Brot hinzu, Aufgabe Post holen, erinnere mich um 18 Uhr und Zahnarzt morgen um 14 Uhr'),
    A({ type: 'todo', todo_items: ['Post holen', 'Müll'] }, 'Füge Milch und Brot hinzu, Aufgabe Post holen, erinnere mich um 18 Uhr und Zahnarzt morgen um 14 Uhr'),
    A({ type: 'reminder', reminder_text: 'Tabletten', reminder_time: '2026-10-28T18:00:00+01:00' }, 'Füge Milch und Brot hinzu, Aufgabe Post holen, erinnere mich um 18 Uhr und Zahnarzt morgen um 14 Uhr'),
    A({ type: 'calendar', calendar_text: 'Zahnarzt', calendar_time: MORGEN }, 'Füge Milch und Brot hinzu, Aufgabe Post holen, erinnere mich um 18 Uhr und Zahnarzt morgen um 14 Uhr')] });
sz('mehrere Aktionen mit Fehler in der Mitte', { typen: ['shopping', 'show_panel', 'todo'], schritte: [
    A({ type: 'shopping', shopping_item: 'Tee' }, 'Tee, Fenster und Aufgabe'), A({ type: 'show_panel', panel: 'gibtsnicht' }, 'Tee, Fenster und Aufgabe'), A({ type: 'todo', todo_items: ['Zeitung'] }, 'Tee, Fenster und Aufgabe')] });
sz('mehrere Aktionen mit Löschfrage in der Mitte', { wrapper: ['loeschen_fragen'], typen: ['shopping', 'calendar_delete', 'todo'], vorher: termin('Zahnarzt'), schritte: [
    A({ type: 'shopping', shopping_item: 'Tee' }, 'Tee, Zahnarzt löschen, Aufgabe'), A({ type: 'calendar_delete', calendar_query: 'zahnarzt' }, 'Tee, Zahnarzt löschen, Aufgabe'), A({ type: 'todo', todo_items: ['Zeitung'] }, 'Tee, Zahnarzt löschen, Aufgabe'), { satz: 'Nein' }] });
sz('Fehler Google-Dienst fällt aus bei Erinnerung und Löschen', { wrapper: ['loeschen_fragen'], typen: ['reminder', 'reminder_delete'], netz: 'google_fehler', schritte: [
    A({ type: 'reminder', reminder_text: 'Tabletten', reminder_time: '2026-10-28T18:00:00+01:00' }, 'Erinnere mich um 18 Uhr'),
    A({ type: 'reminder_delete', reminder_query: 'tabletten' }, 'Lösche die Erinnerung Tabletten'), { satz: 'Ja' }] });

module.exports = { SZENARIEN: S };
