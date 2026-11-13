#!/usr/bin/env python3
"""launch_qa.py - render a page for real and report what is broken before launch.

Usage:
    python3 launch_qa.py <url-or-local-dir> [--out DIR] [--max-links 50] [--timeout 45]

A local directory is served on a free localhost port (index.html is the entry
page). The page is loaded at 390x844 (phone), 768x1024 (tablet) and 1440x900
(desktop), scrolled slowly to the bottom so lazy content mounts, screenshotted
full-page, and checked. Writes report.md, report.json and screenshots/ into the
output directory. Exit code: 0 = no FAIL, 1 = at least one FAIL, 2 = setup error.

Requires Python 3.9+ and Playwright:
    python3 -m pip install --user playwright && python3 -m playwright install chromium
"""

import argparse
import datetime as _dt
import functools
import http.server
import json
import os
import re
import sys
import threading
import time
from urllib.parse import urldefrag, urljoin, urlparse

VERSION = "1.0.0"

INSTALL_HINT = (
    "Playwright for Python is not installed.\n"
    "Install it with:\n"
    "    python3 -m pip install --user playwright\n"
    "    python3 -m playwright install chromium\n"
)

VIEWPORTS = [
    # name, width, height, is_mobile
    ("mobile", 390, 844, True),
    ("tablet", 768, 1024, False),
    ("desktop", 1440, 900, False),
]

LOCAL_HOSTS = ("localhost", "127.0.0.1", "::1", "[::1]")

# --------------------------------------------------------------------------
# In-page scripts
# --------------------------------------------------------------------------

SCROLL_JS = """
async ({pause, maxSteps}) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const docH = () => Math.max(document.documentElement.scrollHeight,
                              document.body ? document.body.scrollHeight : 0);
  let stuck = 0, n = 0;
  while (n < maxSteps) {
    const y = window.scrollY;
    if (y + window.innerHeight >= docH() - 2) break;
    window.scrollBy({top: Math.round(window.innerHeight * 0.6), left: 0, behavior: 'instant'});
    await sleep(pause);
    if (window.scrollY <= y) { if (++stuck >= 5) break; } else { stuck = 0; }
    n++;
  }
  await sleep(400);
  return {steps: n, height: docH(), reachedY: window.scrollY};
}
"""

# Shared helpers injected into every check script.
HELPERS_JS = """
const __short = (el) => {
  if (!el || el.nodeType !== 1) return '';
  let s = el.tagName.toLowerCase();
  if (el.id) return s + '#' + el.id;
  const raw = typeof el.className === 'string' ? el.className
            : (el.className && el.className.baseVal) || '';
  const cls = raw.trim().split(/\\s+/).filter(Boolean).slice(0, 2);
  if (cls.length) s += '.' + cls.join('.');
  const p = el.parentElement;
  if (p) {
    const same = Array.from(p.children).filter((c) => c.tagName === el.tagName);
    if (same.length > 1) s += ':nth-of-type(' + (same.indexOf(el) + 1) + ')';
  }
  return s;
};
const __path = (el) => {
  const parts = [];
  let cur = el;
  while (cur && cur.nodeType === 1 && parts.length < 3) {
    parts.unshift(__short(cur));
    if (cur.id || cur === document.body) break;
    cur = cur.parentElement;
  }
  return parts.join(' > ');
};
const __visible = (el) => {
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return false;
  const r = el.getBoundingClientRect();
  return r.width > 2 && r.height > 2;
};
"""

