---
name: launch-qa
description: Use when a web page or site is about to be called ready, shown to a client, deployed, or announced, and right after a deploy on the live URL. Renders the page for real in Chromium at phone, tablet and desktop sizes, scrolls it so lazy content mounts, takes full-page screenshots and reports PASS/WARN/FAIL with numbers for console errors, failed requests, horizontal overflow, title/description/Open Graph, lang, h1, image alt, small text and tap targets on mobile, and broken same-origin links. Use it instead of saying "it works" or "it's done" from reading code, a build log or a dev server that compiled.
license: MIT
---

# Launch QA

A page is not ready because the code looks right, the build is green or the dev server compiled.
It is ready when it has been rendered, looked at, and the real output holds up. This skill makes
that the default: render, measure, look, then report what you saw, including the problems.

Two rules carry the whole skill:

1. **Never say "done", "works" or "ready" without a render.** Run the script, open the screenshots.
2. **Metrics prove it works, not that it is beautiful.** A report with every check green can still
   fail on sight. The checks catch structural breakage; your eyes on the screenshots catch the rest.

## When to run it

| Moment | Target | Why |
|---|---|---|
| Before telling anyone a page is ready (client, team, user) | local build folder or preview URL | Catch breakage before someone else does |
| Before deploying | the production build output (not the dev server) | Dev servers hide minification, path and env bugs |
| Right after a deploy | the live URL | CDN, redirects, env vars, missing assets and HTTPS only show up live |
| After any change to layout, fonts, images or third-party scripts | preview or live | Overflow and console errors come back quietly |

## Requirements

- Python 3.9+ (stock macOS `python3` works) and Playwright for Python:
  `python3 -m pip install --user playwright && python3 -m playwright install chromium`
- The script prints this hint and exits with code 2 if Playwright is missing.

## Procedure

1. **Run the script** on the real target:
   ```bash
   python3 scripts/launch_qa.py https://staging.example.com/        # a URL
   python3 scripts/launch_qa.py ./dist --out ./qa/launch            # a build folder (needs index.html)
   ```
   A folder is served on a free `127.0.0.1` port. Options: `--out DIR`, `--max-links 50`, `--timeout 45`.
2. **Read the terminal summary.** One line per check: `PASS` / `WARN` / `FAIL`, check id, measured value.
   Exit code `0` = no FAIL, `1` = at least one FAIL, `2` = setup error (bad target, no Playwright).
3. **Open `report.md`.** The Details section names the evidence: the console message, the failing URL
   with its status, the selector of the element that overflows and by how many pixels.
4. **Open every screenshot** in `screenshots/` (phone, tablet, desktop) with your image viewer or
   the Read tool. Not a sample: all three, top to bottom. Look for what no check measures: overlapping
   elements, misaligned edges, a wrong font, an image that did not load, an empty section, a hero
   that looks cheap. Write down what you see.
5. **Fix, then re-run** until there is no FAIL and every WARN is either fixed or consciously accepted
   with a one-line reason.
6. **Report honestly** (format below). Include the problems you saw, not only the green lines.
7. **After deploy, run it again on the live URL.** A local PASS says nothing about the live site.

If you have the `visual-qa` skill (Studio Kit Pro) installed, run it after launch-qa passes for
the deep visual gate: scroll recordings, contact sheets, contrast over imagery, layout shifts and an
adversarial second review.

## What the checks measure

| Check id | Measures | FAIL when | WARN when |
|---|---|---|---|
| `page-load` | main document status | navigation error or HTTP >= 400 | - |
| `console-errors` | `console.error` + uncaught exceptions, all 3 sizes | any | - |
| `failed-requests` | responses >= 400, blocked/failed requests | any (third-party tagged) | only `ERR_ABORTED` (often media preload) |
| `horizontal-overflow` | `scrollWidth > clientWidth` at 390/768/1440, names the widest offending elements | page scrolls sideways at any size | elements stick out but are hidden by `overflow` on html/body |
| `title` | `<title>` | missing/empty | > 60 chars |
| `meta-description` | `meta name=description` | - | missing, < 50 or > 160 chars |
| `og-tags` | `og:title`, `og:image` | - | missing; relative `og:image` on a non-local URL |
| `lang` | `<html lang>` | missing | - |
| `h1` | count of `<h1>` | none | more than one, or the only one is hidden |
| `img-alt` | `<img>` without an `alt` attribute (`alt=""` is valid for decoration) | any | - |
| `meta-viewport` | `width=device-width` | missing | present without `width=device-width` |
| `small-text-mobile` | rendered text under 12 px at 390 wide | - | any |
| `tap-targets-mobile` | links/buttons/inputs under 40x40 px at 390 wide (links inside running text exempt) | - | any |
| `internal-links` | same-origin `<a href>` (HEAD, GET fallback, max 50) | any >= 400 or unreachable | more links than `--max-links` |

Read `references/checks.md` when a check fails and you need the usual causes and fixes, or when you
suspect a false positive.

## What blocks a launch

- **Any FAIL blocks.** No exceptions for "it's only a console error": an uncaught exception often
  means a widget, form or analytics call is dead.
- **A WARN does not block by itself**, but each one needs a decision: fix it, or accept it with a
  written reason ("footer legal text is 11 px by brand guideline, accepted").
- **What you saw on the screenshots can block** even when every check passes: a broken hero image,
  overlapping text, a section that renders empty, a layout that is plainly wrong at one size.
- **A FAIL on the live URL blocks the announcement** even if the local build passed.

## How to report

Keep it short and factual. Say what was rendered, what passed, what failed, what you saw:

```
Launch QA on https://staging.example.com/ (Chromium, 390/768/1440): FAIL, 2 FAIL / 1 WARN / 11 PASS.
- FAIL horizontal-overflow: phone scrolls sideways +184 px, cause `section.pricing > table`.
- FAIL internal-links: /team returns 404 (linked from footer).
- WARN tap-targets-mobile: 6 footer icons are 24x24 px.
Looked at all 3 screenshots: hero image is soft at desktop, testimonial cards overlap at 768.
Not ready. Fixing the overflow and the 404 first, then re-running.
```

Never write "all good" when you only read the summary. If you could not open the screenshots,
say so: "checks pass, screenshots not reviewed yet".

## Limits (say them when they matter)

- Chromium only. Safari/iOS rendering differences (fonts, `100vh`, backdrop filters) need a real
  device or WebKit run.
- Full-page screenshots of scroll-animated pages can show sections in their un-revealed state;
  judge motion from a recording, not from these stills.
- Pages behind login, cookie walls or bot protection are tested as an anonymous first visit.
- Links are checked only on the entry page, same origin, first 50. It is not a crawler.
