"""Small, non-executing parser for literal Git commands, not a shell interpreter."""
import os
import re
import shlex

# Why a Git invocation could not be read literally. Callers treat any of these as
# "needs a person": the hooks must never read an unknown context as a safe one.
OVERRIDE = 'override'            # repository/configuration routing changed (--git-dir, -c ...)
UNRESOLVED = 'unresolved'        # a -C directory with ~, $VAR, `...` or that does not exist
UNPARSED = 'unparsed'            # quoting the parser cannot follow; words read loosely

SHELLS = {'sh', 'bash', 'zsh', 'dash', 'ksh'}
_WORD_BREAK = ' \t\n;|&()<>'
_MAX_NESTING = 3


class _ShellSegments:
    """Split literal separators without breaking quoted or escaped paths.

    Comments (an unquoted # at the start of a word) are dropped up to the end of the
    line, so a quote inside a comment cannot swallow the commands after it. Command
    strings given to sh/bash/zsh -c are split too and returned after the outer
    segment. This is not an evaluator for substitutions, here-documents or shell
    control structures.
    """
    @staticmethod
    def split(command, _depth=0):
        parts = []
        quote = None
        start = 0
        word_start = True
        i = 0
        n = len(command)
        while i < n:
            char = command[i]
            if char == '\\' and quote != "'":
                i += 2
                word_start = False
                continue
            if quote:
                if char == quote:
                    quote = None
            elif char in ("'", '"'):
                quote = char
            elif char == '#' and word_start:
                parts.append(command[start:i])
                end = command.find('\n', i)
                if end == -1:
                    start = i = n
                    break
                start = i = end + 1
                word_start = True
                continue
            elif char in ';|&\n':
                parts.append(command[start:i])
                start = i + 1
            word_start = quote is None and char in _WORD_BREAK
            i += 1
        parts.append(command[start:])
        if _depth < _MAX_NESTING:
            for part in list(parts):
                inner = _shell_c_string(part)
                if inner:
                    parts.extend(_ShellSegments.split(inner, _depth + 1))
        return parts


SEGMENT_SPLIT = _ShellSegments()


def _shell_c_string(segment):
    """Return the command string of `sh|bash|zsh ... -c '<string>'`, or ''."""
    try:
        words = shlex.split(segment, posix=True)
    except ValueError:
        return ''
    for j, word in enumerate(words):
        if os.path.basename(word) not in SHELLS:
            continue
        k = j + 1
        found = False
        while k < len(words) and words[k].startswith(('-', '+')) and words[k] != '--':
            if re.fullmatch(r'-[A-Za-z]*c[A-Za-z]*', words[k]):
                found = True
            k += 2 if words[k] in ('-o', '+o', '-O', '+O') else 1
        if found and k < len(words):
            return words[k]
    return ''


def _words(segment):
    """shlex words, or (loose words, True) when the quoting cannot be followed."""
    try:
        return shlex.split(segment, posix=True), False
    except ValueError:
        return [w.strip('\'"') for w in segment.split()], True


def _resolve(directory, value):
    if '$' in value or '`' in value:
        return None
    if value.startswith('~'):
        value = os.path.expanduser(value)
        if value.startswith('~'):
            return None
    return os.path.abspath(os.path.join(directory, value))


def git_invocation(segment, cwd):
    """Return (verb, args, effective cwd, flag), or None.

    flag is False, or OVERRIDE / UNPARSED / UNRESOLVED (see above). With UNRESOLVED the
    effective cwd is None: the hooks must not guess which repository Git would use.
    Handles literal global options and repeated -C, including quoted paths. It never
    executes the pending command or passes its -c settings to our reads. Shell
    expansion, aliases, functions and scripts are outside this parser.
    """
    words, loose = _words(segment)
    git_at = next((i for i, w in enumerate(words) if os.path.basename(w) == 'git'), None)
    if git_at is None:
        return None
    directory = os.path.abspath(cwd or os.getcwd())
    unresolved = False
    override = any(w.startswith(('GIT_DIR=', 'GIT_WORK_TREE=', 'GIT_INDEX_FILE=', 'GIT_CONFIG_COUNT='))
                   for w in words[:git_at])
    i = git_at + 1
    value_options = {'-c', '--config-env', '--git-dir', '--work-tree', '--namespace', '--super-prefix'}
    while i < len(words):
        word = words[i]
        if word == '--':
            i += 1
            break
        if not word.startswith('-'):
            break
        if word == '-C' or word.startswith('-C'):
            value = word[2:] if len(word) > 2 else (words[i+1] if i+1 < len(words) else None)
            if value is None:
                return None
            if value:
                resolved = None if unresolved else _resolve(directory, value)
                if resolved is None or not os.path.isdir(resolved):
                    unresolved = True
                else:
                    directory = resolved
            i += 1 if len(word) > 2 else 2
            continue
        name = word.split('=', 1)[0]
        if name in {'--git-dir', '--work-tree', '--namespace'}:
            override = True
        # Never apply pending configuration to our read-only Git checks. Only
        # identity/presentation settings are known not to change routing/ignores.
        if name == '--config-env':
            override = True
        if name == '-c' or (word.startswith('-c') and len(word) > 2):
            value = word[2:] if len(word) > 2 else (words[i+1] if i+1 < len(words) else '')
            key = value.split('=', 1)[0].lower()
            if key not in ('user.name', 'user.email', 'color.ui'):
                override = True
        if name in value_options:
            i += 1 if '=' in word else 2
        else:
            i += 1
    if i >= len(words):
        return None
    flag = OVERRIDE if override else UNPARSED if loose else UNRESOLVED if unresolved else False
    return words[i], words[i+1:], (None if unresolved else directory), flag
