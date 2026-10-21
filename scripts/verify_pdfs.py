# Verifies PDFs produced by scripts/print-pdf-check.mjs (requires: pip install pypdf).
# Checks: page counts, cover on page 1, chapter headings starting their own pages,
# no near-empty pages, Cyrillic + Latin text present, long-entry tail not lost.
# Note: Chrome PDFs letter-space headings, so text is matched after normalization
# (NFKC for ligatures, whitespace removed, casefold).
# Usage: python scripts/verify_pdfs.py
import re
import sys
import unicodedata

from pypdf import PdfReader

BASE = "docs/pdf-samples"
CHAPTER_RE = re.compile(r"(глава|chapter)[ivxlc]+")


def normalize(text):
    text = unicodedata.normalize("NFKC", text)
    return re.sub(r"[\s\u00AD\u2060\uFEFF]+", "", text).casefold()


def check(name, min_pages, must_contain=(), min_chapters=2):
    path = f"{BASE}/{name}.pdf"
    reader = PdfReader(path)
    texts = [(page.extract_text() or "") for page in reader.pages]
    pages = len(texts)
    issues = []

    head = normalize(texts[0][:600])
    if "myjourney" not in head and "моёпутешествие" not in head:
        issues.append("cover title missing on page 1")

    full = normalize("\n".join(texts))
    if not re.search(r"[а-яё]", full):
        issues.append("no Cyrillic text found")
    if not re.search(r"[a-z]{3}", full):
        issues.append("no Latin text found")

    chapter_pages = []
    for i, text in enumerate(texts):
        if CHAPTER_RE.search(normalize(text[:300])):
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

    if pages < min_pages:
        issues.append(f"expected >= {min_pages} pages, got {pages}")

    status = "OK" if not issues else "FAIL"
    print(f"[{status}] {name}: {pages} pages, chapters start on {chapter_pages}")
    for issue in issues:
        print(f"       - {issue}")
    return not issues


def main():
    ok = True
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
    print("ALL OK" if ok else "ISSUES FOUND")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
