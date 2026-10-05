/**
 * Essentia в браузере: тональность.
 *
 * Собственный определитель тональности промахивался на четыре полутона на
 * настоящем бите, поэтому эталонный алгоритм из отраслевого стандарта
 * стоит перед ним. Темп он не трогает: там наш код на реальном материале
 * попадает точнее, и замена ничего не даёт.
 *
 * Файлы кладутся в public копированием при сборке и грузятся обычными
 * <script>: сборка emscripten не понимает бандлер, а бинарник wasm обязан
 * лежать рядом со склеивающим файлом.
 *
 * Всё считается на устройстве. Файл не уходит на сервер — незаконченный бит
 * остаётся у автора.
 */

/**
 * Что именно возвращает Essentia, зависит от сборки: в Node приходит
 * строка, в wasm может прийти число, где 0 — мажор, 1 — минор. Раньше
 * проверка `!result.scale` тихо отбрасывала мажор как «пустое значение», и
 * студия молча показывала ответ запасного кода, даже когда эталонный
 * алгоритм отработал.
 */
type EssentiaKeyResult = {
  key: string;
  scale: string | number;
  strength: number;
  firstToSecondRelativeStrength?: number;
};

type EssentiaApi = {
  KeyExtractor: (signal: unknown, ...rest: unknown[]) => EssentiaKeyResult;
  arrayToVector: (input: Float32Array) => unknown;
  delete?: () => void;
};

type EssentiaGlobals = {
  Essentia?: new (wasm: unknown) => EssentiaApi;
  EssentiaWASM?: unknown;
};

/**
 * Конструктор Essentia ждёт модуль, у которого есть свойство EssentiaJS.
 * В Node сборка отдаёт готовый экземпляр с этим свойством, а браузерная
 * отдаёт фабрику emscripten, и её нужно вызвать. Раньше сюда передавалось
 * что попало, и падение выглядело как «EssentiaJS is not a constructor» —
 * то есть как будто алгоритм сломан, хотя дело было в способе загрузки.
 */
async function resolveWasmModule(raw: unknown): Promise<unknown> {
  if (!raw) return null;

  const withFactory = raw as { EssentiaJS?: unknown };
  if (typeof withFactory.EssentiaJS === "function") return raw;

  if (typeof raw === "function") {
    const built = (raw as () => unknown)();
    return built instanceof Promise ? await built : built;
  }

  return null;
}

declare global {
  interface Window {
    Essentia?: new (wasm: unknown) => EssentiaApi;
    EssentiaWASM?: unknown;
  }
}

export type EssentiaKey = {
  /** «F# major» — в том же виде, в каком тональность хранится в бите. */
  key: string;
  /** Уверенность 0..1 по методу Essentia. */
  strength: number;
};

let pending: Promise<EssentiaApi | null> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);

    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }

      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`не загрузился ${src}`)), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        resolve();
      },
      { once: true },
    );
    script.addEventListener("error", () => reject(new Error(`не загрузился ${src}`)), { once: true });
    document.head.append(script);
  });
}

/**
 * Один раз за страницу, дальше переиспользуется: 2 МБ wasm нельзя грузить
 * на каждый файл.
 *
 * Возвращает null, а не бросает: анализ не должен падать из-за того, что
 * тяжёлый модуль не загрузился, — тогда работает запасной определитель.
 */
export function loadEssentia(): Promise<EssentiaApi | null> {
  pending ??= (async () => {
    try {
      await loadScript("/essentia/essentia-wasm.web.js");
      await loadScript("/essentia/essentia.js-core.umd.min.js");

      const globals = window as unknown as EssentiaGlobals;

      if (typeof globals.Essentia !== "function" || !globals.EssentiaWASM) {
        console.warn("Essentia не инициализировался, тональность посчитает запасной код");
        return null;
      }

      const wasmModule = await resolveWasmModule(globals.EssentiaWASM);

      if (!wasmModule) {
        console.warn("Essentia: wasm-модуль не распознан, тональность посчитает запасной код");
        return null;
      }

      const api = new globals.Essentia(wasmModule);
      (globals as unknown as { __beatdeskEssentia?: unknown }).__beatdeskEssentia = api;

      return api;
    } catch (error) {
      console.warn("Essentia не загрузился:", error);
      return null;
    }
  })();

  return pending;
}

/** Готова ли тяжёлая часть уже скачана — чтобы не показывать ожидание зря. */
export function essentiaReady(): boolean {
  const globals = window as unknown as EssentiaGlobals;

  return typeof globals.Essentia === "function" && Boolean(globals.EssentiaWASM);
}

/**
 * Освободить память wasm.
 *
 * Essentia держит всю дорожку в куче WASM, а память браузера не отдаётся
 * сама. Студия разбирает много файлов подряд, и без освобождения вкладка
 * падает на пятом-шестом треке.
 */
export function disposeEssentia(): void {
  const globals = window as unknown as EssentiaGlobals & {
    __beatdeskEssentia?: { delete?: () => void; shutdown?: () => void };
  };

  try {
    globals.__beatdeskEssentia?.delete?.();
  } catch {
    // Модуль уже освобождён — ничего делать не нужно.
  }

  globals.__beatdeskEssentia = undefined;
  pending = null;
}

function scaleLabel(scale: string | number): "minor" | "major" {
  if (scale === 1 || scale === "1" || scale === "minor") return "minor";

  return "major";
}

/**
 * Окно разбора.
 *
 * Тональность в бите не меняется, а на длинных треках Essentia упирается в
 * память кучи WASM. Полминуты-полторы минуты материала дают ту же
 * тональность и укладываются в разумный расход.
 */
const MAX_ANALYSIS_SECONDS = 150;

export async function detectKeyWithEssentia(samples: Float32Array, sampleRate: number): Promise<EssentiaKey | null> {
  const essentia = await loadEssentia();
  if (!essentia) return null;

  try {
    const limit = Math.min(samples.length, Math.round(MAX_ANALYSIS_SECONDS * sampleRate));
    const window = limit < samples.length ? samples.subarray(0, limit) : samples;

    /*
     * Значения — ровно те, что объявлены по умолчанию в Essentia, кроме
     * частоты дискретизации: у неё свой аргумент, а у нас файл может быть и
     * 48 кГц. Раньше сюда подставлялись другие значения профиля и весов, и
     * внутри wasm возникало исключение, которое эта сборка ловить не умеет,
     * — оно выглядело как «Essentia не смогла определить тональность».
     */
    const result = essentia.KeyExtractor(
      essentia.arrayToVector(window as Float32Array),
      true, // averageDetuningCorrection
      4096, // frameSize
      4096, // hopSize
      12, // hpcpSize
      3500, // maxFrequency
      60, // maximumSpectralPeaks
      25, // minFrequency
      0.2, // pcpThreshold
      "bgate", // profileType
      sampleRate,
      0.0001, // spectralPeaksThreshold
      440, // tuningFrequency
      "cosine", // weightType
      "hann", // windowType
    );

    if (!result?.key) return null;

    return {
      key: `${result.key} ${scaleLabel(result.scale)}`,
      strength: Math.max(0, Math.min(1, Number(result.strength) || 0)),
    };
  } catch (error) {
    console.warn("Essentia не смог определить тональность:", error);
    return null;
  }
}
