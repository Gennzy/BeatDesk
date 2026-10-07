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
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

/**
 * WAV с кликами на 140 BPM.
 *
 * Генерируется прямо в прогоне, а не хранится файлом: так в тесте сразу
 * видно, какой темп заложен, и его нельзя случайно испортить правкой бинаря.
 */
/**
 * Настоящий бит: 65 МБ файл не хранится в репозитории, поэтому путь или
 * адрес передаётся снаружи. Без него проверка пропускается, а не падает.
 *
 * Ожидаемый ответ зашит в имя файла: 130 BPM и F# major.
 */
async function realBeatFixture() {
  const local = process.env.BEAT_AUDIO_FILE;
  if (local && existsSync(local)) return { path: local, bpm: 130, key: "F# major" };

  const url = process.env.BEAT_AUDIO_URL;
  if (!url) return null;

  const response = await fetch(url);
  if (!response.ok) return null;

  const dir = mkdtempSync(join(tmpdir(), "beatdesk-e2e-real-"));
  const path = join(dir, "beat.wav");
  writeFileSync(path, Buffer.from(await response.arrayBuffer()));

  return { path, bpm: 130, key: "F# major" };
}

function makeClickFixture() {
  const sampleRate = 44100;
  const bpm = 140;
  const seconds = 8;
  const frames = sampleRate * seconds;
  const data = new Int16Array(frames);
  const secondsPerBeat = 60 / bpm;
  const decay = Math.round(0.03 * sampleRate);

  for (let beat = 0; beat * secondsPerBeat < seconds; beat += 1) {
    const start = Math.round(beat * secondsPerBeat * sampleRate);

    for (let i = 0; i < decay && start + i < frames; i += 1) {
      const value = (1 - i / decay) * Math.sin((2 * Math.PI * 70 * (start + i)) / sampleRate) * 0.8;
      data[start + i] = Math.max(-32767, Math.min(32767, Math.round(value * 32767)));
    }
  }

  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length * 2, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length * 2, 40);

  const path = join(mkdtempSync(join(tmpdir(), "beatdesk-e2e-")), `clicks-${bpm}bpm.wav`);
  writeFileSync(path, Buffer.concat([header, Buffer.from(data.buffer)]));

  return { path, bpm };
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

    // --- готовность к продаже -----------------------------------------
    // Проверяем на живой форме: человек ставит цену на уровень, файла для
    // которого нет, и обязан увидеть это сразу, а не после отправки.
    console.log("\nГотовность к продаже");
    await user.goto(`${BASE}/upload`, { waitUntil: "networkidle2", timeout: 60_000 });
    await wait(1500);

    const emptyReadiness = await user.evaluate(() => document.body.innerText);
    check("форма загрузки объясняет, что без цены бит не купить", /поставьте хотя бы цену/i.test(emptyReadiness));

    // Ставим цену на MP3, не загружая ничего: превью нет, значит уровень не готов.
    await user.evaluate(() => {
      const input = document.querySelector('input[name="priceMp3"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(input, "500");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await wait(1200);

    const mp3Readiness = await user.evaluate(() => document.body.innerText);
    check("цена на MP3 без превью показана как неготовая", /не хватает/i.test(mp3Readiness));
    check("не хватает именно превью, а не мастера", /превью в MP3/i.test(mp3Readiness));
    check("форма предупреждает про невыполнимый заказ", /нечем выполнить|заказ/i.test(mp3Readiness));

    // Убираем цену — блок должен вернуться к состоянию «ничего не продаётся».
    await user.evaluate(() => {
      const input = document.querySelector('input[name="priceMp3"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(input, "");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await wait(1200);

    const cleared = await user.evaluate(() => document.body.innerText);
    check("пустая цена снимает претензию, а не оставляет её", /поставьте хотя бы цену/i.test(cleared));

    await user.close();

    // --- заказ: маршруты закрыты от чужих -------------------------------
    // Живую покупку проверяем руками после применения 0023 и 0024: для неё
    // нужен бит с ценами и файлами. Здесь проверяем, что без входа заказ
    // не создать и чужая страница заказа не читается.
console.log("\nЗаказ: доступ");
    // Отдельный контекст: без него страница унаследовала бы сессию
// зарегистрированного пользователя, и проверки гостя стали бы проверками пользователя.
const guestContext = await browser.createBrowserContext();
const guestOrder = await guestContext.newPage();
    await guestOrder.setViewport({ width: 1440, height: 1000 });
    await guestOrder.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });

    const createStatus = await guestOrder.evaluate(async () =>
      (await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beatId: "00000000-0000-0000-0000-000000000000", tier: "mp3", email: "guest@studio.ru" }),
      })).status
    );
    check("гость не создаёт заказ", createStatus === 401, `статус ${createStatus}`);

    const paidStatus = await guestOrder.evaluate(async () =>
      (await fetch("/api/orders/00000000-0000-0000-0000-000000000000/paid", { method: "POST" })).status
    );
    check("гость не подтверждает оплату", paidStatus === 401, `статус ${paidStatus}`);

    const downloadStatus = await guestOrder.evaluate(async () =>
      (await fetch("/api/orders/00000000-0000-0000-0000-000000000000/download?item=x&kind=wav")).status
    );
    check("гость не скачивает файлы заказа", downloadStatus === 401, `статус ${downloadStatus}`);

    await guestOrder.goto(`${BASE}/orders/00000000-0000-0000-0000-000000000000`, { waitUntil: "networkidle2", timeout: 60_000 });
    const orderGated = await guestOrder.evaluate(() => !document.body.innerText.includes("Итого"));
    check("страница чужого заказа не показывает содержимое", orderGated);
    await guestContext.close();

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
      // Продажа идёт на BeatDesk, поэтому на странице бита ждём цены
      // по уровням лицензии, а не блок чужих площадок.
      check("на странице бита видны цены по уровням", /MP3/i.test(text));
      // Регрессия: убранные маркетплейсы не должны нигде всплывать текстом.
      const removed = text.match(/BEATSTARS|BEATCHAIN|AIRBIT|BANDCAMP|SPLICE|TRACKLIB|DISCORD/i);
      check("удалённых площадок на странице нет", removed === null, removed ? `найдено «${removed[0]}»` : "чисто");
      const fillButtons = text.match(/ОТКРЫТЬ И ЗАПОЛНИТЬ/gi) ?? [];
      check("кнопок заполнения чужих форм не осталось", fillButtons.length === 0, `найдено ${fillButtons.length}`);

      // Карточка товара: состояние продажи вместо раздачи, один уровень и
      // одна цена. Дубль витрины — это когда «MP3» встречается дважды.
      check("состояние продажи видно на карточке", /В ПРОДАЖЕ|ОПЛАЧИВАЕТСЯ|ПРОДАН ЭКСКЛЮЗИВНО|ЧЕРНОВИК/i.test(text));
      check("покупателю предлагают купить уровень", /ВЫБЕРИ УРОВЕНЬ|ВЫБРАТЬ|КУПИТЬ/i.test(text));
      const mp3Rows = text.match(/^MP3$/gm) ?? [];
      check("уровень MP3 показан один раз", mp3Rows.length <= 1, `найдено ${mp3Rows.length}`);
      // Висящее обещание: блока, на который ссылался текст, больше нет.
      check("текста про тексты и имена файлов не осталось", !/ТЕКСТЫ И ИМЕНА ФАЙЛОВ/i.test(text));
    }
    await anon.close();
    // --- студия -------------------------------------------------------
    console.log("\nСтудия");
    const studio = await browser.newPage();
    await studio.setViewport({ width: 1440, height: 1100 });
    studio.on("pageerror", (error) => errors.push(`studio: ${error}`));

    await studio.goto(`${BASE}/studio`, { waitUntil: "networkidle2", timeout: 60_000 });
    await wait(1500);

    const studioText = await studio.evaluate(() => document.body.innerText);
    check("вкладка студии открывается гостю", /РАЗБОР БИТА/i.test(studioText));
    check("студия обещает разбор на устройстве", /НЕ ЗАГРУЖАЕТСЯ НА СЕРВЕР/i.test(studioText));
    /*
     * Инструменты битмейкера убраны из общей навигации: гостю они не нужны,
     * а «Студия» вела в личный инструмент. Проверяем новое правило — в шапке
     * их нет, и вместо них гостю не предлагается кабинет, который требует
     * входа.
     */
    check(
      "инструментов продавца в навигации нет",
      await studio.evaluate(
        () => !document.querySelector('a[href="/studio"]') && !document.querySelector('a[href="/upload"]'),
      ),
    );
    // Сессия к этому моменту уже создана регистрацией, поэтому вошедший
    // битмейкер видит в шапке кабинет вместо инструментов.
    check(
      "вошедшему в навигации есть кабинет",
      await studio.evaluate(() => !!document.querySelector('a[href="/cabinet"]')),
    );

    // Разбор настоящего файла: клики на 140 BPM, для которых ответ известен.
    const fixture = makeClickFixture();
    const input = await studio.$('input[type=file]');
    await input.uploadFile(fixture.path);
    await wait(6000);

    const analyzed = await studio.evaluate(() => document.body.innerText);
    const tempo = analyzed.match(/(\d+[.,]\d)\s*BPM/);

    check("студия разбирает файл и находит темп", Boolean(tempo), "темп не показан");

    if (tempo) {
      const value = Number(tempo[1].replace(",", "."));
      check(
        `темп совпадает с реальными ${fixture.bpm} BPM`,
        Math.abs(value - fixture.bpm) < 1,
        `получено ${value}`,
      );
    }

    check("студия показывает сильную долю", /СИЛЬНАЯ ДОЛЯ/i.test(analyzed));
    check("студия не выдумывает свинг на ровном ритме", /нет,\s*ровно/i.test(analyzed));
    check("студия показывает длительность файла", /ДЛИТЕЛЬНОСТЬ/i.test(analyzed));
    await studio.close();

    // Настоящий бит: проверяем и темп, и тональность. Тональность считает
    // Essentia, и если она не загрузится, студия честно покажет запасной
    // ответ — тест это поймает.
    const real = await realBeatFixture();

    if (real) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 1100 });
      page.on("pageerror", (error) => errors.push(`studio real: ${error}`));

      await page.goto(`${BASE}/studio`, { waitUntil: "networkidle2", timeout: 60_000 });
      // Essentia весит около двух мегабайт и грузится сам при открытии.
      await wait(8000);

      const fileInput = await page.$('input[type=file]');
      await fileInput.uploadFile(real.path);
      await wait(30000);

      const text = await page.evaluate(() => document.body.innerText);
      const bpm = Number((text.match(/(\d+[.,]\d)\s*BPM/) ?? ["0"])[1].replace(",", "."));
      const key = (text.match(/[A-G]#?\s(?:MAJOR|MINOR)/) ?? [""])[0].toUpperCase().replace(/\s+/, " ");

      check("на настоящем бите найден темп", Math.abs(bpm - real.bpm) / real.bpm < 0.02, `получено ${bpm}`);
      check("на настоящем бите найдена тональность", key === real.key.toUpperCase(), `получено «${key}»`);
      const note = (text.match(/[A-G]#?\s·\s[^\n]+/i) ?? ["-"])[0].trim();
      check("тональность посчитана эталонным анализом", /ЭТАЛОННЫЙ АНАЛИЗ/i.test(text), `в карточке: «${note}»`);

      await page.close();
    } else {
      console.log("BEAT_AUDIO_FILE или BEAT_AUDIO_URL не заданы: настоящий бит не проверен");
    }
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
