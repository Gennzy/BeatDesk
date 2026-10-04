/**
 * Дымовой сценарий по живому серверу.
 *
 * Проверяет то, что юнит-тесты не видят: что страница действительно
 * отдаёт 401 гостю, что ветка считается целиком и что в консоли нет
 * ошибок. Каждый прогон заводит временный аккаунт на @studio.ru —
 * их потом убирает скрипт чистки.
 *
 * Запуск: сначала поднять сервер, потом
 *   pnpm build && pnpm start -- -p 3161
 *   pnpm test:e2e
 * Либо одной строкой: BASE_URL=https://beat-desk.vercel.app pnpm test:e2e
 */
import puppeteer from "puppeteer-core";

const BASE = (process.env.BASE_URL ?? "http://localhost:3161").replace(/\/$/, "");
const CHROME =
  process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const stamp = Date.now().toString().slice(-6);

const checks = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${detail && !ok ? ` — ${detail}` : ""}`);
}

async function reachable() {
  try {
    const response = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(8000) });
    return response.ok;
  } catch {
    return false;
  }
}

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
  await wait(4500);
}

async function main() {
  if (!(await reachable())) {
    console.error(`Сервер на ${BASE} не отвечает. Подними его и повтори: pnpm build && pnpm start -- -p 3161`);
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "shell",
    args: ["--no-sandbox"],
  });

  const errors = [];

  try {
    // --- гость -------------------------------------------------------
    console.log("\nГость");
    const guest = await browser.newPage();
    await guest.setViewport({ width: 1440, height: 1000 });
    guest.on("pageerror", (error) => errors.push(`guest: ${error}`));

    await guest.goto(`${BASE}/?view=posts`, { waitUntil: "networkidle2", timeout: 60_000 });
    await wait(2000);

    const feedStatus = await guest.evaluate(async () => (await fetch("/api/posts?tab=all&offset=0")).status);
    check("лента постов закрыта от гостя", feedStatus === 401, `статус ${feedStatus}`);

    const threadStatus = await guest.evaluate(async () => (await fetch("/api/posts/00000000-0000-0000-0000-000000000000")).status);
    check("ветка поста закрыта от гостя", threadStatus === 401, `статус ${threadStatus}`);

    await guest.goto(`${BASE}/posts/00000000-0000-0000-0000-000000000000`, { waitUntil: "networkidle2", timeout: 60_000 });
    check("страница ветки отправляет гостя на вход", guest.url().includes("/login"), guest.url());

    const gated = await guest.evaluate(() => !/Ответить/.test(document.body.innerText));
    check("в ленте гостю не показываются посты", gated);
    await guest.close();

    // --- свой пользователь -------------------------------------------
    console.log("\nСвой пользователь");
    const user = await browser.newPage();
    await user.setViewport({ width: 1440, height: 1000 });
    user.on("pageerror", (error) => errors.push(`user: ${error}`));

    await register(user, `e2e${stamp}`, `e2e${stamp}@studio.ru`);

    const authed = await user.evaluate(async () => (await fetch("/api/posts?tab=all&offset=0")).status);
    check("своему пользователю лента доступна", authed === 200, `статус ${authed}`);

    // ветка: корень → один ответ → два в глубине
    const rootId = await user.evaluate(async (mark) => {
      const post = async (body, parentId = null) => {
        const response = await fetch("/api/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body, parentId }),
        });
        if (!response.ok) throw new Error(await response.text());
        return (await response.json()).id;
      };

      const root = await post(`e2e корень ${mark}`);
      const first = await post(`e2e ответ ${mark}`, root);
      for (let i = 0; i < 2; i += 1) await post(`e2e в глубине ${i} ${mark}`, first);
      return root;
    }, stamp);
    check("пост и ответы создаются", Boolean(rootId));

    const counter = await user.evaluate(async (id) => {
      const response = await fetch("/api/posts?tab=all&offset=0");
      const { posts } = await response.json();
      return posts.find((post) => post.id === id)?.replyCount ?? null;
    }, rootId);
    // корень → 1 прямой ответ → 2 в глубине = 3
    check("счётчик считает всю ветку, а не прямых детей", counter === 3, `получено ${counter}`);

    await user.goto(`${BASE}/posts/${rootId}`, { waitUntil: "networkidle2", timeout: 60_000 });
    await wait(1500);
    const inThread = await user.evaluate(() => document.body.innerText);
    check("в ветке виден счётчик ветки", /3\s+ОТВЕТ/i.test(inThread), "счётчик не найден");

    // ответ не должен дублироваться ни при серверной отрисовке, ни после live-обновления
    await user.type("textarea", `e2e уникальный ответ ${stamp}`);
    await user.evaluate(() =>
      [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Ответить")?.click(),
    );
    await wait(4000);
    const rightAfter = await user.evaluate(
      (needle) => [...document.querySelectorAll("article")].filter((a) => a.textContent?.includes(needle)).length,
      `e2e уникальный ответ ${stamp}`,
    );
    check("ответ показан один раз сразу после отправки", rightAfter === 1, `найдено ${rightAfter}`);

    await wait(22_000);
    const afterLive = await user.evaluate(
      (needle) => [...document.querySelectorAll("article")].filter((a) => a.textContent?.includes(needle)).length,
      `e2e уникальный ответ ${stamp}`,
    );
    check("ответ не задваивается после живого обновления", afterLive === 1, `найдено ${afterLive}`);
    await user.close();

    // --- публичная страница бита -------------------------------------
    console.log("\nПубличная страница бита");
    const anon = await browser.newPage();
    await anon.setViewport({ width: 1440, height: 1000 });
    anon.on("pageerror", (error) => errors.push(`beat: ${error}`));

    await anon.goto(`${BASE}/`, { waitUntil: "networkidle2", timeout: 60_000 });
    await wait(2000);
    const beatHref = await anon.evaluate(() => document.querySelector('a[href^="/beats/"]')?.getAttribute("href") ?? null);
    check("в ленте есть ссылка на бит", Boolean(beatHref));

    if (beatHref) {
      await anon.goto(`${BASE}${beatHref}`, { waitUntil: "networkidle2", timeout: 60_000 });
      await wait(1500);
      const text = await anon.evaluate(() => document.body.innerText);
      check("на странице бита есть блок площадок", /BEATSTARS/i.test(text));
      // Airbit выведен из автозаполнения: кнопок заполнения ровно две,
      // а рядом с Airbit стоит честное предупреждение.
      const fillButtons = text.match(/ОТКРЫТЬ И ЗАПОЛНИТЬ/gi) ?? [];
      check("кнопок заполнения ровно две: BeatStars и BeatChain", fillButtons.length === 2, `найдено ${fillButtons.length}`);
      check("Airbit предупреждает, что форма не поддержана", /Форму расширение не знает/i.test(text));
    }
    await anon.close();
  } finally {
    await browser.close();
  }

  const failed = checks.filter((item) => !item.ok);

  if (errors.length > 0) {
    console.error("\nОшибки в консоли страниц:");
    for (const error of [...new Set(errors)]) console.error(`  • ${error}`);
  }

  console.log(`\n${checks.length - failed.length} из ${checks.length} проверок прошли.`);

  if (failed.length > 0 || errors.length > 0) process.exit(1);
}

await main();
