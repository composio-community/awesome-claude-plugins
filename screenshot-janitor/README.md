# 🧹 screenshot-janitor

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux-blue)
![Claude Code](https://img.shields.io/badge/Claude%20Code-plugin-8A2BE2)
[![GitHub stars](https://img.shields.io/github/stars/MECoban/screenshot-janitor?style=social)](https://github.com/MECoban/screenshot-janitor/stargazers)

A [Claude Code](https://claude.com/claude-code) plugin that keeps your Desktop clean.

You share a lot of screenshots with Claude during a session — and they pile up
forever afterward. **screenshot-janitor** notices the screenshots created during
each session and, before you leave, **asks** whether to move them to the Trash.
Approve, and they're gone (recoverable from the Trash). Decline, and it won't
nag you again.

> Safe by design: it **never** runs `rm`. Files go to the system Trash and can be restored.

## Demo

<!-- Record a short clip of the end-of-session "clean up?" prompt, save it as docs/demo.gif, then uncomment the line below: -->
<!-- ![screenshot-janitor in action](docs/demo.gif) -->

> 🎥 _Demo GIF coming soon._ The end-of-session flow: Claude asks **"move these N screenshots to the Trash?"** → you approve → done.

---

## Install

```text
/plugin marketplace add MECoban/screenshot-janitor
/plugin install screenshot-janitor
```

That's it. The skill **and** the hooks are wired up automatically — no manual
`settings.json` editing. Restart Claude Code (or open `/hooks` once) to activate.

## How it works

| Piece | What it does |
|-------|--------------|
| `SessionStart` hook | Opens a per-session folder and records the start time, so each session only deals with **its own** screenshots. |
| `Stop` hook | If this session created screenshots, reminds you **once** to clean them up before you go. |
| `cleanup-screenshots` skill | Finds the screenshots, shows a clear list (name, size, time), asks for approval, and moves the approved ones to the Trash. |

You can also run it any time:

```text
/cleanup-screenshots
```

## Platforms

- **macOS** — scans `~/Desktop`, recognizes `Screenshot *`, `Ekran Resmi *`,
  `CleanShot *`, etc. Trashes via the `trash` CLI or Finder/AppleScript.
- **Linux** — scans `~/Pictures/Screenshots`, `~/Pictures`, `~/Desktop`,
  recognizes GNOME/KDE naming. Trashes via `gio trash` or `trash-cli`.

Zero runtime dependencies (no `jq`, no Python) — just `bash`, `find`, `stat`.

## Configuration

Don't edit the plugin files (they're overwritten on update). Instead create
`~/.claude/screenshot-janitor/config.sh` and override what you need:

```bash
# Extra folders to scan
SCAN_DIRS=( "$HOME/Desktop" "$HOME/Pictures/Screenshots" )

# Filename globs that count as screenshots
NAME_PATTERNS=( "Screenshot *" "CleanShot *" )

# Don't remind until the session is at least this old (seconds). 0 = remind ASAP.
MIN_AGE_SECONDS=300
```

## State & privacy

Per-session bookkeeping lives in `~/.claude/screenshot-janitor/`. Nothing leaves
your machine. The plugin reads filenames/sizes/timestamps only — never the image
contents.

## Uninstall

```text
/plugin uninstall screenshot-janitor
```

Optionally remove leftover state: `rm -rf ~/.claude/screenshot-janitor`.

## License

MIT © MECoban
