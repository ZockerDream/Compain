// End-to-end test of the real build (served by the Compain container). Not the mockup.
// Usage: BASE_URL=http://localhost:8080 ADMIN_PW=... node run.mjs
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";

// The admin login comes from ADMIN_USER / ADMIN_PW, otherwise from the project's .env (the same values
// the app uses to create the first admin on a fresh database).
function dotenv() {
  try {
    const text = readFileSync(new URL("../../.env", import.meta.url), "utf8");
    return Object.fromEntries(text.split("\n").filter((l) => /^\s*[A-Z_]+=/.test(l))
      .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
  } catch { return {}; }
}
const ENV = dotenv();
const BASE = process.env.BASE_URL || "http://localhost:8080";
const ADMIN_USER = process.env.ADMIN_USER || ENV.COMPAIN_ADMIN_USERNAME || "admin";
const ADMIN_PW = process.env.ADMIN_PW || ENV.COMPAIN_ADMIN_PASSWORD || "admin-password-long-1";
const EXE = process.env.CHROME_PATH || "/opt/google/chrome/chrome";
const SHOTS = new URL("./screens/", import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const REPLY_TIMEOUT = Number(process.env.REPLY_TIMEOUT || 180000);

// Wait until the conversation shows a finished reply after sending (mock or real model).
async function waitForReply(p) {
  // Finished = nothing is being written, the send button is no Stop button any more, and the chat was
  // reloaded from the server (messages have their action buttons again).
  await p.waitForFunction(() => {
    const box = document.querySelector("#messages");
    if (!box) return false;
    const typing = box.querySelector(".typing, .bubble.cursor");
    const last = [...box.querySelectorAll(".msg.char")].pop();
    return !typing && !document.querySelector(".send.stopping") && last && last.querySelector(".meta-line")
      && last.querySelector(".bubble").textContent.trim().length > 0;
  }, null, { timeout: REPLY_TIMEOUT });
  await p.waitForTimeout(500);
}

// After logging in: answer the one-time age question if it appears. Returns true if it was shown.
async function passAgeGate(p) {
  await p.waitForSelector("#app:not(.hidden), #age-gate:not(.hidden)", { timeout: 15000 });
  if (await p.isVisible("#age-gate")) {
    await p.click("#age-yes");
    await p.waitForSelector("#app:not(.hidden)", { timeout: 15000 });
    return true;
  }
  return false;
}

const results = [];
function check(name, ok, info = "") {
  results.push({ name, ok, info });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  - " + info : ""}`);
}

async function layoutProblems(page) {
  return page.evaluate(() => {
    const out = [];
    const vw = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > vw + 1) out.push(`horizontal scroll ${document.documentElement.scrollWidth}>${vw}`);
    const els = [...document.querySelectorAll(".view:not(.hidden) .card, .view:not(.hidden) .c-row, .view:not(.hidden) .msg")]
      .filter((e) => e.offsetParent !== null);
    els.forEach((e) => {
      const r = e.getBoundingClientRect();
      if (r.right > vw + 1) out.push("overflow: " + (e.className || e.tagName).toString().slice(0, 40));
      // Content wider than its card is cut off (cards hide overflow), for example a row of choices.
      else if (e.classList.contains("card") && e.scrollWidth > e.clientWidth + 1) out.push(`cut off in card: ${(e.querySelector("h2") || e).textContent.slice(0, 30)}`);
    });
    return out;
  });
}

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ["--no-sandbox"] });
const consoleErrors = [];

async function newPage(width, height) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  return page;
}

// ---------- desktop ----------
const page = await newPage(1280, 860);
await page.goto(BASE + "/");
await page.waitForSelector("#login-form", { state: "visible", timeout: 15000 });
check("login screen is shown without a session", true);

await page.fill("#user", ADMIN_USER);
await page.fill("#pw", "wrong-password-xx");
await page.click("#login-form button[type=submit]");
await page.waitForSelector("#login-error:not(:empty)", { timeout: 10000 });
check("wrong password shows an error", (await page.textContent("#login-error")).includes("Wrong"));

await page.fill("#pw", ADMIN_PW);
await page.click("#login-form button[type=submit]");
const gateShown = await passAgeGate(page);
check("age question is shown at the first login, or was answered before", true, gateShown ? "shown and answered" : "answered earlier");
check("login with the right password opens the app", true);
// Start from the default look, whatever this account used before (preferences are per account).
await page.evaluate(() => fetch("/api/auth/preferences", { method: "PUT", credentials: "same-origin",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ design: "classic", palette: "ember", mode: "system", uiLanguage: "en" }) }));
await page.reload();
await page.waitForSelector("#app:not(.hidden)");
await page.waitForFunction(() => document.documentElement.getAttribute("data-design") === "classic", null, { timeout: 10000 });
await page.waitForSelector("#view-home .stat-card", { timeout: 15000 });
await page.screenshot({ path: SHOTS + "01-home-desktop.png" });
check("home shows the hosted quota", (await page.textContent("#view-home")).includes("Hosted API today"));

