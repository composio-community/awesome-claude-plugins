"""Tests for deploy-gate and secret-guard. Run: python3 -m unittest discover -s hooks/tests

Fake keys are assembled at runtime so this file never contains a string shaped like a
real credential (secret scanners on GitHub would flag it otherwise).
"""
import json
import os
import random
import string
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
HOOKS = os.path.dirname(HERE)
sys.path.insert(0, HOOKS)

import deploy_gate  # noqa: E402
import secret_guard  # noqa: E402

RNG = random.Random(7)


def rand(n, alphabet=string.ascii_letters + string.digits):
    return "".join(RNG.choice(alphabet) for _ in range(n))


def fake(kind):
    if kind == "stripe":
        return "sk" + "_live_" + rand(28)
    if kind == "anthropic":
        return "sk-" + "ant-" + "api03-" + rand(40)
    if kind == "openai":
        return "sk-" + "proj-" + rand(48)
    if kind == "aws":
        return "AK" + "IA" + rand(16, string.ascii_uppercase + string.digits)
    if kind == "github":
        return "gh" + "p_" + rand(36)
    if kind == "google":
        return "AI" + "za" + rand(35)
    if kind == "jwt_service":
        import base64
        body = base64.urlsafe_b64encode(json.dumps({"role": "service_role", "iss": "supabase"}).encode()).decode().rstrip("=")
        return "eyJ" + rand(20) + "." + body + "." + rand(30)
    raise ValueError(kind)


def bash(cmd, mode="default", cwd=""):
    return {"tool_name": "Bash", "tool_input": {"command": cmd}, "permission_mode": mode, "cwd": cwd}


def decision(out):
    return out["hookSpecificOutput"]["permissionDecision"] if out else None


class DeployGateTests(unittest.TestCase):
    def setUp(self):
        os.environ.pop("STUDIO_KIT_DEPLOY_GATE", None)
        self.repo = tempfile.mkdtemp()
        subprocess.run(["git", "init", "-q", "-b", "main", self.repo], check=True)

    def test_production_deploys_ask(self):
        for cmd in ["vercel --prod", "npx vercel deploy --prod --yes", "netlify deploy --prod --dir dist",
                    "wrangler deploy", "npx wrangler pages deploy dist --project-name site",
                    "firebase deploy --only hosting", "railway up", "fly deploy", "npm publish",
                    "gh release create v1.0.0", "docker push registry/app:1", "terraform apply -auto-approve",
                    "aws s3 sync dist s3://bucket --delete", "shopify theme push --live", "shopify app deploy",
                    "npx prisma migrate deploy", "cd site && npm run build && npx wrangler deploy",
                    "git push heroku main", "surge ./dist site.surge.sh"]:
            self.assertEqual(decision(deploy_gate.decide(bash(cmd, cwd=self.repo))), "ask", cmd)

    def test_git_push_to_production_branch(self):
        for cmd in ["git push origin main", "git push origin HEAD:main", "git push -f origin master",
                    "git push origin feature:refs/heads/production", "git push --all"]:
            self.assertEqual(decision(deploy_gate.decide(bash(cmd, cwd=self.repo))), "ask", cmd)

    def test_bare_push_on_main_is_gated(self):
        self.assertEqual(decision(deploy_gate.decide(bash("git push", cwd=self.repo))), "ask")

    def test_safe_commands_pass(self):
        for cmd in ["vercel dev", "vercel", "netlify deploy --dir dist", "npm run build", "git push origin feature/hero",
                    "git status", "wrangler dev", "railway logs", "docker build .", "terraform plan",
                    "shopify theme dev", "echo surge protection", "aws s3 ls s3://bucket", "gh pr create"]:
            self.assertIsNone(deploy_gate.decide(bash(cmd, cwd=self.repo)), cmd)

    def test_bypass_mode_denies(self):
        out = deploy_gate.decide(bash("vercel --prod", mode="bypassPermissions", cwd=self.repo))
        self.assertEqual(decision(out), "deny")
        self.assertIn("ask the user", out["hookSpecificOutput"]["permissionDecisionReason"])

    def test_env_modes(self):
        os.environ["STUDIO_KIT_DEPLOY_GATE"] = "deny"
        self.assertEqual(decision(deploy_gate.decide(bash("wrangler deploy", cwd=self.repo))), "deny")
        os.environ["STUDIO_KIT_DEPLOY_GATE"] = "off"
        self.assertIsNone(deploy_gate.decide(bash("wrangler deploy", cwd=self.repo)))
        os.environ.pop("STUDIO_KIT_DEPLOY_GATE")

    def test_allowlist(self):
        os.makedirs(os.path.join(self.repo, ".claude"))
        with open(os.path.join(self.repo, ".claude", "deploy-gate-allow"), "w") as fh:
            fh.write("# staging is fine\nwrangler deploy --env staging\n")
        self.assertIsNone(deploy_gate.decide(bash("wrangler deploy --env staging", cwd=self.repo)))
        self.assertEqual(decision(deploy_gate.decide(bash("wrangler deploy", cwd=self.repo))), "ask")

    def test_other_tools_ignored(self):
        self.assertIsNone(deploy_gate.decide({"tool_name": "Write", "tool_input": {"content": "vercel --prod"}}))


