"""Cases from the security review of the local 1.0.3 commit: a subshell "(" glued to a word,
a computed Git subcommand, deep nesting, and allowlist names split by quotes or braces.
Local hooks, disposable Git repos, synthetic paths only."""
import os
from pathlib import Path
import shlex
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from test_hooks import bash, decision
import deploy_gate
import secret_guard


class CommitReviewFindings(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='studio-kit-commit-review-')
        self.addCleanup(self.temp.cleanup)
        self.feature = Path(self.temp.name)/'feature repo'
        self.feature.mkdir()
        subprocess.run(['git','init','-q','-b','feature',str(self.feature)],check=True)
        self.env = patch.dict(os.environ, {}, clear=False)
        self.env.start()
        self.addCleanup(self.env.stop)
        for key in ['CLAUDE_PROJECT_DIR','STUDIO_KIT_DEPLOY_GATE','STUDIO_KIT_SECRET_GUARD']:
            os.environ.pop(key,None)

    def gate(self, cmd):
        return decision(deploy_gate.decide(bash(cmd, cwd=str(self.feature))))

    def guard(self, cmd):
        return decision(secret_guard.decide(bash(cmd, cwd=str(self.feature))))

    def test_subshell_glued_to_a_word_is_still_a_command(self):
        for cmd in ['if true; then(git push origin main); fi', 'echo x;(git push origin main)',
                    'while false; do(git push origin main); done']:
            with self.subTest(command=cmd):
                self.assertEqual(self.gate(cmd), 'ask')

    def test_computed_git_subcommand_asks(self):
        for cmd in ['git $(echo push) origin feature', 'git `echo push` origin feature', 'git "$VERB" origin feature']:
            with self.subTest(command=cmd):
                self.assertEqual(self.gate(cmd), 'ask')
                self.assertEqual(self.guard(cmd), 'ask')

    def test_deep_nesting_cannot_hide_a_push(self):
        cmd = 'git push origin main'
        for _ in range(6):
            cmd = 'bash -c ' + shlex.quote(cmd)
        self.assertEqual(self.gate(cmd), 'ask')

    def test_allowlist_names_split_by_quotes_or_braces_ask(self):
        for cmd in ['echo x >> .claude/deploy-gate-al"low"', 'echo x >> .claude/deploy-gate-al\\low',
                    'echo x >> .claude/{deploy-gate-allow,x}', 'cd .claude && echo x >> deploy-gate-al*']:
            with self.subTest(command=cmd):
                self.assertEqual(self.guard(cmd), 'ask')

    def test_process_substitution_bodies_are_commands(self):
        for cmd in ['cat <(git push origin HEAD:main)', 'diff <(true) >(git push origin main)',
                    'tee >(git push origin main) < /dev/null']:
            with self.subTest(command=cmd):
                self.assertEqual(self.gate(cmd), 'ask')
        (self.feature/'.env').write_text('A=1\n')
        self.assertEqual(self.guard('diff <(true) >(git add .env)'), 'deny')

    def test_quoted_parenthesis_inside_a_substitution_keeps_the_git_command_whole(self):
        for cmd in ["git -C \"$(echo ')')\" push", "git --git-dir=\"$(printf '%s)' x)\" push origin feature"]:
            with self.subTest(command=cmd):
                self.assertEqual(self.gate(cmd), 'ask')

    def test_policy_writes_after_pushd_or_through_a_quoted_folder_ask(self):
        for cmd in ['pushd .claude && echo x >> deploy-gate-al*', 'cd ".claude" && echo x >> deploy-gate-al*',
                    'cd .cl* && echo x >> deploy-gate-al*', 'echo x >> ".claude"/deploy-gate-al*',
                    'python3 -c "open(\'.claude/deploy-gate-allow\',\'a\').write(\'x\')"']:
            with self.subTest(command=cmd):
                self.assertEqual(self.guard(cmd), 'ask')

    def test_work_cap_cannot_hide_a_late_push(self):
        cmd = 'echo ' + ' '.join('"word%d more"' % k for k in range(600)) + ' "git push origin main"'
        self.assertEqual(self.gate(cmd), 'ask')

    def test_process_substitution_text_inside_double_quotes_is_literal(self):
        for cmd in ['git --git-dir="a>(b" push origin main', 'git --git-dir="a<(b" push origin feature',
                    'git push origin main $(echo']:
            with self.subTest(command=cmd):
                self.assertEqual(self.gate(cmd), 'ask')

    def test_work_cap_fails_closed_without_the_word_git(self):
        cmd = 'echo ' + ' '.join('"word%d more"' % k for k in range(600)) + ' "g\\it push origin main"'
        self.assertEqual(self.gate(cmd), 'ask')

    def test_computed_push_destination_asks(self):
        for cmd in ['git push origin $(git branch --show-current)', 'git push origin "$BRANCH"',
                    'git push origin HEAD:`git rev-parse --abbrev-ref HEAD`', "git push origin $'main'"]:
            with self.subTest(command=cmd):
                self.assertEqual(self.gate(cmd), 'ask')

    def test_broken_quotes_around_a_substitution_fail_closed(self):
        self.assertEqual(self.gate('echo "$(git push origin main)" \'unbalanced'), 'ask')

    def test_pathological_long_commands_decide_fast(self):
        import json, subprocess, sys, time
        hooks = Path(deploy_gate.__file__).parent
        for cmd in ['echo ' + '$(' * 25000 + ' ; git push origin main', 'echo ' + '(' * 100000 + ' git push origin main',
                    'echo ' + '$(' * 12500 + 'true' + ')' * 12500 + ' ; git push origin main']:
            payload = json.dumps({'tool_name': 'Bash', 'cwd': str(self.feature), 'permission_mode': 'default',
                                  'tool_input': {'command': cmd}})
            for hook in ('deploy_gate.py', 'secret_guard.py'):
                with self.subTest(command=cmd[:30], hook=hook):
                    t0 = time.time()
                    try:
                        cp = subprocess.run([sys.executable, '-B', str(hooks/hook)], input=payload,
                                            capture_output=True, text=True, timeout=5)
                    except subprocess.TimeoutExpired:
                        self.fail('hook took more than 5 s (Claude Code would let the command through)')
                    self.assertLess(time.time() - t0, 5)
                    if hook == 'deploy_gate.py':
                        self.assertEqual(json.loads(cp.stdout)['hookSpecificOutput']['permissionDecision'], 'ask')

    def test_ordinary_commands_stay_quiet(self):
        for cmd in ['echo $(date)', 'f() { ls; }', 'printf "%s" "(a)"', 'git status', 'echo "a (b) c"',
                    'git log --format="%h (%an)"', 'diff <(sort a) <(sort b)', 'cat .claude/settings.json',
                    'ls .claude && echo done', 'git push origin feature-x', 'git push -u origin HEAD']:
            with self.subTest(command=cmd):
                self.assertIsNone(deploy_gate.decide(bash(cmd, cwd=str(self.feature))))
                self.assertIsNone(secret_guard.decide(bash(cmd, cwd=str(self.feature))))


if __name__=='__main__': unittest.main()
