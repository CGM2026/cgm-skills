import html
import argparse
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    HRFlowable,
    KeepTogether,
    LongTable,
    Image as RLImage,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Flowable,
    TableStyle,
)


SKILL_DIR = Path(__file__).resolve().parent.parent
QR_IMAGE = SKILL_DIR / "assets" / "mingyuxingchen-wechat-qr.png"
SKILL_URL = "https://github.com/Damocles1112/cgm-skills"

PAGE_W, PAGE_H = A4
MARGIN_X = 24 * mm
MARGIN_TOP = 22 * mm
MARGIN_BOTTOM = 22 * mm

# The report title is intentionally oversized; lower levels retain the compact hierarchy.
SIZE_TITLE = 36
TITLE_CHAR_SPACING = 2.2
SIZE_SECTION = 17
SIZE_SYSTEM = 14
SIZE_SUB = 12
SIZE_BODY = 10.5

IVORY = HexColor("#F4EFE6")
INK = HexColor("#292724")
GRAY = HexColor("#665F59")
BORDEAUX = HexColor("#6E3041")
FRENCH_BLUE = HexColor("#3F5968")
PLUM = HexColor("#74505C")
BRAND = HexColor("#843B4D")
PAREN_GRAY = HexColor("#8D867F")
H4_GRAY = HexColor("#89827C")
RULE = HexColor("#AA9C90")
PALE = HexColor("#EAE2D7")

FONT_REG_PATH = r"C:\Windows\Fonts\Deng.ttf"
FONT_BOLD_PATH = r"C:\Windows\Fonts\Dengb.ttf"
FONT_TITLE_PATH = r"C:\Windows\Fonts\Source Han Serif SC Heavy (TrueType).ttf"
pdfmetrics.registerFont(TTFont("ReportSans", FONT_REG_PATH))
pdfmetrics.registerFont(TTFont("ReportSansBold", FONT_BOLD_PATH))
pdfmetrics.registerFont(TTFont("ReportTitleSerif", FONT_TITLE_PATH))
pdfmetrics.registerFontFamily(
    "ReportSans",
    normal="ReportSans",
    bold="ReportSansBold",
    italic="ReportSans",
    boldItalic="ReportSansBold",
)


def style(name, **kwargs):
    base = dict(
        fontName="ReportSans",
        fontSize=SIZE_BODY,
        leading=17.2,
        textColor=INK,
        alignment=TA_LEFT,
        allowWidows=0,
        allowOrphans=0,
        splitLongWords=True,
        wordWrap="CJK",
        spaceBefore=0,
        spaceAfter=8,
    )
    base.update(kwargs)
    return ParagraphStyle(name, **base)


STYLES = {
    "title": style(
        "title",
        fontName="ReportTitleSerif",
        fontSize=SIZE_TITLE,
        leading=47,
        textColor=BORDEAUX,
        alignment=TA_CENTER,
        spaceBefore=8,
        spaceAfter=12,
        keepWithNext=True,
    ),
    "h2": style(
        "h2",
        fontName="ReportSansBold",
        fontSize=SIZE_SECTION,
        leading=24,
        textColor=BORDEAUX,
        spaceBefore=14,
        spaceAfter=7,
        keepWithNext=True,
    ),
    "h3": style(
        "h3",
        fontName="ReportSansBold",
        fontSize=SIZE_SYSTEM,
        leading=20,
        textColor=FRENCH_BLUE,
        spaceBefore=12,
        spaceAfter=6,
        keepWithNext=True,
    ),
    "h4": style(
        "h4",
        fontName="ReportSansBold",
        fontSize=SIZE_SUB,
        leading=18,
        textColor=H4_GRAY,
        leftIndent=12,
        spaceBefore=16,
        spaceAfter=8,
        keepWithNext=True,
    ),
    "h4_brand": style(
        "h4_brand",
        fontName="ReportSansBold",
        fontSize=SIZE_SUB,
        leading=18,
        textColor=BRAND,
        leftIndent=12,
        spaceBefore=16,
        spaceAfter=8,
        keepWithNext=True,
    ),
    "h4_first_system": style(
        "h4_first_system",
        fontName="ReportSansBold",
        fontSize=SIZE_SUB,
        leading=18,
        textColor=H4_GRAY,
        leftIndent=12,
        spaceBefore=15,
        spaceAfter=7,
        keepWithNext=True,
    ),
    "h5": style(
        "h5",
        fontName="ReportSansBold",
        fontSize=SIZE_BODY,
        leading=17.2,
        textColor=INK,
        spaceBefore=8,
        spaceAfter=4,
        keepWithNext=True,
    ),
    "body": style("body"),
    "body_first_system": style("body_first_system", leading=16.8, spaceAfter=7),
    "promo": style(
        "promo",
        fontSize=9.5,
        leading=14,
        alignment=TA_CENTER,
        spaceAfter=0,
    ),
    "meta": style("meta", textColor=GRAY, spaceAfter=4),
    "quote": style(
        "quote",
        textColor=GRAY,
        leftIndent=14,
        rightIndent=10,
        spaceBefore=3,
        spaceAfter=8,
    ),
    "bullet": style(
        "bullet",
        leftIndent=18,
        firstLineIndent=0,
        bulletIndent=3,
        bulletFontName="ReportSans",
        bulletFontSize=SIZE_BODY,
        spaceAfter=4,
    ),
    "number": style(
        "number",
        leftIndent=23,
        firstLineIndent=0,
        bulletIndent=0,
        bulletFontName="ReportSans",
        bulletFontSize=SIZE_BODY,
        spaceAfter=4,
    ),
    "table_header": style(
        "table_header",
        fontName="ReportSansBold",
        textColor=BORDEAUX,
        leading=15,
        spaceAfter=0,
    ),
    "table_body": style("table_body", leading=15, spaceAfter=0),
    "table_body_bold": style(
        "table_body_bold",
        fontName="ReportSansBold",
        leading=15,
        spaceAfter=0,
    ),
}


