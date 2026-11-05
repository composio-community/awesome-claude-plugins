#!/usr/bin/env python3
"""Markdown -> PDF: reportlab (default, pure Python) | weasyprint (HTML/CSS, better fidelity); usage: --help.
Pinned deps: scripts/check_deps.sh install <reportlab|weasyprint>."""

import json
import os
import re
import sys
import argparse
import platform
from copy import deepcopy
from importlib import import_module
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_CONFIG_PATH = SCRIPT_DIR / ".." / "styles" / "default.json"
DEFAULT_CSS_PATH = SCRIPT_DIR / ".." / "styles" / "default.css"


# --- CLI ---

def parse_args(argv=None):
    p = argparse.ArgumentParser(
        description="Convert Markdown to PDF (reportlab or weasyprint).",
    )
    p.add_argument("input", help="Path to the Markdown file")
    p.add_argument("output", nargs="?", default=None, help="Output PDF path (default: <input>.pdf)")
    p.add_argument("--engine", choices=["reportlab", "weasyprint"], default="reportlab",
                   help="Rendering engine (default: reportlab)")
    p.add_argument("--config", default=None, help="JSON style config overrides")
    p.add_argument("--style", default=None, help="CSS file (weasyprint only)")
    p.add_argument("--pygments-theme", default="github", help="Code theme (weasyprint only, default: github)")
    args = p.parse_args(argv)
    if args.output is None:
        args.output = str(Path(args.input).with_suffix(".pdf"))
    return args


# --- Config loading (deep merge) ---

def _deep_merge(base: dict, override: dict) -> dict:
    result = deepcopy(base)
    for key, val in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(val, dict):
            result[key] = _deep_merge(result[key], val)
        else:
            result[key] = deepcopy(val)
    return result


def load_config(config_path=None) -> dict:
    """Load config from JSON, falling back to defaults."""
    defaults = {}
    if DEFAULT_CONFIG_PATH.exists():
        defaults = json.loads(DEFAULT_CONFIG_PATH.read_text(encoding="utf-8"))
    if config_path:
        user_cfg = json.loads(Path(config_path).read_text(encoding="utf-8"))
        return _deep_merge(defaults, user_cfg)
    return defaults


# --- Cross-platform font detection (reportlab) ---

_FONT_SEARCH = {
    "Darwin": [
        ("/System/Library/Fonts/Supplemental/PTSans.ttc", {
            "body": ("PTSans", 0), "bold": ("PTSans-Bold", 7),
            "italic": ("PTSans-Italic", 1), "boldItalic": ("PTSans-BoldItalic", 6),
        }),
        ("/System/Library/Fonts/Supplemental/Arial.ttf", {
            "body": ("Arial", None), "bold": ("Arial-Bold", None),
            "italic": ("Arial-Italic", None), "boldItalic": ("Arial-BoldItalic", None),
        }),
    ],
    "Linux": [
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", {
            "body": ("DejaVuSans", None), "bold": ("DejaVuSans-Bold", None),
            "italic": ("DejaVuSans-Oblique", None), "boldItalic": ("DejaVuSans-BoldOblique", None),
        }),
    ],
}

# Linux bold/italic companion files
_LINUX_COMPANIONS = {
    "bold": "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "italic": "/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf",
    "boldItalic": "/usr/share/fonts/truetype/dejavu/DejaVuSans-BoldOblique.ttf",
}


def detect_fonts() -> dict:
    """Detect fonts -> {body, bold, italic, boldItalic, family: name; _source: path|"builtin";
    _entries: [(name, path, subfontIndex|None)]}."""
    system = platform.system()
    candidates = _FONT_SEARCH.get(system, []) + _FONT_SEARCH.get("Linux", [])

    for font_path, mapping in candidates:
        if not os.path.exists(font_path):
            continue

        entries = []
        names = {}
        for role, (name, idx) in mapping.items():
            if system == "Linux" and role != "body":
                companion = _LINUX_COMPANIONS.get(role)
                if companion and os.path.exists(companion):
                    entries.append((name, companion, None))
                else:
                    entries.append((name, font_path, idx))
            else:
                entries.append((name, font_path, idx))
            names[role] = name

        names["family"] = names["body"]
        names["_source"] = font_path
        names["_entries"] = entries
        return names

    return {
        "body": "Helvetica", "bold": "Helvetica-Bold",
        "italic": "Helvetica-Oblique", "boldItalic": "Helvetica-BoldOblique",
        "family": "Helvetica", "_source": "builtin", "_entries": [],
    }


