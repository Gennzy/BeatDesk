"""Места, где число склеено с постоянным словом: там нужен хелпер склонения."""

import re
from pathlib import Path

ROOT = Path(r"D:\beatdesk\src")

# {число} {перевод/строка} — склейка, после которой 1 читается неверно.
PATTERN = re.compile(
    r"\{([a-zA-Z_][\w.?\[\]()]*)\}\s*\{(?:t\(\"([\w.]+)\"\)|([a-zA-Z_][\w]*))",
)

# Слова, которые по-русски меняются по числу: подписчиков, битов, постов.
RISKY = re.compile(r"подписчик|бит|пост|лайк|прослушиван|сообщени|отзыв|заказ|продаж|подпис")

hits = []

for file in ROOT.rglob("*.tsx"):
    content = file.read_text(encoding="utf-8")
    for line_no, line in enumerate(content.split("\n"), 1):
        for match in PATTERN.finditer(line):
            key = match.group(2) or match.group(3) or ""
            if RISKY.search(key):
                hits.append((file.relative_to(ROOT), line_no, key, line.strip()[:90]))

print(f"мест со склейкой числа и слова: {len(hits)}")
for path, line_no, key, line in hits:
    print(f"  {path}:{line_no}  {key}")
    print(f"      {line}")