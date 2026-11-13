#!/usr/bin/env python3
"""deploy-gate: a PreToolUse hook that stops Claude from shipping to production on its own.

Claude Code sends the pending Bash call as JSON on stdin. If the command would deploy,
publish or push to a production branch, this hook answers "ask" so a human confirms it
in the permission prompt. When nobody can be asked (bypassPermissions mode, or
STUDIO_KIT_DEPLOY_GATE=deny) it answers "deny" and tells Claude to ask the user.

Settings (environment variables, read when Claude Code starts):
  STUDIO_KIT_DEPLOY_GATE   ask (default) | deny | off
  STUDIO_KIT_PROD_BRANCHES comma list, default: main,master,production,prod,release,live

Per-project allowlist: put one regular expression per line in
  .claude/deploy-gate-allow   (relative to the project directory)
Commands matching any line pass without a prompt (e.g. a staging deploy).

Python 3.8+ standard library only. If the hook itself crashes it fails open with a
message on stderr, because a broken guardrail must not stop all Bash work.
"""
import json
import os
import re
import subprocess
import sys

DEFAULT_PROD_BRANCHES = "main,master,production,prod,release,live"

# (label, pattern). Patterns are searched in each shell segment of the command.
DEPLOY_PATTERNS = [
    ("Vercel production deploy", r"\bvercel\b(?=.*(?:--prod\b|\bpromote\b|--target[= ]production))"),
    ("Netlify production deploy", r"\bnetlify\b\s+deploy\b(?=.*--prod)"),
    ("Cloudflare deploy", r"\bwrangler\b\s+(?:deploy|publish|pages\s+deploy|versions\s+deploy)\b"),
    ("Firebase deploy", r"\bfirebase\b\s+deploy\b"),
    ("Railway deploy", r"\brailway\b\s+(?:up|redeploy|deploy)\b"),
    ("Fly.io deploy", r"\b(?:fly|flyctl)\b\s+deploy\b"),
    ("Render deploy", r"\brender\b\s+deploys?\s+create\b"),
    ("Heroku deploy", r"\bgit\b\s+push\b[^|;&]*\bheroku\b"),
    ("Surge deploy", r"^(?:\S+=\S+\s+)*(?:npx\s+(?:-y\s+)?|bunx\s+)?surge\b"),
    ("GitHub Pages publish", r"\bgh-pages\b\s+-d\b"),
    ("GitHub release", r"\bgh\b\s+release\s+create\b"),
    ("package publish", r"\b(?:npm|pnpm|bun)\b\s+publish\b|\byarn\b\s+(?:npm\s+)?publish\b"),
    ("package publish", r"\bcargo\b\s+publish\b|\btwine\b\s+upload\b|\bgem\b\s+push\b|\bpoetry\b\s+publish\b"),
    ("container push", r"\bdocker\b\s+(?:image\s+)?push\b"),
    ("Shopify theme publish", r"\bshopify\b\s+theme\s+(?:publish|push\b(?=.*(?:--live|--allow-live|-l\b)))"),
    ("Shopify app deploy", r"\bshopify\b\s+app\s+(?:deploy|release)\b"),
    ("S3 upload", r"\baws\b\s+s3\s+(?:sync|cp|mv)\b[^|;&]*\bs3://"),
    ("CDN invalidation", r"\baws\b\s+cloudfront\s+create-invalidation\b"),
    ("infrastructure apply", r"\bterraform\b\s+apply\b|\bpulumi\b\s+up\b|\bcdk\b\s+deploy\b|\bsst\b\s+deploy\b"),
    ("Kubernetes change", r"\bkubectl\b\s+(?:apply|rollout\s+restart|set\s+image|delete)\b|\bhelm\b\s+(?:upgrade|install)\b"),
    ("production database migration", r"\bprisma\b\s+migrate\s+deploy\b|\bsupabase\b\s+db\s+push\b|\bdrizzle-kit\b\s+push\b"),
    ("Expo/EAS release", r"\beas\b\s+(?:submit|update)\b"),
]

SEGMENT_SPLIT = re.compile(r"\|\||&&|;|\||\n")