def register_detected_fonts(font_info: dict):
    """Register detected fonts with reportlab (lazy import)."""
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    for name, path, idx in font_info.get("_entries", []):
        kwargs = {"subfontIndex": idx} if idx is not None else {}
        pdfmetrics.registerFont(TTFont(name, path, **kwargs))

    if font_info["_entries"]:
        pdfmetrics.registerFontFamily(
            font_info["family"],
            normal=font_info["body"],
            bold=font_info["bold"],
            italic=font_info["italic"],
            boldItalic=font_info["boldItalic"],
        )


# --- Structured output ---

def print_status(output_path: str, page_count: int, engine: str):
    """Emit the five result lines the skill parses. Never suppressed -- they are the contract."""
    size_bytes = Path(output_path).stat().st_size
    size_kb = f"{size_bytes / 1024:.0f}KB"
    for ln in (
        "STATUS=OK",
        f"OUTPUT={output_path}",
        f"PAGES={page_count}",
        f"SIZE={size_kb}",
        f"ENGINE={engine}",
    ):
        print(ln)


def print_failure(message: str):
    print("STATUS=FAILED", file=sys.stdout)
    print(message, file=sys.stderr)


def warn(message: str):
    """Report degraded output (dropped content) on stderr."""
    print(f"WARN={message}", file=sys.stderr)


# --- WeasyPrint engine ---

PAGE_SIZES = {"a4": "A4", "letter": "Letter", "legal": "Legal"}


def _page_size_name(config: dict) -> str:
    """Normalize `page.size` to one of A4 / Letter / Legal (A4 when unknown)."""
    return PAGE_SIZES.get(str(config.get("page", {}).get("size", "A4")).strip().lower(), "A4")


def _css_footer_content(fmt: str) -> str:
    """Translate a `{page}`/`{total}` footer format into CSS `content:` parts."""
    parts = []
    for chunk in re.split(r"(\{page\}|\{total\})", fmt):
        if chunk == "{page}":
            parts.append("counter(page)")
        elif chunk == "{total}":
            parts.append("counter(pages)")
        elif chunk:
            parts.append('"%s"' % chunk.replace('\\', '\\\\').replace('"', '\\"'))
    return " ".join(parts) or '""'


def _weasyprint_override_css(config: dict) -> str:
    """CSS block that applies the saved config on top of the base stylesheet."""
    page = config.get("page", {})
    m = page.get("margins", {})
    c = config.get("colors", {})
    footer = config.get("footer", {})
    content = (_css_footer_content(footer.get("format", "Page {page} of {total}"))
               if footer.get("enabled", True) else "normal")
    return f"""
@page {{
  size: {_page_size_name(config)};
  margin: {m.get("top", 25)}mm {m.get("right", 20)}mm {m.get("bottom", 25)}mm {m.get("left", 25)}mm;
  @bottom-center {{ content: {content}; }}
}}
body {{ color: {c.get("text", "#1a1a1a")}; }}
h1, h2 {{ color: {c.get("primary", "#1a3a5c")}; }}
h3, h4 {{ color: {c.get("secondary", "#2c5282")}; }}
blockquote {{ background: {c.get("quote_bg", "#f5f5f5")}; border-left-color: {c.get("border", "#3182ce")}; }}
pre, code {{ background: {c.get("code_bg", "#f0f0f0")}; }}
th {{ background-color: {c.get("header_bg", "#1a3a5c")}; color: {c.get("header_fg", "#ffffff")}; }}
"""


