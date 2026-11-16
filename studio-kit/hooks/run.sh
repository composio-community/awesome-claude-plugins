#!/bin/sh
# Run a studio-kit hook with the first working Python 3 (python3, then python).
# If none is found, exit 0 with a warning: a missing interpreter must not block your work.
script="$1"
for py in python3 python; do
  if command -v "$py" >/dev/null 2>&1 && "$py" -c 'import sys; sys.exit(0 if sys.version_info[0] >= 3 else 1)' 2>/dev/null; then
    exec "$py" "$script"
  fi
done
echo "studio-kit: no Python 3 found, hook skipped: $script" >&2
exit 0
