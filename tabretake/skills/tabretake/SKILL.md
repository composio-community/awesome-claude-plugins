---
name: tabretake
description: Create repeatable product demo videos, screen recording walkthroughs, and README GIFs (16:9 and 9:16 portrait) from a web app URL or an existing screen recording. Use when asked for a launch video, browser walkthrough, signup or onboarding demo, vertical short video, or to regenerate a demo after UI changes, including 产品演示、网页录屏、README 动图、竖屏宣传视频. Runs locally with Playwright + FFmpeg, zero cloud upload, and supports dark/light theme presets. Not for browser test assertions, text-to-video generation, or general audio/video editing.
license: MIT
metadata:
  author: gnawbit
  version: "0.5.2"
  repository: https://github.com/gnawbit/tabretake
  compatibility: Node.js 20.9+, local Chrome/Edge or Chromium via tabretake setup, Windows/macOS/Linux. Target app access is required. Rendering is local.
---

# TabRetake by gnawbit

Use `tabretake preview --config story.json --headless --json` to check steps
before recording. It executes real app changes; reset demo data before a retake.
It preserves recordings and writes only explicitly requested screenshots.
After `waitFor`, use a `focus` step with a selector, caption and pause to frame a
result instead of the last clicked control. Inspect the rendered clip for framing.

Create a repeatable product walkthrough from a web URL, or render an existing
screen recording with supplied timestamps. Canonical project:
https://github.com/gnawbit/tabretake.
Outputs are local MP4, GIF and PNG posters in landscape (16:9) and optional portrait (9:16).
For legacy release notes (v0.4.0 and earlier / `demo-reel`), see
[compatibility](https://github.com/gnawbit/tabretake/blob/main/docs/compatibility.md).

## Locate and check the CLI

Use an installed `tabretake` CLI when available. For a source checkout, replace
`tabretake` with `node /absolute/path/to/tabretake/bin/tabretake.mjs` (quote paths with spaces).
If missing, install with `npm install --global @gnawbit/tabretake@0.5.2`.
When Playwright Chromium is absent, TabRetake automatically falls back to local
Chrome or Edge (`--browser auto`), or you can install pinned Chromium via
`tabretake setup [--proxy <url>] [--json]` (if download times out in restricted networks,
use `PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.npmmirror.com/binaries/playwright`).

```bash
tabretake --version
tabretake capabilities --json
tabretake doctor --json
```

Query `capabilities --json` before choosing flags. `doctor --json` reports required
errors and optional font warnings; it checks browser presence without launching one.
Rendering an existing recording or saved timeline does not need a browser: if `chromium`
is the only failed required check, continue to `validate` and `render`. Fix other
required errors first. Node.js 20.9+ is required; Chinese captions need a CJK system font.

## Choose the input

- **Web app:** confirm the URL and intended flow. Use a test account and non-sensitive demo data.
- **Existing recording:** get the file and moments to highlight, or launch
  `tabretake mark --video recording.mp4` for interactive timestamp picking. Read
  [recording input and branding](references/rendering.md); do not invent marks.
- **Interactive capture:** `tabretake capture --url https://your-app.com --out demo.json --run`
  lets the user perform the steps in a visible browser and saves a reusable story.
- **Example requested:** `tabretake demo --story readme|onboarding|release --port 0`
  runs a fictional bundled app (not evidence of external adoption).

Ask only for missing details that affect the result, such as the target flow,
theme preset (`midnight`, `daylight`, `paper`, `slate`), or output orientation.

## Record a web flow

1. Inspect controls and create a starter if no story exists:

   ```bash
   tabretake plan --url https://your-app.com --out plan.json --json
   tabretake init --url https://your-app.com --out demo.json --auto --preset midnight --json
   ```

2. Read the plan file from its returned artifact path. Inspect `--auto` steps or
   replace starter steps with the requested flow. See [story authoring](references/story.md)
   for actions, locators, and timing units. `plan` includes `label` (ARIA/HTML labels)
   and native select `options`; `name` remains the HTML attribute. Use scoped `selector`
   when labels repeat or overlap. `init` will not overwrite an existing story.

3. Validate, preview, record and render (or use `tabretake run` for one-command execution):

   ```bash
   tabretake validate --config demo.json --json
   tabretake preview --config demo.json --headless --json
   tabretake run --config demo.json --out demo --vertical --scale 2 --json
   # Or run record and render separately:
   tabretake record --config demo.json --out demo --scale 2 --json
   tabretake render --config demo/record.json --vertical --json
   ```

   Omit `--vertical` for landscape only; add `--no-gif` to skip GIFs; pass
   `--preset daylight|paper|slate|midnight` to switch themes without re-recording;
   pass `--browser chrome|msedge|chromium|auto` to pick a browser engine;
   pass `--scale 2` for HiDPI Retina recording when zooming in.
   Use `--vertical --zoom 1 --vertical-zoom 1.8` to keep landscape overview while
   enlarging portrait focus targets (`vertical.zoom` saves it in config; `zoom: false`
   keeps full view). Record narrow viewports (e.g. `390x844`) for mobile flows.

4. Inspect the generated poster and video, then return clickable paths to the actual
   artifacts. Re-record after flow changes; re-render `record.json` after caption,
   zoom, or theme preset changes. Output videos have no audio.

## Interpret results and recover

`--json` writes one object to stdout; stderr carries progress. Check the exit
code and `ok`, then read `artifacts` for absolute paths, kinds and byte sizes.
Only a successful result describes the current run; failed runs may leave
partial files. `schemaVersion` identifies the response format, not the CLI release.

- `INVALID_CONFIG`: fix each `error.issues[].path` using the packaged
  [JSON Schema](schemas/story.schema.json). The standalone `validate` command
  returns an `errors` array for schema failures and an `error` object for file
  or JSON syntax failures. It does not verify selectors, login or media access.
- `TARGET_NOT_FOUND`, `STEP_TIMEOUT`, `STEP_FAILED`: inspect `error.step.path`
  and its zero-based index. Re-run `plan` with the same login state, update the
  target or wait condition and retry. Do not repeat an unchanged failing command.
  `click` waits for an enabled, unobstructed target using step `timeout`
  (milliseconds; default 20,000).
- `PAGE_UNREACHABLE`: check the URL, local app server and browser network/proxy
  access. `PAGE_HTTP_ERROR`: inspect `error.status`; fix the route/server or use
  authorized login state for 401/403. Dependency checks do not prove page access,
  and an HTTP error page is not a completed demo.
- Missing runtime or fonts: inspect `doctor --json` and its recovery hints.
- Captcha, anti-bot block, iframe-only or canvas-only flow: use a user-provided
  recording with marks instead of trying to bypass the restriction.

## Protected pages and privacy

Manual login needs an interactive terminal without `--json`. Login navigation
errors omit the target URL; HTTP 401/403 pages stay open for sign-in while other
HTTP errors stop the command.

```bash
tabretake plan --url https://your-app.com --login
tabretake record --config demo.json --storage-state auth.json --json
```

`auth.json` is created in the login command's working directory and is never
implicitly loaded by later commands. Use an absolute state path after changing
directories. If it expires, let the user log in again; do not request passwords
or 2FA codes in chat. Do not upload or commit login state or private recordings.
Stories and recorded timelines retain typed values, so use synthetic data.
Record only authorized pages; the workflow does not authorize publishing assets.