def convert_weasyprint(input_path: str, output_path: str, config: dict,
                       css_path=None, pygments_theme="github"):
    """Convert MD -> HTML -> CSS -> PDF via weasyprint."""
    try:
        import markdown
        import weasyprint
        from pygments.formatters import HtmlFormatter
    except ImportError as exc:
        print_failure(f"Missing dependency for weasyprint engine: {exc}\n"
                      f"Install with: bash {SCRIPT_DIR}/check_deps.sh install weasyprint")
        sys.exit(1)

    md_text = Path(input_path).read_text(encoding="utf-8")

    extensions = [
        "tables", "fenced_code", "codehilite", "footnotes",
        "toc", "attr_list", "def_list", "admonition", "sane_lists", "smarty",
    ]
    extension_configs = {
        "codehilite": {"css_class": "highlight", "guess_lang": True},
    }
    html_body = markdown.markdown(md_text, extensions=extensions,
                                  extension_configs=extension_configs)

    # Resolve CSS
    css_file = Path(css_path) if css_path else DEFAULT_CSS_PATH
    css_link = ""
    if css_file.exists():
        css_link = f'<link rel="stylesheet" href="file://{css_file.resolve()}">'

    # Pygments inline CSS
    try:
        pygments_css = HtmlFormatter(style=pygments_theme).get_style_defs(".highlight")
    except Exception:
        pygments_css = HtmlFormatter(style="default").get_style_defs(".highlight")

    html_doc = f"""<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
{css_link}
<style>{pygments_css}</style>
<style>{_weasyprint_override_css(config)}</style>
</head><body>
{html_body}
</body></html>"""

    doc = weasyprint.HTML(string=html_doc, base_url=str(Path(input_path).parent)).render()
    doc.write_pdf(output_path)

    page_count = len(doc.pages)
    print_status(output_path, page_count, "weasyprint")


# --- Reportlab engine -- helpers ---

def _rl_colors(config: dict):
    """Build reportlab color objects from config."""
    from reportlab.lib import colors as rlc
    c = config.get("colors", {})
    return {
        "primary": rlc.HexColor(c.get("primary", "#1a3a5c")),
        "secondary": rlc.HexColor(c.get("secondary", "#2c5282")),
        "text": rlc.HexColor(c.get("text", "#1a1a1a")),
        "code_bg": rlc.HexColor(c.get("code_bg", "#f0f0f0")),
        "header_bg": rlc.HexColor(c.get("header_bg", "#1a3a5c")),
        "header_fg": rlc.HexColor(c.get("header_fg", "#ffffff")),
        "quote_bg": rlc.HexColor(c.get("quote_bg", "#f5f5f5")),
        "border": rlc.HexColor(c.get("border", "#3182ce")),
        "light_bg": rlc.HexColor(c.get("light_bg", "#f0f4f8")),
        "white": rlc.white,
    }


def safe_xml(text: str, code_font: str = "Courier-Bold") -> str:
    """Escape XML-unsafe chars, apply inline MD: **bold**, *italic*, ***both***, `code`, [links](url).
    code_font: face for inline `code` spans."""
    text = text.replace("&", "&amp;")
    text = text.replace("<", "&lt;").replace(">", "&gt;")

    # Links [text](url) -- must come before bold/italic to avoid mangling
    # Internal anchors (#...) become plain bold text; external URLs become <a> tags
    def _link_repl(m):
        link_text, url = m.group(1), m.group(2)
        if url.startswith("#"):
            return f"<b>{link_text}</b>"
        return f'<a href="{url}" color="blue"><u>{link_text}</u></a>'

    text = re.sub(r"\[([^\]]+?)\]\(([^)]+?)\)", _link_repl, text)

    # Bold+italic (***), then bold (**), then italic (*)
    text = re.sub(r"\*\*\*(.+?)\*\*\*", r"<b><i>\1</i></b>", text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"\*(.+?)\*", r"<i>\1</i>", text)

    # Inline code -- monospace bold in red
    text = re.sub(r"`(.+?)`", rf'<font face="{code_font}" color="#c53030">\1</font>', text)

    return text


def parse_md_table(lines: list) -> list:
    """Parse markdown table lines into a list of rows (list of cell strings)."""
    rows = []
    for line in lines:
        line = line.strip()
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.split("|")]
        if cells and cells[0] == "":
            cells = cells[1:]
        if cells and cells[-1] == "":
            cells = cells[:-1]
        if all(re.match(r"^[-:]+$", c) for c in cells):
            continue
        rows.append(cells)
    return rows


# --- Reportlab engine -- styles ---

