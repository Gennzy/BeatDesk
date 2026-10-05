import { describe, expect, it } from "vitest";

import {
  canonicalKey,
  checkMetadata,
  enharmonic,
  keyDistance,
  parseKey,
  tempoRelation,
  TEMPO_TOLERANCE,
} from "./metadata";

describe("разбор тональности", () => {
  it("читает обычную запись", () => {
    expect(parseKey("F# major")).toMatchObject({ minor: false, octave: undefined });
    expect(parseKey("c minor")).toMatchObject({ minor: true });
    expect(parseKey("Dm")).toMatchObject({ minor: true });
  });

  it("читает октаву, если её написали", () => {
    expect(parseKey("F#2 minor")).toMatchObject({ minor: true, octave: 2 });
  });

  it("не путает major с minor", () => {
    // Регрессия: `startsWith("m")` ловил и `major`, и `minor`.
    expect(parseKey("C major")?.minor).toBe(false);
    expect(parseKey("C maj")?.minor).toBe(false);
    expect(parseKey("C min")?.minor).toBe(true);
    expect(parseKey("C minor")?.minor).toBe(true);
  });

  it("принимает бемоли", () => {
    expect(parseKey("Gb major")).toMatchObject({ minor: false });
    expect(parseKey("Bb minor")?.minor).toBe(true);
  });

  it("мусор не превращается в тональность", () => {
    expect(parseKey("")).toBeNull();
    expect(parseKey(undefined)).toBeNull();
    expect(parseKey("си♭ гамма")).toBeNull();
    expect(parseKey("H major")).toBeNull();
  });

  it("собирает канонический вид", () => {
    expect(canonicalKey({ root: 6, minor: false, flat: false })).toBe("F# major");
    expect(canonicalKey({ root: 6, minor: true, flat: false, octave: 2 })).toBe("F# minor 2");
  });
});

describe("эквивалентность тональностей", () => {
  it("C# и Db — одна нота с точностью до двух полутонов на круг", () => {
    expect(keyDistance(parseKey("C# major"), parseKey("Db major"))).toBe(0);
    expect(keyDistance(parseKey("C# major"), parseKey("F# major"))).toBe(5);
  });

  it("разница между соседними нотами равна одному полутону", () => {
    expect(keyDistance(parseKey("C major"), parseKey("C# major"))).toBe(1);
    // Через границу октавы: B и C — тот же полутон.
    expect(keyDistance(parseKey("B major"), parseKey("C major"))).toBe(1);
  });

  it("неизвестная тональность даёт пусто, а не выдуманное число", () => {
    expect(keyDistance(parseKey("ерунда"), parseKey("C major"))).toBeNull();
  });

  it("находит бемольный эквивалент решёточного", () => {
    expect(enharmonic("F# major")).toBe("Gb major");
    expect(enharmonic("C# minor")).toBe("Db minor");
    // У E# и B# плоских эквивалентов в обиходной записи нет.
    expect(enharmonic("E major")).toBeNull();
    expect(enharmonic("ерунда")).toBeNull();
  });
});

describe("родство темпов", () => {
  it("совпадение", () => {
    expect(tempoRelation(130, 130.02)).toBe("match");
    expect(tempoRelation(130, 129.99)).toBe("match");
  });

  it("в пределах допуска", () => {
    expect(tempoRelation(130 * (1 + TEMPO_TOLERANCE * 0.9), 130)).toBe("match");
  });

  it("половина и удвоение — один и тот же бит", () => {
    expect(tempoRelation(70, 140)).toBe("family");
    expect(tempoRelation(140, 70)).toBe("family");
    expect(tempoRelation(75, 150)).toBe("family");
    expect(tempoRelation(140, 145)).toBe("match");
  });

  it("настоящее расхождение", () => {
    expect(tempoRelation(130, 145)).toBe("off");
    expect(tempoRelation(90, 140)).toBe("off");
  });
});

