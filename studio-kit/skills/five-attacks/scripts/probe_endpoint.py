#!/usr/bin/env python3
"""Send a small burst of requests to ONE of your own endpoints and report how it reacts.

  python3 probe_endpoint.py http://localhost:3000/api/chat --json '{"message":"hi"}' -n 25
  python3 probe_endpoint.py http://localhost:3000/api/contact --form 'email=t@example.com' -n 10
  python3 probe_endpoint.py http://localhost:3000/api/chat --json '{}' -n 5 --origin https://evil.example

Prints a status-code histogram and the position of the first 429. Stops early after 3 consecutive 429s.
Hard cap of 100 requests. Only test systems you own or are authorized to test.
Standard library only (Python 3.8+).
"""
import argparse
import collections
import ssl
import sys
import time
import urllib.error
import urllib.request


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("url")
    body = ap.add_mutually_exclusive_group()
    body.add_argument("--json", help="JSON body (sent as application/json)")
    body.add_argument("--form", help="urlencoded body, e.g. 'a=1&b=2'")
    ap.add_argument("-n", type=int, default=25, help="number of requests (max 100, default 25)")
    ap.add_argument("--method", default=None, help="default POST when a body is given, else GET")
    ap.add_argument("--origin", help="send this Origin header (test foreign-origin rejection)")
    ap.add_argument("--header", action="append", default=[], help="extra header 'Name: value' (repeatable)")
    ap.add_argument("--delay", type=float, default=0.1, help="seconds between requests (default 0.1)")
    ap.add_argument("--insecure", action="store_true", help="accept self-signed TLS (local dev only)")
    a = ap.parse_args(argv)
    n = max(1, min(a.n, 100))
    data, ctype = None, None
    if a.json is not None:
        data, ctype = a.json.encode(), "application/json"
    elif a.form is not None:
        data, ctype = a.form.encode(), "application/x-www-form-urlencoded"
    method = a.method or ("POST" if data is not None else "GET")
    ctx = ssl._create_unverified_context() if a.insecure else None
    hist, first429, streak, times = collections.Counter(), None, 0, []
    for i in range(1, n + 1):
        req = urllib.request.Request(a.url, data=data, method=method)
        req.add_header("User-Agent", "studio-kit-probe/1.0")
        if ctype:
            req.add_header("Content-Type", ctype)
        if a.origin:
            req.add_header("Origin", a.origin)
        for h in a.header:
            k, _, v = h.partition(":")
            req.add_header(k.strip(), v.strip())
        t0 = time.time()
        try:
            with urllib.request.urlopen(req, timeout=20, context=ctx) as r:
                code = r.status
        except urllib.error.HTTPError as e:
            code = e.code
        except Exception as e:
            code = "ERR:" + type(e).__name__
        times.append(time.time() - t0)
        hist[code] += 1
        if code == 429:
            first429 = first429 or i
            streak += 1
            if streak >= 3:
                break
        else:
            streak = 0
        time.sleep(a.delay)
    sent = sum(hist.values())
    print("%s %s  sent=%d  origin=%s" % (method, a.url, sent, a.origin or "-"))
    for code, c in sorted(hist.items(), key=lambda kv: str(kv[0])):
        print("  %s x%d" % (code, c))
    print("  first 429 at request: %s" % (first429 or "never"))
    print("  median latency: %.0f ms" % (sorted(times)[len(times) // 2] * 1000))
    if a.origin and all(str(c).startswith("2") for c in hist):
        print("  WARN: foreign Origin was accepted")
    if not first429 and sent >= 20:
        print("  WARN: no rate limit observed in %d requests" % sent)
    return 0


if __name__ == "__main__":
    sys.exit(main())
