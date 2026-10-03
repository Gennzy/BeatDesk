import { FIELDS, NUMERIC_KEYS, type BeatFill, type FieldSpec } from "./fields";

export type FillReport = {
  filled: { label: string; value: string }[];
  /** Поля, которые нашлись, но остались пустыми: цена не задана. */
  empty: { label: string }[];
  /** Поля, которых на форме нет. */
  missing: string[];
};

type Candidate = {
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  /** Всё, чем поле себя выдаёт, одной строкой в нижнем регистре. */
  haystack: string;
};

const MAX_CANDIDATES = 800;

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
      const ownLabels = wrapper.querySelectorAll(":scope > label, :scope > div > label, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > span");
      for (const node of Array.from(ownLabels).slice(0, 4)) {
        if (node.textContent) parts.push(node.textContent);
      }
    }

    const ownLabel = element.closest("label");
    if (ownLabel?.textContent) parts.push(ownLabel.textContent);

    candidates.push({ element, haystack: parts.join(" ").toLowerCase().replace(/\s+/g, " ") });
  }

  return candidates;
}

/** Насколько поле подходит под спецификацию: больше — лучше. */
function score(candidate: Candidate, spec: FieldSpec): number {
  const haystack = candidate.haystack;

  if (spec.exclude?.some((word) => haystack.includes(word))) return -1;

  let best = 0;
  for (const word of spec.keywords) {
    if (!haystack.includes(word)) continue;
    // точное совпадение целого слова весит больше, чем вхождение внутрь
    const exact = new RegExp(`(^|[^a-zа-я0-9])${escapeRegExp(word)}([^a-zа-я0-9]|$)`, "i").test(candidate.haystack);
    best = Math.max(best, exact ? 100 + word.length : 10 + word.length);
  }

  return best;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * React не замечает прямую установку value, поэтому значение ставим
 * через нативный сеттер иdispatchем события, которые он слушает.
 */
function setValue(element: Candidate["element"], value: string): boolean {
  try {
    if (element instanceof HTMLTextAreaElement) {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(element, value);
    } else if (element instanceof HTMLSelectElement) {
      const option = Array.from(element.options).find(
        (item) => item.value === value || item.textContent?.trim() === value,
      );
      if (!option) return false;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(element, option.value);
    } else {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(element, value);
    }

    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    return true;
  } catch {
    return false;
  }
}

/** Подсветить поле, чтобы его было видно среди формы. */
function mark(element: Candidate["element"], ok: boolean): void {
  element.style.outline = ok ? "2px solid #d8ff3e" : "2px solid #f59e0b";
  element.style.outlineOffset = "2px";
  window.setTimeout(() => {
    element.style.outline = "";
    element.style.outlineOffset = "";
  }, 6000);
}

export function fillForm(beat: BeatFill, root: Document = document): FillReport {
  const candidates = collectCandidates(root);
  const used = new Set<Candidate["element"]>();
  const report: FillReport = { filled: [], empty: [], missing: [] };

  for (const spec of FIELDS) {
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
    const value = spec.value(beat).trim();

    // цену без заданной суммы не ставим: ноль в поле означает «бесплатно»
    if (NUMERIC_KEYS.has(spec.key) && value === "") {
      report.empty.push({ label: spec.label });
      mark(best.candidate.element, false);
      continue;
    }

    const ok = setValue(best.candidate.element, value);
    mark(best.candidate.element, ok);

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

  for (const line of lines) {
    const row = document.createElement("div");
    row.style.cssText = "opacity:.8";
    row.textContent = line;
    box.append(row);
  }

  document.body.append(box);
  window.setTimeout(() => box.remove(), 12000);
}
