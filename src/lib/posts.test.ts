import { describe, expect, it } from "vitest";

import { branchCounts } from "@/lib/posts";

type Row = { id: string; parent_id: string | null };

/**
 * Заглушка сервера: branchCounts делает ровно один запрос — за двумя
 * колонками. Проверяем именно алгоритм подсчёта, а не сеть.
 */
function fakeSupabase(rows: Row[], fail = false) {
  const state = { fail, selects: [] as string[] };

  const chain = {
    select(columns: string) {
      state.selects.push(columns);
      return chain;
    },
    limit() {
      return chain;
    },
    // thenable — чтобы можно было await прямо результата запроса
    then(resolve: (value: { data: Row[] | null; error: Error | null }) => unknown) {
      return Promise.resolve(
        state.fail ? { data: null, error: new Error("boom") } : { data: rows, error: null },
      ).then(resolve);
    },
  };

  return { client: { from: () => chain } as never, state };
}

const id = (n: string) => `00000000-0000-0000-0000-${n.padStart(12, "0")}`;

describe("branchCounts", () => {
  it("пустой список не делает запрос", async () => {
    const { client, state } = fakeSupabase([]);
    expect((await branchCounts(client, [])).size).toBe(0);
    expect(state.selects).toHaveLength(0);
  });

  it("считает только прямых детей", async () => {
    const rows: Row[] = [{ id: id("1"), parent_id: null }, { id: id("2"), parent_id: id("1") }];
    const counts = await branchCounts(fakeSupabase(rows).client, [id("1")]);
    expect(counts.get(id("1"))).toBe(1);
  });

  it("считает всю ветку, а не только первый уровень", async () => {
    // корень → три прямых ответа, у первого ещё четыре в глубине
    const rows: Row[] = [
      { id: id("1"), parent_id: null },
      { id: id("2"), parent_id: id("1") },
      { id: id("3"), parent_id: id("1") },
      { id: id("4"), parent_id: id("1") },
      { id: id("5"), parent_id: id("2") },
      { id: id("6"), parent_id: id("2") },
      { id: id("7"), parent_id: id("2") },
      { id: id("8"), parent_id: id("5") },
      { id: id("9"), parent_id: id("8") },
    ];

    const counts = await branchCounts(fakeSupabase(rows).client, [id("1"), id("2"), id("5"), id("9")]);

    expect(counts.get(id("1"))).toBe(8);
    expect(counts.get(id("2"))).toBe(5);
    expect(counts.get(id("5"))).toBe(2);
    expect(counts.get(id("9"))).toBe(0);
  });

  it("ответ в другой ветке не попадает в счётчик", async () => {
    const rows: Row[] = [
      { id: id("1"), parent_id: null },
      { id: id("2"), parent_id: id("1") },
      { id: id("9"), parent_id: null },
      { id: id("10"), parent_id: id("9") },
    ];

    const counts = await branchCounts(fakeSupabase(rows).client, [id("1")]);
    expect(counts.get(id("1"))).toBe(1);
  });

  it("пост без ответов даёт ноль, а не undefined", async () => {
    const counts = await branchCounts(fakeSupabase([{ id: id("1"), parent_id: null }]).client, [id("1")]);
    expect(counts.get(id("1"))).toBe(0);
  });

  it("не зависает на испорченных данных с циклом", async () => {
    // Такого в базе быть не может: родитель проверяется на вставке.
    // Но если цикл всё же появится, страница не должна встать намертво.
    const rows: Row[] = [
      { id: id("1"), parent_id: id("2") },
      { id: id("2"), parent_id: id("1") },
      { id: id("3"), parent_id: id("1") },
    ];

    const counts = await branchCounts(fakeSupabase(rows).client, [id("1")]);
    expect(counts.get(id("1"))).toBe(2);
  });

  it("при ошибке запроса отдаёт пустые счётчики, а не падает", async () => {
    const counts = await branchCounts(fakeSupabase([], true).client, [id("1")]);
    expect(counts.get(id("1"))).toBeUndefined();
  });
});
