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
    "Shared by users": "Von Benutzern geteilt", "Published characters. Add one to your list, then start a chat.":
      "Veröffentlichte Charaktere. Füge einen zu deiner Liste hinzu und starte einen Chat.",
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
    "Disk": "Festplatte", "Endpoints and status": "Endpunkte und Status", "Self-hosted model": "Eigenes Modell", "Model runs on": "Modell läuft auf", "Turn this on after starting the proxy: set COMPAIN_DOMAIN and COMPOSE_PROFILES=https in .env, then docker compose up -d.": "Einschalten, nachdem der Proxy läuft: COMPAIN_DOMAIN und COMPOSE_PROFILES=https in .env setzen, dann docker compose up -d.", "Graphics card (GPU)": "Grafikkarte (GPU)", "Processor (CPU)": "Prozessor (CPU)",
    "Change it on the server with ./scripts/llm.sh gpu or ./scripts/llm.sh cpu.": "Umstellen auf dem Server mit ./scripts/llm.sh gpu oder ./scripts/llm.sh cpu.", "Database": "Datenbank",
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
    "Regenerate": "Neu schreiben",
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
    "Mount a folder with BACKUP_OFFSITE_DIR in .env and restart.": "Binde einen Ordner mit BACKUP_OFFSITE_DIR in der .env ein und starte neu.", "About Compain": "Über Compain", "What changed, and who runs this server.": "Was sich geändert hat und wer diesen Server betreibt.", "From .env (default)": "Aus .env (Standard)",
    // help and tickets (1.1.0)
    "Help": "Hilfe", "Didn't find an answer?": "Keine Antwort gefunden?", "Open a ticket": "Ticket öffnen",
    "You write": "Du schreibst", "You see": "Du siehst", "Meaning": "Bedeutung",
    "Short summary, e.g. Replies stop mid sentence": "Kurz zusammengefasst, z. B. Antworten brechen mitten im Satz ab",
    "Category": "Kategorie", "Subject": "Betreff", "Message": "Nachricht", "New ticket": "Neues Ticket",
    "What did you do, what did you expect, what happened? Markdown works.": "Was hast du gemacht, was hast du erwartet, was ist passiert? Markdown geht.",
    "Send ticket": "Ticket senden", "Ticket sent": "Ticket gesendet", "All tickets": "Alle Tickets", "My tickets": "Meine Tickets",
    "Show": "Anzeigen", "Not closed": "Nicht geschlossen", "Open": "Offen", "In progress": "In Bearbeitung", "Answered": "Beantwortet",
    "Closed": "Geschlossen", "No tickets here": "Hier sind keine Tickets", "Nothing to answer right now.": "Gerade gibt es nichts zu beantworten.",
    "Questions, problems or ideas? Open a ticket; the admins answer here.": "Fragen, Probleme oder Ideen? Öffne ein Ticket; die Admins antworten hier.",
    "New answer": "Neue Antwort", "Question": "Frage", "Bug": "Fehler", "Idea": "Idee", "Account": "Konto", "Other": "Sonstiges",
    "Low": "Niedrig", "Normal": "Normal", "High": "Hoch", "Priority": "Priorität", "Handled by": "Bearbeitet von",
    "Nobody": "Niemand", "Delete ticket": "Ticket löschen", "Ticket deleted": "Ticket gelöscht",
    "Reopen ticket": "Ticket wieder öffnen", "Close ticket": "Ticket schließen", "Internal note": "Interne Notiz",
    "Answer (Markdown works)…": "Antwort (Markdown geht)…", "Write an answer (Markdown works)…": "Antwort schreiben (Markdown geht)…",
    "Answer": "Antwort", "Note saved": "Notiz gespeichert", "Answer sent": "Antwort gesendet",
    "This ticket is closed. Writing an answer opens it again.": "Dieses Ticket ist geschlossen. Eine Antwort öffnet es wieder.",
    "Send and close": "Senden und schließen", "Internal note (only admins see it)": "Interne Notiz (nur Admins sehen sie)",
    "Ctrl+Enter sends": "Strg+Enter sendet", "Tickets": "Tickets", "waiting for an answer": "warten auf eine Antwort",
    "Set password": "Passwort setzen", "Password set": "Passwort gesetzt",
    // 1.3.4: replies go on without the browser
    "Connection lost. The reply is still being written and shows up when it is done.": "Verbindung verloren. Die Antwort wird weiter geschrieben und erscheint, sobald sie fertig ist.",
    "The character is still writing. Wait for the reply or press Stop.": "Der Charakter schreibt noch. Warte auf die Antwort oder drücke Stopp.",
    // 1.3.3: Community and pictures
    "Published in the Community": "In der Community veröffentlicht", "Waiting for review": "Wartet auf Prüfung",
    "Only you see it here until an admin approves it.": "Nur du siehst ihn hier, bis ein Admin ihn freigibt.",
    // 1.3.0: export, import, cards, search, bookmarks, model queue
    "Export this chat": "Diesen Chat exportieren", "Markdown (to read)": "Markdown (zum Lesen)", "JSON (to import again)": "JSON (zum erneuten Import)",
    "Bookmark": "Lesezeichen", "Bookmarked": "Lesezeichen gesetzt", "Bookmark removed": "Lesezeichen entfernt",
    "Bookmark this scene for yourself": "Diese Szene für dich merken", "Bookmarks": "Lesezeichen", "Bookmarks in this chat": "Lesezeichen in diesem Chat",
    "No bookmarks yet. Use Bookmark under a message to find a scene again.": "Noch keine Lesezeichen. Mit „Lesezeichen“ unter einer Nachricht findest du eine Szene wieder.",
    "No bookmarks yet.": "Noch keine Lesezeichen.", "No bookmarks match.": "Keine passenden Lesezeichen.",
    "Use Bookmark under a message to find a scene again.": "Mit „Lesezeichen“ unter einer Nachricht findest du eine Szene wieder.",
    "This message is no longer in the chat": "Diese Nachricht ist nicht mehr im Chat",
    "In messages": "In Nachrichten", "No message contains this text.": "Keine Nachricht enthält diesen Text.",
    "Waiting in line, place": "Wartet in der Schlange, Platz", "The model is loading…": "Das Modell lädt…",
    "The model is starting…": "Das Modell startet…", "Reading the story…": "Liest die Geschichte…",
    "Model not reachable": "Modell nicht erreichbar", "Model busy:": "Modell ausgelastet:", "waiting": "warten",
    "Model queue": "Modell-Warteschlange", "writing now,": "schreiben gerade,",
    "Replies at the same time": "Antworten gleichzeitig",
    "Slots of the self-hosted model (LLM_SLOTS in .env, default 2). More requests wait in line and see their place.":
      "Slots des selbst gehosteten Modells (LLM_SLOTS in der .env, Standard 2). Weitere Anfragen warten in der Schlange und sehen ihren Platz.",
    "Import chats": "Chats importieren", "Import a file": "Datei importieren", "Import failed": "Import fehlgeschlagen",
    "1 chat imported": "1 Chat importiert", "1 character imported": "1 Charakter importiert",
    "Card": "Karte", "Download as a character card (PNG with picture, else JSON)": "Als Charakterkarte herunterladen (PNG mit Bild, sonst JSON)",
    "Import a character card": "Charakterkarte importieren",
    "Characters you created. You can edit and delete only these. Import character cards (SillyTavern, Chub and others: PNG or JSON, V1 to V3) or plain text, also several at once or by dropping files here.":
      "Charaktere, die du erstellt hast. Nur diese kannst du bearbeiten und löschen. Importiere Charakterkarten (SillyTavern, Chub und andere: PNG oder JSON, V1 bis V3) oder reinen Text, auch mehrere auf einmal oder per Ziehen auf diese Seite.",
    "Download everything you own as JSON. The files can be imported again, here or on another Compain server.":
      "Lade alles, was dir gehört, als JSON herunter. Die Dateien lassen sich wieder importieren, hier oder auf einem anderen Compain-Server.",
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