class SecretGuardTests(unittest.TestCase):
    def setUp(self):
        os.environ.pop("STUDIO_KIT_SECRET_GUARD", None)

    def write(self, path, content):
        return {"tool_name": "Write", "tool_input": {"file_path": path, "content": content}, "cwd": "/tmp"}

    def test_secret_in_source_is_denied(self):
        for kind in ["stripe", "anthropic", "openai", "aws", "github", "jwt_service"]:
            out = secret_guard.decide(self.write("/p/src/lib/api.ts", "const key = '%s';" % fake(kind)))
            self.assertEqual(decision(out), "deny", kind)

    def test_reason_never_contains_the_full_secret(self):
        key = fake("anthropic")
        out = secret_guard.decide(self.write("/p/src/a.js", "x='%s'" % key))
        reason = out["hookSpecificOutput"]["permissionDecisionReason"]
        self.assertNotIn(key, reason)
        self.assertIn(key[:6] + "...", reason)

    def test_secret_in_real_env_file_is_allowed(self):
        self.assertIsNone(secret_guard.decide(self.write("/p/.env", "ANTHROPIC_API_KEY=%s\n" % fake("anthropic"))))
        self.assertIsNone(secret_guard.decide(self.write("/p/.env.local", "STRIPE_SECRET_KEY=%s\n" % fake("stripe"))))

    def test_secret_in_env_example_is_denied(self):
        out = secret_guard.decide(self.write("/p/.env.example", "STRIPE_SECRET_KEY=%s\n" % fake("stripe")))
        self.assertEqual(decision(out), "deny")

    def test_browser_prefixed_secret_is_denied_even_in_env(self):
        out = secret_guard.decide(self.write("/p/.env", "VITE_OPENAI_KEY=%s\n" % fake("openai")))
        self.assertEqual(decision(out), "deny")
        out = secret_guard.decide(self.write("/p/.env.local", "NEXT_PUBLIC_STRIPE_SECRET=%s\n" % rand(32)))
        self.assertEqual(decision(out), "deny")

    def test_publishable_keys_pass(self):
        content = "VITE_STRIPE_PUBLISHABLE_KEY=pk_live_%s\nNEXT_PUBLIC_SITE_URL=https://example.com\n" % rand(24)
        self.assertIsNone(secret_guard.decide(self.write("/p/.env", content)))

    def test_placeholders_pass(self):
        content = "const key = process.env.OPENAI_API_KEY; // sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\n" \
                  "API_KEY='your-api-key-goes-here-please'\n"
        self.assertIsNone(secret_guard.decide(self.write("/p/src/a.ts", content)))

    def test_google_key_asks(self):
        out = secret_guard.decide(self.write("/p/src/firebase.ts", "apiKey: '%s'," % fake("google")))
        self.assertEqual(decision(out), "ask")

    def test_test_fixtures_ask_instead_of_deny(self):
        out = secret_guard.decide(self.write("/p/tests/fixtures/order.json", '{"k":"%s"}' % fake("stripe")))
        self.assertEqual(decision(out), "ask")

    def test_edit_and_multiedit(self):
        out = secret_guard.decide({"tool_name": "Edit", "tool_input": {
            "file_path": "/p/app/page.tsx", "old_string": "a", "new_string": "const k='%s'" % fake("github")}})
        self.assertEqual(decision(out), "deny")
        out = secret_guard.decide({"tool_name": "MultiEdit", "tool_input": {
            "file_path": "/p/app/page.tsx", "edits": [{"old_string": "a", "new_string": "ok"},
                                                      {"old_string": "b", "new_string": fake("aws")}]}})
        self.assertEqual(decision(out), "deny")

    def test_git_add_env(self):
        self.assertEqual(decision(secret_guard.decide(bash("git add .env"))), "deny")
        self.assertIsNone(secret_guard.decide(bash("git add .env.example")))

    def test_git_add_all_with_unignored_env(self):
        repo = tempfile.mkdtemp()
        subprocess.run(["git", "init", "-q", repo], check=True)
        with open(os.path.join(repo, ".env"), "w") as fh:
            fh.write("A=1\n")
        self.assertEqual(decision(secret_guard.decide(bash("git add -A", cwd=repo))), "deny")
        self.assertEqual(decision(secret_guard.decide(bash("git commit -am wip", cwd=repo))), "deny")
        with open(os.path.join(repo, ".gitignore"), "w") as fh:
            fh.write(".env\n")
        self.assertIsNone(secret_guard.decide(bash("git add -A", cwd=repo)))

    def test_shell_redirect_of_secret(self):
        out = secret_guard.decide(bash("echo 'KEY=%s' >> src/config.js" % fake("stripe")))
        self.assertEqual(decision(out), "deny")
        self.assertIsNone(secret_guard.decide(bash("echo 'KEY=%s' >> .env" % fake("stripe"))))

    def test_off_mode(self):
        os.environ["STUDIO_KIT_SECRET_GUARD"] = "off"
        self.assertIsNone(secret_guard.decide(self.write("/p/src/a.ts", fake("stripe"))))
        os.environ.pop("STUDIO_KIT_SECRET_GUARD")


