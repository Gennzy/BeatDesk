import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import puppeteer from "puppeteer-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT = mkdtempSync(join(tmpdir(), "cabinet-"));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = Date.now().toString().slice(-6);
const errors = [];

async function register(page, username, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2", timeout: 60_000 });
  await wait(800);
  await page.evaluate(() => {
    const form = document.querySelector("form");
    [...form.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Регистрация")?.click();
  });
  await page.waitForSelector('input[name="username"]', { timeout: 15_000 });
  await page.type('input[name="username"]', username);
  await page.type('input[name="email"]', email);
  await page.type('input[name="password"]', "beatdesk2026");
  await page.evaluate(() =>
    [...document.querySelectorAll("button[type=submit]")].find((b) => b.textContent?.includes("Регистрация"))?.click(),
  );
  await wait(5000);
}

const browser = await puppeteer.launch({
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
  executablePath: CHROME,
  defaultViewport: { width: 1440, height: 1000 },
});

try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(String(e.message)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });

  await register(page, `cab${stamp}`, `cab${stamp}@studio.ru`);

  const shots = [
    { path: "/cabinet", name: "01-cabinet" },
    { path: "/cabinet/beats", name: "02-beats" },
    { path: "/cabinet/studio", name: "05-studio" },
    { path: "/notifications", name: "03-notifications" },
  ];

  for (const shot of shots) {
    await page.goto(`${BASE}${shot.path}`, { waitUntil: "networkidle2", timeout: 60_000 });
    await wait(1200);
    const file = join(OUT, `${shot.name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    const text = await page.evaluate(() => document.body.innerText.slice(0, 400));
    console.log(`\n=== ${shot.path} ===\n${text.replace(/\n{2,}/g, "\n").slice(0, 400)}`);
  }

  // Страница бита: проверяем метку TYPE BEAT.
  await page.goto(`${BASE}/beats/3282f961-352b-4276-96aa-57a17886357f`, { waitUntil: "networkidle2", timeout: 60_000 });
  await wait(1000);
  await page.screenshot({ path: join(OUT, "06-beat.png"), fullPage: true });

  // Мобильный вид кабинета.
  await page.setViewport({ width: 390, height: 900 });
  await page.goto(`${BASE}/cabinet`, { waitUntil: "networkidle2", timeout: 60_000 });
  await wait(1000);
  await page.screenshot({ path: join(OUT, "04-cabinet-mobile.png"), fullPage: true });

  console.log(`\nОшибки страницы: ${errors.length}`);
  for (const e of errors.slice(0, 5)) console.log(`  - ${e}`);
  console.log(`\nСнимки: ${OUT}`);
} finally {
  await browser.close();
}