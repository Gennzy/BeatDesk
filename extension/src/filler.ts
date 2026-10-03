import { FIELDS, NUMERIC_KEYS, SKIP_WHEN_ZERO, type BeatFill, type FieldSpec } from "./fields";
import { siteFields, type SiteConfig } from "./sites";

export type FillReport = {
  filled: { label: string; value: string }[];
  /** Поля, которые нашлись, но остались пустыми: цена не задана. */
  empty: { label: string }[];
  /** Поля, которых на форме нет. */
  missing: string[];
  /** Что осознанно пропущено и почему. */
  skipped: { label: string; reason: string }[];
};

type Candidate = {
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  /** Всё, чем поле себя выдаёт, одной строкой в нижнем регистре. */
  haystack: string;
  /** Контейнер чипов: у BeatStars теги — это не поле, а набор кнопок. */
  chipHost: HTMLElement | null;
};

const MAX_CANDIDATES = 800;
const CHIP_LABELS = ["tags", "genres", "moods", "теги", "жанры", "настроение"];

/** Собираем все поля страницы вместе с их подписями. */
function collectCandidates(root: Document): Candidate[] {
  const nodes = root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    "input:not([type=hidden]):not([type=file]):not([type=submit]):not([type=button]):not([type=checkbox]):not([type=radio]), textarea, select",
  );

  const total = Math.min(nodes.length, MAX_CANDIDATES);
  const candidates: Candidate[] = [];

  for (let index = 0; index < total; index += 1) {
    const element = nodes[index];
    if (!element) continue;
    if (element.closest('[aria-hidden="true"]')) continue;

    const parts: string[] = [
      element.getAttribute("name") ?? "",
      element.getAttribute("id") ?? "",
      element.getAttribute("placeholder") ?? "",
      element.getAttribute("aria-label") ?? "",
      element.getAttribute("data-testid") ?? "",
      element.getAttribute("autocomplete") ?? "",
    ];

    // подпись через for=
    const id = element.getAttribute("id");
    if (id) {
      const label = root.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (label?.textContent) parts.push(label.textContent);
    }

    // ближайшая обёртка: текст её заголовков и лебелов
    const wrapper = element.closest("div, fieldset, section, form");
    if (wrapper) {
      const ownLabels = wrapper.querySelectorAll(
        ":scope > label, :scope > div > label, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > span",
      );
      for (const node of Array.from(ownLabels).slice(0, 4)) {
        if (node.textContent) parts.push(node.textContent);
      }
    }

    const ownLabel = element.closest("label");
    if (ownLabel?.textContent) parts.push(ownLabel.textContent);

    const haystack = parts.join(" ").toLowerCase().replace(/\s+/g, " ");
    candidates.push({ element, haystack, chipHost: findChipHost(element) });
  }

  return candidates;
}

/**
 * У чипов нет отдельного поля: это контейнер с кнопками и скрытым вводом.
 * Если подпись рядом говорит про теги или жанры — это чипы.
 */
function findChipHost(element: Candidate["element"]): HTMLElement | null {
  if (element.tagName !== "INPUT") return null;

  const host = element.parentElement;
  if (!host) return null;

  const chips = host.querySelectorAll("button, [role='button'], span[data-tag], li");
  if (chips.length === 0) return null;

  const label = (host.parentElement?.textContent ?? "").toLowerCase();
  return CHIP_LABELS.some((word) => label.includes(word)) ? host : null;
}

/** Насколько поле подходит под спецификацию: больше — лучше. */
function score(candidate: Candidate, spec: FieldSpec): number {
  const haystack = candidate.haystack;

  if (spec.exclude?.some((word) => haystack.includes(word))) return -1;

  let best = 0;
  for (const word of spec.keywords) {
    if (!haystack.includes(word)) continue;
    const exact = new RegExp(`(^|[^a-zа-я0-9])${escapeRegExp(word)}([^a-zа-я0-9]|$)`, "i").test(haystack);
    best = Math.max(best, exact ? 100 + word.length : 10 + word.length);
  }

  return best;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
}

/**
 * React не замечает прямую установку value, поэтому значение ставим
 * через нативный сеттер и отправляем события, которые он слушает.
 */
function setValue(element: Candidate["element"], value: string): boolean {
  try {
    if (element instanceof HTMLSelectElement) {
      const option = pickOption(element, value);
      if (!option) return false;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(element, option.value);
    } else {
      setNativeValue(element, value);
    }

    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    return true;
  } catch {
    return false;
  }
}

