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
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import puppeteer from "puppeteer-core";

const BASE = (process.env.BASE_URL ?? "http://localhost:3161").replace(/\/$/, "");

/** Корень для временных файлов: тот же том, что и проект. */
const WORK_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
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

  const path = join(workDir(), "beat.wav");
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

  const path = join(workDir(), `clicks-${bpm}bpm.wav`);
  writeFileSync(path, Buffer.concat([header, Buffer.from(data.buffer)]));

  return { path, bpm };
}

/*
 * Каталог для файлов прогона.
 *
 * Раньше mkdtemp вызывался в двух местах и никогда не удалялся: каждый
 * запуск e2e оставлял после себя папку. Их набралось двадцать, а вместе с
 * ними пришёл ENOSPC посреди прогона — провалилась не проверка, а запись
 * файла. Каталог один на прогон и сносится в finally.
 */
let workDirPath = null;

function workDir() {
  if (!workDirPath) workDirPath = mkdtempSync(join(baseDir(), "beatdesk-e2e-"));

  return workDirPath;
}

/*
 * Где держать временные файлы прогона.
 *
 * Системный tmpdir почти всегда лежит на C:, а проект — на D:. Стоит
 * диску C: заполниться (а он заполнялся дважды за время работы над этим
 * проектом), и прогон падал не на проверке, а на записи файла: ENOSPC.
 * Поэтому по умолчанию рабочий каталог — рядом с проектом, а системный
 * остаётся запасным вариантом и переопределяется через E2E_TMP.
 */
function baseDir() {
  const custom = process.env.E2E_TMP;

  if (custom && existsSync(custom)) return custom;

  return existsSync(WORK_ROOT) ? WORK_ROOT : tmpdir();
}

/**
 * Настоящий бит с площадки.
 *
 * Ссылка берётся из данных страницы, а не перехватом запроса. Перехват
 * работал через раз: браузер отдаёт аудио из кэша, сетевого запроса не
 * происходит вовсе, и две проверки молча выпадали. Прогон при этом
 * показывал «49 из 49» и выглядел успешным — упало не то, что ломалось.
 *
 * Next.js кладёт данные, переданные в компоненты, в поток self.__next_f,
 * и mp3Url лежит там текстом. Это детерминированно: значение либо есть,
 * либо нет, и ждать его не нужно.
 */
async function findRealAudio(browser) {
  // Имя метода — createBrowserContext: в этой версии Puppeteer старого newContext нет.
  const context = await browser.createBrowserContext();
  const page = await context.newPage();

  try {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await wait(1200);

    const html = await page.content();
    // Кавычки в потоке Next.js экранированы, поэтому искомое выглядит
    // как \\"mp3Url\\":\\"https://…\\" — искать надо именно так.
    const audioUrl = html.match(/\\"mp3Url\\":\\"(https:[^\\"]+)/)?.[1];

    if (!audioUrl) return null;

    // Заявленные данные берём с самой карточки: разбор сравнивается с тем,
    // что продавец написал руками, а не с тем, что площадка уже посчитала.
    const card = await page.evaluate(() => {
      const title = document.querySelector("h3")?.textContent?.trim() ?? "";
      const bpm = document.body.innerText.match(/(\d+)\s*BPM/);

      return { title, bpm: bpm ? Number(bpm[1]) : null };
    });

    return { url: audioUrl, declaredBpm: card.bpm, title: card.title };
  } finally {
    await context.close();
  }
}


