/* Interface language. English is written in the code; German comes from this table.
   The page is translated after each change, so the app code stays in one language.
   Only exact interface strings are replaced; user text (messages, character names) is left alone. */
(function () {
  "use strict";

  var DE = {
    "Home": "Start", "Chats": "Chats", "Characters": "Charaktere", "Community": "Community", "Profile": "Profil",
    "Settings": "Einstellungen", "Server Management": "Server-Verwaltung", "Admin": "Admin", "User": "Benutzer",
    "Loading…": "Lädt…",
    // login
    "Welcome back": "Willkommen zurück", "Username": "Benutzername", "Password": "Passwort", "Stay logged in": "Angemeldet bleiben",
    "Logs in for 48 hours.": "Anmeldung gilt 48 Stunden.", "Stays logged in on this device.": "Bleibt auf diesem Gerät angemeldet.",
    "Log in": "Anmelden", "Your characters and chats live on your own server.": "Deine Charaktere und Chats liegen auf deinem eigenen Server.",
    "Create an account with an invite code": "Konto mit Einladungscode erstellen", "Invite code": "Einladungscode",
    "Create account": "Konto erstellen", "Account created. You can log in now.": "Konto erstellt. Du kannst dich jetzt anmelden.",
    "Wrong username or password": "Benutzername oder Passwort falsch",
    "Too many failed logins. Try again later.": "Zu viele Fehlversuche. Bitte später erneut versuchen.",
    // home
    "Welcome back ": "Willkommen zurück", "Pick up where you left off.": "Mach weiter, wo du aufgehört hast.",
    "Create your first character.": "Erstelle deinen ersten Charakter.",
    "Your most recent conversation is below. Messages sync to every device.": "Dein letzter Chat steht unten. Nachrichten werden auf allen Geräten synchronisiert.",
    "Characters are the people you chat with. Make one, then start a chat.": "Charaktere sind die Personen, mit denen du chattest. Erstelle einen und starte einen Chat.",
    "Open chats": "Chats öffnen", "My characters": "Meine Charaktere", "conversations": "Unterhaltungen", "Messages": "Nachrichten",
    "in all chats": "in allen Chats", "Hosted API today": "Gehostete API heute", "Recent chats": "Letzte Chats", "No chats yet.": "Noch keine Chats.",
    "You": "Du", "Open profile": "Profil öffnen", "No messages yet": "Noch keine Nachrichten",
    // chats
    "Conversations": "Unterhaltungen", "Pick a conversation. Messages sync to every device.": "Wähle eine Unterhaltung. Nachrichten werden auf allen Geräten synchronisiert.",
    "New chat": "Neuer Chat", "Search chats or characters": "Chats oder Charaktere suchen", "All": "Alle", "Unread": "Ungelesen",
    "Pinned": "Angeheftet", "Important": "Wichtig", "Recent": "Neueste", "No chats match.": "Keine passenden Chats.",
    "Try another search or filter.": "Andere Suche oder Filter versuchen.", "Start one from Characters.": "Starte einen bei den Charakteren.",
    "Pick a conversation": "Wähle eine Unterhaltung", "Your chats stay here, synced to every device.": "Deine Chats bleiben hier, synchronisiert auf allen Geräten.",
    "Model:": "Modell:", "Self-hosted model (unlimited)": "Eigenes Modell (unbegrenzt)", "Hosted API (daily limit)": "Gehostete API (Tageslimit)",
    "Continue": "Weiter", "Describe the scene": "Szene beschreiben", "Shorter": "Kürzer", "Longer": "Länger", "Narrate the weather": "Wetter erzählen",
    "Write your line or action…": "Schreib deinen Text oder deine Aktion…", "Mark important": "Als wichtig markieren",
    "Story so far": "Bisherige Geschichte", "Story summary saved": "Zusammenfassung gespeichert", "No story summary yet": "Noch keine Zusammenfassung",
    "No summary yet. It is written automatically after every 40 messages and keeps long stories consistent.":
      "Noch keine Zusammenfassung. Sie wird alle 40 Nachrichten automatisch geschrieben und hält lange Geschichten stimmig.",
    "Marked important": "Als wichtig markiert", "Unmarked": "Markierung entfernt",
    // characters
    "Your library": "Deine Sammlung", "Import card": "Karte importieren", "New character": "Neuer Charakter",
    "Characters you created. You can edit and delete only these. Import SillyTavern cards (JSON or PNG) or plain text.":
      "Charaktere, die du erstellt hast. Nur diese kannst du bearbeiten und löschen. Importiere SillyTavern-Karten (JSON oder PNG) oder Text.",
    "Create a new character": "Neuen Charakter erstellen", "Chat": "Chat", "Edit": "Bearbeiten", "Publish": "Veröffentlichen",
    "Private": "Privat", "In review": "In Prüfung", "Public": "Öffentlich", "No description yet.": "Noch keine Beschreibung.",
    "Character": "Charakter", "New character ": "Neuer Charakter", "Name": "Name", "Tagline": "Kurzbeschreibung", "Description": "Beschreibung",
    "Personality": "Persönlichkeit", "Greeting": "Begrüßung", "Scenario": "Szenario", "Tags (comma-separated)": "Tags (mit Komma getrennt)",
    "Profile picture": "Profilbild", "Save character": "Charakter speichern", "Cancel": "Abbrechen", "Delete character": "Charakter löschen",
    "Click again to delete": "Zum Löschen erneut klicken", "Character saved": "Charakter gespeichert", "Character deleted": "Charakter gelöscht",
    "Adults only (18+). Pictures: PNG, JPG or WebP, up to 10 MB.": "Nur Erwachsene (18+). Bilder: PNG, JPG oder WebP, bis 10 MB.",
    "Sent to review": "Zur Prüfung gesendet",
    // community
    "Shared by users": "Von Benutzern geteilt", "Characters others have published. Add one to your list, then start a chat.":
      "Charaktere, die andere veröffentlicht haben. Füge einen zu deiner Liste hinzu und starte einen Chat.",
    "Featured": "Empfohlen", "Start chat": "Chat starten", "Add to my characters": "Zu meinen Charakteren", "Add": "Hinzufügen",
    "Fantasy": "Fantasy", "Modern": "Modern", "Drama": "Drama", "Yours": "Deiner", "Shared by a user": "Von einem Benutzer geteilt",
    "Added to your characters": "Zu deinen Charakteren hinzugefügt",
    "Nothing published yet. Publish one of your characters from the Characters page; an admin approves it first.":
      "Noch nichts veröffentlicht. Veröffentliche einen Charakter auf der Charakter-Seite; ein Admin gibt ihn zuerst frei.",
    // profile
    "Account": "Konto", "Details": "Details", "Display name": "Anzeigename", "Save profile": "Profil speichern", "Profile saved": "Profil gespeichert",
    "Your data": "Deine Daten", "Download everything you own as JSON.": "Lade alles, was dir gehört, als JSON herunter.",
    "Everything": "Alles", "characters": "Charaktere", "chats": "Chats", "messages": "Nachrichten",
    // settings
    "Preferences": "Einstellungen", "Changes apply at once on all your devices.": "Änderungen gelten sofort auf all deinen Geräten.",
    "Color theme": "Farbthema", "The accent color for the whole app.": "Die Akzentfarbe für die ganze App.", "Active": "Aktiv",
    "Appearance": "Darstellung", "System follows your device.": "System folgt deinem Gerät.", "System": "System", "Light": "Hell", "Dark": "Dunkel",
    "Replies": "Antworten", "Reply length": "Antwortlänge", "Short": "Kurz", "Medium": "Mittel", "Long": "Lang",
    "Context sent to the model": "Kontext für das Modell", "Last 20 messages": "Letzte 20 Nachrichten",
    "Last 60 messages + summary": "Letzte 60 Nachrichten + Zusammenfassung", "Last 200 messages + summary": "Letzte 200 Nachrichten + Zusammenfassung",
    "Language": "Sprache", "Interface": "Oberfläche", "Replies in": "Antworten auf", "Automatic (my language)": "Automatisch (meine Sprache)",
    "Log out on this device": "Auf diesem Gerät abmelden", "Log out on all devices": "Auf allen Geräten abmelden",
    // admin
    "Admins only": "Nur für Admins", "The server, the users and the models.": "Server, Benutzer und Modelle.",
    "Overview": "Übersicht", "Users": "Benutzer", "Hosted API": "Gehostete API", "Access & security": "Zugang & Sicherheit",
    "Domain & HTTPS": "Domain & HTTPS", "Models": "Modelle", "Backups": "Backups", "Storage": "Speicher", "Logs & maintenance": "Logs & Wartung",
    "accounts": "Konten", "all users": "alle Benutzer", "stored": "gespeichert", "messages, all users": "Nachrichten, alle Benutzer",
    "Disk": "Festplatte", "Endpoints and status": "Endpunkte und Status", "Self-hosted model": "Eigenes Modell", "Database": "Datenbank",
    "Maintenance mode": "Wartungsmodus", "On": "An", "Off": "Aus", "Save": "Speichern", "Saved": "Gespeichert", "Nothing changed.": "Nichts geändert.",
    "Role": "Rolle", "Status": "Status", "Disable": "Sperren", "Enable": "Freigeben", "Disabled": "Gesperrt", "Add user": "Benutzer hinzufügen",
    "User created": "Benutzer erstellt", "Settings for new accounts": "Einstellungen für neue Konten",
    "Community review queue": "Community-Prüfliste", "Approve": "Freigeben", "Hide": "Ausblenden", "Nothing waiting for review.": "Nichts zu prüfen.",
    "Community and import": "Community und Import", "Allow card import": "Karten-Import erlauben",
    "Limits for the hosted API": "Limits für die gehostete API", "Messages per user per day": "Nachrichten pro Benutzer und Tag",
    "Total per day (all users)": "Gesamt pro Tag (alle Benutzer)", "Recommended providers": "Empfohlene Anbieter",
    "Sign-up": "Registrierung", "New invite code": "Neuer Einladungscode", "New accounts": "Neue Konten",
    "Closed (admin creates users)": "Geschlossen (Admin legt Benutzer an)", "With invite code": "Mit Einladungscode",
    "Sessions and lockout": "Sitzungen und Sperre", "Login lasts (hours)": "Anmeldung gilt (Stunden)",
    "\"Stay logged in\" lasts (days)": "„Angemeldet bleiben“ gilt (Tage)", "Lock after failed tries": "Sperre nach Fehlversuchen",
    "Lock time (minutes)": "Sperrzeit (Minuten)", "Minimum password length": "Mindestlänge Passwort", "Log out everyone": "Alle abmelden",
    "Ends every login, including yours. Users must log in again.": "Beendet jede Anmeldung, auch deine. Alle müssen sich neu anmelden.",
    "Address": "Adresse", "Domain (optional)": "Domain (optional)", "HTTPS is set up": "HTTPS ist eingerichtet",
    "Where to reach Compain": "Wo Compain erreichbar ist", "Name of the self-hosted model": "Name des eigenen Modells",
    "Default for new chats": "Standard für neue Chats", "Self-hosted model ": "Eigenes Modell", "Speed test": "Geschwindigkeitstest",
    "Run speed test": "Test starten", "No speed test yet.": "Noch kein Test.", "Testing…": "Teste…",
    "Nightly backup": "Nächtliches Backup", "Time (24-hour clock)": "Uhrzeit (24 Stunden)", "Keep backups for (days)": "Backups behalten (Tage)",
    "Include character pictures": "Charakterbilder einschließen", "Back up now": "Jetzt sichern", "No backups yet.": "Noch keine Backups.",
    "File": "Datei", "Size": "Größe", "Created": "Erstellt", "Download": "Herunterladen", "Restore": "Wiederherstellen",
    "Uploads and disk": "Uploads und Festplatte", "Largest upload (MB)": "Größter Upload (MB)",
    "Warn when the disk is full at (%)": "Warnen bei Festplattenfüllung (%)", "Cleanup": "Aufräumen",
    "Remove unused pictures": "Unbenutzte Bilder entfernen", "Removes picture files that no character uses any more.": "Entfernt Bilddateien, die kein Charakter mehr nutzt.",
    "Maintenance": "Wartung", "Notice for users": "Hinweis für Benutzer", "Logging": "Protokolle",
    "Keep chat content in logs": "Chat-Inhalte in Logs speichern", "Keep logs (days)": "Logs behalten (Tage)",
    "Recent admin activity": "Letzte Admin-Aktionen", "Nothing yet.": "Noch nichts.", "Time": "Zeit", "Action": "Aktion", "Detail": "Detail",
    "Done": "Erledigt", "Model endpoints": "Modell-Endpunkte",
    "Provider": "Anbieter", "Model": "Modell", "Endpoint (OpenAI-compatible)": "Endpunkt (OpenAI-kompatibel)", "API key": "API-Schlüssel",
    "Save provider": "Anbieter speichern", "Test connection": "Verbindung testen",
    "The key is stored encrypted and never shown again. It is also inside backups (encrypted), so keep COMPAIN_SECRET_KEY safe.":
      "Der Schlüssel wird verschlüsselt gespeichert und nie wieder angezeigt. Er ist auch (verschlüsselt) in Backups enthalten, also COMPAIN_SECRET_KEY sicher aufbewahren.",
    "Self-hosted models are unlimited.": "Eigene Modelle sind unbegrenzt.",
    "Context window per request (tokens)": "Kontextfenster pro Anfrage (Tokens)",
    "Are you 18 or older?": "Bist du 18 Jahre oder älter?",
    "Compain is for adults only. You answer this once for your account.": "Compain ist nur für Erwachsene. Du beantwortest das einmal für dein Konto.",
    "Yes, I am 18 or older": "Ja, ich bin 18 oder älter", "No": "Nein",
    "Compain is for adults only (18+).": "Compain ist nur für Erwachsene (18+).",
    "Extra long": "Extra lang",
    "Design": "Design", "How Compain looks on all your devices.": "So sieht Compain auf all deinen Geräten aus.",
    "Classic": "Klassisch", "Sidebar, solid surfaces": "Seitenleiste, feste Flächen", "Glass": "Glass",
    "Glass panels over a background": "Glas-Flächen über einem Hintergrund", "Modern": "Modern",
    "Navigation on top, calm surfaces": "Navigation oben, ruhige Flächen", "Modern Glass": "Modern Glass",
    "Navigation on top, glass over a background": "Navigation oben, Glas über einem Hintergrund",
    "Background": "Hintergrund", "Dusk": "Abend", "Night": "Nacht", "Forest": "Wald", "None": "Keiner",
    "Blur": "Unschärfe", "Panel opacity": "Deckkraft", "Dim background": "Hintergrund abdunkeln",
    "On phones the blur is switched off, so scrolling stays smooth.": "Auf Handys ist die Unschärfe aus, damit das Scrollen flüssig bleibt.",
    "Accent color and tinted surfaces for the whole app.": "Akzentfarbe und getönte Flächen für die ganze App.",
    "Ember": "Glut", "Indigo": "Indigo", "Emerald": "Smaragd", "Ocean": "Ozean", "Rose": "Rose", "Amber": "Bernstein", "Mono": "Mono",
    "Close": "Schließen", "Changelog": "Changelog", "Impressum": "Impressum",
    "The Impressum is not set up yet. The operator creates the file .impressum (template: .impressum-example).":
      "Das Impressum ist noch nicht eingerichtet. Der Betreiber legt die Datei .impressum an (Vorlage: .impressum-example).",
    "No changelog found.": "Kein Changelog gefunden.", "About Compain": "Über Compain", "What changed, and who runs this server.": "Was sich geändert hat und wer diesen Server betreibt.", "From .env (default)": "Aus .env (Standard)"
  };

  var lang = "en";
  var ATTRS = ["placeholder", "aria-label", "title"];

  function tr(text) {
    if (lang !== "de" || !text) return text;
    var trimmed = text.trim();
    var hit = DE[trimmed];
    if (hit === undefined) return text;
    return text.replace(trimmed, hit);
  }

  function translate(root) {
    if (lang !== "de" || !root) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        // Never touch user content: chat bubbles, editable fields, chat previews.
        var p = n.parentElement;
        if (!p || p.closest(".bubble, textarea, input, .preview, .desc, .title, code, [data-no-i18n]")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (n) {
      var out = tr(n.nodeValue);
      if (out !== n.nodeValue) n.nodeValue = out;
    });
    var els = root.querySelectorAll ? root.querySelectorAll("[placeholder],[aria-label],[title]") : [];
    Array.prototype.forEach.call(els, function (e) {
      ATTRS.forEach(function (a) {
        var v = e.getAttribute(a);
        if (v) { var out = tr(v); if (out !== v) e.setAttribute(a, out); }
      });
    });
  }

  var observer = new MutationObserver(function (records) {
    if (lang !== "de") return;
    observer.disconnect();
    records.forEach(function (r) {
      if (r.type === "characterData") translate(r.target.parentElement);
      r.addedNodes.forEach(function (n) { translate(n.nodeType === 1 ? n : n.parentElement); });
    });
    start();
  });

  function start() {
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  window.CompainI18n = {
    setLanguage: function (l) {
      var changed = l !== lang;
      lang = l === "de" ? "de" : "en";
      document.documentElement.setAttribute("lang", lang);
      if (lang === "de") translate(document.body);
      return changed;
    },
    t: tr,
    start: start
  };
})();
