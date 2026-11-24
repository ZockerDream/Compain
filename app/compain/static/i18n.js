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
    "No changelog found.": "Kein Changelog gefunden.",
    "Datenschutz": "Datenschutz",
    "The privacy policy is not set up yet. The operator creates the file .datenschutz (template: .datenschutz-example).":
      "Die Datenschutzerklärung ist noch nicht eingerichtet. Der Betreiber legt die Datei .datenschutz an (Vorlage: .datenschutz-example).",
    // chat tools
    "Search in this chat": "In diesem Chat suchen", "Earlier match": "Früherer Treffer", "Later match": "Späterer Treffer",
    "Character:": "Charakter:", "Character in this chat": "Charakter in diesem Chat", "Regenerate": "Neu schreiben",
    "↻ Regenerate": "↻ Neu schreiben", "Write a new version of this reply": "Eine neue Version dieser Antwort schreiben",
    "Previous version": "Vorherige Version", "Next version": "Nächste Version", "Edit": "Bearbeiten", "Delete": "Löschen",
    "Delete?": "Löschen?", "Save": "Speichern", "Save and resend": "Speichern und neu senden", "Edit message": "Nachricht bearbeiten",
    "The character writes on": "Die Figur schreibt weiter", "Stop": "Stopp", "Send": "Senden",
    "Stopped. The part written so far is kept.": "Gestoppt. Der bisher geschriebene Teil bleibt erhalten.",
    "Always keep this in mind": "Immer im Gedächtnis behalten",
    // likes
    "Like": "Gefällt mir", "Unlike": "Gefällt mir nicht mehr", "Chats with this character": "Chats mit dieser Figur",
    // profile and persona
    "Persona": "Persona", "Who you are in the roleplays. Every character knows it.": "Wer du in den Rollenspielen bist. Jede Figur kennt das.",
    "Your role name": "Dein Rollenname", "About your role": "Über deine Rolle", "Save persona": "Persona speichern",
    "Who you play: look, job, how you know the characters. The characters know this.": "Wen du spielst: Aussehen, Beruf, woher du die Figuren kennst. Die Figuren wissen das.",
    "Upload picture": "Bild hochladen", "Change picture": "Bild ändern", "Remove": "Entfernen", "Picture saved": "Bild gespeichert",
    "Persona saved": "Persona gespeichert", "Profile picture": "Profilbild",
    // settings: sound, security
    "Sound when a reply is complete": "Ton, wenn eine Antwort fertig ist", "A short chime, also handy when the model is slow.": "Ein kurzer Klang, praktisch wenn das Modell langsam ist.",
    "Password": "Passwort", "Current password": "Aktuelles Passwort", "New password": "Neues Passwort", "New password again": "Neues Passwort wiederholen",
    "Your other devices are logged out; this one stays logged in.": "Deine anderen Geräte werden abgemeldet, dieses bleibt angemeldet.",
    "Change password": "Passwort ändern", "Password changed": "Passwort geändert", "The new passwords are not the same": "Die neuen Passwörter sind nicht gleich",
    "Two-factor login": "Zwei-Faktor-Anmeldung", "Set up": "Einrichten", "Switch on": "Einschalten", "Switch off": "Ausschalten",
    "After the password, Compain also asks for a code from an authenticator app (for example Aegis, Google Authenticator, 1Password).":
      "Nach dem Passwort fragt Compain zusätzlich nach einem Code aus einer Authenticator-App (zum Beispiel Aegis, Google Authenticator, 1Password).",
    "1. Scan the code with your authenticator app (or type the key).": "1. Scanne den Code mit deiner Authenticator-App (oder tippe den Schlüssel ein).",
    "2. Code from the app": "2. Code aus der App", "Password to switch it off": "Passwort zum Ausschalten",
    "Two-factor login is on. Keep these recovery codes somewhere safe; each works once if your phone is gone:":
      "Die Zwei-Faktor-Anmeldung ist an. Bewahre diese Wiederherstellungscodes sicher auf; jeder funktioniert einmal, falls dein Handy weg ist:",
    "I saved them": "Ich habe sie gesichert", "Two-factor login is off": "Die Zwei-Faktor-Anmeldung ist aus",
    "Enter the code from your authenticator app, or one of your recovery codes.": "Gib den Code aus deiner Authenticator-App ein oder einen deiner Wiederherstellungscodes.",
    "Code": "Code", "Confirm": "Bestätigen", "Wrong code": "Falscher Code",
    "Devices": "Geräte", "Where your account is logged in. End anything you do not recognise.": "Wo dein Konto angemeldet ist. Melde ab, was du nicht kennst.",
    "This device": "Dieses Gerät", "Log out": "Abmelden", "Device logged out": "Gerät abgemeldet",
    "Delete account": "Konto löschen", "Delete my account": "Mein Konto löschen", "Type your username": "Gib deinen Benutzernamen ein",
    "Deletes your account with all characters, chats, pictures and settings. This cannot be undone. Export your data first (Profile → Your data).":
      "Löscht dein Konto mit allen Charakteren, Chats, Bildern und Einstellungen. Das lässt sich nicht rückgängig machen. Exportiere vorher deine Daten (Profil → Deine Daten).",
    // glass: own picture
    "My picture": "Eigenes Bild", "Upload my picture": "Eigenes Bild hochladen", "Change my picture": "Eigenes Bild ändern",
    "Remove my picture": "Eigenes Bild entfernen", "Only you see your picture.": "Nur du siehst dein Bild.", "Background saved": "Hintergrund gespeichert",
    // admin: second place
    "Also copy to a second place": "Zusätzlich an einen zweiten Ort kopieren", "Second place": "Zweiter Ort", "Ready": "Bereit",
    "Not available": "Nicht verfügbar", "Backups can be copied there.": "Backups können dorthin kopiert werden.",
    "Mount a folder with BACKUP_OFFSITE_DIR in .env and restart.": "Binde einen Ordner mit BACKUP_OFFSITE_DIR in der .env ein und starte neu.", "About Compain": "Über Compain", "What changed, and who runs this server.": "Was sich geändert hat und wer diesen Server betreibt.", "From .env (default)": "Aus .env (Standard)"
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
