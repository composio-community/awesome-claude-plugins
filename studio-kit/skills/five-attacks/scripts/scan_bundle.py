#!/usr/bin/env python3
"""Scan a build folder or a live page for secret-shaped strings that should never reach a browser.

  python3 scan_bundle.py dist/
  python3 scan_bundle.py https://preview.example.com

For a URL it fetches the HTML, every same-origin <script src>/modulepreload, inline scripts and
the source maps they point to. Findings are printed masked. Exit 0 clean, 1 findings, 2 error.
Standard library only (Python 3.8+). Only scan sites you own or are authorized to test.
"""
import argparse
import os
import re
import sys
import urllib.parse
import urllib.request

PATTERNS = [
    ("Stripe secret key", r"\b[sr]k_(?:live|test)_[0-9A-Za-z]{20,}"),
    ("Stripe webhook secret", r"\bwhsec_[0-9A-Za-z+/=]{20,}"),
    ("Anthropic API key", r"\bsk-ant-[0-9A-Za-z_\-]{20,}"),
    ("OpenAI API key", r"\bsk-(?:proj-|svcacct-|admin-)?[0-9A-Za-z_\-]{32,}"),
    ("AWS access key id", r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b"),
    ("GitHub token", r"\b(?:gh[pousr]_[0-9A-Za-z]{36,}|github_pat_[0-9A-Za-z_]{40,})"),
    ("Slack token", r"\bxox[abposr]-[0-9A-Za-z\-]{10,}"),
    ("private key block", r"-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP |ENCRYPTED )?PRIVATE KEY-----"),
    ("Shopify access token", r"\bshp(?:at|ss|ca|pa)_[0-9a-fA-F]{32}\b"),
    ("SendGrid API key", r"\bSG\.[0-9A-Za-z_\-]{20,}\.[0-9A-Za-z_\-]{30,}"),
    ("Groq API key", r"\bgsk_[0-9A-Za-z]{40,}"),
    ("Hugging Face token", r"\bhf_[0-9A-Za-z]{30,}"),
    ("Replicate token", r"\br8_[0-9A-Za-z]{30,}"),
    ("Google API key (fine only if it is a restricted browser key)", r"\bAIza[0-9A-Za-z_\-]{35}\b"),
]
PLACEHOLDER = re.compile(r"(?i)x{4,}|your|example|placeholder|dummy|changeme|redacted|\.\.\.")
SCAN_EXT = (".js", ".mjs", ".cjs", ".map", ".html", ".htm", ".json", ".css", ".txt", ".env", ".xml")
SKIP_DIRS = {"node_modules", ".git", ".cache", "__pycache__"}
MAX_BYTES = 15 * 1024 * 1024


def mask(v):
    return "%s... (%d chars)" % (v[:6], len(v))


def scan_text(text, where, out):
    for name, pattern in PATTERNS:
        for m in re.finditer(pattern, text):
            v = m.group(0)
            if name != "private key block" and (PLACEHOLDER.search(v) or len(set(v)) < 8):
                continue
            out.append((where, name, mask(v)))


def scan_dir(root, out):
    count = 0
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            if not fn.lower().endswith(SCAN_EXT):
                continue
            path = os.path.join(dirpath, fn)
            try:
                if os.path.getsize(path) > MAX_BYTES:
                    continue
                with open(path, "r", encoding="utf-8", errors="replace") as fh:
                    scan_text(fh.read(), os.path.relpath(path, root), out)
                count += 1
            except OSError:
                continue
    return count


def fetch(url, timeout=15):
    req = urllib.request.Request(url, headers={"User-Agent": "studio-kit-scan/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(MAX_BYTES).decode("utf-8", "replace")


def scan_url(url, out):
    base = urllib.parse.urlsplit(url)
    html = fetch(url)
    scan_text(html, url, out)
    seen, queue, count = set(), [], 1
    for m in re.finditer(r"<script\b[^>]*\bsrc=[\"']([^\"']+)[\"']|<link\b[^>]*\bhref=[\"']([^\"']+\.m?js[^\"']*)[\"']", html, re.I):
        queue.append(urllib.parse.urljoin(url, m.group(1) or m.group(2)))
    while queue:
        u = queue.pop(0)
        if u in seen or urllib.parse.urlsplit(u).netloc != base.netloc:
            continue
        seen.add(u)
        try:
            body = fetch(u)
        except Exception as exc:
            sys.stderr.write("skip %s (%s)\n" % (u, exc))
            continue
        count += 1
        scan_text(body, u, out)
        sm = re.search(r"//[#@]\s*sourceMappingURL=([^\s'\"]+)", body)
        if sm and not sm.group(1).startswith("data:"):
            queue.append(urllib.parse.urljoin(u, sm.group(1)))
        for imp in re.finditer(r"(?:import\s*\(?|from\s*)\s*[\"'](\.{0,2}/[^\"']+\.m?js)[\"']", body):
            queue.append(urllib.parse.urljoin(u, imp.group(1)))
    return count


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("target", help="build folder (dist/, .next/, out/) or http(s) URL")
    args = ap.parse_args(argv)
    findings = []
    try:
        if re.match(r"^https?://", args.target):
            n = scan_url(args.target, findings)
        elif os.path.isdir(args.target):
            n = scan_dir(args.target, findings)
        else:
            print("not a folder or URL: %s" % args.target)
            return 2
    except Exception as exc:
        print("error: %s" % exc)
        return 2
    print("scanned %d file(s) in %s" % (n, args.target))
    if not findings:
        print("PASS: no secret-shaped strings found")
        return 0
    print("FAIL: %d finding(s)" % len(findings))
    for where, name, masked in findings:
        print("  %s  %s  %s" % (where, name, masked))
    return 1


if __name__ == "__main__":
    sys.exit(main())
