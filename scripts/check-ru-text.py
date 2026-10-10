"""Разбор русских строк словаря: ищем код, английский и огрехи."""

import re
from pathlib import Path

SOURCE = Path(r"D:\beatdesk\src\lib\i18n\dictionaries.ts")
text = SOURCE.read_text(encoding="utf-8")

ru_block = text[: text.index("const en: Record<keyof typeof ru, string> = {")]
pairs = re.findall('"([\\w.]+)":\\s*"((?:[^"\\\\]|\\\\.)*)"', ru_block)
print("русских строк:", len(pairs))


def show(title, rows, limit=18):
    print()
    print(f"— {title}: {len(rows)}")
    for key, value in rows[:limit]:
        print("  ", key, "=>", value[:74])


CODE = re.compile(r"\\b(className|href|undefined|null|typeof|props|TODO|FIXME)\\b")
LATIN = re.compile(r"\\b(the|and|your|with|this|that|file|beat|size|save|cancel)\\b", re.I)

show("код в русском тексте", [(k, v) for k, v in pairs if CODE.search(v)])
show("английские слова", [(k, v) for k, v in pairs if LATIN.search(v)])

# Слова, которые почти всегда означают кальку или опечатку.
SUSPECT = [
    "извенение",
    "отпукнут",
    "разработка",
    "счётчик подписчиков",
    "осуществ",
    "осуществля",
    "данный",
    "данные является",
    "в течении",
    "в течении",
    "так же",
    "и так же",
    "всё таки",
    "всё-таки",
]

show("подозрительные слова", [(k, v) for k, v in pairs if any(w in v.lower() for w in SUSPECT)])

# Двойные пробелы и пробел перед знаком препинания.
show("лишние пробелы", [(k, v) for k, v in pairs if "  " in v or " ," in v or " ." in v])

# Пустые строки по-русски: иногда ключ забыт и текст молчит.
show("пустые значения", [(k, v) for k, v in pairs if v.strip() == ""])