# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Thin PEP 723 wrapper that drives dex-core via the command contract.

The skill never re-implements logic. It forwards its arguments to the pinned
`dex-core` engine and lets the engine print the sanitized JSON envelope. Run it
with `uv run --no-project --script "${CLAUDE_SKILL_DIR}/scripts/run.py" <dex
subcommand> ...`.

`uv` is a hard prerequisite: it is what installs and runs the engine. When it is
absent this wrapper refuses with an error envelope naming the install command,
rather than letting the exec fail with a traceback. Invoked through `uv run` the
shell fails first (`uv: command not found`), which is why each SKILL.md also tells
the agent what that message means. Either way the install is the user's to run:
the message leads with package-manager commands rather than a piped installer, so
an agent relaying it has nothing to execute on the user's behalf.

The engine inherits this process's environment, minus what it must not see: see
_child_env.

Two execution modes, chosen automatically:
  - Monorepo checkout (this repo): `packages/dex-core` is found above the skill,
    so the engine runs from an editable local install. This is what makes the
    wrapper work before the package is published.
  - Installed plugin: no local package is present, so the pinned PyPI release is
    installed hermetically by uv.

That environment is uv's own, and `--no-project` is what keeps it that way. Without
it uv discovers whatever Python project the caller happens to be standing in, builds
it, writes a `.venv/` and a `uv.lock` into their repo, and puts their dependencies on
the engine's import path: dex would be leaving unreviewed artifacts in a repo it was
asked only to read, and running against a closure it did not pin.

`--warm` materializes that environment and exits without running a command, so the
install can be paid once out of band instead of on the first caller's clock (see
_warm).

The engine version is pinned; the *extras* are chosen at runtime, so one published
release serves every warehouse and the default install stays light. The connector
extra comes from the active connector; two commands need more than a warehouse
client and say so by being run (see _feature_extras). This wrapper is
stdlib-only and runs before the engine is installed, so it resolves the connector
itself (it cannot import the engine) with the same precedence the engine uses:
an explicit --connector flag, then the top-level `connector:` in the
`.dex/config.yml` found by walking up from the run directory to the git root (the
way git and dbt find their project), then DuckDB. The walk-up must mirror the
engine's: if it did not, a run from a subdirectory would install the DuckDB extra
while the engine resolves the project's real connector and then fails for want of
that connector's deps. The guess only picks which extra to install; the full argv
is still forwarded, so the engine stays authoritative for the actual connection
and a wrong guess surfaces as a clean error envelope.

`DEX_CORE_VERSION` is the single line bumped at release time, by
scripts/prepare_release.sh before the tag; nothing else here changes per release.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

# Rewritten by scripts/prepare_release.sh to the tagged version. The connector
# extra is deliberately NOT part of this pin: it is chosen at runtime (see
# _resolve_connector), so a release artifact is connector-neutral.
DEX_CORE_VERSION = "1.15.1"

# Connector id -> packaging extra. The engine's connector ids and the pyproject
# extras share names, so this is the identity set today. An unknown or unset
# connector falls back to the light DuckDB on-ramp and lets the installed engine
# emit the canonical error rather than the wrapper guessing wrong.
_KNOWN_CONNECTORS = (
    "duckdb",
    "snowflake",
    "bigquery",
    "databricks",
    "postgres",
    "redshift",
    "clickhouse",
    "trino",
)
_DEFAULT_CONNECTOR = "duckdb"

# Credentials that turn up in a developer's or a CI runner's environment and that
# the engine never reads. They are dropped from the engine's environment so
# nothing it loads, dbt and package code included, can pick them up. A denylist
# rather than an allowlist on purpose: connector discovery reads open-ended
# families (DATABASE_URL, PG*, SNOWFLAKE_*, DATABRICKS_*, AWS_*, GOOGLE_*,
# CLICKHOUSE_PASSWORD, TRINO_*, DBT_SL_*) and dbt reads whatever env_var() a
# project names, so an allowlist would break a working setup every time it
# missed one. A private dbt package that authenticated through GITHUB_TOKEN
# should switch to dbt's own DBT_ENV_SECRET_GIT_CREDENTIAL, which passes
# through.
_WITHHELD_FROM_ENGINE = (
    "CLICKHOUSE_CLOUD_API_KEY",
    "CLICKHOUSE_CLOUD_API_SECRET",
    "DEX_TEST_CH_CLOUD_API_KEY",
    "DEX_TEST_CH_CLOUD_API_SECRET",
    "GITHUB_TOKEN",
    "GH_TOKEN",
    "GHRS_TOKEN",
)

