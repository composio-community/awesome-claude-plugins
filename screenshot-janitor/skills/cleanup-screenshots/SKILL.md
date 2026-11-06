---
name: cleanup-screenshots
description: Find screenshots shared/accumulated during this Claude Code session and, with the user's approval, move them to the Trash (no permanent delete — recoverable). Use before ending a session, when asked to tidy the Desktop/screenshots folder, or when the screenshot-janitor Stop hook suggests cleanup. Triggers include "clean up screenshots", "delete screenshots", "tidy my desktop", "remove the screenshots".
---

# Screenshot Janitor — Cleanup

Cleans up screenshots that piled up during this session **safely**: never `rm`;
files are moved to the **Trash** and can be restored. Session scope comes from the
`started_at` timestamp recorded by the SessionStart hook (only screenshots created
during this session).

Helper scripts live next to this plugin. Resolve their location like this (works
whether or not `CLAUDE_PLUGIN_ROOT` is set in skill context):

```bash
SCRIPTS="$(cat "$HOME/.claude/screenshot-janitor/scripts-path" 2>/dev/null)"
[ -z "$SCRIPTS" ] && SCRIPTS="${CLAUDE_PLUGIN_ROOT}/scripts"
```

## Flow

### 1. Find candidates

```bash
bash "$SCRIPTS/find.sh"
```

Interpret the output:
- `NO_SESSION` → no session record. Ask the user whether to scan **all** screenshots;
  if yes, run `bash "$SCRIPTS/scan.sh" 0`.
- `SESSION_META:<path>` → **remember this path**; you will write the `handled`
  marker into its directory in step 5.
- Following TSV lines are candidates: `<mtime_epoch>\t<size_bytes>\t<path>`.
- If there are no TSV lines: say "No screenshots to clean up for this session 👍" and stop.

### 2. Show a clear list

Present the candidates as a numbered, human-readable table. Convert bytes to
MB/KB and the mtime epoch to a readable time. Example:

```
Found 3 screenshots from this session:

  1.  Screenshot 2026-06-07 at 04.44.07.png   3.6 MB   04:44
  2.  Screenshot 2026-06-07 at 04.44.17.png   3.4 MB   04:44
  3.  Screenshot 2026-06-07 at 15.49.25.png   5 KB     15:49

Total ~7.0 MB.
```

### 3. Ask for approval

Offer clear options and **wait** for the answer:
- **All** → move every candidate to the Trash.
- **Some** → "tell me the numbers, e.g. 1,3" → only those.
- **Cancel** → do nothing.

NEVER move files without approval.

### 4. Move to Trash

For the approved files (not permanent deletion!):

```bash
bash "$SCRIPTS/trash.sh" "/full/path/Screenshot ....png" "/another/file.png"
```

`trash.sh` is cross-platform (macOS Trash / Linux `gio trash` / `trash-cli`).
Always double-quote paths (they contain spaces). Never use `rm`.

### 5. Mark handled and report

After a successful cleanup, mark the session so it won't remind again (use the
`SESSION_META` path from step 1):

```bash
touch "$(dirname '<SESSION_META path>')/handled"
```

Then give a short summary: how many files, how much space freed, and that they
went to the Trash ("you can restore from Trash if needed"). Mention any skipped files.

## Notes
- Configuration: create `~/.claude/screenshot-janitor/config.sh` to override
  `SCAN_DIRS`, `NAME_PATTERNS`, or `MIN_AGE_SECONDS` (don't edit plugin files).
- This skill also works standalone; it does not require the Stop hook.
- Respond in the user's configured language.