/** В списке тональностей BeatStars значения сокращённые: «G#m» вместо «G# minor». */
function pickOption(select: HTMLSelectElement, value: string): HTMLOptionElement | null {
  const wanted = value.toLowerCase().replace(/\s+/g, "");
  const options = Array.from(select.options).filter((option) => option.value !== "");
  const flat = (option: HTMLOptionElement) => (option.textContent ?? "").toLowerCase().replace(/\s+/g, "");

  // «F# minor» ищем ещё и по корневой ноте: на площадках встречается «F#m» и «Фа# минор»
  const root = wanted.match(/^[a-g][#b]?/)?.[0] ?? wanted;

  return (
    options.find((option) => option.value.toLowerCase().replace(/\s+/g, "") === wanted) ??
    options.find((option) => flat(option) === wanted) ??
    options.find((option) => option.textContent?.toLowerCase().includes(wanted)) ??
    options.find((option) => root.length > 1 && (option.textContent ?? "").toLowerCase().includes(root)) ??
    options.find((option) => root.length > 1 && option.value.toLowerCase().includes(root)) ??
    null
  );
}

/**
 * Чипы создаются не значением поля, а настоящим вводом с клавишей Enter.
 * Поэтому печатаем посимвольно, как это делает человек.
 */
function fillChips(host: HTMLElement, values: string[], limit: number): number {
  const input = host.querySelector<HTMLInputElement>("input");
  if (!input) return 0;

  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  let added = 0;

  for (const raw of values.slice(0, limit)) {
    const value = raw.trim();
    if (!value) continue;

    input.focus();
    setNativeValue(input, "");

    for (const char of value) {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: char, bubbles: true }));
      setter?.call(input, input.value + char);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }),
    );
    added += 1;
  }

  return added;
}

/** Подсветить поле, чтобы его было видно среди формы. */
function mark(element: Element | null, ok: boolean): void {
  if (!element) return;
  if (!(element instanceof HTMLElement)) return;

  element.style.outline = ok ? "2px solid #d8ff3e" : "2px solid #f59e0b";
  element.style.outlineOffset = "2px";
  window.setTimeout(() => {
    element.style.outline = "";
    element.style.outlineOffset = "";
  }, 6000);
}

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : value.slice(0, limit - 1).trimEnd() + "…";
}

export function fillForm(beat: BeatFill, site: SiteConfig, root: Document = document): FillReport {
  const candidates = collectCandidates(root);
  const used = new Set<Candidate["element"]>();
  const report: FillReport = { filled: [], empty: [], missing: [], skipped: [] };

  for (const spec of FIELDS) {
    if (!siteFields(spec, site)) {
      report.skipped.push({
        label: spec.label,
        reason: `цены в BeatDesk в рублях, форма в ${site.currency === "USD" ? "долларах" : "рублях"}`,
      });
      continue;
    }

    let best: { candidate: Candidate; points: number } | null = null;

    for (const candidate of candidates) {
      if (used.has(candidate.element)) continue;
      const points = score(candidate, spec);
      if (points <= 0) continue;
      if (!best || points > best.points) best = { candidate, points };
    }

    if (!best) {
      report.missing.push(spec.label);
      continue;
    }

    used.add(best.candidate.element);
    const { candidate } = best;

    // теги в BeatStars — чипы, а не поле
    if (spec.key === "tags" && site.tagsAs === "chips") {
      if (!candidate.chipHost) {
        report.missing.push(spec.label);
        continue;
      }
      const added = fillChips(candidate.chipHost, beat.tags, 3);
      mark(candidate.chipHost, added > 0);
      if (added > 0) report.filled.push({ label: spec.label, value: beat.tags.slice(0, added).join(", ") });
      else report.missing.push(spec.label);
      continue;
    }

    let value = spec.value(beat).trim();

    if (spec.key === "title") value = truncate(value, site.titleLimit);
    // тональность в списке BeatStars сокращённая: «G#m»
    if (spec.key === "key" && site.keyAsShort) value = beat.keyShort || value;

    // цену без заданной суммы не ставим: ноль в поле означает «бесплатно»
    if (SKIP_WHEN_ZERO.has(spec.key) && value === "0") {
      report.empty.push({ label: spec.label });
      mark(candidate.element, false);
      continue;
    }
    if (NUMERIC_KEYS.has(spec.key) && value === "") {
      report.empty.push({ label: spec.label });
      mark(candidate.element, false);
      continue;
    }

    const ok = setValue(candidate.element, value);
    mark(candidate.element, ok);

    if (ok) report.filled.push({ label: spec.label, value });
    else report.missing.push(spec.label);
  }

  return report;
}

/** Баннер в углу страницы: расширение ничего не публикует. */
export function showNotice(lines: string[]): void {
  document.getElementById("beatdesk-fill-notice")?.remove();

  const box = document.createElement("div");
  box.id = "beatdesk-fill-notice";
  box.style.cssText = [
    "position:fixed",
    "z-index:2147483647",
    "right:16px",
    "bottom:16px",
    "max-width:340px",
    "padding:14px 16px",
    "background:#0b0b0b",
    "border:1px solid #d8ff3e",
    "color:#f4f4f5",
    "font:13px/1.5 ui-sans-serif,system-ui,sans-serif",
    "border-radius:8px",
    "box-shadow:0 12px 40px rgba(0,0,0,.5)",
  ].join(";");

  const title = document.createElement("strong");
  title.style.cssText = "display:block;margin-bottom:6px;color:#d8ff3e";
  title.textContent = "BeatDesk заполнил форму. Публикуй сам.";
  box.append(title);

  for (const line of lines.filter(Boolean)) {
    const row = document.createElement("div");
    row.style.cssText = "opacity:.8";
    row.textContent = line;
    box.append(row);
  }

  document.body.append(box);
  window.setTimeout(() => box.remove(), 12000);
}