# The one flag the wrapper answers itself. It is stripped before anything else
# reads the argv, so it never reaches the engine and never lands in the positionals
# that pick the extras.
_WARM_FLAG = "--warm"


def _connector_from_config(config_path: Path) -> str | None:
    """Read the top-level scalar `connector:` from .dex/config.yml, stdlib only.

    This bootstrap script has no YAML dependency and only needs enough to pick the
    right extra to install, so it scans for a single unindented `connector:` key.
    The engine remains the source of truth for the full config; anything richer or
    malformed here just falls through to the DuckDB default.
    """

    try:
        text = config_path.read_text(encoding="utf-8")
    except OSError:
        return None
    for line in text.splitlines():
        if line.startswith("connector:"):  # top-level only; indented keys ignored
            value = line.split(":", 1)[1].split("#", 1)[0].strip().strip("'\"")
            return value or None
    return None


def _semantic_vendor_from_config(config_path: Path) -> str | None:
    """Read `semantic.vendor` from .dex/config.yml, stdlib only.

    The one nested key this bootstrap reads, because it is the one that decides an
    extra too heavy to install on a guess (see `_SLAYER_COMMANDS`). Block style
    only: the first-level child `vendor:` under an unindented `semantic:` line.
    Anything else, a flow mapping included, reads as unset, which installs no
    SLayer and lets the engine refuse by name with the install line.
    """

    try:
        text = config_path.read_text(encoding="utf-8")
    except OSError:
        return None
    inside = False
    child_indent = None
    for line in text.splitlines():
        body = line.split("#", 1)[0].rstrip()
        if not body.strip():
            continue
        indent = len(body) - len(body.lstrip(" "))
        if indent == 0:
            inside = body == "semantic:"
            child_indent = None
            continue
        if not inside:
            continue
        if child_indent is None:
            child_indent = indent
        if indent == child_indent and body.lstrip().startswith("vendor:"):
            value = body.split(":", 1)[1].strip().strip("'\"").lower()
            return value or None
    return None


def _find_config(start: Path) -> Path | None:
    """Nearest ancestor `.dex/config.yml` at or above `start`, mirroring the
    engine's resolution: walk up to the enclosing git repo (the ceiling), and
    without one do not walk above `start`. Anchors on the file so a subdirectory
    holding only a `.dex/` cache never shadows the real config higher up."""

    start = start.resolve()
    ceiling = start
    for directory in (start, *start.parents):
        if (directory / ".git").exists():
            ceiling = directory
            break
    for directory in (start, *start.parents):
        candidate = directory / ".dex" / "config.yml"
        if candidate.is_file():
            return candidate
        if directory == ceiling:
            break
    return None


def _resolve_connector(argv: list[str], cwd: Path) -> str:
    """Pick the connector whose extra we install, mirroring the engine's order:
    explicit --connector, then the walked-up .dex/config.yml, then DuckDB."""

    # allow_abbrev=False and parse_known_args so we only peek at these two flags
    # and never consume or reorder the argv that is forwarded to the engine.
    parser = argparse.ArgumentParser(add_help=False, allow_abbrev=False)
    parser.add_argument("--connector")
    parser.add_argument("--repo-root", default=".")
    known, _ = parser.parse_known_args(argv)

    connector = known.connector
    if connector is None:
        config_path = _find_config(cwd / known.repo_root)
        if config_path is not None:
            connector = _connector_from_config(config_path)
    return connector if connector in _KNOWN_CONNECTORS else _DEFAULT_CONNECTOR


def _resolve_semantic_vendor(argv: list[str], cwd: Path) -> str | None:
    """The configured `semantic.vendor`, from the same walked-up .dex/config.yml
    the connector comes from, or None where nothing says."""

    parser = argparse.ArgumentParser(add_help=False, allow_abbrev=False)
    parser.add_argument("--repo-root", default=".")
    known, _ = parser.parse_known_args(argv)
    config_path = _find_config(cwd / known.repo_root)
    if config_path is None:
        return None
    return _semantic_vendor_from_config(config_path)


