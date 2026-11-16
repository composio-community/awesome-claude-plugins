"""Cases from the security review of the pushed 1.0.2: substitutions inside Git options,
staging after a config change, and allowlist writes that avoid the literal file name.
Local hooks, disposable Git repos, synthetic paths only."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from test_hooks import bash, decision
import deploy_gate
import secret_guard


class PushReview2Findings(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='studio-kit-push-review2-')
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

    def test_substitution_inside_git_options_does_not_hide_the_push(self):
        for cmd in ['git --git-dir=$(pwd)/.git push origin feature', 'git -C $(pwd) push', 'git -C `pwd` push',
                    'git -c remote.origin.push=$(echo HEAD:main) push', 'git -C "$(pwd)" push']:
            with self.subTest(command=cmd):
                self.assertEqual(self.gate(cmd, self.feature), 'ask')

    def test_substitutions_and_subshells_are_still_read_as_commands(self):
        for cmd in ['echo $(git push origin main)', 'echo `git push origin main`', '(git push origin main)',
                    'x=$(cd /tmp && git push origin main)', '( cd /tmp; (git push origin main) )']:
            with self.subTest(command=cmd):
                self.assertEqual(self.gate(cmd, self.feature), 'ask')

    def test_config_change_does_not_soften_a_nested_env_finding(self):
        for cmd in ['git config core.autocrlf false && git add .', 'git remote set-url origin x; git add src']:
            with self.subTest(command=cmd):
                self.assertEqual(self.guard(cmd, self.main), 'deny')

    def test_policy_writes_without_the_literal_name_or_through_git_output_ask(self):
        for cmd in ['git diff --output=.claude/deploy-gate-allow', 'git log -p --output .claude/secret-guard-allow',
                    "echo '.*' >> .claude/deploy-gate-al*", 'cp /tmp/x .claude/secret-guard-allo?',
                    'f=.claude/deploy-gate-allow; echo x >> "$f"', 'mv /tmp/deploy-gate-allow .claude/']:
            with self.subTest(command=cmd):
                self.assertEqual(self.guard(cmd, self.main), 'ask')

    def test_plain_reads_of_the_claude_folder_stay_quiet(self):
        for cmd in ['cat .claude/*', 'ls .claude/', 'git diff .claude/deploy-gate-allow', 'grep x .claude/secret-guard-allow']:
            with self.subTest(command=cmd):
                self.assertIsNone(secret_guard.decide(bash(cmd, cwd=str(self.main))))


if __name__=='__main__': unittest.main()
