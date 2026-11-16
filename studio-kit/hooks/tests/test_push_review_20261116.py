"""Cases from the security review of the pushed 1.0.1: Git commands inside strings run by
another command, subshells and substitutions, more routing overrides, and policy edits from
the shell. Local hooks, disposable Git repos, synthetic paths only."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from test_hooks import bash, decision
import deploy_gate
import secret_guard


class PushReviewFindings(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='studio-kit-push-review-')
        self.addCleanup(self.temp.cleanup)
        self.main = Path(self.temp.name)/'main repo'
        self.feature = Path(self.temp.name)/'feature repo'
        for repo, branch in ((self.main, 'main'), (self.feature, 'feature')):
            repo.mkdir()
            subprocess.run(['git','init','-q','-b',branch,str(repo)],check=True)
            (repo/'src').mkdir(); (repo/'src/.env').write_text('A=1\n')
        self.env = patch.dict(os.environ, {}, clear=False)
        self.env.start()
        self.addCleanup(self.env.stop)
        for key in ['CLAUDE_PROJECT_DIR','STUDIO_KIT_DEPLOY_GATE','STUDIO_KIT_SECRET_GUARD']:
            os.environ.pop(key,None)

    def gate(self, cmd, repo):
        return decision(deploy_gate.decide(bash(cmd, cwd=str(repo))))

    def guard(self, cmd, repo):
        return decision(secret_guard.decide(bash(cmd, cwd=str(repo))))

    def test_push_inside_strings_run_by_another_command_asks(self):
        for cmd in ['eval "git push origin main"', 'ssh host "git push origin main"',
                    'echo "git push origin main" | sh', 'bash <<< "git push origin main"',
                    'watch "git push origin main"', 'xargs -I{} sh -c "git push origin main"']:
            with self.subTest(command=cmd):
                self.assertEqual(self.gate(cmd, self.feature), 'ask')

    def test_push_without_refspec_inside_eval_reads_the_branch(self):
        self.assertEqual(self.gate('eval "git push"', self.main), 'ask')

    def test_push_in_subshell_or_substitution_asks(self):
        for cmd in ['(git push origin main)', 'echo $(git push origin main)', 'echo `git push origin main`',
                    'echo "$(git push origin main)"', '(cd /tmp && git push origin main)']:
            with self.subTest(command=cmd):
                self.assertEqual(self.gate(cmd, self.feature), 'ask')

    def test_here_document_quote_cannot_hide_a_later_push(self):
        cmd = 'cat <<EOF > notes.txt\nsay "hi\nEOF\ngit push origin main'
        self.assertEqual(self.gate(cmd, self.feature), 'ask')

    def test_routing_environment_and_options_count_as_overrides(self):
        for cmd in ['GIT_CONFIG_GLOBAL=/tmp/x git push origin feature', 'GIT_COMMON_DIR=/tmp/x git push',
                    'GIT_CONFIG_PARAMETERS="\'remote.origin.push\'=\'HEAD:main\'" git push',
                    'git --bare push origin feature', 'git --exec-path=/tmp push origin feature',
                    'export GIT_DIR=/tmp/x.git; git push origin feature',
                    'git config remote.origin.push HEAD:main && git push']:
            with self.subTest(command=cmd):
                self.assertEqual(self.gate(cmd, self.feature), 'ask')

    def test_env_staging_inside_strings_and_subshells_is_denied(self):
        for cmd in ['eval "git add src/.env"', 'echo "git add src/.env" | sh', '(git add src/.env)',
                    'echo $(git add src/.env)', 'ssh host "cd x && git add src/.env"']:
            with self.subTest(command=cmd):
                self.assertEqual(self.guard(cmd, self.main), 'deny')

    def test_policy_files_written_from_the_shell_ask(self):
        for cmd in ["echo '.*' >> .claude/deploy-gate-allow", "printf '*\\n' > .claude/secret-guard-allow",
                    "sed -i '' 's/x/y/' .claude/secret-guard-allow", 'cp /tmp/x .claude/deploy-gate-allow',
                    'tee -a .claude/deploy-gate-allow < /tmp/x']:
            with self.subTest(command=cmd):
                self.assertEqual(self.guard(cmd, self.main), 'ask')

    def test_reading_policy_files_from_the_shell_is_allowed(self):
        for cmd in ['cat .claude/deploy-gate-allow', 'grep staging .claude/deploy-gate-allow',
                    'git diff .claude/secret-guard-allow']:
            with self.subTest(command=cmd):
                self.assertIsNone(secret_guard.decide(bash(cmd, cwd=str(self.main))))

    def test_ordinary_commands_stay_quiet(self):
        for cmd in ['git commit -m "update docs"', "bash -c 'git status'", 'echo "hello world"',
                    'git push origin feature', '(cd src && ls)', 'echo $(date)']:
            with self.subTest(command=cmd):
                self.assertIsNone(deploy_gate.decide(bash(cmd, cwd=str(self.feature))))
                self.assertIsNone(secret_guard.decide(bash(cmd, cwd=str(self.feature))))


if __name__=='__main__': unittest.main()