# Every value-taking flag this peek has to consume, so a flag's *value* is never
# mistaken for the group, subcommand, or mode being run. The global connection
# flags, plus the ones `explore semantic` takes, because a metric read as a mode
# picks the wrong extras. `tests/test_skill_wrapper.py` holds this list to the
# real parser, since a flag added there and forgotten here fails silently.
_VALUE_FLAGS = (
    "--connector",
    "--path",
    "--scope",
    "--project",
    "--dataset",
    "--repo-root",
    "--budget",
    "--session-ceiling",
    "--metric",
    "--for-dimension",
    "--search",
    "--group-by",
    "--where",
    "--order-by",
    "--grain",
    "--limit",
)

# The `explore semantic` modes that can render a statement here. Bare
# `explore semantic` lists, so an absent mode is `list`, which renders none on
# either backend and therefore never needs the renderer.
_SEMANTIC_RENDERING_MODES = ("values", "query")

# The commands that can read a native Ossie semantic layer, as (group,
# subcommand). The `ossie` extra is `jsonschema` and nothing heavier, so it is
# taken whenever the layer *might* be read rather than resolved from
# `semantic.vendor`, which sits in a nested config block this bootstrap does not
# parse (#536). Without it the engine refuses by name when the vendor is `ossie`,
# which is the correct refusal and the one this exists to prevent; on BigQuery it
# worked only because that connector's own tree happened to carry `jsonschema`.
_OSSIE_READING_COMMANDS = (
    ("explore", "semantic"),
    ("semantic", "ossie"),
    ("maintain", "semantic"),
    ("maintain", "check"),
    ("maintain", "snapshot"),
)


# SLayer is the opposite trade. Its extra brings FastAPI, uvicorn, mcp, duckdb,
# jafgen and tantivy, far too much to install on every `maintain` run of every
# repository, so it follows the config instead: `semantic slayer` always takes it,
# and a command that reads the semantic layer takes it only where
# `semantic.vendor` is `slayer` (read by `_semantic_vendor_from_config`): every
# `maintain` command, `explore semantic`, `transform apply` (a SLayer plan is
# validated again as it is written), and an `explore` command asked to fold the
# layer in with `--use-project`. Where the read misses, the engine refuses by
# name with the install line rather than failing on an import.
_SLAYER_COMMANDS = (("semantic", "slayer"),)
_SLAYER_BACKED_GROUPS = ("maintain",)
_SLAYER_BACKED_COMMANDS = (("explore", "semantic"), ("transform", "apply"))
_SLAYER_BACKED_FLAG = "--use-project"
_SLAYER_VENDOR = "slayer"


def _positionals(argv: list[str]) -> list[str]:
    """The bare tokens of an invocation: group, subcommand, and whatever follows.

    Flag-position agnostic, which is the point: the value flags above are consumed
    so the group and subcommand are the first two bare tokens wherever the
    connection flags sit."""

    parser = argparse.ArgumentParser(add_help=False, allow_abbrev=False)
    for flag in _VALUE_FLAGS:
        parser.add_argument(flag)
    _, remaining = parser.parse_known_args(argv)
    return [tok for tok in remaining if not tok.startswith("-")]