OVERFLOW_JS = "() => {" + HELPERS_JS + """
  const de = document.documentElement;
  const cw = de.clientWidth;
  const sw = Math.max(de.scrollWidth, document.body ? document.body.scrollWidth : 0);
  const sx = window.scrollX;
  const fixedCache = new Map();
  const inFixed = (el) => {
    const chain = [];
    let cur = el, res = false;
    while (cur && cur !== document.body && cur !== de) {
      if (fixedCache.has(cur)) { res = fixedCache.get(cur); break; }
      chain.push(cur);
      if (getComputedStyle(cur).position === 'fixed') { res = true; break; }
      cur = cur.parentElement;
    }
    chain.forEach((c) => fixedCache.set(c, res));
    return res;
  };
  // An ancestor (below body) that clips or scrolls horizontally and itself sits
  // inside the viewport contains the overflow: it does not widen the page.
  const contained = (el) => {
    let cur = el.parentElement;
    while (cur && cur !== document.body && cur !== de) {
      const ox = getComputedStyle(cur).overflowX;
      if (ox !== 'visible') {
        const r = cur.getBoundingClientRect();
        if (r.right + sx <= cw + 1) return true;
      }
      cur = cur.parentElement;
    }
    return false;
  };
  const nodes = document.body ? Array.from(document.body.querySelectorAll('*')).slice(0, 8000) : [];
  const offenders = new Set();
  const info = [];
  for (const el of nodes) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const right = r.right + sx;
    if (right <= cw + 1) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none') continue;
    if (inFixed(el) || contained(el)) continue;
    offenders.add(el);
    info.push({el, right: Math.round(right), width: Math.round(r.width)});
  }
  const roots = info.filter((o) => !offenders.has(o.el.parentElement));
  roots.sort((a, b) => b.right - a.right);
  return {
    clientWidth: cw,
    scrollWidth: sw,
    overflowPx: sw - cw,
    offenderCount: offenders.size,
    offenders: roots.slice(0, 5).map((o) => ({
      selector: __path(o.el), rightEdge: o.right, width: o.width, overflowBy: o.right - cw
    })),
  };
}"""

DOM_JS = "() => {" + HELPERS_JS + """
  const meta = (sel) => {
    const m = document.querySelector(sel);
    return m ? (m.getAttribute('content') || '').trim() : null;
  };
  const imgs = Array.from(document.images);
  const noAlt = imgs.filter((im) => !im.hasAttribute('alt')
      && im.getAttribute('aria-hidden') !== 'true'
      && !['presentation', 'none'].includes((im.getAttribute('role') || '').toLowerCase()));
  const h1s = Array.from(document.querySelectorAll('h1'));
  const links = Array.from(document.querySelectorAll('a[href]')).map((a) => a.href);
  return {
    title: document.title || '',
    description: meta('meta[name="description" i]'),
    ogTitle: meta('meta[property="og:title"]') || meta('meta[name="og:title"]'),
    ogImage: meta('meta[property="og:image"]') || meta('meta[name="og:image"]'),
    viewport: meta('meta[name="viewport" i]'),
    lang: (document.documentElement.getAttribute('lang') || '').trim(),
    h1Total: h1s.length,
    h1Visible: h1s.filter(__visible).length,
    h1Texts: h1s.slice(0, 5).map((h) => (h.textContent || '').trim().slice(0, 80)),
    imgTotal: imgs.length,
    imgNoAlt: noAlt.slice(0, 20).map((im) => ({
      selector: __path(im), src: (im.currentSrc || im.src || '').slice(0, 160)
    })),
    imgNoAltCount: noAlt.length,
    links: links,
  };
}"""