def promotion_block(top_gap=0):
    items = []
    if top_gap:
        items.append(Spacer(1, top_gap))
    items.append(
        Paragraph(
            f'<b>Skill 发布页面：</b> <link href="{SKILL_URL}"><font color="{FRENCH_BLUE.hexval()}">{SKILL_URL}</font></link>',
            STYLES["promo"],
        )
    )
    items.append(Spacer(1, 9))
    qr = RLImage(str(QR_IMAGE), width=34 * mm, height=34 * mm)
    qr.hAlign = "CENTER"
    items.append(qr)
    return items


class CenteredTitle(Flowable):
    def __init__(self, text):
        super().__init__()
        self.text = text
        self.height = 58
        self.available_width = 0

    def wrap(self, avail_width, avail_height):
        self.available_width = avail_width
        return avail_width, self.height

    def draw(self):
        text_width = (
            pdfmetrics.stringWidth(self.text, "ReportTitleSerif", SIZE_TITLE)
            + max(0, len(self.text) - 1) * TITLE_CHAR_SPACING
        )
        x = max(0, (self.available_width - text_width) / 2)
        self.canv.saveState()
        self.canv.setFillColor(BORDEAUX)
        obj = self.canv.beginText()
        obj.setFont("ReportTitleSerif", SIZE_TITLE)
        obj.setCharSpace(TITLE_CHAR_SPACING)
        obj.setTextOrigin(x, 10)
        obj.textLine(self.text)
        self.canv.drawText(obj)
        self.canv.restoreState()


def inline_markup(text):
    escaped = html.escape(text, quote=False)
    escaped = re.sub(
        r"（[^（）]*）|\([^()]*\)",
        lambda m: f'<font color="{PAREN_GRAY.hexval()}">{m.group(0)}</font>',
        escaped,
    )
    escaped = re.sub(
        r"\*\*(.+?)\*\*",
        rf'<b><font color="{FRENCH_BLUE.hexval()}">\1</font></b>',
        escaped,
    )
    escaped = re.sub(
        r"`([^`]+)`",
        rf'<b><font color="{FRENCH_BLUE.hexval()}">\1</font></b>',
        escaped,
    )
    escaped = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<i>\1</i>", escaped)
    escaped = re.sub(r"(?<!_)_([^_]+)_(?!_)", r"<i>\1</i>", escaped)
    escaped = escaped.replace(
        "长庚明", rf'<b><font color="{BRAND.hexval()}">长庚明</font></b>'
    )
    escaped = escaped.replace(
        "明语星辰", rf'<b><font color="{BRAND.hexval()}">明语星辰</font></b>'
    )
    return escaped


def table_from(lines):
    rows = []
    for line in lines:
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells):
            continue
        rows.append(cells)
    data = []
    for r, row in enumerate(rows):
        rendered = []
        for c, cell in enumerate(row):
            if r == 0:
                pstyle = STYLES["table_header"]
            elif c == 2 and re.match(r"^(主适配|重要互补)", cell.replace("**", "")):
                pstyle = STYLES["table_body_bold"]
            else:
                pstyle = STYLES["table_body"]
            rendered.append(Paragraph(inline_markup(cell), pstyle))
        data.append(rendered)
    table = LongTable(
        data,
        colWidths=[46 * mm, 50 * mm, 66 * mm],
        repeatRows=1,
        hAlign="LEFT",
    )
    table.setStyle(
        TableStyle(
            [
                ("TEXTCOLOR", (0, 0), (-1, -1), INK),
                ("FONTNAME", (0, 0), (-1, -1), "ReportSans"),
                ("FONTSIZE", (0, 0), (-1, -1), SIZE_BODY),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("LINEABOVE", (0, 0), (-1, 0), 0.7, RULE),
                ("LINEBELOW", (0, 0), (-1, 0), 0.7, RULE),
                ("LINEBELOW", (0, -1), (-1, -1), 0.7, RULE),
            ]
        )
    )
    return table


