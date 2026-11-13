#!/usr/bin/env python3
"""secret-guard: a PreToolUse hook that keeps API keys out of client bundles and git.

It inspects Write / Edit / MultiEdit / NotebookEdit / Bash calls before they run and
blocks the three ways small web projects leak keys:

  1. a secret key written into source code (it ends up in the repo and often in the bundle);
  2. a secret given a browser-exposed env name (VITE_, NEXT_PUBLIC_, PUBLIC_, REACT_APP_ ...),
     which the build inlines into JavaScript anyone can read;
  3. `git add` of a .env file, or `git add -A` / `git commit -a` while a .env is not ignored.

Secrets in a real .env file (server-side names) are fine: that is where they belong.
Findings are reported masked (prefix + length), never in full.

Settings:
  STUDIO_KIT_SECRET_GUARD  on (default: deny high-confidence, ask otherwise) | ask | off
Per-project path allowlist (glob per line, relative to the project):
  .claude/secret-guard-allow     e.g.  tests/fixtures/*

Python 3.8+ standard library only. Fails open with a stderr message on internal errors.
"""
import base64
import fnmatch
import json
import os
import re
import subprocess
import sys

HIGH = "high"
MEDIUM = "medium"

# (provider, severity, regex). Regexes describe the shape of a key; no real key appears here.
SECRET_PATTERNS = [
    ("Stripe secret key", HIGH, r"\b[sr]k_(?:live|test)_[0-9A-Za-z]{20,}"),
    ("Stripe webhook secret", HIGH, r"\bwhsec_[0-9A-Za-z+/=]{20,}"),
    ("Anthropic API key", HIGH, r"\bsk-ant-[0-9A-Za-z_\-]{20,}"),
    ("OpenAI API key", HIGH, r"\bsk-(?:proj-|svcacct-|admin-)?[0-9A-Za-z_\-]{32,}"),
    ("AWS access key id", HIGH, r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b"),
    ("GitHub token", HIGH, r"\b(?:gh[pousr]_[0-9A-Za-z]{36,}|github_pat_[0-9A-Za-z_]{40,})"),
    ("GitLab token", HIGH, r"\bglpat-[0-9A-Za-z_\-]{20,}"),
    ("Slack token", HIGH, r"\bxox[abposr]-[0-9A-Za-z\-]{10,}"),
    ("private key block", HIGH, r"-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP |ENCRYPTED )?PRIVATE KEY-----"),
    ("Shopify access token", HIGH, r"\bshp(?:at|ss|ca|pa)_[0-9a-fA-F]{32}\b"),
    ("SendGrid API key", HIGH, r"\bSG\.[0-9A-Za-z_\-]{20,}\.[0-9A-Za-z_\-]{30,}"),
    ("Brevo API key", HIGH, r"\bxkeysib-[0-9a-f]{64}-[0-9A-Za-z]{16}\b"),
    ("Groq API key", HIGH, r"\bgsk_[0-9A-Za-z]{40,}"),
    ("Hugging Face token", HIGH, r"\bhf_[0-9A-Za-z]{30,}"),
    ("Replicate token", HIGH, r"\br8_[0-9A-Za-z]{30,}"),
    ("xAI API key", HIGH, r"\bxai-[0-9A-Za-z]{40,}"),
    ("npm token", HIGH, r"\bnpm_[0-9A-Za-z]{36}\b"),
    ("Mailgun API key", HIGH, r"\bkey-[0-9a-f]{32}\b"),
    ("Google API key", MEDIUM, r"\bAIza[0-9A-Za-z_\-]{35}\b"),
]

JWT_RE = re.compile(r"\beyJ[0-9A-Za-z_\-]{8,}\.(eyJ[0-9A-Za-z_\-]{8,})\.[0-9A-Za-z_\-]{8,}")
GENERIC_ASSIGN_RE = re.compile(
    r"(?i)\b([A-Za-z0-9_]*(?:api[_-]?key|secret|token|passw(?:or)?d|private[_-]?key)[A-Za-z0-9_]*)"
    r"\s*[:=]\s*[\"']([^\"'\s]{16,})[\"']"
)
CLIENT_PREFIXES = r"(?:VITE|NEXT_PUBLIC|PUBLIC|REACT_APP|EXPO_PUBLIC|NUXT_PUBLIC|GATSBY|VUE_APP|STORYBOOK|SVELTEKIT_PUBLIC)"
CLIENT_ENV_RE = re.compile(r"\b(" + CLIENT_PREFIXES + r"_[A-Z0-9_]+)\s*[:=]\s*[\"']?([^\s\"'#]*)")
CLIENT_SECRET_NAME_RE = re.compile(r"SECRET|PRIVATE|PASSWORD|PASSWD|SERVICE_ROLE|ADMIN|WEBHOOK")
PLACEHOLDER_RE = re.compile(r"(?i)x{4,}|your|example|placeholder|dummy|changeme|replace|redacted|<|>|\.\.\.|\*{3,}|0{8,}")
ENV_FILE_RE = re.compile(r"^\.env(?:\.[A-Za-z0-9_\-]+)*$")
ENV_EXAMPLE_RE = re.compile(r"(?i)\.(?:example|sample|template|dist|defaults?)$")


def _mask(value):
    value = value.strip()
    return "%s... (%d chars)" % (value[:6], len(value))


def _is_placeholder(value):
    v = value.strip()
    if len(set(v)) < 8:
        return True
    return bool(PLACEHOLDER_RE.search(v))


def _jwt_role(token_payload):
    try:
        padded = token_payload + "=" * (-len(token_payload) % 4)
        data = json.loads(base64.urlsafe_b64decode(padded.encode()).decode("utf-8", "replace"))
        return str(data.get("role") or "")
    except Exception:
        return ""


def scan_text(text):
    """Return a list of findings: dicts with provider, severity, masked, kind."""
    findings = []
    seen = set()
    for provider, severity, pattern in SECRET_PATTERNS:
        for m in re.finditer(pattern, text or ""):
            value = m.group(0)
            if provider != "private key block" and _is_placeholder(value):
                continue
            key = (provider, value)
            if key in seen:
                continue
            seen.add(key)
            findings.append({"provider": provider, "severity": severity, "masked": _mask(value), "kind": "secret"})
    for m in JWT_RE.finditer(text or ""):
        if _jwt_role(m.group(1)) == "service_role":
            findings.append({"provider": "Supabase service_role key", "severity": HIGH,
                             "masked": _mask(m.group(0)), "kind": "secret"})
    for m in GENERIC_ASSIGN_RE.finditer(text or ""):
        name, value = m.group(1), m.group(2)
        if _is_placeholder(value) or value.startswith(("process.env", "import.meta", "os.environ", "${")):
            continue
        if any(f["masked"].startswith(value[:6]) for f in findings):
            continue
        findings.append({"provider": "hardcoded value for '%s'" % name, "severity": MEDIUM,
                         "masked": _mask(value), "kind": "assignment"})
    return findings


def scan_client_env(text):
    """Secrets given a browser-exposed env name."""
    findings = []
    for m in CLIENT_ENV_RE.finditer(text or ""):
        name, value = m.group(1), m.group(2)
        if not value or _is_placeholder(value):
            continue
        if CLIENT_SECRET_NAME_RE.search(name):
            findings.append({"provider": "%s is bundled into browser JavaScript" % name, "severity": HIGH,
                             "masked": _mask(value), "kind": "client-env"})
            continue
        inner = scan_text(value)
        if any(f["severity"] == HIGH for f in inner):
            prov = inner[0]["provider"]
            article = "an" if prov[:1].upper() in "AEIOU" else "a"
            findings.append({"provider": "%s holds %s %s and is bundled into browser JavaScript"
                             % (name, article, prov), "severity": HIGH,
                             "masked": _mask(value), "kind": "client-env"})
    return findings


def _project_dir(payload):
    return os.environ.get("CLAUDE_PROJECT_DIR") or payload.get("cwd") or os.getcwd()


def _allowlisted_path(path, payload):
    if not path:
        return False
    project = _project_dir(payload)
    rel = os.path.relpath(os.path.abspath(path), project) if os.path.isabs(path) else path
    try:
        with open(os.path.join(project, ".claude", "secret-guard-allow"), encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line and not line.startswith("#") and fnmatch.fnmatch(rel, line):
                    return True
    except OSError:
        return False
    return False


def _file_findings(path, text):
    base = os.path.basename(path or "")
    findings = scan_client_env(text)
    if ENV_FILE_RE.match(base) and not ENV_EXAMPLE_RE.search(base):
        return findings  # a real, server-side .env is the right home for secrets
    covered = {f["masked"] for f in findings}
    for f in scan_text(text):
        if f["masked"] not in covered:
            findings.append(f)
    if re.search(r"(?i)(^|/)(tests?|__tests__|fixtures?|spec)(/|$)", path or ""):
        for f in findings:
            f["severity"] = MEDIUM  # test fixtures: ask, do not block
    return findings


def _env_files_not_ignored(cwd):
    bad = []
    try:
        names = os.listdir(cwd or ".")
    except OSError:
        return bad
    for name in names:
        if ENV_FILE_RE.match(name) and not ENV_EXAMPLE_RE.search(name):
            try:
                r = subprocess.run(["git", "check-ignore", "-q", name], cwd=cwd or None,
                                   capture_output=True, timeout=3)
                if r.returncode == 1:  # 1 = not ignored, 128 = not a repo
                    bad.append(name)
            except Exception:
                continue
    return bad


def _bash_findings(command, cwd):
    findings = []
    for seg in re.split(r"\|\||&&|;|\n", command or ""):
        m = re.search(r"\bgit\b(?:\s+-C\s+\S+)?\s+(add|commit|stage)\b(.*)", seg)
        if not m:
            continue
        verb, rest = m.group(1), m.group(2)
        args = rest.split()
        named_env = [a for a in args if ENV_FILE_RE.match(os.path.basename(a.strip("'\"")))
                     and not ENV_EXAMPLE_RE.search(a.strip("'\""))]
        if named_env and verb in ("add", "stage"):
            findings.append({"provider": "git %s of %s" % (verb, ", ".join(named_env)), "severity": HIGH,
                             "masked": "env file", "kind": "git"})
            continue
        broad = (verb in ("add", "stage") and any(a in (".", "-A", "--all", "*", ":/") for a in args)) or \
                (verb == "commit" and any(re.match(r"^-[a-zA-Z]*a", a) or a == "--all" for a in args))
        if broad:
            for name in _env_files_not_ignored(cwd):
                findings.append({"provider": "%s is not in .gitignore and 'git %s' would include it" % (name, verb),
                                 "severity": HIGH, "masked": "env file", "kind": "git"})
    # secrets written to a file from the shell (echo/printf/tee/heredoc), outside .env files
    if re.search(r">>?|\btee\b", command or ""):
        targets = re.findall(r"(?:>>?|\btee\s+(?:-a\s+)?)\s*([^\s;|&]+)", command)
        if targets and not all(ENV_FILE_RE.match(os.path.basename(t)) and not ENV_EXAMPLE_RE.search(t)
                               for t in targets):
            findings.extend(f for f in scan_text(command) if f["kind"] == "secret")
    return findings


def decide(payload):
    mode = os.environ.get("STUDIO_KIT_SECRET_GUARD", "on").strip().lower()
    if mode == "off":
        return None
    tool = payload.get("tool_name") or ""
    ti = payload.get("tool_input") or {}
    findings = []
    path = ti.get("file_path") or ti.get("notebook_path") or ""
    if tool == "Write":
        findings = _file_findings(path, ti.get("content") or "")
    elif tool == "Edit":
        findings = _file_findings(path, ti.get("new_string") or "")
    elif tool == "MultiEdit":
        findings = _file_findings(path, "\n".join(e.get("new_string") or "" for e in ti.get("edits") or []))
    elif tool == "NotebookEdit":
        findings = _file_findings(path, ti.get("new_source") or "")
    elif tool == "Bash":
        findings = _bash_findings(ti.get("command") or "", payload.get("cwd") or "")
    else:
        return None
    if not findings or (path and _allowlisted_path(path, payload)):
        return None
    high = any(f["severity"] == HIGH for f in findings)
    decision = "deny" if (high and mode != "ask") else "ask"
    lines = ["- %s: %s" % (f["provider"], f["masked"]) for f in findings[:6]]
    advice = ("Keep secrets server-side: put the value in a gitignored .env under a name WITHOUT a "
              "browser prefix (not VITE_/NEXT_PUBLIC_/PUBLIC_/REACT_APP_), read it only in server code "
              "(API route, edge function, backend), and reference it by name. For .env files: add them "
              "to .gitignore and commit a .env.example with empty values.")
    head = "secret-guard blocked this change" if decision == "deny" else "secret-guard: possible secret, confirm"
    target = (" in %s" % path) if path else ""
    reason = "%s%s:\n%s\n%s" % (head, target, "\n".join(lines), advice)
    if decision == "deny":
        reason += " Do not retry with the same value or split it to evade this check; tell the user."
    return {"hookSpecificOutput": {"hookEventName": "PreToolUse",
                                   "permissionDecision": decision,
                                   "permissionDecisionReason": reason}}


def main():
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        out = decide(payload)
    except Exception as exc:
        sys.stderr.write("secret-guard: hook error, change not checked: %s\n" % exc)
        return 0
    if out:
        sys.stdout.write(json.dumps(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
