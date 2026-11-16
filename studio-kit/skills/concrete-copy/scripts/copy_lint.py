#!/usr/bin/env python3
"""Lint the visible copy of built HTML pages for AI tells, filler and leftovers.

  python3 copy_lint.py dist/index.html
  python3 copy_lint.py dist/                 # every .html file in the folder
  python3 copy_lint.py http://localhost:5173

Reads visible text only (skips script, style, svg, template, noscript, [hidden], [aria-hidden=true]),
plus <title> and the meta description. FAIL = must fix, WARN = judge it. Exit 1 when any FAIL.
Standard library only (Python 3.8+). Brand devices the client chose may stay: judge, do not obey blindly.
"""
import argparse
import html.parser
import os
import re
import sys
import urllib.request

BANNED_WORDS = [
    "leverage", "leveraging", "seamless", "seamlessly", "empower", "empowering", "unlock", "unlocking",
    "elevate", "elevating", "robust", "actionable", "data-driven", "cutting-edge", "game-changer", "game changer",
    "synergy", "synergies", "delve", "tapestry", "testament", "realm", "world-class",
    "state-of-the-art", "revolutionize", "revolutionise", "next-level", "unparalleled", "best-in-class",
]
SOFT_WORDS = ["journey", "curated", "bespoke", "solutions", "landscape", "innovative", "passion"]
SHAPES = [
    ("'not just X, it's Y' shape", r"\bnot (?:just|only|merely) (?:a |an |the )?[\w\s'-]{1,40}[,;:]\s*(?:it's|it is|but)\b"),
    ("'whether you're A or B' shape", r"\bwhether you(?:'re| are)\b"),
    ("false range 'from X to Y'", r"\bfrom (?:startups|beginners|small businesses|individuals|freelancers) to (?:enterprises|experts|large|global|corporations)\b"),
    ("vague attribution", r"\b(?:experts|studies|research) (?:agree|say|show)s?\b"),
    ("'harness' used as a verb", r"\bharness(?:es|ing)? (?:the|your|its|our|their|this|that)\b"),
]
PLACEHOLDERS = r"\blorem ipsum\b|\bTODO\b|\bTBD\b|\bFIXME\b|\[placeholder\]|\bXXX\b|\binsert (?:text|copy) here\b"
VAGUE_CTA = {"learn more", "discover", "discover more", "submit", "click here", "read more", "explore", "more", "go", "send"}
SKIP_TAGS = {"script", "style", "svg", "template", "noscript", "head"}
BLOCK_TAGS = {"p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "td", "th", "button", "a", "label", "figcaption",
              "blockquote", "dt", "dd", "summary", "div", "section", "header", "footer", "span", "small", "strong", "em"}
VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}


class TextGrab(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []        # (tag, hidden)
        self.blocks = []       # (tag, text)
        self.buf = []
        self.title = ""
        self.meta_desc = ""
        self.in_title = False

    def _hidden(self):
        return any(h for _, h in self.stack)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "meta" and (a.get("name") or "").lower() == "description":
            self.meta_desc = a.get("content") or ""
        if tag == "title":
            self.in_title = True
        if tag in VOID_TAGS:
            return
        hidden = tag in SKIP_TAGS or "hidden" in a or (a.get("aria-hidden") or "").lower() == "true"
        if tag in BLOCK_TAGS:
            self._flush()
        self.stack.append((tag, hidden))

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False
        if tag in VOID_TAGS:
            return
        if tag in BLOCK_TAGS:
            self._flush(tag)
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        if self.in_title:
            self.title += data
            return
        if not self._hidden():
            self.buf.append(data)

    def _flush(self, tag=None):
        text = re.sub(r"\s+", " ", "".join(self.buf)).strip()
        self.buf = []
        if text:
            current = tag or (self.stack[-1][0] if self.stack else "body")
            self.blocks.append((current, text))


def load(target):
    if re.match(r"^https?://", target):
        req = urllib.request.Request(target, headers={"User-Agent": "studio-kit-copy-lint/1.0"})
        with urllib.request.urlopen(req, timeout=20) as r:
            return [(target, r.read().decode("utf-8", "replace"))]
    if os.path.isdir(target):
        out = []
        for dp, dn, fns in os.walk(target):
            dn[:] = [d for d in dn if d not in ("node_modules", ".git")]
            for fn in sorted(fns):
                if fn.endswith((".html", ".htm")):
                    with open(os.path.join(dp, fn), encoding="utf-8", errors="replace") as fh:
                        out.append((os.path.relpath(os.path.join(dp, fn), target), fh.read()))
        return out
    with open(target, encoding="utf-8", errors="replace") as fh:
        return [(target, fh.read())]


def lint(html_text):
    g = TextGrab()
    g.feed(html_text)
    g._flush()
    items = [("title", g.title.strip()), ("meta description", g.meta_desc.strip())] + g.blocks
    fails, warns = [], []
    for tag, text in items:
        if not text:
            continue
        low = text.lower()
        snippet = text if len(text) <= 90 else text[:87] + "..."
        for w in BANNED_WORDS:
            if re.search(r"(?<![\w-])" + re.escape(w) + r"(?![\w-])", low):
                fails.append("AI-tell word '%s' in <%s>: %s" % (w, tag, snippet))
        for w in SOFT_WORDS:
            if re.search(r"\b" + re.escape(w) + r"\b", low):
                warns.append("soft word '%s' (keep only if literal) in <%s>: %s" % (w, tag, snippet))
        for label, pattern in SHAPES:
            if re.search(pattern, low):
                fails.append("%s in <%s>: %s" % (label, tag, snippet))
        if "—" in text:
            fails.append("em dash in <%s>: %s" % (tag, snippet))
        if re.search(PLACEHOLDERS, text, re.I):
            fails.append("placeholder left in <%s>: %s" % (tag, snippet))
        if tag in ("button", "a") and low.strip(" .>→") in VAGUE_CTA:
            warns.append("vague button/link text '%s' (use verb + object)" % text)
        if "!" in text and tag not in ("title",):
            warns.append("exclamation mark in <%s>: %s" % (tag, snippet))
        for sentence in re.split(r"(?<=[.!?])\s+", text):
            n = len(sentence.split())
            if n > 25 and tag in ("p", "h1", "h2", "h3", "li", "figcaption", "span", "div"):
                warns.append("long sentence (%d words) in <%s>: %s" % (n, tag, sentence[:87] + "..."))
        if tag in ("h1", "h2", "h3"):
            words = [w for w in re.findall(r"[A-Za-z][\w'-]*", text) if len(w) > 3]
            if len(words) >= 4 and all(w[0].isupper() for w in words):
                warns.append("Title Case headline in <%s>: %s" % (tag, snippet))
    return fails, warns, len(items)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("target", help="HTML file, folder, or http(s) URL")
    a = ap.parse_args(argv)
    total_fail = 0
    for name, text in load(a.target):
        fails, warns, n = lint(text)
        total_fail += len(fails)
        print("== %s  (%d text blocks)  FAIL %d  WARN %d" % (name, n, len(fails), len(warns)))
        for f in fails:
            print("  FAIL " + f)
        for w in warns:
            print("  WARN " + w)
    print("RESULT: %s" % ("FAIL" if total_fail else "PASS"))
    return 1 if total_fail else 0


if __name__ == "__main__":
    sys.exit(main())