def parse_markdown(raw):
    lines = raw.splitlines()
    story = []
    paragraph_lines = []
    i = 0
    content_started = False
    current_system = 0

    def flush_paragraph():
        nonlocal paragraph_lines
        if not paragraph_lines:
            return
        if not content_started:
            paragraph_lines = []
            return
        text = " ".join(line.strip() for line in paragraph_lines)
        if current_system == 1:
            target = "body_first_system"
        else:
            target = "body"
        story.append(Paragraph(inline_markup(text), STYLES[target]))
        paragraph_lines = []

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if stripped.startswith("|"):
            flush_paragraph()
            table_lines = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                table_lines.append(lines[i].strip())
                i += 1
            story.append(table_from(table_lines))
            story.append(Spacer(1, 6))
            continue

        if not stripped:
            flush_paragraph()
            i += 1
            continue

        if re.fullmatch(r"-{3,}", stripped):
            flush_paragraph()
            story.append(Spacer(1, 2))
            story.append(HRFlowable(width="100%", thickness=0.55, color=RULE, spaceBefore=2, spaceAfter=7))
            i += 1
            continue

        heading = re.match(r"^(#{1,6})\s+(.*)$", stripped)
        if heading:
            flush_paragraph()
            level = len(heading.group(1))
            text = heading.group(2)
            key = {1: "title", 2: "h2", 3: "h3", 4: "h4"}.get(level, "h5")
            system_match = (
                re.fullmatch(
                    r"([1-5])\.\s+(希腊占星|现代占星|古典占星|八字|紫微斗数)",
                    text,
                )
                if level == 3
                else None
            )
            if system_match:
                current_system = int(system_match.group(1))
            if level == 1:
                content_started = True
            if level == 2 and text.startswith(("一、", "三、", "五、", "八、", "九、")):
                if text.startswith("一、"):
                    story.extend(promotion_block(top_gap=12))
                story.append(PageBreak())
            if system_match and int(system_match.group(1)) > 1:
                story.append(PageBreak())
            if level == 4:
                if text == "一点小广告":
                    key = "h4_brand"
                elif current_system == 1:
                    key = "h4_first_system"
                text = f"- {text}"
            if level == 1:
                item = CenteredTitle(text)
            else:
                item = Paragraph(inline_markup(text), STYLES[key])
            if level == 2:
                story.append(Spacer(1, 2))
                story.append(KeepTogether([item, HRFlowable(width="100%", thickness=0.65, color=RULE, spaceBefore=0, spaceAfter=4)]))
            else:
                story.append(item)
                if level == 1:
                    story.append(Spacer(1, 24))
            i += 1
            continue

        if stripped == ">":
            flush_paragraph()
            i += 1
            continue

        if stripped.startswith("> "):
            flush_paragraph()
            story.append(Paragraph(inline_markup(stripped[2:]), STYLES["quote"]))
            i += 1
            continue

        bullet = re.match(r"^[-*]\s+(.*)$", stripped)
        if bullet:
            flush_paragraph()
            story.append(Paragraph(inline_markup(bullet.group(1)), STYLES["bullet"], bulletText="•"))
            i += 1
            continue

        numbered = re.match(r"^(\d+)\.\s+(.*)$", stripped)
        if numbered:
            flush_paragraph()
            story.append(
                Paragraph(
                    inline_markup(numbered.group(2)),
                    STYLES["number"],
                    bulletText=f"{numbered.group(1)}.",
                )
            )
            i += 1
            continue

        if stripped.startswith("长庚明说：他必须把希腊占星也塞进来"):
            story.append(Spacer(1, 10))
        paragraph_lines.append(line)
        i += 1

    flush_paragraph()
    story.extend(promotion_block(top_gap=14))
    return story


def build(source: Path, output: Path):
    raw = source.read_text(encoding="utf-8")
    output.parent.mkdir(parents=True, exist_ok=True)
    frame = Frame(
        MARGIN_X,
        MARGIN_BOTTOM,
        PAGE_W - 2 * MARGIN_X,
        PAGE_H - MARGIN_TOP - MARGIN_BOTTOM,
        leftPadding=0,
        rightPadding=0,
        topPadding=0,
        bottomPadding=0,
    )
    def paint_background(c, _doc):
        c.saveState()
        c.setFillColor(IVORY)
        c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
        c.restoreState()

    template = PageTemplate(id="body", frames=[frame], onPage=paint_background)
    doc = BaseDocTemplate(
        str(output),
        pagesize=A4,
        leftMargin=MARGIN_X,
        rightMargin=MARGIN_X,
        topMargin=MARGIN_TOP,
        bottomMargin=MARGIN_BOTTOM,
        title="命理天赋适配测试报告",
        author="长庚明 × AI",
        pageTemplates=[template],
    )
    doc.build(parse_markdown(raw))


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Render a completed mingli language-fit Markdown report as the fixed PDF layout."
    )
    parser.add_argument("report", type=Path, help="Completed Markdown report")
    parser.add_argument("pdf", type=Path, help="Output PDF path")
    args = parser.parse_args()
    if not args.report.is_file():
        parser.error(f"Markdown report not found: {args.report}")
    if not QR_IMAGE.is_file():
        parser.error(f"Bundled QR asset not found: {QR_IMAGE}")
    build(args.report, args.pdf)
    print(args.pdf.resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