MOBILE_JS = "() => {" + HELPERS_JS + """
  const scale = window.visualViewport ? window.visualViewport.scale : 1;
  const layoutWidth = window.innerWidth;
  // Small text: visible text nodes whose rendered size is under 12 px.
  const small = new Map();
  const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
  const skip = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'OPTION']);
  let textEls = 0;
  const seen = new Set();
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const txt = node.nodeValue.trim();
    if (!txt) continue;
    const el = node.parentElement;
    if (!el || skip.has(el.tagName) || seen.has(el)) continue;
    seen.add(el);
    const range = document.createRange();
    range.selectNodeContents(node);
    const r = range.getBoundingClientRect();
    if (r.width <= 2 || r.height <= 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility !== 'visible' || parseFloat(cs.opacity) === 0) continue;
    textEls++;
    const px = parseFloat(cs.fontSize) * scale;
    if (px < 12) small.set(el, {selector: __path(el), px: Math.round(px * 10) / 10, text: txt.slice(0, 60)});
  }
  // Tap targets under 40 px. Inline links inside running text are exempt: the
  // link must sit next to plain text in the same line box ("Read <a>this</a> first").
  const plainInline = (n) => {
    if (!n) return false;
    if (n.nodeType === 3) return n.nodeValue.trim().length > 0;
    if (n.nodeType !== 1 || ['A', 'BUTTON', 'BR', 'INPUT', 'SELECT'].includes(n.tagName)) return false;
    return getComputedStyle(n).display.startsWith('inline') && (n.textContent || '').trim().length > 0;
  };
  const sibling = (el, dir) => {
    let n = dir < 0 ? el.previousSibling : el.nextSibling;
    while (n && n.nodeType === 3 && !n.nodeValue.trim()) n = dir < 0 ? n.previousSibling : n.nextSibling;
    return n;
  };
  const inSentence = (el) => plainInline(sibling(el, -1)) || plainInline(sibling(el, 1));
  const sel = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"]';
  const targets = Array.from(document.querySelectorAll(sel));
  const smallTargets = [];
  let counted = 0;
  for (const el of targets) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility !== 'visible') continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 2 || r.height <= 2) continue;
    if (el.tagName === 'A' && cs.display === 'inline' && inSentence(el)) continue;
    counted++;
    const w = r.width * scale, h = r.height * scale;
    if (w < 40 || h < 40) {
      smallTargets.push({
        selector: __path(el), w: Math.round(w), h: Math.round(h),
        text: ((el.textContent || el.getAttribute('aria-label') || el.value || '') + '').trim().slice(0, 40)
      });
    }
  }
  return {
    scale: scale, layoutWidth: layoutWidth,
    textElements: textEls, smallText: Array.from(small.values()),
    tapTargets: counted, smallTargets: smallTargets,
  };
}"""

# --------------------------------------------------------------------------
# Local server
# --------------------------------------------------------------------------


class _QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):  # silence per-request logging
        pass


