#!/bin/bash
# Moves the given files to the Trash (cross-platform, never permanent rm).
# Usage: trash.sh <file> [<file> ...]
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$DIR/lib.sh"
sj_trash "$@"
