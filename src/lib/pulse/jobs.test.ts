import { describe, expect, it } from "vitest";

import {
  canRetry,
  canTransition,
  isFinal,
  isJobStatus,
  isRunning,
  isStuck,
  jobTone,
  jobTitle,
  retryableJobs,
  type JobStatus,
} from "./jobs";

const NOW = new Date("2026-10-17T12:00:00.000Z");

/** Задача, «обновлённая» сколько-то минут назад. */
const job = (status: JobStatus, minutesAgo = 0) => ({
  status,
  updatedAt: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(),
});

describe("статусы задачи", () => {
  it("в базу попадают только заранее описанные статусы", () => {
    expect(isJobStatus("published")).toBe(true);
    expect(isJobStatus("deleted")).toBe(false);
    expect(isJobStatus(null)).toBe(false);
  });

  it("задача без названия бита не остаётся безымянной", () => {
    expect(jobTitle({ beatTitle: "  ", title: "Night Vision type beat" })).toBe("Night Vision type beat");
    expect(jobTitle({ beatTitle: "Night Vision", title: "" })).toBe("Night Vision");
  });
});

describe("переходы", () => {
  // Прямая последовательность работы: создали, рисуем, заливаем, вышло.
  it("путь от черновика до публикации непрерывен", () => {
    expect(canTransition("draft", "rendering")).toBe(true);
    expect(canTransition("rendering", "uploading")).toBe(true);
    expect(canTransition("uploading", "published")).toBe(true);
  });

  it("рендер нельзя объявить опубликованным, минуя загрузку", () => {
    // Ролик, который не доехал, не вышел: такой статус уводил бы ролик из
    // счёта опубликованных, хотя на YouTube его нет.
    expect(canTransition("rendering", "published")).toBe(false);
    expect(canTransition("draft", "published")).toBe(false);
  });

  it("опубликованное не откатывается назад", () => {
    /*
     * В опубликованной задаче лежит video_id, из которого считаются
     * просмотры. Возврат в draft потерял бы его или оставил бы висеть на
     * задаче, которая ничего не публиковала, — и то и другое портит
     * статистику незаметно.
     */
    expect(canTransition("published", "draft")).toBe(false);
    expect(canTransition("published", "failed")).toBe(false);
    expect(canTransition("published", "rendering")).toBe(false);
  });

  it("из отказа выход один — повторить", () => {
    expect(canTransition("failed", "draft")).toBe(true);
    expect(canTransition("failed", "rendering")).toBe(false);
    expect(canTransition("failed", "published")).toBe(false);
  });

  it("нельзя перескочить из отказа в публикацию", () => {
    // Раньше чекбокс «считать опубликованным» ставился руками, и отказавшая
    // задача могла оказаться опубликованной без ролика.
    expect(canTransition("failed", "published")).toBe(false);
  });

  it("любой рабочий статус умеет отказать", () => {
    // Квота YouTube кончается в самый неподходящий момент, и обрыв связи
    // случается на любом шаге.
    expect(canTransition("rendering", "failed")).toBe(true);
    expect(canTransition("uploading", "failed")).toBe(true);
  });

  it("опубликованная и работающая различаются", () => {
    expect(isFinal("published")).toBe(true);
    expect(isFinal("uploading")).toBe(false);
    expect(isRunning("uploading")).toBe(true);
    expect(isRunning("rendering")).toBe(true);
    expect(isRunning("published")).toBe(false);
  });
});

describe("зависшая задача", () => {
  // Самое важное про нашу архитектуру: ролик собирает и заливает браузер.
  // Закрыли вкладку — статус остался навсегда, и чинить некому.
  it("работа без движения дольше получаса считается зависшей", () => {
    expect(isStuck(job("uploading", 40), 15, NOW)).toBe(true);
    expect(isStuck(job("rendering", 20), 15, NOW)).toBe(true);
  });

  it("работа, которая идёт прямо сейчас, зависшей не считается", () => {
    expect(isStuck(job("uploading", 1), 15, NOW)).toBe(false);
    expect(isStuck(job("rendering", 14), 15, NOW)).toBe(false);
  });

  it("опубликованная и отказавшаяся зависшими не бывают", () => {
    // Иначе кнопка повтора появлялась бы у готовых роликов и предлагала
    // перезалить то, что уже вышло.
    expect(isStuck(job("published", 600), 15, NOW)).toBe(false);
    expect(isStuck(job("failed", 600), 15, NOW)).toBe(false);
  });

  it("неразобранное время считается зависшим, а не рабочим", () => {
    // Обратная оценка опаснее: человек не увидит кнопку повтора.
    expect(isStuck({ status: "uploading", updatedAt: "не дата" })).toBe(true);
  });

  it("порог защищён от нуля и отрицательного", () => {
    // При нуле зависшей оказалась бы любая задача, обновлённая секунду назад.
    expect(isStuck(job("uploading", 1), 0, NOW)).toBe(true);
  });
});

describe("повтор", () => {
  it("отказавшая задача повторяется", () => {
    expect(canRetry(job("failed", 500), 15, NOW)).toBe(true);
  });

  it("зависшая задача повторяется, хотя отказа не было", () => {
    // Человек не видел отказа и не знает, что ролик не выйдет. Повтор — его
    // способ закончить начатое.
    expect(canRetry(job("uploading", 40), 15, NOW)).toBe(true);
  });

  it("идущую прямо сейчас задачу не трогаем", () => {
    expect(canRetry(job("uploading", 2), 15, NOW)).toBe(false);
  });

  it("опубликованную не повторяют", () => {
    expect(canRetry(job("published", 40), 15, NOW)).toBe(false);
  });

  it("из списка под повтор попадают только нужные", () => {
    const list = [
      job("draft", 100),
      job("rendering", 2),
      job("rendering", 90),
      job("uploading", 40),
      job("published", 90),
      job("failed", 90),
    ];

    expect(retryableJobs(list, 15, NOW).map((item) => item.status)).toEqual([
      "rendering",
      "uploading",
      "failed",
    ]);
  });
});

describe("тон статуса", () => {
  it("вышедший ролик — успех, он и есть лаймовый в проекте", () => {
    // Отдельного цвета «успех» в палитре нет, signal в тостах означает именно
    // его. Пять оттенков одного тона читались бы как пять одинаковых строк.
    expect(jobTone(job("published", 90), 15, NOW)).toBe("signal");
  });

  it("работа не выглядит как успех", () => {
    /*
     * В статичном списке лаймовый цвет на строке «Загружается» читался бы
     * как «всё сделано». Различает их не цвет, а процент прогресса.
     */
    expect(jobTone(job("uploading", 2), 15, NOW)).toBe("mute");
    expect(jobTone(job("rendering", 2), 15, NOW)).toBe("mute");
  });

  it("зависание тревожнее работы", () => {
    expect(jobTone(job("uploading", 40), 15, NOW)).toBe("danger");
  });

  it("отказ и пустой черновик различимы", () => {
    expect(jobTone(job("failed", 1), 15, NOW)).toBe("danger");
    expect(jobTone(job("draft", 1), 15, NOW)).toBe("mute");
  });
});
