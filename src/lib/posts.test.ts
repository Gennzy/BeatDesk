import { describe, expect, it } from "vitest";

import { branchCounts } from "@/lib/posts";

type TotalsRow = { root_id: string; total: number };

/**
 * Заглушка сервера: branchCounts делает ровно один RPC-вызов. Считает база,
 * здесь проверяется только разбор ответа и поведение при ошибке.
 */
function fakeSupabase(rows: TotalsRow[], fail = false) {
  const state = { fail, calls: [] as Array<{ fn: string; args: unknown }> };

  return {
    client: {
      rpc(fn: string, args: unknown) {
        state.calls.push({ fn, args });
        return Promise.resolve(
          state.fail ? { data: null, error: new Error("boom") } : { data: rows, error: null },
        );
      },
    } as never,
    state,
  };
}

const id = (n: string) => `00000000-0000-0000-0000-${n.padStart(12, "0")}`;

describe("branchCounts", () => {
  it("пустой список не делает запрос", async () => {
    const { client, state } = fakeSupabase([]);
    expect((await branchCounts(client, [])).size).toBe(0);
    expect(state.calls).toHaveLength(0);
  });

  it("зовёт branch_counts с запрошенными корнями", async () => {
    const { client, state } = fakeSupabase([{ root_id: id("1"), total: 3 }]);
    const counts = await branchCounts(client, [id("1")]);

    expect(state.calls).toHaveLength(1);
    expect(state.calls[0].fn).toBe("branch_counts");
    expect(state.calls[0].args).toEqual({ p_ids: [id("1")] });
    expect(counts.get(id("1"))).toBe(3);
  });

  it("раскладывает итоги по корням", async () => {
    const { client } = fakeSupabase([
      { root_id: id("1"), total: 8 },
      { root_id: id("2"), total: 0 },
    ]);
    const counts = await branchCounts(client, [id("1"), id("2")]);

    expect(counts.get(id("1"))).toBe(8);
    expect(counts.get(id("2"))).toBe(0);
  });

  it("при ошибке запроса отдаёт пустые счётчики, а не падает", async () => {
    const counts = await branchCounts(fakeSupabase([], true).client, [id("1")]);
    expect(counts.get(id("1"))).toBeUndefined();
  });
});