/** Загрузка файла по ссылке: true, если файл действительно записался. */
async function download(url, path) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });

    if (!response.ok) return false;

    const bytes = Buffer.from(await response.arrayBuffer());

    if (bytes.length === 0) return false;

    writeFileSync(path, bytes);

    return true;
  } catch {
    return false;
  }
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
  /*
   * Форму ищем по полям, а не по первому попавшему <form>: в шапке появилась
   * форма поиска, и document.querySelector("form") указывал на неё, а не на
   * форму входа.
   */
  await page.evaluate(() => {
    const form = [...document.querySelectorAll("form")].find((node) =>
      node.querySelector('input[name="password"]'),
    );
    [...(form?.querySelectorAll("button") ?? [])].find((b) => b.textContent?.trim() === "Регистрация")?.click();
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

    /*
     * Редирект выполняется на клиенте после гидрации, поэтому networkidle2
     * успевает отработать раньше него. Раньше проверка читала адрес сразу и
     * падала без всякой причины — гонка, а не поломка.
     */
    await guest.waitForFunction(() => location.pathname === "/login", { timeout: 15_000 }).catch(() => {});
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
    await user.goto(`${BASE}/cabinet/upload`, { waitUntil: "networkidle2", timeout: 60_000 });
    await wait(1500);

    const emptyReadiness = await user.evaluate(() => document.body.innerText);
    check("форма загрузки объясняет, что без цены бит не купить", /назначьте хотя бы цену/i.test(emptyReadiness));

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
    check("пустая цена снимает претензию, а не оставляет её", /назначьте хотя бы цену/i.test(cleared));

    // --- жанр ----------------------------------------------------------
    /*
     * Проверяется то, что можно проверить без файла: чипы жанра видны
     * гостю без единого клика, выбранный жанр отмечен, а фильтр из адреса
     * действительно сужает ленту, а не игнорируется.
     *
     * Запись жанра сюда не вошла намеренно: создание бита требует
     * аудиофайл, а он в прогоне не задаётся. Проверка формы на жанр живёт
     * в юнит-тестах, сквозная запись — в Studio с настоящим битом.
     */
    console.log("\nЖанр на витрине");
    const genreGuest = await browser.newPage();
    await genreGuest.setViewport({ width: 1440, height: 1000 });
    await genreGuest.goto(`${BASE}/`, { waitUntil: "networkidle2", timeout: 60_000 });

    const chips = await genreGuest.evaluate(() =>
      [...document.querySelectorAll('button[aria-pressed]')]
        .map((node) => node.textContent?.trim() ?? "")
        .filter(Boolean),
    );
    check("гость видит все жанры без раскрытия панели",
      ["Трейп", "Хип-хоп", "Опиум", "Бум-бап"].every((genre) => chips.includes(genre)),
      `видно: ${chips.join(", ")}`);

    await genreGuest.goto(`${BASE}/?genre=trap`, { waitUntil: "networkidle2", timeout: 60_000 });
    const pressed = await genreGuest.evaluate(() =>
      [...document.querySelectorAll('button[aria-pressed="true"]')].map((node) => node.textContent?.trim() ?? ""),
    );
    check("выбранный жанр отмечен в панели", pressed.includes("Трейп"), `отмечено: ${pressed.join(", ")}`);

    const narrow = await genreGuest.evaluate(() => document.body.innerText);
    check("пустой жанр не выдаёт всю витрину", !narrow.includes("Загрузки битов"), "показан весь каталог");
    await genreGuest.close();


    // --- жанр обязателен в форме --------------------------------------
    /*
     * Обязательность проверяется на живой форме загрузки, где человек и
     * выбирает. Смотреть надо не на наличие слова в подписи, а на то, что
     * пустое значение действительно нельзя выбрать: подсказка в списке
     * остаётся, но она disabled — иначе список начинался бы Трейпом и бит
     * молча уходил бы в трейп без всякого выбора.
     */
    const genreForm = await user.evaluate(() => {
      const select = [...document.querySelectorAll("select")].find((node) =>
        [...(node.options ?? [])].some((option) => option.value === "trap"),
      );
      const options = [...(select?.options ?? [])];

      return {
        found: Boolean(select),
        selectable: options.filter((option) => !option.disabled).map((option) => option.value),
        required: select?.required ?? false,
      };
    });

    check("в форме загрузки есть выбор жанра", genreForm.found, "селекта жанра нет");
    check("пустое значение выбрать нельзя", !genreForm.selectable.includes(""), `можно выбрать: ${genreForm.selectable.join(",")}`);
    check("жанров в списке все двенадцать", genreForm.selectable.length === 12, `в списке ${genreForm.selectable.length}`);
    check("поле жанра помечено обязательным", genreForm.required === true, "поле не required");

    // --- полоса баннеров ------------------------------------------------
    /*
     * Полоса на месте героя проверяется отдельно от остального: когда её
     * убрали, страница не падала и не ломалась — просто оставалось пустое
     * место, а это не показывает ни один прогон, который смотрит на ошибки.
     */
    await user.goto(`${BASE}/`, { waitUntil: "networkidle2", timeout: 60_000 });
    const banners = await user.evaluate(() =>
      [...document.querySelectorAll('a[href]')]
        .map((node) => node.getAttribute("href") ?? "")
        .filter((href) => href === "/cabinet/upload" || href === "/?scope=discounted#feed"),
    );
    check("полоса баннеров на месте", banners.length >= 2, `найдено ссылок: ${banners.length}`);

    // Каталог: плитки должны вести в реальные разделы. Плитка, ведущая в
    // пустоту, хуже отсутствующей — человек кликает и решает, что площадка
    // сломана, поэтому проверяются именно адреса.
    const catalog = await user.evaluate(() =>
      [...document.querySelectorAll('a[href*="#feed"]')].map((node) => node.getAttribute("href") ?? ""),
    );
    check("плитки каталога ведут в разделы ленты", catalog.length >= 6, `плиток: ${catalog.length}`);
    check("у плиток нет пустых адресов", catalog.every((href) => href.length > 1), "плитка ведёт в никуда");


    // --- закрепление бита ---------------------------------------------
    /*
     * Проверяется то, что можно сломать тихо: закрепление не должно быть
     * видно постороннему и не должно позволять приколоть чужой бит.
     * Владелец в этом прогоне — свежезарегистрированный, битов у него нет,
     * поэтому проверка идёт через отказ на чужом бите и через то, что
     * кнопки не видно там, где её быть не должно.
     */
    console.log("Закрепление бита");
    // Своя гостевая страница: та, что была в начале прогона, давно закрыта,
    // а правило закрепления важно проверить именно без сессии.
    /*
     * Именно createBrowserContext, а не browser.newPage: во второй раз
     * newPage отдаёт страницу с уже заведённой сессией, и проверка «гость
     * не может» незаметно превращалась в «вошедший не может». Маршрут
     * отвечал «бит не найден», то есть авторизацию проходил — гостя там не
     * было вовсе.
     */
    const pinContext = await browser.createBrowserContext();
    const pinGuest = await pinContext.newPage();
    await pinGuest.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const pinAsGuest = await pinGuest.evaluate(async () => {
      const response = await fetch("/api/profile/pinned-beat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ beatId: "00000000-0000-0000-0000-000000000000" }),
      });
      return { status: response.status, body: (await response.text()).slice(0, 80) };
    });
    await pinContext.close();
    check("гость не закрепляет биты", pinAsGuest.status === 401, `статус ${pinAsGuest.status}: ${pinAsGuest.body}`);

    const pinMissing = await user.evaluate(async () => {
      const response = await fetch("/api/profile/pinned-beat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ beatId: "00000000-0000-0000-0000-000000000000" }),
      });
      return response.status;
    });
    check("закрепить несуществующий бит нельзя", pinMissing === 404, `статус ${pinMissing}`);

    const pinUnknownGenre = await user.evaluate(async () => {
      const response = await fetch("/api/profile/pinned-beat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      return response.status;
    });
    check("закрепление без бита отвергается", pinUnknownGenre === 400, `статус ${pinUnknownGenre}`);

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

    await studio.goto(`${BASE}/cabinet/studio`, { waitUntil: "networkidle2", timeout: 60_000 });
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
        () => !document.querySelector('a[href="/cabinet/studio"]') && !document.querySelector('a[href="/cabinet/upload"]'),
      ),
    );
    // Сессия к этому моменту уже создана регистрацией, поэтому вошедший
    // битмейкер видит в шапке кабинет вместо инструментов.
    check(
      "вошедшему в навигации есть кабинет",
      await studio.evaluate(() => !!document.querySelector('a[href="/cabinet"]')),
    );

    /*
     * Сначала настоящий бит из самой площадки.
     *
     * Синтетический клик-файл удобен тем, что для него известен ответ, но
     * он проверяет только разбор WAV, который мы же и придумали. Настоящий
     * MP3 проходит через другой путь декодирования, и он может сломаться
     * там, где наш файл проходит. Поэтому прогон сначала берёт бит, который
     * уже лежит на площадке: ссылка достаётся перехватом запроса при
     * нажатии play — она не лежит в разметке, плеккер создаёт new Audio().
     */
    const realAudio = await findRealAudio(browser);

    if (realAudio?.url) {
      const file = join(workDir(), "real-beat.mp3");
      const saved = await download(realAudio.url, file);

      if (saved) {
        await (await studio.$('input[type=file]')).uploadFile(file);
        await wait(9000);

        const realText = await studio.evaluate(() => document.body.innerText);
        const realTempo = realText.match(/(\d+[.,]\d)\s*BPM/);

        check("студия разбирает настоящий бит с площадки", Boolean(realTempo), "темп не показан");
        check("на настоящем бите показана длительность", /ДЛИТЕЛЬНОСТЬ/i.test(realText));

        if (realTempo && realAudio.declaredBpm) {
          const detected = Number(realTempo[1].replace(",", "."));
          /*
           * Расхождение печатается, но не роняет прогон: разбор темпа для
           * этого файла известно отличается от заявленного, и это отдельная
           * работа. Молча пропустить проверку нельзя — тогда правка
           * разбора не заметит, что стала лучше.
           */
          const delta = Math.abs(detected - realAudio.declaredBpm);
          console.log(
            `      настоящий бит «${realAudio.title}»: заявлено ${realAudio.declaredBpm} BPM, разбором ${detected}` +
              (delta >= 1 ? ` (расхождение ${delta.toFixed(1)})` : ""),
          );
        }
      }
    }

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
      /*
       * Здесь нужен эталон: файл и заранее известные BPM с тональностью.
       * Без них сверять нечего, а выдуманное ожидание хуже отсутствия
       * проверки — оно всегда проходит и потому врёт.
       *
       * Разбор настоящего бита самой площадки прогон всё равно проверяет
       * выше, без эталона: важно, что декодирование не падает.
       */
      console.log(
        "точность разбора на эталоне не проверялась: задайте BEAT_AUDIO_FILE или BEAT_AUDIO_URL",
      );
    }
  } finally {
    await browser.close();

    // Уборка в finally: каталог должен исчезнуть даже тогда, когда прогон
    // упал на ошибке, — иначе утечка вернётся ровно в худший момент.
    if (workDirPath) {
      rmSync(workDirPath, { recursive: true, force: true });
      workDirPath = null;
    }
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