describe("checkMetadata: темп", () => {
  const measured = { bpm: 140, key: "F# major", keyConfidence: 0.8 };

  it("совпадение не даёт замечаний", () => {
    expect(checkMetadata("beatstars", { bpm: 140, key: "F# major", title: "Пыль" }, measured)).toEqual([]);
  });

  it("настоящее расхождение на BeatStars мешает выкладке", () => {
    const findings = checkMetadata("beatstars", { bpm: 90, key: "F# major", title: "Пыль" }, measured);
    const tempo = findings.find((item) => item.id === "tempo");

    expect(tempo?.severity).toBe("block");
    expect(tempo?.drift).toBe(36);
    expect(tempo?.suggestion).toContain("140");
  });

  it("на площадке без строгих правил то же расхождение — предупреждение", () => {
    expect(checkMetadata("beatchain", { bpm: 90, key: "F# major", title: "Пыль" }, measured).find((item) => item.id === "tempo")?.severity).toBe("warn");
  });

  it("70 и 140 не называются ошибкой, а разбираются как два темпа одного бита", () => {
    // Ключевой случай: бит, записанный в половинном темпе, — не ошибка,
    // а два варианта одного и того же.
    const findings = checkMetadata("beatstars", { bpm: 70, key: "F# major", title: "Пыль" }, measured);
    const tempo = findings.find((item) => item.id === "tempo");

    expect(tempo?.severity).toBe("warn");
    expect(tempo?.message).toContain("половина");
    expect(tempo?.suggestion).toContain("140");
  });

  it("и обратный случай тоже разбирается", () => {
    const findings = checkMetadata("beatstars", { bpm: 280, key: "F# major", title: "Пыль" }, measured);

    expect(findings.find((item) => item.id === "tempo")?.message).toContain("удвоенный");
  });
});

describe("checkMetadata: тональность", () => {
  const measured = { bpm: 140, key: "F# major", keyConfidence: 0.8 };

  it("другая тональность — блокер на BeatStars", () => {
    const findings = checkMetadata("beatstars", { bpm: 140, key: "C# major", title: "Пыль" }, measured);
    const key = findings.find((item) => item.id === "key");

    expect(key?.severity).toBe("block");
    expect(key?.message).toContain("разные");
    expect(key?.suggestion).toContain("F# major");
  });

  it("тот же аккорд плоским письмом — предупреждение, а не блокер", () => {
    // Db major и F# major — одна тональность. Объявлять ошибкой нельзя.
    const findings = checkMetadata("beatstars", { bpm: 140, key: "Gb major", title: "Пыль" }, measured);
    const key = findings.find((item) => item.id === "key");

    expect(key?.severity).toBe("warn");
    expect(key?.message).toContain("плоской");
    expect(key?.suggestion).toContain("задваивается");
  });

  it("минор не путается с мажором", () => {
    expect(checkMetadata("beatstars", { bpm: 140, key: "F# minor", title: "Пыль" }, measured).some((item) => item.id === "key")).toBe(true);
  });

  it("неуверенная тональность запрещает публиковать догадку", () => {
    const findings = checkMetadata("beatstars", { bpm: 140, key: "F# major", title: "Пыль" }, {
      ...measured,
      keyConfidence: 0.2,
    });

    expect(findings.filter((item) => item.id === "key")).toHaveLength(1);
    expect(findings.find((item) => item.message.includes("неуверенно"))?.suggestion).toContain("пустым");
  });

  it("разные лады при одной ноте — тоже расхождение", () => {
    const key = checkMetadata("beatstars", { bpm: 140, key: "F# minor", title: "Пыль" }, measured).find((item) => item.id === "key");

    expect(key?.message).toContain("разные");
  });

  it("неразобранная тональность не превращается в претензию", () => {
    expect(checkMetadata("beatstars", { bpm: 140, key: "што-то", title: "Пыль" }, measured).some((item) => item.id === "key")).toBe(false);
  });
});

describe("checkMetadata: название", () => {
  const measured = { bpm: 140, key: "F# major", keyConfidence: 0.8 };

  it("пустое название мешает на BeatStars", () => {
    expect(checkMetadata("beatstars", { bpm: 140, key: "F# major" }, measured).find((item) => item.id === "title")?.severity).toBe("block");
  });

  it("пробелы считаются пустым названием", () => {
    expect(checkMetadata("beatstars", { bpm: 140, key: "F# major", title: "   " }, measured).some((item) => item.id === "title")).toBe(true);
  });

  it("имя файла в названии — предупреждение, а не блокер", () => {
    const title = checkMetadata("beatstars", { bpm: 140, key: "F# major", title: "Mimosa.wav" }, measured).find((item) => item.id === "title");

    expect(title?.severity).toBe("warn");
    expect(title?.suggestion).toContain("расширение");
  });

  it("нормальное название не вызывает замечаний", () => {
    expect(checkMetadata("beatstars", { bpm: 140, key: "F# major", title: "Mimosa" }, measured)).toEqual([]);
  });
});