def build_styles(font_info: dict, config: dict):
    from reportlab.lib.enums import TA_CENTER, TA_LEFT
    from reportlab.lib.styles import ParagraphStyle, StyleSheet1

    clr = _rl_colors(config)
    typo = config.get("typography", {})
    body_sz = typo.get("body_size", 9)
    f = font_info

    ss = StyleSheet1()

    ss.add(ParagraphStyle(
        name="Normal", fontName=f["body"], fontSize=body_sz,
        leading=body_sz * 1.35, textColor=clr["text"], spaceAfter=4,
    ))
    ss.add(ParagraphStyle(
        name="H1", fontName=f["bold"], fontSize=typo.get("h1_size", 18),
        leading=22, textColor=clr["primary"], alignment=TA_CENTER,
        spaceAfter=6, spaceBefore=0,
    ))
    ss.add(ParagraphStyle(
        name="H2", fontName=f["bold"], fontSize=typo.get("h2_size", 14),
        leading=18, textColor=clr["primary"], alignment=TA_LEFT,
        spaceAfter=6, spaceBefore=14,
    ))
    ss.add(ParagraphStyle(
        name="H3", fontName=f["bold"], fontSize=typo.get("h3_size", 12),
        leading=15, textColor=clr["secondary"], alignment=TA_LEFT,
        spaceAfter=4, spaceBefore=10,
    ))
    ss.add(ParagraphStyle(
        name="H4", fontName=f["bold"], fontSize=typo.get("h4_size", 10),
        leading=13, textColor=clr["primary"], alignment=TA_LEFT,
        spaceAfter=4, spaceBefore=8,
    ))
    ss.add(ParagraphStyle(
        name="Blockquote", fontName=f["italic"], fontSize=body_sz - 0.5,
        leading=11, textColor=clr["text"], leftIndent=14,
        spaceAfter=4, spaceBefore=2, backColor=clr["quote_bg"],
        # reportlab accepts a 4-tuple here at runtime; only its stub says float.
        borderPadding=(4, 6, 4, 6),  # pyright: ignore[reportArgumentType]
    ))
    ss.add(ParagraphStyle(
        name="TableCell", fontName=f["body"], fontSize=8,
        leading=10, textColor=clr["text"],
    ))
    ss.add(ParagraphStyle(
        name="TableCellBold", fontName=f["bold"], fontSize=8,
        leading=10, textColor=clr["text"],
    ))
    ss.add(ParagraphStyle(
        name="TableHeaderCell", fontName=f["bold"], fontSize=8,
        leading=10, textColor=clr["header_fg"],
    ))
    ss.add(ParagraphStyle(
        name="Subtitle", fontName=f["italic"], fontSize=10,
        leading=13, textColor=clr["text"], alignment=TA_CENTER, spaceAfter=10,
    ))
    ss.add(ParagraphStyle(
        name="BulletItem", fontName=f["body"], fontSize=body_sz,
        leading=body_sz * 1.35, textColor=clr["text"],
        leftIndent=16, bulletIndent=6, spaceAfter=3,
    ))
    ss.add(ParagraphStyle(
        name="NumberedItem", fontName=f["body"], fontSize=body_sz,
        leading=body_sz * 1.35, textColor=clr["text"],
        leftIndent=20, firstLineIndent=-14, spaceAfter=3,
    ))
    ss.add(ParagraphStyle(
        name="CodeBlock", fontName="Courier", fontSize=config.get("code", {}).get("font_size", 7.5),
        leading=10, textColor=clr["text"], leftIndent=6,
        spaceAfter=2, spaceBefore=2,
    ))

    return ss


# --- Reportlab engine -- table builder ---