def serve_directory(path):
    handler = functools.partial(_QuietHandler, directory=path)
    # The default listen backlog (5) drops bursts of parallel requests, e.g. a scroll-scrub
    # section preloading 100 frames: a big backlog keeps the local preview honest.
    server_cls = type("BurstSafeServer", (http.server.ThreadingHTTPServer,), {"request_queue_size": 256, "daemon_threads": True})
    server = server_cls(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, "http://127.0.0.1:%d/" % server.server_address[1]


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------


def slugify(text):
    text = re.sub(r"^https?://", "", text)
    text = re.sub(r"[^A-Za-z0-9]+", "-", text).strip("-").lower()
    return (text or "site")[:40]


def is_local(url):
    host = (urlparse(url).hostname or "").lower()
    return host in LOCAL_HOSTS or host.endswith(".localhost") or host.endswith(".test")


class Check:
    def __init__(self, cid, label):
        self.id = cid
        self.label = label
        self.status = "PASS"
        self.summary = ""
        self.details = []

    def set(self, status, summary):
        order = {"PASS": 0, "WARN": 1, "FAIL": 2}
        if order[status] >= order[self.status]:
            self.status = status
        self.summary = summary

    def as_dict(self):
        return {"id": self.id, "label": self.label, "status": self.status,
                "summary": self.summary, "details": self.details}


# --------------------------------------------------------------------------
# Main run
# --------------------------------------------------------------------------


def run(target, out_dir, max_links, timeout_s):
    try:
        from playwright.sync_api import sync_playwright
        from playwright.sync_api import Error as PWError
    except ImportError:
        sys.stderr.write(INSTALL_HINT)
        return 2

    server = None
    if os.path.isdir(target):
        root = os.path.abspath(target)
        if not os.path.exists(os.path.join(root, "index.html")):
            sys.stderr.write("No index.html in %s\n" % root)
            return 2
        server, url = serve_directory(root)
        source = "local directory %s (served at %s)" % (root, url)
    elif re.match(r"^https?://", target):
        url = target
        source = url
    else:
        sys.stderr.write("Target must be an http(s) URL or an existing directory: %s\n" % target)
        return 2

    shots_dir = os.path.join(out_dir, "screenshots")
    os.makedirs(shots_dir, exist_ok=True)

    checks = {}
    for cid, label in [
        ("page-load", "Page loads (HTTP status)"),
        ("console-errors", "Console errors / uncaught exceptions"),
        ("failed-requests", "Failed requests (4xx/5xx/blocked)"),
        ("horizontal-overflow", "Horizontal overflow"),
        ("title", "<title>"),
        ("meta-description", "Meta description"),
        ("og-tags", "og:title / og:image"),
        ("lang", "<html lang>"),
        ("h1", "Exactly one <h1>"),
        ("img-alt", "Images have alt"),
        ("meta-viewport", "Meta viewport"),
        ("small-text-mobile", "Text >= 12px on mobile"),
        ("tap-targets-mobile", "Tap targets >= 40px on mobile"),
        ("internal-links", "Same-origin links resolve"),
    ]:
        checks[cid] = Check(cid, label)

    console_errors = {}   # text -> set(viewports)
    failed = {}           # (url, reason) -> set(viewports)
    aborted = {}
    per_vp = []
    dom = None
    mobile = None
    final_url = url
    load_error = None
    browser_version = ""

    try:
        with sync_playwright() as p:
            try:
                browser = p.chromium.launch()
            except PWError as exc:
                sys.stderr.write("Could not launch Chromium: %s\n%s" % (exc, INSTALL_HINT))
                return 2
            browser_version = browser.version
            for name, w, h, is_mobile in VIEWPORTS:
                ctx = browser.new_context(
                    viewport={"width": w, "height": h},
                    device_scale_factor=1,
                    is_mobile=is_mobile,
                    has_touch=is_mobile,
                    ignore_https_errors=False,
                )
                page = ctx.new_page()
                vp = {"name": name, "size": "%dx%d" % (w, h)}

                def on_console(msg, _name=name):
                    if msg.type != "error":
                        return
                    text = msg.text.strip()
                    if text.startswith("Failed to load resource"):
                        return  # reported (with its URL) under failed-requests
                    console_errors.setdefault(text[:300], set()).add(_name)

                def on_pageerror(err, _name=name):
                    kind = getattr(err, "name", "") or "Error"
                    msg = getattr(err, "message", "") or str(err)
                    console_errors.setdefault(("Uncaught %s: %s" % (kind, msg))[:300], set()).add(_name)

                def on_response(resp, _name=name):
                    if resp.status >= 400:
                        key = (resp.url[:300], "HTTP %d" % resp.status)
                        failed.setdefault(key, set()).add(_name)

                def on_requestfailed(req, _name=name):
                    reason = req.failure or "failed"
                    key = (req.url[:300], reason)
                    if "ERR_ABORTED" in reason:
                        aborted.setdefault(key, set()).add(_name)
                    else:
                        failed.setdefault(key, set()).add(_name)

                page.on("console", on_console)
                page.on("pageerror", on_pageerror)
                page.on("response", on_response)
                page.on("requestfailed", on_requestfailed)

                t0 = time.time()
                try:
                    resp = page.goto(url, wait_until="load", timeout=timeout_s * 1000)
                except PWError as exc:
                    load_error = str(exc).splitlines()[0]
                    ctx.close()
                    break
                vp["loadMs"] = int((time.time() - t0) * 1000)
                status = resp.status if resp else 0
                vp["status"] = status
                final_url = page.url
                if status >= 400:
                    load_error = "HTTP %d for %s" % (status, final_url)
                try:
                    page.wait_for_load_state("networkidle", timeout=5000)
                except PWError:
                    pass
                scroll = page.evaluate(SCROLL_JS, {"pause": 140, "maxSteps": 250})
                try:
                    page.wait_for_load_state("networkidle", timeout=4000)
                except PWError:
                    pass
                vp["pageHeight"] = scroll["height"]
                vp["scrollSteps"] = scroll["steps"]
                vp["overflow"] = page.evaluate(OVERFLOW_JS)
                page.evaluate("window.scrollTo({top: 0, left: 0, behavior: 'instant'})")
                page.wait_for_timeout(500)
                shot = os.path.join(shots_dir, "%s-%dx%d.png" % (name, w, h))
                try:
                    page.screenshot(path=shot, full_page=True, timeout=60000)
                    vp["screenshot"] = os.path.relpath(shot, out_dir)
                except PWError as exc:
                    vp["screenshot"] = None
                    vp["screenshotError"] = str(exc).splitlines()[0]
                if name == "mobile":
                    mobile = page.evaluate(MOBILE_JS)
                if name == "desktop":
                    dom = page.evaluate(DOM_JS)
                    links = collect_links(dom["links"], final_url)
                    vp["links"] = check_links(ctx, links, max_links, timeout_s)
                per_vp.append(vp)
                ctx.close()
            browser.close()
    finally:
        if server:
            server.shutdown()

    # ---------------- evaluate ----------------
    c = checks
    if load_error:
        c["page-load"].set("FAIL", load_error)
    else:
        c["page-load"].set("PASS", "HTTP %s, load %s ms (desktop)" % (
            per_vp[-1].get("status"), per_vp[-1].get("loadMs")))

    if load_error and not dom:
        for cid, chk in c.items():
            if cid != "page-load":
                chk.status = "SKIP"
                chk.summary = "not run: page did not load"
        return finish(out_dir, url, final_url, source, browser_version, c, per_vp,
                      console_errors, failed, aborted, dom, mobile)

    if console_errors:
        c["console-errors"].set("FAIL", "%d distinct error(s)" % len(console_errors))
        for text, vps in sorted(console_errors.items()):
            c["console-errors"].details.append("[%s] %s" % (",".join(sorted(vps)), text))
    else:
        c["console-errors"].set("PASS", "0 errors across 3 viewports")

    if failed:
        c["failed-requests"].set("FAIL", "%d failed request(s)" % len(failed))
        host = urlparse(final_url).netloc
        for (u, reason), vps in sorted(failed.items()):
            tag = "" if urlparse(u).netloc == host else " (third-party)"
            c["failed-requests"].details.append("%s  %s%s  [%s]" % (reason, u, tag, ",".join(sorted(vps))))
    elif aborted:
        c["failed-requests"].set("WARN", "0 failed, %d aborted (often media preload; check)" % len(aborted))
    else:
        c["failed-requests"].set("PASS", "0 failed requests")
    for (u, reason), vps in sorted(aborted.items()):
        c["failed-requests"].details.append("aborted: %s  %s  [%s]" % (reason, u, ",".join(sorted(vps))))

    worst = None
    for vp in per_vp:
        ov = vp.get("overflow") or {}
        if ov.get("overflowPx", 0) > 0:
            if worst is None or ov["overflowPx"] > worst[1]:
                worst = (vp["name"], ov["overflowPx"])
            offs = ", ".join("`%s` (right edge %dpx, +%dpx)" % (o["selector"], o["rightEdge"], o["overflowBy"])
                             for o in ov.get("offenders", [])) or "no single offender found"
            c["horizontal-overflow"].details.append(
                "%s %s: scrollWidth %d > clientWidth %d (+%dpx). Widest offenders: %s" % (
                    vp["name"], vp["size"], ov["scrollWidth"], ov["clientWidth"], ov["overflowPx"], offs))
        elif ov.get("offenderCount", 0) > 0:
            offs = ", ".join("`%s` (+%dpx)" % (o["selector"], o["overflowBy"]) for o in ov.get("offenders", []))
            c["horizontal-overflow"].details.append(
                "%s %s: no page scroll, but %d element(s) extend past the viewport and are hidden by "
                "overflow on html/body (iOS can still pan): %s" % (vp["name"], vp["size"], ov["offenderCount"], offs))
    if worst:
        c["horizontal-overflow"].set("FAIL", "page scrolls sideways (worst: %s, +%dpx)" % worst)
    elif c["horizontal-overflow"].details:
        c["horizontal-overflow"].set("WARN", "overflow masked by html/body overflow")
    else:
        c["horizontal-overflow"].set("PASS", "scrollWidth == clientWidth at 390/768/1440")

    title = (dom["title"] or "").strip()
    if not title:
        c["title"].set("FAIL", "missing or empty")
    elif len(title) > 60:
        c["title"].set("WARN", "%d chars (search results cut around 60): %s" % (len(title), title))
    else:
        c["title"].set("PASS", "%d chars: %s" % (len(title), title))

    desc = dom["description"]
    if not desc:
        c["meta-description"].set("WARN", "missing")
    elif len(desc) < 50 or len(desc) > 160:
        c["meta-description"].set("WARN", "%d chars (aim for 50-160)" % len(desc))
    else:
        c["meta-description"].set("PASS", "%d chars" % len(desc))

    missing = [n for n, v in (("og:title", dom["ogTitle"]), ("og:image", dom["ogImage"])) if not v]
    if missing:
        c["og-tags"].set("WARN", "missing " + ", ".join(missing))
    else:
        og = dom["ogImage"]
        if not re.match(r"^https?://", og):
            if is_local(final_url):
                c["og-tags"].set("PASS", "present; og:image is relative (%s): fine for a local preview, "
                                         "must be absolute on the live URL" % og)
            else:
                c["og-tags"].set("WARN", "og:image is relative (%s): social crawlers need an absolute URL" % og)
        else:
            c["og-tags"].set("PASS", "present")

    if dom["lang"]:
        c["lang"].set("PASS", 'lang="%s"' % dom["lang"])
    else:
        c["lang"].set("FAIL", "missing lang attribute on <html>")

    n_h1 = dom["h1Total"]
    if n_h1 == 0:
        c["h1"].set("FAIL", "no <h1>")
    elif n_h1 > 1:
        c["h1"].set("WARN", "%d <h1> elements: %s" % (n_h1, " | ".join(dom["h1Texts"])))
    elif dom["h1Visible"] == 0:
        c["h1"].set("WARN", "one <h1> but it is not visible")
    else:
        c["h1"].set("PASS", "1 <h1>: %s" % dom["h1Texts"][0])

    if dom["imgNoAltCount"]:
        c["img-alt"].set("FAIL", "%d of %d <img> without alt attribute" % (dom["imgNoAltCount"], dom["imgTotal"]))
        for im in dom["imgNoAlt"]:
            c["img-alt"].details.append("`%s` src=%s" % (im["selector"], im["src"]))
    else:
        c["img-alt"].set("PASS", "%d <img>, all with alt" % dom["imgTotal"])

    vpm = dom["viewport"] or ""
    if "width=device-width" in vpm.replace(" ", ""):
        c["meta-viewport"].set("PASS", vpm)
    elif vpm:
        c["meta-viewport"].set("WARN", "present but without width=device-width: %s" % vpm)
    else:
        c["meta-viewport"].set("FAIL", "missing: phones render the desktop layout zoomed out")

    if mobile:
        st = mobile["smallText"]
        if st:
            c["small-text-mobile"].set("WARN", "%d of %d text elements under 12px" % (len(st), mobile["textElements"]))
            for s in st[:12]:
                c["small-text-mobile"].details.append("%spx `%s` \"%s\"" % (s["px"], s["selector"], s["text"]))
        else:
            c["small-text-mobile"].set("PASS", "%d text elements, none under 12px" % mobile["textElements"])
        tt = mobile["smallTargets"]
        if tt:
            c["tap-targets-mobile"].set("WARN", "%d of %d targets under 40px" % (len(tt), mobile["tapTargets"]))
            for t in tt[:12]:
                c["tap-targets-mobile"].details.append("%dx%d `%s` \"%s\"" % (t["w"], t["h"], t["selector"], t["text"]))
        else:
            c["tap-targets-mobile"].set("PASS", "%d targets, all >= 40px" % mobile["tapTargets"])
        if mobile["scale"] < 0.99:
            c["small-text-mobile"].details.append(
                "page is rendered zoomed out (scale %.2f, layout width %dpx): sizes are effective on-screen px"
                % (mobile["scale"], mobile["layoutWidth"]))

    lk = next((vp.get("links") for vp in per_vp if vp.get("links")), None)
    if lk is not None:
        broken = [r for r in lk["results"] if r["status"] >= 400 or r["status"] == 0]
        note = " (checked %d of %d; raise --max-links)" % (lk["checked"], lk["found"]) if lk["found"] > lk["checked"] else ""
        if broken:
            c["internal-links"].set("FAIL", "%d of %d same-origin links broken%s" % (len(broken), lk["checked"], note))
            for r in broken:
                c["internal-links"].details.append("%s  %s" % (r["status"] or r.get("error", "error"), r["url"]))
        elif lk["found"] > lk["checked"]:
            c["internal-links"].set("WARN", "%d checked, all OK%s" % (lk["checked"], note))
        else:
            c["internal-links"].set("PASS", "%d same-origin links, all OK" % lk["checked"])

    return finish(out_dir, url, final_url, source, browser_version, c, per_vp,
                  console_errors, failed, aborted, dom, mobile)


def collect_links(hrefs, base):
    base_p = urlparse(base)
    page_url = urldefrag(base)[0]
    out = []
    seen = set()
    for h in hrefs:
        if not h:
            continue
        absu = urldefrag(urljoin(base, h))[0]
        p = urlparse(absu)
        if p.scheme not in ("http", "https"):
            continue
        if (p.scheme, p.netloc) != (base_p.scheme, base_p.netloc):
            continue
        if absu == page_url or absu in seen:
            continue
        seen.add(absu)
        out.append(absu)
    return out


def check_links(ctx, links, max_links, timeout_s):
    from playwright.sync_api import Error as PWError
    results = []
    for u in links[:max_links]:
        status, err = 0, None
        for method in ("HEAD", "GET"):
            try:
                r = ctx.request.fetch(u, method=method, max_redirects=10,
                                      timeout=min(timeout_s, 15) * 1000)
                status = r.status
                r.dispose()
                if method == "HEAD" and status in (403, 405, 501):
                    continue  # some servers refuse HEAD: retry with GET
                break
            except PWError as exc:
                err = str(exc).splitlines()[0][:160]
                status = 0
        rec = {"url": u, "status": status}
        if err and status == 0:
            rec["error"] = err
        results.append(rec)
    return {"found": len(links), "checked": len(results), "results": results}


def finish(out_dir, url, final_url, source, browser_version, checks, per_vp,
           console_errors, failed, aborted, dom, mobile):
    counts = {"PASS": 0, "WARN": 0, "FAIL": 0, "SKIP": 0}
    for chk in checks.values():
        counts[chk.status] = counts.get(chk.status, 0) + 1
    verdict = "FAIL" if counts["FAIL"] else ("WARN" if counts["WARN"] else "PASS")
    now = _dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    data = {
        "tool": "launch_qa.py", "version": VERSION, "time": now, "target": url,
        "finalUrl": final_url, "source": source, "browser": "Chromium %s" % browser_version,
        "verdict": verdict, "counts": counts,
        "checks": [chk.as_dict() for chk in checks.values()],
        "viewports": per_vp,
    }
    with open(os.path.join(out_dir, "report.json"), "w") as fh:
        json.dump(data, fh, indent=2, default=list)

    L = []
    L.append("# Launch QA report")
    L.append("")
    L.append("- Target: %s" % source)
    if final_url != url:
        L.append("- Final URL after redirects: %s" % final_url)
    L.append("- Run: %s, launch_qa.py %s, Chromium %s" % (now, VERSION, browser_version))
    L.append("- **Verdict: %s** (%d FAIL, %d WARN, %d PASS%s)" % (
        verdict, counts["FAIL"], counts["WARN"], counts["PASS"],
        ", %d SKIP" % counts["SKIP"] if counts["SKIP"] else ""))
    L.append("")
    L.append("| Check | Result | Measured |")
    L.append("|---|---|---|")
    for chk in checks.values():
        L.append("| %s | **%s** | %s |" % (chk.label.replace("|", "/"), chk.status,
                                          (chk.summary or "").replace("|", "/")))
    L.append("")
    L.append("## Viewports")
    L.append("")
    L.append("| Viewport | HTTP | Load ms | Page height px | scrollWidth/clientWidth | Screenshot |")
    L.append("|---|---|---|---|---|---|")
    for vp in per_vp:
        ov = vp.get("overflow") or {}
        L.append("| %s %s | %s | %s | %s | %s/%s | %s |" % (
            vp["name"], vp["size"], vp.get("status", "-"), vp.get("loadMs", "-"), vp.get("pageHeight", "-"),
            ov.get("scrollWidth", "-"), ov.get("clientWidth", "-"),
            vp.get("screenshot") or vp.get("screenshotError", "-")))
    L.append("")
    detailed = [chk for chk in checks.values() if chk.details]
    if detailed:
        L.append("## Details")
        for chk in detailed:
            L.append("")
            L.append("### %s: %s" % (chk.label, chk.status))
            for d in chk.details[:30]:
                L.append("- %s" % d)
            if len(chk.details) > 30:
                L.append("- ... %d more" % (len(chk.details) - 30))
    L.append("")
    L.append("## What this report does not prove")
    L.append("")
    L.append("These checks prove the page loads and is not structurally broken. They do not prove it looks "
             "right. Open every screenshot above and look at it before calling the page ready; full-page "
             "screenshots of scroll-animated sites can show sections in their un-revealed state, so judge "
             "motion from a recording, not from these images.")
    L.append("")
    with open(os.path.join(out_dir, "report.md"), "w") as fh:
        fh.write("\n".join(L))

    print("launch-qa %s  %s" % (verdict, final_url))
    for chk in checks.values():
        print("  %-4s  %-20s %s" % (chk.status, chk.id, chk.summary))
    print("report: %s" % os.path.join(out_dir, "report.md"))
    return 1 if counts["FAIL"] else 0


def main(argv=None):
    ap = argparse.ArgumentParser(description="Render a page at phone/tablet/desktop sizes and report launch blockers.")
    ap.add_argument("target", help="http(s) URL or a local directory containing index.html")
    ap.add_argument("--out", help="output directory (default: ./launch-qa-<name>-<timestamp>)")
    ap.add_argument("--max-links", type=int, default=50, help="max same-origin links to check (default 50)")
    ap.add_argument("--timeout", type=int, default=45, help="page load timeout in seconds (default 45)")
    args = ap.parse_args(argv)
    try:
        import playwright  # noqa: F401
    except ImportError:
        sys.stderr.write(INSTALL_HINT)
        return 2

    out = args.out
    if not out:
        name = os.path.basename(os.path.abspath(args.target)) if os.path.isdir(args.target) else args.target
        out = "launch-qa-%s-%s" % (slugify(name), _dt.datetime.now().strftime("%Y%m%d-%H%M%S"))
    out = os.path.abspath(out)
    os.makedirs(out, exist_ok=True)
    return run(args.target, out, args.max_links, args.timeout)


if __name__ == "__main__":
    sys.exit(main())
