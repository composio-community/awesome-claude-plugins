"""Cases from the 16 November review: shell forms that 1.0.0 caught and the first 1.0.1
candidate let through. Local hooks, disposable Git repos, synthetic paths only."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from test_hooks import bash, decision
import deploy_gate
import secret_guard


class ReviewRegressions(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='studio-kit-review-')
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)/'home'
        self.home.mkdir()
        self.repo = self.home/'repo main'
        self.repo.mkdir()
        subprocess.run(['git','init','-q','-b','main',str(self.repo)],check=True)
        self.feature = self.home/'feat'
        self.feature.mkdir()
        subprocess.run(['git','init','-q','-b','feature',str(self.feature)],check=True)
        self.env = patch.dict(os.environ, {'HOME': str(self.home)}, clear=False)
        self.env.start()
        self.addCleanup(self.env.stop)
        for key in ['CLAUDE_PROJECT_DIR','STUDIO_KIT_DEPLOY_GATE','STUDIO_KIT_SECRET_GUARD']:
            os.environ.pop(key,None)

    def gate(self, cmd, cwd=None):
        return decision(deploy_gate.decide(bash(cmd, cwd=str(cwd or self.repo))))

    def guard(self, cmd, cwd=None):
        return decision(secret_guard.decide(bash(cmd, cwd=str(cwd or self.repo))))

    # 1. A quote inside a shell comment must not make the parser give up.
    def test_comment_with_apostrophe_does_not_hide_push(self):
        self.assertEqual(self.gate("git push origin main # don't worry"), 'ask')

    def test_comment_with_apostrophe_does_not_hide_next_line(self):
        self.assertEqual(self.gate("echo hi # don't\ngit push origin main", cwd=self.feature), 'ask')

    def test_comment_with_apostrophe_does_not_hide_env_staging(self):
        (self.repo/'src').mkdir();(self.repo/'src/.env').write_text('A=1\n')
        self.assertEqual(self.guard("git add src/.env # it's fine"), 'deny')

    def test_unparseable_quoting_after_git_push_asks(self):
        self.assertEqual(self.gate("git push origin main $'it\\'s'", cwd=self.feature), 'ask')

    def test_here_document_with_apostrophe_does_not_hide_push(self):
        cmd = "cat <<EOF > notes.txt\ndon't\nEOF\ngit push origin main"
        self.assertEqual(self.gate(cmd, cwd=self.feature), 'ask')

    def test_hash_inside_a_word_is_not_a_comment(self):
        self.assertEqual(self.gate('git push origin fix#1 main', cwd=self.feature), 'ask')

    # 2. A -C directory that cannot be resolved literally must not read as "no branch".
    def test_C_with_tilde_or_variable_to_missing_directory_asks(self):
        for cmd in ['git -C ~/does-not-exist push','git -C "$HOME/does-not-exist" push',
                    'git -C $SOME_REPO push','git -C "`pwd`" push']:
            with self.subTest(command=cmd):
                self.assertEqual(self.gate(cmd, cwd=self.feature), 'ask')

    def test_C_with_tilde_reads_the_real_branch(self):
        self.assertEqual(self.gate("git -C '%s' push" % self.repo, cwd=self.feature), 'ask')
        self.assertEqual(self.gate('git -C ~/"repo main" push', cwd=self.feature), 'ask')
        self.assertIsNone(deploy_gate.decide(bash('git -C ~/feat push', cwd=str(self.feature))))
        # From a cwd on main the 1.0.0 floor still asks (it reads the cwd branch): stricter by design.
        self.assertEqual(self.gate('git -C ~/feat push', cwd=self.repo), 'ask')

    def test_unresolved_C_with_explicit_feature_refspec_stays_allowed(self):
        self.assertIsNone(deploy_gate.decide(bash('git -C "$SOME_REPO" push origin feature', cwd=str(self.repo))))

    def test_unresolved_C_on_git_add_asks_instead_of_scanning_wrong_repo(self):
        self.assertEqual(self.guard('git -C "$HOME/does-not-exist" add .', cwd=self.feature), 'ask')

    # 3. Commands passed as a string to sh/bash/zsh -c are still Git commands.
    def test_shell_dash_c_string_is_parsed(self):
        (self.repo/'src').mkdir();(self.repo/'src/.env').write_text('A=1\n')
        for cmd in ["bash -c 'git add src/.env'","sh -c \"git add src/.env\"",
                    "bash -lc 'git add src/.env'","zsh -c 'echo ok; git add src/.env'",
                    "env FOO=1 bash -c 'git add src/.env'"]:
            with self.subTest(command=cmd):
                self.assertEqual(self.guard(cmd), 'deny')

    def test_shell_dash_c_push_asks(self):
        for cmd in ["bash -c 'git push origin main'","sh -c \"cd /tmp && git push origin main\""]:
            with self.subTest(command=cmd):
                self.assertEqual(self.gate(cmd, cwd=self.feature), 'ask')

    def test_harmless_shell_dash_c_stays_allowed(self):
        self.assertIsNone(deploy_gate.decide(bash("bash -c 'git status; echo done'", cwd=str(self.repo))))
        self.assertIsNone(secret_guard.decide(bash("bash -c 'git status'", cwd=str(self.repo))))


if __name__=='__main__': unittest.main()
