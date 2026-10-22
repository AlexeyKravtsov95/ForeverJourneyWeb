# Verifies PDFs produced by scripts/print-pdf-check.mjs (Chrome print) and
# scripts/generate-pdf-samples.tsx (the FJ-WEB-02 client-side generator).
# Checks: valid PDF headers, page counts, cover on page 1, chapter headings
# starting their own pages, no near-empty pages, Cyrillic + Latin text
# present, long-entry tail not lost.
# Text extraction uses PDFium (pypdfium2) — the same engine Chrome's viewer
# runs, i.e. what real users can select, search and copy. pypdf 6.x is unable
# to parse some subset ToUnicode CMaps that react-pdf emits (false negatives).
# Usage: pip install pypdfium2 && python scripts/verify_pdfs.py
import re
import sys
import unicodedata

import pypdfium2 as pdfium

BASE = "docs/pdf-samples"
CHAPTER_RE = re.compile(r"(глава|chapter)[ivxlc]+")


def normalize(text):
    text = unicodedata.normalize("NFKC", text)
    return re.sub(r"[\s\u00AD\u2060\uFEFF]+", "", text).casefold()


def check(name, min_pages, must_contain=(), min_chapters=2, exact_pages=None, must_not_contain=()):
    path = f"{BASE}/{name}.pdf"
    issues = []
    with open(path, "rb") as fh:
        header = fh.read(5)
    if header != b"%PDF-":
        issues.append(f"not a PDF (header {header!r})")

    pdf = pdfium.PdfDocument(path)
    texts = [page.get_textpage().get_text_bounded() for page in pdf]
    pages = len(texts)
    pdf.close()

    head = normalize(texts[0])
    # Chrome's print pipeline doubles letter-spaced glyphs (мооёёпп…); also the
    # client generator puts an invisible glyph warm-up run first on the cover,
    # so search the whole cover page and collapse doubled letters as a fallback
    deduped = re.sub(r"(.)\1+", r"\1", head)
    if (
        "myjourney" not in head
        and "моёпутешествие" not in head
        and "myjourney" not in deduped
        and "моёпутешествие" not in deduped
    ):
        issues.append("cover title missing on page 1")

    full = normalize("\n".join(texts))
    if not re.search(r"[а-яё]", full):
        issues.append("no Cyrillic text found")
    if not re.search(r"[a-z]{3}", full):
        issues.append("no Latin text found")

    chapter_pages = []
    for i, text in enumerate(texts):
        if CHAPTER_RE.search(normalize(text)[:300]):
            chapter_pages.append(i + 1)
    if len(chapter_pages) < min_chapters:
        issues.append(f"expected >= {min_chapters} chapters, found headings on pages {chapter_pages}")
    if len(set(chapter_pages)) != len(chapter_pages):
        issues.append(f"two chapters share a page (break failure): {chapter_pages}")

    empties = [i + 1 for i, t in enumerate(texts) if len(t.strip()) < 5]
    if empties:
        issues.append(f"near-empty pages: {empties}")

    for needle in must_contain:
        if normalize(needle) not in full:
            issues.append(f"expected text not found in PDF: {needle!r}")
    for needle in must_not_contain:
        if normalize(needle) in full:
            issues.append(f"unexpected text found in PDF: {needle!r}")

    if pages < min_pages:
        issues.append(f"expected >= {min_pages} pages, got {pages}")
    if exact_pages is not None and pages != exact_pages:
        issues.append(f"expected exactly {exact_pages} pages, got {pages}")

    status = "OK" if not issues else "FAIL"
    print(f"[{status}] {name}: {pages} pages, chapters start on {chapter_pages}")
    for issue in issues:
        print(f"       - {issue}")
    return not issues


def main():
    ok = True
    # --- legacy Chrome print path (regression, FJ-WEB-01) ---
    # headless Chrome runs under the OS locale (ru), so UI strings appear in Russian
    ok &= check(
        "demo-book",
        min_pages=6,
        must_contain=("Aelirien", "Первое море", "Путешествие продолжается"),
    )
    ok &= check("journal-59", min_pages=8, must_contain=("Полуночник", "Память №59", "Память №1"))
    ok &= check("journal-80", min_pages=8, must_contain=("Marathon", "Память №80"))
    ok &= check(
        "journal-long-entry",
        min_pages=6,
        must_contain=("Летописец", "часть 26", "Финальная страница"),
        min_chapters=1,
    )

    # --- client-side generator (FJ-WEB-02, @react-pdf/renderer) ---
    ok &= check(
        "client-demo-book",
        min_pages=6,
        must_contain=("Aelirien", "Первое море", "The journey continues", "Introduction"),
    )
    ok &= check(
        "client-journal-empty",
        min_pages=4,
        exact_pages=4,
        must_contain=("Летопись ждёт первой записи",),
        min_chapters=0,
    )
    ok &= check(
        "client-journal-59",
        min_pages=8,
        must_contain=("Полуночник", "Память №59", "Память №1"),
    )
    ok &= check(
        "client-journal-80",
        min_pages=8,
        must_contain=("Marathon", "Память №80"),
    )
    ok &= check(
        "client-journal-long-entry",
        min_pages=6,
        must_contain=("Летописец", "часть 26", "Финальная страница"),
        min_chapters=1,
    )
    ok &= check(
        "client-journal-500",
        min_pages=50,
        must_contain=("Легенда", "Память №1", "Память №500", "Заметка к памяти №496"),
        min_chapters=40,
    )

    # --- FJ-WEB-02.1: system-event localization, 59 memories, EN/RU --- #
    # English book: addon templates and compact time format stay English;
    # the player's Russian personal note stays verbatim (nothing is ever
    # machine-translated).
    ok &= check(
        "client-localization-en",
        min_pages=8,
        must_contain=(
            "Straider",
            "ZONE",
            "DEATH",
            "VICTORY",
            "INSTANCE",
            "MEMORY",
            "QUEST MILESTONE",
            "A new place became part of your journey",
            "The battle ended in victory",
            "4d 22h",
            "Первая смерть — обидно",
        ),
        must_not_contain=("Путешествие Straider началось", "4 д 22 ч"),
    )
    # Russian book: system events translated, Cyrillic extractable, single
    # period after the year («г.» — not «г..»; the bare ".." needle is not
    # usable because the font warm-up run's «…» extracts as "..."), localized
    # time units, player text untouched.
    ok &= check(
        "client-localization-ru",
        min_pages=8,
        must_contain=(
            "Straider",
            "ЗОНА",
            "СМЕРТЬ",
            "ПОБЕДА",
            "ПОДЗЕМЕЛЬЕ",
            "ВОСПОМИНАНИЕ",
            "ЭТАП ЗАДАНИЙ",
            "ДОСТИЖЕНИЕ",
            "ЗАПИСЬ В ДНЕВНИКЕ",
            "Новое место стало частью твоего путешествия",
            "Битва завершилась победой",
            "На пути каждого героя случаются поражения",
            "Достигнут уровень",
            "Путешествие Straider началось",
            "4 д 22 ч",
            "Первая смерть — обидно",
        ),
        must_not_contain=(
            "г..",  # the «2026 г..» regression must not come back
            "Death",
            "Quest Milestone",
            "A new place became part of your journey",
            "4d 22h",
        ),
    )
    print("ALL OK" if ok else "ISSUES FOUND")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
