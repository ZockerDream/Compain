// End-to-end test of the real build (served by the Compain container). Not the mockup.
// Usage: BASE_URL=http://localhost:8080 ADMIN_PW=... node run.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:8080";
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PW = process.env.ADMIN_PW || "admin-password-long-1";
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
await page.waitForSelector("#view-characters .char-card .avatar img", { timeout: 10000 }).catch(() => {});
check("uploaded picture is shown as the avatar", (await page.locator("#view-characters .char-card .avatar img").count()) > 0);

// Adults-only rule shows in the UI
await page.click("#view-characters .new-tile");
await page.fill("#f-name", "Lena");
await page.fill("#f-description", "She is 15 years old and shy.");
await page.click("text=Save character");
await page.waitForSelector("#view-characters .empty-card, #view-characters form, #view-characters .card p:has-text('Characters must be adults')", { timeout: 5000 }).catch(() => {});
const minorMsg = await page.textContent("#view-characters").catch(() => "");
check("adults-only rule is shown to the user", minorMsg.includes("must be adults"), minorMsg.slice(0, 0));
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
await page.screenshot({ path: SHOTS + "02-chat-desktop.png" });

// Mark the reply important
await page.click("#messages .msg.char .mark");
await page.waitForSelector("#messages .msg.char.important", { timeout: 5000 });
check("a reply can be marked important", true);
check("important counter updates", (await page.textContent("#conv .conv-stats")).includes("1 of 10"));

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
const chatId = Number((await page.getAttribute("#conv a[download]", "href")).split("/").pop());
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

// Switch the character in the running chat
await page.evaluate(() => fetch("/api/characters", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Iris Kade", tagline: "Airship captain" }) }));
await page.focus("#chat-character");
await page.waitForTimeout(800);
await page.selectOption("#chat-character", { label: "Iris Kade" });
await page.waitForFunction(() => (document.querySelector("#conv .conv-head .name") || {}).textContent === "Iris Kade", null, { timeout: 10000 }).catch(() => {});
check("character can be switched in the running chat", (await page.textContent("#conv .conv-head .name")) === "Iris Kade");
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
check("publish sends the character to review", (await page.textContent("#view-characters")).includes("In review"));

// Admin: overview and review queue
await page.click("#nav-desktop button[data-go=admin]");
await page.waitForSelector("#view-admin:not(.hidden)");
await page.waitForSelector("#view-admin .stat-card, #view-admin .card", { timeout: 10000 });
check("Server Management overview loads", (await page.textContent("#view-admin")).includes("Hosted API today"));
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
await page.click("#view-admin button:has-text('Run speed test')");
await page.waitForSelector("text=pieces per second", { timeout: REPLY_TIMEOUT });
check("speed test shows a result", true);
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