def build_table(rows: list, styles, font_info: dict, clr: dict, available_width: float):
    """Build a reportlab Table from parsed MD rows with auto column widths."""
    from reportlab.lib import colors as rlc
    from reportlab.platypus import Table, TableStyle, Paragraph

    if not rows:
        return None

    num_cols = max(len(r) for r in rows)
    for row in rows:
        while len(row) < num_cols:
            row.append("")

    header_style = styles["TableHeaderCell"]
    cell_style = styles["TableCell"]

    data = []
    for ri, row in enumerate(rows):
        prow = []
        for cell in row:
            cell_text = safe_xml(cell)
            st = header_style if ri == 0 else cell_style
            prow.append(Paragraph(cell_text, st))
        data.append(prow)

    # Auto column widths based on content length
    col_weights = [0.0] * num_cols
    for row in rows:
        for ci, cell in enumerate(row):
            col_weights[ci] = max(col_weights[ci], len(cell))

    total_weight = sum(col_weights) or 1
    col_ratios = [max(min(w / total_weight, 0.60), 0.05) for w in col_weights]
    ratio_sum = sum(col_ratios)
    col_widths = [(r / ratio_sum) * available_width for r in col_ratios]

    table = Table(data, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), clr["header_bg"]),
        ("TEXTCOLOR", (0, 0), (-1, 0), clr["header_fg"]),
        ("FONTNAME", (0, 0), (-1, 0), font_info["bold"]),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("GRID", (0, 0), (-1, -1), 0.5, rlc.HexColor("#c0c0c0")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [rlc.white, clr["light_bg"]]),
    ]))
    return table


# --- Reportlab engine -- blockquote builder ---

def build_blockquote(text: str, styles, clr: dict, available_width: float):
    """Build a blockquote as a table with a left blue border."""
    from reportlab.platypus import Table, TableStyle, Paragraph

    cell_text = safe_xml(text)
    para = Paragraph(cell_text, styles["Blockquote"])

    data = [[" ", para]]
    col_widths = [3, available_width - 10]
    t = Table(data, colWidths=col_widths)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), clr["border"]),
        ("BACKGROUND", (1, 0), (1, 0), clr["quote_bg"]),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (0, 0), 0),
        ("RIGHTPADDING", (0, 0), (0, 0), 0),
        ("LEFTPADDING", (1, 0), (1, 0), 6),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return t


# --- Reportlab engine -- code block builder ---

def build_code_block(text: str, styles, clr: dict, available_width: float):
    """Build a code block with gray background."""
    from reportlab.lib import colors as rlc
    from reportlab.platypus import Table, TableStyle, Paragraph

    text = text.replace("&", "&amp;")
    text = text.replace("<", "&lt;").replace(">", "&gt;")
    text = text.replace("\n", "<br/>")
    para = Paragraph(text, styles["CodeBlock"])

    data = [[para]]
    t = Table(data, colWidths=[available_width])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), clr["code_bg"]),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("BOX", (0, 0), (-1, -1), 0.5, rlc.HexColor("#d0d0d0")),
    ]))
    return t


# --- Reportlab engine -- image support ---

def _try_build_image(alt: str, src: str, available_width: float, base_dir: Path):
    """Reportlab Image flowable or None; relative src: document dir first, else cwd (as weasyprint).
    Warns here, not at call site: alt + reason tell user WHICH image is missing."""
    from reportlab.platypus import Image

    label = f"{src} (alt: {alt})" if alt else src
    if src.startswith("http://") or src.startswith("https://"):
        warn(f"image not rendered: {label} -- remote sources are not fetched")
        return None
    img_path = Path(src)
    if not img_path.is_absolute() and (base_dir / src).exists():
        img_path = base_dir / src
    if not img_path.exists():
        warn(f"image not rendered: {label} -- file not found")
        return None
    try:
        img = Image(str(img_path))
        iw, ih = img.drawWidth, img.drawHeight
        if iw > available_width:
            ratio = available_width / iw
            img.drawWidth = available_width
            img.drawHeight = ih * ratio
        return img
    except Exception as exc:
        warn(f"image not rendered: {label} -- {exc}")
        return None


# --- Reportlab engine -- numbered canvas ---

def _make_numbered_canvas_class(font_name: str, footer_fmt: str, page_width: float):
    """Create a NumberedCanvas class bound to the given font, format string and page width."""
    from reportlab.lib import colors as rlc
    from reportlab.pdfgen.canvas import Canvas

    class NumberedCanvas(Canvas):
        def __init__(self, *args, **kwargs):
            Canvas.__init__(self, *args, **kwargs)
            self._saved_page_states = []

        def showPage(self):
            self._saved_page_states.append(dict(self.__dict__))
            # Private Canvas members, present at runtime but absent from the stub.
            self._startPage()  # pyright: ignore[reportAttributeAccessIssue]

        def save(self):
            num_pages = len(self._saved_page_states)
            for state in self._saved_page_states:
                self.__dict__.update(state)
                self._draw_footer(num_pages)
                Canvas.showPage(self)
            Canvas.save(self)

        def _draw_footer(self, page_count):
            self.saveState()
            fn = font_name if font_name != "Helvetica" else "Helvetica"
            self.setFont(fn, 8)
            self.setFillColor(rlc.HexColor("#888888"))
            text = footer_fmt.format(
                page=self._pageNumber,  # pyright: ignore[reportAttributeAccessIssue] -- runtime-only Canvas member
                total=page_count,
            )
            self.drawCentredString(page_width / 2, 25, text)
            self.restoreState()

    return NumberedCanvas