class CliContractTests(unittest.TestCase):
    """Run the hooks as Claude Code does: JSON on stdin, JSON decision on stdout, exit 0."""

    def run_hook(self, script, payload):
        p = subprocess.run([sys.executable, os.path.join(HOOKS, script)], input=json.dumps(payload),
                           capture_output=True, text=True, timeout=10)
        return p

    def test_deploy_gate_cli(self):
        p = self.run_hook("deploy_gate.py", bash("npx vercel --prod"))
        self.assertEqual(p.returncode, 0)
        self.assertEqual(json.loads(p.stdout)["hookSpecificOutput"]["permissionDecision"], "ask")

    def test_secret_guard_cli(self):
        p = self.run_hook("secret_guard.py", {"tool_name": "Write", "tool_input": {
            "file_path": "src/a.js", "content": fake("openai")}})
        self.assertEqual(p.returncode, 0)
        self.assertEqual(json.loads(p.stdout)["hookSpecificOutput"]["permissionDecision"], "deny")

    def test_garbage_input_fails_open(self):
        p = subprocess.run([sys.executable, os.path.join(HOOKS, "deploy_gate.py")], input="not json",
                           capture_output=True, text=True, timeout=10)
        self.assertEqual(p.returncode, 0)
        self.assertEqual(p.stdout, "")
        self.assertIn("hook error", p.stderr)


if __name__ == "__main__":
    unittest.main()