def _prod_branches():
    raw = os.environ.get("STUDIO_KIT_PROD_BRANCHES", DEFAULT_PROD_BRANCHES)
    return [b.strip() for b in raw.split(",") if b.strip()]


def _current_branch(cwd):
    try:
        for args in (["git", "symbolic-ref", "--short", "-q", "HEAD"],
                     ["git", "rev-parse", "--abbrev-ref", "HEAD"]):
            out = subprocess.run(args, cwd=cwd or None, capture_output=True, text=True, timeout=3)
            if out.returncode == 0 and out.stdout.strip():
                return out.stdout.strip()
        return ""
    except Exception:
        return ""


def _git_push_target(segment, cwd):
    """Return a reason string if this git push would update a production branch."""
    m = re.search(r"\bgit\b(?:\s+-C\s+\S+)?\s+push\b(.*)", segment)
    if not m:
        return ""
    args = [a for a in m.group(1).split() if a]
    flags = [a for a in args if a.startswith("-")]
    positional = [a for a in args if not a.startswith("-")]
    prod = _prod_branches()
    # git push <remote> <refspec>...  -> look at destination side of each refspec
    for ref in positional[1:]:
        dest = ref.split(":")[-1].lstrip("+")
        dest = dest.replace("refs/heads/", "")
        if dest in prod:
            return "git push to production branch '%s'" % dest
        if dest == "HEAD" or ref in ("HEAD",):
            branch = _current_branch(cwd)
            if branch in prod:
                return "git push of HEAD while on '%s'" % branch
    if "--all" in flags or "--mirror" in flags:
        return "git push of all branches"
    if len(positional) <= 1:
        branch = _current_branch(cwd)
        if branch in prod:
            return "git push while on production branch '%s'" % branch
    if any(f in ("-f", "--force") for f in flags):
        branch = _current_branch(cwd)
        if branch in prod:
            return "force push while on '%s'" % branch
    return ""


def find_deploy(command, cwd=""):
    """Return a human label for the first deploy-like action in command, or ''."""
    for segment in SEGMENT_SPLIT.split(command or ""):
        seg = segment.strip()
        if not seg:
            continue
        reason = _git_push_target(seg, cwd)
        if reason:
            return reason
        for label, pattern in DEPLOY_PATTERNS:
            if re.search(pattern, seg):
                return label
    return ""


def _allowlisted(command, cwd):
    project = os.environ.get("CLAUDE_PROJECT_DIR") or cwd or os.getcwd()
    path = os.path.join(project, ".claude", "deploy-gate-allow")
    try:
        with open(path, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line and not line.startswith("#"):
                    try:
                        if re.search(line, command):
                            return True
                    except re.error:
                        continue
    except OSError:
        return False
    return False


def decide(payload):
    """Pure decision function, used by the tests. Returns a hook output dict or None."""
    if payload.get("tool_name") != "Bash":
        return None
    mode = os.environ.get("STUDIO_KIT_DEPLOY_GATE", "ask").strip().lower()
    if mode == "off":
        return None
    command = (payload.get("tool_input") or {}).get("command") or ""
    cwd = payload.get("cwd") or ""
    label = find_deploy(command, cwd)
    if not label or _allowlisted(command, cwd):
        return None
    unattended = payload.get("permission_mode") in ("bypassPermissions", "dontAsk")
    decision = "deny" if (mode == "deny" or unattended) else "ask"
    if decision == "ask":
        reason = ("deploy-gate: this looks like a %s. A person should confirm production "
                  "changes. Approve only if you asked for this deploy." % label)
    else:
        reason = ("deploy-gate blocked a %s. Do not retry or work around this. Stop and ask the "
                  "user to confirm the deploy; they can run the command themselves, or add a "
                  "pattern to .claude/deploy-gate-allow for deploys that never need a prompt." % label)
    return {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": decision,
            "permissionDecisionReason": reason,
        }
    }


def main():
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        out = decide(payload)
    except Exception as exc:  # fail open, loudly
        sys.stderr.write("deploy-gate: hook error, command not checked: %s\n" % exc)
        return 0
    if out:
        sys.stdout.write(json.dumps(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
