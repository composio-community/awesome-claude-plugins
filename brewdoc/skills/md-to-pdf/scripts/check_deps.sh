#!/usr/bin/env bash
set -euo pipefail

# md-to-pdf dependency checker: check_deps.sh <check|install> <reportlab|weasyprint> | status | help.
# Exit codes: 0 = OK, 1 = MISSING_*, 2 = bad usage

SCRIPT_NAME="$(basename "$0")"
MIN_PYTHON_MAJOR=3
MIN_PYTHON_MINOR=8

# --- Helpers ---

usage() {
    cat <<EOF
Usage: $SCRIPT_NAME <command> [engine]

Commands:
  check   <engine>   Check dependencies (reportlab | weasyprint)
  install <engine>   Install missing dependencies (reportlab | weasyprint)
  status             Show all engines' dependency status

Engines:
  reportlab    Pure-Python PDF (pip: reportlab)
  weasyprint   HTML-based PDF (pip: weasyprint markdown pygments; brew: pango cairo gdk-pixbuf libffi)

Exit codes:
  0  OK — all dependencies present
  1  MISSING_PYTHON | MISSING_SYSTEM | MISSING_PIP
  2  Bad usage
EOF
}

die_usage() {
    echo "$1" >&2
    echo "Run '$SCRIPT_NAME help' for usage." >&2
    exit 2
}

is_macos() { [[ "$(uname -s)" == "Darwin" ]]; }

# --- Python version check (common to both engines) ---

check_python() {
    if ! command -v python3 &>/dev/null; then
        echo "MISSING_PYTHON"
        return 1
    fi

    local ver
    ver="$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
    local major minor
    major="${ver%%.*}"
    minor="${ver##*.}"

    if (( major < MIN_PYTHON_MAJOR )) || { (( major == MIN_PYTHON_MAJOR )) && (( minor < MIN_PYTHON_MINOR )); }; then
        echo "MISSING_PYTHON"
        return 1
    fi
    return 0
}

# --- Pip package checks ---

# pip_spec <import-name>
# Pinned install spec per package. Versions verified at PyPI 2026-10-12.
pip_spec() {
    case "$1" in
        reportlab)  echo "reportlab==5.0.1" ;;
        weasyprint) echo "weasyprint==70.0" ;;
        markdown)   echo "markdown==3.11" ;;
        pygments)   echo "pygments==2.21.0" ;;
        *)          echo "$1" ;;
    esac
}

# install_pip_packages <missing-csv> <pkg1> <pkg2> ...: install via SAME interpreter as conversion, re-import;
# bare `pip3` can succeed into a different interpreter and leave conversion broken.
install_pip_packages() {
    local missing="$1"
    shift
    local -a pkgs specs
    IFS=',' read -ra pkgs <<< "$missing"
    specs=()
    for pkg in "${pkgs[@]}"; do
        specs+=("$(pip_spec "$pkg")")
    done
    echo "Installing pip packages: ${specs[*]}" >&2
    if ! python3 -m pip install "${specs[@]}"; then
        echo "INSTALL_FAILED|pip refused; on an externally managed Python (PEP 668) activate a venv or set PIP_BREAK_SYSTEM_PACKAGES=1, then retry" >&2
        return 1
    fi

    local still
    still="$(check_pip_packages "$@")"
    if [[ -n "$still" ]]; then
        echo "INSTALL_INCOMPLETE|$still" >&2
        echo "Installed into $(python3 -c 'import sys; print(sys.prefix)') but the import still fails." >&2
        return 1
    fi
}

