/* Compain web app. Plain JavaScript, no build step. Talks only to the Compain API. */
(function () {
  "use strict";

  /* ---------- helpers ---------- */
  var SVG_NS = "http://www.w3.org/2000/svg";
  function $(id) { return document.getElementById(id); }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    var children = Array.prototype.slice.call(arguments, 2);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.indexOf("on") === 0) node.addEventListener(k.slice(2), v);
      else if (k === "checked" || k === "disabled" || k === "selected") node[k] = !!v;
      else node.setAttribute(k, v === true ? "" : v);
    });
    function add(c) {
      if (c === null || c === undefined || c === false) return;
      if (Array.isArray(c)) { c.forEach(add); return; }
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    children.forEach(add);
    return node;
  }

  function icon(name, cls) {
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "ic " + (cls || ""));
    svg.setAttribute("aria-hidden", "true");
    var use = document.createElementNS(SVG_NS, "use");
    use.setAttribute("href", "#" + name);
    svg.appendChild(use);
    return svg;
  }

  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.classList.remove("show"); }, 2200);
  }

  function initials(name) {
    var parts = String(name || "?").trim().split(/\s+/);
    return ((parts[0] || "?")[0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  }

  // Avatar: the character's picture if there is one, otherwise the initials.
  function avatar(name, characterId, hasPicture, cls) {
    var box = el("span", { class: "avatar" + (cls ? " " + cls : ""), text: hasPicture ? null : initials(name) });
    if (hasPicture && characterId) {
      var img = el("img", { src: "/api/characters/" + characterId + "/picture", alt: "", loading: "lazy",
        style: "width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block" });
      img.addEventListener("error", function () { box.textContent = initials(name); });
      box.appendChild(img);
    }
    return box;
  }

  // The user's own profile picture, or initials.
  function userAvatar(u, cls, style) {
    var box = el("span", { class: "avatar alt" + (cls ? " " + cls : ""), style: style || null, text: u.has_avatar ? null : initials(u.display_name || u.username) });
    if (u.has_avatar) box.appendChild(el("img", { src: "/api/users/" + u.id + "/avatar?v=" + (u._v || 0), alt: "",
      style: "width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block" }));
    return box;
  }

  function fmtTime(iso) {
    if (!iso) return "";
    var d = new Date(iso), now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toTimeString().slice(0, 5);
    var y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return "Yesterday";
    return d.toLocaleDateString();
  }

  async function api(path, opts) {
    opts = opts || {};
    var init = { method: opts.method || "GET", credentials: "same-origin", headers: {} };
    if (opts.body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(opts.body);
    }
    var r = await fetch(path, init);
    var data = null;
    try { data = await r.json(); } catch (e) { data = null; }
    if (!r.ok) {
      var detail = data && data.detail;
      if (Array.isArray(detail)) detail = detail.map(function (d) { return d.msg; }).join("; ");
      var err = new Error(detail || ("Request failed (" + r.status + ")"));
      err.status = r.status;
      throw err;
    }
    return data;
  }

  /* ---------- preferences (per device) ---------- */
  var PALETTES = [
    { id: "ember", name: "Ember", color: "#e8703a" },
    { id: "indigo", name: "Indigo", color: "#6366f1" },
    { id: "emerald", name: "Emerald", color: "#10b981" },
    { id: "ocean", name: "Ocean", color: "#0ea5e9" },
    { id: "rose", name: "Rose", color: "#f43f5e" },
    { id: "amber", name: "Amber", color: "#f59e0b" },
    { id: "mono", name: "Mono", color: "#52525b" }
  ];
  var OLD_PALETTES = { forest: "emerald", violet: "indigo" };
  var DESIGNS = [
    { id: "classic", name: "Classic", sub: "Sidebar, solid surfaces", glassy: false, top: false },
    { id: "glass", name: "Glass", sub: "Glass panels over a background", glassy: true, top: false },
    { id: "modern", name: "Modern", sub: "Navigation on top, calm surfaces", glassy: false, top: true },
    { id: "modern-glass", name: "Modern Glass", sub: "Navigation on top, glass over a background", glassy: true, top: true }
  ];
  var BACKGROUNDS = [["dusk", "Dusk"], ["night", "Night"], ["forest", "Forest"], ["none", "None"], ["custom", "My picture"]];
  var MODELS = [
    { value: "self", label: "Self-hosted model (unlimited)" },
    { value: "hosted", label: "Hosted API (daily limit)" }
  ];
  var REPLY_LENGTHS = [["short", "Short"], ["medium", "Medium"], ["long", "Long"], ["xlong", "Extra long"]];
  var CONTEXTS = [[20, "Last 20 messages"], [60, "Last 60 messages + summary"], [200, "Last 200 messages + summary"]];

  function loadPrefs() {
    var p = { palette: "ember", mode: "system", replyLength: "medium", ctx: 60, language: "auto", uiLanguage: "en",
      design: "classic", bg: "dusk", blur: 22, alpha: 52, dim: 20 };
    try {
      var raw = localStorage.getItem("compain-prefs");
      if (raw) Object.assign(p, JSON.parse(raw));
    } catch (e) { /* private window or blocked storage: defaults apply */ }
    return p;
  }
  function savePrefs() {
    try { localStorage.setItem("compain-prefs", JSON.stringify(prefs)); } catch (e) { /* ignore */ }
    // Also on the server, so every device of this user looks the same.
    if (me) api("/api/auth/preferences", { method: "PUT", body: prefs }).catch(function () { /* offline: kept on this device */ });
  }
  function applyPrefs() {
    if (window.CompainI18n) window.CompainI18n.setLanguage(prefs.uiLanguage);
    if (OLD_PALETTES[prefs.palette]) prefs.palette = OLD_PALETTES[prefs.palette];
    var root = document.documentElement;
    root.setAttribute("data-design", prefs.design || "classic");
    root.setAttribute("data-bg", prefs.bg || "dusk");
    // Own background picture (only this user sees it); the version forces a reload after a new upload.
    if (prefs.bg === "custom") root.style.setProperty("--user-bg", 'url("/api/auth/background?v=' + (state.bgVersion || 0) + '")');
    root.style.setProperty("--g-blur", (prefs.blur == null ? 22 : prefs.blur) + "px");
    root.style.setProperty("--g-alpha", String((prefs.alpha == null ? 52 : prefs.alpha) / 100));
    root.style.setProperty("--g-dim", String((prefs.dim == null ? 20 : prefs.dim) / 100));
    document.documentElement.setAttribute("data-palette", prefs.palette);
    if (prefs.mode === "system") document.documentElement.removeAttribute("data-mode");
    else document.documentElement.setAttribute("data-mode", prefs.mode);
  }

  /* ---------- state ---------- */
  var prefs = loadPrefs();
  var me = null;
  var state = { chatId: null, cfilter: "all", query: "", communityFilter: "all", adminTab: "overview", editing: null, sending: false, route: "home" };

  /* ---------- navigation ---------- */
  var NAV = [
    { id: "home", label: "Home", icon: "i-home" },
    { id: "chats", label: "Chats", icon: "i-chat" },
    { id: "characters", label: "Characters", icon: "i-users" },
    { id: "community", label: "Community", icon: "i-globe" },
    { id: "profile", label: "Profile", icon: "i-user" },
    { id: "settings", label: "Settings", icon: "i-gear" },
    { id: "help", label: "Help", icon: "i-help" }
  ];
  var VIEWS = ["home", "chats", "characters", "community", "profile", "settings", "help", "admin"];

  function buildNav() {
    var desk = $("nav-desktop"), bar = $("bottombar");
    desk.textContent = "";
    bar.textContent = "";
    NAV.forEach(function (n) {
      desk.appendChild(el("button", { "data-go": n.id, onclick: function () { go(n.id); } }, icon(n.icon), el("span", { text: n.label }),
        n.id === "help" ? el("i", { class: "badge nav-badge help-badge", hidden: true }) : null));
    });
    if (me && me.role === "admin") {
      desk.appendChild(el("button", { "data-go": "admin", onclick: function () { go("admin"); } }, icon("i-shield"), el("span", { text: "Server Management" })));
    }
    NAV.slice(0, 5).forEach(function (n) {
      bar.appendChild(el("button", { "data-go": n.id, onclick: function () { go(n.id); } }, icon(n.icon), el("span", { text: n.label }),
        n.id === "profile" ? el("i", { class: "badge nav-badge help-badge", hidden: true }) : null));
    });
    var pills = $("topnav-pills");
    pills.textContent = "";
    NAV.concat(me && me.role === "admin" ? [{ id: "admin", label: "Server Management", icon: "i-shield" }] : []).forEach(function (n) {
      pills.appendChild(el("button", { "data-go": n.id, onclick: function () { go(n.id); } }, icon(n.icon, "sm"), el("span", { text: n.label }),
        n.id === "help" ? el("i", { class: "badge nav-badge help-badge", hidden: true }) : null));
    });
    updateHelpBadge();
  }

  function go(route) {
    var parts = String(route || "home").split("/");
    var name = parts[0];
    if (name === "chat") { name = "chats"; if (parts[1]) state.chatId = Number(parts[1]); }
    if (name === "help") {
      if (parts[1] && HELP_TABS.indexOf(parts[1]) !== -1) state.helpTab = parts[1];
      state.ticketId = parts[1] === "support" && parts[2] ? Number(parts[2]) : (parts[1] ? null : state.ticketId);
    }
    if (VIEWS.indexOf(name) === -1) name = "home";
    if (name === "admin" && (!me || me.role !== "admin")) name = "home";
    var openChat = name === "chats" && parts.length > 1;
    document.body.setAttribute("data-chat", openChat ? "1" : "0");

    state.route = name;
    VIEWS.forEach(function (v) { $("view-" + v).classList.toggle("hidden", v !== name); });
    closePopover();
    document.querySelectorAll(".nav button, .bottombar button, .topnav-pills button").forEach(function (b) {
      if (b.getAttribute("data-go") === name) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });

    var hash = "#" + (name === "chats" && openChat ? "chats/" + state.chatId : name === "help" ? helpHash() : name);
    if (location.hash !== hash) history.replaceState(null, "", hash);
    window.scrollTo(0, 0);

    var renderers = { home: renderHome, chats: renderChats, characters: renderCharacters, community: renderCommunity, profile: renderProfile, settings: renderSettings, help: renderHelp, admin: renderAdmin };
    Promise.resolve(renderers[name]()).catch(function (e) { toast(e.message); });
  }

  /* ---------- home ---------- */
  async function renderHome() {
    var view = $("view-home");
    view.textContent = "";
    var chats = await api("/api/chats");
    var latest = chats[0];
    var used = me.hosted_used_today, limit = me.hosted_limit;

    var hero = el("div", { class: "hero" },
      el("div", { class: "caps", style: "color:rgba(255,255,255,.8)", text: "Welcome back" }),
      el("h1", { style: "margin-top:8px", text: latest ? "Pick up where you left off." : "Create your first character." }),
      el("p", { text: latest ? "Your most recent conversation is below. Messages sync to every device." : "Characters are the people you chat with. Make one, then start a chat." }),
      latest ? el("button", { class: "hero-chat", onclick: function () { go("chat/" + latest.id); } },
        avatar(latest.character_name, latest.character_id, latest.character_has_picture),
        el("span", { class: "grow" },
          el("span", { style: "display:block;font-weight:600", text: latest.title }),
          el("span", { style: "display:block;font-size:13px;opacity:.85", class: "ellipsis", text: plain(latest.last_message) || "No messages yet" }))) : null,
      el("div", { class: "actions" },
        el("button", { class: "primary", onclick: function () { go("chats"); } }, "Open chats"),
        el("button", { onclick: function () { go("characters"); } }, "My characters"),
        el("button", { onclick: function () { go("community"); } }, "Community")));

    var stats = el("div", { class: "grid grid-3", style: "margin-top:18px" },
      statCard("i-chat", "Chats", String(chats.length), "conversations"),
      statCard("i-bolt", "Messages", String(chats.reduce(function (a, c) { return a + c.message_count; }, 0)), "in all chats"),
      el("div", { class: "card stat-card" },
        el("div", { class: "ic-wrap" }, icon("i-clock")),
        el("div", { class: "caps", text: "Hosted API today" }),
        el("div", { class: "stat" }, String(used), el("span", { class: "muted", style: "font-size:16px", text: " / " + limit })),
        el("div", { class: "meter", style: "margin-top:10px" }, el("span", { style: "width:" + Math.min(100, Math.round(used / Math.max(1, limit) * 100)) + "%" }))));

    var recent = chats.slice(0, 5).map(function (c) {
      return el("li", null,
        avatar(c.character_name, c.character_id, c.character_has_picture, "sm"),
        el("div", { class: "grow", style: "min-width:0" },
          el("div", { text: c.character_name + " · " + c.title }),
          el("div", { class: "muted small ellipsis", text: plain(c.last_message) || "No messages yet" })),
        el("span", { class: "time", text: fmtTime(c.updated_at) }));
    });

    view.appendChild(hero);
    view.appendChild(stats);
    view.appendChild(el("div", { class: "grid grid-2", style: "margin-top:18px" },
      el("div", { class: "card" },
        el("div", { class: "row", style: "justify-content:space-between;margin-bottom:16px" }, el("h2", { text: "Recent chats" })),
        recent.length ? el("ul", { class: "feed" }, recent) : el("p", { class: "muted", text: "No chats yet." })),
      el("div", { class: "card" },
        el("h2", { style: "margin-bottom:16px", text: "You" }),
        el("div", { class: "row", style: "margin-bottom:16px" },
          el("span", { class: "avatar lg alt", text: initials(me.display_name || me.username) }),
          el("div", { class: "grow" },
            el("div", { style: "font-weight:600;font-size:17px", text: me.display_name || me.username }),
            el("div", { class: "muted small", text: me.role === "admin" ? "Admin" : "User" }))),
        el("button", { onclick: function () { go("profile"); } }, "Open profile"))));
  }

  function statCard(iconId, label, value, sub) {
    return el("div", { class: "card stat-card lift" },
      el("div", { class: "ic-wrap" }, icon(iconId)),
      el("div", { class: "caps", text: label }),
      el("div", { class: "stat", text: value }),
      el("div", { class: "muted small", text: sub }));
  }

  /* ---------- chats ---------- */
  async function renderChats() {
    var view = $("view-chats");
    view.textContent = "";
    var chats = await api("/api/chats");
    if (state.chatId && !chats.some(function (c) { return c.id === state.chatId; })) state.chatId = null;
    if (!state.chatId && chats.length && location.hash.indexOf("#chats/") === 0) state.chatId = chats[0].id;

    var search = el("input", { id: "chat-search", placeholder: "Search chats or characters", "aria-label": "Search chats", value: state.query });
    search.addEventListener("input", function () { state.query = search.value; drawList(); });

    var chips = el("div", { class: "chips", role: "group", "aria-label": "Filter chats" });
    [["all", "All"], ["unread", "Unread"], ["pinned", "Pinned"], ["important", "Important"]].forEach(function (f) {
      chips.appendChild(el("button", { class: "chip", "aria-pressed": state.cfilter === f[0] ? "true" : "false",
        onclick: function () { state.cfilter = f[0]; renderChats(); } }, f[1]));
    });

    var listBox = el("div", { class: "list-scroll", id: "chat-list" });
    var listPane = el("aside", { class: "list-pane", "aria-label": "Chat list" },
      el("div", { class: "list-head" }, el("div", { class: "search" }, icon("i-search", "sm"), search), chips), listBox);
    var convPane = el("section", { class: "conv-pane", id: "conv" });

    view.appendChild(el("div", { class: "page-head" },
      el("div", null, el("div", { class: "caps eyebrow", text: "Conversations" }), el("h1", { text: "Chats" }),
        el("p", { text: "Pick a conversation. Messages sync to every device." })),
      el("div", { class: "actions" }, el("button", { class: "primary", onclick: function () { go("characters"); } }, "New chat"))));
    view.appendChild(el("div", { class: "chats-shell" }, listPane, convPane));

    function visible() {
      var q = state.query.trim().toLowerCase();
      return chats.filter(function (c) {
        if (state.cfilter === "unread" && !c.unread) return false;
        if (state.cfilter === "pinned" && !c.pinned) return false;
        if (state.cfilter === "important" && c.important_count === 0) return false;
        if (!q) return true;
        return (c.title + " " + c.character_name + " " + c.last_message).toLowerCase().indexOf(q) !== -1;
      });
    }

    function row(c) {
      return el("button", { class: "c-row", "aria-current": state.chatId === c.id ? "true" : "false",
        onclick: function () { go("chat/" + c.id); } },
        avatar(c.character_name, c.character_id, c.character_has_picture),
        el("span", { class: "grow", style: "min-width:0" },
          el("span", { class: "top" },
            c.pinned ? icon("i-pin", "sm pin-ic") : null,
            el("span", { class: "title ellipsis", text: c.title }),
            el("span", { class: "time", text: fmtTime(c.updated_at) })),
          el("span", { class: "preview ellipsis", style: "display:block", text: c.character_name + " · " + (plain(c.last_message) || (c.message_count ? "…" : "No messages yet")) })),
        // The open chat counts as read: it is on screen.
        c.unread && state.chatId !== c.id ? el("span", { class: "badge", "aria-label": c.unread + " unread", text: String(c.unread) }) : null);
    }

    function drawList() {
      listBox.textContent = "";
      var items = visible();
      if (!items.length) {
        listBox.appendChild(el("div", { class: "empty" }, icon("i-search"), el("div", { text: chats.length ? "No chats match." : "No chats yet." }),
          el("div", { class: "small", text: chats.length ? "Try another search or filter." : "Start one from Characters." })));
        return;
      }
      var pinned = items.filter(function (c) { return c.pinned; });
      var rest = items.filter(function (c) { return !c.pinned; });
      if (pinned.length) { listBox.appendChild(el("div", { class: "caps group-label", text: "Pinned" })); pinned.forEach(function (c) { listBox.appendChild(row(c)); }); }
      if (rest.length) { listBox.appendChild(el("div", { class: "caps group-label", text: "Recent" })); rest.forEach(function (c) { listBox.appendChild(row(c)); }); }
    }
    drawList();

    if (state.chatId) await renderConversation(convPane, state.chatId, chats, drawList);
    else convPane.appendChild(el("div", { class: "chat-empty" }, el("div", null,
      el("h2", { text: "Pick a conversation" }), el("p", { text: "Your chats stay here, synced to every device." }))));
  }

  /* ---------- Markdown in messages ----------
     Roleplay text uses *actions*, **emphasis**, `code`, lists and quotes. Rendered with DOM nodes only,
     so nothing in a message can inject HTML. */
  function mdInline(text) {
    var out = [];
    // An action that is still being written (or was cut off by Stop) has no closing star yet: close it.
    var singles = (text.replace(/\*\*/g, "").match(/\*/g) || []).length;
    if (singles % 2 === 1) text = text + "*";
    // Order matters: *** before ** before *; ` and ~~ too.
    var re = /(\*\*\*[^*\n]+?\*\*\*|\*\*[^*\n]+?\*\*|\*[^*\n]+?\*|_[^_\n]+?_|`[^`\n]+?`|~~[^~\n]+?~~)/g;
    var last = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) out.push(document.createTextNode(text.slice(last, m.index)));
      var t = m[0];
      if (t.indexOf("***") === 0) out.push(el("strong", null, el("em", { text: t.slice(3, -3) })));
      else if (t.indexOf("**") === 0) out.push(el("strong", { text: t.slice(2, -2) }));
      else if (t[0] === "*" || t[0] === "_") out.push(el("em", { text: t.slice(1, -1) }));
      else if (t[0] === "`") out.push(el("code", { text: t.slice(1, -1) }));
      else out.push(el("del", { text: t.slice(2, -2) }));
      last = m.index + t.length;
    }
    if (last < text.length) out.push(document.createTextNode(text.slice(last)));
    return out;
  }

  function mdRender(text) {
    var box = document.createDocumentFragment();
    var lines = String(text || "").replace(/\r/g, "").split("\n");
    var para = [], list = null, listTag = null, quote = null;
    function flush() {
      if (para.length) {
        var p = el("p");
        para.forEach(function (l, i) { if (i) p.appendChild(el("br")); mdInline(l).forEach(function (n) { p.appendChild(n); }); });
        (quote || box).appendChild(p);
        para = [];
      }
    }
    function endList() { list = null; listTag = null; }
    lines.forEach(function (raw) {
      var line = raw.replace(/\s+$/, "");
      var ul = /^\s*[-•]\s+(.*)$/.exec(line), ol = /^\s*\d+[.)]\s+(.*)$/.exec(line), q = /^>\s?(.*)$/.exec(line), h = /^#{1,3}\s+(.*)$/.exec(line);
      if (!line.trim()) { flush(); endList(); quote = null; return; }
      if (ul || ol) {
        flush();
        var tag = ul ? "ul" : "ol";
        if (!list || listTag !== tag) { list = el(tag); listTag = tag; (quote || box).appendChild(list); }
        var li = el("li"); mdInline((ul || ol)[1]).forEach(function (n) { li.appendChild(n); }); list.appendChild(li);
        return;
      }
      endList();
      if (q) { flush(); if (!quote) { quote = el("blockquote"); box.appendChild(quote); } para.push(q[1]); return; }
      if (h) { flush(); var s = el("p", { class: "md-h" }); mdInline(h[1]).forEach(function (n) { s.appendChild(n); }); box.appendChild(s); return; }
      if (quote) { flush(); quote = null; }
      para.push(line);
    });
    flush();
    return box;
  }

  function setBubble(bubble, text) {
    bubble.textContent = "";
    bubble.appendChild(mdRender(text));
  }

  // List previews: the text without Markdown signs.
  function plain(text) { return String(text || "").replace(/(\*\*\*|\*\*|\*|__|_|~~|`)/g, "").replace(/^>\s?/gm, ""); }

  /* ---------- sound when a reply is complete (Settings → Sound) ---------- */
  var audioCtx = null;
  function chime() {
    if (!prefs.sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      var now = audioCtx.currentTime;
      [660, 880].forEach(function (f, i) {
        var o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, now + i * 0.12);
        g.gain.exponentialRampToValueAtTime(0.12, now + i * 0.12 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 0.25);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(now + i * 0.12); o.stop(now + i * 0.12 + 0.3);
      });
    } catch (e) { /* no audio: fine */ }
  }

  /* ---------- conversation ---------- */
  var characterChoices = null; // own + community characters for the switcher, loaded once per visit

  async function renderConversation(pane, chatId, chats, drawList) {
    var chat = await api("/api/chats/" + chatId);
    pane.textContent = "";

    var modelSel = el("select", { class: "model-select", id: "chat-model", "aria-label": "Model for this chat" });
    MODELS.forEach(function (m) { modelSel.appendChild(el("option", { value: m.value, selected: chat.model === m.value, text: m.label })); });
    modelSel.addEventListener("change", async function () {
      try {
        await api("/api/chats/" + chatId, { method: "PATCH", body: { model: modelSel.value } });
        toast("Model for this chat: " + modelSel.options[modelSel.selectedIndex].text);
      } catch (e) { toast(e.message); }
    });

    // Switch the character while the story runs.
    var charSel = el("select", { class: "model-select", id: "chat-character", "aria-label": "Character in this chat" });
    charSel.appendChild(el("option", { value: String(chat.character_id), selected: true, text: chat.character_name }));
    charSel.addEventListener("focus", loadChoices, { once: true });
    charSel.addEventListener("pointerdown", loadChoices, { once: true });
    async function loadChoices() {
      if (!characterChoices) {
        var lists = await Promise.all([api("/api/characters"), api("/api/community")]);
        var seen = {};
        characterChoices = lists[0].concat(lists[1]).filter(function (c) { if (seen[c.id]) return false; seen[c.id] = 1; return true; });
      }
      charSel.textContent = "";
      characterChoices.forEach(function (c) {
        charSel.appendChild(el("option", { value: String(c.id), selected: c.id === chat.character_id, text: c.name + (c.mine ? "" : " (Community)") }));
      });
    }
    charSel.addEventListener("change", async function () {
      try {
        await api("/api/chats/" + chatId, { method: "PATCH", body: { character_id: Number(charSel.value) } });
        toast(charSel.options[charSel.selectedIndex].text + " takes over the scene");
        renderChats();
      } catch (e) { toast(e.message); }
    });

    var pinBtn = el("button", { class: "ghost icon-only", "aria-label": "Pin chat", "aria-pressed": chat.pinned ? "true" : "false",
      onclick: async function () {
        try { await api("/api/chats/" + chatId, { method: "PATCH", body: { pinned: !chat.pinned } }); renderChats(); }
        catch (e) { toast(e.message); }
      } }, icon("i-pin"));
    var exportLink = el("a", { class: "btn ghost icon-only", href: "/api/export/chat/" + chatId, download: "", "aria-label": "Export this chat" }, icon("i-down"));
    var summaryBox = el("div", { class: "conv-stats hidden", style: "display:block;font-size:13px;line-height:1.55;color:var(--fg)" },
      el("div", { class: "caps", style: "margin-bottom:6px", text: "Story so far" }),
      el("div", { text: chat.summary || "No summary yet. It is written automatically after every 40 messages and keeps long stories consistent." }));
    var infoBtn = el("button", { class: "ghost icon-only", "aria-label": "Story summary", "aria-pressed": "false",
      onclick: function () { var open = summaryBox.classList.toggle("hidden") === false; infoBtn.setAttribute("aria-pressed", open ? "true" : "false"); } }, icon("i-info"));

    // Search in this chat
    var searchBar = el("div", { class: "chat-search hidden" });
    var searchInput = el("input", { type: "search", placeholder: "Search in this chat", "aria-label": "Search in this chat" });
    var searchCount = el("span", { class: "muted small" });
    var hits = [], hitAt = -1;
    function runSearch() {
      var q = searchInput.value.trim().toLowerCase();
      hits = [];
      box.querySelectorAll(".msg").forEach(function (n) {
        n.classList.remove("hit", "hit-now");
        if (q && n.textContent.toLowerCase().indexOf(q) !== -1) { n.classList.add("hit"); hits.push(n); }
      });
      hitAt = hits.length ? hits.length - 1 : -1;
      showHit();
    }
    function showHit() {
      searchCount.textContent = hits.length ? (hitAt + 1) + " / " + hits.length : (searchInput.value.trim() ? "0" : "");
      hits.forEach(function (n, i) { n.classList.toggle("hit-now", i === hitAt); });
      if (hitAt >= 0) hits[hitAt].scrollIntoView({ block: "center", behavior: "smooth" });
    }
    searchInput.addEventListener("input", runSearch);
    searchInput.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); step(e.shiftKey ? 1 : -1); } if (e.key === "Escape") toggleSearch(false); });
    function step(d) { if (!hits.length) return; hitAt = (hitAt + d + hits.length) % hits.length; showHit(); }
    searchBar.appendChild(searchInput);
    searchBar.appendChild(searchCount);
    searchBar.appendChild(el("button", { class: "ghost icon-only", "aria-label": "Earlier match", onclick: function () { step(-1); } }, "↑"));
    searchBar.appendChild(el("button", { class: "ghost icon-only", "aria-label": "Later match", onclick: function () { step(1); } }, "↓"));
    function toggleSearch(on) {
      var show = on === undefined ? searchBar.classList.contains("hidden") : on;
      searchBar.classList.toggle("hidden", !show);
      if (show) searchInput.focus(); else { searchInput.value = ""; runSearch(); }
    }
    var searchBtn = el("button", { class: "ghost icon-only", "aria-label": "Search in this chat", onclick: function () { toggleSearch(); } }, icon("i-search"));

    pane.appendChild(el("header", { class: "conv-head" },
      el("button", { class: "ghost icon-only back-btn", "aria-label": "Back to chat list", onclick: function () { go("chats"); } }, icon("i-back")),
      avatar(chat.character_name, chat.character_id, chat.character_has_picture),
      el("div", { class: "grow", style: "min-width:0" },
        el("div", { class: "name ellipsis", text: chat.character_name }),
        el("div", { class: "meta ellipsis", text: chat.title + (chat.character_tagline ? " · " + chat.character_tagline : "") })),
      el("div", { class: "tools" }, searchBtn, pinBtn, infoBtn, exportLink)));
    pane.appendChild(searchBar);

    var important = chat.messages.filter(function (m) { return m.important; }).length;
    pane.appendChild(el("div", { class: "conv-stats" },
      el("span", { class: "pill", text: chat.messages.length + " messages" }),
      el("span", { class: "pill" }, icon("i-star", "sm"), " " + important + " of 10 important"),
      el("span", { class: "pill", text: chat.summary ? "Story summary saved" : "No story summary yet" }),
      el("span", { class: "pill", text: "Character:" }), charSel,
      el("span", { class: "pill", text: "Model:" }), modelSel));
    pane.appendChild(summaryBox);

    var busy = false, controller = null;
    var ctx = {
      chat: chat, chatId: chatId,
      busy: function () { return busy; },
      regenerate: function () { generate("regenerate"); },
      resend: function () { generate("next"); }
    };
    var box = el("div", { class: "messages", id: "messages" });
    pane.appendChild(box);
    var lastId = chat.messages.length ? chat.messages[chat.messages.length - 1].id : null;
    var prevChar = null;
    chat.messages.forEach(function (m) {
      // When the character changes in the story, show who comes in.
      if (m.role === "assistant" && m.character_id && prevChar && m.character_id !== prevChar) {
        box.appendChild(el("div", { class: "day", text: (m.character_name || "Someone") + " joins the scene" }));
      }
      if (m.role === "assistant" && m.character_id) prevChar = m.character_id;
      box.appendChild(messageNode(m, chat, m.id === lastId, ctx));
    });

    var quick = el("div", { class: "quick" });
    quick.appendChild(el("button", { type: "button", class: "accent-chip", text: "Continue", title: "The character writes on",
      onclick: function () { generate("next"); } }));
    ["Describe the scene", "Shorter", "Longer", "Narrate the weather"].forEach(function (t) {
      quick.appendChild(el("button", { type: "button", text: t, onclick: function () { input.value = t; input.focus(); } }));
    });
    pane.appendChild(quick);

    var input = el("textarea", { rows: "1", placeholder: "Write your line or action…", "aria-label": "Message" });
    var sendBtn = el("button", { class: "primary send", type: "submit", "aria-label": "Send" }, icon("i-send"));
    var form = el("form", { class: "composer" }, input, sendBtn);
    pane.appendChild(form);
    // After a reply the chat is drawn again: put the cursor back into the field (and keep what was typed meanwhile).
    state.drafts = state.drafts || {};
    if (state.drafts[chatId]) { input.value = state.drafts[chatId]; delete state.drafts[chatId]; }
    var refocus = state.refocus === chatId;
    state.refocus = null;
    if (refocus) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (busy) { if (controller) controller.abort(); return; } // the send button is the Stop button while writing
      send();
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!busy) send(); }
    });

    function setBusy(on) {
      busy = on;
      state.sending = on;
      sendBtn.textContent = "";
      sendBtn.appendChild(on ? el("span", { class: "stop-square", "aria-hidden": "true" }) : icon("i-send"));
      sendBtn.setAttribute("aria-label", on ? "Stop" : "Send");
      sendBtn.classList.toggle("stopping", on);
    }

    async function send() {
      var text = input.value.trim();
      if (!text) return;
      input.value = "";
      input.focus();
      box.appendChild(messageNode({ id: null, role: "user", content: text, important: false }, chat, false, ctx));
      await run("/api/chats/" + chatId + "/messages", { content: text }, null);
    }

    async function generate(mode) {
      if (busy) return;
      var replace = null;
      if (mode === "regenerate") {
        var nodes = box.querySelectorAll(".msg.char");
        replace = nodes.length ? nodes[nodes.length - 1] : null;
      }
      await run("/api/chats/" + chatId + "/reply", { mode: mode }, replace);
    }

    async function run(url, body, replaceNode) {
      setBusy(true);
      controller = new AbortController();
      var typing = el("div", { class: "msg char typing" }, avatar(chat.character_name, chat.character_id, chat.character_has_picture, "xs"),
        el("div", { class: "bubble" }, el("span", { class: "dot" }), el("span", { class: "dot" }), el("span", { class: "dot" })));
      if (replaceNode) replaceNode.replaceWith(typing); else box.appendChild(typing);
      box.scrollTop = box.scrollHeight;
      var bubble = null, reply = "", stopped = false;
      try {
        await streamTo(url, body, controller.signal, function (delta) {
          if (!bubble) {
            var node = messageNode({ id: null, role: "assistant", content: "", important: false, character_name: chat.character_name }, chat, false, ctx);
            typing.replaceWith(node);
            bubble = node.querySelector(".bubble");
            bubble.classList.add("cursor");
          }
          reply += delta;
          setBubble(bubble, reply);
          box.scrollTop = box.scrollHeight;
        });
        chime();
      } catch (e) {
        if (e.name === "AbortError") { stopped = true; toast("Stopped. The part written so far is kept."); }
        else toast(e.message);
        if (!bubble) typing.remove();
      } finally {
        if (bubble) bubble.classList.remove("cursor");
        controller = null;
        setBusy(false);
      }
      // Reload so the new messages get their ids and actions. After Stop, give the server a moment to save.
      state.refocus = chatId;
      setTimeout(function () {
        if (input.value.trim()) { state.drafts = state.drafts || {}; state.drafts[chatId] = input.value; }
        renderChats();
      }, stopped ? 600 : 0);
    }
    box.scrollTop = box.scrollHeight;
  }

  // One message with its actions. ctx gives access to the running conversation (regenerate, resend).
  function messageNode(m, chat, isLast, ctx) {
    var mine = m.role === "user";
    var name = mine ? "You" : (m.character_name || chat.character_name);
    var wrap = el("div", { class: "msg " + (mine ? "user" : "char") + (m.important ? " important" : "") });
    if (!mine) wrap.appendChild(avatar(name, m.character_id || chat.character_id, m.character_id ? m.character_has_picture : chat.character_has_picture, "xs"));
    var bubble = el("div", { class: "bubble" });
    setBubble(bubble, m.content);
    var col = el("div", { style: "min-width:0" }, bubble);
    if (m.id && ctx) {
      var line = el("div", { class: "meta-line" });
      var act = async function (fn) { if (ctx.busy()) return; try { await fn(); } catch (e) { toast(e.message); } };
      // Both sides can be marked: a reply worth remembering, or your own line with important context.
      line.appendChild(el("button", { class: "mark", "aria-pressed": m.important ? "true" : "false", title: "Always keep this in mind",
        onclick: function () { act(async function () {
          await api("/api/chats/" + chat.id + "/messages/" + m.id, { method: "PATCH", body: { important: !m.important } });
          toast(!m.important ? "Marked important" : "Unmarked");
          await renderChats();
        }); } }, icon("i-star", "sm"), m.important ? " Important" : " Mark important"));
      if (!mine) {
        if (m.variant_count > 1) {
          var flip = function (d) { act(async function () {
            var i = (m.variant_index + d + m.variant_count) % m.variant_count;
            await api("/api/chats/" + chat.id + "/messages/" + m.id + "/variant", { method: "POST", body: { index: i } });
            await renderChats();
          }); };
          line.appendChild(el("span", { class: "variants" },
            el("button", { class: "mark", "aria-label": "Previous version", onclick: function () { flip(-1); } }, "‹"),
            el("span", { text: (m.variant_index + 1) + " / " + m.variant_count }),
            el("button", { class: "mark", "aria-label": "Next version", onclick: function () { flip(1); } }, "›")));
        }
        if (isLast) line.appendChild(el("button", { class: "mark", title: "Write a new version of this reply", onclick: function () { if (!ctx.busy()) ctx.regenerate(); } }, "↻ Regenerate"));
      }
      line.appendChild(el("button", { class: "mark", onclick: function () { editMessage(m, chat, bubble, col, ctx); } }, "Edit"));
      line.appendChild(el("button", { class: "mark", onclick: function () {
        var b = this;
        if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Delete?"; setTimeout(function () { b.dataset.armed = ""; b.textContent = "Delete"; }, 3000); return; }
        act(async function () { await api("/api/chats/" + chat.id + "/messages/" + m.id, { method: "DELETE" }); await renderChats(); });
      } }, "Delete"));
      col.appendChild(line);
    }
    wrap.appendChild(col);
    return wrap;
  }

  function editMessage(m, chat, bubble, col, ctx) {
    if (ctx.busy() || col.querySelector(".edit-box")) return;
    var ta = el("textarea", { rows: "4", "aria-label": "Edit message" });
    ta.value = m.content;
    var save = async function (resend) {
      var text = ta.value.trim();
      if (!text) return;
      try {
        await api("/api/chats/" + chat.id + "/messages/" + m.id, { method: "PATCH", body: { content: text } });
        if (resend) {
          // Edit and resend: everything after this line goes, then the character answers again.
          await api("/api/chats/" + chat.id + "/messages/" + m.id + "/after", { method: "DELETE" });
          await renderChats();
          var again = document.querySelector("#conv .quick .accent-chip");
          if (again) again.click();
          return;
        }
        await renderChats();
      } catch (e) { toast(e.message); }
    };
    var boxEl = el("div", { class: "edit-box" }, ta,
      el("div", { class: "row", style: "flex-wrap:wrap;gap:6px;margin-top:6px" },
        el("button", { class: "primary", onclick: function () { save(false); } }, "Save"),
        m.role === "user" ? el("button", { onclick: function () { save(true); } }, "Save and resend") : null,
        el("button", { class: "ghost", onclick: function () { boxEl.remove(); bubble.classList.remove("hidden"); } }, "Cancel")));
    bubble.classList.add("hidden");
    col.insertBefore(boxEl, bubble.nextSibling);
    ta.focus();
  }

  // Stream a reply over Server-Sent Events. Aborting (Stop) closes the connection; the server keeps the part written so far.
  async function streamTo(url, body, signal, onDelta) {
    var r = await fetch(url, {
      method: "POST", credentials: "same-origin", signal: signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ reply_length: prefs.replyLength, context_messages: prefs.ctx, language: prefs.language }, body))
    });
    if (!r.ok) {
      var data = null;
      try { data = await r.json(); } catch (e) { data = null; }
      throw new Error((data && data.detail) || ("Could not send (" + r.status + ")"));
    }
    var reader = r.body.getReader();
    var decoder = new TextDecoder();
    var buf = "";
    for (;;) {
      var chunk = await reader.read();
      if (chunk.done) break;
      buf += decoder.decode(chunk.value, { stream: true });
      var idx;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        var block = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        block.split("\n").forEach(function (line) {
          if (line.indexOf("data: ") !== 0) return;
          var ev = JSON.parse(line.slice(6));
          if (ev.error) throw new Error(ev.error);
          if (ev.delta) onDelta(ev.delta);
        });
      }
    }
  }

  /* ---------- characters ---------- */
  async function renderCharacters() {
    var view = $("view-characters");
    view.textContent = "";
    if (state.editing !== null) return renderEditor(view);

    var chars = await api("/api/characters");
    var importInput = el("input", { type: "file", accept: ".json,.png,.txt,application/json,image/png,text/plain", style: "display:none", "aria-label": "Import a character card" });
    importInput.addEventListener("change", async function () {
      var file = importInput.files && importInput.files[0];
      if (!file) return;
      try {
        var r = await fetch("/api/characters/import", { method: "POST", credentials: "same-origin",
          headers: { "Content-Type": file.type || "text/plain", "X-Filename": file.name }, body: file });
        var data = null; try { data = await r.json(); } catch (e) {}
        if (!r.ok) throw new Error((data && data.detail) || "Import failed");
        toast("Imported " + data.name);
        renderCharacters();
      } catch (e) { toast(e.message); }
    });
    view.appendChild(importInput);
    view.appendChild(el("div", { class: "page-head" },
      el("div", null, el("div", { class: "caps eyebrow", text: "Your library" }), el("h1", { text: "Characters" }),
        el("p", { text: "Characters you created. You can edit and delete only these. Import SillyTavern cards (JSON or PNG) or plain text." })),
      el("div", { class: "actions" },
        el("button", { onclick: function () { importInput.click(); } }, "Import card"),
        el("button", { class: "primary", onclick: function () { state.editing = {}; renderCharacters(); } }, "New character"))));

    var grid = el("div", { class: "grid grid-3" });
    chars.forEach(function (c) {
      grid.appendChild(characterCard(c));
    });
    grid.appendChild(el("button", { class: "new-tile", onclick: function () { state.editing = {}; renderCharacters(); } }, icon("i-plus"), el("span", { text: "Create a new character" })));
    view.appendChild(grid);
  }

  function characterCard(c) {
    var status = c.visibility === "public" ? "Public" : c.visibility === "pending" ? "In review" : "Private";
    var card = el("article", { class: "card char-card lift" },
      el("div", { class: "row" }, avatar(c.name, c.id, c.has_picture),
        el("div", { class: "grow", style: "min-width:0" }, el("h3", { class: "ellipsis", text: c.name }), el("div", { class: "muted small ellipsis", text: c.tagline || "" }))),
      el("p", { class: "desc", text: c.description || "No description yet." }),
      el("div", { class: "tags" }, el("span", { class: "pill", text: status }), c.tags.map(function (t) { return el("span", { class: "pill", text: t }); })),
      el("div", { class: "foot" },
        el("button", { class: "primary", onclick: async function () {
          try { var chat = await api("/api/chats", { method: "POST", body: { character_id: c.id } }); go("chat/" + chat.id); }
          catch (e) { toast(e.message); }
        } }, "Chat"),
        el("button", { class: "ghost", onclick: function () { state.editing = c; renderCharacters(); } }, "Edit"),
        c.visibility === "private" ? el("button", { class: "ghost", onclick: async function () {
          try { await api("/api/characters/" + c.id + "/publish", { method: "POST" }); toast("Sent to review"); renderCharacters(); }
          catch (e) { toast(e.message); }
        } }, "Publish") : null));
    return card;
  }

  function renderEditor(view) {
    var c = state.editing || {};
    var isNew = !c.id;
    var fields = {};
    function field(key, label, multi, value) {
      var input = multi ? el("textarea", { rows: "3", id: "f-" + key }) : el("input", { id: "f-" + key });
      input.value = value || "";
      fields[key] = input;
      return el("div", null, el("label", { for: "f-" + key, text: label }), input);
    }
    var pictureInput = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp", id: "f-picture", style: "width:auto" });
    var err = el("p", { class: "small", style: "color:var(--warn);min-height:1.2em" });

    async function save() {
      var body = {};
      ["name", "tagline", "description", "personality", "greeting", "scenario", "tags"].forEach(function (k) { body[k] = fields[k].value; });
      body.tags = body.tags.split(",").map(function (t) { return t.trim(); }).filter(Boolean).join(",");
      try {
        var saved = isNew ? await api("/api/characters", { method: "POST", body: body })
                          : await api("/api/characters/" + c.id, { method: "PATCH", body: body });
        var file = pictureInput.files && pictureInput.files[0];
        if (file) {
          var r = await fetch("/api/characters/" + saved.id + "/picture", { method: "PUT", credentials: "same-origin", headers: { "Content-Type": file.type }, body: file });
          if (!r.ok) { var d = null; try { d = await r.json(); } catch (e) {} throw new Error((d && d.detail) || "Picture not saved"); }
        }
        toast("Character saved");
        state.editing = null;
        renderCharacters();
      } catch (e) { err.textContent = e.message; }
    }

    async function remove() {
      if (!confirm_inline(this)) return;
      try { await api("/api/characters/" + c.id, { method: "DELETE" }); toast("Character deleted"); state.editing = null; renderCharacters(); }
      catch (e) { err.textContent = e.message; }
    }

    view.appendChild(el("div", { class: "page-head" },
      el("div", null, el("div", { class: "caps eyebrow", text: "Character" }), el("h1", { text: isNew ? "New character" : "Edit " + c.name }),
        el("p", { text: "Adults only (18+). Pictures: PNG, JPG or WebP, up to 10 MB." }))));
    view.appendChild(el("div", { class: "card form", style: "max-width:720px" },
      el("div", { class: "two" }, field("name", "Name", false, c.name), field("tagline", "Tagline", false, c.tagline)),
      field("description", "Description", true, c.description),
      field("personality", "Personality", true, c.personality),
      field("greeting", "Greeting", true, c.greeting),
      field("scenario", "Scenario", true, c.scenario),
      field("tags", "Tags (comma-separated)", false, (c.tags || []).join(", ")),
      el("div", null, el("label", { for: "f-picture", text: "Profile picture" }), pictureInput),
      err,
      el("div", { class: "row", style: "flex-wrap:wrap" },
        el("button", { class: "primary", onclick: save }, "Save character"),
        el("button", { onclick: function () { state.editing = null; renderCharacters(); } }, "Cancel"),
        isNew ? null : el("button", { class: "ghost", onclick: remove }, "Delete character"))));
  }

  function confirm_inline(btn) {
    if (btn.dataset.armed === "1") return true;
    btn.dataset.armed = "1";
    btn.textContent = "Click again to delete";
    setTimeout(function () { btn.dataset.armed = ""; btn.textContent = "Delete character"; }, 4000);
    return false;
  }

  /* ---------- community ---------- */
  async function renderCommunity() {
    var view = $("view-community");
    view.textContent = "";
    var items = await api("/api/community");
    view.appendChild(el("div", { class: "page-head" },
      el("div", null, el("div", { class: "caps eyebrow", text: "Shared by users" }), el("h1", { text: "Community" }),
        el("p", { text: "Characters others have published. Add one to your list, then start a chat." }))));

    if (!items.length) {
      view.appendChild(el("div", { class: "empty-card" }, "Nothing published yet. Publish one of your characters from the Characters page; an admin approves it first."));
      return;
    }
    var top = items[0];
    view.appendChild(el("div", { class: "featured" },
      el("div", { class: "grow", style: "min-width:0" },
        el("div", { class: "caps", text: top.likes ? "Most liked · ♥ " + top.likes : "Featured" }),
        el("h2", { style: "margin-top:6px;font-size:24px", text: top.name }),
        el("p", { text: top.description || top.tagline }),
        el("div", { class: "row", style: "margin-top:14px;flex-wrap:wrap" },
          el("button", { class: "primary", onclick: function () { startChat(top.id); } }, "Start chat"),
          el("button", { onclick: function () { addToMine(top.id); } }, "Add to my characters"))),
      avatar(top.name, top.id, top.has_picture, "lg")));

    var filters = el("div", { class: "filter-row", role: "group", "aria-label": "Community filter" });
    ["all", "fantasy", "modern", "drama"].forEach(function (f) {
      filters.appendChild(el("button", { class: "chip", "aria-pressed": state.communityFilter === f ? "true" : "false",
        onclick: function () { state.communityFilter = f; renderCommunity(); } }, f === "all" ? "All" : f[0].toUpperCase() + f.slice(1)));
    });
    view.appendChild(filters);

    var grid = el("div", { class: "grid grid-3" });
    items.filter(function (c) { return state.communityFilter === "all" || c.tags.indexOf(state.communityFilter) !== -1; })
      .forEach(function (c) {
        grid.appendChild(el("article", { class: "card char-card lift" },
          el("div", { class: "row" }, avatar(c.name, c.id, c.has_picture, "alt"),
            el("div", { class: "grow", style: "min-width:0" }, el("h3", { class: "ellipsis", text: c.name }), el("div", { class: "muted small", text: c.mine ? "Yours" : "Shared by a user" }))),
          el("p", { class: "desc", text: c.description || c.tagline }),
          el("div", { class: "tags" }, c.tags.map(function (t) { return el("span", { class: "pill", text: t }); })),
          el("div", { class: "foot" },
            el("span", { class: "stats" },
              el("button", { class: "like" + (c.liked ? " on" : ""), "aria-pressed": c.liked ? "true" : "false", "aria-label": c.liked ? "Unlike" : "Like",
                onclick: async function () {
                  try { await api("/api/community/" + c.id + "/like", { method: c.liked ? "DELETE" : "POST" }); renderCommunity(); }
                  catch (e) { toast(e.message); }
                } }, c.liked ? "♥" : "♡", " " + c.likes),
              el("span", { title: "Chats with this character" }, icon("i-chat", "sm"), " " + c.uses)),
            el("button", { class: "ghost", onclick: function () { addToMine(c.id); } }, "Add"),
            el("button", { class: "primary", onclick: function () { startChat(c.id); } }, "Chat"))));
      });
    view.appendChild(grid);
  }

  async function startChat(characterId) {
    try { var chat = await api("/api/chats", { method: "POST", body: { character_id: characterId } }); go("chat/" + chat.id); }
    catch (e) { toast(e.message); }
  }
  async function addToMine(characterId) {
    try { await api("/api/community/" + characterId + "/add", { method: "POST" }); toast("Added to your characters"); }
    catch (e) { toast(e.message); }
  }

  /* ---------- profile ---------- */
  async function renderProfile() {
    var view = $("view-profile");
    view.textContent = "";
    var chars = await api("/api/characters");
    var chats = await api("/api/chats");
    var msgs = chats.reduce(function (a, c) { return a + c.message_count; }, 0);
    var nameInput = el("input", { id: "display", value: me.display_name || "" });
    var save = el("button", { class: "primary", onclick: async function () {
      try { var r = await api("/api/auth/profile", { method: "PATCH", body: { display_name: nameInput.value } }); me.display_name = r.display_name; buildNav(); toast("Profile saved"); }
      catch (e) { toast(e.message); }
    } }, "Save profile");

    view.appendChild(el("div", { class: "page-head" }, el("div", null, el("div", { class: "caps eyebrow", text: "Account" }), el("h1", { text: "Profile" }))));
    view.appendChild(el("div", { class: "card profile-card", style: "padding:0;overflow:hidden" },
      el("div", { class: "cover" }),
      el("div", { style: "padding:0 24px 24px" },
        el("div", { class: "profile-top" },
          userAvatar(me, "lg", "width:92px;height:92px;border-radius:28px;font-size:28px;margin-top:-46px"),
          el("div", { class: "grow", style: "min-width:180px" },
            el("div", { style: "font-family:var(--display);font-size:24px;font-weight:600", text: me.display_name || me.username }),
            el("div", { class: "muted small", text: (me.role === "admin" ? "Admin" : "User") + " · " + chars.length + " characters · " + chats.length + " chats" })),
          el("div", { class: "actions" },
            el("button", { onclick: function () { go("settings"); } }, "Settings"),
            el("button", { onclick: function () { go("help"); } }, "Help"),
            me.role === "admin" ? el("button", { onclick: function () { go("admin"); } }, "Server Management") : null)),
        el("div", { class: "kpis" },
          kpi(chars.length, "characters"), kpi(chats.length, "chats"), kpi(msgs, "messages")))));

    var picInput = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp", style: "display:none", "aria-label": "Profile picture" });
    picInput.addEventListener("change", async function () {
      var f = picInput.files && picInput.files[0];
      if (!f) return;
      try {
        var r = await fetch("/api/auth/avatar", { method: "PUT", credentials: "same-origin", headers: { "Content-Type": f.type }, body: f });
        if (!r.ok) { var d = null; try { d = await r.json(); } catch (e) {} throw new Error((d && d.detail) || "Picture not saved"); }
        me.has_avatar = true; me._v = Date.now(); refreshMe(); renderProfile(); toast("Picture saved");
      } catch (e) { toast(e.message); }
    });
    var personaName = el("input", { id: "persona-name", value: me.persona_name || "", placeholder: "e.g. Jay" });
    var personaDesc = el("textarea", { id: "persona-desc", rows: "4", placeholder: "Who you play: look, job, how you know the characters. The characters know this." });
    personaDesc.value = me.persona_description || "";
    view.appendChild(picInput);
    view.appendChild(el("div", { class: "grid grid-2", style: "margin-top:18px" },
      el("div", { class: "card form" }, el("h2", { text: "Details" }),
        el("div", null, el("label", { for: "display", text: "Display name" }), nameInput),
        el("div", null, el("label", { text: "Profile picture" }),
          el("div", { class: "row", style: "flex-wrap:wrap" },
            el("button", { onclick: function () { picInput.click(); } }, me.has_avatar ? "Change picture" : "Upload picture"),
            me.has_avatar ? el("button", { class: "ghost", onclick: async function () {
              try { await api("/api/auth/avatar", { method: "DELETE" }); me.has_avatar = false; refreshMe(); renderProfile(); } catch (e) { toast(e.message); }
            } }, "Remove") : null)),
        el("div", { class: "row" }, save)),
      el("div", { class: "card form" }, el("h2", { text: "Persona" }),
        el("p", { class: "muted small", text: "Who you are in the roleplays. Every character knows it." }),
        el("div", null, el("label", { for: "persona-name", text: "Your role name" }), personaName),
        el("div", null, el("label", { for: "persona-desc", text: "About your role" }), personaDesc),
        el("div", { class: "row" }, el("button", { class: "primary", onclick: async function () {
          try {
            var r = await api("/api/auth/profile", { method: "PATCH", body: { persona_name: personaName.value, persona_description: personaDesc.value } });
            me.persona_name = r.persona_name; me.persona_description = r.persona_description; toast("Persona saved");
          } catch (e) { toast(e.message); }
        } }, "Save persona"))),
      el("div", { class: "card form" }, el("h2", { text: "Your data" }),
        el("p", { class: "muted small", text: "Download everything you own as JSON." }),
        el("div", { class: "row", style: "flex-wrap:wrap" },
          el("a", { class: "btn", href: "/api/export/characters", download: "" }, "Characters"),
          el("a", { class: "btn", href: "/api/export/chats", download: "" }, "Chats"),
          el("a", { class: "btn primary", href: "/api/export/all", download: "" }, "Everything")))));
  }
  function kpi(n, label) { return el("div", { class: "kpi" }, el("b", { text: String(n) }), el("span", { text: label })); }

  /* ---------- help: FAQ, guide, Markdown, support tickets ---------- */
  var HELP_TABS = ["faq", "guide", "md", "support"];
  var TICKET_STATUS = { open: "Open", in_progress: "In progress", answered: "Answered", closed: "Closed" };
  var TICKET_CATEGORY = { question: "Question", bug: "Bug", idea: "Idea", account: "Account", other: "Other" };
  var TICKET_PRIORITY = { low: "Low", normal: "Normal", high: "High" };
  state.helpTab = "faq";
  state.ticketId = null;
  state.ticketScope = null; // "mine" or "all"; admins start with all
  state.ticketStatus = "active";
  state.ticketDrafts = {};

  function helpText() {
    var h = window.CompainHelp || {};
    return (prefs.uiLanguage === "de" ? h.de : h.en) || h.en;
  }
  function helpHash() {
    return "help/" + state.helpTab + (state.helpTab === "support" && state.ticketId ? "/" + state.ticketId : "");
  }
  function setHelpHash() { var h = "#" + helpHash(); if (location.hash !== h) history.replaceState(null, "", h); }
  function md(text) { var d = el("div", { class: "md", "data-no-i18n": "" }); d.appendChild(mdRender(text)); return d; }
  function statusPill(s) {
    var cls = s === "answered" ? " ok" : s === "open" ? " accent" : "";
    return el("span", { class: "pill t-status t-" + s + cls, text: TICKET_STATUS[s] || s });
  }
  function optionsOf(map, current) {
    return Object.keys(map).map(function (k) { return el("option", { value: k, selected: k === current, text: map[k] }); });
  }

  async function updateHelpBadge() {
    if (!me) return;
    var n = 0;
    try {
      var s = await api("/api/tickets/summary");
      n = s.unread + (s.admin_unread || 0);
      state.ticketSummary = s;
    } catch (e) { return; }
    document.querySelectorAll(".help-badge").forEach(function (b) { b.textContent = String(n); b.hidden = n === 0; });
  }

  async function renderHelp() {
    var view = $("view-help");
    // A live update must not eat a reply that is being written.
    var draft = $("ticket-reply");
    if (draft && state.ticketId) state.ticketDrafts[state.ticketId] = draft.value;
    var T = helpText();
    view.textContent = "";
    view.appendChild(el("div", { class: "page-head" }, el("div", null,
      el("div", { class: "caps eyebrow", text: T.ui.eyebrow }), el("h1", { text: T.ui.title }), el("p", { text: T.ui.lead }))));
    var tabs = el("div", { class: "subtabs", role: "tablist", id: "help-tabs" });
    HELP_TABS.forEach(function (t) {
      tabs.appendChild(el("button", { role: "tab", "data-tab": t, "aria-selected": state.helpTab === t ? "true" : "false",
        onclick: function () { state.helpTab = t; if (t !== "support") state.ticketId = null; setHelpHash(); renderHelp(); } },
        T.ui.tabs[t], t === "support" ? el("i", { class: "badge nav-badge help-badge", hidden: true, style: "margin-left:6px" }) : null));
    });
    view.appendChild(tabs);
    var body = el("div", { class: "help-body" });
    view.appendChild(body);
    updateHelpBadge();
    if (state.helpTab === "faq") return helpFaq(body, T);
    if (state.helpTab === "guide") return helpGuide(body, T);
    if (state.helpTab === "md") return helpMarkdown(body, T);
    if (state.ticketId) return helpTicket(body, state.ticketId);
    return helpTickets(body);
  }

  function helpFaq(body, T) {
    var search = el("input", { id: "faq-search", placeholder: T.ui.faqSearch, "aria-label": T.ui.faqSearch });
    var list = el("div", { class: "faq-list" });
    function draw() {
      var q = search.value.trim().toLowerCase();
      list.textContent = "";
      var hits = T.faq.filter(function (f) { return !q || (f.q + " " + f.a).toLowerCase().indexOf(q) !== -1; });
      hits.forEach(function (f) {
        list.appendChild(el("details", { class: "card faq" }, el("summary", { "data-no-i18n": "", text: f.q }), md(f.a)));
      });
      if (!hits.length) list.appendChild(el("p", { class: "muted", text: T.ui.noFaq }));
    }
    search.addEventListener("input", draw);
    body.appendChild(el("div", { class: "search", style: "margin-bottom:14px" }, icon("i-search", "sm"), search));
    body.appendChild(list);
    draw();
    body.appendChild(el("div", { class: "card row", style: "margin-top:18px;flex-wrap:wrap;justify-content:space-between" },
      el("span", { text: "Didn't find an answer?" }),
      el("button", { class: "primary", onclick: function () { state.helpTab = "support"; state.ticketId = null; state.newTicket = true; setHelpHash(); renderHelp(); } }, "Open a ticket")));
  }

  function helpGuide(body, T) {
    var toc = el("div", { class: "row guide-toc", style: "flex-wrap:wrap;gap:6px;margin-bottom:16px" });
    var grid = el("div", { class: "grid grid-2" });
    T.guide.forEach(function (g, i) {
      var id = "guide-" + i;
      toc.appendChild(el("button", { class: "ghost", onclick: function () { var t = $(id); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); } }, g.title));
      grid.appendChild(el("div", { class: "card guide-card", id: id }, el("h2", { text: g.title }), md(g.body)));
    });
    body.appendChild(toc);
    body.appendChild(grid);
  }

  function helpMarkdown(body, T) {
    var M = T.md;
    var table = el("table", { class: "md-table" },
      el("thead", null, el("tr", null, el("th", { text: "You write" }), el("th", { text: "You see" }), el("th", { text: "Meaning" }))),
      el("tbody", null, M.rows.map(function (r) {
        return el("tr", null, el("td", null, el("pre", { class: "md-src", text: r[0] })), el("td", null, md(r[0])), el("td", { class: "muted small", text: r[1] }));
      })));
    body.appendChild(el("div", { class: "card" }, md(M.intro), el("div", { class: "table-wrap", style: "margin-top:14px" }, table), el("div", { style: "margin-top:14px" }, md(M.notes))));
    var input = el("textarea", { id: "md-try", rows: "7", "aria-label": M.tryLabel });
    input.value = M.tryText;
    var preview = el("div", { class: "bubble md-preview", id: "md-preview" });
    function draw() { setBubble(preview, input.value); }
    input.addEventListener("input", draw);
    draw();
    body.appendChild(el("div", { class: "card", style: "margin-top:18px" }, el("h2", { text: M.tryLabel }),
      el("div", { class: "grid grid-2", style: "margin-top:12px" }, input, el("div", { class: "msg char md-try-out" }, preview))));
  }

  async function helpTickets(body) {
    var admin = me.role === "admin";
    if (!state.ticketScope) state.ticketScope = admin ? "all" : "mine";
    var scope = admin ? state.ticketScope : "mine";
    var tickets = await api("/api/tickets?scope=" + scope + (state.ticketStatus !== "all" ? "&status=" + state.ticketStatus : ""));

    // New ticket form
    var subject = el("input", { id: "ticket-subject", maxlength: "200", placeholder: "Short summary, e.g. Replies stop mid sentence" });
    var category = el("select", { id: "ticket-category", "aria-label": "Category" }, optionsOf(TICKET_CATEGORY, "question"));
    var text = el("textarea", { id: "ticket-text", rows: "6", maxlength: "5000", placeholder: "What did you do, what did you expect, what happened? Markdown works." });
    var form = el("div", { class: "card form" + (state.newTicket ? "" : " hidden"), id: "ticket-form" },
      el("h2", { text: "New ticket" }),
      el("div", null, el("label", { for: "ticket-subject", text: "Subject" }), subject),
      el("div", null, el("label", { for: "ticket-category", text: "Category" }), category),
      el("div", null, el("label", { for: "ticket-text", text: "Message" }), text),
      el("div", { class: "row", style: "flex-wrap:wrap" },
        el("button", { class: "primary", id: "ticket-send", onclick: async function () {
          try {
            var t = await api("/api/tickets", { method: "POST", body: { subject: subject.value, category: category.value, content: text.value } });
            state.newTicket = false; state.ticketId = t.id; setHelpHash(); toast("Ticket sent"); renderHelp();
          } catch (e) { toast(e.message); }
        } }, "Send ticket"),
        el("button", { class: "ghost", onclick: function () { state.newTicket = false; form.classList.add("hidden"); } }, "Cancel")));

    var bar = el("div", { class: "row", style: "flex-wrap:wrap;gap:8px;margin-bottom:14px" },
      el("button", { class: "primary", id: "ticket-new", onclick: function () { state.newTicket = true; form.classList.remove("hidden"); subject.focus(); } }, icon("i-plus", "sm"), " New ticket"));
    if (admin) {
      bar.appendChild(el("div", { class: "segmented", role: "group" }, [["all", "All tickets"], ["mine", "My tickets"]].map(function (o) {
        return el("button", { "aria-pressed": scope === o[0] ? "true" : "false", "data-scope": o[0],
          onclick: function () { state.ticketScope = o[0]; renderHelp(); } }, o[1]);
      })));
    }
    var filter = el("select", { id: "ticket-filter", "aria-label": "Show", onchange: function () { state.ticketStatus = filter.value; renderHelp(); } },
      [["active", "Not closed"], ["open", "Open"], ["in_progress", "In progress"], ["answered", "Answered"], ["closed", "Closed"], ["all", "All"]].map(function (o) {
        return el("option", { value: o[0], selected: state.ticketStatus === o[0], text: o[1] });
      }));
    bar.appendChild(el("span", { class: "spacer", style: "flex:1" }));
    bar.appendChild(filter);

    body.appendChild(bar);
    body.appendChild(form);
    var list = el("div", { class: "ticket-list", id: "ticket-list" });
    if (!tickets.length) {
      list.appendChild(el("div", { class: "card empty" }, el("h2", { text: "No tickets here" }),
        el("p", { class: "muted", text: scope === "all" ? "Nothing to answer right now." : "Questions, problems or ideas? Open a ticket; the admins answer here." })));
    }
    tickets.forEach(function (t) {
      list.appendChild(el("button", { class: "card ticket-row" + (t.unread ? " unread" : ""), "data-id": String(t.id),
        onclick: function () { state.ticketId = t.id; setHelpHash(); renderHelp(); } },
        el("div", { class: "row", style: "gap:8px;flex-wrap:wrap" },
          t.unread ? el("i", { class: "unread-dot", "aria-label": "New answer" }) : null,
          el("b", { class: "grow ellipsis", "data-no-i18n": "", text: t.subject }),
          statusPill(t.status)),
        el("div", { class: "muted small ellipsis", style: "margin-top:6px", text: plain(t.last_message) }),
        el("div", { class: "row small muted", style: "gap:10px;margin-top:8px;flex-wrap:wrap" },
          el("span", { text: "#" + t.id }),
          el("span", { text: TICKET_CATEGORY[t.category] || t.category }),
          admin && !t.mine ? el("span", { text: t.user_name }) : null,
          admin && t.priority !== "normal" ? el("span", { class: "pill" + (t.priority === "high" ? " accent" : ""), text: TICKET_PRIORITY[t.priority] }) : null,
          admin && t.assigned_name ? el("span", { text: "→ " + t.assigned_name }) : null,
          el("span", { class: "grow" }),
          el("span", { text: fmtTime(t.updated_at) }))));
    });
    body.appendChild(list);
    if (state.newTicket) subject.focus();
  }

  async function helpTicket(body, id) {
    var t;
    try { t = await api("/api/tickets/" + id); }
    catch (e) { state.ticketId = null; setHelpHash(); toast(e.message); return helpTickets(body); }
    updateHelpBadge();
    var asAdmin = me.role === "admin" && !t.mine;
    var refresh = function (nt) { if (nt) t = nt; renderHelp(); };

    var head = el("div", { class: "card ticket-head" },
      el("button", { class: "ghost", id: "ticket-back", onclick: function () { state.ticketId = null; setHelpHash(); renderHelp(); } }, icon("i-back", "sm"), " All tickets"),
      el("div", { class: "row", style: "gap:10px;flex-wrap:wrap;margin-top:10px" },
        el("h2", { class: "grow", id: "ticket-title", "data-no-i18n": "", text: t.subject }), statusPill(t.status)),
      el("div", { class: "row small muted", style: "gap:12px;flex-wrap:wrap;margin-top:6px" },
        el("span", { text: "#" + t.id }),
        el("span", { text: TICKET_CATEGORY[t.category] || t.category }),
        el("span", { text: "From " + t.user_name }),
        el("span", { text: fmtTime(t.created_at) }),
        t.assigned_name ? el("span", { text: "Handled by " + t.assigned_name }) : null));

    var controls = el("div", { class: "row ticket-controls", style: "gap:8px;flex-wrap:wrap;margin-top:12px" });
    async function patch(b) { try { refresh(await api("/api/tickets/" + t.id, { method: "PATCH", body: b })); } catch (e) { toast(e.message); } }
    if (asAdmin) {
      var admins = await api("/api/tickets/admins");
      var lab = function (txt, node) { return el("label", { class: "inline-field small" }, el("span", { class: "muted", text: txt }), node); };
      var st = el("select", { id: "ticket-status", onchange: function () { patch({ status: st.value }); } }, optionsOf(TICKET_STATUS, t.status));
      var pr = el("select", { id: "ticket-priority", onchange: function () { patch({ priority: pr.value }); } }, optionsOf(TICKET_PRIORITY, t.priority));
      var ca = el("select", { id: "ticket-cat", onchange: function () { patch({ category: ca.value }); } }, optionsOf(TICKET_CATEGORY, t.category));
      var as = el("select", { id: "ticket-assign", onchange: function () { patch(as.value ? { assigned_to: Number(as.value) } : { unassign: true }); } },
        el("option", { value: "", text: "Nobody", selected: !t.assigned_to }),
        admins.map(function (a) { return el("option", { value: String(a.id), selected: a.id === t.assigned_to, text: a.name }); }));
      controls.appendChild(lab("Status", st));
      controls.appendChild(lab("Priority", pr));
      controls.appendChild(lab("Category", ca));
      controls.appendChild(lab("Handled by", as));
      controls.appendChild(el("button", { class: "ghost danger", id: "ticket-delete", onclick: function () {
        var b = this;
        if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Delete?"; setTimeout(function () { b.dataset.armed = ""; b.textContent = "Delete ticket"; }, 3000); return; }
        api("/api/tickets/" + t.id, { method: "DELETE" }).then(function () { toast("Ticket deleted"); state.ticketId = null; setHelpHash(); renderHelp(); }, function (e) { toast(e.message); });
      } }, "Delete ticket"));
    } else {
      controls.appendChild(t.status === "closed"
        ? el("button", { id: "ticket-reopen", onclick: function () { patch({ status: "open" }); } }, "Reopen ticket")
        : el("button", { id: "ticket-close", onclick: function () { patch({ status: "closed" }); } }, "Close ticket"));
    }
    head.appendChild(controls);
    body.appendChild(head);

    var thread = el("div", { class: "ticket-thread", id: "ticket-thread" });
    t.messages.forEach(function (m) {
      var cls = "t-msg" + (m.from_admin ? " admin" : " user") + (m.internal ? " internal" : "") + (m.mine ? " mine" : "");
      thread.appendChild(el("div", { class: cls },
        el("div", { class: "row small", style: "gap:8px;flex-wrap:wrap" },
          m.mine ? el("b", { text: "You" }) : el("b", { "data-no-i18n": "", text: m.author_name }),
          m.from_admin ? el("span", { class: "pill accent", text: "Admin" }) : null,
          m.internal ? el("span", { class: "pill", text: "Internal note" }) : null,
          el("span", { class: "grow" }),
          el("span", { class: "muted", text: fmtTime(m.created_at) })),
        el("div", { class: "bubble" }, mdRender(m.content))));
    });
    body.appendChild(thread);

    var reply = el("textarea", { id: "ticket-reply", rows: "4", maxlength: "5000", placeholder: asAdmin ? "Answer (Markdown works)…" : "Write an answer (Markdown works)…", "aria-label": "Answer" });
    reply.value = state.ticketDrafts[t.id] || "";
    var internal = asAdmin ? el("input", { type: "checkbox", id: "ticket-internal", style: "width:auto" }) : null;
    async function send(status) {
      var text = reply.value.trim();
      if (!text) { reply.focus(); return; }
      var b = { content: text };
      if (internal && internal.checked) b.internal = true;
      if (status) b.status = status;
      try {
        await api("/api/tickets/" + t.id + "/messages", { method: "POST", body: b });
        delete state.ticketDrafts[t.id];
        reply.value = "";
        toast(b.internal ? "Note saved" : "Answer sent");
        renderHelp();
      } catch (e) { toast(e.message); }
    }
    reply.addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } });
    body.appendChild(el("div", { class: "card form ticket-reply" },
      t.status === "closed" ? el("p", { class: "muted small", text: "This ticket is closed. Writing an answer opens it again." }) : null,
      reply,
      el("div", { class: "row", style: "flex-wrap:wrap;gap:8px" },
        el("button", { class: "primary", id: "ticket-answer", onclick: function () { send(); } }, icon("i-send", "sm"), " Send"),
        asAdmin ? el("button", { id: "ticket-answer-close", onclick: function () { send("closed"); } }, "Send and close") : null,
        internal ? el("label", { class: "row small", style: "gap:6px;cursor:pointer" }, internal, el("span", { text: "Internal note (only admins see it)" })) : null,
        el("span", { class: "muted small", text: "Ctrl+Enter sends" }))));
  }

  /* ---------- settings ---------- */
  function renderSettings() {
    var view = $("view-settings");
    view.textContent = "";

    var swatches = el("div", { class: "palette-grid", role: "radiogroup", "aria-label": "Color theme" });
    PALETTES.forEach(function (p) {
      swatches.appendChild(el("button", { class: "palette-card", role: "radio", "aria-checked": prefs.palette === p.id ? "true" : "false",
        onclick: function () { prefs.palette = p.id; savePrefs(); applyPrefs(); renderSettings(); } },
        el("span", { class: "preview" },
          el("i", { style: "background:" + p.color }),
          el("b", { style: "background:linear-gradient(90deg," + p.color + ",color-mix(in srgb," + p.color + " 40%,#000))" })),
        el("span", { class: "name" }, el("span", { text: p.name }), prefs.palette === p.id ? el("span", { class: "pill accent", text: "Active" }) : null)));
    });

    var modes = el("div", { class: "segmented", role: "group", "aria-label": "Appearance" });
    [["system", "System"], ["light", "Light"], ["dark", "Dark"]].forEach(function (m) {
      modes.appendChild(el("button", { "aria-pressed": prefs.mode === m[0] ? "true" : "false",
        onclick: function () { prefs.mode = m[0]; savePrefs(); applyPrefs(); renderSettings(); } }, m[1]));
    });

    var len = el("select", { id: "len" });
    REPLY_LENGTHS.forEach(function (r) { len.appendChild(el("option", { value: r[0], selected: prefs.replyLength === r[0], text: r[1] })); });
    len.addEventListener("change", function () { prefs.replyLength = len.value; savePrefs(); toast("Reply length: " + len.value); });

    var ctx = el("select", { id: "ctx" });
    CONTEXTS.forEach(function (c) { ctx.appendChild(el("option", { value: String(c[0]), selected: prefs.ctx === c[0], text: c[1] })); });
    ctx.addEventListener("change", function () { prefs.ctx = Number(ctx.value); savePrefs(); toast("Context saved"); });

    var designs = el("div", { class: "design-grid", role: "radiogroup", "aria-label": "Design" });
    DESIGNS.forEach(function (d) {
      var mini = el("span", { class: "mini" + (d.glassy ? " glassy" : "") },
        d.top ? el("span", { class: "bar" }, el("b")) : el("span", { class: "side" }),
        el("span", { class: "panel", style: d.top ? "left:6px;top:26px" : "left:calc(22% + 12px);top:6px" }));
      designs.appendChild(el("button", { class: "design-card", role: "radio", "aria-checked": prefs.design === d.id ? "true" : "false", "data-design-id": d.id,
        onclick: function () { prefs.design = d.id; savePrefs(); applyPrefs(); renderSettings(); } },
        mini,
        el("span", { class: "name" }, el("span", { text: d.name }), prefs.design === d.id ? el("span", { class: "pill accent", text: "Active" }) : null),
        el("span", { class: "sub", text: d.sub })));
    });
    var glassCard = null;
    if (prefs.design === "glass" || prefs.design === "modern-glass") {
      var bgs = el("div", { class: "segmented", role: "group", "aria-label": "Background" });
      var bgFile = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp", style: "display:none", "aria-label": "Background picture" });
      bgFile.addEventListener("change", async function () {
        var f = bgFile.files && bgFile.files[0];
        if (!f) return;
        try {
          var r = await fetch("/api/auth/background", { method: "PUT", credentials: "same-origin", headers: { "Content-Type": f.type }, body: f });
          if (!r.ok) { var d = null; try { d = await r.json(); } catch (e) {} throw new Error((d && d.detail) || "Picture not saved"); }
          me.has_background = true; state.bgVersion = Date.now(); prefs.bg = "custom"; savePrefs(); applyPrefs(); renderSettings(); toast("Background saved");
        } catch (e) { toast(e.message); }
      });
      BACKGROUNDS.forEach(function (b) {
        bgs.appendChild(el("button", { "aria-pressed": prefs.bg === b[0] ? "true" : "false", onclick: function () {
          if (b[0] === "custom" && !me.has_background) { bgFile.click(); return; }
          prefs.bg = b[0]; savePrefs(); applyPrefs(); renderSettings();
        } }, b[1]));
      });
      var slider = function (key, label, min, max, unit) {
        var out = el("output", { text: prefs[key] + unit });
        var input = el("input", { type: "range", min: String(min), max: String(max), value: String(prefs[key]), id: "g-" + key, "aria-label": label });
        input.addEventListener("input", function () { prefs[key] = Number(input.value); out.textContent = input.value + unit; applyPrefs(); });
        input.addEventListener("change", function () { savePrefs(); });
        return el("div", { class: "slider-row" }, el("label", { for: "g-" + key, text: label }), input, out);
      };
      glassCard = el("div", { class: "card form" }, el("h2", { text: "Glass" }),
        el("div", null, el("label", { text: "Background" }), bgs),
        bgFile,
        el("div", { class: "row", style: "flex-wrap:wrap" },
          el("button", { onclick: function () { bgFile.click(); } }, me.has_background ? "Change my picture" : "Upload my picture"),
          me.has_background ? el("button", { class: "ghost", onclick: async function () {
            try { await api("/api/auth/background", { method: "DELETE" }); me.has_background = false; if (prefs.bg === "custom") prefs.bg = "dusk"; savePrefs(); applyPrefs(); renderSettings(); }
            catch (e) { toast(e.message); }
          } }, "Remove my picture") : null,
          el("span", { class: "muted small", text: "Only you see your picture." })),
        slider("blur", "Blur", 0, 40, " px"), slider("alpha", "Panel opacity", 20, 95, " %"), slider("dim", "Dim background", 0, 80, " %"),
        el("p", { class: "muted small", text: "On phones the blur is switched off, so scrolling stays smooth." }));
    }
    view.appendChild(el("div", { class: "page-head" }, el("div", null, el("div", { class: "caps eyebrow", text: "Preferences" }), el("h1", { text: "Settings" }),
      el("p", { text: "Changes apply at once on all your devices." }))));
    view.appendChild(el("div", { class: "grid", style: "gap:18px" },
      el("div", { class: "card" }, el("h2", { text: "Design" }), el("p", { class: "muted small", style: "margin:6px 0 16px", text: "How Compain looks on all your devices." }), designs),
      glassCard,
      el("div", { class: "card" }, el("h2", { text: "Color theme" }), el("p", { class: "muted small", style: "margin:6px 0 16px", text: "Accent color and tinted surfaces for the whole app." }), swatches),
      el("div", { class: "card" }, el("div", { class: "row", style: "justify-content:space-between;flex-wrap:wrap;gap:14px" },
        el("div", null, el("h2", { text: "Appearance" }), el("p", { class: "muted small", text: "System follows your device." })), modes)),
      languageCard(),
      el("div", { class: "card form" }, el("h2", { text: "Replies" }),
        el("div", { class: "two" },
          el("div", null, el("label", { for: "len", text: "Reply length" }), len),
          el("div", null, el("label", { for: "ctx", text: "Context sent to the model" }), ctx)),
        el("div", { class: "switch" }, el("div", null, el("div", { text: "Sound when a reply is complete" }), el("div", { class: "muted small", text: "A short chime, also handy when the model is slow." })),
          el("button", { class: "toggle", role: "switch", "aria-checked": prefs.sound ? "true" : "false", "aria-label": "Sound when a reply is complete",
            onclick: function () { prefs.sound = !prefs.sound; savePrefs(); renderSettings(); if (prefs.sound) chime(); } }))),
      aboutCard(),
      passwordCard(),
      twoFactorCard(),
      devicesCard(),
      el("div", { class: "card" }, el("h2", { text: "Account" }),
        el("div", { class: "row", style: "flex-wrap:wrap;margin-top:12px" },
          el("button", { onclick: logout }, "Log out on this device"),
          el("button", { class: "ghost", onclick: logoutAll }, "Log out on all devices"))),
      deleteAccountCard()));
  }

  function passwordCard() {
    var cur = el("input", { type: "password", autocomplete: "current-password", id: "pw-cur" });
    var nw = el("input", { type: "password", autocomplete: "new-password", id: "pw-new" });
    var nw2 = el("input", { type: "password", autocomplete: "new-password", id: "pw-new2" });
    return el("div", { class: "card form" }, el("h2", { text: "Password" }),
      el("div", { class: "two" },
        el("div", null, el("label", { for: "pw-cur", text: "Current password" }), cur),
        el("div", null, el("label", { for: "pw-new", text: "New password" }), nw),
        el("div", null, el("label", { for: "pw-new2", text: "New password again" }), nw2)),
      el("p", { class: "muted small", text: "Your other devices are logged out; this one stays logged in." }),
      el("div", null, el("button", { class: "primary", onclick: async function () {
        if (nw.value !== nw2.value) { toast("The new passwords are not the same"); return; }
        try { await api("/api/auth/password", { method: "POST", body: { current: cur.value, new: nw.value } }); cur.value = nw.value = nw2.value = ""; toast("Password changed"); }
        catch (e) { toast(e.message); }
      } }, "Change password")));
  }

  function twoFactorCard() {
    var card = el("div", { class: "card form" }, el("h2", { text: "Two-factor login" }));
    if (me.totp_enabled) {
      var pw = el("input", { type: "password", autocomplete: "current-password", id: "tf-pw" });
      card.appendChild(el("p", null, el("span", { class: "pill ok", text: "On" }), " ", el("span", { class: "muted small", text: me.recovery_codes_left + " recovery codes left" })));
      card.appendChild(el("div", null, el("label", { for: "tf-pw", text: "Password to switch it off" }), pw));
      card.appendChild(el("div", null, el("button", { class: "ghost", onclick: async function () {
        try { await api("/api/auth/2fa/disable", { method: "POST", body: { password: pw.value } }); await refreshMe(); renderSettings(); toast("Two-factor login is off"); }
        catch (e) { toast(e.message); }
      } }, "Switch off")));
      return card;
    }
    card.appendChild(el("p", { class: "muted small", text: "After the password, Compain also asks for a code from an authenticator app (for example Aegis, Google Authenticator, 1Password)." }));
    var area = el("div", { class: "form" });
    card.appendChild(area);
    area.appendChild(el("div", null, el("button", { class: "primary", onclick: async function () {
      try {
        var r = await api("/api/auth/2fa/setup", { method: "POST" });
        area.textContent = "";
        var qr = new DOMParser().parseFromString(r.qr_svg, "image/svg+xml").documentElement; // our own server's SVG
        qr.setAttribute("class", "qr");
        var code = el("input", { id: "tf-code", inputmode: "numeric", autocomplete: "one-time-code", placeholder: "123456" });
        area.appendChild(el("div", { class: "row", style: "flex-wrap:wrap;align-items:flex-start;gap:18px" }, document.importNode(qr, true),
          el("div", { class: "grow form" },
            el("p", { class: "small", text: "1. Scan the code with your authenticator app (or type the key)." }),
            el("code", { class: "secret", text: r.secret }),
            el("div", null, el("label", { for: "tf-code", text: "2. Code from the app" }), code),
            el("div", null, el("button", { class: "primary", onclick: async function () {
              try {
                var res = await api("/api/auth/2fa/enable", { method: "POST", body: { code: code.value } });
                area.textContent = "";
                area.appendChild(el("p", { class: "small", text: "Two-factor login is on. Keep these recovery codes somewhere safe; each works once if your phone is gone:" }));
                area.appendChild(el("pre", { class: "codes", text: res.recovery_codes.join("\n") }));
                area.appendChild(el("button", { onclick: async function () { await refreshMe(); renderSettings(); } }, "I saved them"));
              } catch (e) { toast(e.message); }
            } }, "Switch on")))));
      } catch (e) { toast(e.message); }
    } }, "Set up")));
    return card;
  }

  function devicesCard() {
    var card = el("div", { class: "card" }, el("h2", { text: "Devices" }),
      el("p", { class: "muted small", style: "margin:6px 0 10px", text: "Where your account is logged in. End anything you do not recognise." }));
    var list = el("div", { class: "form" });
    card.appendChild(list);
    api("/api/auth/sessions").then(function (rows) {
      rows.forEach(function (d) {
        var ua = d.user_agent || "Unknown device";
        var label = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone / iPad" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Device";
        var browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
        list.appendChild(el("div", { class: "switch" },
          el("div", { style: "min-width:0" },
            el("div", null, label + (browser ? " · " + browser : ""), d.current ? el("span", { class: "pill accent", style: "margin-left:8px", text: "This device" }) : null),
            el("div", { class: "muted small ellipsis", text: (d.ip || "") + (d.last_seen ? " · last used " + fmtTime(d.last_seen) : "") })),
          d.current ? null : el("button", { class: "ghost", onclick: async function () {
            try { await api("/api/auth/sessions/" + d.id, { method: "DELETE" }); renderSettings(); toast("Device logged out"); } catch (e) { toast(e.message); }
          } }, "Log out")));
      });
    }).catch(function (e) { list.textContent = e.message; });
    return card;
  }

  function deleteAccountCard() {
    var pw = el("input", { type: "password", autocomplete: "current-password", id: "del-pw" });
    var confirmName = el("input", { id: "del-name", placeholder: me.username });
    return el("div", { class: "card form danger" }, el("h2", { text: "Delete account" }),
      el("p", { class: "muted small", text: "Deletes your account with all characters, chats, pictures and settings. This cannot be undone. Export your data first (Profile → Your data)." }),
      el("div", { class: "two" },
        el("div", null, el("label", { for: "del-name", text: "Type your username" }), confirmName),
        el("div", null, el("label", { for: "del-pw", text: "Password" }), pw)),
      el("div", null, el("button", { class: "danger-btn", onclick: async function () {
        try {
          await api("/api/auth/delete-account", { method: "POST", body: { password: pw.value, confirm: confirmName.value } });
          me = null; location.hash = ""; location.reload();
        } catch (e) { toast(e.message); }
      } }, "Delete my account")));
  }

  async function refreshMe() {
    var v = me && me._v;
    me = await api("/api/auth/me");
    me._v = v || Date.now();
    var ini = $("me-ini");
    ini.replaceWith(Object.assign(userAvatar(me, "sm"), { id: "me-ini" }));
  }

  function aboutCard() {
    var version = el("span", { class: "pill", text: "…" });
    fetch("/api/health").then(function (r) { return r.json(); }).then(function (h) { version.textContent = "Version " + h.version; }).catch(function () {});
    return el("div", { class: "card" },
      el("div", { class: "row", style: "justify-content:space-between;flex-wrap:wrap;gap:12px" },
        el("div", null, el("h2", { text: "About Compain" }), el("p", { class: "muted small", text: "What changed, and who runs this server." })),
        version),
      el("div", { class: "row", style: "flex-wrap:wrap;margin-top:14px" },
        el("button", { onclick: function () { openPopover("changelog", null); } }, "Changelog"),
        el("button", { onclick: function () { openPopover("impressum", null); } }, "Impressum"),
        el("button", { onclick: function () { openPopover("datenschutz", null); } }, "Datenschutz")));
  }

  function languageCard() {
    var ui = el("select", { id: "ui-lang" });
    [["en", "English"], ["de", "Deutsch"]].forEach(function (o) { ui.appendChild(el("option", { value: o[0], selected: prefs.uiLanguage === o[0], text: o[1] })); });
    ui.addEventListener("change", function () {
      prefs.uiLanguage = ui.value;
      savePrefs();
      setTimeout(function () { location.reload(); }, 300); // redraw every screen in the new language
    });
    var rl = el("select", { id: "rp-lang" });
    [["auto", "Automatic (my language)"], ["en", "English"], ["de", "Deutsch"]].forEach(function (o) { rl.appendChild(el("option", { value: o[0], selected: prefs.language === o[0], text: o[1] })); });
    rl.addEventListener("change", function () { prefs.language = rl.value; savePrefs(); toast("Saved"); });
    return el("div", { class: "card form" }, el("h2", { text: "Language" }),
      el("div", { class: "two" },
        el("div", null, el("label", { for: "ui-lang", text: "Interface" }), ui),
        el("div", null, el("label", { for: "rp-lang", text: "Replies in" }), rl)));
  }

  async function logout() {
    try { await api("/api/auth/logout", { method: "POST" }); } catch (e) { /* already logged out */ }
    location.reload();
  }
  async function logoutAll() {
    try { await api("/api/auth/logout-all", { method: "POST" }); } catch (e) { /* ignore */ }
    location.reload();
  }

  /* ---------- admin ---------- */
  var ADMIN_TABS = [
    ["overview", "Overview"], ["users", "Users"], ["characters", "Characters"], ["api", "Hosted API"],
    ["security", "Access & security"], ["domain", "Domain & HTTPS"], ["models", "Models"], ["backups", "Backups"],
    ["storage", "Storage"], ["logs", "Logs & maintenance"]
  ];
  var adminSettings = null;

  async function loadAdminSettings() {
    adminSettings = await api("/api/admin/settings");
    return adminSettings;
  }

  // A form that saves only the fields the admin changed.
  function settingsForm(fields, note) {
    var inputs = {};
    var box = el("div", { class: "form" });
    var grid = el("div", { class: "two" }); // short fields side by side
    box.appendChild(grid);
    fields.forEach(function (f) {
      var v = adminSettings[f.key];
      var input;
      if (f.type === "bool") {
        input = el("button", { class: "toggle", role: "switch", "aria-checked": v ? "true" : "false", "aria-label": f.label,
          onclick: function () { input.setAttribute("aria-checked", input.getAttribute("aria-checked") === "true" ? "false" : "true"); } });
        box.appendChild(el("div", { class: "switch" }, el("div", null, el("div", { text: f.label }), f.help ? el("div", { class: "muted small", text: f.help }) : null), input));
      } else if (f.type === "select") {
        input = el("select", null);
        f.options.forEach(function (o) { input.appendChild(el("option", { value: o[0], selected: String(v) === o[0], text: o[1] })); });
        grid.appendChild(el("div", null, el("label", { text: f.label }), input));
      } else {
        input = el("input", { type: f.type === "int" ? "number" : "text", min: f.type === "int" ? "0" : null, value: v === null || v === undefined ? "" : String(v) });
        grid.appendChild(el("div", null, el("label", { text: f.label }), input, f.help ? el("div", { class: "muted small", style: "margin-top:6px", text: f.help }) : null));
      }
      inputs[f.key] = { el: input, type: f.type, original: v };
    });
    var status = el("span", { class: "muted small" });
    var save = el("button", { class: "primary", onclick: async function () {
      var body = {};
      Object.keys(inputs).forEach(function (k) {
        var i = inputs[k], value;
        if (i.type === "bool") value = i.el.getAttribute("aria-checked") === "true";
        else if (i.type === "int") value = Number(i.el.value);
        else value = i.el.value;
        if (value !== i.original) body[k] = value;
      });
      if (!Object.keys(body).length) { status.textContent = "Nothing changed."; return; }
      try {
        adminSettings = await api("/api/admin/settings", { method: "PUT", body: body });
        toast("Saved");
        renderAdmin();
      } catch (e) { toast(e.message); }
    } }, "Save");
    box.appendChild(el("div", { class: "row", style: "flex-wrap:wrap" }, save, status));
    if (note) box.appendChild(el("p", { class: "muted small", text: note }));
    return box;
  }

  function panel(title, content) {
    return el("div", { class: "card" }, el("h2", { text: title }), el("div", { style: "margin-top:12px" }, content));
  }

  async function renderAdmin() {
    var view = $("view-admin");
    view.textContent = "";
    view.appendChild(el("div", { class: "page-head" }, el("div", null, el("div", { class: "caps eyebrow", text: "Admins only" }), el("h1", { text: "Server Management" }),
      el("p", { text: "The server, the users and the models." }))));
    var tabs = el("div", { class: "subtabs", role: "tablist" });
    ADMIN_TABS.forEach(function (t) {
      tabs.appendChild(el("button", { role: "tab", "aria-selected": state.adminTab === t[0] ? "true" : "false",
        onclick: function () { state.adminTab = t[0]; renderAdmin(); } }, t[1]));
    });
    view.appendChild(tabs);
    var body = el("div", { class: "admin-panel" });
    view.appendChild(body);
    await loadAdminSettings();
    var tab = state.adminTab;
    if (tab === "overview") return adminOverview(body);
    if (tab === "users") return adminUsers(body);
    if (tab === "characters") return adminCharacters(body);
    if (tab === "api") return adminApi(body);
    if (tab === "security") return adminSecurity(body);
    if (tab === "domain") return adminDomain(body);
    if (tab === "models") return adminModels(body);
    if (tab === "backups") return adminBackups(body);
    if (tab === "storage") return adminStorage(body);
    if (tab === "logs") return adminLogs(body);
  }

  async function adminOverview(body) {
    var o = await api("/api/admin/overview");
    var disk = o.disk;
    body.appendChild(el("div", { class: "grid grid-3" },
      statCard("i-users", "Users", String(o.users), "accounts"),
      statCard("i-users", "Characters", String(o.characters), "all users"),
      statCard("i-chat", "Chats", String(o.chats), "all users"),
      statCard("i-chat", "Messages", String(o.messages), "stored"),
      statCard("i-clock", "Hosted API today", String(o.hosted_used_today), "messages, all users"),
      el("button", { class: "card stat-card lift", style: "text-align:left", id: "admin-tickets", onclick: function () { state.helpTab = "support"; state.ticketId = null; state.ticketScope = "all"; go("help/support"); } },
        el("div", { class: "ic-wrap" }, icon("i-help")), el("div", { class: "caps", text: "Tickets" }),
        el("div", { class: "stat", text: String(o.tickets_waiting || 0) }), el("div", { class: "muted small", text: "waiting for an answer" })),
      el("div", { class: "card stat-card" }, el("div", { class: "caps", text: "Disk" }),
        el("div", { class: "stat", text: disk.percent + "%" }),
        el("div", { class: "muted small", text: disk.used_gb + " of " + disk.total_gb + " GB used" }),
        el("div", { class: "meter", style: "margin-top:8px" }, el("span", { style: "width:" + disk.percent + "%" })))));
    body.appendChild(panel("Endpoints and status", el("div", { class: "form" },
      el("div", { class: "switch" }, el("span", { text: "Self-hosted model" }), el("span", { class: "muted small", text: o.self_hosted_url })),
      el("div", { class: "switch" }, el("span", { text: "Hosted API" }), el("span", { class: "muted small", text: o.hosted_url })),
      el("div", { class: "switch" }, el("span", { text: "Database" }), el("span", { class: "muted small", text: o.database })),
      el("div", { class: "switch" }, el("span", { text: "Maintenance mode" }), el("span", { class: "pill " + (o.maintenance_mode ? "accent" : "ok"), text: o.maintenance_mode ? "On" : "Off" })))));
    if (disk.percent >= adminSettings.disk_warn_percent) {
      body.appendChild(el("div", { class: "card", style: "border-color:var(--warn)" }, el("p", { text: "The disk is " + disk.percent + "% full. Check backups and storage." })));
    }
  }

  async function adminUsers(body) {
    var users = await api("/api/admin/users");
    var nu = { u: el("input", { placeholder: "username", "aria-label": "New username" }), p: el("input", { type: "password", placeholder: "password", "aria-label": "New password" }) };
    var table = el("table", null,
      el("thead", null, el("tr", null, el("th", { text: "User" }), el("th", { text: "Role" }), el("th", { text: "Status" }), el("th", null))),
      el("tbody", null, users.map(function (u) {
        return el("tr", null,
          el("td", { text: u.username }),
          el("td", null, el("span", { class: "pill" + (u.role === "admin" ? " accent" : ""), text: u.role })),
          el("td", null, el("span", { class: "pill " + (u.active ? "ok" : ""), text: u.active ? "Active" : "Disabled" })),
          el("td", null, el("div", { class: "row", style: "gap:6px;flex-wrap:wrap" },
            u.id === me.id ? null : el("button", { class: "ghost", onclick: async function () {
              try { await api("/api/admin/users/" + u.id, { method: "PATCH", body: { active: !u.active } }); renderAdmin(); }
              catch (e) { toast(e.message); }
            } }, u.active ? "Disable" : "Enable"),
            // For a user who forgot the password: set a new one and tell them.
            el("button", { class: "ghost", "data-user": u.username, onclick: function () {
              var cell = this.parentNode;
              if (cell.querySelector("input")) return;
              var pw = el("input", { type: "password", placeholder: "New password", "aria-label": "New password for " + u.username, style: "width:auto;min-width:150px" });
              cell.appendChild(pw);
              cell.appendChild(el("button", { class: "primary", onclick: async function () {
                try { await api("/api/admin/users/" + u.id, { method: "PATCH", body: { password: pw.value } }); toast("Password set"); renderAdmin(); }
                catch (e) { toast(e.message); }
              } }, "Save"));
              pw.focus();
            } }, "Set password"))));
      })));
    body.appendChild(panel("Users", el("div", null,
      el("div", { class: "table-wrap" }, table),
      el("div", { class: "row", style: "flex-wrap:wrap;margin-top:16px" }, nu.u, nu.p,
        el("button", { class: "primary", onclick: async function () {
          try { await api("/api/admin/users", { method: "POST", body: { username: nu.u.value, password: nu.p.value } }); toast("User created"); renderAdmin(); }
          catch (e) { toast(e.message); }
        } }, "Add user")))));
    body.appendChild(panel("Settings for new accounts", settingsForm([
      { key: "upload_max_mb", label: "Largest upload (MB)", type: "int", help: "Pictures and card files" },
      { key: "password_min_length", label: "Minimum password length", type: "int" }
    ])));
  }

  async function adminCharacters(body) {
    var queue = await api("/api/admin/community/queue");
    var list = queue.length ? el("ul", { class: "feed" }, queue.map(function (c) {
      return el("li", null, el("div", { class: "grow", text: c.name + " (owner #" + c.owner_id + ")" }),
        el("button", { class: "ghost", onclick: async function () { await review(c.id, "approve"); } }, "Approve"),
        el("button", { class: "ghost", onclick: async function () { await review(c.id, "hide"); } }, "Hide"));
    })) : el("p", { class: "muted", text: "Nothing waiting for review." });
    body.appendChild(panel("Community review queue", list));
    body.appendChild(panel("Community and import", settingsForm([
      { key: "card_import_enabled", label: "Allow card import", type: "bool", help: "SillyTavern JSON, PNG cards and plain text" }
    ], "The adults-only check runs on every save and import. Review every character before it becomes public.")));
    async function review(id, action) {
      try { await api("/api/admin/community/" + id + "/review", { method: "POST", body: { action: action } }); toast("Done"); renderAdmin(); }
      catch (e) { toast(e.message); }
    }
  }

  var PROVIDERS = [
    { id: "", name: "From .env (default)", url: "", model: "", note: "Uses COMPAIN_HOSTED_API_BASE_URL and COMPAIN_HOSTED_API_KEY from .env." },
    { id: "groq", name: "Groq (free)", url: "https://api.groq.com/openai/v1", model: "llama-3.1-8b-instant", note: "Free, rate-limited per model, very fast. Recommended start." },
    { id: "openrouter", name: "OpenRouter (free models)", url: "https://openrouter.ai/api/v1", model: "", note: "Many free models behind one key. Enter the model id from openrouter.ai (free ones end with :free)." },
    { id: "cerebras", name: "Cerebras (free)", url: "https://api.cerebras.ai/v1", model: "llama3.1-8b", note: "Free, fast, but about 8K tokens of context on the free tier." },
    { id: "mistral", name: "Mistral (free plan)", url: "https://api.mistral.ai/v1", model: "mistral-small-latest", note: "Free plan with rate limits." },
    { id: "google", name: "Google AI Studio (free, strict filter)", url: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.0-flash", note: "Strict content filter. Not suitable for adult roleplay." },
    { id: "venice", name: "Venice (paid, uncensored)", url: "https://api.venice.ai/api/v1", model: "venice-uncensored", note: "Paid. Built around uncensored models. Recommended paid option." },
    { id: "deepseek", name: "DeepSeek (paid, low price)", url: "https://api.deepseek.com/v1", model: "deepseek-chat", note: "Paid, very cheap. Test the content policy before relying on it." },
    { id: "custom", name: "Custom endpoint", url: "", model: "", note: "Any OpenAI-compatible endpoint." }
  ];

  function adminApi(body) {
    var s = adminSettings;
    var prov = el("select", { id: "h-prov" });
    PROVIDERS.forEach(function (p) { prov.appendChild(el("option", { value: p.id, selected: s.hosted_provider === p.id, text: p.name })); });
    var url = el("input", { id: "h-url", value: s.hosted_url || "", placeholder: "https://…/v1" });
    var model = el("input", { id: "h-model", value: s.hosted_model || "", placeholder: "model id" });
    var key = el("input", { id: "h-key", type: "password", value: s.hosted_api_key || "", placeholder: "API key", autocomplete: "off" });
    var note = el("p", { class: "muted small" });
    function showNote() { var p = PROVIDERS.filter(function (x) { return x.id === prov.value; })[0]; note.textContent = p ? p.note + " Check the model name on the provider's page." : ""; }
    prov.addEventListener("change", function () {
      var p = PROVIDERS.filter(function (x) { return x.id === prov.value; })[0];
      if (p && p.id !== "custom") { url.value = p.url; model.value = p.model; }
      showNote();
    });
    showNote();
    var result = el("p", { class: "small", style: "min-height:1.2em" });
    body.appendChild(panel("Provider", el("div", { class: "form" },
      el("div", { class: "two" },
        el("div", null, el("label", { for: "h-prov", text: "Provider" }), prov),
        el("div", null, el("label", { for: "h-model", text: "Model" }), model),
        el("div", null, el("label", { for: "h-url", text: "Endpoint (OpenAI-compatible)" }), url),
        el("div", null, el("label", { for: "h-key", text: "API key" }), key)),
      note,
      el("div", { class: "row", style: "flex-wrap:wrap" },
        el("button", { class: "primary", onclick: async function () {
          try {
            adminSettings = await api("/api/admin/settings", { method: "PUT", body: { hosted_provider: prov.value, hosted_url: url.value, hosted_model: model.value, hosted_api_key: key.value } });
            toast("Saved");
            key.value = adminSettings.hosted_api_key;
          } catch (e) { toast(e.message); }
        } }, "Save provider"),
        el("button", { onclick: async function () {
          result.textContent = "Testing…";
          try {
            var r = await api("/api/admin/hosted/test", { method: "POST" });
            result.textContent = r.ok ? ("Connected. Reply: \u201c" + r.reply + "\u201d (" + r.seconds + " s, " + r.model + ")") : ("Not connected: " + r.error + " at " + r.endpoint);
          } catch (e) { result.textContent = e.message; }
        } }, "Test connection")),
      result,
      el("p", { class: "muted small", text: "The key is stored encrypted and never shown again. It is also inside backups (encrypted), so keep COMPAIN_SECRET_KEY safe." }))));
    body.appendChild(panel("Limits for the hosted API", settingsForm([
      { key: "hosted_daily_limit", label: "Messages per user per day", type: "int" },
      { key: "hosted_daily_total", label: "Total per day (all users)", type: "int" }
    ], "Self-hosted models are unlimited.")));
  }

  async function adminSecurity(body) {
    var inv = el("code", { text: adminSettings.invite_code || "no code yet" });
    body.appendChild(panel("Sign-up", el("div", null,
      el("div", { class: "row", style: "flex-wrap:wrap;margin-bottom:12px" }, el("span", { class: "muted small", text: "Invite code: " }), inv,
        el("button", { onclick: async function () {
          try { var r = await api("/api/admin/invite-code", { method: "POST" }); toast("New invite code created"); inv.textContent = r.invite_code; }
          catch (e) { toast(e.message); }
        } }, "New invite code")),
      settingsForm([
        { key: "signup_mode", label: "New accounts", type: "select", options: [["closed", "Closed (admin creates users)"], ["invite", "With invite code"]] }
      ]))));
    body.appendChild(panel("Sessions and lockout", settingsForm([
      { key: "session_hours", label: "Login lasts (hours)", type: "int" },
      { key: "remember_days", label: "\"Stay logged in\" lasts (days)", type: "int" },
      { key: "failed_login_limit", label: "Lock after failed tries", type: "int" },
      { key: "lock_minutes", label: "Lock time (minutes)", type: "int" },
      { key: "password_min_length", label: "Minimum password length", type: "int" }
    ])));
    body.appendChild(panel("Log out everyone", el("div", { class: "row", style: "flex-wrap:wrap" },
      el("p", { class: "muted small", style: "flex:1", text: "Ends every login, including yours. Users must log in again." }),
      el("button", { class: "ghost", onclick: async function () {
        if (!confirm_inline(this)) return;
        try { await api("/api/admin/logout-everyone", { method: "POST" }); location.reload(); }
        catch (e) { toast(e.message); }
      } }, "Log out everyone"))));
  }

  function adminDomain(body) {
    body.appendChild(panel("Address", settingsForm([
      { key: "domain", label: "Domain (optional)", type: "text", help: "For example compain.example.com. It must point to this server." },
      { key: "https_enabled", label: "HTTPS is set up", type: "bool", help: "Turn this on after starting the proxy: docker compose --profile https up -d (set COMPAIN_DOMAIN in .env first)." }
    ])));
    body.appendChild(panel("Where to reach Compain", el("p", { class: "muted small", text: "Now: http://this-server:8080 (home network only). After HTTPS: https://your-domain. Login details are not encrypted over plain HTTP, so do not open port 8080 to the internet." })));
  }

  async function adminModels(body) {
    var s = adminSettings;
    var last = s.last_speed_test || {};
    var result = el("p", { class: "muted small", text: last.at ? ("Last test " + last.at + ": " + last.pieces_per_second + " pieces per second, first piece after " + last.first_piece_seconds + " s") : "No speed test yet." });
    body.appendChild(panel("Models", settingsForm([
      { key: "self_hosted_model_name", label: "Name of the self-hosted model", type: "text", help: "Shown in chats. Start: Mistral Small 3.2 abliteration (Q4_K_M)." },
      { key: "default_model", label: "Default for new chats", type: "select", options: [["self", "Self-hosted model"], ["hosted", "Hosted API"]] },
      { key: "context_tokens", label: "Context window per request (tokens)", type: "int", help: "Must fit the model server. Compose starts it with 16384 tokens for 2 slots, so 8192 each." }
    ])));
    body.appendChild(panel("Speed test", el("div", null,
      el("p", { class: "muted small", text: "Measures how fast the self-hosted model writes. Run it after changing the model or the server." }),
      el("div", { class: "row", style: "flex-wrap:wrap" }, el("button", { class: "primary", onclick: async function () {
        result.textContent = "Testing…";
        try { var r = await api("/api/admin/models/speedtest", { method: "POST" }); toast("Done"); result.textContent = "Result: " + r.pieces_per_second + " pieces per second (" + r.pieces + " pieces in " + r.seconds + " s)."; }
        catch (e) { result.textContent = e.message; }
      } }, "Run speed test")),
      result)));
  }

  async function adminBackups(body) {
    body.appendChild(panel("Nightly backup", settingsForm([
      { key: "backup_time", label: "Time (24-hour clock)", type: "text", help: "Backups run once a day at this time." },
      { key: "backup_keep_days", label: "Keep backups for (days)", type: "int" },
      { key: "backup_include_pictures", label: "Include character pictures", type: "bool" },
      { key: "backup_offsite", label: "Also copy to a second place", type: "bool", help: "For example a NAS or USB disk: set BACKUP_OFFSITE_DIR in .env to its folder. Old copies are removed with the same rule." }
    ], "Last run: " + (adminSettings.backup_last_run || "never") + " · status: " + adminSettings.backup_last_status)));
    api("/api/admin/backups-offsite").then(function (o) {
      body.appendChild(panel("Second place", el("p", { class: "small" },
        el("span", { class: "pill " + (o.writable ? "ok" : ""), text: o.writable ? "Ready" : "Not available" }), " ",
        el("span", { class: "muted", text: o.writable ? "Backups can be copied there." : "Mount a folder with BACKUP_OFFSITE_DIR in .env and restart." }))));
    }).catch(function () {});
    var list = el("div", { class: "table-wrap" });
    async function drawList() {
      var rows = await api("/api/admin/backups");
      list.textContent = "";
      if (!rows.length) { list.appendChild(el("p", { class: "muted", text: "No backups yet." })); return; }
      list.appendChild(el("table", null,
        el("thead", null, el("tr", null, el("th", { text: "File" }), el("th", { text: "Size" }), el("th", { text: "Created" }), el("th", null))),
        el("tbody", null, rows.map(function (b) {
          return el("tr", null,
            el("td", { text: b.name }), el("td", { text: b.size_mb + " MB" }), el("td", { text: b.created }),
            el("td", null,
              el("a", { class: "btn ghost", href: "/api/admin/backups/" + encodeURIComponent(b.name), download: "" }, "Download"),
              el("button", { class: "ghost", onclick: async function () {
                var typed = prompt("Restoring replaces all current data. Type the file name to confirm:\n" + b.name);
                if (typed === null) return;
                try { await api("/api/admin/backups/" + encodeURIComponent(b.name) + "/restore", { method: "POST", body: { confirm: typed } }); toast("Restored. Reloading."); setTimeout(function () { location.reload(); }, 1200); }
                catch (e) { toast(e.message); }
              } }, "Restore")));
        }))));
    }
    body.appendChild(panel("Backups", el("div", null,
      el("div", { class: "row", style: "margin-bottom:12px" }, el("button", { class: "primary", onclick: async function () {
        try { var r = await api("/api/admin/backups/run", { method: "POST" }); toast("Backup " + r.name + " created"); renderAdmin(); }
        catch (e) { toast(e.message); }
      } }, "Back up now")),
      list)));
    drawList();
  }

  function adminStorage(body) {
    body.appendChild(panel("Uploads and disk", settingsForm([
      { key: "upload_max_mb", label: "Largest upload (MB)", type: "int", help: "Pictures and card files (1 to 50)" },
      { key: "disk_warn_percent", label: "Warn when the disk is full at (%)", type: "int" }
    ])));
    body.appendChild(panel("Cleanup", el("div", { class: "row", style: "flex-wrap:wrap" },
      el("p", { class: "muted small", style: "flex:1", text: "Removes picture files that no character uses any more." }),
      el("button", { onclick: async function () {
        try { var r = await api("/api/admin/storage/cleanup", { method: "POST" }); toast("Removed " + r.removed + " files (" + r.freed_mb + " MB)"); }
        catch (e) { toast(e.message); }
      } }, "Remove unused pictures"))));
  }

  async function adminLogs(body) {
    body.appendChild(panel("Maintenance", settingsForm([
      { key: "maintenance_mode", label: "Maintenance mode", type: "bool", help: "Users see a notice and cannot use the app. Admins can still log in." },
      { key: "notice", label: "Notice for users", type: "text", help: "Shown on the login page and in the app. Leave empty for none." }
    ])));
    body.appendChild(panel("Logging", settingsForm([
      { key: "log_chat_content", label: "Keep chat content in logs", type: "bool", help: "Off by default. Your chats stay private." },
      { key: "log_keep_days", label: "Keep logs (days)", type: "int" }
    ])));
    var rows = await api("/api/admin/audit");
    body.appendChild(panel("Recent admin activity", rows.length ? el("div", { class: "table-wrap" }, el("table", null,
      el("thead", null, el("tr", null, el("th", { text: "Time" }), el("th", { text: "User" }), el("th", { text: "Action" }), el("th", { text: "Detail" }))),
      el("tbody", null, rows.slice(0, 50).map(function (r) {
        return el("tr", null, el("td", { text: fmtTime(r.time) }), el("td", { text: r.user_id === me.id ? "you" : "#" + r.user_id }),
          el("td", { text: r.action }), el("td", { text: r.detail || "" }));
      })))) : el("p", { class: "muted", text: "Nothing yet." })));
  }

  /* ---------- popovers: Changelog and Impressum ---------- */
  var popover = null;
  var appVersion = null;

  // Small Markdown for the two texts: "# ", "## ", "- " and `code`. Built with text nodes only (no HTML from the file).
  function mdLite(text) {
    var box = el("div", { class: "md" });
    var list = null;
    function inline(line) {
      var parts = line.split("`");
      return parts.map(function (part, i) { return i % 2 ? el("code", { text: part }) : part; });
    }
    text.split("\n").forEach(function (raw) {
      var line = raw.replace(/\s+$/, "");
      if (line.indexOf("- ") === 0) {
        if (!list) { list = el("ul"); box.appendChild(list); }
        list.appendChild(el("li", null, inline(line.slice(2))));
        return;
      }
      list = null;
      if (line.indexOf("## ") === 0) box.appendChild(el("h2", null, inline(line.slice(3))));
      else if (line.indexOf("# ") === 0) box.appendChild(el("h1", null, inline(line.slice(2))));
      else if (line) box.appendChild(el("p", null, inline(line)));
    });
    return box;
  }

  function closePopover() {
    if (!popover) return;
    popover.node.remove();
    if (popover.backdrop) popover.backdrop.remove();
    if (popover.button) popover.button.setAttribute("aria-expanded", "false");
    popover = null;
  }

  async function openPopover(kind, button) {
    var same = popover && popover.kind === kind;
    closePopover();
    if (same && button) return; // second click on the same button closes it
    var title = kind === "changelog" ? "Changelog" : kind === "datenschutz" ? "Datenschutz" : "Impressum";
    var body = el("div", null, el("p", { class: "muted small", text: "Loading…" }));
    var node = el("div", { class: "popover" + (button ? "" : " floating"), role: "dialog", "aria-label": title },
      el("div", { class: "popover-head" }, el("h2", { text: title }),
        el("button", { class: "ghost icon-only", "aria-label": "Close", onclick: closePopover }, "✕")),
      body);
    var backdrop = button ? null : el("div", { class: "popover-backdrop", onclick: closePopover });
    if (backdrop) document.body.appendChild(backdrop);
    (button ? $("tb-actions") : document.body).appendChild(node);
    if (button) button.setAttribute("aria-expanded", "true");
    popover = { kind: kind, node: node, backdrop: backdrop, button: button };
    try {
      var r = await fetch(kind === "changelog" ? "/api/changelog" : "/api/legal/" + kind, { credentials: "same-origin" });
      var text = r.ok ? await r.text() : "";
      body.textContent = "";
      if (!text) body.appendChild(el("p", { class: "muted", text: kind === "impressum" ? "The Impressum is not set up yet. The operator creates the file .impressum (template: .impressum-example)."
        : kind === "datenschutz" ? "The privacy policy is not set up yet. The operator creates the file .datenschutz (template: .datenschutz-example)." : "No changelog found." }));
      else body.appendChild(mdLite(text.replace(/^# [^\n]*\n/, "")));
    } catch (e) { body.textContent = e.message; }
    if (kind === "changelog" && appVersion && me) {
      $("tb-dot").hidden = true;
      if (prefs.seenChangelog !== appVersion) { prefs.seenChangelog = appVersion; savePrefs(); }
    }
  }

  function updateChangelogDot() {
    fetch("/api/health").then(function (r) { return r.json(); }).then(function (h) {
      appVersion = h.version;
      $("tb-dot").hidden = !me || prefs.seenChangelog === appVersion;
    }).catch(function () {});
  }

  $("tb-changelog").addEventListener("click", function () { openPopover("changelog", this); });
  $("tb-impressum").addEventListener("click", function () { openPopover("impressum", this); });
  $("tb-datenschutz").addEventListener("click", function () { openPopover("datenschutz", this); });
  document.querySelectorAll("[data-pop]").forEach(function (a) {
    a.addEventListener("click", function (e) { e.preventDefault(); openPopover(a.getAttribute("data-pop"), null); });
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closePopover(); });
  document.addEventListener("click", function (e) {
    if (popover && popover.button && !popover.node.contains(e.target) && !popover.button.contains(e.target)) closePopover();
  });

  /* ---------- live sync ---------- */
  var liveSocket = null;
  function connectLive() {
    if (!window.WebSocket) return;
    var proto = location.protocol === "https:" ? "wss://" : "ws://";
    var ws = new WebSocket(proto + location.host + "/ws");
    liveSocket = ws;
    ws.onmessage = function (ev) {
      var msg = null;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (!me) return;
      if (msg.type === "prefs" && msg.prefs) {
        // Settings changed on another device or browser of this account: apply them here too.
        var languageChanged = msg.prefs.uiLanguage && msg.prefs.uiLanguage !== prefs.uiLanguage;
        Object.assign(prefs, msg.prefs);
        try { localStorage.setItem("compain-prefs", JSON.stringify(prefs)); } catch (e) { /* ignore */ }
        applyPrefs();
        if (appVersion) $("tb-dot").hidden = prefs.seenChangelog === appVersion;
        if (languageChanged) { location.reload(); return; }
        if (state.route === "settings") renderSettings();
        return;
      }
      if (msg.type === "tickets") {
        updateHelpBadge();
        if (state.route === "help" && state.helpTab === "support") renderHelp();
        return;
      }
      if (msg.type !== "chats" || state.sending) return;
      if (state.route === "chats") renderChats();
      else if (state.route === "home") renderHome();
    };
    ws.onclose = function () {
      liveSocket = null;
      if (me) setTimeout(connectLive, 3000); // reconnect after a short wait
    };
  }

  /* ---------- login and start ---------- */
  function showLogin() {
    $("boot").classList.add("hidden");
    $("app").classList.add("hidden");
    $("bottombar").classList.add("hidden");
    $("view-login").classList.remove("hidden");
  }

  function showAgeGate() {
    ["boot", "view-login", "app", "bottombar"].forEach(function (id) { $(id).classList.add("hidden"); });
    $("age-gate").classList.remove("hidden");
  }

  $("age-yes").addEventListener("click", async function () {
    try {
      await api("/api/auth/confirm-age", { method: "POST", body: { adult: true } });
      me.age_confirmed = true;
      $("age-gate").classList.add("hidden");
      showApp();
    } catch (e) { toast(e.message); }
  });

  $("age-no").addEventListener("click", async function () {
    try { await api("/api/auth/confirm-age", { method: "POST", body: { adult: false } }); } catch (e) { /* expected: logged out */ }
    me = null;
    $("age-gate").classList.add("hidden");
    showLogin();
    $("login-error").textContent = "Compain is for adults only (18+).";
  });

  function showApp() {
    if (!me.age_confirmed) { showAgeGate(); return; }
    $("age-gate").classList.add("hidden");
    $("boot").classList.add("hidden");
    $("view-login").classList.add("hidden");
    $("app").classList.remove("hidden");
    $("bottombar").classList.remove("hidden");
    $("me-ini").replaceWith(Object.assign(userAvatar(me, "sm"), { id: "me-ini" }));
    $("me-name").textContent = me.display_name || me.username;
    $("me-role").textContent = me.role === "admin" ? "Admin" : "User";
    buildNav();
    api("/api/auth/preferences").then(function (p) {
      if (p && Object.keys(p).length) {
        Object.assign(prefs, p);
        try { localStorage.setItem("compain-prefs", JSON.stringify(prefs)); } catch (e) { /* ignore */ }
        applyPrefs();
        if (appVersion) $("tb-dot").hidden = prefs.seenChangelog === appVersion;
        if (state.route === "settings") renderSettings();
      }
    }).catch(function () { /* keep the local values */ });
    var banner = $("notice-banner");
    if (banner) { banner.textContent = me.notice || ""; banner.classList.toggle("hidden", !me.notice); }
    go(location.hash.slice(1) || "home");
    connectLive();
    updateChangelogDot();
  }

  $("login-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    $("login-error").textContent = "";
    try {
      var res = await api("/api/auth/login", { method: "POST", body: {
        username: $("user").value, password: $("pw").value, remember: $("remember").checked } });
      $("pw").value = "";
      if (res.mfa_required) {
        $("login-form").classList.add("hidden");
        $("mfa-form").classList.remove("hidden");
        $("mfa-code").focus();
        return;
      }
      me = await api("/api/auth/me");
      showApp();
    } catch (err) {
      $("login-error").textContent = err.message;
    }
  });

  $("mfa-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    $("mfa-error").textContent = "";
    try {
      await api("/api/auth/login/2fa", { method: "POST", body: { code: $("mfa-code").value } });
      $("mfa-code").value = "";
      $("mfa-form").classList.add("hidden");
      $("login-form").classList.remove("hidden");
      me = await api("/api/auth/me");
      showApp();
    } catch (err) { $("mfa-error").textContent = err.message; }
  });

  $("remember").addEventListener("change", function () {
    $("session-note").textContent = this.checked ? "Stays logged in on this device." : "Logs in for 48 hours.";
  });

  window.addEventListener("hashchange", function () { if (me) go(location.hash.slice(1) || "home"); });

  /* ---------- boot ---------- */
  // Installable app (PWA). Service workers need HTTPS or localhost; elsewhere the app works without it.
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    navigator.serviceWorker.register("/sw.js").catch(function () { /* not essential */ });
  }
  if (window.CompainI18n) window.CompainI18n.start();
  applyPrefs();
  fetch("/static/sprite.svg").then(function (r) { return r.text(); }).then(function (svg) {
    var holder = document.createElement("div");
    holder.innerHTML = svg;
    document.body.insertBefore(holder.firstChild, document.body.firstChild);
  }).catch(function () { /* icons missing: layout still works */ });

  fetch("/api/auth/status", { credentials: "same-origin" }).then(function (r) { return r.json(); }).then(function (st) {
    if (st.notice) { $("login-notice").textContent = st.notice; $("login-notice").classList.remove("hidden"); }
    if (st.signup_open) $("register-box").classList.remove("hidden");
  }).catch(function () { /* offline: the login still works */ });

  $("register-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    $("register-error").textContent = "";
    try {
      await api("/api/auth/register", { method: "POST", body: {
        username: $("reg-user").value, password: $("reg-pw").value, invite: $("reg-invite").value } });
      $("register-error").textContent = "Account created. You can log in now.";
      $("user").value = $("reg-user").value;
      $("pw").value = "";
    } catch (err) { $("register-error").textContent = err.message; }
  });

  api("/api/auth/me").then(function (u) { me = u; showApp(); }).catch(function () { showLogin(); });
})();
