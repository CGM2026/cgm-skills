import re
import sys
from pathlib import Path

from pypdf import PdfReader


if len(sys.argv) != 3:
    raise SystemExit("Usage: validate_pdf_report.py REPORT.md REPORT.pdf")

SOURCE = Path(sys.argv[1])
PDF = Path(sys.argv[2])


def source_visible(raw):
    out = []
    for line in raw.splitlines():
        text = line.strip()
        if not text or text == ">" or re.fullmatch(r"-{3,}", text):
            continue
        if text.startswith("|"):
            cells = [cell.strip() for cell in text.strip("|").split("|")]
            if all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells):
                continue
            text = " ".join(cells)
        heading = re.match(r"^(#{1,6})\s+(.*)$", text)
        if heading:
            level = len(heading.group(1))
            text = heading.group(2)
            if level == 4:
                text = "-" + text
        text = re.sub(r"^>\s+", "", text)
        if not heading:
            text = re.sub(r"^[-*]\s+", "", text)
        text = text.replace("**", "").replace("`", "")
        text = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"\1", text)
        text = re.sub(r"(?<!_)_([^_]+)_(?!_)", r"\1", text)
        out.append(text)
    return "".join(out)


def normalize(text):
    text = re.sub(r"\s+", "", text)
    text = text.replace("•", "")
    return text


expected = normalize(source_visible(SOURCE.read_text(encoding="utf-8")))
reader = PdfReader(str(PDF))
page_texts = [page.extract_text() or "" for page in reader.pages]
actual = normalize("".join(page_texts))
promo_text = normalize("Skill 发布页面：https://github.com/Damocles1112/cgm-skills")
actual = actual.replace(promo_text, "")

if expected == actual:
    print(f"Text integrity passed: {len(expected)} normalized characters across {len(reader.pages)} pages.")
else:
    limit = min(len(expected), len(actual))
    pos = next((i for i in range(limit) if expected[i] != actual[i]), limit)
    print(f"Text integrity failed at normalized character {pos}.")
    print("EXPECTED:", expected[max(0, pos-80):pos+120])
    print("ACTUAL:  ", actual[max(0, pos-80):pos+120])
    print(f"Expected length={len(expected)}, actual length={len(actual)}")
    raise SystemExit(1)

expected_uri = "https://github.com/Damocles1112/cgm-skills"
uri_pages = []
for page_number, page in enumerate(reader.pages, 1):
    for annotation_ref in page.get("/Annots", []):
        annotation = annotation_ref.get_object()
        action = annotation.get("/A")
        if action and action.get("/URI") == expected_uri:
            uri_pages.append(page_number)

required_pages = {1, len(reader.pages)}
if not required_pages.issubset(set(uri_pages)):
    print(f"Promotional links missing from first/last page: found on {uri_pages}")
    raise SystemExit(1)

print(f"Promotional links passed on pages {sorted(set(uri_pages))}.")

system_titles = [
    "1. 希腊占星",
    "2. 现代占星",
    "3. 古典占星",
    "4. 八字",
    "5. 紫微斗数",
]
system_pages = []
for title in system_titles:
    # Page 1 intentionally lists all five systems; only later occurrences are headings.
    pages = [i for i, text in enumerate(page_texts[1:], 2) if title in text]
    if len(pages) != 1:
        print(f"System heading page check failed for {title}: {pages}")
        raise SystemExit(1)
    system_pages.append(pages[0])
if len(set(system_pages)) != 5:
    print(f"System headings do not start on separate pages: {system_pages}")
    raise SystemExit(1)
print(f"System start pages passed: {system_pages}.")

short_pages = [
    i
    for i, text in enumerate(page_texts[1:-1], 2)
    if len(normalize(text)) < 90
]
if short_pages:
    print(f"Possible orphan/blank internal pages: {short_pages}")
    raise SystemExit(1)

for page_number in (1, len(reader.pages)):
    images = reader.pages[page_number - 1].images
    if not any(image.image.width >= 300 and image.image.height >= 300 for image in images):
        print(f"QR-sized image missing from page {page_number}.")
        raise SystemExit(1)

watermarks = []
for page_number, page in enumerate(reader.pages, 1):
    if any("wmimg" in image.name.lower() for image in page.images):
        watermarks.append(page_number)
if watermarks:
    print(f"Unexpected host watermark image found on pages: {watermarks}")
    raise SystemExit(1)

print("Page density, QR images, and watermark checks passed.")
