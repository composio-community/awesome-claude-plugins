"""Regression cases from the shipped 1.0.0 limitations; local hooks and disposable Git repos only."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from test_hooks import bash, decision, fake
import deploy_gate
import secret_guard


class HookRegressions(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='studio-kit-hook-')
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name)/'repo with spaces'
        self.repo.mkdir()
        subprocess.run(['git','init','-q','-b','main',str(self.repo)],check=True)
        self.env = patch.dict(os.environ, {}, clear=False)
        self.env.start()
        self.addCleanup(self.env.stop)
        for key in ['CLAUDE_PROJECT_DIR','STUDIO_KIT_DEPLOY_GATE','STUDIO_KIT_SECRET_GUARD']:
            os.environ.pop(key,None)

    def test_git_global_config_and_pager_options_do_not_hide_push(self):
        for cmd in ['git -c user.name=x push origin main','git --no-pager push origin main',
                    'git -c user.name=x --no-pager push origin HEAD:main']:
            with self.subTest(command=cmd):
                self.assertEqual(decision(deploy_gate.decide(bash(cmd,cwd=str(self.repo)))),'ask')

    def test_git_C_quoted_directory_controls_implicit_push_branch(self):
        elsewhere=Path(self.temp.name)/'other';elsewhere.mkdir()
        subprocess.run(['git','init','-q','-b','feature',str(elsewhere)],check=True)
        cmd='git -C "%s" push' % self.repo
        self.assertEqual(decision(deploy_gate.decide(bash(cmd,cwd=str(elsewhere)))),'ask')

    def test_background_separator_does_not_hide_surge(self):
        self.assertEqual(decision(deploy_gate.decide(bash('echo ok & surge ./dist',cwd=str(self.repo)))),'ask')

    def test_quoted_and_escaped_separators_do_not_hide_git(self):
        special=Path(self.temp.name)/'project&copy';special.mkdir()
        subprocess.run(['git','init','-q','-b','main',str(special)],check=True)
        for value in ['"%s"' % special,str(special).replace('&','\\&')]:
            with self.subTest(path=value):
                self.assertEqual(decision(deploy_gate.decide(bash('git -C %s push origin main' % value,cwd=str(self.repo)))),'ask')

    def test_git_routing_and_ignore_overrides_are_reviewed_not_executed(self):
        subprocess.run(['git','-C',str(self.repo),'symbolic-ref','HEAD','refs/heads/feature'],check=True)
        self.assertEqual(decision(deploy_gate.decide(bash('git -c remote.origin.push=HEAD:main push',cwd=str(self.repo)))),'ask')
        self.assertEqual(decision(secret_guard.decide(bash('git -c core.excludesFile=/dev/null add .',cwd=str(self.repo)))),'deny')
        self.assertEqual(decision(secret_guard.decide(bash('GIT_INDEX_FILE=/tmp/other git add .',cwd=str(self.repo)))),'deny')

    def test_staging_allowlist_does_not_allow_an_appended_production_command(self):
        (self.repo/'.claude').mkdir()
        (self.repo/'.claude/deploy-gate-allow').write_text('wrangler deploy --env staging\n')
        self.assertIsNone(deploy_gate.decide(bash('wrangler deploy --env staging',cwd=str(self.repo))))
        self.assertEqual(decision(deploy_gate.decide(bash('wrangler deploy --env staging && wrangler deploy',cwd=str(self.repo)))),'ask')

    def test_nested_env_is_detected_before_git_add_dot(self):
        (self.repo/'src').mkdir();(self.repo/'src/.env.local').write_text('A=1\n')
        self.assertEqual(decision(secret_guard.decide(bash('git add .',cwd=str(self.repo)))),'deny')

    def test_git_global_options_and_C_do_not_hide_env_staging(self):
        (self.repo/'nested').mkdir();(self.repo/'nested/.env').write_text('A=1\n')
        for cmd in ['git -c user.name=x add .','git -C "%s" add .' % self.repo]:
            with self.subTest(command=cmd):
                self.assertEqual(decision(secret_guard.decide(bash(cmd,cwd=str(self.repo)))),'deny')

    def test_directory_pathspec_is_scanned_but_unrelated_directory_is_not(self):
        (self.repo/'src').mkdir();(self.repo/'src/.env').write_text('A=1\n')
        (self.repo/'docs').mkdir();(self.repo/'docs/readme.txt').write_text('safe\n')
        self.assertEqual(decision(secret_guard.decide(bash('git add src',cwd=str(self.repo)))),'deny')
        self.assertIsNone(secret_guard.decide(bash('git add docs',cwd=str(self.repo))))

    def test_ignored_nested_env_is_allowed_unless_already_tracked(self):
        (self.repo/'src').mkdir();(self.repo/'src/.env').write_text('A=1\n')
        (self.repo/'.gitignore').write_text('.env\n')
        self.assertIsNone(secret_guard.decide(bash('git add .',cwd=str(self.repo))))
        subprocess.run(['git','-C',str(self.repo),'add','-f','src/.env'],check=True)
        self.assertEqual(decision(secret_guard.decide(bash('git add .',cwd=str(self.repo)))),'deny')

    def test_env_javascript_is_source_code_not_private_env_storage(self):
        for suffix in ['js','ts','mjs','cjs','jsx','tsx','json','py']:
            payload={'tool_name':'Write','cwd':str(self.repo),'tool_input':{
                'file_path':str(self.repo/('.env.'+suffix)), 'content':fake('stripe')}}
            with self.subTest(suffix=suffix):
                self.assertEqual(decision(secret_guard.decide(payload)),'deny')

    def test_fixture_secret_cannot_ask_in_unattended_mode(self):
        payload={'tool_name':'Write','cwd':str(self.repo),'permission_mode':'bypassPermissions',
                 'tool_input':{'file_path':str(self.repo/'tests/fixture.json'),'content':fake('stripe')}}
        self.assertEqual(decision(secret_guard.decide(payload)),'deny')

    def test_env_under_public_output_is_not_server_side_storage(self):
        for directory in ['public','dist','static']:
            payload={'tool_name':'Write','cwd':str(self.repo),'tool_input':{
                'file_path':str(self.repo/directory/'.env'),'content':fake('stripe')}}
            with self.subTest(directory=directory):
                self.assertEqual(decision(secret_guard.decide(payload)),'deny')

    def test_direct_allowlist_changes_require_confirmation(self):
        for name in ['deploy-gate-allow','secret-guard-allow']:
            for tool,body in [('Write',{'content':'.*\n'}),('Edit',{'new_string':'*\n'})]:
                payload={'tool_name':tool,'cwd':str(self.repo),'tool_input':{
                    'file_path':str(self.repo/'.claude'/name),**body}}
                with self.subTest(name=name,tool=tool):
                    self.assertEqual(decision(secret_guard.decide(payload)),'ask')
                payload['permission_mode']='dontAsk'
                self.assertEqual(decision(secret_guard.decide(payload)),'deny')

    def test_allowlisted_test_path_does_not_match_parent_traversal(self):
        (self.repo/'.claude').mkdir()
        (self.repo/'.claude/secret-guard-allow').write_text('tests/*\n')
        payload={'tool_name':'Write','cwd':str(self.repo),'tool_input':{
            'file_path':'tests/../src/live.js','content':fake('stripe')}}
        self.assertEqual(decision(secret_guard.decide(payload)),'deny')

    def test_allowlist_edit_through_symlink_still_requires_confirmation(self):
        (self.repo/'.claude').mkdir()
        target=self.repo/'.claude/secret-guard-allow';target.write_text('tests/*\n')
        (self.repo/'alias').symlink_to(target)
        payload={'tool_name':'Edit','cwd':str(self.repo),'tool_input':{
            'file_path':'alias','new_string':'*\n'}}
        self.assertEqual(decision(secret_guard.decide(payload)),'ask')


if __name__=='__main__': unittest.main()