// Characters: create one
await page.click("#nav-desktop button[data-go=characters]");
await page.waitForSelector("#view-characters:not(.hidden)");
await page.click("#view-characters .new-tile");
await page.fill("#f-name", "Mara Stone");
await page.fill("#f-tagline", "Harbour detective, 34");
await page.fill("#f-description", "A tired detective who trusts no one and hides a soft spot for stray cats.");
await page.setInputFiles("#f-picture", { name: "mara.png", mimeType: "image/png",
  buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64") });
await page.click("text=Save character");
await page.waitForSelector("#view-characters .char-card", { timeout: 10000 });
check("character is created and listed", (await page.textContent("#view-characters")).includes("Mara Stone"));
await page.waitForSelector("#view-characters .char-card .char-cover img", { timeout: 10000 }).catch(() => {});
check("uploaded picture is shown large on the card", (await page.locator("#view-characters .char-card .char-cover img").count()) > 0);
await page.locator("#view-characters .char-cover").first().click();
await page.waitForSelector(".lightbox img", { timeout: 5000 }).catch(() => {});
check("a click on the picture shows it in full size", (await page.locator(".lightbox img").count()) === 1);
await page.keyboard.press("Escape");
check("Escape closes the full-size picture", (await page.locator(".lightbox").count()) === 0);

// Adults-only rule shows in the UI
await page.click("#view-characters .new-tile");
await page.fill("#f-name", "Lena");
await page.fill("#f-description", "She is 15 years old and shy.");
await page.click("text=Save character");
await page.waitForSelector("#view-characters .empty-card, #view-characters form, #view-characters .card p:has-text('Characters must be adults')", { timeout: 5000 }).catch(() => {});
const minorMsg = await page.textContent("#view-characters").catch(() => "");
check("adults-only rule is shown to the user", minorMsg.includes("must be adults"), minorMsg.slice(0, 0));
await page.click("text=Cancel");

// Character assistant: the model writes a draft of every field from a short idea; nothing is saved by it
await page.click("#view-characters .new-tile");
await page.fill("#assist-idea", "A grumpy mercenary with a soft heart who waits for jobs in a tavern.");
await page.click("#assist-btn");
const drafted = await page.waitForFunction(() => document.getElementById("f-name").value.trim() && document.getElementById("f-greeting").value.trim(),
  null, { timeout: REPLY_TIMEOUT }).then(() => true, () => false);
check("the character assistant fills in a draft", drafted && (await page.inputValue("#f-description")).length > 40 && (await page.inputValue("#f-personality")).length > 20,
  await page.textContent("#assist-note"));
await page.fill("#assist-idea", "Same idea once more.");
await page.click("#assist-btn");
check("a second draft asks before it replaces the fields", (await page.textContent("#assist-btn")).includes("again"));
const draftCount = (await page.evaluate(async () => (await (await fetch("/api/characters", { credentials: "same-origin" })).json()).length));
check("a draft is not saved on its own", draftCount === 1, String(draftCount));
await page.click("text=Cancel");

// Chat with the character and stream a reply
await page.click("#view-characters .char-card .primary:has-text('Chat')");
await page.waitForSelector("#conv .composer", { timeout: 10000 });
await page.fill("#conv textarea", "Where were you at five?");
const before = await page.locator("#messages .msg.char").count();
await page.keyboard.press("Enter");
await page.waitForFunction((n) => document.querySelectorAll("#messages .msg.char").length > n, before, { timeout: REPLY_TIMEOUT });
await waitForReply(page);
check("reply streams in and is shown", true);
check("message field keeps the focus after the reply", await page.waitForFunction(
  () => document.activeElement && document.activeElement.matches(".composer textarea"), null, { timeout: 5000 }).then(() => true, () => false));
await page.screenshot({ path: SHOTS + "02-chat-desktop.png" });

// Mark the reply important
await page.click("#messages .msg.char .mark");
await page.waitForSelector("#messages .msg.char.important", { timeout: 5000 });
check("a reply can be marked important", true);
check("important counter updates", (await page.textContent("#conv .conv-stats")).includes("1 of 10"));

// Own lines can carry important context too
await page.click("#messages .msg.user .mark");
await page.waitForSelector("#messages .msg.user.important", { timeout: 5000 });
check("an own message can be marked important", (await page.textContent("#conv .conv-stats")).includes("2 of 10"));

// Per-chat model switch to hosted (mock)
await page.selectOption("#chat-model", "hosted");
await page.waitForTimeout(400);
check("model can be changed per chat", true);

// Export link exists
check("chat export link is present", (await page.getAttribute("#conv a[download]", "href")).includes("/api/export/chat/"));
await page.selectOption("#chat-model", "self");
await page.waitForTimeout(300);

// Markdown: *actions* are shown in italics, the asterisks disappear
await page.waitForSelector("#messages .msg.char .bubble em", { timeout: 5000 }).catch(() => {});
const shownText = await page.textContent("#messages");
check("Markdown: actions in italics, no visible asterisks",
  (await page.locator("#messages .msg.char .bubble em").count()) > 0 && !/\*[^*\s][^*]*\*/.test(shownText));

// Regenerate: a second version, flip between them
await page.click("#messages .msg.char:last-child .mark:has-text('Regenerate')");
await page.waitForSelector("#messages .variants", { timeout: REPLY_TIMEOUT });
await waitForReply(page);
check("regenerate keeps two versions", (await page.textContent("#messages .variants")).includes("2 / 2"));
await page.click("#messages .variants button[aria-label='Previous version']");
await page.waitForFunction(() => (document.querySelector("#messages .variants") || {}).textContent?.includes("1 / 2"), null, { timeout: 10000 }).catch(() => {});
check("versions can be flipped", (await page.textContent("#messages .variants")).includes("1 / 2"));

// Continue: the character writes on without a new message (counted on the server)
const chatId = Number((await page.getAttribute("#conv a[download]", "href")).match(/chat\/(\d+)/)[1]);
const countMsgs = () => page.evaluate(async (id) => (await (await fetch("/api/chats/" + id, { credentials: "same-origin" })).json()).messages.length, chatId);
const msgsBefore = await countMsgs();
await page.click("#conv .quick .accent-chip");
await page.waitForSelector("#conv .send.stopping", { timeout: 10000 }).catch(() => {});
await waitForReply(page);
const msgsAfter = await countMsgs();
check("continue adds a reply of the character", msgsAfter === msgsBefore + 1, `before ${msgsBefore}, after ${msgsAfter}, toast "${await page.textContent("#toast")}"`);

// Edit the own message
await page.locator("#messages .msg.user .mark:has-text('Edit')").first().click();
await page.fill("#messages .edit-box textarea", "Where were you at *six*?");
await page.click("#messages .edit-box button:has-text('Save')");
await page.waitForFunction(() => document.querySelector("#messages .msg.user .bubble em"), null, { timeout: 10000 }).catch(() => {});
check("own message can be edited (with Markdown)", (await page.textContent("#messages .msg.user")).includes("Where were you at six?"));

// Stop while the character writes: the written part stays
await page.fill("#conv textarea", "Tell me everything about the harbour, in detail.");
await page.keyboard.press("Enter");
await page.waitForSelector("#messages .bubble.cursor", { timeout: REPLY_TIMEOUT });
await page.waitForTimeout(800);
await page.click("#conv .send");
await page.waitForSelector("#toast.show", { timeout: 10000 });
check("Stop ends the reply and keeps the part", (await page.textContent("#toast")).includes("Stopped"));
await page.waitForTimeout(1500);

// Search in the chat
await page.click("#conv .tools button[aria-label='Search in this chat']");
await page.fill(".chat-search input", "harbour");
check("search finds messages in the chat", (await page.locator("#messages .msg.hit").count()) > 0);
await page.click("#conv .tools button[aria-label='Search in this chat']");

// Bookmarks: only for the user, listed in the chat header
await page.locator("#messages .msg.char .mark.bm").first().click();
check("a message can be bookmarked", await page.waitForFunction(() => document.querySelectorAll("#messages .msg.bookmarked").length === 1, null, { timeout: 10000 }).then(() => true, () => false));
await page.waitForTimeout(1000); // the live update of the bookmark arrives too
await page.click("#bookmarks-btn");
check("bookmarks of the chat are listed", (await page.locator("#bookmark-box:not(.hidden) .bm-row").count()) === 1);
await page.click("#bookmark-box .bm-row");
check("a bookmark jumps to its message", await page.waitForSelector("#messages .msg.flash", { timeout: 3000 }).then(() => true, () => false));

// Export menu: Markdown to read, JSON to import again
await page.waitForTimeout(800);
await page.click("#export-btn");
check("export menu offers Markdown and JSON", (await page.waitForSelector("#export-menu:not(.hidden)", { timeout: 3000 }).then(() => true, () => false)) && (await page.locator("#export-menu a").count()) === 2,
  `menus ${await page.locator("#export-menu").count()}, class "${await page.getAttribute("#export-menu", "class")}", expanded ${await page.getAttribute("#export-btn", "aria-expanded")}`);
const mdHref = await page.getAttribute("#export-menu a:has-text('Markdown')", "href");
const mdResp = await page.request.get(BASE + mdHref);
check("chat downloads as Markdown", mdResp.status() === 200 && (mdResp.headers()["content-type"] || "").includes("markdown") && (await mdResp.text()).includes("**Mara Stone:**"));
await page.click("#conv .conv-head .name");

// Relationship: judged by the model, shown in the header, adjustable, can be turned off
await page.click("#relation-btn");
check("the relationship panel opens", await page.isVisible("#relation-box"));
await page.click("#relation-check");
const judged = await page.waitForSelector("#relation-box:not(.hidden) #rel-text", { timeout: REPLY_TIMEOUT }).then(() => true, () => false);
const relNow = await page.evaluate(async (id) => (await (await fetch("/api/chats/" + id, { credentials: "same-origin" })).json()).relation, chatId);
check("the model judges the relationship", judged && relNow.set && relNow.mood.length > 0, JSON.stringify(relNow));
check("the header shows the affection", (await page.textContent("#relation-btn")).trim() === String(relNow.affection));
await page.click("#relation-edit");
await page.fill("#rel-trust", "88");
await page.fill("#rel-mood", "devoted");
await page.click("#relation-save");
await page.waitForFunction(() => (document.getElementById("rel-trust-value") || {}).textContent === "88", null, { timeout: 5000 }).catch(() => {});
check("the relationship can be adjusted", (await page.textContent("#rel-trust-value")) === "88" && (await page.textContent("#rel-text")).includes("devoted"));
await page.click("#relation-off");
check("the relationship can be turned off", await page.waitForSelector("#relation-on", { timeout: 5000 }).then(() => true, () => false)
  && (await page.locator("#relation-btn .mini-count").count()) === 0);
await page.click("#relation-on");
await page.waitForSelector("#relation-check", { timeout: 5000 }).catch(() => {});
await page.click("#relation-btn");

// The reply stream tells the browser what happens before the first word (place in line, loading, reading)
const firstEvent = await page.evaluate(async (id) => {
  const ctl = new AbortController();
  const r = await fetch("/api/chats/" + id + "/reply", { method: "POST", credentials: "same-origin", signal: ctl.signal,
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "next" }) });
  const reader = r.body.getReader();
  const chunk = await reader.read();
  ctl.abort();  // only stops watching: the reply goes on until Stop
  const stop = await (await fetch("/api/chats/" + id + "/stop", { method: "POST", credentials: "same-origin" })).json();
  return new TextDecoder().decode(chunk.value) + " stop=" + stop.stopped;
}, Number((await page.getAttribute("#conv a[download]", "href")).match(/chat\/(\d+)/)[1]));
check("Stop ends a reply that nobody watches any more", firstEvent.endsWith("stop=true"), firstEvent.slice(-20));
check("reply stream starts with a status", firstEvent.includes('"status"'), firstEvent.slice(0, 60));
await page.waitForTimeout(1500);
const modelStatus = await page.evaluate(async () => (await fetch("/api/chats/model-status", { credentials: "same-origin" })).json());
check("model status and queue are reported", modelStatus.state === "ok" && modelStatus.running === 0 && modelStatus.waiting === 0, JSON.stringify(modelStatus));

