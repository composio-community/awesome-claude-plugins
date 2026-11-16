# Launch QA checks: causes, fixes, false positives

Read this when a check fails and the cause is not obvious, or when you think a result is wrong.
Before calling anything a false positive, open the screenshot for that viewport and look.

## page-load
- **Causes:** wrong path or base URL, a server-side error, a redirect loop, an expired TLS
  certificate, basic auth on a preview deploy, bot protection returning 403 to headless browsers.
- **Fix:** open the URL in a normal browser first. For protected previews, test a public preview URL
  or a local build of the same commit.

## console-errors
- **Typical messages:** `Uncaught ReferenceError: x is not defined` (a script loaded before its
  dependency, or a stale inline call), `Cannot read properties of null` (a selector that no longer
  matches after a markup change), CSP violations, hydration mismatches in React/Vue builds.
- **Fix:** reproduce in DevTools at the reported viewport; errors that appear only at one size are
  usually responsive code paths (a mobile menu script, a carousel that inits only on wide screens).
- **Not a false positive:** errors from third-party scripts still count. They break consent banners,
  forms and analytics; either fix the integration or remove it.
- Network "Failed to load resource" messages are moved to `failed-requests`, with their URL.

## failed-requests
- **Causes:** wrong asset paths after a build (absolute `/assets/` on a sub-path deploy), case-sensitive
  file names (works on macOS, 404 on Linux hosting), fonts blocked by CORS, a deleted image still
  referenced in CSS, an API endpoint that needs env vars the host does not have.
- `(third-party)` tags requests to other hosts. They still FAIL: the visitor sees the broken embed.
- `ERR_ABORTED` alone is a WARN: browsers cancel video and audio preloads on purpose. If a visible
  image is aborted, treat it as a FAIL.

## horizontal-overflow
- The report gives `scrollWidth` vs `clientWidth` and the outermost elements that stick out, with
  their right edge in px. Fix the first one listed; its children usually overflow because of it.
- **Usual causes:** fixed pixel widths (`width: 900px`), `100vw` inside a page with a vertical
  scrollbar, long unbroken strings (URLs, emails: add `overflow-wrap: anywhere`), tables and code
  blocks without a scroll wrapper, negative margins, off-canvas menus positioned with `left`
  instead of `transform`, animations whose start state is off-screen (`translateX(100px)`).
- **WARN "masked":** `overflow-x: hidden` on html/body hides the symptom on desktop browsers, but
  iOS Safari can still pan the page sideways and `position: sticky` breaks under an `overflow` parent.
  Fix the element, then remove the mask.
- Elements inside a container that clips or scrolls horizontally (carousels, marquees with
  `overflow: hidden`) are not counted: they do not widen the page.

## title, meta-description, og-tags
- One unique `<title>` per page, about 30-60 characters, the most specific words first.
- Description 50-160 characters: what the page offers and to whom, in concrete words.
- `og:image` must be an absolute `https://` URL on the live site (about 1200x630, under 5 MB).
  A relative path is accepted only on localhost previews, where the final domain is not known yet.
- After deploy, paste the live URL into the sharing debugger of the platforms that matter to
  the client to see the real card.

## lang
- `<html lang="en">` (or the page language). Screen readers pick pronunciation from it; browsers use
  it for hyphenation and translation prompts. Multilingual sites set it per page.

## h1
- Exactly one visible `<h1>` that says what the page is. Logo-in-h1 on every page and multiple h1
  per section are the common mistakes. A visually hidden h1 is a WARN: fine for some app shells,
  wrong for a landing page.

## img-alt
- Every `<img>` needs an `alt` attribute. Informative images: describe what matters ("Set table
  with candle and pasta"). Decorative images: `alt=""`. Missing alt entirely is the FAIL, because
  screen readers then read the file name.
- Images with `role="presentation"` or `aria-hidden="true"` are skipped.

## meta-viewport
- Without `<meta name="viewport" content="width=device-width, initial-scale=1">` phones render a
  980 px desktop layout zoomed out. Text and tap target sizes are then measured as they appear on
  screen (the report notes the zoom factor).
- Do not add `maximum-scale=1` or `user-scalable=no`: it blocks pinch zoom for people who need it.

## small-text-mobile
- Text under 12 px on a phone is hard to read for many people. Usual culprits: legal footers,
  badges, captions, form hints, fixed `font-size: 10px` from a desktop design. Prefer 14-16 px for
  body copy on phones and 12 px as the floor for secondary text.

## tap-targets-mobile
- Buttons, nav links, icons, checkboxes and pagination dots under 40x40 px are easy to miss with a
  thumb. Enlarge the hit area with padding (the visible icon can stay small). Links inside running
  text are exempt; standalone links are not.

## internal-links
- Same-origin `<a href>` on the entry page, HEAD first, GET when the server refuses HEAD
  (403/405/501), redirects followed. Status 0 means the request never completed (timeout, DNS,
  connection refused).
- **Usual causes:** pages renamed without redirects, `.html` extensions removed on the host but
  kept in links (or the reverse), trailing-slash rules, case-sensitive paths.
- Anchors (`#section`) are not verified; check that targets exist by clicking through the nav.