# --- Reportlab engine -- markdown to story (flowables) ---

def md_to_story(md_text: str, styles, font_info: dict, clr: dict,
                available_width: float, base_dir: Path) -> list:
    """Parse markdown text and return a list of reportlab flowables."""
    from reportlab.lib import colors as rlc
    from reportlab.platypus import Paragraph, Spacer
    from reportlab.platypus.flowables import HRFlowable

    lines = md_text.split("\n")
    story = []
    i = 0

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if not stripped:
            i += 1
            continue

        # Fenced code block
        if stripped.startswith("```"):
            code_lines = []
            i += 1
            while i < len(lines):
                if lines[i].strip().startswith("```"):
                    i += 1
                    break
                code_lines.append(lines[i].rstrip())
                i += 1
            story.append(build_code_block("\n".join(code_lines), styles, clr, available_width))
            story.append(Spacer(1, 4))
            continue

        # Image ![alt](path)
        img_match = re.match(r"^!\[([^\]]*)\]\(([^)]+)\)$", stripped)
        if img_match:
            alt, src = img_match.group(1), img_match.group(2)
            img = _try_build_image(alt, src, available_width, base_dir)
            if img:
                story.append(Spacer(1, 4))
                story.append(img)
                story.append(Spacer(1, 4))
            i += 1
            continue

        # Horizontal rule
        if stripped in ("---", "***", "___"):
            story.append(Spacer(1, 4))
            story.append(HRFlowable(
                width="100%", thickness=0.5,
                color=rlc.HexColor("#cccccc"), spaceAfter=4, spaceBefore=4,
            ))
            i += 1
            continue

        # H1
        if stripped.startswith("# ") and not stripped.startswith("## "):
            story.append(Spacer(1, 20))
            story.append(Paragraph(safe_xml(stripped[2:].strip()), styles["H1"]))
            i += 1
            continue

        # H2
        if stripped.startswith("## ") and not stripped.startswith("### "):
            story.append(Paragraph(safe_xml(stripped[3:].strip()), styles["H2"]))
            story.append(HRFlowable(
                width="100%", thickness=0.8,
                color=clr["primary"], spaceAfter=6, spaceBefore=1,
            ))
            i += 1
            continue

        # H3
        if stripped.startswith("### ") and not stripped.startswith("#### "):
            story.append(Paragraph(safe_xml(stripped[4:].strip()), styles["H3"]))
            i += 1
            continue

        # H4
        if stripped.startswith("#### "):
            story.append(Paragraph(safe_xml(stripped[5:].strip()), styles["H4"]))
            i += 1
            continue

        # Blockquote
        if stripped.startswith("> ") or stripped == ">":
            quote_lines = []
            while i < len(lines):
                s = lines[i].strip()
                if s.startswith("> "):
                    quote_lines.append(s[2:])
                elif s == ">":
                    quote_lines.append("")
                else:
                    break
                i += 1
            story.append(build_blockquote(" ".join(quote_lines), styles, clr, available_width))
            story.append(Spacer(1, 4))
            continue

        # Table
        if stripped.startswith("|"):
            table_lines = []
            while i < len(lines):
                s = lines[i].strip()
                if s.startswith("|"):
                    table_lines.append(s)
                    i += 1
                else:
                    break
            rows = parse_md_table(table_lines)
            if rows:
                t = build_table(rows, styles, font_info, clr, available_width)
                if t:
                    story.append(t)
                    story.append(Spacer(1, 6))
            continue

        # Checkbox items
        if stripped.startswith("- [ ] ") or stripped.startswith("- [x] ") or stripped.startswith("- [X] "):
            text = stripped[6:].strip()
            marker = "\u2610 " if stripped.startswith("- [ ]") else "\u2611 "
            story.append(Paragraph(marker + safe_xml(text), styles["BulletItem"]))
            i += 1
            continue

        # Numbered list
        m_num = re.match(r"^(\d+)\.\s+(.+)$", stripped)
        if m_num:
            story.append(Paragraph(
                f"<b>{m_num.group(1)}.</b> " + safe_xml(m_num.group(2)),
                styles["NumberedItem"],
            ))
            i += 1
            continue

        # Bullet list
        if stripped.startswith("- ") or stripped.startswith("* "):
            story.append(Paragraph(
                "\u2022 " + safe_xml(stripped[2:].strip()),
                styles["BulletItem"],
            ))
            i += 1
            continue

        # Bold-colon lines (**Label:** value) -- render with bold styling
        if stripped.startswith("**") and ":" in stripped:
            text = safe_xml(stripped)
            story.append(Paragraph(text, styles["Normal"]))
            i += 1
            continue

        # Plain text
        story.append(Paragraph(safe_xml(stripped), styles["Normal"]))
        i += 1

    return story


