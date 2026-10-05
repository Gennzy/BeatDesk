/**
 * Уборка тестовых аккаунтов.
 *
 * Отбор строго по домену @studio.ru — его использовали только автотесты.
 * Настоящие аккаунты скрипт не удаляет никогда: даже с флагом --yes
 * список формируется тем же фильтром, а перед удалением печатается, что
 * останется.
 *
 * По умолчанию скрипт ничего не удаляет, а только показывает план.
 * Удаление — с явным флагом:
 *
 *   node scripts/cleanup-test-accounts.mjs            # план
 *   node scripts/cleanup-test-accounts.mjs --yes      # удалить
 *
 * Ключи берутся из .env.local: NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SECRET_KEY.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const TEST_DOMAIN = "@studio.ru";

const env = {};
for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
  const index = trimmed.indexOf("=");
  env[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
}

const url = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
const key = env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  console.error("Нет NEXT_PUBLIC_SUPABASE_URL или SUPABASE_SECRET_KEY в .env.local");
  process.exit(1);
}

const adminHeaders = { apikey: key, Authorization: `Bearer ${key}` };

/**
 * Запрос к Supabase REST.
 *
 * Метод обязателен: без него запрос молча уходил как GET, и скрипт
 * печатал «удалён», ничего не удалив.
 */
async function api(path, method = "GET") {
  const response = await fetch(`${url}${path}`, { method, headers: adminHeaders });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path} на ${response.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

/**
 * Таблицы разные, и колонки у них разные: у post_likes колонки id нет
 * вовсе. Просьба несуществующей колонки — это ошибка PostgREST, а не
 * пустой список, поэтому имена колонок перечислены явно.
 */
const COUNT_TABLES = [
  { table: "beats", column: "owner_id", select: "id" },
  { table: "posts", column: "author_id", select: "id" },
  { table: "post_likes", column: "user_id", select: "post_id" },
];

async function counts(userId) {
  const result = {};

  for (const { table, column, select } of COUNT_TABLES) {
    const rows = await api(`/rest/v1/${table}?select=${select}&${column}=eq.${userId}&limit=1000`);
    result[table] = Array.isArray(rows) ? rows.length : 0;
  }

  return { beats: result.beats, posts: result.posts, likes: result.post_likes };
}

async function listUsers() {
  const users = [];

  for (let page = 1; page <= 20; page += 1) {
    const data = await api(`/auth/v1/admin/users?page=${page}&per_page=200`);
    const batch = data?.users ?? [];
    users.push(...batch);
    if (batch.length < 200) break;
  }

  return users;
}

const isTest = (user) => String(user.email ?? "").toLowerCase().endsWith(TEST_DOMAIN);
const confirmed = process.argv.includes("--yes");

const all = await listUsers();
const test = all.filter(isTest);
const real = all.filter((user) => !isTest(user));

if (real.length === 0) {
  console.error("Останавливаюсь: в базе нет ни одного настоящего аккаунта. Похоже, что-то уже удалили.");
  process.exit(1);
}

const accountIds = new Set(all.map((user) => user.id));
const beatRows = await api("/rest/v1/beats?select=id,title,owner_id,profiles!beats_owner_id_fkey(username)&limit=2000");
const orphans = (beatRows ?? []).filter((beat) => !accountIds.has(beat.owner_id));

console.log(`Всего аккаунтов: ${all.length}`);
console.log(`Сироты: биты без аккаунта — ${orphans.length}`);
for (const beat of orphans.slice(0, 20)) {
  console.log(`   "${beat.title}" — владелец ${beat.profiles?.username ?? beat.owner_id}`);
}
if (orphans.length > 0) {
  console.log("   Они видны в ленте, но владельца нет: публиковать и править их уже нельзя.");
}

console.log("");
console.log(`Под удаление (${test.length}) — почта на ${TEST_DOMAIN}:`);
for (const user of test) {
  const stats = await counts(user.id);
  console.log(
    `   ${user.user_metadata?.username ?? "?"}  ${user.email}  битов: ${stats.beats}, постов: ${stats.posts}, лайков: ${stats.likes}  ${String(user.created_at).slice(0, 10)}`,
  );
}

console.log("");
console.log(`Не трогаем (${real.length}) — настоящие аккаунты:`);
for (const user of real) {
  const stats = await counts(user.id);
  console.log(`   ${user.user_metadata?.username ?? "?"}  ${user.email}  битов: ${stats.beats}, постов: ${stats.posts}`);
}

if (test.length === 0) {
  console.log("");
  console.log("Удалять нечего.");
  process.exit(0);
}

if (!confirmed) {
  console.log("");
  console.log(`Это был план. Удалить ${test.length} аккаунтов: node scripts/cleanup-test-accounts.mjs --yes`);
  process.exit(0);
}

console.log("");
console.log(`Удаляю ${test.length} аккаунтов...`);

const failures = [];

for (const user of test) {
  await api(`/auth/v1/admin/users/${user.id}`, "DELETE");

  // Ответ 200 ничего не значит: после удаления проверяем, что аккаунта
  // действительно нет. Отсутствие и есть успех — 404 здесь не ошибка.
  const stillThere = await api(`/auth/v1/admin/users/${user.id}`).catch((error) =>
    String(error.message).includes("user_not_found") || String(error.message).includes(" 404") ? null : Promise.reject(error),
  );
  if (stillThere) failures.push(user.email);

  console.log(`   ${stillThere ? "НЕ удалён" : "удалён"} ${user.email}`);
}

const after = await listUsers();
const leftovers = after.filter((user) => isTest(user));

console.log("");
console.log(`Осталось аккаунтов: ${after.length}`);

for (const user of after) {
  const stats = await counts(user.id);
  console.log(`   ${user.user_metadata?.username ?? "?"}  ${user.email}  битов: ${stats.beats}, постов: ${stats.posts}`);
}

if (leftovers.length > 0 || failures.length > 0) {
  console.log("");
  console.error(`Тестовые аккаунты остались: ${leftovers.map((user) => user.email).join(", ") || failures.join(", ")}`);
  process.exit(1);
}

console.log("");
console.log("Тестовых аккаунтов не осталось.");