# check_pip_packages <pkg1> <pkg2> ...
# Prints comma-separated list of missing packages (empty if all present).
check_pip_packages() {
    local missing=()
    for pkg in "$@"; do
        if ! python3 -c "import $pkg" &>/dev/null; then
            missing+=("$pkg")
        fi
    done
    if (( ${#missing[@]} == 0 )); then
        echo ""
    else
        local IFS=','
        echo "${missing[*]}"
    fi
}

# --- Brew / system package checks (weasyprint only) ---

WEASYPRINT_BREW_PKGS=(pango cairo gdk-pixbuf libffi)

# macOS checks brew; Linux falls back to pkg-config (apt equivalents differ:
# libpango1.0-dev libcairo2-dev libgdk-pixbuf2.0-dev libffi-dev).

check_system_packages() {
    local missing=()
    if is_macos; then
        for pkg in "${WEASYPRINT_BREW_PKGS[@]}"; do
            if ! brew list "$pkg" &>/dev/null; then
                missing+=("$pkg")
            fi
        done
    else
        # Linux: use pkg-config as a heuristic
        local -A linux_pc_names=(
            [pango]="pango"
            [cairo]="cairo"
            [gdk-pixbuf]="gdk-pixbuf-2.0"
            [libffi]="libffi"
        )
        for pkg in "${WEASYPRINT_BREW_PKGS[@]}"; do
            local pc="${linux_pc_names[$pkg]}"
            if ! pkg-config --exists "$pc" &>/dev/null 2>&1; then
                missing+=("$pkg")
            fi
        done
    fi
    if (( ${#missing[@]} == 0 )); then
        echo ""
    else
        local IFS=','
        echo "${missing[*]}"
    fi
}

# --- check command ---

cmd_check() {
    local engine="${1:-}"
    [[ -z "$engine" ]] && die_usage "Engine required. Use: reportlab | weasyprint"

    # Common: python3 >= 3.8
    local py_result
    py_result="$(check_python)" || { echo "$py_result"; exit 1; }

    case "$engine" in
        reportlab)
            local pip_missing
            pip_missing="$(check_pip_packages reportlab)"
            if [[ -n "$pip_missing" ]]; then
                echo "MISSING_PIP|$pip_missing"
                exit 1
            fi
            echo "OK"
            ;;
        weasyprint)
            local sys_missing pip_missing
            sys_missing="$(check_system_packages)"
            pip_missing="$(check_pip_packages weasyprint markdown pygments)"

            if [[ -n "$sys_missing" ]]; then
                echo "MISSING_SYSTEM|$sys_missing"
                exit 1
            fi
            if [[ -n "$pip_missing" ]]; then
                echo "MISSING_PIP|$pip_missing"
                exit 1
            fi
            echo "OK"
            ;;
        *)
            die_usage "Unknown engine: $engine. Use: reportlab | weasyprint"
            ;;
    esac
}

# --- install command ---

cmd_install() {
    local engine="${1:-}"
    [[ -z "$engine" ]] && die_usage "Engine required. Use: reportlab | weasyprint"

    # Ensure python3 exists first
    if ! command -v python3 &>/dev/null; then
        echo "python3 not found. Install Python >= $MIN_PYTHON_MAJOR.$MIN_PYTHON_MINOR first." >&2
        exit 1
    fi

    case "$engine" in
        reportlab)
            local pip_missing
            pip_missing="$(check_pip_packages reportlab)"
            if [[ -z "$pip_missing" ]]; then
                echo "OK"
                return
            fi
            install_pip_packages "$pip_missing" reportlab
            echo "OK"
            ;;
        weasyprint)
            local sys_missing pip_missing

            sys_missing="$(check_system_packages)"
            if [[ -n "$sys_missing" ]]; then
                if is_macos; then
                    echo "Installing brew packages: $sys_missing" >&2
                    IFS=',' read -ra pkgs <<< "$sys_missing"
                    brew install "${pkgs[@]}"
                else
                    echo "Missing system packages: $sys_missing" >&2
                    echo "On Debian/Ubuntu: sudo apt-get install libpango1.0-dev libcairo2-dev libgdk-pixbuf2.0-dev libffi-dev" >&2
                    exit 1
                fi
            fi

            pip_missing="$(check_pip_packages weasyprint markdown pygments)"
            if [[ -n "$pip_missing" ]]; then
                install_pip_packages "$pip_missing" weasyprint markdown pygments
            fi
            echo "OK"
            ;;
        *)
            die_usage "Unknown engine: $engine. Use: reportlab | weasyprint"
            ;;
    esac
}

# --- status command ---

label_status() {
    # $1 = check result (OK or MISSING_*)
    if [[ "$1" == "OK" ]]; then
        echo "installed"
    else
        echo "missing"
    fi
}

cmd_status() {
    echo "| Component       | Status    | Detail                     |"
    echo "|-----------------|-----------|----------------------------|"

    # Python
    local py_result py_status py_detail
    set +e
    py_result="$(check_python)"
    local py_rc=$?
    set -e

    if (( py_rc == 0 )); then
        py_status="installed"
        py_detail="$(python3 --version 2>&1)"
    else
        py_status="missing"
        py_detail="Require >= $MIN_PYTHON_MAJOR.$MIN_PYTHON_MINOR"
    fi
    printf "| %-15s | %-9s | %-26s |\n" "python3" "$py_status" "$py_detail"

    # reportlab pip
    local rl_missing rl_status rl_detail
    if (( py_rc == 0 )); then
        rl_missing="$(check_pip_packages reportlab)"
        if [[ -z "$rl_missing" ]]; then
            rl_status="installed"
            rl_detail="reportlab"
        else
            rl_status="missing"
            rl_detail="pip: $rl_missing"
        fi
    else
        rl_status="unknown"
        rl_detail="python3 required"
    fi
    printf "| %-15s | %-9s | %-26s |\n" "reportlab" "$rl_status" "$rl_detail"

    # weasyprint system deps
    local ws_sys_missing ws_sys_status ws_sys_detail
    ws_sys_missing="$(check_system_packages)"
    if [[ -z "$ws_sys_missing" ]]; then
        ws_sys_status="installed"
        ws_sys_detail="pango cairo gdk-pixbuf libffi"
    else
        ws_sys_status="missing"
        ws_sys_detail="brew: $ws_sys_missing"
    fi
    printf "| %-15s | %-9s | %-26s |\n" "weasy-system" "$ws_sys_status" "$ws_sys_detail"

    # weasyprint pip deps
    local wp_missing wp_status wp_detail
    if (( py_rc == 0 )); then
        wp_missing="$(check_pip_packages weasyprint markdown pygments)"
        if [[ -z "$wp_missing" ]]; then
            wp_status="installed"
            wp_detail="weasyprint markdown pygments"
        else
            wp_status="missing"
            wp_detail="pip: $wp_missing"
        fi
    else
        wp_status="unknown"
        wp_detail="python3 required"
    fi
    printf "| %-15s | %-9s | %-26s |\n" "weasy-pip" "$wp_status" "$wp_detail"
}

# --- Main dispatch ---

CMD="${1:-help}"
shift 2>/dev/null || true

case "$CMD" in
    check)   cmd_check "$@" ;;
    install) cmd_install "$@" ;;
    status)  cmd_status ;;
    help|-h|--help) usage ;;
    *)       die_usage "Unknown command: $CMD" ;;
esac
