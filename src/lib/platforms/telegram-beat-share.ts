import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Ссылка «отправить бит в Telegram».
 *
 * Кнопка на странице бита открывает t.me с параметром start, и бот по нему
 * понимает, какой бит прислать. Связывать аккаунт площадки с Telegram не
 * нужно: человек и так пришёл из своего бита, и нажал кнопку под ним.
 *
 * ---------------------------------------------------------------------------
 * ПОЧЕМУ ПОДПИСЬ, А НЕ СЛУЧАЙНЫЙ ТОКЕН В ТАБЛИЦЕ
 *
 * Случайный токен в таблице стоил бы строки на каждый клик: ссылку можно
 * открыть много раз, и строка накапливалась бы впустую. Подпись ничего не
 * хранит — бит и время лежат прямо в ней.
 *
 * ---------------------------------------------------------------------------
 * ЧТО ПОДПИСЬ НЕ ЗАПРЕЩАЕТ
 *
 * Ссылку может открыть кто угодно, и это не беда: бит и так публичен, его
 * страница доступна всем без входа. Подпись защищает не содержимое, а
 * целостность: без неё в start можно было бы подставить чужой или
 * выдуманный идентификатор и попросить бота собрать несуществующий бит.
 *
 * Выдача ссылки — только владельцу бита, проверяется в маршруте. Открыть
 * готовую ссылку может кто угодно, но получить её для чужого бита — нет.
 * ---------------------------------------------------------------------------
 */

/** Сколько живёт ссылка. Достаточно нажать кнопку, не нужно помнить её. */
const TTL_SECONDS = 60 * 60;

type Payload = {
  /** Какой бит прислать. */
  b: string;
  /** Владелец: бот показывает, чей это бит, и сверяется с подписью. */
  o: string;
  /** Когда подпись истекает, секунды epoch. */
  e: number;
};

function secret(): string | null {
  return process.env.PLATFORM_TOKEN_SECRET ?? null;
}

function sign(body: string): string {
  const key = secret()!;
  return createHmac("sha256", key).update(body).digest("base64url");
}

/** Подписанная ссылка для deep-link. */
export function createBeatShareLink(input: { beatId: string; ownerId: string }): string | null {
  const key = secret();

  if (!key) return null;

  const payload: Payload = {
    b: input.beatId,
    o: input.ownerId,
    e: Math.floor(Date.now() / 1000) + TTL_SECONDS,
  };

  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");

  return `${body}.${sign(body)}`;
}

/**
 * Проверка ссылки.
 *
 * null означает «показать пользователю, что ссылка не сработала», и это
 * разные случаи: протухшая ссылка и подделка приводят к одному отказу,
 * но проверка обязана отличать их от хорошей ссылки.
 */
export function readBeatShareLink(token: string): Payload | null {
  const key = secret();

  if (!key) return null;

  const dot = token.lastIndexOf(".");

  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);

  let expected: string;

  try {
    expected = sign(body);
  } catch {
    return null;
  }

  // timingSafeEqual бросает исключение на разной длине, а сравнивать надо
  // именно отказом, а не падением.
  const got = Buffer.from(mac);
  const want = Buffer.from(expected);

  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;

  let payload: Payload;

  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString()) as Payload;
  } catch {
    return null;
  }

  if (!payload.b || !payload.o || typeof payload.e !== "number") return null;

  if (payload.e < Math.floor(Date.now() / 1000)) return null;

  return payload;
}
