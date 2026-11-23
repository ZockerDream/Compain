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
    { id: "ocean", name: "Ocean", color: "#2f8fd8" },
    { id: "forest", name: "Forest", color: "#2f9e74" },
    { id: "violet", name: "Violet", color: "#8b6cf0" },
    { id: "rose", name: "Rose", color: "#e0517e" }
  ];
  var MODELS = [
    { value: "self", label: "Self-hosted model (unlimited)" },
    { value: "hosted", label: "Hosted API (daily limit)" }
  ];
  var REPLY_LENGTHS = [["short", "Short"], ["medium", "Medium"], ["long", "Long"]];
  var CONTEXTS = [[20, "Last 20 messages"], [60, "Last 60 messages + summary"], [200, "Last 200 messages + summary"]];

  function loadPrefs() {
    var p = { palette: "ember", mode: "system", replyLength: "medium", ctx: 60 };
    try {
      var raw = localStorage.getItem("compain-prefs");
      if (raw) Object.assign(p, JSON.parse(raw));
    } catch (e) { /* private window or blocked storage: defaults apply */ }
    return p;
  }
  function savePrefs() {
    try { localStorage.setItem("compain-prefs", JSON.stringify(prefs)); } catch (e) { /* ignore */ }
  }
  function applyPrefs() {
    document.documentElement.setAttribute("data-palette", prefs.palette);
    if (prefs.mode === "system") document.documentElement.removeAttribute("data-mode");
    else document.documentElement.setAttribute("data-mode", prefs.mode);
  }

  /* ---------- state ---------- */
  var prefs = loadPrefs();
  var me = null;
  var state = { chatId: null, cfilter: "all", query: "", communityFilter: "all", adminTab: "overview", editing: null };

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
  }

  function go(route) {
    var parts = String(route || "home").split("/");
    var name = parts[0];
    if (name === "chat") { name = "chats"; if (parts[1]) state.chatId = Number(parts[1]); }
    if (VIEWS.indexOf(name) === -1) name = "home";
    if (name === "admin" && (!me || me.role !== "admin")) name = "home";
    var openChat = name === "chats" && parts.length > 1;
    document.body.setAttribute("data-chat", openChat ? "1" : "0");

    VIEWS.forEach(function (v) { $("view-" + v).classList.toggle("hidden", v !== name); });
    document.querySelectorAll(".nav button, .bottombar button").forEach(function (b) {
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
        el("span", { class: "avatar", text: initials(latest.character_name) }),
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
        el("span", { class: "avatar sm", text: initials(c.character_name) }),
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
    [["all", "All"], ["pinned", "Pinned"], ["important", "Important"]].forEach(function (f) {
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
        if (state.cfilter === "pinned" && !c.pinned) return false;
        if (state.cfilter === "important" && c.important_count === 0) return false;
        if (!q) return true;
        return (c.title + " " + c.character_name + " " + c.last_message).toLowerCase().indexOf(q) !== -1;
      });
    }

    function row(c) {
      return el("button", { class: "c-row", "aria-current": state.chatId === c.id ? "true" : "false",
        onclick: function () { go("chat/" + c.id); } },
        el("span", { class: "avatar", text: initials(c.character_name) }),
        el("span", { class: "grow", style: "min-width:0" },
          el("span", { class: "top" },
            c.pinned ? icon("i-pin", "sm pin-ic") : null,
            el("span", { class: "title ellipsis", text: c.title }),
            el("span", { class: "time", text: fmtTime(c.updated_at) })),
          el("span", { class: "preview ellipsis", style: "display:block", text: c.character_name + " · " + (c.last_message || "No messages yet") })));
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

    pane.appendChild(el("header", { class: "conv-head" },
      el("button", { class: "ghost icon-only back-btn", "aria-label": "Back to chat list", onclick: function () { go("chats"); } }, icon("i-back")),
      el("span", { class: "avatar", text: initials(chat.character_name) }),
      el("div", { class: "grow", style: "min-width:0" },
        el("div", { class: "name ellipsis", text: chat.character_name }),
        el("div", { class: "meta ellipsis", text: chat.title + (chat.character_tagline ? " · " + chat.character_tagline : "") })),
      el("div", { class: "tools" }, pinBtn, exportLink)));

    var important = chat.messages.filter(function (m) { return m.important; }).length;
    pane.appendChild(el("div", { class: "conv-stats" },
      el("span", { class: "pill", text: chat.messages.length + " messages" }),
      el("span", { class: "pill" }, icon("i-star", "sm"), " " + important + " of 10 important"),
      el("span", { class: "pill", text: "Model:" }), modelSel));

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
      sendBtn.disabled = true;
      input.value = "";
      box.appendChild(messageNode({ id: null, role: "user", content: text, important: false }, chat));
      var typing = el("div", { class: "msg char typing" }, el("span", { class: "avatar xs", text: initials(chat.character_name) }),
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
        sendBtn.disabled = false;
      }
    }
    box.scrollTop = box.scrollHeight;
  }

  function messageNode(m, chat) {
    var who = m.role === "user" ? "You" : chat.character_name;
    var wrap = el("div", { class: "msg " + (m.role === "user" ? "user" : "char") + (m.important ? " important" : "") });
    if (m.role !== "user") wrap.appendChild(el("span", { class: "avatar xs", text: initials(chat.character_name) }));
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
      body: JSON.stringify({ content: text, reply_length: prefs.replyLength, context_messages: prefs.ctx })
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
    view.appendChild(el("div", { class: "page-head" },
      el("div", null, el("div", { class: "caps eyebrow", text: "Your library" }), el("h1", { text: "Characters" }),
        el("p", { text: "Characters you created. You can edit and delete only these." })),
      el("div", { class: "actions" }, el("button", { class: "primary", onclick: function () { state.editing = {}; renderCharacters(); } }, "New character"))));

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
      el("div", { class: "row" }, el("span", { class: "avatar", text: initials(c.name) }),
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
      el("span", { class: "avatar lg", text: initials(top.name) })));

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
          el("div", { class: "row" }, el("span", { class: "avatar alt", text: initials(c.name) }),
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

    view.appendChild(el("div", { class: "page-head" }, el("div", null, el("div", { class: "caps eyebrow", text: "Preferences" }), el("h1", { text: "Settings" }),
      el("p", { text: "Changes apply at once and stay on this device." }))));
    view.appendChild(el("div", { class: "grid", style: "gap:18px" },
      el("div", { class: "card" }, el("h2", { text: "Color theme" }), el("p", { class: "muted small", style: "margin:6px 0 16px", text: "The accent color for the whole app." }), swatches),
      el("div", { class: "card" }, el("div", { class: "row", style: "justify-content:space-between;flex-wrap:wrap;gap:14px" },
        el("div", null, el("h2", { text: "Appearance" }), el("p", { class: "muted small", text: "System follows your device." })), modes)),
      el("div", { class: "card form" }, el("h2", { text: "Replies" }),
        el("div", { class: "two" },
          el("div", null, el("label", { for: "len", text: "Reply length" }), len),
          el("div", null, el("label", { for: "ctx", text: "Context sent to the model" }), ctx))),
      el("div", { class: "card" }, el("h2", { text: "Account" }),
        el("div", { class: "row", style: "flex-wrap:wrap;margin-top:12px" },
          el("button", { onclick: logout }, "Log out on this device"),
          el("button", { class: "ghost", onclick: logoutAll }, "Log out on all devices")))));
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
    ["security", "Access & security"], ["domain", "Domain & HTTPS"], ["models", "Models"], ["backups", "Backups"], ["storage", "Storage"], ["logs", "Logs & maintenance"]
  ];
  var PLANNED = {
    security: "Sign-up modes, invite codes and session lengths are part of the design. Lockout is active in the API now; the admin controls follow in a later build.",
    domain: "Domain and HTTPS need the reverse proxy (Caddy) and certificate setup. Planned for the next build.",
    models: "Model install, speed test and runtime settings follow after the first model measurements.",
    backups: "Nightly backups and restore are planned next. Until then, back up the Docker volumes manually.",
    storage: "Upload limits are enforced now (10 MB, PNG/JPG/WebP). Cleanup tools follow later.",
    logs: "Admin action log is recorded in the database. The viewer and maintenance controls follow later."
  };

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

    if (state.adminTab === "overview") return adminOverview(body);
    if (state.adminTab === "users") return adminUsers(body);
    if (state.adminTab === "characters") return adminCharacters(body);
    if (state.adminTab === "api") return adminApi(body);
    body.appendChild(el("div", { class: "card" }, el("h2", { text: ADMIN_TABS.filter(function (t) { return t[0] === state.adminTab; })[0][1] }),
      el("p", { class: "muted", style: "margin-top:8px", text: PLANNED[state.adminTab] || "" })));
  }

  async function adminOverview(body) {
    var o = await api("/api/admin/overview");
    body.appendChild(el("div", { class: "grid grid-3" },
      statCard("i-users", "Users", String(o.users), "accounts"),
      statCard("i-users", "Characters", String(o.characters), "all users"),
      statCard("i-chat", "Chats", String(o.chats), "all users"),
      statCard("i-chat", "Messages", String(o.messages), "stored"),
      statCard("i-clock", "Hosted API today", String(o.hosted_used_today), "messages, all users"),
      el("div", { class: "card stat-card" }, el("div", { class: "caps", text: "Model endpoints" }),
        el("div", { class: "small", style: "margin-top:8px", text: "Self-hosted: " + o.self_hosted_url }),
        el("div", { class: "small", text: "Hosted: " + o.hosted_url }))));
  }

  async function adminUsers(body) {
    var users = await api("/api/admin/users");
    var nu = { u: el("input", { placeholder: "username", "aria-label": "New username" }), p: el("input", { type: "password", placeholder: "password (12+ characters)", "aria-label": "New password" }) };
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
    body.appendChild(el("div", { class: "card" },
      el("h2", { text: "Users" }),
      el("div", { class: "table-wrap", style: "margin-top:12px" }, table),
      el("div", { class: "row", style: "flex-wrap:wrap;margin-top:16px" }, nu.u, nu.p,
        el("button", { class: "primary", onclick: async function () {
          try { await api("/api/admin/users", { method: "POST", body: { username: nu.u.value, password: nu.p.value } }); toast("User created"); renderAdmin(); }
          catch (e) { toast(e.message); }
        } }, "Add user"))));
  }

  async function adminCharacters(body) {
    var queue = await api("/api/admin/community/queue");
    var list = queue.length ? el("ul", { class: "feed" }, queue.map(function (c) {
      return el("li", null, el("div", { class: "grow", text: c.name + " (owner #" + c.owner_id + ")" }),
        el("button", { class: "ghost", onclick: async function () { await review(c.id, "approve"); } }, "Approve"),
        el("button", { class: "ghost", onclick: async function () { await review(c.id, "hide"); } }, "Hide"));
    })) : el("p", { class: "muted", text: "Nothing waiting for review." });
    body.appendChild(el("div", { class: "card" }, el("h2", { text: "Community review queue" }), el("div", { style: "margin-top:12px" }, list)));
    body.appendChild(el("div", { class: "card" }, el("p", { class: "muted small", text: "The adults-only check runs on every save. Review every character before it becomes public." })));
    async function review(id, action) {
      try { await api("/api/admin/community/" + id + "/review", { method: "POST", body: { action: action } }); toast("Done"); renderAdmin(); }
      catch (e) { toast(e.message); }
    }
  }

  async function adminApi(body) {
    var s = await api("/api/admin/settings");
    var perUser = el("input", { type: "number", min: "0", value: String(s.hosted_daily_limit), "aria-label": "Messages per user per day" });
    var total = el("input", { type: "number", min: "0", value: String(s.hosted_daily_total), "aria-label": "Total per day" });
    body.appendChild(el("div", { class: "card form" },
      el("h2", { text: "Limits for the hosted API" }),
      el("div", { class: "two" },
        el("div", null, el("label", { text: "Messages per user per day" }), perUser),
        el("div", null, el("label", { text: "Total per day (all users)" }), total)),
      el("p", { class: "muted small", text: "Self-hosted models are unlimited. The provider is set with the environment variables (see .env.example)." }),
      el("div", null, el("button", { class: "primary", onclick: async function () {
        try { await api("/api/admin/settings", { method: "PUT", body: { hosted_daily_limit: Number(perUser.value), hosted_daily_total: Number(total.value) } }); toast("Saved"); }
        catch (e) { toast(e.message); }
      } }, "Save limits"))));
    body.appendChild(el("div", { class: "card" }, el("h2", { text: "Recommended providers" }),
      el("p", { class: "muted small", style: "margin-top:8px", text: "Groq (free, fast, start here) · OpenRouter (free models) · Cerebras (free, short context) · Mistral (free plan) · Google AI Studio (free, strict filter, not for adult roleplay) · Venice (paid, uncensored) · DeepSeek (paid, low price, policy to test). Details in technical.md." })));
  }

  /* ---------- login and start ---------- */
  function showLogin() {
    $("boot").classList.add("hidden");
    $("app").classList.add("hidden");
    $("bottombar").classList.add("hidden");
    $("view-login").classList.remove("hidden");
  }

  function showApp() {
    $("boot").classList.add("hidden");
    $("view-login").classList.add("hidden");
    $("app").classList.remove("hidden");
    $("bottombar").classList.remove("hidden");
    $("me-ini").textContent = initials(me.display_name || me.username);
    $("me-name").textContent = me.display_name || me.username;
    $("me-role").textContent = me.role === "admin" ? "Admin" : "User";
    buildNav();
    go(location.hash.slice(1) || "home");
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
  applyPrefs();
  fetch("/static/sprite.svg").then(function (r) { return r.text(); }).then(function (svg) {
    var holder = document.createElement("div");
    holder.innerHTML = svg;
    document.body.insertBefore(holder.firstChild, document.body.firstChild);
  }).catch(function () { /* icons missing: layout still works */ });

  api("/api/auth/me").then(function (u) { me = u; showApp(); }).catch(function () { showLogin(); });
})();