# --- Reportlab engine -- document builder ---

def build_document(output_path: str, config: dict):
    from reportlab.lib import pagesizes
    from reportlab.lib.units import mm
    from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate

    page_size = getattr(pagesizes, _page_size_name(config).upper())
    page_width, page_height = page_size
    margins = config.get("page", {}).get("margins", {})
    left = margins.get("left", 25) * mm
    right = margins.get("right", 20) * mm
    top = margins.get("top", 25) * mm
    bottom = margins.get("bottom", 25) * mm

    doc = BaseDocTemplate(
        output_path, pagesize=page_size,
        leftMargin=left, rightMargin=right,
        topMargin=top, bottomMargin=bottom,
    )

    frame = Frame(
        left, bottom,
        page_width - left - right,
        page_height - top - bottom,
        id="main_frame",
    )

    page_template = PageTemplate(
        id="main", frames=[frame],
        # reportlab calls onPage(canvas, doc); both parameters are mandatory even unused.
        onPage=lambda canvas, doc: None,  # noqa: ARG005
    )
    doc.addPageTemplates([page_template])

    available_width = page_width - left - right
    return doc, available_width, page_width


# --- Reportlab engine -- main conversion ---

def convert_reportlab(input_path: str, output_path: str, config: dict):
    """Convert MD -> PDF via reportlab."""
    try:
        import_module("reportlab.platypus")  # availability probe; the builders do their own imports
    except ImportError:
        print_failure(f"reportlab is not installed.\n"
                      f"Install with: bash {SCRIPT_DIR}/check_deps.sh install reportlab")
        sys.exit(1)

    font_info = detect_fonts()
    register_detected_fonts(font_info)

    clr = _rl_colors(config)
    styles = build_styles(font_info, config)
    doc, available_width, page_width = build_document(output_path, config)

    md_text = Path(input_path).read_text(encoding="utf-8")
    story = md_to_story(md_text, styles, font_info, clr, available_width,
                        Path(input_path).resolve().parent)

    footer_cfg = config.get("footer", {})
    footer_fmt = footer_cfg.get("format", "Page {page} of {total}")
    canvas_cls = _make_numbered_canvas_class(font_info["body"], footer_fmt, page_width)

    if footer_cfg.get("enabled", True):
        doc.build(story, canvasmaker=canvas_cls)
    else:
        doc.build(story)

    page_count = canvas_cls.__dict__.get("_page_count", 0)
    # Fallback: read page count from built doc
    if page_count == 0:
        try:
            page_count = doc.page
        except Exception:
            page_count = 0

    print_status(output_path, page_count, "reportlab")


# --- Main ---

def main():
    args = parse_args()

    if not os.path.isfile(args.input):
        print_failure(f"File not found: {args.input}")
        sys.exit(1)

    config = load_config(args.config)

    try:
        if args.engine == "weasyprint":
            convert_weasyprint(args.input, args.output, config,
                               css_path=args.style,
                               pygments_theme=args.pygments_theme)
        else:
            convert_reportlab(args.input, args.output, config)
    except Exception as exc:
        print_failure(str(exc))
        sys.exit(1)


if __name__ == "__main__":
    main()