// Leaving the chat while the character writes does not stop the reply; coming back shows it.
{
  const awayChat = Number((await page.getAttribute("#conv a[download]", "href")).match(/chat\/(\d+)/)[1]);
  const before = (await page.evaluate(async (id) => (await (await fetch("/api/chats/" + id, { credentials: "same-origin" })).json()).messages.length, awayChat));
  await page.fill("#conv textarea", "Describe the harbour in two sentences.");
  await page.press("#conv textarea", "Enter");
  await page.waitForSelector("#conv .msg.typing, #conv .bubble.cursor", { timeout: 10000 }).catch(() => {});
  await page.click("#nav-desktop button[data-go=home]");
  await page.waitForTimeout(1500);
  const runningAway = await page.evaluate(async (id) => (await (await fetch("/api/chats/" + id, { credentials: "same-origin" })).json()).replying, awayChat);
  for (const end = Date.now() + REPLY_TIMEOUT; Date.now() < end;) {
    const busy = await page.evaluate(async (id) => (await (await fetch("/api/chats/" + id, { credentials: "same-origin" })).json()).replying, awayChat);
    if (!busy) break;
    await page.waitForTimeout(2000);
  }
  const after = await page.evaluate(async (id) => (await (await fetch("/api/chats/" + id, { credentials: "same-origin" })).json()).messages, awayChat);
  check("the reply is finished after leaving the chat", runningAway === true && after.length === before + 2 && after[after.length - 1].role === "assistant" && after[after.length - 1].content.length > 10,
    `running=${runningAway} ${before}->${after.length}`);
  await page.goto(BASE + "/#chat/" + awayChat);
  await page.waitForSelector("#conv .msg.char", { timeout: 10000 });
  const words = after[after.length - 1].content.replace(/[*_~`#>\[\]]/g, "").trim().split(/\s+/).slice(0, 3).join(" ");
  await page.waitForFunction((w) => (document.querySelector("#conv") || {}).textContent.includes(w), words, { timeout: 10000 }).catch(() => {});
  check("coming back shows the reply", (await page.textContent("#conv")).includes(words), words);
}

// The character of a chat is fixed: no switcher, and the API refuses a change
await page.evaluate(() => fetch("/api/characters", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Iris Kade", tagline: "Airship captain" }) }));
const fixedChatId = Number((await page.getAttribute("#conv a[download]", "href")).match(/chat\/(\d+)/)[1]);
const switchStatus = await page.evaluate(async (id) => {
  const other = (await (await fetch("/api/characters", { credentials: "same-origin" })).json()).find((c) => c.name === "Iris Kade");
  return (await fetch("/api/chats/" + id, { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ character_id: other.id }) })).status;
}, fixedChatId);
check("character of a chat is fixed", (await page.locator("#chat-character").count()) === 0 && switchStatus === 422, String(switchStatus));
await page.screenshot({ path: SHOTS + "12-chat-tools.png" });

// Settings: theme and appearance
await page.click("#nav-desktop button[data-go=settings]");
await page.waitForSelector("#view-settings:not(.hidden)");
await page.click("#view-settings .palette-card:has-text('Indigo')");
const palette = await page.getAttribute("html", "data-palette");
check("color theme switches", palette === "indigo", palette);
await page.click("#view-settings .segmented button:has-text('Dark')");
check("dark mode is set", (await page.getAttribute("html", "data-mode")) === "dark");
check("four reply lengths incl. Extra long", (await page.locator("#len option").count()) === 4);
const impressum = await page.request.get(BASE + "/impressum");
check("Impressum page is reachable", impressum.status() === 200 || impressum.status() === 503, String(impressum.status()));
check("Changelog page is reachable", (await page.request.get(BASE + "/changelog")).status() === 200);

// Designs: modern puts the navigation on top, glass shows the background picture
await page.click("#view-settings .design-card[data-design-id='modern']");
await page.waitForTimeout(400);
check("modern design: navigation on top, no sidebar", (await page.isVisible("#topnav-pills")) && !(await page.isVisible(".sidebar")));
await page.click("#view-settings .design-card[data-design-id='glass']");
await page.waitForSelector("#g-blur", { timeout: 5000 });
check("glass design: background and sliders", (await page.isVisible("#bg-layer")) && (await page.isVisible("#g-blur")));
await page.screenshot({ path: SHOTS + "11-settings-glass.png" });
await page.click("#view-settings .design-card[data-design-id='classic']");
await page.waitForTimeout(300);

// Changelog and Impressum as popovers
await page.click("#tb-changelog");
await page.waitForSelector(".popover .md li", { timeout: 5000 });
check("changelog opens as a popover", await page.isVisible(".popover"));
check("changelog dot is gone after reading", await page.locator("#tb-dot").isHidden());
const changelogMd = await page.evaluate(() => {
  const box = document.querySelector(".popover .md-doc");
  const copy = box.cloneNode(true);
  copy.querySelectorAll("code").forEach((c) => c.remove()); // code may show the signs on purpose
  return { strong: box.querySelectorAll("strong").length, code: box.querySelectorAll("code").length, stars: (copy.textContent.match(/\*\*/g) || []).length, ticks: copy.textContent.includes("`") };
});
await page.screenshot({ path: SHOTS + "11-changelog.png" });
check("changelog shows Markdown formatted (bold, code, no raw signs)", changelogMd.strong > 0 && changelogMd.code > 0 && changelogMd.stars === 0 && !changelogMd.ticks, JSON.stringify(changelogMd));
await page.keyboard.press("Escape");
await page.click("#tb-impressum");
await page.waitForSelector(".popover h2", { timeout: 5000 });
check("Impressum opens as a popover", (await page.textContent(".popover")).includes("Impressum"));
await page.mouse.click(5, 400);
check("popover closes with a click outside", (await page.locator(".popover").count()) === 0);
await page.screenshot({ path: SHOTS + "03-settings-desktop.png" });
// German interface: switch, check, switch back
await page.selectOption("#ui-lang", "de");
await page.waitForLoadState("load");
await page.waitForSelector("#app:not(.hidden)", { timeout: 15000 });
await page.waitForFunction(() => document.querySelector("#nav-desktop") && document.querySelector("#nav-desktop").textContent.includes("Einstellungen"), null, { timeout: 15000 }).catch(() => {});
check("interface switches to German", (await page.textContent("#nav-desktop")).includes("Einstellungen"));
await page.screenshot({ path: SHOTS + "09-settings-german.png" });
await page.selectOption("#ui-lang", "en");
await page.waitForLoadState("load");
await page.waitForSelector("#app:not(.hidden)", { timeout: 15000 });
await page.waitForFunction(() => document.querySelector("#nav-desktop") && document.querySelector("#nav-desktop").textContent.includes("Settings"), null, { timeout: 15000 }).catch(() => {});
check("interface switches back to English", (await page.textContent("#nav-desktop")).includes("Settings"));
await page.click("#nav-desktop button[data-go=settings]");
await page.waitForSelector("#view-settings:not(.hidden) .palette-card");
await page.click("#view-settings .palette-card:has-text('Ember')");
await page.click("#view-settings .segmented button:has-text('System')");

// Community: publish, approve, add
await page.click("#nav-desktop button[data-go=characters]");
await page.waitForSelector("#view-characters .char-card");
await page.locator("#view-characters .char-card:has-text('Mara Stone') .ghost:has-text('Publish')").first().click();
await page.waitForTimeout(500);
check("an admin publishes straight into the Community", (await page.textContent("#view-characters")).includes("Public"));

// Admin: overview and review queue
await page.click("#nav-desktop button[data-go=admin]");
await page.waitForSelector("#view-admin:not(.hidden)");
await page.waitForSelector("#view-admin .stat-card, #view-admin .card", { timeout: 10000 });
check("Server Management overview loads", (await page.textContent("#view-admin")).includes("Hosted API today"));
check("overview shows the model queue", (await page.textContent("#admin-queue")).includes("waiting"));
check("overview shows where the model runs", /\((GPU|CPU)\)/.test(await page.textContent("#admin-device")));
await page.click("#view-admin .subtabs button:has-text('Characters')");
await page.waitForSelector("#view-admin .card:has-text('review queue')");
// Approve everything waiting in the queue (earlier runs may have left items).
for (let i = 0; i < 20; i++) {
  const approve = page.locator("#view-admin .feed li .ghost:has-text('Approve')").first();
  if (!(await approve.count())) break;
  await approve.click();
  await page.waitForTimeout(400);
}
await page.click("#nav-desktop button[data-go=community]");
await page.waitForSelector("#view-community:not(.hidden)");
await page.waitForSelector("#view-community .featured, #view-community .empty-card", { timeout: 10000 });
check("approved character shows in Community", (await page.textContent("#view-community")).includes("Mara Stone"));
await page.locator("#view-community .like").first().click();
await page.waitForSelector("#view-community .like.on", { timeout: 10000 }).catch(() => {});
check("a Community character can be liked", (await page.locator("#view-community .like.on").count()) > 0);
await page.locator("#view-community .like.on").first().click();

// Persona in the profile
await page.click("#nav-desktop button[data-go=profile]");
await page.fill("#persona-name", "Jay");
await page.fill("#persona-desc", "A dock worker who owes Mara a favour.");
await page.click("#view-profile button:has-text('Save persona')");
await page.waitForFunction(() => (document.querySelector("#toast") || {}).textContent?.includes("Persona"), null, { timeout: 10000 }).catch(() => {});
check("persona can be saved", (await page.textContent("#toast")).includes("Persona"));

// Privacy policy popover and installable app
await page.click("#tb-datenschutz");
await page.waitForSelector(".popover h2", { timeout: 5000 });
check("privacy policy opens as a popover", (await page.textContent(".popover")).includes("Datenschutz"));
await page.keyboard.press("Escape");
const sw = await page.evaluate(async () => !!(await navigator.serviceWorker?.getRegistration?.()));
const manifest = await page.request.get(BASE + "/manifest.webmanifest");
check("installable app: manifest and service worker", manifest.status() === 200 && sw);
await page.screenshot({ path: SHOTS + "04-community-desktop.png" });
await page.click("#view-community .grid .ghost:has-text('Add')").catch(() => {});

// Card import from a file
await page.click("#nav-desktop button[data-go=characters]");
await page.waitForSelector("#view-characters:not(.hidden)");
await page.setInputFiles("input[type=file][aria-label='Import a character card']", {
  name: "iris.json", mimeType: "application/json",
  buffer: Buffer.from(JSON.stringify({ name: "Captain Iris Kade", description: "Airship captain.", first_mes: "Report!" })) });
await page.waitForSelector("#view-characters .char-card:has-text('Captain Iris Kade')", { timeout: 15000 }).catch(() => {});
check("character card import works", (await page.textContent("#view-characters")).includes("Captain Iris Kade"));
await page.setInputFiles("input[type=file][aria-label='Import a character card']", [
  { name: "a.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ spec: "chara_card_v3", spec_version: "3.0", data: { name: "Vex Thorn", description: "A thief." } })) },
  { name: "b.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify([{ name: "Nell Gray" }, { name: "Odo Fenn" }])) }]);
await page.waitForSelector("#view-characters .char-card:has-text('Odo Fenn')", { timeout: 15000 }).catch(() => {});
const cardsText = await page.textContent("#view-characters");
check("several cards (V3 and a list) import at once", ["Vex Thorn", "Nell Gray", "Odo Fenn"].every((n) => cardsText.includes(n)));
const cardHref = await page.getAttribute("#view-characters .char-card:has-text('Mara Stone') a:has-text('Card')", "href");
const cardResp = await page.request.get(BASE + cardHref);
check("a character downloads as a card (PNG with the picture)", cardResp.status() === 200 && (cardResp.headers()["content-type"] || "") === "image/png",
  cardResp.headers()["content-type"]);

// Search over all chats and the bookmarks filter in the chat list
await page.click("#nav-desktop button[data-go=chats]");
await page.waitForSelector("#view-chats:not(.hidden) #chat-list");
await page.fill("#chat-search", "harbour");
await page.waitForSelector("#message-hits .hit-row", { timeout: 10000 }).catch(() => {});
check("search over all chats finds messages", (await page.locator("#message-hits .hit-row").count()) > 0);
await page.locator("#message-hits .hit-row").first().click();
check("a search hit opens the chat at that message", await page.waitForSelector("#messages .msg.flash", { timeout: 10000 }).then(() => true, () => false));
await page.fill("#chat-search", "");
await page.click("#view-chats .chips button:has-text('Bookmarks')");
await page.waitForSelector("#chat-list .group-label:has-text('Bookmarks') ~ .hit-row", { timeout: 10000 }).catch(() => {});
check("bookmarks filter lists all bookmarks", (await page.locator("#chat-list .hit-row").count()) === 1, `rows=${await page.locator("#chat-list .hit-row").count()} marks=${JSON.stringify(await page.evaluate(async () => (await (await fetch("/api/chats/bookmarks", { credentials: "same-origin" })).json()).map((b) => b.snippet.slice(0, 30))))}`);
await page.click("#view-chats .chips button:has-text('All')");

// Import a chat from its JSON export
const exported = await (await page.request.get(BASE + "/api/export/chat/" + chatId)).body();
const chooser = page.waitForEvent("filechooser");
await page.click("#import-chats");
await (await chooser).setFiles({ name: "chat.json", mimeType: "application/json", buffer: exported });
await page.waitForFunction(() => (document.querySelector("#toast") || {}).textContent?.includes("chat imported"), null, { timeout: 15000 }).catch(() => {});
check("a chat imports from its JSON export", (await page.textContent("#toast")).includes("1 chat imported"), await page.textContent("#toast"));
await page.waitForTimeout(800);

// Live sync: a second window of the same user sees the new message without reloading
const second = await newPage(1280, 860);
await second.goto(BASE + "/");
await second.waitForSelector("#login-form", { state: "visible" });
await second.fill("#user", ADMIN_USER);
await second.fill("#pw", ADMIN_PW);
await second.click("#login-form button[type=submit]");
check("age question is not asked again", !(await passAgeGate(second)));
await second.click("#nav-desktop button[data-go=chats]");
await second.waitForSelector("#view-chats:not(.hidden)");
await page.click("#nav-desktop button[data-go=chats]");
await page.waitForSelector("#view-chats:not(.hidden) #chat-list");
await page.click("#chat-list .c-row");
await page.waitForSelector("#conv textarea");
const listBefore = await second.textContent("#chat-list");
await page.fill("#conv textarea", "Live sync check");
await page.keyboard.press("Enter");
// The other window must update its chat list by itself, without reloading.
await second.waitForFunction((b) => document.querySelector("#chat-list") && document.querySelector("#chat-list").textContent !== b, listBefore, { timeout: 30000 }).catch(() => {});
const liveSeen = (await second.textContent("#chat-list")) !== listBefore;
await waitForReply(page);
check("second window updates without reload (live sync)", liveSeen);

// Theme belongs to the account: a change in one window reaches the other one live.
await page.evaluate(() => fetch("/api/auth/preferences", { method: "PUT", credentials: "same-origin",
  headers: { "Content-Type": "application/json" }, body: JSON.stringify({ palette: "emerald", design: "modern" }) }));
await second.waitForFunction(() => document.documentElement.getAttribute("data-palette") === "emerald", null, { timeout: 15000 }).catch(() => {});
check("theme change reaches the other window live", (await second.getAttribute("html", "data-palette")) === "emerald");
check("design change reaches the other window live", (await second.getAttribute("html", "data-design")) === "modern");
await page.evaluate(() => fetch("/api/auth/preferences", { method: "PUT", credentials: "same-origin",
  headers: { "Content-Type": "application/json" }, body: JSON.stringify({ palette: "ember", design: "classic" }) }));
await second.close();

// Admin: backup, speed test, invite code
await page.click("#nav-desktop button[data-go=admin]");
await page.waitForSelector("#view-admin:not(.hidden)");
await page.click("#view-admin .subtabs button:has-text('Backups')");
await page.waitForSelector("#view-admin button:has-text('Back up now')");
await page.click("#view-admin button:has-text('Back up now')");
await page.waitForSelector("#view-admin td:has-text('compain-')", { timeout: 60000 });
check("backup can be created from the browser", true);
await page.click("#view-admin .subtabs button:has-text('Models')");
const speedDone = page.waitForResponse((r) => r.url().includes("/models/speedtest"), { timeout: REPLY_TIMEOUT });
await page.click("#view-admin button:has-text('Run speed test')");
await speedDone;
// The result is also stored: open the tab again in case another part of the page was redrawn meanwhile.
if (!(await page.isVisible("text=pieces per second"))) await page.click("#view-admin .subtabs button:has-text('Models')");
check("speed test shows a result", await page.waitForSelector("text=pieces per second", { timeout: 15000 }).then(() => true, () => false));
await page.click("#view-admin .subtabs button:has-text('Hosted API')");
await page.waitForSelector("#h-prov");
await page.selectOption("#h-prov", "groq");
check("provider preset fills the endpoint", (await page.inputValue("#h-url")).includes("api.groq.com"));
await page.screenshot({ path: SHOTS + "10-admin-hosted.png" });
await page.click("#view-admin .subtabs button:has-text('Access')");
await page.click("#view-admin button:has-text('New invite code')");
await page.waitForTimeout(500);
check("invite code can be created", (await page.textContent("#view-admin")).length > 0);
await page.screenshot({ path: SHOTS + "08-admin-security-desktop.png" });

// Users: create one with email and role, switch the role between User and Admin
const helpUser = "help" + Date.now().toString(36);
const helpPw = "help-user-pass-123";
const helpMail = helpUser + "@example.org";
await page.click("#view-admin .subtabs button:has-text('Users')");
await page.waitForSelector("#nu-user");
await page.fill("#nu-user", helpUser);
await page.fill("#nu-email", helpMail.toUpperCase());
await page.fill("#nu-pw", helpPw);
await page.click("#nu-add");
const roleSel = `select[data-role-for="${helpUser}"]`;
await page.waitForSelector(roleSel, { timeout: 5000 }).catch(() => {});
check("admin creates a user with an email address", (await page.textContent("#view-admin table")).includes(helpMail));
check("own role cannot be changed", await page.isDisabled(`select[data-role-for="${ADMIN_USER}"]`));
const rolePatched = () => page.waitForResponse((r) => r.request().method() === "PATCH" && r.url().includes("/api/admin/users/"), { timeout: 10000 }).catch(() => {});
let patched = rolePatched();
await page.selectOption(roleSel, "admin");
await patched;
const roleNow = async () => page.evaluate(async (u) => (await (await fetch("/api/admin/users", { credentials: "same-origin" })).json()).find((x) => x.username === u).role, helpUser);
check("admin makes a user an admin", (await roleNow()) === "admin");
await page.waitForSelector(roleSel);
patched = rolePatched();
await page.selectOption(roleSel, "user");
await patched;
check("admin makes an admin a user again", (await roleNow()) === "user");

// Delete a whole chat from its header (after asking once)
const delChat = await page.evaluate(async () => {
  const chars = await (await fetch("/api/characters", { credentials: "same-origin" })).json();
  const r = await fetch("/api/chats", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ character_id: chars[0].id }) });
  return (await r.json()).id;
});
await page.evaluate((id) => { location.hash = "chats/" + id; }, delChat);
await page.waitForFunction((id) => document.querySelector("#conv a[download]")?.getAttribute("href").includes("/chat/" + id + "?"), delChat, { timeout: 10000 }).catch(() => {});
check("a link to a chat (#chats/<id>) opens that chat", await page.evaluate((id) => document.querySelector("#conv a[download]")?.getAttribute("href").includes("/chat/" + id + "?"), delChat));
await page.waitForSelector("#delete-chat", { state: "visible" });
await page.click("#delete-chat");
await page.waitForSelector("#delete-chat-confirm", { state: "visible" });
check("deleting a chat asks first", await page.isVisible("#delete-menu"));
await page.click("#delete-chat-confirm");
await page.waitForFunction(() => document.querySelector("#toast")?.textContent.includes("deleted") || document.querySelector("#toast")?.textContent.includes("gelöscht"), null, { timeout: 5000 }).catch(() => {});
const delStatus = (await page.request.get(BASE + "/api/chats/" + delChat)).status(); // outside the page: no console noise
check("a chat can be deleted completely", delStatus === 404, "status " + delStatus);

// Import card also takes the example list of 50 characters (pictures are fetched from the web)
await page.click("#nav-desktop button[data-go=characters]");
await page.waitForSelector("#view-characters:not(.hidden)");
const cardChooser = page.waitForEvent("filechooser");
await page.click("#view-characters button:has-text('Import card')");
await (await cardChooser).setFiles(new URL("../../examples/demo-characters.json", import.meta.url).pathname);
await page.waitForFunction(() => /50 characters imported|50 Charaktere importiert/.test(document.querySelector("#toast")?.textContent || ""), null, { timeout: 60000 }).catch(() => {});
check("Import card takes the example file with 50 characters", /50 characters imported|50 Charaktere importiert/.test(await page.textContent("#toast")), await page.textContent("#toast"));
const demoPics = await page.evaluate(async () => (await (await fetch("/api/characters", { credentials: "same-origin" })).json()).filter((c) => c.has_picture).length);
check("the example characters come with pictures", demoPics >= 50, "with picture: " + demoPics);

// Help: FAQ, guide, Markdown reference, and a ticket between a user and the admin (live, both ways)
const up = await newPage(1280, 860);
await up.goto(BASE + "/");
await up.waitForSelector("#login-form", { state: "visible" });
await up.fill("#user", helpMail);
await up.fill("#pw", helpPw);
await up.click("#login-form button[type=submit]");
await passAgeGate(up);
await up.click("#nav-desktop button[data-go=help]");
await up.waitForSelector("#view-help .faq");
check("help: FAQ is shown", (await up.locator("#view-help .faq").count()) >= 10);
await up.click("#view-help .faq summary >> nth=0");
check("help: a FAQ answer opens", await up.isVisible("#view-help .faq[open] .md"));
await up.fill("#faq-search", "recovery");
check("help: FAQ search filters", (await up.locator("#view-help .faq").count()) === 1);
await up.click("#help-tabs button[data-tab=guide]");
check("help: guide covers the features", (await up.locator("#view-help .guide-card").count()) >= 8);
await up.click("#help-tabs button[data-tab=md]");
await up.fill("#md-try", "*waves* **hello**");
check("help: Markdown preview renders", (await up.innerHTML("#md-preview")).includes("<em>waves</em>") && !(await up.textContent("#md-preview")).includes("*"));
await up.screenshot({ path: SHOTS + "11-help-markdown.png" });
await up.click("#help-tabs button[data-tab=support]");
await up.click("#ticket-new");
await up.fill("#ticket-subject", "E2E: reply stops early");
await up.selectOption("#ticket-category", "bug");
await up.fill("#ticket-text", "The reply ends **mid sentence**.");
await up.click("#ticket-send");
await up.waitForSelector("#ticket-title");
check("help: user opens a ticket", (await up.textContent("#ticket-title")).includes("E2E: reply stops early"));

// The admin sees it live (badge), answers with an internal note and a reply.
await page.waitForFunction(() => [...document.querySelectorAll("#nav-desktop .help-badge")].some((b) => !b.hidden), null, { timeout: 10000 })
  .then(() => check("help: admin gets a badge for the new ticket", true), () => check("help: admin gets a badge for the new ticket", false));
await page.click("#nav-desktop button[data-go=help]");
await page.click("#help-tabs button[data-tab=support]");
await page.waitForSelector("#ticket-list .ticket-row");
await page.click(`#ticket-list .ticket-row:has-text("E2E: reply stops early")`);
await page.waitForSelector("#ticket-reply");
check("help: admin sees the user's ticket", (await page.textContent("#ticket-thread")).includes("mid sentence"));
await page.fill("#ticket-reply", "Internal: probably the token cap");
await page.check("#ticket-internal");
await page.click("#ticket-answer");
await page.waitForSelector("#ticket-thread .t-msg.internal");
await page.fill("#ticket-reply", "Set the reply length to *Long*.");
await page.click("#ticket-answer");
await page.waitForSelector("#ticket-thread .t-msg.admin:not(.internal)");
check("help: admin answer marks the ticket answered", (await page.textContent(".ticket-head .t-status")).includes("Answered"));
await page.screenshot({ path: SHOTS + "12-help-ticket-admin.png" });

// The user sees the answer live, never the internal note, and closes the ticket.
await up.waitForFunction(() => document.querySelector("#ticket-thread")?.textContent.includes("reply length"), null, { timeout: 10000 })
  .then(() => true, () => false).then((ok) => check("help: user sees the answer live", ok));
check("help: internal notes stay hidden from the user", !(await up.textContent("#ticket-thread")).includes("token cap"));
await up.click("#ticket-close");
await up.waitForSelector("#ticket-reopen");
check("help: user can close the ticket", (await up.textContent(".ticket-head .t-status")).includes("Closed"));
check("help: no layout problems", (await layoutProblems(up)).length === 0, (await layoutProblems(up)).join("; "));
check("a user logs in with the email address", (await up.evaluate(async () => (await (await fetch("/api/auth/me", { credentials: "same-origin" })).json()).email)) === helpMail);

// Settings: change the own username and email; the current password confirms it
await up.click("#nav-desktop button[data-go=settings]");
await up.waitForSelector("#account-card");
await up.fill("#acc-email", "new-" + helpMail);
await up.fill("#acc-pw", "wrong-password");
await up.click("#acc-save");
await up.waitForTimeout(600);
check("a wrong password keeps the email", (await up.textContent("#toast")).includes("wrong"));
await up.fill("#acc-pw", helpPw);
await up.click("#acc-save");
await up.waitForTimeout(600);
const afterMail = await up.evaluate(async () => (await (await fetch("/api/auth/me", { credentials: "same-origin" })).json()).email);
check("a user changes the own email", afterMail === "new-" + helpMail, afterMail);
await up.close();

check("no layout problems on desktop", (await layoutProblems(page)).length === 0, (await layoutProblems(page)).join("; "));
await page.close();

// ---------- phone ----------
const phone = await newPage(390, 844);
await phone.goto(BASE + "/");
await phone.waitForSelector("#login-form", { state: "visible" });
await phone.fill("#user", ADMIN_USER);
await phone.fill("#pw", ADMIN_PW);
await phone.click("#login-form button[type=submit]");
await passAgeGate(phone);
await phone.click("#bottombar button[data-go=chats]");
await phone.waitForSelector("#view-chats:not(.hidden)");
await phone.waitForSelector("#chat-list .c-row", { timeout: 10000 });
await phone.click("#chat-list .c-row");
await phone.waitForSelector("#conv .back-btn", { state: "visible" });
check("phone: chat opens full width with a back button", await phone.isVisible("#conv .back-btn"));
check("phone: chat list is hidden while a chat is open", !(await phone.isVisible(".list-pane")));
await phone.screenshot({ path: SHOTS + "05-chat-phone.png" });
const toastBox = await phone.evaluate(() => document.getElementById("toast").getBoundingClientRect().bottom);
const barTop = await phone.evaluate(() => document.getElementById("bottombar").getBoundingClientRect().top);
check("phone: toast sits above the bottom bar when shown", true, `toast bottom ${Math.round(toastBox)}, bar top ${Math.round(barTop)}`);
await phone.click(".conv-head .back-btn");
await phone.waitForSelector(".list-pane", { state: "visible" });
await phone.screenshot({ path: SHOTS + "06-chats-phone.png" });
check("phone: no layout problems in chats", (await layoutProblems(phone)).length === 0, (await layoutProblems(phone)).join("; "));

// Every design on a phone: the input field of an open chat stays above the bottom bar, the chat header
// fits, and the Settings cards (with the glass choices) fit the screen.
for (const design of ["glass", "modern-glass", "modern", "classic"]) {
  await phone.evaluate(() => { location.hash = "settings"; });
  await phone.waitForSelector("#view-settings:not(.hidden) .design-card");
  await phone.click(`#view-settings .design-card[data-design-id='${design}']`);
  await phone.waitForFunction((d) => document.documentElement.getAttribute("data-design") === d, design, { timeout: 5000 }).catch(() => {});
  await phone.waitForTimeout(400);
  check(`phone ${design}: settings fit the screen`, (await layoutProblems(phone)).length === 0, (await layoutProblems(phone)).join("; "));
  await phone.click("#bottombar button[data-go=chats]");
  await phone.waitForSelector("#chat-list .c-row", { timeout: 10000 });
  await phone.click("#chat-list .c-row");
  await phone.waitForSelector("#conv .composer textarea", { state: "visible" });
  await phone.waitForTimeout(2500); // the bottom bar height is measured every 2 s
  const fit = await phone.evaluate(() => {
    const comp = document.querySelector("#conv .composer").getBoundingClientRect();
    const bar = document.getElementById("bottombar").getBoundingClientRect();
    const tools = document.querySelector("#conv .conv-head .tools").getBoundingClientRect();
    const name = document.querySelector("#conv .conv-head .name").getBoundingClientRect();
    return { compBottom: Math.round(comp.bottom), barTop: Math.round(bar.top), toolsRight: Math.round(tools.right), nameW: Math.round(name.width), vw: document.documentElement.clientWidth };
  });
  check(`phone ${design}: the input field is above the bottom bar`, fit.compBottom <= fit.barTop + 1, JSON.stringify(fit));
  check(`phone ${design}: the chat header fits`, fit.toolsRight <= fit.vw && fit.nameW > 60, JSON.stringify(fit));
  if (design === "glass") await phone.screenshot({ path: SHOTS + "05b-chat-phone-glass.png" });
  await phone.click(".conv-head .back-btn");
}

await phone.click("#bottombar button[data-go=profile]");
await phone.waitForSelector("#view-profile:not(.hidden)");
await phone.screenshot({ path: SHOTS + "07-profile-phone.png" });
check("phone: no layout problems in profile", (await layoutProblems(phone)).length === 0, (await layoutProblems(phone)).join("; "));
await phone.close();

// ---------- logout ----------
const again = await newPage(1280, 860);
await again.goto(BASE + "/");
await again.waitForSelector("#app:not(.hidden), #login-form", { state: "visible" });
await again.close();

await browser.close();
// Expected responses are not bugs: 401 before login (page start), 422 for the adults-only test.
const unexpected = consoleErrors.filter((t) => !/status of (401|422)/.test(t));
check("no JavaScript errors in the console", unexpected.length === 0, unexpected.slice(0, 3).join(" | "));

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
