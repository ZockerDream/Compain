/* Help texts: FAQ, guide and the Markdown reference, in English and German.
   The texts are written in Markdown and shown with the same renderer as chat messages. */
(function () {
  "use strict";

  var EN = {
    faq: [
      { q: "Is Compain free?",
        a: "Yes. The **self-hosted model** runs on this server and has no limit. The **hosted API** (if the admin set one up) is limited to a number of messages per day; the counter is on the Home page." },
      { q: "Who can read my chats?",
        a: "Only you. Chats, personas and your own pictures are private. Admins manage the server, but the app has no view for other people's chats. Characters become visible to others only when you **publish** them and an admin approves them." },
      { q: "Why is the first reply slow sometimes?",
        a: "The model runs on the server's processor. Before the first word it reads the whole story. After switching the character or in long chats this can take a minute or two. Later replies are faster. Use **Stop** at any time; the part written so far is kept.\n\nWhile you wait, the line under the typing dots says what happens: *Waiting in line, place 2* (other replies are being written), *The model is loading…*, or *Reading the story…* with the seconds so far." },
      { q: "How do I find an old scene again?",
        a: "Type at least two letters into the search above the chat list: besides matching chats, **In messages** lists every line in all your chats that contains the text. Click one to jump there.\n\nFor scenes you want to come back to, use **Bookmark** under the message. The bookmark button in the chat header lists the bookmarks of this chat; the filter *Bookmarks* above the chat list shows all of them. Unlike *important*, the model never sees bookmarks." },
      { q: "The character forgets things. What can I do?",
        a: "Mark the line with **Mark important** (star). Up to 10 messages per chat are always given to the model, your own lines too. This is the place for facts like names, places or what happened before. Compain also writes a **story summary** every 40 messages." },
      { q: "How do I give the story background without the character answering it?",
        a: "Write the context as your own message, for example *(OOC: we are in Berlin, it is winter, Mara is my older sister)*, and mark it **important**. The character keeps it in mind for the whole chat." },
      { q: "Replies are too long or too short.",
        a: "Settings → **Replies** → Reply length: *Short*, *Medium*, *Long* or *Extra long*. The quick buttons **Shorter** and **Longer** above the message field ask for one different reply." },
      { q: "The character writes my lines. Why?",
        a: "Small models sometimes slip. **Regenerate** (↻) writes a new version; flip through versions with ‹ ›. Or **Edit** the reply and remove the part. Describing your actions clearly helps, too." },
      { q: "Can I use Compain on my phone?",
        a: "Yes. Open the address in the phone's browser and choose *Add to home screen* / *Install app*. Settings, designs and chats sync live between all your devices." },
      { q: "I forgot my password.",
        a: "Write a ticket from a logged-in device, or ask an admin directly. Admins can set a new password for your account." },
      { q: "I lost the phone with my authenticator app.",
        a: "Log in with one of your **recovery codes** instead of the 6-digit code. Each code works once. Then switch two-factor login off and on again in Settings to get new codes. Without codes: open a ticket or ask an admin." },
      { q: "What content is not allowed?",
        a: "All characters must be **adults (18+)**. No real people. Characters that break this are refused when saved or hidden from the Community." },
      { q: "Can I import characters from other apps?",
        a: "Yes: Characters → **Import card**, or drop the files on the Characters page. Character cards V1, V2 and V3 (SillyTavern, Chub and others) as PNG or JSON, several cards in one JSON list, or plain text. Example dialogue of a card is kept at the end of the personality.\n\nThe other way round: **Card** on a character downloads it as a V2 card, inside its PNG picture or as JSON." },
      { q: "How do I get my data out?",
        a: "Profile → **Your data**: characters, chats or everything as JSON. Each chat has its own export button (arrow in the chat header): **Markdown** to read or print, **JSON** to import again.\n\nTo import, use **Import chats** on the Chats page or *Import a file* under Your data. Imported chats come in new; nothing is replaced. If the character is missing, it is created from the copy in the file." },
      { q: "How do I ask for help or report a bug?",
        a: "Help → **Support** → *New ticket*. Describe what you did, what you expected and what happened. Admins answer in the ticket; you see a badge on **Help** when there is an answer." }
    ],
    guide: [
      { title: "Home", body: "Your latest chat, the number of chats and messages, and how many hosted API messages you have left today." },
      { title: "Chats",
        body: "- **Search** and filters: *All*, *Unread*, *Pinned*, *Important*, *Bookmarks*. The search also looks inside all messages (*In messages*).\n- **Import chats** brings in Compain export files.\n- **Pin** a chat to keep it on top.\n- Per chat: **Model** (self-hosted or hosted API) and **Character**. Switching the character keeps the story; the new character knows who spoke before.\n- **Enter** sends, **Shift+Enter** makes a new line. The field keeps the cursor after sending.\n- Quick buttons: **Continue** (the character writes on), *Describe the scene*, *Shorter*, *Longer*, *Narrate the weather*." },
      { title: "Message tools",
        body: "- **Stop** (square on the send button): ends the reply, the part so far is kept.\n- **↻ Regenerate**: new version of the last reply. Old versions stay; flip with ‹ ›.\n- **Edit**: change any message. On your own lines, *Save and resend* deletes everything after it and the character answers again.\n- **Delete**: click twice.\n- **Mark important**: up to 10 per chat, your lines and the character's. They are always part of the context.\n- **Bookmark**: remember a scene for yourself; the model does not see it. The bookmark button in the header lists them.\n- **Search** (magnifier in the chat header) finds lines in this chat.\n- **Export** (arrow in the header): Markdown or JSON." },
      { title: "Memory",
        body: "The model gets: the character, your persona, the story summary, the important messages and the latest messages (Settings → *Context sent to the model*: 20, 60 or 200). The **story summary** is written automatically every 40 messages; read it under *Story so far*." },
      { title: "Characters",
        body: "Create, edit and delete your own characters: name, tagline, description, personality, scenario, greeting, tags and a picture (PNG, JPG or WebP, up to 10 MB). **Publish** sends a character to the admins for review; after approval it appears in the Community. **Card** downloads a character as a character card; **Import card** (or dropping files) brings cards in." },
      { title: "Community",
        body: "Characters other users published. **Like** them, **Add to my characters** or **Start chat** directly. The most liked come first." },
      { title: "Profile and persona",
        body: "Display name and profile picture. The **persona** is who *you* play: a role name and a description. Every character knows it." },
      { title: "Settings",
        body: "- **Replies**: reply length, reply language, context size, sound when a reply is complete.\n- **Appearance**: four designs (*Classic*, *Glass*, *Modern*, *Modern Glass*), seven colour themes, light/dark/system, background, glass blur and opacity, your own background picture.\n- **Account**: password, two-factor login with recovery codes, logged-in devices, delete account.\nEverything syncs live to all your devices." },
      { title: "Support tickets",
        body: "Help → **Support**: open a ticket with a subject, a category and your message. You can answer, close and reopen it. Status: *Open* (waits for an admin), *In progress*, *Answered* (waits for you), *Closed*. Writing in a closed ticket opens it again. Up to 10 open tickets." },
      { title: "For admins",
        body: "**Server Management**: users, Community review, models and hosted API, security, domain, backups, storage and logs. In **Help → Support** admins see *All tickets*, answer, write **internal notes** (only admins see them), set status, priority and category, assign a ticket to an admin and delete tickets. The overview shows the **model queue**: replies being written and waiting. *Replies at the same time* (Models) must match LLM_SLOTS." }
    ],
    md: {
      intro: "Messages, character texts and tickets understand a small Markdown. In roleplay you write **actions in stars** and speech as plain text.",
      rows: [
        ["*smiles and leans closer*", "Action / italics"],
        ["_quietly_", "Italics, too"],
        ["**never**", "Bold"],
        ["***now***", "Bold italics"],
        ["~~maybe~~", "Struck through"],
        ["`/reset`", "Code"],
        ["- one\n- two", "List"],
        ["1. first\n2. second", "Numbered list"],
        ["> an old letter", "Quote"],
        ["# Chapter two", "Heading (a bold line)"]
      ],
      notes: "- An empty line starts a new paragraph; a single line break stays a line break.\n- A star that is never closed (for example after **Stop**) is closed automatically, so no stray stars show.\n- Links, pictures and HTML are not shown as such; they stay plain text. That keeps chats safe.",
      tryLabel: "Try it",
      tryText: "*She looks up from the map.* We are **close**.\n\n> Turn left at the old mill.\n\n- rope\n- lantern"
    },
    ui: {
      eyebrow: "Help", title: "Help and support", lead: "Answers, a guide to every feature, and tickets to the admins.",
      tabs: { faq: "FAQ", guide: "Guide", md: "Markdown", support: "Support" },
      faqSearch: "Search the FAQ", noFaq: "No question matches. Open a ticket in Support."
    }
  };

  var DE = {
    faq: [
      { q: "Ist Compain kostenlos?",
        a: "Ja. Das **eigene Modell** läuft auf diesem Server und hat kein Limit. Die **gehostete API** (falls der Admin eine eingerichtet hat) ist auf eine Zahl Nachrichten pro Tag begrenzt; der Zähler steht auf der Startseite." },
      { q: "Wer kann meine Chats lesen?",
        a: "Nur du. Chats, Persona und eigene Bilder sind privat. Admins verwalten den Server, aber die App hat keine Ansicht für fremde Chats. Charaktere sehen andere erst, wenn du sie **veröffentlichst** und ein Admin sie freigibt." },
      { q: "Warum dauert die erste Antwort manchmal lange?",
        a: "Das Modell läuft auf dem Prozessor des Servers. Vor dem ersten Wort liest es die ganze Geschichte. Nach einem Charakterwechsel oder in langen Chats kann das ein bis zwei Minuten dauern. Danach geht es schneller. Mit **Stopp** kannst du jederzeit abbrechen; der bisher geschriebene Teil bleibt.\n\nWährend du wartest, steht unter den Tipp-Punkten, was passiert: *Wartet in der Schlange, Platz 2* (andere Antworten werden gerade geschrieben), *Das Modell lädt…* oder *Liest die Geschichte…* mit den bisherigen Sekunden." },
      { q: "Wie finde ich eine alte Szene wieder?",
        a: "Tippe mindestens zwei Buchstaben in die Suche über der Chat-Liste: Neben passenden Chats zeigt **In Nachrichten** jede Zeile aus all deinen Chats, die den Text enthält. Ein Klick springt dorthin.\n\nFür Szenen, zu denen du zurück willst, nimm **Lesezeichen** unter der Nachricht. Der Lesezeichen-Knopf oben im Chat listet die Lesezeichen dieses Chats; der Filter *Lesezeichen* über der Chat-Liste zeigt alle. Anders als *wichtig* sieht das Modell Lesezeichen nie." },
      { q: "Der Charakter vergisst Dinge. Was hilft?",
        a: "Markiere die Zeile mit **Als wichtig markieren** (Stern). Bis zu 10 Nachrichten pro Chat bekommt das Modell immer mit, auch deine eigenen. Dort gehören Fakten hin wie Namen, Orte oder was früher passiert ist. Außerdem schreibt Compain alle 40 Nachrichten eine **Zusammenfassung**." },
      { q: "Wie gebe ich Hintergrund, ohne dass der Charakter darauf antwortet?",
        a: "Schreib den Kontext als eigene Nachricht, zum Beispiel *(OOC: wir sind in Berlin, es ist Winter, Mara ist meine ältere Schwester)*, und markiere sie als **wichtig**. Der Charakter behält das für den ganzen Chat im Kopf." },
      { q: "Antworten sind zu lang oder zu kurz.",
        a: "Einstellungen → **Antworten** → Antwortlänge: *Kurz*, *Mittel*, *Lang* oder *Extra lang*. Die Schnellknöpfe **Kürzer** und **Länger** über dem Eingabefeld bitten um eine einzelne andere Antwort." },
      { q: "Der Charakter schreibt meine Zeilen. Warum?",
        a: "Kleine Modelle rutschen manchmal ab. **Neu generieren** (↻) schreibt eine neue Version; mit ‹ › blätterst du zwischen den Versionen. Oder **Bearbeite** die Antwort und lösche den Teil. Klar beschriebene eigene Aktionen helfen auch." },
      { q: "Kann ich Compain auf dem Handy nutzen?",
        a: "Ja. Öffne die Adresse im Browser des Handys und wähle *Zum Startbildschirm hinzufügen* / *App installieren*. Einstellungen, Designs und Chats werden live auf allen Geräten synchronisiert." },
      { q: "Ich habe mein Passwort vergessen.",
        a: "Schreib ein Ticket von einem angemeldeten Gerät oder frag direkt einen Admin. Admins können ein neues Passwort für dein Konto setzen." },
      { q: "Das Handy mit der Authenticator-App ist weg.",
        a: "Melde dich mit einem deiner **Wiederherstellungscodes** statt des 6-stelligen Codes an. Jeder Code geht einmal. Schalte danach in den Einstellungen die Zwei-Faktor-Anmeldung aus und wieder ein, um neue Codes zu bekommen. Ohne Codes: Ticket schreiben oder einen Admin fragen." },
      { q: "Welche Inhalte sind nicht erlaubt?",
        a: "Alle Charaktere müssen **erwachsen (18+)** sein. Keine echten Personen. Charaktere, die dagegen verstoßen, werden beim Speichern abgelehnt oder aus der Community genommen." },
      { q: "Kann ich Charaktere aus anderen Apps importieren?",
        a: "Ja: Charaktere → **Karte importieren**, oder zieh die Dateien auf die Charaktere-Seite. Charakterkarten V1, V2 und V3 (SillyTavern, Chub und andere) als PNG oder JSON, mehrere Karten in einer JSON-Liste, oder einfacher Text. Beispieldialoge einer Karte landen am Ende der Persönlichkeit.\n\nUmgekehrt: **Karte** an einem Charakter lädt ihn als V2-Karte herunter, im PNG-Bild oder als JSON." },
      { q: "Wie bekomme ich meine Daten heraus?",
        a: "Profil → **Deine Daten**: Charaktere, Chats oder alles als JSON. Jeder Chat hat einen eigenen Export-Knopf (Pfeil oben im Chat): **Markdown** zum Lesen oder Drucken, **JSON** zum erneuten Import.\n\nZum Importieren: **Chats importieren** auf der Chats-Seite oder *Datei importieren* unter Deine Daten. Importierte Chats kommen neu dazu; nichts wird ersetzt. Fehlt der Charakter, wird er aus der Kopie in der Datei angelegt." },
      { q: "Wie bitte ich um Hilfe oder melde einen Fehler?",
        a: "Hilfe → **Support** → *Neues Ticket*. Beschreib, was du gemacht hast, was du erwartet hast und was passiert ist. Admins antworten im Ticket; bei einer Antwort siehst du eine Markierung an **Hilfe**." }
    ],
    guide: [
      { title: "Start", body: "Dein letzter Chat, die Zahl deiner Chats und Nachrichten und wie viele Nachrichten der gehosteten API du heute noch hast." },
      { title: "Chats",
        body: "- **Suche** und Filter: *Alle*, *Ungelesen*, *Angeheftet*, *Wichtig*, *Lesezeichen*. Die Suche schaut auch in alle Nachrichten (*In Nachrichten*).\n- **Chats importieren** holt Compain-Exportdateien herein.\n- **Anheften** hält einen Chat oben.\n- Pro Chat: **Modell** (eigenes Modell oder gehostete API) und **Charakter**. Beim Wechsel des Charakters bleibt die Geschichte; der neue Charakter weiß, wer vorher gesprochen hat.\n- **Enter** sendet, **Umschalt+Enter** macht eine neue Zeile. Das Feld behält nach dem Senden den Cursor.\n- Schnellknöpfe: **Weiter** (der Charakter schreibt weiter), *Szene beschreiben*, *Kürzer*, *Länger*, *Wetter erzählen*." },
      { title: "Nachrichten-Werkzeuge",
        body: "- **Stopp** (Quadrat auf dem Sende-Knopf): beendet die Antwort, der bisherige Teil bleibt.\n- **↻ Neu generieren**: neue Version der letzten Antwort. Alte Versionen bleiben; blättern mit ‹ ›.\n- **Bearbeiten**: jede Nachricht ändern. Bei eigenen Zeilen löscht *Speichern und neu senden* alles danach, und der Charakter antwortet neu.\n- **Löschen**: zweimal klicken.\n- **Als wichtig markieren**: bis zu 10 pro Chat, deine Zeilen und die des Charakters. Sie sind immer Teil des Kontexts.\n- **Lesezeichen**: eine Szene für dich merken; das Modell sieht es nicht. Der Lesezeichen-Knopf oben listet sie.\n- **Suche** (Lupe oben im Chat) findet Zeilen in diesem Chat.\n- **Export** (Pfeil oben): Markdown oder JSON." },
      { title: "Gedächtnis",
        body: "Das Modell bekommt: den Charakter, deine Persona, die Zusammenfassung, die wichtigen Nachrichten und die neuesten Nachrichten (Einstellungen → *Kontext für das Modell*: 20, 60 oder 200). Die **Zusammenfassung** entsteht automatisch alle 40 Nachrichten; lesen kannst du sie unter *Bisherige Geschichte*." },
      { title: "Charaktere",
        body: "Eigene Charaktere erstellen, bearbeiten und löschen: Name, Kurzbeschreibung, Beschreibung, Persönlichkeit, Szenario, Begrüßung, Tags und ein Bild (PNG, JPG oder WebP, bis 10 MB). **Veröffentlichen** schickt einen Charakter zur Prüfung an die Admins; nach der Freigabe erscheint er in der Community. **Karte** lädt einen Charakter als Charakterkarte herunter; **Karte importieren** (oder Dateien hineinziehen) holt Karten herein." },
      { title: "Community",
        body: "Charaktere, die andere veröffentlicht haben. **Liken**, **Zu meinen Charakteren** hinzufügen oder direkt **Chat starten**. Die beliebtesten stehen oben." },
      { title: "Profil und Persona",
        body: "Anzeigename und Profilbild. Die **Persona** ist, wen *du* spielst: ein Rollenname und eine Beschreibung. Jeder Charakter kennt sie." },
      { title: "Einstellungen",
        body: "- **Antworten**: Antwortlänge, Antwortsprache, Kontextgröße, Ton wenn eine Antwort fertig ist.\n- **Aussehen**: vier Designs (*Classic*, *Glass*, *Modern*, *Modern Glass*), sieben Farbthemen, hell/dunkel/System, Hintergrund, Glas-Unschärfe und Deckkraft, eigenes Hintergrundbild.\n- **Konto**: Passwort, Zwei-Faktor-Anmeldung mit Wiederherstellungscodes, angemeldete Geräte, Konto löschen.\nAlles wird live auf alle deine Geräte übertragen." },
      { title: "Support-Tickets",
        body: "Hilfe → **Support**: Ticket mit Betreff, Kategorie und Nachricht öffnen. Du kannst antworten, schließen und wieder öffnen. Status: *Offen* (wartet auf einen Admin), *In Bearbeitung*, *Beantwortet* (wartet auf dich), *Geschlossen*. Eine Nachricht in einem geschlossenen Ticket öffnet es wieder. Bis zu 10 offene Tickets." },
      { title: "Für Admins",
        body: "**Server-Verwaltung**: Benutzer, Community-Prüfung, Modelle und gehostete API, Sicherheit, Domain, Backups, Speicher und Protokolle. Unter **Hilfe → Support** sehen Admins *Alle Tickets*, antworten, schreiben **interne Notizen** (nur Admins sehen sie), setzen Status, Priorität und Kategorie, weisen Tickets einem Admin zu und löschen Tickets. Die Übersicht zeigt die **Modell-Warteschlange**: Antworten, die gerade geschrieben werden und warten. *Antworten gleichzeitig* (Modelle) muss zu LLM_SLOTS passen." }
    ],
    md: {
      intro: "Nachrichten, Charaktertexte und Tickets verstehen ein kleines Markdown. Im Rollenspiel schreibst du **Aktionen in Sternchen** und Gesprochenes als normalen Text.",
      rows: [
        ["*lächelt und rückt näher*", "Aktion / kursiv"],
        ["_leise_", "Auch kursiv"],
        ["**niemals**", "Fett"],
        ["***jetzt***", "Fett und kursiv"],
        ["~~vielleicht~~", "Durchgestrichen"],
        ["`/reset`", "Code"],
        ["- eins\n- zwei", "Liste"],
        ["1. erstens\n2. zweitens", "Nummerierte Liste"],
        ["> ein alter Brief", "Zitat"],
        ["# Kapitel zwei", "Überschrift (fette Zeile)"]
      ],
      notes: "- Eine leere Zeile beginnt einen neuen Absatz; ein einfacher Zeilenumbruch bleibt ein Zeilenumbruch.\n- Ein Sternchen, das nie geschlossen wird (zum Beispiel nach **Stopp**), wird automatisch geschlossen, damit keine einzelnen Sterne stehen bleiben.\n- Links, Bilder und HTML werden nicht als solche angezeigt; sie bleiben normaler Text. So bleiben Chats sicher.",
      tryLabel: "Ausprobieren",
      tryText: "*Sie sieht von der Karte auf.* Wir sind **nah dran**.\n\n> An der alten Mühle links.\n\n- Seil\n- Laterne"
    },
    ui: {
      eyebrow: "Hilfe", title: "Hilfe und Support", lead: "Antworten, eine Anleitung zu jeder Funktion und Tickets an die Admins.",
      tabs: { faq: "FAQ", guide: "Anleitung", md: "Markdown", support: "Support" },
      faqSearch: "FAQ durchsuchen", noFaq: "Keine passende Frage. Öffne ein Ticket im Support."
    }
  };

  window.CompainHelp = { en: EN, de: DE };
})();