def _feature_extras(argv: list[str], vendor: str | None = None) -> list[str]:
    """The extras this invocation needs on top of the connector's.

    Two commands need more than a warehouse client, and both are resolved from the
    command rather than installed always, so a repo that never clusters and never
    queries a semantic layer resolves neither scikit-learn nor MetricFlow.

    `explore semantic` needs the hosted client on any of its subcommands, which is
    an httpx and nothing heavier. It needs MetricFlow only where a statement might
    be rendered *here*: `list` renders none on either backend, and `--api` sends
    the request to dbt Cloud, which renders and executes it there.

    Where the flag is absent the backend is ambient, chosen by `semantic.deployment`
    in a nested config block this bootstrap deliberately does not parse, so a mode
    that could execute either way takes both. That errs toward a heavier install
    and never toward a command that refuses for want of a dependency, which is the
    failure this exists to prevent.

    The same rule gives every command in `_OSSIE_READING_COMMANDS` the `ossie`
    extra: whether the layer is native Ossie is `semantic.vendor`, in that same
    nested block, so the extra follows the command rather than the config.

    `slayer` is the exception that does read `vendor`, the configured
    `semantic.vendor`, because it is too heavy to take on a guess (see
    `_SLAYER_COMMANDS`). The same read keeps MetricFlow out of a SLayer `query` or
    `values`: SLayer renders those itself, so `semantic` would be installed for
    nothing.
    """

    positionals = _positionals(argv)
    command = tuple(positionals[:2])
    if command == ("explore", "cluster"):
        return ["cluster"]
    extras = ["ossie"] if command in _OSSIE_READING_COMMANDS else []
    group = command[0] if command else None
    reads_layer = (
        group in _SLAYER_BACKED_GROUPS
        or command in _SLAYER_BACKED_COMMANDS
        or (group == "explore" and _SLAYER_BACKED_FLAG in argv)
    )
    if command in _SLAYER_COMMANDS or (vendor == _SLAYER_VENDOR and reads_layer):
        extras.append("slayer")
    if command != ("explore", "semantic"):
        return extras
    mode = positionals[2] if len(positionals) > 2 else "list"
    renders_with_metricflow = vendor != _SLAYER_VENDOR and "--api" not in argv
    if mode in _SEMANTIC_RENDERING_MODES and renders_with_metricflow:
        return [*extras, "semantic-api", "semantic"]
    return [*extras, "semantic-api"]


def _engine_spec(extras: str, skill_dir: Path | None = None) -> list[str]:
    # The skill directory is where this file lives, never an environment variable:
    # the harness already ran `${CLAUDE_SKILL_DIR}/scripts/run.py`, and honoring
    # the variable a second time would let whoever controls the environment point
    # uv at a different `packages/dex-core` to install and run. `skill_dir` exists
    # for tests.
    skill_dir = skill_dir or Path(__file__).resolve().parent.parent
    local_pkg = (skill_dir / ".." / ".." / "packages" / "dex-core").resolve()
    if local_pkg.is_dir():
        # Resolve the local package WITH the resolved extras (a plain path drops
        # extras). Non-editable is fine: the engine is imported fresh each run.
        return ["--with", f"exmergo-dex-core[{extras}] @ {local_pkg.as_uri()}"]
    return ["--with", f"exmergo-dex-core[{extras}]=={DEX_CORE_VERSION}"]


def _extras(argv: list[str]) -> list[str]:
    """The full extras list for an invocation: the connector's, plus whatever the
    command itself needs.

    Warm-up and a real run both resolve here, on the same argv, which is what stops
    a warmed environment from disagreeing with the one the next command asks for."""

    cwd = Path.cwd()
    return [
        _resolve_connector(argv, cwd),
        *_feature_extras(argv, _resolve_semantic_vendor(argv, cwd)),
    ]


def _uv_run(engine_spec: list[str], tail: list[str]) -> list[str]:
    """The single uv invocation this wrapper makes.

    `--no-project` is a correctness flag before it is a fast one: see the module
    docstring for what uv does to the caller's repo without it. The latency follows
    from the same thing, because installing the caller's project is far more work
    than resolving the engine."""

    return ["uv", "run", "--no-project", *engine_spec, *tail]


def _child_env() -> dict[str, str]:
    """The environment the engine (and the warm-up's uv) runs with.

    This process's environment minus the credentials listed in
    _WITHHELD_FROM_ENGINE and minus `VIRTUAL_ENV`: the engine runs in uv's own
    ephemeral environment, so an inherited one (the user's activated venv) is
    irrelevant there and only makes uv print a mismatch warning on every call.
    A copy, so this process's own environment is left as it was found.
    """

    withheld = {*_WITHHELD_FROM_ENGINE, "VIRTUAL_ENV"}
    return {key: value for key, value in os.environ.items() if key not in withheld}


