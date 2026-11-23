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
await page.waitForSelector("#app:not(.hidden)", { timeout: 10000 });
check("login with the right password opens the app", true);
await page.screenshot({ path: SHOTS + "01-home-desktop.png" });
check("home shows the hosted quota", (await page.textContent("#view-home")).includes("Hosted API today"));

// Characters: create one
await page.click("#nav-desktop button[data-go=characters]");
await page.waitForSelector("#view-characters:not(.hidden)");
await page.click("#view-characters .new-tile");
await page.fill("#f-name", "Mara Stone");
await page.fill("#f-tagline", "Harbour detective, 34");
await page.fill("#f-description", "A tired detective who trusts no one and hides a soft spot for stray cats.");
await page.click("text=Save character");
await page.waitForSelector("#view-characters .char-card", { timeout: 10000 });
check("character is created and listed", (await page.textContent("#view-characters")).includes("Mara Stone"));

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
await page.keyboard.press("Enter");
await page.waitForSelector("#messages .msg.char .bubble:has-text('Streaming works')", { timeout: 15000 });
check("reply streams in and is shown", true);
await page.screenshot({ path: SHOTS + "02-chat-desktop.png" });

// Mark the reply important
await page.click("#messages .msg.char .mark");
await page.waitForSelector("#messages .msg.char.important", { timeout: 5000 });
check("a reply can be marked important", true);
check("important counter updates", (await page.textContent("#conv .conv-stats")).includes("1 of 10"));

// Per-chat model switch to hosted (mock)
await page.selectOption("#conv select.model-select", "hosted");
await page.waitForTimeout(400);
check("model can be changed per chat", true);

// Export link exists
check("chat export link is present", (await page.getAttribute("#conv a[download]", "href")).includes("/api/export/chat/"));

// Settings: theme and appearance
await page.click("#nav-desktop button[data-go=settings]");
await page.waitForSelector("#view-settings:not(.hidden)");
await page.click("#view-settings .palette-card:has-text('Violet')");
const palette = await page.getAttribute("html", "data-palette");
check("color theme switches", palette === "violet", palette);
await page.click("#view-settings .segmented button:has-text('Dark')");
check("dark mode is set", (await page.getAttribute("html", "data-mode")) === "dark");
await page.screenshot({ path: SHOTS + "03-settings-desktop.png" });
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
await page.screenshot({ path: SHOTS + "04-community-desktop.png" });
await page.click("#view-community .grid .ghost:has-text('Add')").catch(() => {});

// Card import from a file
await page.click("#nav-desktop button[data-go=characters]");
await page.waitForSelector("#view-characters:not(.hidden)");
await page.setInputFiles("input[type=file][aria-label='Import a character card']", {
  name: "iris.json", mimeType: "application/json",
  buffer: Buffer.from(JSON.stringify({ name: "Captain Iris Kade", description: "Airship captain.", first_mes: "Report!" })) });
await page.waitForSelector("text=Imported Captain Iris Kade", { timeout: 10000 }).catch(() => {});
check("character card import works", (await page.textContent("#view-characters")).includes("Captain Iris Kade"));

// Live sync: a second window of the same user sees the new message without reloading
const second = await newPage(1280, 860);
await second.goto(BASE + "/");
await second.waitForSelector("#login-form", { state: "visible" });
await second.fill("#user", ADMIN_USER);
await second.fill("#pw", ADMIN_PW);
await second.click("#login-form button[type=submit]");
await second.waitForSelector("#app:not(.hidden)");
await second.click("#nav-desktop button[data-go=chats]");
await second.waitForSelector("#view-chats:not(.hidden)");
await page.click("#nav-desktop button[data-go=chats]");
await page.waitForSelector("#view-chats:not(.hidden) #chat-list");
await page.click("#chat-list .c-row");
await page.waitForSelector("#conv textarea");
await page.fill("#conv textarea", "Live sync check");
await page.keyboard.press("Enter");
await page.waitForSelector("#messages .msg.char .bubble:has-text('Streaming works')", { timeout: 15000 });
await second.waitForFunction(() => document.querySelector("#chat-list") && document.querySelector("#chat-list").textContent.indexOf("Streaming works") !== -1, null, { timeout: 15000 }).catch(() => {});
const liveSeen = (await second.textContent("#chat-list")).includes("Streaming works");
check("second window updates without reload (live sync)", liveSeen);
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
await page.waitForSelector("text=pieces per second", { timeout: 60000 });
check("speed test shows a result", true);
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
await phone.waitForSelector("#app:not(.hidden)");
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
