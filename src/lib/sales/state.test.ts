import { describe, expect, it } from "vitest";

import {
  canPutOnSale,
  canTakeOffSale,
  isReservationLive,
  SALE_STATES,
  sellableTiers,
  soldOutReason,
  showsInFeed,
} from "./state";

describe("состояние бита в продаже", () => {
  it("все четыре состояния объявлены и имеют подписи", () => {
    expect(SALE_STATES).toEqual(["draft", "on_sale", "reserved", "sold_exclusive"]);
    for (const state of SALE_STATES) {
      expect(state).toBeTruthy();
    }
  });

  it("черновик и продающийся бит можно выставить на продажу", () => {
    expect(canPutOnSale("draft")).toBe(true);
    expect(canPutOnSale("on_sale")).toBe(true);
  });

  it("проданный эксклюзив нельзя выставить на продажу", () => {
    expect(canPutOnSale("sold_exclusive")).toBe(false);
  });

  it("придержанный бит нельзя выставить на продажу", () => {
    expect(canPutOnSale("reserved")).toBe(false);
  });

  it("черновик и продающийся бит можно снять с продажи", () => {
    expect(canTakeOffSale("draft")).toBe(true);
    expect(canTakeOffSale("on_sale")).toBe(true);
  });

  it("придержанный бит нельзя снять с продажи", () => {
    expect(canTakeOffSale("reserved")).toBe(false);
  });

  it("проданный эксклюзив нельзя снять с продажи", () => {
    expect(canTakeOffSale("sold_exclusive")).toBe(false);
  });

  it("проданный эксклюзив не виден в ленте", () => {
    expect(showsInFeed("sold_exclusive")).toBe(false);
  });

  it("остальные состояния видны в ленте", () => {
    for (const state of ["draft", "on_sale", "reserved"] as const) {
      expect(showsInFeed(state), state).toBe(true);
    }
  });

  it("резерв живёт только до срока", () => {
    const future = new Date(Date.now() + 3600 * 1000).toISOString();
    const past = new Date(Date.now() - 3600 * 1000).toISOString();

    expect(isReservationLive("reserved", future)).toBe(true);
    expect(isReservationLive("reserved", past)).toBe(false);
    expect(isReservationLive("on_sale", future)).toBe(false);
    expect(isReservationLive("reserved", null)).toBe(false);
  });

  it("только доступные состояния выдают уровни для продажи", () => {
    expect(sellableTiers("draft")).toEqual(["mp3", "bundle", "trackout", "exclusive"]);
    expect(sellableTiers("on_sale")).toEqual(["mp3", "bundle", "trackout", "exclusive"]);
    expect(sellableTiers("reserved")).toEqual([]);
    expect(sellableTiers("sold_exclusive")).toEqual([]);
  });

  it("проданный эксклюзив закрывает все уровни", () => {
    const reasons = soldOutReason("sold_exclusive", ["mp3", "exclusive"]);

    expect(reasons).toHaveLength(2);
    expect(reasons.every((r) => r.reason === "exclusive-sold")).toBe(true);
  });

  it("придержанный бит закрывает уровни по другой причине", () => {
    const reasons = soldOutReason("reserved", ["mp3", "exclusive"]);

    expect(reasons).toHaveLength(2);
    expect(reasons.every((r) => r.reason === "reserved")).toBe(true);
  });

  it("доступный бит не даёт причин не купить", () => {
    expect(soldOutReason("on_sale", ["mp3"])).toEqual([]);
    expect(soldOutReason("draft", ["mp3"])).toEqual([]);
  });

  it("пустой список уровней не даёт причин", () => {
    expect(soldOutReason("sold_exclusive", [])).toEqual([]);
  });
});