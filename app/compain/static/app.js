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
  var BACKGROUNDS = [["dusk", "Dusk"], ["night", "Night"], ["forest", "Forest"], ["none", "None"]];
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
    { id: "settings", label: "Settings", icon: "i-gear" }
  ];
  var VIEWS = ["home", "chats", "characters", "community", "profile", "settings", "admin"];

  function buildNav() {
    var desk = $("nav-desktop"), bar = $("bottombar");
    desk.textContent = "";
    bar.textContent = "";
    NAV.forEach(function (n) {
      desk.appendChild(el("button", { "data-go": n.id, onclick: function () { go(n.id); } }, icon(n.icon), el("span", { text: n.label })));
    });
    if (me && me.role === "admin") {
      desk.appendChild(el("button", { "data-go": "admin", onclick: function () { go("admin"); } }, icon("i-shield"), el("span", { text: "Server Management" })));
    }
    NAV.slice(0, 5).forEach(function (n) {
      bar.appendChild(el("button", { "data-go": n.id, onclick: function () { go(n.id); } }, icon(n.icon), el("span", { text: n.label })));
    });
    var pills = $("topnav-pills");
    pills.textContent = "";
    NAV.concat(me && me.role === "admin" ? [{ id: "admin", label: "Server Management", icon: "i-shield" }] : []).forEach(function (n) {
      pills.appendChild(el("button", { "data-go": n.id, onclick: function () { go(n.id); } }, icon(n.icon, "sm"), el("span", { text: n.label })));
    });
  }

  function go(route) {
    var parts = String(route || "home").split("/");
    var name = parts[0];
    if (name === "chat") { name = "chats"; if (parts[1]) state.chatId = Number(parts[1]); }
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

    var hash = "#" + (name === "chats" && openChat ? "chats/" + state.chatId : name);
    if (location.hash !== hash) history.replaceState(null, "", hash);
    window.scrollTo(0, 0);

    var renderers = { home: renderHome, chats: renderChats, characters: renderCharacters, community: renderCommunity, profile: renderProfile, settings: renderSettings, admin: renderAdmin };
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
          el("span", { style: "display:block;font-size:13px;opacity:.85", class: "ellipsis", text: latest.last_message || "No messages yet" }))) : null,
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
          el("div", { class: "muted small ellipsis", text: c.last_message || "No messages yet" })),
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
          el("span", { class: "preview ellipsis", style: "display:block", text: c.character_name + " · " + (c.last_message || "No messages yet") })),
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

  async function renderConversation(pane, chatId, chats, drawList) {
    var chat = await api("/api/chats/" + chatId);
    pane.textContent = "";
    var listRef = chats.filter(function (c) { return c.id === chatId; })[0];

    var modelSel = el("select", { class: "model-select", "aria-label": "Model for this chat" });
    MODELS.forEach(function (m) { modelSel.appendChild(el("option", { value: m.value, selected: chat.model === m.value, text: m.label })); });
    modelSel.addEventListener("change", async function () {
      try {
        await api("/api/chats/" + chatId, { method: "PATCH", body: { model: modelSel.value } });
        toast("Model for this chat: " + modelSel.options[modelSel.selectedIndex].text);
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
      onclick: function () {
        var open = summaryBox.classList.toggle("hidden") === false;
        infoBtn.setAttribute("aria-pressed", open ? "true" : "false");
      } }, icon("i-info"));

    pane.appendChild(el("header", { class: "conv-head" },
      el("button", { class: "ghost icon-only back-btn", "aria-label": "Back to chat list", onclick: function () { go("chats"); } }, icon("i-back")),
      avatar(chat.character_name, chat.character_id, chat.character_has_picture),
      el("div", { class: "grow", style: "min-width:0" },
        el("div", { class: "name ellipsis", text: chat.character_name }),
        el("div", { class: "meta ellipsis", text: chat.title + (chat.character_tagline ? " · " + chat.character_tagline : "") })),
      el("div", { class: "tools" }, pinBtn, infoBtn, exportLink)));

    var important = chat.messages.filter(function (m) { return m.important; }).length;
    pane.appendChild(el("div", { class: "conv-stats" },
      el("span", { class: "pill", text: chat.messages.length + " messages" }),
      el("span", { class: "pill" }, icon("i-star", "sm"), " " + important + " of 10 important"),
      el("span", { class: "pill", text: chat.summary ? "Story summary saved" : "No story summary yet" }),
      el("span", { class: "pill", text: "Model:" }), modelSel));
    pane.appendChild(summaryBox);

    var box = el("div", { class: "messages", id: "messages" });
    pane.appendChild(box);
    chat.messages.forEach(function (m) { box.appendChild(messageNode(m, chat)); });

    var quick = el("div", { class: "quick" });
    ["Continue", "Describe the scene", "Shorter", "Longer", "Narrate the weather"].forEach(function (t) {
      quick.appendChild(el("button", { type: "button", text: t, onclick: function () { input.value = t; input.focus(); } }));
    });
    pane.appendChild(quick);

    var input = el("textarea", { rows: "1", placeholder: "Write your line or action…", "aria-label": "Message" });
    var sendBtn = el("button", { class: "primary send", type: "submit", "aria-label": "Send" }, icon("i-send"));
    var form = el("form", { class: "composer" }, input, sendBtn);
    pane.appendChild(form);

    form.addEventListener("submit", function (e) { e.preventDefault(); send(); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
    });

    var busy = false;
    async function send() {
      var text = input.value.trim();
      if (!text || busy) return;
      busy = true;
      state.sending = true;
      sendBtn.disabled = true;
      input.value = "";
      box.appendChild(messageNode({ id: null, role: "user", content: text, important: false }, chat));
      var typing = el("div", { class: "msg char typing" }, avatar(chat.character_name, chat.character_id, chat.character_has_picture, "xs"),
        el("div", { class: "bubble" }, el("span", { class: "dot" }), el("span", { class: "dot" }), el("span", { class: "dot" })));
      box.appendChild(typing);
      box.scrollTop = box.scrollHeight;

      var bubble = null;
      var reply = "";
      try {
        await streamMessage(chatId, text, function (delta) {
          if (!bubble) {
            typing.remove();
            var node = messageNode({ id: null, role: "assistant", content: "", important: false }, chat);
            box.appendChild(node);
            bubble = node.querySelector(".bubble");
            bubble.classList.add("cursor");
          }
          reply += delta;
          bubble.textContent = reply;
          box.scrollTop = box.scrollHeight;
        });
        if (bubble) bubble.classList.remove("cursor");
        // Reload the chat so the new messages get their ids (needed for "Mark important").
        await renderChats();
      } catch (e) {
        typing.remove();
        toast(e.message);
      } finally {
        busy = false;
        state.sending = false;
        sendBtn.disabled = false;
      }
    }
    box.scrollTop = box.scrollHeight;
  }

  function messageNode(m, chat) {
    var who = m.role === "user" ? "You" : chat.character_name;
    var wrap = el("div", { class: "msg " + (m.role === "user" ? "user" : "char") + (m.important ? " important" : "") });
    if (m.role !== "user") wrap.appendChild(avatar(chat.character_name, chat.character_id, chat.character_has_picture, "xs"));
    var col = el("div", { style: "min-width:0" },
      el("div", { class: "bubble", text: m.content }));
    if (m.role !== "user" && m.id) {
      col.appendChild(el("div", { class: "meta-line" },
        el("button", { class: "mark", "aria-pressed": m.important ? "true" : "false",
          onclick: async function () {
            try {
              await api("/api/chats/" + chat.id + "/messages/" + m.id, { method: "PATCH", body: { important: !m.important } });
              m.important = !m.important;
              toast(m.important ? "Marked important" : "Unmarked");
              await renderChats(); // refresh the counter and the list
            } catch (e) { toast(e.message); }
          } }, icon("i-star", "sm"), m.important ? " Important" : " Mark important")));
    }
    wrap.appendChild(col);
    return wrap;
  }

  async function streamMessage(chatId, text, onDelta) {
    var r = await fetch("/api/chats/" + chatId + "/messages", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text, reply_length: prefs.replyLength, context_messages: prefs.ctx, language: prefs.language })
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
          try { var chat = await api("/api/chats", { method: "POST", body: { character_id: c.id, model: "self" } }); go("chat/" + chat.id); }
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
        el("div", { class: "caps", text: "Featured" }),
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
            el("button", { class: "primary", onclick: function () { startChat(c.id); } }, "Chat"),
            el("button", { class: "ghost", onclick: function () { addToMine(c.id); } }, "Add"))));
      });
    view.appendChild(grid);
  }

  async function startChat(characterId) {
    try { var chat = await api("/api/chats", { method: "POST", body: { character_id: characterId, model: "self" } }); go("chat/" + chat.id); }
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
          el("span", { class: "avatar lg alt", style: "width:92px;height:92px;border-radius:28px;font-size:28px;margin-top:-46px", text: initials(me.display_name || me.username) }),
          el("div", { class: "grow", style: "min-width:180px" },
            el("div", { style: "font-family:var(--display);font-size:24px;font-weight:600", text: me.display_name || me.username }),
            el("div", { class: "muted small", text: (me.role === "admin" ? "Admin" : "User") + " · " + chars.length + " characters · " + chats.length + " chats" })),
          el("div", { class: "actions" },
            el("button", { onclick: function () { go("settings"); } }, "Settings"),
            me.role === "admin" ? el("button", { onclick: function () { go("admin"); } }, "Server Management") : null)),
        el("div", { class: "kpis" },
          kpi(chars.length, "characters"), kpi(chats.length, "chats"), kpi(msgs, "messages")))));

    view.appendChild(el("div", { class: "grid grid-2", style: "margin-top:18px" },
      el("div", { class: "card form" }, el("h2", { text: "Details" }),
        el("div", null, el("label", { for: "display", text: "Display name" }), nameInput),
        el("div", { class: "row" }, save)),
      el("div", { class: "card form" }, el("h2", { text: "Your data" }),
        el("p", { class: "muted small", text: "Download everything you own as JSON." }),
        el("div", { class: "row", style: "flex-wrap:wrap" },
          el("a", { class: "btn", href: "/api/export/characters", download: "" }, "Characters"),
          el("a", { class: "btn", href: "/api/export/chats", download: "" }, "Chats"),
          el("a", { class: "btn primary", href: "/api/export/all", download: "" }, "Everything")))));
  }
  function kpi(n, label) { return el("div", { class: "kpi" }, el("b", { text: String(n) }), el("span", { text: label })); }

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
      BACKGROUNDS.forEach(function (b) {
        bgs.appendChild(el("button", { "aria-pressed": prefs.bg === b[0] ? "true" : "false", onclick: function () { prefs.bg = b[0]; savePrefs(); applyPrefs(); renderSettings(); } }, b[1]));
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
          el("div", null, el("label", { for: "ctx", text: "Context sent to the model" }), ctx))),
      aboutCard(),
      el("div", { class: "card" }, el("h2", { text: "Account" }),
        el("div", { class: "row", style: "flex-wrap:wrap;margin-top:12px" },
          el("button", { onclick: logout }, "Log out on this device"),
          el("button", { class: "ghost", onclick: logoutAll }, "Log out on all devices")))));
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
        el("button", { onclick: function () { openPopover("impressum", null); } }, "Impressum")));
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
    var nu = { u: el("input", { placeholder: "username", "aria-label": "New username" }), p: el("input", { type: "password", placeholder: "password (min. length from settings)", "aria-label": "New password" }) };
    var table = el("table", null,
      el("thead", null, el("tr", null, el("th", { text: "User" }), el("th", { text: "Role" }), el("th", { text: "Status" }), el("th", null))),
      el("tbody", null, users.map(function (u) {
        return el("tr", null,
          el("td", { text: u.username }),
          el("td", null, el("span", { class: "pill" + (u.role === "admin" ? " accent" : ""), text: u.role })),
          el("td", null, el("span", { class: "pill " + (u.active ? "ok" : ""), text: u.active ? "Active" : "Disabled" })),
          el("td", null, u.id === me.id ? null : el("button", { class: "ghost", onclick: async function () {
            try { await api("/api/admin/users/" + u.id, { method: "PATCH", body: { active: !u.active } }); renderAdmin(); }
            catch (e) { toast(e.message); }
          } }, u.active ? "Disable" : "Enable")));
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
      { key: "backup_include_pictures", label: "Include character pictures", type: "bool" }
    ], "Last run: " + (adminSettings.backup_last_run || "never") + " · status: " + adminSettings.backup_last_status)));
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
    var title = kind === "changelog" ? "Changelog" : "Impressum";
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
      var r = await fetch(kind === "changelog" ? "/api/changelog" : "/api/legal/impressum", { credentials: "same-origin" });
      var text = r.ok ? await r.text() : "";
      body.textContent = "";
      if (!text) body.appendChild(el("p", { class: "muted", text: kind === "impressum" ? "The Impressum is not set up yet. The operator creates the file .impressum (template: .impressum-example)." : "No changelog found." }));
      else body.appendChild(mdLite(kind === "impressum" ? text.replace(/^# Impressum\s*\n/, "") : text.replace(/^# Changelog\s*\n/, "")));
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
    $("me-ini").textContent = initials(me.display_name || me.username);
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
      await api("/api/auth/login", { method: "POST", body: {
        username: $("user").value, password: $("pw").value, remember: $("remember").checked } });
      me = await api("/api/auth/me");
      $("pw").value = "";
      showApp();
    } catch (err) {
      $("login-error").textContent = err.message;
    }
  });

  $("remember").addEventListener("change", function () {
    $("session-note").textContent = this.checked ? "Stays logged in on this device." : "Logs in for 48 hours.";
  });

  window.addEventListener("hashchange", function () { if (me) go(location.hash.slice(1) || "home"); });

  /* ---------- boot ---------- */
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