def _envelope(
    status: str,
    *,
    data: dict[str, object] | None = None,
    errors: list[str] | None = None,
    reason: str | None = None,
) -> str:
    """One JSON line in the engine's envelope shape, built by hand.

    The wrapper prints an envelope for the few things that happen before the engine
    exists to print its own: the missing-uv refusal and the warm-up. It cannot
    import `exmergo_dex_core.envelope` for precisely that reason, so the keys are
    mirrored here and have to stay in step with Envelope and Cost. `cost.paradigm`
    stays null throughout, because nothing here opens a connection and `free_local`
    is a positive claim that the connector in play bills nothing rather than a
    stand-in for "no connector was involved". `reason` is populated only on an
    error, the same rule the engine's Reason enum follows.
    """

    return json.dumps(
        {
            "status": status,
            "data": data or {},
            "cost": {"paradigm": None, "estimate": None, "ceiling": None},
            "warnings": [],
            "diffs": [],
            "errors": errors or [],
            "reason": reason,
        }
    )


def _warm(argv: list[str]) -> int:
    """Materialize the engine environment and exit, without running a command.

    Nearly all of a first command's latency is uv resolving and installing the
    engine's closure. This pays it out of band, at container build, plugin install,
    or a CI setup step, so no interactive caller waits for it.

    The extras come from `_extras` on the argv that remains after `--warm` is
    stripped, so warm-up can never install something a later command contradicts:
    bare `--warm` warms the connector this directory resolves to, `--warm
    --connector snowflake` warms a named one before any project exists, and `--warm
    explore cluster` warms exactly what that command needs. The last form earns its
    keep because a feature extra resolves into an environment of its own, so
    warming the connector alone leaves `explore cluster` and `explore semantic`
    cold.
    """

    extras = _extras(argv)
    spec = _engine_spec(",".join(extras))
    started = time.monotonic()
    # Captured rather than inherited: uv narrates resolution and installation, and
    # stdout here carries one envelope and nothing else.
    completed = subprocess.run(
        _uv_run(spec, ["python", "-c", "import exmergo_dex_core"]),
        capture_output=True,
        text=True,
        env=_child_env(),
    )
    elapsed = round(time.monotonic() - started, 3)
    if completed.returncode != 0:
        lines = [line.strip() for line in completed.stderr.splitlines() if line.strip()]
        print(
            _envelope(
                "error",
                errors=[
                    f"warm-up could not install {spec[1]}. uv reported: "
                    + (" ".join(lines[-3:]) or "nothing on stderr")
                ],
                reason="prerequisite",
            )
        )
        return 1
    print(
        _envelope(
            "ok",
            data={
                "engine": spec[1],
                "connector": extras[0],
                "extras": extras,
                "elapsed_seconds": elapsed,
            },
        )
    )
    return 0


def main() -> int:
    argv = sys.argv[1:]
    if shutil.which("uv") is None:
        # The one refusal that happens before the engine exists, which is why the
        # envelope is hand-built. `prerequisite` is the engine's own classification
        # for a missing dependency the user installs and retries (the same one
        # DemoDependencyError and DialectDependencyError carry), so a caller reads
        # this exactly like any other refusal instead of parsing a traceback.
        print(
            _envelope(
                "error",
                errors=[
                    "dex runs its engine through uv, which was not found on "
                    "PATH. Install it with `brew install uv` or `pipx install uv` "
                    "(other platforms: "
                    "https://docs.astral.sh/uv/getting-started/installation/), "
                    "then re-run. An agent relays this to the user rather than "
                    "running an installer itself."
                ],
                reason="prerequisite",
            )
        )
        return 1
    if _WARM_FLAG in argv:
        return _warm([arg for arg in argv if arg != _WARM_FLAG])
    # The connector extra is always installed; `explore cluster` and
    # `explore semantic` add what only they need, so the default install stays
    # light for every repo that runs neither.
    cmd = _uv_run(
        _engine_spec(",".join(_extras(argv))),
        ["python", "-m", "exmergo_dex_core", *argv],
    )
    if os.name != "posix":
        # Windows keeps the spawn: exec there hands control back to the shell
        # before the child finishes, and the prompt would interleave with the one
        # envelope a caller is reading off stdout.
        return subprocess.call(cmd, env=_child_env())
    # Exec rather than spawn everywhere else: the wrapper has nothing left to do
    # once the engine starts, and replacing the process hands over the terminal,
    # the signals, and the exit code directly instead of relaying them through a
    # parent that is only waiting.
    os.execvpe(cmd[0], cmd, _child_env())
    return 0  # os.execvpe does not return; this keeps the signature a plain int


if __name__ == "__main__":
    sys.exit(main())
